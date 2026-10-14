import { BackendError } from '#lib/backend.js';
import { tasker } from '#lib/app.svelte.js';

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null
		? 'No connection, the key was not saved'
		: error instanceof Error
			? error.message
			: String(error);

/** Checks the key and stores it where this visitor's settings live. Answers `null` when saved, otherwise the reason. */
export async function saveKey(key: string): Promise<string | null> {
	try {
		await tasker.backend.settings.saveKey(key);
		tasker.settings.hasOpenaiKey = true;
		return null;
	} catch (error) {
		return reasonOf(error);
	}
}

export async function removeKey() {
	try {
		await tasker.backend.settings.removeKey();
		tasker.settings.hasOpenaiKey = false;
	} catch {
		// The key stays and the form still says so
	}
}
