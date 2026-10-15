/**
 * What the "Your data" section does in the page: download the export, read a file and import it,
 * delete the device's data (or the account) after a short window to take it back, bring back a plan from before
 * a move. The rules (what is in the file, what an import does) are in `core/export.ts`, this is the browser
 * part around them.
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import { describeImport, exportFileName } from '#lib/core/export.js';
import { describeBackup, describeSnapshot } from '#lib/core/merge.js';
import { readBackup, restoreBackup } from '#lib/local/device.js';
import { stopAutoSignIn } from '#lib/onetap.js';
import { showToast } from '#lib/toast.js';
import { addDays, deviceTimezone, todayIn } from '#lib/time.js';

/** How long deleting the device's data can still be taken back. */
export const ERASE_WINDOW_MS = 10_000;

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null
		? 'No connection'
		: error instanceof Error
			? error.message
			: String(error);

/** Starts a download of the export file. Answers `null` when it was made, otherwise the reason. */
export async function downloadExport(): Promise<string | null> {
	try {
		const file = await tasker.backend.data.export();
		const timezone = tasker.timezone ?? deviceTimezone();
		const link = document.createElement('a');
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
		);
		link.href = url;
		link.download = exportFileName(todayIn(timezone));
		link.click();
		URL.revokeObjectURL(url);
		return null;
	} catch (error) {
		return `Could not export: ${reasonOf(error)}`;
	}
}

/**
 * Reads the screens' state again after an import: the settings and the plan. The schedule follows by itself,
 * an import that added alarms sends the hint every open screen reloads the schedule on.
 */
export async function refreshAfterImport() {
	tasker.settings = await tasker.backend.settings.load();
	const from = addDays(
		todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone()),
		-1
	);
	tasker.tasks = await tasker.backend.tasks.since(from);
}

/** Imports a chosen file. Answers the sentence to show, a refusal says why. */
export async function importFile(file: File): Promise<{ ok: boolean; message: string }> {
	let raw: unknown;
	try {
		raw = JSON.parse(await file.text());
	} catch {
		return { ok: false, message: 'That file is not a valid export, it is not JSON' };
	}
	try {
		const result = await tasker.backend.data.import(raw);
		await refreshAfterImport();
		return { ok: true, message: describeImport(result) };
	} catch (error) {
		return { ok: false, message: reasonOf(error) };
	}
}

let pendingErase: ReturnType<typeof setTimeout> | undefined;

async function eraseNow() {
	pendingErase = undefined;
	const account = !!tasker.account.email;
	try {
		await tasker.backend.data.erase();
		if (account) {
			// The account is gone, so Google's prompt must not sign the visitor into a new one at once
			stopAutoSignIn();
		}
		// The database or the account is gone, start again from an empty one
		location.reload();
	} catch (error) {
		showToast(`Could not delete: ${reasonOf(error)}`);
	}
}

/**
 * Deletes everything on this device, or for an account the account with everything in it, after a window to
 * take it back (an Undo toast, like every other destructive action). Leaving the page inside the window keeps
 * the data.
 */
export function eraseSoon() {
	if (pendingErase) return;
	pendingErase = setTimeout(() => void eraseNow(), ERASE_WINDOW_MS);
	showToast(
		tasker.account.email
			? 'Your account and everything in it will be deleted'
			: 'Everything on this device will be deleted',
		() => {
			clearTimeout(pendingErase);
			pendingErase = undefined;
		},
		ERASE_WINDOW_MS
	);
}

/** What the copy kept after a plan moved into an account would bring back, `null` when there is none. */
export async function deviceBackupLabel(): Promise<string | null> {
	try {
		const backup = await readBackup(Date.now());
		return backup
			? describeBackup(backup.file, backup.at, tasker.timezone ?? deviceTimezone())
			: null;
	} catch {
		return null;
	}
}

/** Brings the copy back into this device's plan. Answers `null` when it is back, otherwise the reason. */
export async function restoreDeviceBackup(): Promise<string | null> {
	try {
		const result = await restoreBackup(Date.now());
		if (!result) return 'There is no copy to restore any more';
		// The guest's plan is read from the device when the page loads
		location.reload();
		return null;
	} catch (error) {
		return `Could not restore: ${reasonOf(error)}`;
	}
}

/** The plans of the account that can be brought back, with the sentence for each. */
export async function accountSnapshots(): Promise<{ id: number; label: string }[]> {
	try {
		const timezone = tasker.timezone ?? deviceTimezone();
		return (await tasker.backend.account.snapshots()).map((snapshot) => ({
			id: snapshot.id,
			label: describeSnapshot(snapshot, timezone)
		}));
	} catch {
		return [];
	}
}

/** Brings a snapshot of the account back. Answers `null` when it is back, otherwise the reason. */
export async function restoreAccountSnapshot(id: number): Promise<string | null> {
	try {
		await tasker.backend.account.restore(id);
		await refreshAfterImport();
		return null;
	} catch (error) {
		return `Could not restore: ${reasonOf(error)}`;
	}
}
