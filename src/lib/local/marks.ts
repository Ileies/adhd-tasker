/**
 * Which tasks the device made as a sample day. The mark is the id kept in the settings store under its
 * own key (`sample`), so the plan itself carries nothing that is not a task and the database needs no
 * new version. A sample task the user edited stays a sample until it is cleared.
 */
import { done, transact } from '#lib/local/db.js';

const KEY = 'sample';

export interface SampleMarks {
	read(): Promise<number[]>;
	write(ids: number[]): Promise<void>;
}

export function localMarks(db: IDBDatabase): SampleMarks {
	return {
		read: () =>
			transact(db, ['settings'], 'readonly', async (tx) =>
				((await done<number[] | undefined>(tx.objectStore('settings').get(KEY))) ?? []).slice()
			),
		write: (ids) =>
			transact(db, ['settings'], 'readwrite', async (tx) => {
				const store = tx.objectStore('settings');
				if (ids.length) await done(store.put(ids, KEY));
				else await done(store.delete(KEY));
			})
	};
}
