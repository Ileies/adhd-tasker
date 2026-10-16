/**
 * A day for the flow engine, stepped minute by minute (`docs/flow-plan.md` 11). It holds what a device holds (the
 * tasks, the to-dos and the flow log), ticks like the 15 s loop (writing the pin the engine asks for) and takes the
 * taps of a scripted user: Start, Done, Do this now, Call it a day, undo. Times are UTC so tests never depend on the
 * machine's timezone.
 */
import type { CheckData } from '#lib/checks.js';
import {
	flow,
	type FlowLogRow,
	type FlowSettings,
	type FlowState,
	type FlowTask,
	type FlowTodo
} from '#lib/flow.js';
import { rotationTargets } from '#lib/pick.js';
import { coolingAt, liveRows, skipPatch, stepFor, stepsOf, type Struggle } from '#lib/struggle.js';
import { Priority, TaskStatus } from '#lib/types.js';

export const DAY = '2026-10-14';
export const DAY_START_MS = Date.parse(`${DAY}T00:00:00Z`);

export const SETTINGS: FlowSettings = {
	myDayStart: 7 * 60,
	myDayEnd: 23 * 60,
	overrunMinutes: 15,
	checkMinutes: 30
};

export const at = (minutes: number) => DAY_START_MS + minutes * 60_000;

export function simTask(
	id: number,
	startTime: number,
	duration: number,
	patch: Partial<FlowTask> = {}
): FlowTask {
	return {
		id,
		title: `Task ${id}`,
		startTime,
		duration,
		priority: Priority.Medium,
		status: TaskStatus.Pending,
		completedAt: null,
		...patch
	};
}

export function simTodo(id: number, patch: Partial<FlowTodo> = {}): FlowTodo {
	return {
		id,
		title: `Study ${String.fromCharCode(64 + id)}`,
		priority: Priority.Critical,
		status: 'open',
		estimate: 900,
		progress: 0,
		dueDate: '2026-11-03',
		dueTime: null,
		notBefore: null,
		completedAt: null,
		...patch
	};
}

export class SimDay {
	log: FlowLogRow[] = [];
	minute: number;
	/** Answers every check at once. A test of Away sets this to `false`. */
	diligent = true;
	/** The break length setting. */
	breakMinutes = 10;
	/** What was current at every minute that ran, `[minute, key]`, for asserting how a day went. */
	readonly timeline: { minute: number; state: FlowState<FlowTask, FlowTodo> }[] = [];
	private nextRow = 1;

	constructor(
		public tasks: FlowTask[] = [],
		public todos: FlowTodo[] = [],
		public settings: FlowSettings = SETTINGS,
		minute = 7 * 60
	) {
		this.minute = minute;
	}

	/** The engine's answer at the current minute, without any tick. */
	peek(): FlowState<FlowTask, FlowTodo> {
		return flow({
			date: DAY,
			now: this.minute,
			// Half a second into the minute: what a step that follows its answer by a millisecond has happened by now
			nowMs: at(this.minute) + 500,
			at,
			tasks: this.tasks,
			todos: this.todos,
			log: this.log,
			settings: this.settings
		});
	}

	/**
	 * One tick like a device's: pins what the engine asks for. A diligent user answers a check the minute it is asked
	 * (Keep going twice, then a few percent), a silent one never does.
	 */
	tick(): FlowState<FlowTask, FlowTodo> {
		for (let round = 0; round < 4; round++) {
			const state = this.peek();
			if (state.pin && !this.log.some((row) => row.key === state.pin!.key))
				this.write('pin', {
					todoId: state.pin.todoId,
					key: state.pin.key,
					...(state.pin.face ? { data: { face: true } } : {})
				});
			const { check } = this.peek();
			if (!check || !this.diligent) break;
			if (check.about === 'break' || check.about === 'day') this.back();
			else if (check.about === 'face') this.faceAnswer(check.todo!.id, 'fine');
			else if (check.todo === null) this.start();
			else {
				const progress = check.todo.progress;
				this.answer(
					check.todo.id,
					check.keeps < 2 ? { before: progress, after: progress, keep: true } : { after: progress }
				);
			}
		}
		return this.peek();
	}

	/** Runs minute by minute up to and including `minute`, recording each state. */
	runTo(minute: number, each?: (minute: number, state: FlowState<FlowTask, FlowTodo>) => void) {
		while (this.minute <= minute) {
			const state = this.tick();
			this.timeline.push({ minute: this.minute, state });
			each?.(this.minute, state);
			if (this.minute === minute) break;
			this.minute++;
		}
		return this.peek();
	}

	/** Moves the clock without ticking, for "the user opened the app at 14:00". */
	jumpTo(minute: number) {
		this.minute = minute;
		return this.peek();
	}

	write(
		type: FlowLogRow['type'],
		fields: {
			todoId?: number;
			key?: string;
			data?: Record<string, unknown>;
			/** Milliseconds after this minute: a step follows the answer that caused it by a moment. */
			plus?: number;
		} = {}
	) {
		const row: FlowLogRow = {
			id: this.nextRow++,
			at: at(this.minute) + (fields.plus ?? 0),
			type,
			todoId: fields.todoId ?? null,
			data: fields.data ?? {},
			key: fields.key ?? null
		};
		this.log.push(row);
		return row;
	}

	start = () => this.write('start');
	/** The answer to a check: `after` is the progress said, the session counted `minutes`. */
	answer(todoId: number, data: Partial<CheckData> & { after: number }) {
		return this.write('check', { todoId, data: { before: 0, minutes: 30, ...data } });
	}
	choose = (todoId: number) => this.write('choose', { todoId });
	callItADay = () => this.write('rest');
	undo = (ref: number) => this.write('undo', { data: { ref } });
	/** "I'm back" after a break, or "Let's go". */
	back = () => this.write('back');
	/** A break the user asked for ("I need a break", Take a break). */
	takeBreak = (minutes = 10, data: Record<string, unknown> = {}) =>
		this.write('break', { data: { minutes, activity: 'water', why: 'asked', ...data } });
	faceAnswer(todoId: number, answer: string) {
		const todo = this.todos.find((entry) => entry.id === todoId)!;
		todo.skips = 0;
		todo.skipSince = null;
		return this.write('face', { todoId, data: { answer } });
	}

	/** What `doneAts` would be on a device: when the day's tasks and to-dos were finished. */
	private doneAts() {
		return [...this.tasks, ...this.todos]
			.filter((item) => item.completedAt !== null)
			.map((item) => item.completedAt!);
	}

	/**
	 * The user says the work does not go, the way the page answers it: the trigger row, then the step the ladder takes
	 * (a rotation or a break). Answers the plan, `null` when the struggle did not count.
	 */
	struggle(trigger: Struggle, todoId: number) {
		const now = at(this.minute);
		const rows = liveRows(this.log);
		const cooling = coolingAt(stepsOf(rows, this.doneAts()), now);
		const state = this.peek();
		const result = stepFor({
			rows,
			doneAts: this.doneAts(),
			trigger,
			todoId,
			nowMs: now,
			sessionStart: state.current.kind === 'todo' ? state.current.session.start : now,
			others: rotationTargets(this.todos, DAY, cooling, todoId),
			breakMinutes: this.breakMinutes,
			activity: 'water'
		});
		const todo = this.todos.find((entry) => entry.id === todoId)!;
		if (trigger === 'unfocused')
			this.answer(todoId, { before: todo.progress, after: todo.progress, pace: 'unfocused' });
		else if (trigger === 'low-energy' || trigger === 'cant-start')
			this.write('stuck', { todoId, data: { reason: trigger } });
		if (!result) return null;
		const { answer } = result;
		// Like the page: the step follows the answer that caused it by a moment, so their sessions have their own pins
		this.write(answer.type, {
			todoId: answer.todoId ?? undefined,
			data: answer.data,
			plus: answer.type === 'rotate' && trigger !== 'else' ? 1 : 0
		});
		if (answer.type === 'rotate')
			Object.assign(
				todo,
				skipPatch({ skips: todo.skips ?? 0, skipSince: todo.skipSince ?? null }, DAY)
			);
		return result.plan;
	}

	/** Done on a task or a to-do. */
	finishTask(id: number) {
		const task = this.tasks.find((entry) => entry.id === id)!;
		task.status = TaskStatus.Completed;
		task.completedAt = at(this.minute);
	}
	finishTodo(id: number) {
		const todo = this.todos.find((entry) => entry.id === id)!;
		todo.status = 'done';
		todo.completedAt = at(this.minute);
	}

	/** Minutes each to-do was current over the recorded timeline. */
	minutesOn(): Map<number, number> {
		const minutes = new Map<number, number>();
		for (const { state } of this.timeline)
			if (state.current.kind === 'todo')
				minutes.set(state.current.todo.id, (minutes.get(state.current.todo.id) ?? 0) + 1);
		return minutes;
	}
}
