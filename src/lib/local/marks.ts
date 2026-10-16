/**
 * Which tasks, routines and to-dos the device made as a sample day. The mark is the ids kept in the settings store
 * under their own keys (`sample`, `sample-routines`, `sample-todos`), so the plan itself carries nothing that is not
 * a task and the database needs no new version. A sample task the user edited stays a sample until it is cleared. The tasks a
 * sample routine makes later are found by their `routineId`, they need no mark.
 */
import { done, transact } from '#lib/local/db.js';

const TASKS = 'sample';
const ROUTINES = 'sample-routines';
const TODOS = 'sample-todos';

export interface SampleMarks {
	read(): Promise<number[]>;
	write(ids: number[]): Promise<void>;
	readRoutines(): Promise<number[]>;
	writeRoutines(ids: number[]): Promise<void>;
	readTodos(): Promise<number[]>;
	writeTodos(ids: number[]): Promise<void>;
}

export function localMarks(db: IDBDatabase): SampleMarks {
	const readKey = (key: string) =>
		transact(db, ['settings'], 'readonly', async (tx) =>
			((await done<number[] | undefined>(tx.objectStore('settings').get(key))) ?? []).slice()
		);
	const writeKey = (key: string, ids: number[]) =>
		transact(db, ['settings'], 'readwrite', async (tx) => {
			const store = tx.objectStore('settings');
			if (ids.length) await done(store.put(ids, key));
			else await done(store.delete(key));
		});
	return {
		read: () => readKey(TASKS),
		write: (ids) => writeKey(TASKS, ids),
		readRoutines: () => readKey(ROUTINES),
		writeRoutines: (ids) => writeKey(ROUTINES, ids),
		readTodos: () => readKey(TODOS),
		writeTodos: (ids) => writeKey(TODOS, ids)
	};
}
