/// <reference types="bun" />
import { afterEach, describe, expect, jest, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { dismissToast, errorText, showToast } from '#lib/toast.js';

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

	test('a toast with a longer window stays for that long', () => {
		jest.useFakeTimers();
		showToast('Everything will be deleted', () => {}, 10_000);
		jest.advanceTimersByTime(9999);
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

describe('errorText', () => {
	test('uses the message of an error', () => {
		expect(errorText(new Error('title is required'), 'Could not add')).toBe('title is required');
	});

	test('falls back when there is no message to show', () => {
		expect(errorText(new Error(''), 'Could not add')).toBe('Could not add');
		expect(errorText('boom', 'Could not add')).toBe('Could not add');
	});
});
