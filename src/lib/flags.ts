/**
 * What this device was already told, remembered in the browser: the welcome and the second screen hint
 * show once. Device preferences, never task data. A browser that blocks storage shows them again, which is
 * harmless.
 */
const FLAGS = ['welcomed', 'screenHintSeen'] as const;
export type Flag = (typeof FLAGS)[number];

const key = (flag: Flag) => `flag:${flag}`;

/** Which flags are set. A blocked storage reads as set, so nothing nags on a device that cannot remember. */
export function readFlags(): Record<Flag, boolean> {
	return Object.fromEntries(
		FLAGS.map((flag) => {
			try {
				return [flag, localStorage.getItem(key(flag)) === 'true'];
			} catch {
				return [flag, true];
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
