type Gsi = {
	initialize: (config: Record<string, unknown>) => void;
	prompt: () => void;
	cancel: () => void;
};
type GsiWindow = { google?: { accounts?: { id?: Gsi } } };

const POLL_MS = 200;
const GIVE_UP_MS = 10_000;

/**
 * Shows Google One Tap after a client side navigation. The script only scans the page for
 * `g_id_onload` once when it loads, so an element added later is never seen. Waits for the async
 * script, then initializes and prompts. Returns a cleanup that stops waiting and closes the prompt.
 */
export function showOneTap(
	config: { clientId: string; loginUri: string },
	win: GsiWindow = window as GsiWindow
): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let waited = 0;

	function start() {
		const gsi = win.google?.accounts?.id;
		if (gsi) {
			gsi.initialize({
				client_id: config.clientId,
				login_uri: config.loginUri,
				auto_select: true
			});
			gsi.prompt();
		} else if (waited < GIVE_UP_MS) {
			waited += POLL_MS;
			timer = setTimeout(start, POLL_MS);
		}
	}
	start();

	return () => {
		clearTimeout(timer);
		win.google?.accounts?.id?.cancel();
	};
}
