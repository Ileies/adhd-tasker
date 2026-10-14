/**
 * An empty IndexedDB for one test, the same shape as `resetDb` for SQLite. Bun has no IndexedDB, so the
 * key range class a browser provides as a global is installed from `fake-indexeddb`. Each test file
 * has its own storage under `--isolate`, tests inside one file need a fresh factory.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

export function freshIndexedDb(): IDBFactory {
	(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = IDBKeyRange;
	return new IDBFactory();
}
