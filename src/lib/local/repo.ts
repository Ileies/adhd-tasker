/**
 * The `Repo` of a guest: the same port as the database repo, on the device's IndexedDB. One database
 * holds one user, so there is no scoping. The contract suite proves it behaves like an account.
 */
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import type {
	AgentAction,
	Card,
	EventRow,
	Repo,
	ScheduleEntry,
	Settings,
	Task
} from '#lib/core/repo.js';
import { TaskStatus } from '#lib/types.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { done, removeWhere, scan, transact, type StoreName } from '#lib/local/db.js';

const SETTINGS_KEY = 'settings';

/** The repo of this device's guest. `email` is only a label, nothing is scoped by it. */
export function localRepo(db: IDBDatabase, email = 'guest'): Repo {
	const read = <T>(store: StoreName, body: (store: IDBObjectStore) => Promise<T>) =>
		transact(db, [store], 'readonly', (tx) => body(tx.objectStore(store)));
	const write = <T>(store: StoreName, body: (store: IDBObjectStore) => Promise<T>) =>
		transact(db, [store], 'readwrite', (tx) => body(tx.objectStore(store)));

	const getById = <T>(store: IDBObjectStore, id: number) =>
		done<T | undefined>(store.get(id)).then((row) => row ?? null);
	const update = async <T extends { id: number }>(
		store: IDBObjectStore,
		id: number,
		patch: Partial<T>
	): Promise<T | null> => {
		const row = await getById<T>(store, id);
		if (!row) return null;
		const next = { ...row, ...patch };
		await done(store.put(next));
		return next;
	};
	const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;

	return {
		email,

		tasks: {
			between: (from, to) =>
				read('tasks', async (store) => {
					const range =
						to === undefined ? IDBKeyRange.lowerBound(from) : IDBKeyRange.bound(from, to);
					const rows = await scan<Task>(store.index('date'), { range });
					return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime - b.startTime);
				}),
			get: (id) => read('tasks', (store) => getById<Task>(store, id)),
			insert: (task) =>
				write('tasks', async (store) => {
					const row = { ...task, status: task.status ?? TaskStatus.Pending };
					const id = (await done(store.add(row))) as number;
					return { ...row, id };
				}),
			update: (id, patch) => write('tasks', (store) => update<Task>(store, id, patch)),
			delete: (id) =>
				write('tasks', async (store) => {
					const row = await getById<Task>(store, id);
					if (row) await done(store.delete(id));
					return row;
				}),
			restore: (task) =>
				write('tasks', async (store) => {
					if (!(await getById<Task>(store, task.id))) await done(store.put(task));
				})
		},

		actions: {
			record: (action) =>
				write(
					'actions',
					async (store) =>
						(await done(
							store.add({ ...action, createdAt: action.createdAt ?? Date.now(), undoneAt: null })
						)) as number
				),
			get: (id) => read('actions', (store) => getById<AgentAction>(store, id)),
			markUndone: (id, at) =>
				write(
					'actions',
					async (store) => void (await update<AgentAction>(store, id, { undoneAt: at }))
				),
			recent: (limit) =>
				read('actions', (store) => scan<AgentAction>(store, { reverse: true, limit })),
			latestId: () =>
				read('actions', async (store) => {
					const [row] = await scan<AgentAction>(store, { reverse: true, limit: 1 });
					return row?.id ?? 0;
				}),
			ownSince: (id) =>
				read('actions', (store) =>
					scan<AgentAction>(store, {
						range: IDBKeyRange.lowerBound(id, true),
						where: (row) => row.eventId !== null && row.undoneAt === null
					})
				),
			anySince: (at) =>
				read('actions', async (store) => {
					const rows = await scan<AgentAction>(store, {
						reverse: true,
						limit: 1,
						where: (row) => row.createdAt > at
					});
					return rows.length > 0;
				})
		},

		events: {
			insert: (event) =>
				write('events', async (store) => {
					const key = event.key ?? null;
					if (key !== null && (await done(store.index('key').getKey(key))) !== undefined)
						return null;
					const row = {
						type: event.type,
						payload: event.payload,
						origin: event.origin,
						key,
						createdAt: event.createdAt,
						handledAt: event.handledAt ?? null,
						outcome: event.outcome ?? null
					};
					return (await done(store.add(row))) as number;
				}),
			unhandled: () =>
				read('events', (store) =>
					scan<EventRow>(store, { where: (row) => row.handledAt === null })
				),
			settle: (ids, outcome, at) =>
				write('events', async (store) => {
					for (const id of ids) await update<EventRow>(store, id, { handledAt: at, outcome });
				}),
			recent: (limit) => read('events', (store) => scan<EventRow>(store, { reverse: true, limit })),
			knownKeys: (keys) =>
				read('events', async (store) => {
					const known = new Set<string>();
					for (const key of keys)
						if ((await done(store.index('key').getKey(key))) !== undefined) known.add(key);
					return known;
				}),
			prune: (before) =>
				write('events', (store) =>
					removeWhere<EventRow>(store, (row) => row.handledAt !== null && row.createdAt < before)
				)
		},

		cards: {
			open: () =>
				read('cards', async (store) => {
					const [row] = await scan<Card>(store, {
						reverse: true,
						limit: 1,
						where: (card) => card.resolvedAt === null
					});
					return row ?? null;
				}),
			show: (card) =>
				write('cards', async (store) => {
					const open = await scan<Card>(store, { where: (row) => row.resolvedAt === null });
					for (const row of open) await done(store.put({ ...row, resolvedAt: card.createdAt }));
					const row = {
						kind: card.kind,
						text: card.text,
						options: card.options?.length ? card.options : null,
						eventId: card.eventId ?? null,
						createdAt: card.createdAt,
						resolvedAt: null
					};
					const id = (await done(store.add(row))) as number;
					return { ...row, id };
				}),
			resolve: (id, at) =>
				write('cards', async (store) => {
					const card = await getById<Card>(store, id);
					if (!card || card.resolvedAt !== null) return false;
					await done(store.put({ ...card, resolvedAt: at }));
					return true;
				}),
			prune: (before) =>
				write('cards', (store) =>
					removeWhere<Card>(store, (row) => row.resolvedAt !== null && row.createdAt < before)
				)
		},

		schedule: {
			pending: () =>
				read('schedule', async (store) =>
					(await scan<ScheduleEntry>(store, { where: (row) => row.status === 'pending' })).sort(
						(a, b) => a.fireAt - b.fireAt || a.id - b.id
					)
				),
			due: (nowMs) =>
				read('schedule', async (store) =>
					(
						await scan<ScheduleEntry>(store, {
							where: (row) => row.status === 'pending' && row.fireAt <= nowMs
						})
					).sort((a, b) => a.fireAt - b.fireAt || a.id - b.id)
				),
			insert: (entry) =>
				write('schedule', async (store) => {
					const row = {
						kind: entry.kind,
						fireAt: entry.fireAt,
						minutes: entry.minutes ?? null,
						repeat: entry.repeat ?? 'none',
						label: entry.label ?? null,
						note: entry.note ?? null,
						tone: entry.tone ?? null,
						durationMin: entry.durationMin ?? SCHEDULE_LIMITS.defaultAlarmMinutes,
						createdBy: entry.createdBy,
						status: 'pending',
						createdAt: entry.createdAt
					} as const;
					const id = (await done(store.add(row))) as number;
					return { ...row, id };
				}),
			update: (id, patch) =>
				write('schedule', async (store) => void (await update<ScheduleEntry>(store, id, patch))),
			cancel: (id) =>
				write('schedule', async (store) => {
					const row = await getById<ScheduleEntry>(store, id);
					if (!row || row.status !== 'pending') return null;
					const next = { ...row, status: 'cancelled' } as const;
					await done(store.put(next));
					return next;
				}),
			prune: (before) =>
				write('schedule', (store) =>
					removeWhere<ScheduleEntry>(
						store,
						(row) => row.status !== 'pending' && row.fireAt < before
					)
				)
		},

		usage: {
			record: (use, tokens, at) =>
				write(
					'usage',
					async (store) => void (await done(store.add({ use, tokens, createdAt: at })))
				),
			tokensSince: (since) =>
				read('usage', async (store) =>
					(await scan<Usage>(store, { where: (row) => row.createdAt >= since })).reduce(
						(sum, row) => sum + row.tokens,
						0
					)
				),
			countSince: (use, since) =>
				read(
					'usage',
					async (store) =>
						(
							await scan<Usage>(store, {
								where: (row) => row.use === use && row.createdAt >= since
							})
						).length
				),
			timesSince: (use, since) =>
				read('usage', async (store) =>
					(await scan<Usage>(store, { where: (row) => row.use === use && row.createdAt >= since }))
						.sort(byId)
						.map((row) => row.createdAt)
				),
			prune: (before) =>
				write('usage', (store) => removeWhere<Usage>(store, (row) => row.createdAt < before))
		},

		settings: {
			get: () =>
				read('settings', async (store) => ({
					...DEFAULT_SETTINGS,
					...(await done<Partial<Settings> | undefined>(store.get(SETTINGS_KEY)))
				})),
			update: (patch) =>
				write('settings', async (store) => {
					const saved = (await done<Partial<Settings> | undefined>(store.get(SETTINGS_KEY))) ?? {};
					// Only what the user changed is stored, so a default that improves later reaches old guests
					const next = { ...saved, ...patch };
					await done(store.put(next, SETTINGS_KEY));
					return { ...DEFAULT_SETTINGS, ...next };
				})
		}
	};
}

interface Usage {
	id: number;
	use: string;
	tokens: number;
	createdAt: number;
}
