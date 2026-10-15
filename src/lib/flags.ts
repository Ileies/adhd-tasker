/**
 * What this device was already told or did, remembered in the browser: the welcome shows once. Device preferences, never task data.
 */

/**
 * Each flag with what a browser that blocks storage reads. A flag that silences something reads as set, so
 * nothing nags on a device that cannot remember.
 */
const WHEN_BLOCKED = { welcomed: true, compactPlan: false } as const;

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

export function clearFlag(flag: Flag) {
	try {
		localStorage.removeItem(key(flag));
	} catch {
		// Blocked storage: nothing was remembered
	}
}
