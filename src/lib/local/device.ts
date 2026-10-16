/**
 * What a signed in visitor's device may still hold from the time it was a guest: the plan that waits to move
 * into the account, the backup kept after it moved, and the choice "keep my account's". Everything opens the
 * device's database on its own, because a signed in page does not run the guest's device (no tick, no sound).
 * Local first plan 5.3.
 */
import {
	assembleExport,
	FIRST_DAY,
	importExport,
	type ExportFile,
	type ImportResult
} from '#lib/core/export.js';
import { isEmptyPlan, SNAPSHOT_DAYS } from '#lib/core/merge.js';
import { done, openLocalDb, transact, type StoreName } from '#lib/local/db.js';
import { localMarks } from '#lib/local/marks.js';
import { localRepo } from '#lib/local/repo.js';
import { DATABASE_NAME } from '#lib/local/runtime.js';

/** How long the copy of a moved plan stays on the device, the same as the account's snapshot. */
export const BACKUP_DAYS = SNAPSHOT_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

const BACKUP = 'backup';
const DECLINED = 'declined';

/** Everything the move moves out of a device, and wipes after the account has it. */
const PLAN_STORES: StoreName[] = [
	'tasks',
	'todos',
	'routines',
	'flow',
	'actions',
	'events',
	'cards',
	'schedule',
	'usage'
];

export interface DeviceData {
	/** The plan and alarms to move, without the sample day. */
	file: ExportFile;
	/** The guest's own OpenAI key, moved only when the user ticks it. */
	openaiKey: string | null;
	/** The account the user chose to keep instead of this device's plan, `null` when there was no choice. */
	declinedFor: string | null;
}

export interface DeviceBackup {
	file: ExportFile;
	at: number;
}

/** Opens the device's database when there is one. A visitor who never was a guest has none, and gets none made. */
async function openIfThere(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
	// Browsers that cannot list databases just open it, an empty one does no harm
	const known = await factory.databases?.().catch(() => undefined);
	if (known && !known.some((database) => database.name === name)) return null;
	return openLocalDb(factory, name);
}

async function withDevice<T>(
	factory: IDBFactory,
	name: string,
	otherwise: T,
	body: (db: IDBDatabase) => Promise<T>
): Promise<T> {
	const db = await openIfThere(factory, name);
	if (!db) return otherwise;
	try {
		return await body(db);
	} finally {
		db.close();
	}
}

const readKey = <T>(db: IDBDatabase, key: string) =>
	transact(db, ['settings'], 'readonly', (tx) =>
		done<T | undefined>(tx.objectStore('settings').get(key))
	);

/**
 * The plan that waits on this device, `null` when there is nothing to move: no database, or no task and no
 * alarm apart from the sample day.
 */
export async function readDevice(
	now: number,
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<DeviceData | null> {
	return withDevice(factory, name, null, async (db) => {
		const repo = localRepo(db);
		const sample = new Set(await localMarks(db).read());
		const settings = await repo.settings.get();
		const file = assembleExport({
			settings,
			tasks: (await repo.tasks.between(FIRST_DAY)).filter((task) => !sample.has(task.id)),
			todos: await repo.todos.all(),
			routines: await repo.routines.all(),
			schedule: await repo.schedule.pending(),
			now
		});
		if (isEmptyPlan(file)) return null;
		return {
			file,
			openaiKey: settings.openaiKey,
			declinedFor: (await readKey<string>(db, DECLINED)) ?? null
		};
	});
}

/**
 * Called after the account confirmed it has the plan. Keeps one copy in the export format for 30 days, then
 * removes the plan, the alarms and everything the assistant logged. The settings stay, they are the device's.
 */
export async function clearDevice(
	file: ExportFile,
	now: number,
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<void> {
	await withDevice(factory, name, undefined, async (db) => {
		await transact(db, [...PLAN_STORES, 'settings'], 'readwrite', async (tx) => {
			await done(tx.objectStore('settings').put({ file, at: now } satisfies DeviceBackup, BACKUP));
			await done(tx.objectStore('settings').delete('sample'));
			await done(tx.objectStore('settings').delete(DECLINED));
			for (const store of PLAN_STORES) await done(tx.objectStore(store).clear());
		});
		// What the agent last saw as current is gone with the tasks
		await localRepo(db).settings.update({ lastCurrentTaskId: null, lastCurrentKey: null });
	});
}

/** The user chose to keep the account's plan: this device's stays untouched and is not asked about again until sign out. */
export async function declineMove(
	email: string,
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<void> {
	await withDevice(factory, name, undefined, (db) =>
		transact(
			db,
			['settings'],
			'readwrite',
			async (tx) => void (await done(tx.objectStore('settings').put(email, DECLINED)))
		)
	);
}

/** Signed out again: the next sign in asks anew about whatever the device holds. */
export async function forgetDecline(
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<void> {
	await withDevice(factory, name, undefined, (db) =>
		transact(
			db,
			['settings'],
			'readwrite',
			async (tx) => void (await done(tx.objectStore('settings').delete(DECLINED)))
		)
	);
}

/** The copy of the plan that moved into an account, while it is younger than 30 days. */
export async function readBackup(
	now: number,
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<DeviceBackup | null> {
	return withDevice(factory, name, null, async (db) => {
		const backup = await readKey<DeviceBackup>(db, BACKUP);
		if (!backup) return null;
		if (now - backup.at < BACKUP_DAYS * DAY_MS) return backup;
		await transact(
			db,
			['settings'],
			'readwrite',
			async (tx) => void (await done(tx.objectStore('settings').delete(BACKUP)))
		);
		return null;
	});
}

/** Brings the copy back into this device's plan, what is already there is left alone. `null` when there is no copy. */
export async function restoreBackup(
	now: number,
	factory: IDBFactory = indexedDB,
	name = DATABASE_NAME
): Promise<ImportResult | null> {
	const backup = await readBackup(now, factory, name);
	if (!backup) return null;
	return withDevice<ImportResult | null>(factory, name, null, async (db) => {
		const result = await importExport(localRepo(db), backup.file, now);
		await transact(
			db,
			['settings'],
			'readwrite',
			async (tx) => void (await done(tx.objectStore('settings').delete(BACKUP)))
		);
		return result;
	});
}
