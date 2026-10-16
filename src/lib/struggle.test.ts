/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	COOL_DOWN_MINUTES,
	FACE_ANSWERS,
	FACE_IT_MINUTES,
	LONG_BREAK_MINUTES,
	LOW_ENERGY_MINUTES,
	coolingAt,
	elsePlan,
	faceLine,
	heldStep,
	isFaceAnswer,
	isFreshSession,
	ladderEvents,
	ladderOf,
	lowEnergyAt,
	needsFaceIt,
	parseStepData,
	planStep,
	skipPatch,
	stepData,
	stepsOf,
	takesEffectAt,
	type PlanInput,
	type StruggleRow
} from '#lib/struggle.js';

const MIN = 60_000;
let nextId = 1;
const row = (
	type: StruggleRow['type'],
	minute: number,
	todoId: number | null = null,
	data: Record<string, unknown> = {}
): StruggleRow => ({ id: nextId++, at: minute * MIN, type, todoId, data });

const rotate = (minute: number, todoId: number, data: Record<string, unknown> = {}) =>
	row('rotate', minute, todoId, { why: 'unfocused', ...data });
const unfocused = (minute: number, todoId = 1) =>
	row('check', minute, todoId, { before: 0, after: 0, minutes: 30, pace: 'unfocused' });
const good = (minute: number, todoId = 1) =>
	row('check', minute, todoId, { before: 0, after: 20, minutes: 30 });
const lowEnergy = (minute: number, todoId = 1) =>
	row('stuck', minute, todoId, { reason: 'low-energy' });
const brk = (minute: number) => row('break', minute, null, { minutes: 10 });

describe('takesEffectAt', () => {
	test('a row takes effect when it was written, a held one 5 minutes later', () => {
		expect(takesEffectAt({ at: 10 * MIN, data: {} })).toBe(10 * MIN);
		expect(takesEffectAt({ at: 10 * MIN, data: { after: 5 * MIN } })).toBe(15 * MIN);
	});

	test('a hold is never longer than 5 minutes, whatever the row says', () => {
		expect(takesEffectAt({ at: 0, data: { after: 99 * MIN } })).toBe(5 * MIN);
		expect(takesEffectAt({ at: 0, data: { after: -4 } })).toBe(0);
	});
});

describe('stepsOf', () => {
	test('keeps the rotations and breaks in the order they take effect', () => {
		const held = rotate(10, 1, { after: 5 * MIN });
		const plain = brk(18);
		const early = rotate(3, 2);
		const steps = stepsOf([plain, held, early, row('start', 0)]);
		expect(steps.map((step) => step.row.id)).toEqual([early.id, held.id, plain.id]);
		expect(steps.map((step) => step.at)).toEqual([3 * MIN, 15 * MIN, 18 * MIN]);
	});

	test('a held rotation waits for its 5 minutes when nothing else happened', () => {
		expect(stepsOf([row('start', 0), rotate(10, 1, { after: 5 * MIN })])).toHaveLength(1);
	});

	test.each([
		['a check was answered', [good(12)], []],
		['a to-do was finished', [], [12 * MIN]],
		['the user chose another to-do', [row('choose', 12, 2)], []],
		['the user took a break', [brk(12)], []],
		['the user pushed another one away', [rotate(12, 2)], []]
	] as const)('is dropped when %s meanwhile', (_name, others, doneAts) => {
		const held = rotate(10, 1, { after: 5 * MIN });
		const kept = stepsOf([held, ...others], doneAts).filter((step) => step.row.id === held.id);
		expect(kept).toEqual([]);
	});

	test('an answer after it took effect does not undo it', () => {
		const held = rotate(10, 1, { after: 5 * MIN });
		expect(stepsOf([held, good(16)]).filter((step) => step.row.id === held.id)).toHaveLength(1);
	});
});

describe('coolingAt', () => {
	const steps = stepsOf([rotate(10, 1)]);

	test('the to-do left is cooling down from then for an hour', () => {
		expect(coolingAt(steps, 9 * MIN).size).toBe(0);
		expect([...coolingAt(steps, 10 * MIN)]).toEqual([1]);
		expect([...coolingAt(steps, (10 + COOL_DOWN_MINUTES - 1) * MIN)]).toEqual([1]);
		expect(coolingAt(steps, (10 + COOL_DOWN_MINUTES) * MIN).size).toBe(0);
	});

	test('a break after it clears every cool down', () => {
		const withBreak = stepsOf([rotate(10, 1), rotate(15, 2), brk(20)]);
		expect([...coolingAt(withBreak, 19 * MIN)].sort()).toEqual([1, 2]);
		expect(coolingAt(withBreak, 20 * MIN).size).toBe(0);
	});

	test('a break before it clears nothing', () => {
		expect([...coolingAt(stepsOf([brk(5), rotate(10, 1)]), 11 * MIN)]).toEqual([1]);
	});

	test('a held rotation cools down only once it took effect', () => {
		const held = stepsOf([rotate(10, 1, { after: 5 * MIN })]);
		expect(coolingAt(held, 12 * MIN).size).toBe(0);
		expect([...coolingAt(held, 15 * MIN)]).toEqual([1]);
	});
});

describe('lowEnergyAt', () => {
	test('is the hour after a rotation that asked for it', () => {
		const steps = stepsOf([rotate(10, 1, { low: true })]);
		expect(lowEnergyAt(steps, 9 * MIN)).toBe(false);
		expect(lowEnergyAt(steps, 10 * MIN)).toBe(true);
		expect(lowEnergyAt(steps, (10 + LOW_ENERGY_MINUTES) * MIN)).toBe(false);
	});

	test('an ordinary rotation does not start it', () => {
		expect(lowEnergyAt(stepsOf([rotate(10, 1)]), 11 * MIN)).toBe(false);
	});
});

describe('heldStep', () => {
	test('is the step that waits, until it takes effect', () => {
		const steps = stepsOf([rotate(10, 1, { after: 5 * MIN })]);
		expect(heldStep(steps, 9 * MIN)).toBeNull();
		expect(heldStep(steps, 12 * MIN)?.until).toBe(15 * MIN);
		expect(heldStep(steps, 15 * MIN)).toBeNull();
	});

	test('a step that is not held never waits', () => {
		expect(heldStep(stepsOf([rotate(10, 1)]), 10 * MIN)).toBeNull();
	});
});

describe('the ladder', () => {
	const ladder = (rows: StruggleRow[], doneAts: number[] = []) =>
		ladderOf(ladderEvents(rows, doneAts));

	test('counts struggles since the day began', () => {
		expect(ladder([row('start', 0), unfocused(30), unfocused(45)])).toEqual({
			struggles: 2,
			afterBreak: false
		});
	});

	test('a good answer starts the count again', () => {
		expect(ladder([row('start', 0), unfocused(30), good(60), unfocused(90)]).struggles).toBe(1);
	});

	test('so does finishing something', () => {
		expect(ladder([row('start', 0), unfocused(30)], [40 * MIN]).struggles).toBe(0);
	});

	test('a slow answer that is not a struggle changes nothing', () => {
		const slow = row('check', 30, 1, { before: 0, after: 0, minutes: 30, slow: true });
		expect(ladder([row('start', 0), unfocused(15), slow]).struggles).toBe(1);
	});

	test('a break starts the count again and the low energy column applies', () => {
		expect(ladder([row('start', 0), unfocused(30), brk(31)])).toEqual({
			struggles: 0,
			afterBreak: true
		});
		expect(ladder([row('start', 0), brk(31), unfocused(60)])).toEqual({
			struggles: 1,
			afterBreak: true
		});
	});

	test('presence starting again ends it all', () => {
		expect(ladder([row('start', 0), brk(5), unfocused(30), row('start', 120)])).toEqual({
			struggles: 0,
			afterBreak: false
		});
	});

	test('"I lost energy for this" is a struggle', () => {
		expect(ladder([row('start', 0), lowEnergy(10)]).struggles).toBe(1);
	});

	test('the first "I cannot get started" on a to-do is not, the second is', () => {
		const stuck = (minute: number, todoId: number) =>
			row('stuck', minute, todoId, { reason: 'cant-start' });
		expect(ladder([row('start', 0), stuck(5, 1)]).struggles).toBe(0);
		expect(ladder([row('start', 0), stuck(5, 1), stuck(30, 2)]).struggles).toBe(0);
		expect(ladder([row('start', 0), stuck(5, 1), stuck(30, 1)]).struggles).toBe(1);
	});

	test('the third "Something else" within half an hour is a struggle, slower ones are not', () => {
		const other = (minute: number) => rotate(minute, 1, { why: 'else' });
		expect(ladder([row('start', 0), other(5), other(10)]).struggles).toBe(0);
		expect(ladder([row('start', 0), other(5), other(10), other(20)]).struggles).toBe(1);
		expect(ladder([row('start', 0), other(5), other(20), other(40)]).struggles).toBe(0);
	});

	test('the rotations a struggle caused are not struggles of their own', () => {
		expect(ladder([row('start', 0), unfocused(30), rotate(30, 1)]).struggles).toBe(1);
	});

	test('"I was working on it" is presence starting again', () => {
		const worked = row('check', 90, 1, { before: 0, after: 10, minutes: 60, worked: true });
		expect(ladder([row('start', 0), unfocused(30), worked]).struggles).toBe(0);
	});
});

describe('planStep: the ladder before any break', () => {
	const input = (patch: Partial<PlanInput> = {}): PlanInput => ({
		rows: [row('start', 0)],
		trigger: 'unfocused',
		todoId: 1,
		nowMs: 30 * MIN,
		sessionStart: 0,
		others: 2,
		breakMinutes: 10,
		...patch
	});

	test('the first struggle rotates', () => {
		expect(planStep(input())).toEqual({ step: 'rotate', low: false, hold: false });
	});

	test('the second rotates again', () => {
		expect(planStep(input({ rows: [row('start', 0), unfocused(30), rotate(30, 1)] }))).toEqual({
			step: 'rotate',
			low: false,
			hold: false
		});
	});

	test('the third is a break of the usual length', () => {
		const rows = [row('start', 0), unfocused(30), unfocused(45, 2)];
		expect(planStep(input({ rows, breakMinutes: 15 }))).toEqual({
			step: 'break',
			minutes: 15,
			last: false,
			hold: false
		});
	});

	test('with nothing to rotate to, the rotation is the break', () => {
		expect(planStep(input({ others: 0 }))).toMatchObject({ step: 'break', minutes: 10 });
	});
});

describe('planStep: the ladder after a break', () => {
	const afterBreak = [row('start', 0), brk(40)];
	const input = (patch: Partial<PlanInput> = {}): PlanInput => ({
		rows: afterBreak,
		trigger: 'unfocused',
		todoId: 1,
		nowMs: 70 * MIN,
		sessionStart: 50 * MIN,
		others: 2,
		breakMinutes: 10,
		...patch
	});

	test('the first struggle rotates and the hour picks short to-dos', () => {
		expect(planStep(input())).toEqual({ step: 'rotate', low: true, hold: false });
	});

	test('the second is a long break with something physical, then the question about the day', () => {
		const rows = [...afterBreak, unfocused(60)];
		expect(planStep(input({ rows }))).toEqual({
			step: 'break',
			minutes: LONG_BREAK_MINUTES,
			last: true,
			hold: false
		});
	});

	test('a third does the same', () => {
		const rows = [...afterBreak, unfocused(60), unfocused(65, 2)];
		expect(planStep(input({ rows }))).toMatchObject({ step: 'break', last: true });
	});

	test('with nothing to rotate to, the first one is the usual break', () => {
		expect(planStep(input({ others: 0 }))).toMatchObject({
			step: 'break',
			minutes: 10,
			last: false
		});
	});
});

describe('planStep: what does not count', () => {
	const base = {
		rows: [row('start', 0)],
		todoId: 1,
		nowMs: 30 * MIN,
		sessionStart: 0,
		others: 2,
		breakMinutes: 10
	};

	test('the first "I cannot get started" on a to-do is only a hint and a timer', () => {
		expect(planStep({ ...base, trigger: 'cant-start' })).toBeNull();
	});

	test('the second one is a struggle', () => {
		const rows = [row('start', 0), row('stuck', 5, 1, { reason: 'cant-start' })];
		expect(planStep({ ...base, rows, trigger: 'cant-start' })).toMatchObject({ step: 'rotate' });
	});

	test('"Something else" is a struggle only the third time within half an hour', () => {
		const other = (minute: number) => rotate(minute, 1, { why: 'else' });
		expect(planStep({ ...base, trigger: 'else' })).toBeNull();
		const third = planStep({
			...base,
			rows: [row('start', 0), other(5), other(10)],
			trigger: 'else',
			nowMs: 20 * MIN
		});
		expect(third).toMatchObject({ step: 'rotate' });
	});
});

describe('Give it 5 minutes first', () => {
	const input = (patch: Partial<PlanInput> = {}): PlanInput => ({
		rows: [row('start', 0)],
		trigger: 'else',
		todoId: 1,
		nowMs: 2 * MIN,
		sessionStart: 0,
		others: 2,
		breakMinutes: 10,
		...patch
	});

	test('"Something else" in the first minutes of a fresh to-do is held', () => {
		expect(elsePlan(input())).toEqual({ step: 'rotate', low: false, hold: true });
	});

	test('so is "I lost energy for this"', () => {
		expect(planStep(input({ trigger: 'low-energy' }))).toMatchObject({
			step: 'rotate',
			hold: true
		});
	});

	test('after the first 5 minutes the switch happens at once', () => {
		expect(elsePlan(input({ nowMs: 6 * MIN }))).toMatchObject({ hold: false });
		expect(isFreshSession(0, 4 * MIN + 59_000)).toBe(true);
		expect(isFreshSession(0, 5 * MIN)).toBe(false);
	});

	test('a to-do that struggled today is not held, the user already tried', () => {
		const rows = [row('start', 0), unfocused(30, 1), rotate(30, 1)];
		expect(elsePlan(input({ rows, nowMs: 62 * MIN, sessionStart: 60 * MIN }))).toMatchObject({
			hold: false
		});
	});

	test('"I couldn\'t focus" after a check is never held, it came after a whole session', () => {
		expect(planStep(input({ trigger: 'unfocused' }))).toMatchObject({ hold: false });
	});

	test('a break is never held', () => {
		expect(elsePlan(input({ others: 0 }))).toMatchObject({ step: 'break', hold: false });
	});
});

describe('stepData', () => {
	test('a rotation says why, whether a low energy hour follows and whether it is held', () => {
		expect(stepData({ step: 'rotate', low: true, hold: true }, 'else')).toEqual({
			why: 'else',
			low: true,
			after: 5 * MIN
		});
		expect(stepData({ step: 'rotate', low: false, hold: false }, 'unfocused')).toEqual({
			why: 'unfocused'
		});
	});

	test('a break says how long and whether it ends the day', () => {
		expect(stepData({ step: 'break', minutes: 20, last: true, hold: false }, 'unfocused')).toEqual({
			why: 'unfocused',
			minutes: 20,
			last: true
		});
	});

	test('what it writes is what the validator takes', () => {
		for (const plan of [
			{ step: 'rotate', low: true, hold: true },
			{ step: 'break', minutes: 10, last: false, hold: false }
		] as const) {
			const data = stepData(plan, 'low-energy');
			const parsed = parseStepData(plan.step, data);
			expect(parsed).toEqual({ ok: true, value: data });
		}
	});
});

describe('parseStepData', () => {
	test('unknown keys are dropped', () => {
		expect(parseStepData('rotate', { why: 'else', extra: 'x' })).toEqual({
			ok: true,
			value: { why: 'else' }
		});
		expect(parseStepData('back', { anything: 1 })).toEqual({ ok: true, value: {} });
	});

	test.each([
		['a rotation without a reason', 'rotate', {}],
		['a rotation for a made up reason', 'rotate', { why: 'bored' }],
		['a hold of ten minutes', 'rotate', { why: 'else', after: 10 * MIN }],
		['low set to false', 'rotate', { why: 'else', low: false }],
		['a break without minutes', 'break', {}],
		['a break of no minutes', 'break', { minutes: 0 }],
		['a break of two hours', 'break', { minutes: 120 }],
		['a break of half a minute', 'break', { minutes: 0.5 }],
		['an activity that is not a word', 'break', { minutes: 10, activity: 'x'.repeat(40) }],
		['last set to false', 'break', { minutes: 10, last: false }],
		['a stuck tap without a reason', 'stuck', {}],
		['a stuck tap for a made up reason', 'stuck', { reason: 'bored' }],
		['a face it answer for nothing', 'face', { answer: 'later' }]
	] as const)('refuses %s', (_name, type, data) => {
		expect(parseStepData(type, data).ok).toBe(false);
	});

	test.each([
		['a break', 'break', { minutes: 10, activity: 'water', why: 'stuck' }],
		['a held rotation', 'rotate', { why: 'low-energy', after: 5 * MIN }],
		['a stuck tap', 'stuck', { reason: 'break' }],
		['a face it answer', 'face', { answer: 'fine' }]
	] as const)('takes %s', (_name, type, data) => {
		expect(parseStepData(type, data)).toEqual({ ok: true, value: data });
	});
});

describe('Face it', () => {
	test('one more skip, and the day the run began', () => {
		expect(skipPatch({ skips: 0, skipSince: null }, '2026-10-14')).toEqual({
			skips: 1,
			skipSince: '2026-10-14'
		});
		expect(skipPatch({ skips: 2, skipSince: '2026-10-12' }, '2026-10-14')).toEqual({
			skips: 3,
			skipSince: '2026-10-12'
		});
	});

	test.each([
		['pushed away twice', { skips: 2, skipSince: '2026-10-12' }, false],
		['three times on one day', { skips: 3, skipSince: '2026-10-14' }, false],
		['three times over two days', { skips: 3, skipSince: '2026-10-13' }, true],
		['many times, long ago', { skips: 9, skipSince: '2026-09-01' }, true],
		['a to-do that never was', { skips: 0, skipSince: null }, false],
		['a to-do from before the count existed', {}, false]
	] as const)('%s is faced: %p', (_name, todo, faced) => {
		expect(needsFaceIt(todo, '2026-10-14')).toBe(faced);
	});

	test('the line says how often and how long', () => {
		expect(faceLine('Study B', 3)).toBe(
			`Study B was pushed away 3 times. ${FACE_IT_MINUTES} minutes now, then you decide.`
		);
	});

	test('there are four answers and the validator knows them all', () => {
		expect(FACE_ANSWERS.map((entry) => entry.answer)).toEqual(['smaller', 'fine', 'move', 'drop']);
		for (const { answer } of FACE_ANSWERS) expect(isFaceAnswer(answer)).toBe(true);
		expect(isFaceAnswer('later')).toBe(false);
	});
});
