/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { groupByDay } from '#lib/activityview.js';

const at = (iso: string) => Date.parse(iso);

describe('groupByDay', () => {
	const now = at('2026-10-15T12:00:00Z');

	test('newest first, one group per day, titled in words', () => {
		const groups = groupByDay(
			[
				{ at: at('2026-10-14T09:00:00Z'), id: 1 },
				{ at: at('2026-10-15T08:00:00Z'), id: 2 },
				{ at: at('2026-10-15T10:00:00Z'), id: 3 },
				{ at: at('2026-10-10T10:00:00Z'), id: 4 }
			],
			now,
			'UTC'
		);
		expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
			['Today', [3, 2]],
			['Yesterday', [1]],
			['Sat, Oct 10', [4]]
		]);
	});

	test('the day is the one in the user timezone', () => {
		const groups = groupByDay([{ at: at('2026-10-15T23:30:00Z') }], now, 'Asia/Tokyo');
		expect(groups[0].title).toBe('Tomorrow');
	});

	test('nothing gives no groups', () => {
		expect(groupByDay([], now, 'UTC')).toEqual([]);
	});
});
