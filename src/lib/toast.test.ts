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
		expect(tasker.toasts).toEqual([{ id: expect.any(Number), message: 'Done: Write', undo }]);
	});

	test('goes away after 8 seconds', () => {
		jest.useFakeTimers();
		showToast('Done: Write');
		jest.advanceTimersByTime(7999);
		expect(tasker.toasts).toHaveLength(1);
		jest.advanceTimersByTime(1);
		expect(tasker.toasts).toEqual([]);
	});

	test('a toast with a longer window stays for that long', () => {
		jest.useFakeTimers();
		showToast('Everything will be deleted', () => {}, 10_000);
		jest.advanceTimersByTime(9999);
		expect(tasker.toasts).toHaveLength(1);
		jest.advanceTimersByTime(1);
		expect(tasker.toasts).toEqual([]);
	});

	test('a newer toast stacks under the older one and each keeps its own wait', () => {
		jest.useFakeTimers();
		showToast('first');
		jest.advanceTimersByTime(5000);
		showToast('second');
		expect(tasker.toasts.map((t) => t.message)).toEqual(['first', 'second']);
		jest.advanceTimersByTime(3000);
		expect(tasker.toasts.map((t) => t.message)).toEqual(['second']);
		jest.advanceTimersByTime(5000);
		expect(tasker.toasts).toEqual([]);
	});

	test('the oldest makes room when more than four are showing', () => {
		for (const message of ['a', 'b', 'c', 'd', 'e']) showToast(message);
		expect(tasker.toasts.map((t) => t.message)).toEqual(['b', 'c', 'd', 'e']);
	});

	test('dismissing one leaves the others', () => {
		showToast('a');
		showToast('b');
		dismissToast(tasker.toasts[0].id);
		expect(tasker.toasts.map((t) => t.message)).toEqual(['b']);
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
