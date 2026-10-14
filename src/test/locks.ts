import { LEADER_LOCK, type LockApi } from '#lib/local/leader.js';

/**
 * The browser's lock manager reduced to what the tab election needs: one holder at a time per name,
 * the next request waits until the holder's tab is gone. `release` is that tab closing.
 */
export function fakeLocks() {
	const held = new Set<string>();
	const queue: { name: string; grant: () => void }[] = [];
	const api: LockApi = {
		request(name, callback) {
			return new Promise((resolve) => {
				const grant = () => {
					held.add(name);
					void callback().then(resolve);
				};
				if (held.has(name)) queue.push({ name, grant });
				else grant();
			});
		}
	};
	const release = (name: string = LEADER_LOCK) => {
		held.delete(name);
		const next = queue.findIndex((item) => item.name === name);
		if (next !== -1) queue.splice(next, 1)[0].grant();
	};
	return { api, release };
}
