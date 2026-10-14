/**
 * The backend of a guest: the same `Backend` the screens use, answered by the core rules on the
 * device's own repo instead of by this server. Errors are `BackendError`s with the reason to show,
 * like the remote ones, so the screens cannot tell the two apart.
 */
import { BackendError, type Backend } from '#lib/backend.js';
import { activityView } from '#lib/core/activity.js';
import { parseMessages, runAssistant, undoAction } from '#lib/core/assistant.js';
import { AssistantError, type Ctx, type Hint, type Model } from '#lib/core/context.js';
import { agentFeed, dismissCard, reportStuck } from '#lib/core/feed.js';
import { createPlanTask, deletePlanTask, updatePlanTask } from '#lib/core/plan.js';
import { rateLimit } from '#lib/core/rate.js';
import type { Repo } from '#lib/core/repo.js';
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
}

/** In a browser the key travels as a subprotocol, the server variant sends a header. */
const browserSocket = (url: string, key: string) =>
	new WebSocket(url, ['realtime', `openai-insecure-api-key.${key}`]);

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

export function localBackend(deps: LocalDeps): Backend {
	const { repo } = deps;
	const now = deps.now ?? Date.now;
	const modelFor = deps.modelFor ?? openaiModel;
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
			save: (patch) =>
				guarded(async () => {
					const parsed = parseSettingsPatch(patch);
					if (!parsed.ok) throw new AssistantError(parsed.error, 400);
					await repo.settings.update(parsed.value);
				})
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
