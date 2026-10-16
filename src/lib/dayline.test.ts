/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { describeCurrent, describeLog } from '#lib/dayline.js';
import type { Current } from '#lib/flow.js';

type Item = { title: string };
type Now = Current<Item, Item>;

const study = { title: 'Study B' };
const exam = { title: 'Exam' };
const NOW = 1_000_000;

describe('describeCurrent', () => {
	test.each<[string, Now, string]>([
		[
			'a task',
			{ kind: 'task', task: exam, left: 80, wrapping: false },
			'Right now: "Exam" is on, 1 h 20 min left'
		],
		[
			'a task that ran out',
			{ kind: 'time-up', ended: exam, over: 7, current: null },
			'Right now: time is up for "Exam", over by 7 min and not answered'
		],
		[
			'a session on a to-do',
			{
				kind: 'todo',
				todo: study,
				session: { start: NOW, end: NOW + 20 * 60_000, length: 30 },
				face: false
			},
			'Right now: a session on the to-do "Study B", 20 min until the check'
		],
		[
			'a Face it session',
			{
				kind: 'todo',
				todo: study,
				session: { start: NOW, end: NOW + 600_000, length: 10 },
				face: true
			},
			'Right now: a Face it session on the to-do "Study B", 10 min until the check'
		],
		[
			'a break',
			{
				kind: 'break',
				start: NOW,
				end: NOW + 600_000,
				minutes: 10,
				activity: 'stretch',
				last: false,
				rowId: 1,
				todo: null
			},
			'Right now: a 10 min break (stretch)'
		],
		[
			'a break that is over',
			{
				kind: 'break',
				start: NOW,
				end: NOW + 600_000,
				minutes: 10,
				activity: 'stretch',
				last: false,
				rowId: 1,
				todo: study
			},
			'Right now: the break is over, the question is whether to go back to "Study B"'
		],
		[
			'a task that starts soon',
			{ kind: 'ready', next: exam },
			'Right now: "Exam" starts in under 10 minutes'
		],
		[
			'the morning',
			{ kind: 'away', since: null, todo: null, from: null },
			'Right now: the day has not been started yet'
		],
		[
			'away',
			{ kind: 'away', since: NOW, todo: study, from: NOW - 1000 },
			'Right now: the user is away, a check went unanswered'
		],
		['nothing open', { kind: 'plan' }, 'Right now: nothing is open, the app asks what is next'],
		['night', { kind: 'rest', why: 'night' }, 'Right now: it is night, My day is over'],
		['called it a day', { kind: 'rest', why: 'called' }, 'Right now: the user called it a day']
	])('%s', (_name, current, line) => {
		expect(describeCurrent(current, NOW)).toBe(line);
	});

	test('a check that waits is said', () => {
		expect(describeCurrent({ kind: 'plan' }, NOW, true)).toBe(
			'Right now: nothing is open, the app asks what is next. A question is waiting for an answer'
		);
	});

	test('a session past its end has no minutes left, never a negative number', () => {
		const late: Now = {
			kind: 'todo',
			todo: study,
			session: { start: NOW - 2_000_000, end: NOW - 1000, length: 30 },
			face: false
		};
		expect(describeCurrent(late, NOW)).toContain('0 min until the check');
	});
});

describe('describeLog', () => {
	test('counts what was answered, singular and plural', () => {
		const rows = [
			'pin',
			'pin',
			'pin',
			'check',
			'rotate',
			'break',
			'stuck',
			'stuck',
			'face',
			'start',
			'back'
		].map((type) => ({ type }) as { type: never });
		expect(describeLog(rows)).toBe(
			'Today so far: 3 sessions, 1 check answered, 1 switch to another to-do, 1 break, 2 times pressing stuck, 1 Face it answered'
		);
	});

	test('a quiet day says so', () => {
		expect(describeLog([])).toBe('Today so far: nothing answered yet');
		expect(describeLog([{ type: 'start' }])).toBe('Today so far: nothing answered yet');
	});
});
