/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { SHELL_GUEST, SHELL_HEADER, shellAction, shellKey } from '#lib/offline.js';

const page = (init: { ok?: boolean; redirected?: boolean; header?: string }) => ({
	ok: init.ok ?? true,
	redirected: init.redirected ?? false,
	headers: new Headers(init.header ? { [SHELL_HEADER]: init.header } : {})
});

describe('shellAction', () => {
	test.each([
		['a guest page is stored', page({ header: SHELL_GUEST }), 'store'],
		['a signed in page drops the stored copy', page({}), 'forget'],
		['an unknown header value counts as signed in', page({ header: 'account' }), 'forget'],
		['a server error changes nothing', page({ ok: false, header: SHELL_GUEST }), 'ignore'],
		['a redirected page changes nothing', page({ redirected: true, header: SHELL_GUEST }), 'ignore']
	] as const)('%s', (_name, response, expected) => {
		expect(shellAction(response)).toBe(expected);
	});
});

describe('shellKey', () => {
	test('the query and the hash do not make a different page', () => {
		expect(shellKey('https://tasker.test/edit?date=2026-10-16#x')).toBe('https://tasker.test/edit');
	});

	test('different paths are different pages', () => {
		expect(shellKey('https://tasker.test/')).not.toBe(shellKey('https://tasker.test/edit'));
	});
});
