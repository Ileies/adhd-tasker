#!/usr/bin/env bun
/**
 * `bun run test`: runs `bun test` with its output buffered, so a passing run costs one line.
 *
 * Always with `--isolate --randomize`. Bun only shortens its own output when it sees an agent env
 * var (`CLAUDECODE`), otherwise every passing test is listed. This prints `ok  unit tests (<secs>s): <summary>` on a pass and only the
 * failing tests (`--only-failures`) plus the summary on a fail. `--verbose` / `-v` streams plain
 * `bun test` output live instead. Any other argument is passed on to `bun test` (file filters, `-t`).
 */
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
// Every file in its own module registry and database, in a random order, so no test leans on another.
// `--parallel` spreads the files over one worker per core (11 s serial, about 2 s parallel)
const passthrough = [
	'--isolate',
	'--parallel',
	'--randomize',
	...args.filter((a) => a !== '--verbose' && a !== '-v')
];

if (verbose) {
	const proc = Bun.spawn([process.execPath, 'test', ...passthrough], {
		stdio: ['inherit', 'inherit', 'inherit']
	});
	process.exit(await proc.exited);
}

const started = performance.now();
const proc = Bun.spawn([process.execPath, 'test', '--only-failures', ...passthrough], {
	stdout: 'pipe',
	stderr: 'pipe'
});
const [out, err, code] = await Promise.all([
	new Response(proc.stdout).text(),
	new Response(proc.stderr).text(),
	proc.exited
]);
const text = `${out}${err}`.trimEnd();

if (code !== 0) {
	console.error(text);
	process.exit(code);
}

const secs = ((performance.now() - started) / 1000).toFixed(1);
const summary = text.match(/^Ran .*$/m)?.[0] ?? text.split('\n').at(-1) ?? '';
console.log(`ok  unit tests (${secs}s): ${summary}`);
