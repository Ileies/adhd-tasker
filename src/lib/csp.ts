import type { sveltekit } from '@sveltejs/kit/vite';

/** The shape SvelteKit takes for the `csp.directives` option. */
type CspDirectives = NonNullable<
	NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>['directives']
>;

/**
 * The Content Security Policy. A guest's OpenAI key lives in this browser, so what a script that
 * got into the page could send it to matters: `connect-src` names this origin, OpenAI, Google's
 * sign in and the city search of the daylight theme, nothing else. SvelteKit adds the nonce to its own scripts (`mode: 'auto'`).
 *
 * Google's origins are here for the One Tap sign in script, which `onetap.ts` loads for every visitor who is
 * not signed in (not on the privacy and terms pages), and for the redirect of the sign in form.
 */
export const CSP_DIRECTIVES = {
	'default-src': ['self'],
	'script-src': ['self', 'https://accounts.google.com'],
	// Svelte and Tailwind set style attributes and Google's sign in injects its own sheet
	'style-src': ['self', 'unsafe-inline', 'https://accounts.google.com'],
	'img-src': ['self', 'data:', 'blob:'],
	'font-src': ['self', 'data:'],
	// The assistant talks to OpenAI from the browser, the Realtime socket needs wss
	'connect-src': [
		'self',
		'https://api.openai.com',
		'wss://api.openai.com',
		'https://accounts.google.com',
		// A guest's city search for the daylight theme, only the typed name is sent
		'https://geocoding-api.open-meteo.com'
	],
	'frame-src': ['https://accounts.google.com'],
	// Spoken replies are a blob made from the audio OpenAI sent
	'media-src': ['self', 'blob:', 'data:'],
	'worker-src': ['self'],
	'manifest-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['self'],
	// The login form redirects to Google
	'form-action': ['self', 'https://accounts.google.com']
} satisfies CspDirectives;
