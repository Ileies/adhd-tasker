/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import {
	ANSWER_GRACE_MINUTES,
	checkChips,
	checkPatch,
	chipLabel,
	parseCheckData,
	expectedGain,
	followUp,
	isGoodAnswer,
	isPace,
	isSlow,
	learnedSize,
	MAX_SESSION_MINUTES,
	MAX_WORKED_MINUTES,
	sessionMinutes,
	sessionSpent,
	stepTargets,
	workedMinutes
} from '#lib/checks.js';

const MIN = 60_000;

describe('sessionMinutes', () => {
	test.each([
		['a warm-up is 15 minutes', { checkMinutes: 30, warm: true, good: 0 }, 15],
		['a warm-up is never longer than the interval', { checkMinutes: 15, warm: true, good: 5 }, 15],
		['a warm-up with a shorter interval', { checkMinutes: 10, warm: true, good: 0 }, 10],
		['the interval is the normal length', { checkMinutes: 30, warm: false, good: 0 }, 30],
		['one good answer is not enough', { checkMinutes: 30, warm: false, good: 1 }, 30],
		[
			'two good answers make it one and a half times as long',
			{ checkMinutes: 30, warm: false, good: 2 },
			45
		],
		[
			'but never more than an hour',
			{ checkMinutes: 60, warm: false, good: 3 },
			MAX_SESSION_MINUTES
		],
		['after a struggle it is a warm-up again', { checkMinutes: 45, warm: true, good: 2 }, 15]
	])('%s', (_name, input, minutes) => {
		expect(sessionMinutes(input)).toBe(minutes);
	});
});

describe('time spent', () => {
	test('a session counts from its start to its answer', () => {
		expect(sessionSpent(0, 20 * MIN, 30)).toBe(20);
	});

	test('a check that waited counts the length plus the grace, no more', () => {
		expect(sessionSpent(0, 90 * MIN, 30)).toBe(30 + ANSWER_GRACE_MINUTES);
	});

	test('an answer before the start counts nothing', () => {
		expect(sessionSpent(10 * MIN, 5 * MIN, 30)).toBe(0);
	});

	test('time away counts after "I was working on it", up to two hours', () => {
		expect(workedMinutes(0, 50 * MIN)).toBe(50);
		expect(workedMinutes(0, 5 * 3_600_000)).toBe(MAX_WORKED_MINUTES);
	});
});

describe('the answers offered', () => {
	test('around the expected gain, in 5 % steps', () => {
		// 30 min of a 5 h to-do is 10 %: half, the gain and double
		expect(expectedGain(30, 300)).toBeCloseTo(10);
		expect(stepTargets(20, 30, 300)).toEqual([25, 30, 40]);
	});

	test('duplicates are merged, a big to-do offers one small step', () => {
		expect(stepTargets(0, 30, 900)).toEqual([5]);
	});

	test('without a size the steps are 5, 10 and 20', () => {
		expect(expectedGain(30, null)).toBeNull();
		expect(stepTargets(10, 30, null)).toEqual([15, 20, 30]);
	});

	test('never more than 95 %, Done is for finishing', () => {
		expect(stepTargets(90, 30, null)).toEqual([95]);
		expect(stepTargets(95, 30, null)).toEqual([]);
		expect(stepTargets(100, 30, 60)).toEqual([]);
	});

	test('the chips start with Keep going, then no change, then the steps', () => {
		expect(checkChips({ progress: 20, minutes: 30, size: 300, keeps: 0 })).toEqual([
			{ kind: 'keep' },
			{ kind: 'same', progress: 20 },
			{ kind: 'step', progress: 25 },
			{ kind: 'step', progress: 30 },
			{ kind: 'step', progress: 40 }
		]);
	});

	test('Keep going is offered twice in a row, the third check wants a number', () => {
		const kinds = (keeps: number) =>
			checkChips({ progress: 0, minutes: 30, size: null, keeps }).map((chip) => chip.kind);
		expect(kinds(1)).toContain('keep');
		expect(kinds(2)).not.toContain('keep');
		expect(kinds(2)).toContain('same');
	});

	test('every step is above the progress and the list is sorted, for any to-do', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 1, max: 120 }),
				fc.option(fc.integer({ min: 1, max: 30_000 }), { nil: null }),
				(progress, minutes, size) => {
					const steps = stepTargets(progress, minutes, size);
					expect(steps).toEqual([...steps].sort((a, b) => a - b));
					expect(new Set(steps).size).toBe(steps.length);
					for (const step of steps) {
						expect(step).toBeGreaterThan(progress);
						expect(step).toBeLessThanOrEqual(95);
					}
				}
			)
		);
	});
});

describe('chipLabel', () => {
	test('says what a chip does, a step says the progress it sets', () => {
		expect(chipLabel({ kind: 'keep' })).toBe('Keep going');
		expect(chipLabel({ kind: 'same', progress: 20 })).toBe('No change');
		expect(chipLabel({ kind: 'step', progress: 35 })).toBe('35 %');
	});
});

describe('parseCheckData', () => {
	test('takes the answer and drops what only the recorder may say', () => {
		expect(parseCheckData({ before: 10, after: 20, minutes: 30, slow: true, extra: 1 })).toEqual({
			ok: true,
			value: { before: 10, after: 20, minutes: 30 }
		});
	});

	test('keeps the optional parts that are valid', () => {
		expect(
			parseCheckData({
				before: 0,
				after: 0,
				minutes: 5,
				keep: true,
				pace: 'hard',
				size: null,
				worked: true
			})
		).toEqual({
			ok: true,
			value: { before: 0, after: 0, minutes: 5, keep: true, pace: 'hard', size: null, worked: true }
		});
	});

	test.each([[null], [[]], ['x'], [3]])('%p is not an answer', (value) => {
		expect(parseCheckData(value).ok).toBe(false);
	});
});

describe('slow progress', () => {
	test.each([
		['no change on a to-do with a size', { before: 20, after: 20, minutes: 30, size: 300 }, true],
		[
			'a gain below half of the expected one',
			{ before: 20, after: 24, minutes: 30, size: 300 },
			true
		],
		[
			'half of the expected gain is not slow',
			{ before: 20, after: 25, minutes: 30, size: 300 },
			false
		],
		['a big gain', { before: 20, after: 50, minutes: 30, size: 300 }, false],
		[
			'without a size there is nothing to compare',
			{ before: 0, after: 0, minutes: 30, size: null },
			false
		],
		['a session of no minutes is not judged', { before: 0, after: 0, minutes: 0, size: 300 }, false]
	])('%s', (_name, input, slow) => {
		expect(isSlow(input)).toBe(slow);
	});
});

describe('what is asked after an answer', () => {
	const base = { before: 20, after: 20, minutes: 30, size: 300, sizeAsked: false };

	test('a slow answer with a size asks for the reason, once', () => {
		expect(followUp(base)).toBe('pace');
	});

	test('a normal answer asks nothing', () => {
		expect(followUp({ ...base, after: 40 })).toBeNull();
	});

	test('a to-do without a size is asked how big it is, at its first check', () => {
		expect(followUp({ ...base, size: null, after: 40 })).toBe('size');
	});

	test('"Not sure" is an answer: the size is not asked again and the pace has nothing to compare', () => {
		expect(followUp({ ...base, size: null, sizeAsked: true })).toBeNull();
	});

	test('finishing asks nothing', () => {
		expect(followUp({ ...base, after: 100, size: null })).toBeNull();
	});
});

describe('the learned size', () => {
	test('time spent divided by progress, in 5 minutes', () => {
		expect(learnedSize(90, 30)).toBe(300);
		expect(learnedSize(100, 30)).toBe(335);
	});

	test('nothing to divide before there is progress or time', () => {
		expect(learnedSize(0, 30)).toBeNull();
		expect(learnedSize(30, 0)).toBeNull();
	});

	test('never absurd: at least 5 minutes, at most the size limit', () => {
		expect(learnedSize(1, 100)).toBe(5);
		expect(learnedSize(100_000, 1)).toBe(30_000);
	});
});

describe('checkPatch', () => {
	const todo = { estimate: 300, spentMinutes: 60 };
	const answer = { before: 10, after: 20, minutes: 30 };

	test('the progress and the time spent are written', () => {
		expect(checkPatch(todo, answer)).toEqual({ progress: 20, spentMinutes: 90 });
	});

	test('Keep going adds the time and leaves the progress alone', () => {
		expect(checkPatch(todo, { ...answer, after: 10, keep: true })).toEqual({ spentMinutes: 90 });
	});

	test('"It\'s bigger than I thought" learns the size from the pace', () => {
		expect(checkPatch(todo, { ...answer, after: 20, pace: 'bigger' })).toEqual({
			progress: 20,
			spentMinutes: 90,
			estimate: 450,
			learned: true
		});
	});

	test('"bigger" never makes the to-do smaller', () => {
		const patch = checkPatch(
			{ estimate: 900, spentMinutes: 60 },
			{ ...answer, after: 50, pace: 'bigger' }
		);
		expect(patch.estimate).toBeUndefined();
	});

	test('the other reasons leave the size alone', () => {
		expect(checkPatch(todo, { ...answer, pace: 'unfocused' }).estimate).toBeUndefined();
		expect(checkPatch(todo, { ...answer, pace: 'hard' }).estimate).toBeUndefined();
	});

	test('a size the user gave is theirs, not learned', () => {
		expect(checkPatch({ estimate: null, spentMinutes: 0 }, { ...answer, size: 600 })).toMatchObject(
			{
				estimate: 600,
				learned: false
			}
		);
	});

	test('"Not sure" leaves the size unknown', () => {
		expect(
			checkPatch({ estimate: null, spentMinutes: 0 }, { ...answer, size: null }).estimate
		).toBeUndefined();
	});
});

describe('good answers', () => {
	test.each([
		['keep going', { keep: true }, true],
		['a normal gain', {}, true],
		['a slow gain', { slow: true }, false],
		['a struggle', { pace: 'unfocused' }, false],
		['a hard part, keep going', { pace: 'hard' }, true]
	] as const)('%s', (_name, data, good) => {
		expect(isGoodAnswer(data)).toBe(good);
	});

	test('the paces are the ones the hero offers', () => {
		expect(isPace('bigger')).toBe(true);
		expect(isPace('normal')).toBe(false);
	});
});
