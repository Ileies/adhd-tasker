/** Keeps the screen on while the page is visible. Returns a cleanup. Silently does nothing where unsupported. */
export function keepAwake(): () => void {
	let lock: WakeLockSentinel | null = null;
	let stopped = false;

	async function acquire() {
		if (stopped || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
		try {
			lock = await navigator.wakeLock.request('screen');
		} catch {
			// Denied, for example on low battery
		}
	}

	// The browser drops the lock whenever the tab is hidden, so take it again on return
	const onVisible = () => {
		if (document.visibilityState === 'visible') void acquire();
	};
	document.addEventListener('visibilitychange', onVisible);
	void acquire();

	return () => {
		stopped = true;
		document.removeEventListener('visibilitychange', onVisible);
		lock?.release().catch(() => {});
	};
}

export function toggleFullscreen() {
	if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	else document.documentElement.requestFullscreen().catch(() => {});
}
