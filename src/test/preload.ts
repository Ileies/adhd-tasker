/**
 * Loaded before every test file (`bunfig.toml`). Makes app modules importable outside SvelteKit:
 * virtual `$app/env` modules, runes compiled in `*.svelte.ts`, no network, real time after each test.
 */
import { plugin } from 'bun';
import { afterEach, setSystemTime } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { assertNoRefusedRequests, blockNetwork } from '#test/network.js';

plugin({
	name: 'sveltekit-for-tests',
	setup(build) {
		// building: importing hooks.server.ts never starts the 15 s scheduler.
		// dev: false, so cookie flags are tested as in production
		build.module('$app/env', () => ({
			exports: { building: true, dev: false, browser: false, version: 'test' },
			loader: 'object'
		}));
		build.module('$app/env/private', () => ({
			exports: { GOOGLE_CLIENT_SECRET: 'test-secret', DATABASE_URL: ':memory:' },
			loader: 'object'
		}));
		build.module('$app/env/public', () => ({
			exports: {
				PUBLIC_GOOGLE_CLIENT_ID: 'test-client-id',
				PUBLIC_REDIRECT_URI: 'http://localhost:5173/callback'
			},
			loader: 'object'
		}));

		// Runes only work in compiled modules: strip the types, then compile as the browser would
		const transpiler = new Bun.Transpiler({ loader: 'ts' });
		build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
			const source = transpiler.transformSync(await Bun.file(path).text());
			const { js } = compileModule(source, { filename: path, generate: 'client' });
			return { contents: js.code, loader: 'js' };
		});
	}
});

blockNetwork();

afterEach(() => {
	setSystemTime();
	blockNetwork();
	assertNoRefusedRequests();
});
