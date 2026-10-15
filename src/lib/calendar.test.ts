/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import type { Backend } from '#lib/backend.js';
import { importCalendar, loadAllDay, startCalendarSync, syncCalendar } from '#lib/calendar.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { dismissToast } from '#lib/toast.js';

/** A backend whose calendar and reload answer as told, and which counts what was asked. */
function backendWith(calendar: Partial<Backend['calendar']>) {
	const asked = { sync: 0, reload: 0 };
	tasker.backend = {
		...remoteBackend,
		calendar: { ...remoteBackend.calendar, ...calendar },
		settings: { ...remoteBackend.settings, load: async () => tasker.settings },
		tasks: {
			...remoteBackend.tasks,
			since: async () => {
				asked.reload++;
				return [];
			}
		}
	};
	return asked;
}

beforeEach(() => {
	tasker.calendar.allDay = [];
});
afterEach(() => {
	tasker.backend = remoteBackend;
	dismissToast();
});

describe('loadAllDay', () => {
	test('keeps the lines of the day for Plan', async () => {
		backendWith({ allDay: async () => [{ date: '2026-10-20', title: 'Holiday' }] });
		await loadAllDay('2026-10-20');
		expect(tasker.calendar.allDay).toEqual([{ date: '2026-10-20', title: 'Holiday' }]);
	});

	test('a failed read leaves the line out', async () => {
		backendWith({
			allDay: async () => {
				throw new Error('offline');
			}
		});
		tasker.calendar.allDay = [{ date: 'x', title: 'old' }];
		await loadAllDay('2026-10-20');
		expect(tasker.calendar.allDay).toEqual([]);
	});
});

describe('syncCalendar', () => {
	test('reads the plan again only when it changed', async () => {
		let changed = false;
		const asked = backendWith({ sync: async () => changed });
		await syncCalendar();
		expect(asked.reload).toBe(0);
		changed = true;
		await syncCalendar();
		expect(asked.reload).toBe(1);
	});

	test('a failure is quiet', async () => {
		backendWith({
			sync: async () => {
				throw new Error('Link Google Calendar first');
			}
		});
		await syncCalendar();
		expect(tasker.toasts).toEqual([]);
	});

	test('starts at once and stops when told', async () => {
		let calls = 0;
		backendWith({
			sync: async () => {
				calls++;
				return false;
			}
		});
		const stop = startCalendarSync();
		await Bun.sleep(10);
		stop();
		expect(calls).toBe(1);
	});
});

describe('importCalendar', () => {
	test('reads the plan again and says what came in', async () => {
		const asked = backendWith({ import: async () => ({ tasks: 2, left: 0, allDay: 0 }) });
		expect(await importCalendar('all')).toBeNull();
		expect(asked.reload).toBe(1);
		expect(tasker.toasts.at(-1)?.message).toBe('2 tasks added to your plan.');
	});

	test('answers why it failed and changes nothing', async () => {
		const asked = backendWith({
			import: async () => {
				throw new Error('Look at the preview first');
			}
		});
		expect(await importCalendar('all')).toBe('Look at the preview first');
		expect(asked.reload).toBe(0);
	});
});
