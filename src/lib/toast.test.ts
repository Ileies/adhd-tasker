/// <reference types="bun" />
import { afterEach, describe, expect, jest, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { dismissToast, showToast } from '#lib/toast.js';

afterEach(() => {
	dismissToast();
	jest.useRealTimers();
});

describe('toast', () => {
	test('shows the message with its undo', () => {
		const undo = () => {};
		showToast('Done: Write', undo);
		expect(tasker.toast).toEqual({ message: 'Done: Write', undo });
	});

	test('goes away after 8 seconds', () => {
		jest.useFakeTimers();
		showToast('Done: Write');
		jest.advanceTimersByTime(7999);
		expect(tasker.toast).not.toBeNull();
		jest.advanceTimersByTime(1);
		expect(tasker.toast).toBeNull();
	});

	test('a newer toast replaces the older one and restarts the wait', () => {
		jest.useFakeTimers();
		showToast('first');
		jest.advanceTimersByTime(5000);
		showToast('second');
		jest.advanceTimersByTime(5000);
		expect(tasker.toast?.message).toBe('second');
		jest.advanceTimersByTime(3000);
		expect(tasker.toast).toBeNull();
	});
});
