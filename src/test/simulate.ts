/**
 * A day for the flow engine, stepped minute by minute (`docs/flow-plan.md` 11). It holds what a device holds (the
 * tasks, the to-dos and the flow log), ticks like the 15 s loop (writing the pin the engine asks for) and takes the
 * taps of a scripted user: Start, Done, Do this now, Call it a day, undo. Times are UTC so tests never depend on the
 * machine's timezone.
 */
import {
	flow,
	type FlowLogRow,
	type FlowSettings,
	type FlowState,
	type FlowTask,
	type FlowTodo
} from '#lib/flow.js';
import { Priority, TaskStatus } from '#lib/types.js';

export const DAY = '2026-10-14';
export const DAY_START_MS = Date.parse(`${DAY}T00:00:00Z`);

export const SETTINGS: FlowSettings = { myDayStart: 7 * 60, myDayEnd: 23 * 60, overrunMinutes: 15 };

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
			nowMs: at(this.minute),
			at,
			tasks: this.tasks,
			todos: this.todos,
			log: this.log,
			settings: this.settings
		});
	}

	/** One tick like a device's: pins what the engine asks for, then answers. */
	tick(): FlowState<FlowTask, FlowTodo> {
		const state = this.peek();
		if (state.pin && !this.log.some((row) => row.key === state.pin!.key))
			this.write('pin', { todoId: state.pin.todoId, key: state.pin.key });
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
		fields: { todoId?: number; key?: string; data?: Record<string, unknown> } = {}
	) {
		const row: FlowLogRow = {
			id: this.nextRow++,
			at: at(this.minute),
			type,
			todoId: fields.todoId ?? null,
			data: fields.data ?? {},
			key: fields.key ?? null
		};
		this.log.push(row);
		return row;
	}

	start = () => this.write('start');
	choose = (todoId: number) => this.write('choose', { todoId });
	callItADay = () => this.write('rest');
	undo = (ref: number) => this.write('undo', { data: { ref } });

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
