/**
 * What this device was already told or did, remembered in the browser: the welcome and the second screen hint
 * show once, and `signedInBefore` lets Google's sign in script load for a device that was signed in once (local first
 * plan D5). Device preferences, never task data.
 */

/**
 * Each flag with what a browser that blocks storage reads. A flag that silences something reads as set, so
 * nothing nags on a device that cannot remember. A flag that loads something from a third party reads as unset,
 * so a blocked storage never contacts anyone.
 */
const WHEN_BLOCKED = { welcomed: true, screenHintSeen: true, signedInBefore: false } as const;

export type Flag = keyof typeof WHEN_BLOCKED;

const FLAGS = Object.keys(WHEN_BLOCKED) as Flag[];

const key = (flag: Flag) => `flag:${flag}`;

/** Which flags are set. */
export function readFlags(): Record<Flag, boolean> {
	return Object.fromEntries(
		FLAGS.map((flag) => {
			try {
				return [flag, localStorage.getItem(key(flag)) === 'true'];
			} catch {
				return [flag, WHEN_BLOCKED[flag]];
			}
		})
	) as Record<Flag, boolean>;
}

export function setFlag(flag: Flag) {
	try {
		localStorage.setItem(key(flag), 'true');
	} catch {
		// Blocked storage: the flag only lasts for this page
	}
}
