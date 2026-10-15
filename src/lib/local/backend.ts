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
import { checkOpenaiKey } from '#lib/core/openai-key.js';
import { rateLimit } from '#lib/core/rate.js';
import type { Repo, Task } from '#lib/core/repo.js';
import { sampleDay } from '#lib/core/sample.js';
import type { SampleMarks } from '#lib/local/marks.js';
import { addUserAlarm, cancelEntry, scheduleOverview } from '#lib/core/schedule.js';
import { speak as speakWith, transcribe as transcribeWith } from '#lib/core/voice.js';
import { openaiModel } from '#lib/openai.js';
import { clientSettings, parseSettingsPatch } from '#lib/settings.js';
import { isValidTimezone } from '#lib/time.js';

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
	const marks: SampleMarks = deps.marks ?? {
		read: async () => remembered,
		write: async (ids) => void (remembered = ids)
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

		schedule: {
			load: () => scheduleOverview(ctx()),
			addAlarm: (fields) =>
				guarded(async () => void (await addUserAlarm(ctx(), fields, await timezone()))),
			remove: async (id) => void (await cancelEntry(ctx(), id)),
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

		sample: {
			async ids() {
				const present: number[] = [];
				for (const id of await marks.read()) if (await repo.tasks.get(id)) present.push(id);
				return present;
			},
			async start(today, minutes) {
				// A second tap on the same button adds nothing
				const existing: Task[] = [];
				for (const id of await marks.read()) {
					const task = await repo.tasks.get(id);
					if (task) existing.push(task);
				}
				if (existing.length) return existing;
				// Written straight to the repo, like an import: the user did not plan these, so no event wakes the agent
				const created: Task[] = [];
				for (const task of sampleDay(today, minutes)) created.push(await repo.tasks.insert(task));
				await marks.write(created.map((task) => task.id));
				deps.planChanged?.([today]);
				return created;
			},
			async clear() {
				const removed: Task[] = [];
				for (const id of await marks.read()) {
					const gone = await repo.tasks.delete(id);
					if (gone) removed.push(gone);
				}
				await marks.write([]);
				if (removed.length) deps.planChanged?.([...new Set(removed.map((task) => task.date))]);
				return removed.length;
			}
		},

		voice: {
			transcribe: (audio) =>
				guarded(async () => {
					voiceRate('guest', now());
					return transcribeWith(await keyOrThrow(), audio);
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
