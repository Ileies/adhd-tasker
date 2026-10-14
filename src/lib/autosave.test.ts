/// <reference types="bun" />
import { afterEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { saveSettings } from '#lib/autosave.js';
import { remoteBackend } from '#lib/remote-backend.js';
import type { SettingsPatch } from '#lib/settings.js';

afterEach(() => {
	tasker.backend = remoteBackend;
});

function backendSaving(save: (patch: SettingsPatch) => Promise<void>) {
	tasker.backend = { settings: { save } } as unknown as Backend;
}

describe('saveSettings', () => {
	test('a valid form is sent and answers null', async () => {
		const sent: SettingsPatch[] = [];
		backendSaving(async (patch) => void sent.push(patch));
		expect(await saveSettings({ ok: true, value: { showClock: true } })).toBeNull();
		expect(sent).toEqual([{ showClock: true }]);
	});

	test('a form that did not parse is not sent, its error comes back', async () => {
		const sent: SettingsPatch[] = [];
		backendSaving(async (patch) => void sent.push(patch));
		expect(await saveSettings({ ok: false, error: 'The heads-up is 1 to 60 minutes' })).toBe(
			'The heads-up is 1 to 60 minutes'
		);
		expect(sent).toEqual([]);
	});

	test('a refusal answers with its reason', async () => {
		backendSaving(async () => {
			throw new BackendError('Invalid value for overrunMinutes', 400);
		});
		expect(await saveSettings({ ok: true, value: { overrunMinutes: 1 } })).toBe(
			'Invalid value for overrunMinutes'
		);
	});

	test('a lost connection says nothing was saved', async () => {
		backendSaving(async () => {
			throw new BackendError('Could not reach the server.', null);
		});
		expect(await saveSettings({ ok: true, value: { showClock: true } })).toBe(
			'No connection, not saved'
		);
	});
});
