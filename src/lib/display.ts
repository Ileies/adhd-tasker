/** Keeps the screen on while the page is visible. Returns a cleanup. Silently does nothing where unsupported. */
export function keepAwake(): () => void {
	let lock: WakeLockSentinel | null = null;
	let stopped = false;
	let pending = false;

	async function acquire() {
		if (stopped || lock || pending || !('wakeLock' in navigator)) return;
		if (document.visibilityState !== 'visible') return;
		pending = true;
		try {
			const sentinel = await navigator.wakeLock.request('screen');
			if (stopped) {
				sentinel.release().catch(() => {});
				return;
			}
			lock = sentinel;
			// The browser also drops the lock on its own (low battery, power saver), so take it again
			sentinel.addEventListener('release', () => {
				if (lock === sentinel) lock = null;
				void acquire();
			});
		} catch {
			// Denied for now (low battery, no user activation yet): the retries below try again
		} finally {
			pending = false;
		}
	}

	// The browser drops the lock whenever the tab is hidden, so take it again on return
	const retry = () => void acquire();
	document.addEventListener('visibilitychange', retry);
	window.addEventListener('focus', retry);
	window.addEventListener('pointerdown', retry);
	window.addEventListener('keydown', retry);
	const timer = setInterval(retry, 60_000);
	void acquire();

	return () => {
		stopped = true;
		clearInterval(timer);
		document.removeEventListener('visibilitychange', retry);
		window.removeEventListener('focus', retry);
		window.removeEventListener('pointerdown', retry);
		window.removeEventListener('keydown', retry);
		lock?.release().catch(() => {});
		lock = null;
	};
}

export function toggleFullscreen() {
	if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	else document.documentElement.requestFullscreen().catch(() => {});
}
