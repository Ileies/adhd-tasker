/**
 * The backend of a guest: the same `Backend` the screens use, answered by the core rules on the
 * device's own repo instead of by this server. Errors are `BackendError`s with the reason to show,
 * like the remote ones, so the screens cannot tell the two apart.
 */
import { BackendError, type Backend } from '#lib/backend.js';
import { activityView } from '#lib/core/activity.js';
import { buildExport, importExport, parseExport } from '#lib/core/export.js';
import { parseMessages, runAssistant, undoAction } from '#lib/core/assistant.js';
import { AssistantError, type Ctx, type Hint, type Model } from '#lib/core/context.js';
import { agentFeed, dismissCard, reportStuck } from '#lib/core/feed.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { loadFlow, recordFlow } from '#lib/core/flow.js';
import { createTodo, deleteTodo, loadTodos, updateTodo } from '#lib/core/todos.js';
import { createRoutine, deleteRoutine, loadRoutines, updateRoutine } from '#lib/core/routines.js';
import { GeocodeError, searchPlaces } from '#lib/core/geocode.js';
import { checkOpenaiKey } from '#lib/core/openai-key.js';
import { rateLimit } from '#lib/core/rate.js';
import type { Repo, Task } from '#lib/core/repo.js';
import { sampleDay, sampleRoutines } from '#lib/core/sample.js';
import type { SampleMarks } from '#lib/local/marks.js';
import {
	addUserAlarm,
	cancelEntry,
	scheduleOverview,
	setAlarmEnabled,
	updateUserAlarm
} from '#lib/core/schedule.js';
import { speak as speakWith, transcribe as transcribeWith } from '#lib/core/voice.js';
import { openaiModel } from '#lib/openai.js';
import { clientSettings, parseSettingsPatch } from '#lib/settings.js';
import { isValidTimezone } from '#lib/time.js';
import { TaskStatus } from '#lib/types.js';

export interface LocalDeps {
	repo: Repo;
	now?: () => number;
	/** Tells this tab and the other tabs of the device. */
	hint(message: Hint): number;
	/** Asks the agent loop to look at new events shortly. */
	react(): void;
	/** Tells the other tabs which days changed. */
	planChanged?(dates: string[]): void;
	/** Builds the model for a key, a test swaps it for a fake. */
	modelFor?(key: string): Model;
	/** Asks the browser to keep this site's data, called once when the first task is saved. */
	persist?(): void;
	/** Deletes the device's database and tells the other tabs. */
	erase?(): Promise<void>;
	/** Where the sample day's task ids are kept. Without it they are kept in memory, as in a test. */
	marks?: SampleMarks;
}

/** In a browser the key travels as a subprotocol, the server variant sends a header. */
const browserSocket = (url: string, key: string) =>
	new WebSocket(url, ['realtime', `openai-insecure-api-key.${key}`]);

const FIRST_DAY = '0000-01-01';

const RATE = { requests: 20, windowMs: 5 * 60_000 };
const VOICE_RATE = { requests: 30, windowMs: 5 * 60_000 };

/** Runs core work and gives its failure the shape the screens expect. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof AssistantError) throw new BackendError(error.message, error.status);
		throw error;
	}
}

const signInFirst = async (): Promise<never> => {
	throw new BackendError('Sign in first', 401);
};

export function localBackend(deps: LocalDeps): Backend {
	const { repo } = deps;
	const now = deps.now ?? Date.now;
	const modelFor = deps.modelFor ?? openaiModel;
	let remembered: number[] = [];
	let rememberedRoutines: number[] = [];
	const marks: SampleMarks = deps.marks ?? {
		read: async () => remembered,
		write: async (ids) => void (remembered = ids),
		readRoutines: async () => rememberedRoutines,
		writeRoutines: async (ids) => void (rememberedRoutines = ids)
	};
	/** The sample's tasks still in the plan: the marked ones and every day its routines made, however late. */
	const sampleTasks = async () => {
		const routines = new Set(await marks.readRoutines());
		const found = new Map<number, Task>();
		for (const id of await marks.read()) {
			const task = await repo.tasks.get(id);
			if (task) found.set(id, task);
		}
		if (routines.size > 0)
			for (const task of await repo.tasks.between('0000-01-01'))
				if (routines.has(task.routineId ?? 0)) found.set(task.id, task);
		return [...found.values()];
	};
	const chatRate = rateLimit(RATE, 'Too many requests, wait a few minutes');
	const voiceRate = rateLimit(VOICE_RATE, 'Too many voice requests, wait a few minutes');

	const ctx = (model: Model | null = null): Ctx => ({
		repo,
		now,
		model,
		hint: deps.hint,
		react: deps.react
	});
	const timezone = async () => (await repo.settings.get()).timezone ?? 'UTC';
	/** The guest's own key, kept on the device. */
	const keyOrThrow = async () => {
		const { openaiKey } = await repo.settings.get();
		if (!openaiKey) throw new AssistantError('Add your OpenAI key in Settings first', 400);
		return openaiKey;
	};

	return {
		tasks: {
			load: (date) => repo.tasks.between(date, date),
			since: (date) => repo.tasks.between(date),
			create: (task) =>
				guarded(async () => {
					const created = await createPlanTask(ctx(), task);
					deps.planChanged?.([created.date]);
					// The first task is the first thing worth keeping: ask the browser not to clear it under storage pressure
					if ((await repo.tasks.between(FIRST_DAY)).length === 1) deps.persist?.();
					return created;
				}),
			update: (task) =>
				guarded(async () => {
					const before = await repo.tasks.get(task.id);
					await updatePlanTask(ctx(), task);
					deps.planChanged?.([
						...new Set([before?.date, task.date].filter((d) => !!d))
					] as string[]);
				}),
			delete: (id) =>
				guarded(async () => {
					const before = await repo.tasks.get(id);
					await deletePlanTask(ctx(), { id });
					if (before) deps.planChanged?.([before.date]);
				})
		},

		todos: {
			load: () => loadTodos(ctx()),
			create: (fields) => guarded(() => createTodo(ctx(), fields)),
			update: (fields) => guarded(() => updateTodo(ctx(), fields)),
			delete: (id) =>
				guarded(async () => {
					await deleteTodo(ctx(), { id });
				})
		},

		routines: {
			load: () => loadRoutines(ctx()),
			create: (fields) => guarded(() => createRoutine(ctx(), fields)),
			update: (fields) => guarded(() => updateRoutine(ctx(), fields)),
			delete: (id) => guarded(() => deleteRoutine(ctx(), { id }))
		},

		flow: {
			load: (date) => loadFlow(ctx(), date),
			record: (answer) => guarded(() => recordFlow(ctx(), answer))
		},

		schedule: {
			load: () => scheduleOverview(ctx()),
			addAlarm: (fields) =>
				guarded(async () => void (await addUserAlarm(ctx(), fields, await timezone()))),
			remove: async (id) => void (await cancelEntry(ctx(), id)),
			setEnabled: (id, enabled) =>
				guarded(async () => {
					if (!(await setAlarmEnabled(ctx(), id, enabled, await timezone())))
						throw new AssistantError('No such alarm', 404);
				}),
			updateAlarm: (id, fields) =>
				guarded(async () => void (await updateUserAlarm(ctx(), id, fields, await timezone()))),
			// A guest has one device, so there is no display device to choose
			chooseDisplay: async () => {}
		},

		assistant: {
			chat: (messages) =>
				guarded(async () => {
					const history = parseMessages(messages);
					if (history.at(-1)?.role !== 'user') throw new AssistantError('Nothing to answer', 400);
					chatRate('guest', now());
					const settings = await repo.settings.get();
					if (!settings.openaiKey)
						throw new AssistantError('Add your OpenAI key in Settings first', 400);
					return runAssistant(ctx(modelFor(settings.openaiKey)), settings, history);
				}),
			undo: (id) =>
				guarded(() => {
					if (!Number.isInteger(id)) throw new AssistantError('id must be a change id', 400);
					return undoAction(ctx(), id);
				})
		},

		agent: {
			feed: (since) => agentFeed(ctx(), since),
			resolveCard: (id) => guarded(() => dismissCard(ctx(), id)),
			stuck: (taskId, reason) => guarded(() => reportStuck(ctx(), { taskId, reason }))
		},

		activity: { load: () => activityView(ctx()) },

		settings: {
			load: async () => clientSettings(await repo.settings.get()),
			saveTimezone: (timezone) =>
				guarded(async () => {
					if (!isValidTimezone(timezone)) throw new AssistantError('Invalid timezone', 400);
					await repo.settings.update({ timezone });
				}),
			// The guest's browser asks the city search itself, only the typed name is sent
			searchPlaces: (query) =>
				guarded(async () => {
					try {
						return await searchPlaces(query);
					} catch (thrown) {
						if (thrown instanceof GeocodeError)
							throw new AssistantError(thrown.message, thrown.status);
						throw thrown;
					}
				}),
			// The guest's key is checked from the browser and stays on the device
			saveKey: (key) =>
				guarded(
					async () => void (await repo.settings.update({ openaiKey: await checkOpenaiKey(key) }))
				),
			removeKey: async () => void (await repo.settings.update({ openaiKey: null })),
			save: (patch) =>
				guarded(async () => {
					const parsed = parseSettingsPatch(patch);
					if (!parsed.ok) throw new AssistantError(parsed.error, 400);
					await repo.settings.update(parsed.value);
				})
		},

		data: {
			export: () => buildExport(repo, now()),
			import: (raw) =>
				guarded(async () => {
					const parsed = parseExport(raw);
					if (!parsed.ok) throw new AssistantError(parsed.error, 400);
					const result = await importExport(repo, parsed.value, now());
					deps.planChanged?.([...new Set(parsed.value.tasks.map((task) => task.date))]);
					if (parsed.value.alarms.length) deps.hint({ type: 'schedule' });
					return result;
				}),
			erase: () =>
				guarded(async () => {
					if (!deps.erase) throw new AssistantError('Nothing to delete on this device', 400);
					await deps.erase();
				})
		},

		// A device has no account to move into: signing in does that, with the account's own backend
		account: {
			move: signInFirst,
			snapshots: async () => [],
			restore: signInFirst
		},

		// Calendar is read by the server for an account, a device has nothing to link
		calendar: {
			overview: async () => ({
				linked: false,
				state: { status: 'none', calendars: [], syncedAt: null, writeCalendar: null },
				calendars: []
			}),
			preview: signInFirst,
			import: signInFirst,
			sync: async () => false,
			stop: async () => {},
			setWrite: signInFirst,
			allDay: async () => []
		},

		sample: {
			async ids() {
				return (await sampleTasks()).map((task) => task.id);
			},
			async start(today, minutes) {
				// A second tap on the same button adds nothing
				const existing = await sampleTasks();
				if (existing.length) return existing;
				// Written straight to the repo, like an import: the user did not plan these, so no event wakes the agent
				const created: Task[] = [];
				for (const task of sampleDay(today, minutes)) created.push(await repo.tasks.insert(task));
				await marks.write(created.map((task) => task.id));
				// The essentials are routines: the first one makes the week ahead for all of them
				const routines: number[] = [];
				for (const patch of sampleRoutines()) {
					routines.push((await createRoutine(ctx(), { ...patch, firstDay: today })).id);
					await marks.writeRoutines(routines);
				}
				// Like the rest of the sample, what ended before now today is done already
				for (const task of await sampleTasks()) {
					if (task.date === today && task.startTime + task.duration <= minutes)
						await repo.tasks.update(task.id, { status: TaskStatus.Completed });
				}
				deps.planChanged?.([today]);
				return sampleTasks();
			},
			async clear() {
				const removed = await sampleTasks();
				for (const task of removed) await repo.tasks.delete(task.id);
				for (const id of await marks.readRoutines()) await repo.routines.delete(id);
				await marks.write([]);
				await marks.writeRoutines([]);
				if (removed.length) deps.planChanged?.([...new Set(removed.map((task) => task.date))]);
				deps.hint({ type: 'routines' });
				return removed.length;
			},
			async keep() {
				await marks.write([]);
				await marks.writeRoutines([]);
			}
		},

		voice: {
			transcribe: (audio) =>
				guarded(async () => {
					voiceRate('guest', now());
					const { voiceLanguage } = await repo.settings.get();
					return transcribeWith(await keyOrThrow(), audio, voiceLanguage);
				}),
			async speak(text) {
				try {
					voiceRate('guest', now());
					return new Blob(
						[(await speakWith(await keyOrThrow(), text, browserSocket)) as BlobPart],
						{
							type: 'audio/wav'
						}
					);
				} catch {
					return null;
				}
			}
		}
	};
}
