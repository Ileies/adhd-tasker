#!/usr/bin/env bun
/**
 * `bun run verify`: everything that must pass before a commit or a deploy, cheapest and most likely
 * failure first. The steps run side by side (the machine has the cores, and 10 s of tests would otherwise
 * wait behind 40 s of lint) and are reported in this order. The first failure stops the rest and prints its
 * output, otherwise one line per step.
 *
 * 1. format       prettier --check .
 * 2. tests        TZ=UTC bun test --isolate --randomize --coverage, at least 90 % of all lines and
 *                 functions (weighted over the whole report, see `scripts/coverage.ts`)
 * 3. timezones    the same tests without coverage in UTC+14 and in a half hour offset with DST
 * 4. types        bun run check
 * 5. lint         eslint . (type aware)
 * 6. unused code  knip: unused files, exports and dependencies (`knip.json`)
 * 7. build        bun run build
 *
 * `--quick` runs steps 1 to 4, the check before every commit. Deploy runs all of them.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageFailures, overallCoverage, percent } from './coverage.js';

const MINIMUM_COVERAGE = 0.9;

type Outcome = { ok: boolean; detail?: string };
type Step = {
	name: string;
	cmd: string[];
	env?: Record<string, string>;
	/** Starts only once this step has passed: build and types both write `.svelte-kit`. */
	needs?: string;
	/** Runs after a passing command and can still fail the step. */
	after?: () => Promise<Outcome>;
};

const quick = process.argv.includes('--quick');
const bun = process.execPath;
const tests = ['test', '--isolate', '--parallel', '--randomize', '--only-failures'];
const coverageDir = await mkdtemp(join(tmpdir(), 'tasker-coverage-'));

const steps: Step[] = [
	{ name: 'format', cmd: [bun, 'x', 'prettier', '--check', '.'] },
	{
		name: 'tests with coverage',
		cmd: [bun, ...tests, '--coverage', '--coverage-reporter=lcov', '--coverage-dir', coverageDir],
		env: { TZ: 'UTC' },
		async after() {
			const coverage = overallCoverage(await Bun.file(join(coverageDir, 'lcov.info')).text());
			const failures = coverageFailures(coverage, MINIMUM_COVERAGE);
			const measured = `lines ${percent(coverage.lines)}, functions ${percent(coverage.functions)}`;
			return { ok: failures.length === 0, detail: failures.join('\n') || measured };
		}
	},
	{ name: 'tests in UTC+14', cmd: [bun, ...tests], env: { TZ: 'Pacific/Kiritimati' } },
	{ name: 'tests in UTC-3:30', cmd: [bun, ...tests], env: { TZ: 'America/St_Johns' } },
	{ name: 'types', cmd: [bun, 'run', 'check'] },
	...(quick
		? []
		: [
				{ name: 'lint', cmd: [bun, 'x', 'eslint', '.'] },
				{ name: 'unused code', cmd: [bun, 'x', 'knip', '--no-progress'] },
				{ name: 'build', cmd: [bun, 'run', 'build'], needs: 'types' }
			])
];

const running = new Set<Bun.Subprocess>();

async function run(step: Step): Promise<Outcome> {
	const proc = Bun.spawn(step.cmd, {
		env: { ...process.env, ...step.env },
		stdout: 'pipe',
		stderr: 'pipe'
	});
	running.add(proc);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	running.delete(proc);
	if (code !== 0) return { ok: false, detail: `${out}${err}`.trimEnd() };
	return step.after ? step.after() : { ok: true };
}

const started = performance.now();
const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)}s`;
let failed = false;

// Every step starts at once (after the step it needs), the results are read in order
const runs = new Map<string, Promise<Outcome & { took: string }>>();
for (const step of steps) {
	const gate = step.needs ? runs.get(step.needs) : undefined;
	runs.set(
		step.name,
		(async () => {
			if (gate && !(await gate).ok)
				return { ok: false, detail: `needs ${step.needs}`, took: '0.0s' };
			const stepStarted = performance.now();
			const outcome = await run(step);
			return { ...outcome, took: seconds(stepStarted) };
		})()
	);
}

try {
	for (const step of steps) {
		const outcome = await runs.get(step.name)!;
		const line = `${outcome.ok ? 'ok  ' : 'FAIL'} ${step.name} (${outcome.took})`;
		if (outcome.ok) {
			console.log(outcome.detail ? `${line}: ${outcome.detail}` : line);
			continue;
		}
		console.error(`${line}\n${outcome.detail ?? ''}`.trimEnd());
		failed = true;
		break;
	}
} finally {
	for (const proc of running) proc.kill();
	await rm(coverageDir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log(`verify${quick ? ' --quick' : ''} passed in ${seconds(started)}`);
