type Gsi = {
	initialize: (config: Record<string, unknown>) => void;
	prompt: () => void;
	cancel: () => void;
	disableAutoSelect?: () => void;
};
type GsiWindow = { google?: { accounts?: { id?: Gsi } } };

const POLL_MS = 200;
const GIVE_UP_MS = 10_000;

export const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** The part of `document` that adding the script needs. */
type ScriptHost = {
	createElement: (tag: 'script') => { src: string; async: boolean };
	head: { append: (script: never) => void };
	querySelector: (selector: string) => unknown;
};

/**
 * Whether Google's script may be loaded: only for a visitor who is not signed in and on a page that is not a
 * page to read. That includes a first visit, so someone who wants to sign in right away can do it in one tap.
 */
export const wantsOneTap = (visit: { signedIn: boolean; legal: boolean }) =>
	!visit.signedIn && !visit.legal;

/** After signing out, so One Tap's auto select does not sign the visitor straight back in. */
export function stopAutoSignIn(
	win: GsiWindow = typeof window === 'undefined' ? {} : (window as GsiWindow)
) {
	win.google?.accounts?.id?.disableAutoSelect?.();
}

/** Adds Google's sign in script to the page, once. */
export function loadGsi(doc: ScriptHost = document as unknown as ScriptHost) {
	if (doc.querySelector(`script[src="${GSI_SRC}"]`)) return;
	const script = doc.createElement('script');
	script.src = GSI_SRC;
	script.async = true;
	doc.head.append(script as never);
}

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
