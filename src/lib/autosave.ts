import { BackendError } from '#lib/backend.js';
import { tasker } from '#lib/app.svelte.js';
import type { SettingsPatch } from '#lib/settings.js';

/**
 * Saves what a settings form parsed. Answers `null` when it is stored, otherwise the sentence to
 * show next to the form. A form that did not parse is never sent. A stored change shows in the
 * screens at once: the patch is merged into `tasker.settings`, the backend has validated the same values.
 */
export async function saveSettings(
	parsed: { ok: true; value: SettingsPatch } | { ok: false; error: string }
): Promise<string | null> {
	if (!parsed.ok) return parsed.error;
	try {
		await tasker.backend.settings.save(parsed.value);
		tasker.settings = { ...tasker.settings, ...parsed.value };
		return null;
	} catch (error) {
		if (error instanceof BackendError && error.status === null) return 'No connection, not saved';
		return error instanceof Error ? error.message : String(error);
	}
}
