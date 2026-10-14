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
		'utils.ts': 'generated shadcn helper',
		'app.svelte.ts': 'the state object, used by every client test',
		'display.ts': 'browser API wiring, its rules live in tested modules',
		'speech.ts': 'browser API wiring, its rules live in tested modules',
		'server/index.ts': 'covered by the login route tests',
		'server/db/index.ts': 'used by every integration test',
		'server/db/schema.ts': 'used by every integration test',
		'format.ts': 'until soon plan 5.2 (formatLeft)',
		'google.ts': 'until soon plan 2.1',
		'server/events.ts': 'until soon plan 2.1',
		'server/stream.ts': 'until soon plan 2.1',
		'server/session.ts': 'until soon plan 2.2',
		'index.ts': 'until soon plan 3.5',
		'theme.ts': 'until UX phase 8b replaces its day window with sun.ts',
		'server/agent.ts': 'until checks plan phase 4',
		'server/assistant.ts': 'until checks plan phase 4',
		'server/schedule.ts': 'until checks plan phase 4',
		'server/voice.ts': 'until checks plan phase 4',
		'alarms.ts': 'until checks plan phase 6',
		'agent.ts': 'until checks plan phase 6',
		'assistant.ts': 'until checks plan phase 6',
		'stream.ts': 'until checks plan phase 6'
	};

	const modules = files
		.filter((path) => /^src\/lib\/([^/]+|server\/.+)\.ts$/.test(path))
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
	test('only openai.ts, voice.ts and the key check name the OpenAI host', () => {
		expect(appCodeMentioning(/api\.openai\.com/)).toEqual([
			'src/lib/openai.ts',
			'src/lib/voice.ts',
			'src/routes/settings/+page.server.ts'
		]);
	});

	test('only the chat server calls the Responses API, through buildRequest', () => {
		expect(appCodeMentioning(/\bOPENAI_URL\b/)).toEqual([
			'src/lib/openai.ts',
			'src/lib/server/assistant.ts'
		]);
	});

	test('only the voice server calls transcription and Realtime', () => {
		expect(appCodeMentioning(/\b(TRANSCRIBE_URL|REALTIME_URL)\b/)).toEqual([
			'src/lib/server/voice.ts',
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
		expect(appCodeMentioning(/\b(localStorage|sessionStorage|indexedDB)\b/)).toEqual([
			'src/app.html',
			'src/lib/alarms.ts',
			'src/lib/theme.ts'
		]);
	});
});
