/**
 * The first run: when the welcome shows and the live example inside the welcome. Pure, the flags that remember what was dismissed are in `flags.ts`.
 */
import type { Task } from '#lib/core/repo.js';
import { timeBoundState, type HeroState } from '#lib/now.js';
import { rank } from '#lib/priority.js';
import { Priority, TaskStatus } from '#lib/types.js';

export interface FirstRun {
	/** Nobody is signed in: the plan is on this device. */
	guest: boolean;
	/** The plan was read, until then nothing is known about it. */
	ready: boolean;
	/** The device could not be read. The page says so instead. */
	problem: boolean;
	taskCount: number;
	/** The welcome was answered once on this device. */
	welcomed: boolean;
}

/** Only on the very first visit: no plan on the device, no account, the welcome never answered. */
export function showWelcome(state: FirstRun): boolean {
	return state.guest && state.ready && !state.problem && state.taskCount === 0 && !state.welcomed;
}

/** The live example in the welcome: a task 28 minutes from its end, made into the hero the way Now does. */
export function welcomeExample(): { hero: HeroState<Task>; now: number } {
	const task: Task = {
		id: 1,
		title: 'Write the report intro',
		description: '',
		date: '',
		startTime: 14 * 60,
		duration: 60,
		priority: Priority.High,
		status: TaskStatus.Pending,
		completedAt: null,
		kind: 'block',
		parentId: null,
		shift: 0
	};
	const now = 14 * 60 + 32;
	const hero = timeBoundState(rank([task], now), now, { overrunMinutes: 15 })!;
	return { hero, now };
}
