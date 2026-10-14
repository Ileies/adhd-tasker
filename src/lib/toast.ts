import { tasker } from '#lib/app.svelte.js';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** How long a toast stays, unless the caller needs the undo window to be longer. */
export const TOAST_MS = 8000;

/** Shows a short confirmation. With `undo` it offers a way back, so no action needs a confirm dialog. */
export function showToast(message: string, undo?: () => unknown, durationMs = TOAST_MS) {
	clearTimeout(toastTimer);
	tasker.toast = { message, undo };
	toastTimer = setTimeout(dismissToast, durationMs);
}

export function dismissToast() {
	clearTimeout(toastTimer);
	tasker.toast = null;
}

/** The reason carried by a thrown error, or the plain fallback when it carries none. */
export function errorText(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}
