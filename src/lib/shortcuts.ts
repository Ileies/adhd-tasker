/** Keyboard shortcuts of the app. Pure: the page passes the key event and decides what to do. */

export interface KeyPress {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	repeat: boolean;
	/** The element that has the focus: typing in a field is never a shortcut. */
	target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const typingIn = (target: KeyPress['target']) => {
	// Only an element has these, `window` or `document` as the target have neither
	const element = target as { tagName?: string; isContentEditable?: boolean } | null;
	return (
		!!element &&
		(element.isContentEditable === true || TYPING.has(element.tagName?.toUpperCase() ?? ''))
	);
};

/** `F` toggles fullscreen, unless the user is typing or holds a modifier (Ctrl+F is the browser's find). */
export function isFullscreenKey(press: KeyPress): boolean {
	return (
		press.key.toLowerCase() === 'f' &&
		!press.ctrlKey &&
		!press.metaKey &&
		!press.altKey &&
		!press.repeat &&
		!typingIn(press.target)
	);
}
