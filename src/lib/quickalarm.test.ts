/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { parseQuickAlarm, quickAlarmFields, quickAlarmPreview } from '#lib/quickalarm.js';

describe('parseQuickAlarm', () => {
	test.each([
		['Wake up 7:00', { label: 'Wake up', time: 420, inMinutes: null, repeat: 'none' }],
		['Meds 8am daily', { label: 'Meds', time: 480, inMinutes: null, repeat: 'daily' }],
		[
			'Standup at 9:30 weekdays',
			{ label: 'Standup', time: 570, inMinutes: null, repeat: 'weekdays' }
		],
		['Gym every weekday 6pm', { label: 'Gym', time: 1080, inMinutes: null, repeat: 'weekdays' }],
		['Tea in 5 min', { label: 'Tea', time: null, inMinutes: 5, repeat: 'none' }],
		['Oven in 1h30m', { label: 'Oven', time: null, inMinutes: 90, repeat: 'none' }],
		['Laundry in 1.5h', { label: 'Laundry', time: null, inMinutes: 90, repeat: 'none' }]
	])('%s', (text, expected) => {
		expect(parseQuickAlarm(text)).toEqual(expected as ReturnType<typeof parseQuickAlarm>);
	});

	test('a timer cannot repeat', () => {
		expect(parseQuickAlarm('Tea daily in 5 min').repeat).toBe('none');
	});

	test('a line without a label is called Alarm', () => {
		expect(parseQuickAlarm('7:00').label).toBe('Alarm');
	});

	test('a duration alone is not a time', () => {
		expect(parseQuickAlarm('Stretch 45m').time).toBeNull();
	});
});

describe('quickAlarmFields', () => {
	test('a clock alarm rings at the 24 hour time with the wake tone', () => {
		expect(quickAlarmFields('Wake up 7am weekdays')).toEqual({
			at: '07:00',
			label: 'Wake up',
			tone: 'wake',
			repeat: 'weekdays'
		});
	});

	test('a wait makes a timer', () => {
		expect(quickAlarmFields('Tea in 5 min')).toEqual({
			in_minutes: 5,
			label: 'Tea',
			tone: 'chime',
			repeat: 'none'
		});
	});

	test('a line without a time makes no alarm', () => {
		expect(quickAlarmFields('Call mum')).toBeNull();
	});
});

describe('quickAlarmPreview', () => {
	test('says what will ring and when', () => {
		expect(quickAlarmPreview('Tea in 5 min')).toBe('Rings in 5 min');
		expect(quickAlarmPreview('Meds 8:00 daily')).toContain('every day');
	});

	test('is empty until the line names a time', () => {
		expect(quickAlarmPreview('Meds')).toBeNull();
	});
});
