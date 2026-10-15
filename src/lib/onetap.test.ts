/// <reference types="bun" />
import { describe, expect, jest, test } from 'bun:test';
import { GSI_SRC, loadGsi, showOneTap, stopAutoSignIn, wantsOneTap } from '#lib/onetap.js';

function fakeDocument() {
	const added: { src: string; async: boolean }[] = [];
	return {
		added,
		createElement: () => ({ src: '', async: false }),
		head: { append: (script: never) => void added.push(script) },
		querySelector: (selector: string) => added.find((s) => selector.includes(s.src)) ?? null
	};
}

describe('wantsOneTap', () => {
	test.each([
		[{ signedIn: false, legal: false }, true],
		[{ signedIn: true, legal: false }, false],
		[{ signedIn: false, legal: true }, false]
	])('%j is %p', (visit, wanted) => {
		expect(wantsOneTap(visit)).toBe(wanted);
	});
});

describe('stopAutoSignIn', () => {
	test('turns off auto select, and is fine when the script was never loaded', () => {
		const calls: string[] = [];
		const id = { ...fakeGsi().id, disableAutoSelect: () => calls.push('disable') };
		stopAutoSignIn({ google: { accounts: { id } } });
		expect(calls).toEqual(['disable']);
		expect(() => stopAutoSignIn({})).not.toThrow();
	});
});

describe('loadGsi', () => {
	test('adds the script from Google once', () => {
		const doc = fakeDocument();
		loadGsi(doc);
		loadGsi(doc);
		expect(doc.added).toEqual([{ src: GSI_SRC, async: true }]);
	});
});

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
