/**
 * The sounds a user replaced, kept on this device in a small database of their own (signed in or not: a sound is a
 * preference of the screen that plays it, so it is not synced). Separate from the guest's plan, so deleting one never
 * touches the other.
 */
import { done, openLocalDb, transact, type UpgradeStep } from '#lib/local/db.js';
import { isSoundSlot, type SoundSlot, type StoredSound } from '#lib/sounds.js';

export const SOUNDS_DATABASE_NAME = 'adhd-tasker-sounds';

const STEPS: UpgradeStep[] = [(db) => void db.createObjectStore('sounds', { keyPath: 'slot' })];

export async function openSoundsDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
	return openLocalDb(factory, SOUNDS_DATABASE_NAME, STEPS);
}

const run = <T>(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	body: (store: IDBObjectStore) => Promise<T>
) => transact(db, ['sounds'], mode, (tx) => body(tx.objectStore('sounds')));

export function saveSound(db: IDBDatabase, sound: StoredSound): Promise<void> {
	return run(db, 'readwrite', async (store) => void (await done(store.put(sound))));
}

export function removeSound(db: IDBDatabase, slot: SoundSlot): Promise<void> {
	return run(db, 'readwrite', async (store) => void (await done(store.delete(slot))));
}

/** Every replaced sound. Records that are not a known slot are ignored. */
export async function readSounds(db: IDBDatabase): Promise<StoredSound[]> {
	const all = await run(db, 'readonly', (store) =>
		done(store.getAll() as IDBRequest<StoredSound[]>)
	);
	return all.filter((sound) => isSoundSlot(sound.slot));
}
