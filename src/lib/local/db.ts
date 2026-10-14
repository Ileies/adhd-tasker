/**
 * The guest's database on the device: opening it with versioned upgrade steps and the small promise
 * layer the repo is written with. Plain IndexedDB, no library. The one rule that matters: inside a
 * transaction only wait for IndexedDB requests, anything else lets the transaction commit early.
 */

export type StoreName =
	| 'tasks'
	| 'actions'
	| 'events'
	| 'cards'
	| 'schedule'
	| 'usage'
	| 'settings';

/** One step takes the database from version n to n + 1. Steps are only ever appended, never edited. */
export type UpgradeStep = (db: IDBDatabase, tx: IDBTransaction) => void;

/** The database version is the number of steps, so a guest's data survives every app update. */
export const UPGRADE_STEPS: UpgradeStep[] = [
	(db) => {
		const keyed = { keyPath: 'id', autoIncrement: true } as const;
		db.createObjectStore('tasks', keyed).createIndex('date', 'date');
		db.createObjectStore('actions', keyed);
		// A record without a key is not in this index, so only detected events are unique
		db.createObjectStore('events', keyed).createIndex('key', 'key', { unique: true });
		db.createObjectStore('cards', keyed);
		db.createObjectStore('schedule', keyed);
		db.createObjectStore('usage', keyed);
		// One record under the key 'settings', only what the user changed
		db.createObjectStore('settings');
	}
];

/** The steps a database at `version` still has to run (0 for a database that does not exist yet). */
export const pendingSteps = (steps: UpgradeStep[], version: number) => steps.slice(version);

/** Opens (and creates or upgrades) the database. `steps` is a parameter so a test can add one. */
export function openLocalDb(
	factory: IDBFactory,
	name: string,
	steps: UpgradeStep[] = UPGRADE_STEPS
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = factory.open(name, steps.length);
		request.onupgradeneeded = (event) => {
			for (const step of pendingSteps(steps, event.oldVersion))
				step(request.result, request.transaction!);
		};
		request.onsuccess = () => {
			// A newer tab upgrading the database must not wait for this one
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('The local database is open in an older tab'));
	});
}

export const done = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

/**
 * Runs `body` in one transaction and answers after it committed. A throw aborts it, nothing is half written.
 */
export async function transact<T>(
	db: IDBDatabase,
	stores: StoreName[],
	mode: IDBTransactionMode,
	body: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
	const tx = db.transaction(stores, mode);
	const finished = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error('The local database aborted a change'));
	});
	// Handled here so an abort that happens while `body` still runs is not reported twice
	finished.catch(() => {});

	let result: T;
	try {
		result = await body(tx);
	} catch (error) {
		try {
			tx.abort();
		} catch {
			// already finished
		}
		throw error;
	}
	await finished;
	return result;
}

/** Every record of a store (or of an index range) that passes `where`, in key order or reversed, at most `limit`. */
export function scan<T>(
	source: IDBObjectStore | IDBIndex,
	options: {
		range?: IDBKeyRange;
		reverse?: boolean;
		limit?: number;
		where?: (value: T) => boolean;
	} = {}
): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const found: T[] = [];
		const request = source.openCursor(options.range, options.reverse ? 'prev' : 'next');
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return resolve(found);
			const value = cursor.value as T;
			if (!options.where || options.where(value)) found.push(value);
			if (options.limit !== undefined && found.length >= options.limit) return resolve(found);
			cursor.continue();
		};
	});
}

/** Deletes every record of a store that passes `where`. */
export async function removeWhere<T>(store: IDBObjectStore, where: (value: T) => boolean) {
	await new Promise<void>((resolve, reject) => {
		const request = store.openCursor();
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return resolve();
			if (where(cursor.value as T)) cursor.delete();
			cursor.continue();
		};
	});
}
