/**
 * The `Repo` of a guest: the same port as the database repo, on the device's IndexedDB. One database
 * holds one user, so there is no scoping. The contract suite proves it behaves like an account.
 */
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import type {
	AgentAction,
	Card,
	EventRow,
	FlowRow,
	Repo,
	Routine,
	ScheduleEntry,
	Settings,
	Task,
	Todo
} from '#lib/core/repo.js';
import { TaskStatus } from '#lib/types.js';
import { SCHEDULE_LIMITS } from '#lib/schedule.js';
import { done, removeWhere, scan, transact, type StoreName } from '#lib/local/db.js';

const SETTINGS_KEY = 'settings';

const switchedOn = (row: ScheduleEntry): ScheduleEntry => ({
	...row,
	enabled: row.enabled !== false
});

/** A task saved before `completedAt`, `kind`, `parentId`, `shift` or `routineId` existed has none: it is a task of the user's own that stays. */
const asTask = (row: Task): Task => ({
	...row,
	completedAt: row.completedAt ?? null,
	kind: row.kind ?? 'block',
	parentId: row.parentId ?? null,
	shift: row.shift ?? 0,
	routineId: row.routineId ?? null
});

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
					return rows
						.map(asTask)
						.sort((a, b) => a.date.localeCompare(b.date) || a.startTime - b.startTime);
				}),
			get: (id) =>
				read('tasks', async (store) => {
					const row = await getById<Task>(store, id);
					return row && asTask(row);
				}),
			insert: (task) =>
				write('tasks', async (store) => {
					const row = {
						...task,
						status: task.status ?? TaskStatus.Pending,
						completedAt: task.completedAt ?? null,
						kind: task.kind ?? 'block',
						parentId: task.parentId ?? null,
						shift: task.shift ?? 0,
						routineId: task.routineId ?? null
					};
					const id = (await done(store.add(row))) as number;
					return { ...row, id };
				}),
			update: (id, patch) =>
				write('tasks', async (store) => {
					const row = await update<Task>(store, id, patch);
					return row && asTask(row);
				}),
			delete: (id) =>
				write('tasks', async (store) => {
					const row = await getById<Task>(store, id);
					if (row) await done(store.delete(id));
					return row && asTask(row);
				}),
			restore: (task) =>
				write('tasks', async (store) => {
					if (!(await getById<Task>(store, task.id))) await done(store.put(task));
				})
		},

		todos: {
			open: () =>
				read('todos', async (store) =>
					(await scan<Todo>(store, { where: (row) => row.status === 'open' })).sort(byId)
				),
			all: () => read('todos', async (store) => (await scan<Todo>(store)).sort(byId)),
			doneSince: (at) =>
				read('todos', async (store) =>
					(
						await scan<Todo>(store, {
							where: (row) =>
								row.status === 'done' && row.completedAt !== null && row.completedAt >= at
						})
					).sort(byId)
				),
			get: (id) => read('todos', (store) => getById<Todo>(store, id)),
			insert: (todo) =>
				write('todos', async (store) => {
					const row = {
						description: '',
						status: 'open',
						estimate: null,
						learned: false,
						progress: 0,
						spentMinutes: 0,
						skips: 0,
						skipSince: null,
						dueDate: null,
						dueTime: null,
						parentId: null,
						notBefore: null,
						nextStep: null,
						createdAt: Date.now(),
						completedAt: null,
						...stripUndefined(todo)
					} as const;
					const id = (await done(store.add(row))) as number;
					return { ...row, id } as Todo;
				}),
			update: (id, patch) => write('todos', (store) => update<Todo>(store, id, patch)),
			delete: (id) =>
				write('todos', async (store) => {
					const row = await getById<Todo>(store, id);
					if (row) await done(store.delete(id));
					return row;
				}),
			restore: (todo) =>
				write('todos', async (store) => {
					if (!(await getById<Todo>(store, todo.id))) await done(store.put(todo));
				})
		},

		routines: {
			all: () => read('routines', async (store) => (await scan<Routine>(store)).sort(byId)),
			get: (id) => read('routines', (store) => getById<Routine>(store, id)),
			insert: (routine) =>
				write('routines', async (store) => {
					const row = {
						description: '',
						shift: 0,
						kind: 'block',
						lastDay: null,
						through: null,
						...stripUndefined(routine)
					} as const;
					const id = (await done(store.add(row))) as number;
					return { ...row, id } as Routine;
				}),
			update: (id, patch) => write('routines', (store) => update<Routine>(store, id, patch)),
			delete: (id) =>
				write('routines', async (store) => {
					const row = await getById<Routine>(store, id);
					if (row) await done(store.delete(id));
					return row;
				}),
			restore: (routine) =>
				write('routines', async (store) => {
					if (!(await getById<Routine>(store, routine.id))) await done(store.put(routine));
				})
		},

		flow: {
			day: (date) =>
				read('flow', async (store) =>
					(await scan<FlowRow>(store.index('date'), { range: IDBKeyRange.only(date) })).sort(
						(a, b) => a.at - b.at || a.id - b.id
					)
				),
			all: () =>
				read('flow', async (store) =>
					(await scan<FlowRow>(store)).sort((a, b) => a.at - b.at || a.id - b.id)
				),
			insert: (row) =>
				write('flow', async (store) => {
					const key = row.key ?? null;
					if (key !== null && (await done(store.index('key').getKey(key))) !== undefined)
						return null;
					const next = {
						at: row.at,
						date: row.date,
						type: row.type,
						todoId: row.todoId ?? null,
						taskId: row.taskId ?? null,
						data: row.data ?? {},
						key
					};
					const id = (await done(store.add(next))) as number;
					return { ...next, id };
				}),
			prune: (before) =>
				write('flow', (store) => removeWhere<FlowRow>(store, (row) => row.at < before))
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
			// A row saved before the switch existed has no `enabled`, it is on
			pending: () =>
				read('schedule', async (store) =>
					(await scan<ScheduleEntry>(store, { where: (row) => row.status === 'pending' }))
						.map(switchedOn)
						.sort((a, b) => a.fireAt - b.fireAt || a.id - b.id)
				),
			due: (nowMs) =>
				read('schedule', async (store) =>
					(
						await scan<ScheduleEntry>(store, {
							where: (row) =>
								row.status === 'pending' && row.enabled !== false && row.fireAt <= nowMs
						})
					)
						.map(switchedOn)
						.sort((a, b) => a.fireAt - b.fireAt || a.id - b.id)
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
						enabled: entry.enabled ?? true,
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
					const next = { ...switchedOn(row), status: 'cancelled' } as const;
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

/** `{ a: undefined }` must not overwrite a default when spread over it. */
const stripUndefined = <T extends object>(value: T): T =>
	Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

interface Usage {
	id: number;
	use: string;
	tokens: number;
	createdAt: number;
}
