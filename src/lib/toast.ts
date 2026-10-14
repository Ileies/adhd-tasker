import { tasker } from '#lib/app.svelte.js';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short confirmation. With `undo` it offers a way back, so no action needs a confirm dialog. */
export function showToast(message: string, undo?: () => unknown) {
	clearTimeout(toastTimer);
	tasker.toast = { message, undo };
	toastTimer = setTimeout(dismissToast, 8000);
}

export function dismissToast() {
	clearTimeout(toastTimer);
	tasker.toast = null;
}

/** The reason carried by a thrown error, or the plain fallback when it carries none. */
export function errorText(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}
