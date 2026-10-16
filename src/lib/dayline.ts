/**
 * Today in two lines for the assistant (`docs/flow-plan.md` 9): what the flow engine has current right now, and what the
 * user has answered so far. It lets a reaction see that someone is away or struggling without reading the whole log.
 * Pure. Titles are the user's data, so they are quoted.
 */
import type { Current, FlowLogRow } from '#lib/flow.js';
import { formatMinutes } from '#lib/format.js';

const quoted = (title: string) => `"${title}"`;
const minutesUntil = (ms: number, nowMs: number) => Math.max(0, Math.round((ms - nowMs) / 60_000));

/** What is current now, in one sentence. */
export function describeCurrent(
	current: Current<{ title: string }, { title: string }>,
	nowMs: number,
	checkWaiting = false
): string {
	const line = (() => {
		switch (current.kind) {
			case 'task':
				return `${quoted(current.task.title)} is on, ${formatMinutes(current.left)} left`;
			case 'time-up':
				return `time is up for ${quoted(current.ended.title)}, over by ${formatMinutes(current.over)} and not answered`;
			case 'todo':
				return `a ${current.face ? 'Face it ' : ''}session on the to-do ${quoted(current.todo.title)}, ${formatMinutes(minutesUntil(current.session.end, nowMs))} until the check`;
			case 'break':
				return current.todo
					? `the break is over, the question is whether to go back to ${quoted(current.todo.title)}`
					: `a ${formatMinutes(current.minutes)} break (${current.activity})`;
			case 'ready':
				return `${quoted(current.next.title)} starts in under 10 minutes`;
			case 'away':
				return current.since === null
					? 'the day has not been started yet'
					: 'the user is away, a check went unanswered';
			case 'plan':
				return 'nothing is open, the app asks what is next';
			case 'rest':
				return current.why === 'night' ? 'it is night, My day is over' : 'the user called it a day';
		}
	})();
	return `Right now: ${line}${checkWaiting ? '. A question is waiting for an answer' : ''}`;
}

const COUNTED: { type: FlowLogRow['type']; one: string; many: string }[] = [
	{ type: 'pin', one: 'session', many: 'sessions' },
	{ type: 'check', one: 'check answered', many: 'checks answered' },
	{ type: 'rotate', one: 'switch to another to-do', many: 'switches to another to-do' },
	{ type: 'break', one: 'break', many: 'breaks' },
	{ type: 'stuck', one: 'time pressing stuck', many: 'times pressing stuck' },
	{ type: 'face', one: 'Face it answered', many: 'Face it answered' }
];

/** What the user answered today, counted. */
export function describeLog(log: Pick<FlowLogRow, 'type'>[]): string {
	const counts = COUNTED.map(({ type, one, many }) => {
		const n = log.filter((row) => row.type === type).length;
		return n === 0 ? null : `${n} ${n === 1 ? one : many}`;
	}).filter((part): part is string => part !== null);
	return `Today so far: ${counts.length ? counts.join(', ') : 'nothing answered yet'}`;
}
