import { tasker } from '#lib/app.svelte.js';

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

/** How long a toast stays, unless the caller needs the undo window to be longer. */
const TOAST_MS = 8000;

/** At most this many toasts show at once, the oldest makes room (its undo window ends with it). */
const MAX_TOASTS = 4;

/** Shows a short confirmation under the ones already showing. With `undo` it offers a way back, so no action needs a confirm dialog. */
export function showToast(message: string, undo?: () => unknown, durationMs = TOAST_MS) {
	const id = nextId++;
	tasker.toasts = [...tasker.toasts, { id, message, undo }];
	timers.set(
		id,
		setTimeout(() => dismissToast(id), durationMs)
	);
	for (const old of tasker.toasts.slice(0, -MAX_TOASTS)) dismissToast(old.id);
}

/** Closes one toast, or all of them without an id. */
export function dismissToast(id?: number) {
	for (const toast of tasker.toasts) {
		if (id === undefined || toast.id === id) clearTimeout(timers.get(toast.id));
	}
	tasker.toasts = id === undefined ? [] : tasker.toasts.filter((toast) => toast.id !== id);
}

/** The reason carried by a thrown error, or the plain fallback when it carries none. */
export function errorText(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}
