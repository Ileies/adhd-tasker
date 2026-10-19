/**
 * What happens in the page when a visitor signs in on a device that still holds the plan it had as a guest
 * (local first plan 5.3). The rule (D9): no way through sign in loses data, and nothing is written until the
 * visitor has chosen. A new account takes the plan without a question, an account that has a plan gets the
 * move screen. The device's plan is only removed after the account confirmed it has it, and a copy stays for
 * 30 days. The comparison and the sentences are in `core/merge.ts`, the device in `local/device.ts`.
 */
import { tasker } from '#lib/app.svelte.js';
import { BackendError } from '#lib/backend.js';
import { comparePlans, describeMove, isEmptyPlan, type MoveMode } from '#lib/core/merge.js';
import { refreshAfterImport } from '#lib/data.js';
import {
	clearDevice,
	declineMove,
	readDevice,
	restoreBackup,
	type DeviceData
} from '#lib/local/device.js';
import { showToast } from '#lib/toast.js';
import { deviceTimezone, todayIn } from '#lib/time.js';

/** What the visitor can choose on the move screen. */
export type MoveChoice = 'both' | 'account' | 'device';

/** The window to take a move back, a decision about the whole plan gets more than the usual toast. */
const UNDO_MOVE_MS = 10_000;

const reasonOf = (error: unknown) =>
	error instanceof BackendError && error.status === null
		? 'No connection'
		: error instanceof Error
			? error.message
			: String(error);

const today = () => todayIn(tasker.timezone ?? tasker.settings.timezone ?? deviceTimezone());

/** The plan the screen is asking about, a plain object: state proxies cannot be stored in IndexedDB. */
let waiting: DeviceData | null = null;

function closeMove() {
	waiting = null;
	tasker.move = { comparison: null, hasKey: false, busy: false, error: null };
}

/**
 * Looks at what the device holds, once the page loaded for a signed in visitor. Nothing to move or a plan the
 * visitor chose to leave: nothing happens. A new account takes it at once. Otherwise the move screen opens.
 * A failure here changes nothing, the question comes back on the next load.
 */
export async function checkMove() {
	const email = tasker.account.email;
	if (!email) return;
	try {
		const found = await readDevice(Date.now());
		if (!found || found.declinedFor === email) return;

		const account = await tasker.backend.data.export();
		if (isEmptyPlan(account)) {
			const failure = await moveDevice(found, 'both', false);
			if (failure) showToast(`Could not move your plan: ${failure}`);
			return;
		}
		waiting = found;
		tasker.move = {
			comparison: comparePlans(found.file, account),
			hasKey: !!found.openaiKey,
			busy: false,
			error: null
		};
	} catch (error) {
		console.error('[move] could not check the device', error);
	}
}

/**
 * Moves the device's plan into the account. Answers `null` when it is there, otherwise the reason, and then
 * the account and the device are as they were.
 */
async function moveDevice(
	found: DeviceData,
	mode: MoveMode,
	saveKey: boolean
): Promise<string | null> {
	let result;
	try {
		result = await tasker.backend.account.move(found.file, mode, today());
	} catch (error) {
		return `${reasonOf(error)}. Nothing was changed, your plan is still on this device.`;
	}

	let keyNote = '';
	if (saveKey && found.openaiKey) {
		try {
			await tasker.backend.settings.saveKey(found.openaiKey);
		} catch (error) {
			keyNote = ` Your OpenAI key was not saved: ${reasonOf(error)}.`;
		}
	}
	// Only now, the account has it. A failure leaves the plan on the device, which the next load moves again without a duplicate
	await clearDevice(found.file, Date.now()).catch((error) =>
		console.error('[move] could not clear the device', error)
	);
	await refreshAfterImport().catch((error) => console.error('[move] could not refresh', error));

	showToast(describeMove(result) + keyNote, () => undoMove(result.snapshotId), UNDO_MOVE_MS);
	return null;
}

/** The visitor's choice on the move screen. The reason a move failed stays on the screen. */
export async function chooseMove(choice: MoveChoice, saveKey = false) {
	const found = waiting;
	const email = tasker.account.email;
	if (!found || !email || tasker.move.busy) return;

	if (choice === 'account') {
		await declineMove(email).catch((error) => console.error('[move] could not remember', error));
		closeMove();
		showToast("This device's plan stays on this device. Sign out to see it again.");
		return;
	}

	tasker.move.busy = true;
	tasker.move.error = null;
	const failure = await moveDevice(found, choice === 'both' ? 'both' : 'replace', saveKey);
	tasker.move.busy = false;
	if (failure) tasker.move.error = failure;
	else closeMove();
}

/**
 * Takes a move back: the account's plan from before returns, so does the device's copy. The device's plan is
 * not asked about again until the next sign out, or the same screen would move it again at once.
 */
async function undoMove(snapshotId: number) {
	const email = tasker.account.email;
	try {
		await tasker.backend.account.restore(snapshotId);
		await restoreBackup(Date.now());
		if (email) await declineMove(email);
		await refreshAfterImport();
		showToast('The move is undone. Your plan is back on this device, sign out to see it.');
	} catch (error) {
		showToast(`Could not undo the move: ${reasonOf(error)}`);
	}
}
