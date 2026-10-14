/// <reference types="bun" />
import { afterEach, describe, expect, test } from 'bun:test';
import { tasker } from '#lib/app.svelte.js';
import { BackendError, type Backend } from '#lib/backend.js';
import { removeKey, saveKey } from '#lib/openai-key.js';
import { remoteBackend } from '#lib/remote-backend.js';

afterEach(() => {
	tasker.backend = remoteBackend;
	tasker.settings.hasOpenaiKey = false;
});

const backendWith = (settings: Partial<Backend['settings']>) => {
	tasker.backend = { settings } as unknown as Backend;
};

describe('saveKey', () => {
	test('a stored key makes the settings say a key is saved', async () => {
		backendWith({ saveKey: async () => {} });
		expect(await saveKey('sk-x')).toBeNull();
		expect(tasker.settings.hasOpenaiKey).toBe(true);
	});

	test('a refused key answers with the reason and changes nothing', async () => {
		backendWith({
			saveKey: async () => {
				throw new BackendError('OpenAI did not accept this key', 400);
			}
		});
		expect(await saveKey('sk-x')).toBe('OpenAI did not accept this key');
		expect(tasker.settings.hasOpenaiKey).toBe(false);
	});

	test('a lost connection says the key was not saved', async () => {
		backendWith({
			saveKey: async () => {
				throw new BackendError('Could not reach the server.', null);
			}
		});
		expect(await saveKey('sk-x')).toBe('No connection, the key was not saved');
	});
});

describe('removeKey', () => {
	test('forgets the key', async () => {
		tasker.settings.hasOpenaiKey = true;
		backendWith({ removeKey: async () => {} });
		await removeKey();
		expect(tasker.settings.hasOpenaiKey).toBe(false);
	});

	test('a failed removal leaves the key in place', async () => {
		tasker.settings.hasOpenaiKey = true;
		backendWith({
			removeKey: async () => {
				throw new BackendError('no', 500);
			}
		});
		await removeKey();
		expect(tasker.settings.hasOpenaiKey).toBe(true);
	});
});
