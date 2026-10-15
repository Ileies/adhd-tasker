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

export type Shortcut = 'now' | 'plan' | 'assistant' | 'mute' | 'fullscreen';

/** The keys the layout handles on every page, in the order the help lists them. */
export const SHORTCUTS: { key: string; action: Shortcut; text: string }[] = [
	{ key: '1', action: 'now', text: 'Now' },
	{ key: '2', action: 'plan', text: 'Plan' },
	{ key: 'A', action: 'assistant', text: 'Open the assistant' },
	{ key: 'M', action: 'mute', text: 'Mute or unmute' },
	{ key: 'F', action: 'fullscreen', text: 'Fullscreen' }
];

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const typingIn = (target: KeyPress['target']) => {
	// Only an element has these, `window` or `document` as the target have neither
	const element = target as { tagName?: string; isContentEditable?: boolean } | null;
	return (
		!!element &&
		(element.isContentEditable === true || TYPING.has(element.tagName?.toUpperCase() ?? ''))
	);
};

/** What a key press asks for, or `null`. Not while typing, with a modifier (Ctrl+F is the browser's find) or held down. */
export function shortcutFor(press: KeyPress): Shortcut | null {
	if (press.ctrlKey || press.metaKey || press.altKey || press.repeat || typingIn(press.target))
		return null;
	const key = press.key.toLowerCase();
	return SHORTCUTS.find((shortcut) => shortcut.key.toLowerCase() === key)?.action ?? null;
}

/** `F` toggles fullscreen, unless the user is typing or holds a modifier. */
export const isFullscreenKey = (press: KeyPress) => shortcutFor(press) === 'fullscreen';
