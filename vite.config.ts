import adapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { CSP_DIRECTIVES } from '#lib/csp.ts';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// Google One Tap posts the credential to /callback from accounts.google.com
			csrf: { trustedOrigins: ['https://accounts.google.com'] },
			// A guest's OpenAI key lives in the browser: see src/lib/csp.ts for what a script may reach
			csp: { mode: 'auto', directives: CSP_DIRECTIVES }
		}),
		devtoolsJson()
	]
});
