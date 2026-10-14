/**
 * One tab per device leads. Only it runs the agent loop and makes sound, the others follow what it
 * broadcasts. A Web Lock held for the life of the tab does the election: when the leader closes the
 * browser hands the lock to the next waiting tab. Without Web Locks the one tab leads.
 */
export interface LockApi {
	request(name: string, callback: () => Promise<void>): Promise<unknown>;
}

export const LEADER_LOCK = 'tasker-leader';

/** Calls `onLead` once this tab is the leader. It never gives the lock back, the tab closing does. */
export function electLeader(locks: LockApi | undefined, onLead: () => void) {
	if (!locks) return onLead();
	void locks.request(LEADER_LOCK, () => {
		onLead();
		return new Promise<void>(() => {});
	});
}
