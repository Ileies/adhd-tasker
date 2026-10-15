/// <reference types="bun" />
/**
 * The repo rules from `CLAUDE.md` as tests, so breaking one fails the gate instead of a review.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dir, '../..');

/** Tracked files plus new ones that are not ignored, so a rule fails before the commit. */
const files = (() => {
	const git = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
		cwd: root
	});
	if (git.exitCode !== 0) throw new Error(`git ls-files failed: ${git.stderr.toString()}`);
	return git.stdout
		.toString()
		.split('\n')
		.filter((path) => path && existsSync(resolve(root, path)));
})();
const fileSet = new Set(files);

const textFiles = files
	.filter((path) => path !== 'bun.lock')
	.map((path) => ({ path, bytes: readFileSync(resolve(root, path)) }))
	.filter(({ bytes }) => !bytes.subarray(0, 8000).includes(0))
	.map(({ path, bytes }) => ({ path, content: bytes.toString('utf8') }));

const isTest = (path: string) => path.endsWith('.test.ts') || path.startsWith('src/test/');

/** App code: everything under `src/` that ships. */
const appCode = textFiles.filter(({ path }) => path.startsWith('src/') && !isTest(path));

/** `path:line` for every line that matches. */
function linesMatching(pattern: RegExp, candidates = textFiles) {
	return candidates.flatMap(({ path, content }) =>
		content
			.split('\n')
			.flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}`] : []))
	);
}

/** App code files that mention `pattern`, sorted. */
function appCodeMentioning(pattern: RegExp) {
	return appCode
		.filter(({ content }) => pattern.test(content))
		.map(({ path }) => path)
		.sort();
}

describe('text', () => {
	test('no file contains an em dash', () => {
		// Built from its code point, so this file does not contain one
		const emDash = new RegExp(String.fromCodePoint(0x2014));
		expect(linesMatching(emDash)).toEqual([]);
	});

	test('bun x is used, never its short form', () => {
		// The rule itself names the short form, and so does this file
		const allowed = ['never `bunx`', 'No `bunx`'];
		const candidates = textFiles
			.filter(({ path }) => path !== 'src/test/architecture.test.ts')
			.map(({ path, content }) => ({
				path,
				content: allowed.reduce((text, phrase) => text.replaceAll(phrase, ''), content)
			}));
		expect(linesMatching(/\bbunx\b/, candidates)).toEqual([]);
	});
});

describe('pairing rule', () => {
	/**
	 * Modules without a sibling test, each with its reason. A temporary entry names the plan step
	 * that removes it. A new module can only join on purpose.
	 */
	const UNTESTED: Record<string, string> = {
		'types.ts': 'types only',
		'core/repo.ts': 'types only',
		'backend.ts': 'the interface and one error class, tested through remote-backend.test.ts',
		'utils.ts': 'generated shadcn helper',
		'app.svelte.ts': 'the state object, used by every client test',
		'display.ts': 'browser API wiring, its rules live in tested modules',
		'speech.ts': 'browser API wiring, its rules live in tested modules',
		'audio.ts': 'the shared AudioContext, browser API wiring (the line it feeds is silence.ts)',
		'server/index.ts': 'covered by the login route tests',
		'server/db/index.ts': 'used by every integration test',
		'index.ts': 'audio synthesis, browser API wiring (the task mutations live in tasks.ts)',
		'theme.ts': 'until UX phase 8b replaces its day window with sun.ts',
		'core/context.ts': 'types and one error class, covered by the model and route tests',
		'server/ctx.ts': 'wiring of the server context, used by the route tests',
		'custom-sounds.ts':
			'decodes audio with the shared AudioContext, browser API wiring (rules in sounds.ts)',
		'alarms.ts': 'until checks plan phase 6',
		'agent.ts': 'until checks plan phase 6',
		'assistant.ts': 'until checks plan phase 6',
		'stream.ts': 'until checks plan phase 6'
	};

	const modules = files
		.filter((path) => /^src\/lib\/([^/]+|server\/.+|core\/.+|local\/.+)\.ts$/.test(path))
		.filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
		.map((path) => path.slice('src/lib/'.length));
	const hasTest = (module: string) => fileSet.has(`src/lib/${module.replace(/\.ts$/, '.test.ts')}`);

	test('every module in src/lib and src/lib/server has a test next to it', () => {
		expect(modules.filter((module) => !hasTest(module) && !(module in UNTESTED))).toEqual([]);
	});

	test('the untested list names only existing modules without a test', () => {
		const stale = Object.keys(UNTESTED).filter(
			(module) => !modules.includes(module) || hasTest(module)
		);
		expect(stale).toEqual([]);
	});
});

describe('OpenAI call sites', () => {
	test('only openai.ts, voice.ts, the key check and the CSP name the OpenAI host', () => {
		expect(appCodeMentioning(/api\.openai\.com/)).toEqual([
			'src/lib/core/openai-key.ts',
			'src/lib/csp.ts',
			'src/lib/openai.ts',
			'src/lib/voice.ts'
		]);
	});

	test('only the model adapter calls the Responses API, through buildRequest', () => {
		expect(appCodeMentioning(/\bOPENAI_URL\b/)).toEqual(['src/lib/openai.ts']);
	});

	test('only the core voice module calls transcription and Realtime', () => {
		expect(appCodeMentioning(/\b(TRANSCRIBE_URL|REALTIME_URL)\b/)).toEqual([
			'src/lib/core/voice.ts',
			'src/lib/voice.ts'
		]);
	});
});

describe('client state', () => {
	/** Names of module-level variables initialized with `$state(...)` or `$state.raw(...)`. */
	function moduleState(path: string, content: string) {
		const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest);
		return source.statements.filter(ts.isVariableStatement).flatMap((statement) =>
			statement.declarationList.declarations.filter((declaration) => {
				let init = declaration.initializer;
				while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)))
					init = init.expression;
				return (
					init !== undefined &&
					ts.isCallExpression(init) &&
					/^\$state(\.raw)?$/.test(init.expression.getText(source))
				);
			})
		);
	}

	test('tasker in app.svelte.ts is the only module-level $state', () => {
		const owners = appCode
			.filter(({ path }) => path.endsWith('.svelte.ts') || path.endsWith('.svelte.js'))
			.filter(({ path, content }) => moduleState(path, content).length > 0)
			.map(({ path }) => path);
		expect(owners).toEqual(['src/lib/app.svelte.ts']);
	});

	test('browser storage is only used for device preferences, never for task data', () => {
		// app.html reads the theme before the app loads, so the first paint has the right colors
		expect(appCodeMentioning(/\b(localStorage|sessionStorage)\b/)).toEqual([
			'src/app.html',
			'src/lib/alarms.ts',
			'src/lib/flags.ts',
			'src/lib/theme.ts'
		]);
	});

	test('no page names a third party script, Google sign in is loaded on demand by onetap.ts', () => {
		const html = appCode.find(({ path }) => path === 'src/app.html')?.content ?? '';
		expect(html).not.toMatch(/<script[^>]+src=/);
	});

	test('a guest plan lives in IndexedDB, and only the local repo code touches it', () => {
		const owners = appCodeMentioning(/\b(indexedDB|IDBDatabase|IDBFactory)\b/);
		expect(owners.length).toBeGreaterThan(0);
		expect(owners.filter((path) => !path.startsWith('src/lib/local/'))).toEqual([]);
	});
});

describe('pages', () => {
	test('every page sets its own title', () => {
		const pages = appCode.filter(({ path }) =>
			/^src\/routes\/(.*\/)?\+(page|error)\.svelte$/.test(path)
		);
		expect(pages.length).toBeGreaterThan(0);
		expect(pages.filter(({ content }) => !/<title>/.test(content)).map(({ path }) => path)).toEqual(
			[]
		);
	});
});

describe('network access', () => {
	test('fetch is only called by backends, adapters and server code, never by a component or a route page', () => {
		expect(appCodeMentioning(/\bfetch\(/)).toEqual([
			'src/hooks.server.ts',
			'src/lib/core/openai-key.ts',
			'src/lib/core/voice.ts',
			'src/lib/openai.ts',
			'src/lib/remote-backend.ts',
			'src/lib/server/google-calendar.ts',
			'src/lib/server/location.ts',
			'src/lib/server/google-tokens.ts',
			'src/lib/server/session.ts',
			'src/routes/callback/+server.ts',
			'src/service-worker/index.ts'
		]);
	});
});
