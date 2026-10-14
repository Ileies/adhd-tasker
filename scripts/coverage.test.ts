import { describe, expect, test } from 'bun:test';
import { coverageFailures, overallCoverage, percent } from './coverage.js';

const report = [
	'TN:',
	'SF:src/lib/a.ts',
	'FNF:4',
	'FNH:4',
	'DA:1,1',
	'LF:100',
	'LH:100',
	'end_of_record',
	'TN:',
	'SF:src/lib/b.ts',
	'FNF:1',
	'FNH:0',
	'LF:10',
	'LH:0',
	'end_of_record'
].join('\n');

describe('overallCoverage', () => {
	test('weighs every file by its lines and functions, not by a mean of percentages', () => {
		// The mean of the file percentages would be 50 % for both
		expect(overallCoverage(report)).toEqual({ lines: 100 / 110, functions: 4 / 5 });
	});

	test('an empty report counts as fully covered', () => {
		expect(overallCoverage('')).toEqual({ lines: 1, functions: 1 });
	});
});

describe('coverageFailures', () => {
	test('passes at the minimum', () => {
		expect(coverageFailures({ lines: 0.9, functions: 0.95 }, 0.9)).toEqual([]);
	});

	test('names each measure under the minimum', () => {
		expect(coverageFailures({ lines: 0.8912, functions: 0.85 }, 0.9)).toEqual([
			'lines 89.12 % is under the minimum of 90.00 %',
			'functions 85.00 % is under the minimum of 90.00 %'
		]);
	});
});

test('percent shows two decimals', () => {
	expect(percent(0.96758)).toBe('96.76 %');
	expect(percent(1)).toBe('100.00 %');
});
