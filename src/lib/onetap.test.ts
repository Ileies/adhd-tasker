/// <reference types="bun" />
import { describe, expect, jest, test } from 'bun:test';
import { showOneTap } from '#lib/onetap.js';

const config = { clientId: 'client', loginUri: 'https://app.test/callback' };

function fakeGsi() {
	const calls: string[] = [];
	const configs: Record<string, unknown>[] = [];
	return {
		calls,
		configs,
		id: {
			initialize: (c: Record<string, unknown>) => {
				calls.push('initialize');
				configs.push(c);
			},
			prompt: () => calls.push('prompt'),
			cancel: () => calls.push('cancel')
		}
	};
}

describe('showOneTap', () => {
	test('initializes with the callback uri and prompts when the script is loaded', () => {
		const gsi = fakeGsi();
		showOneTap(config, { google: { accounts: { id: gsi.id } } });
		expect(gsi.calls).toEqual(['initialize', 'prompt']);
		expect(gsi.configs[0]).toMatchObject({
			client_id: 'client',
			login_uri: 'https://app.test/callback',
			auto_select: true
		});
	});

	test('waits for the async script to load', () => {
		jest.useFakeTimers();
		const gsi = fakeGsi();
		const win: { google?: { accounts?: { id?: typeof gsi.id } } } = {};
		showOneTap(config, win);
		expect(gsi.calls).toEqual([]);
		win.google = { accounts: { id: gsi.id } };
		jest.advanceTimersByTime(250);
		expect(gsi.calls).toEqual(['initialize', 'prompt']);
		jest.useRealTimers();
	});

	test('cleanup closes the prompt', () => {
		const gsi = fakeGsi();
		const stop = showOneTap(config, { google: { accounts: { id: gsi.id } } });
		stop();
		expect(gsi.calls.at(-1)).toBe('cancel');
	});

	test('cleanup stops waiting for a script that never loads', () => {
		jest.useFakeTimers();
		const gsi = fakeGsi();
		const win: { google?: { accounts?: { id?: typeof gsi.id } } } = {};
		const stop = showOneTap(config, win);
		stop();
		win.google = { accounts: { id: gsi.id } };
		jest.advanceTimersByTime(1000);
		expect(gsi.calls).toEqual([]);
		jest.useRealTimers();
	});
});
