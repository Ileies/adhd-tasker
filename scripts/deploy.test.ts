import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Exercise the real entry point without contacting or changing a server. */
async function deploy(scenario = 'healthy', flags: string[] = []) {
	const dir = await mkdtemp(join(tmpdir(), 'tasker-deploy-'));
	dirs.push(dir);
	const trace = join(dir, 'commands.jsonl');
	const fake = `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
const command = basename(process.argv[1]);
const args = process.argv.slice(2).join(' ');
const script = command === 'ssh' ? readFileSync(0, 'utf8') : args;
appendFileSync(process.env.DEPLOY_TRACE, JSON.stringify({ command, script }) + '\\n');
const scenario = process.env.DEPLOY_SCENARIO;
if (command === 'git') {
	if (args.includes('--abbrev-ref')) console.log('main');
	else if (args.startsWith('rev-parse')) console.log('123456789abcdef');
	else if (args.startsWith('rev-list')) console.log('0');
} else if (command === 'ssh') {
	if (script.includes('test -d') || script.includes('test -f')) console.log('yes');
	else if (script.includes('command -v bun')) console.log('/nix/store/test-bun/bin/bun');
	else if (script.includes('LoadState')) console.log(scenario === 'missing' ? 'not-found' : 'loaded');
	else if (script.includes('git rev-parse')) console.log('123456789abcdef');
	else if (script.includes('systemctl stop') && scenario === 'stop-fails') process.exit(1);
	else if (script.includes('systemctl is-active')) console.log(scenario === 'unhealthy' ? 'failed' : 'active');
	else if (script.includes("sed -n")) console.log('local.db');
	else if (script.includes('ls -1') && !script.includes('mkdir')) console.log('db-backups/test-local.db');
	else if (script.includes('curl')) console.log('200');
} else if (command === 'curl') console.log('200');
`;
	for (const command of ['git', 'ssh', 'curl']) {
		const path = join(dir, command);
		await Bun.write(path, fake);
		await chmod(path, 0o755);
	}
	const proc = Bun.spawnSync(
		[process.execPath, 'run', 'scripts/deploy.ts', '--skip-check', ...flags],
		{
			env: {
				...process.env,
				PATH: `${dir}:${process.env.PATH}`,
				DEPLOY_TRACE: trace,
				DEPLOY_SCENARIO: scenario
			},
			stdout: 'pipe',
			stderr: 'pipe'
		}
	);
	const commands = (await Bun.file(trace).text())
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as { command: string; script: string });
	return {
		code: proc.exitCode,
		output: proc.stdout.toString() + proc.stderr.toString(),
		remote: commands.filter((c) => c.command === 'ssh')
	};
}

describe('deploy', () => {
	test('stops the systemd service before backup and restarts it before health checks', async () => {
		const result = await deploy();
		expect(result.code, JSON.stringify(result)).toBe(0);
		const scripts = result.remote.map((c) => c.script);
		const stop = scripts.indexOf('systemctl stop adhd-tasker.service');
		const backup = scripts.findIndex((s) => s.includes('mkdir -p db-backups'));
		const restart = scripts.indexOf('systemctl restart adhd-tasker.service');
		const health = scripts.indexOf('systemctl is-active adhd-tasker.service || true');
		expect(stop).toBeGreaterThan(-1);
		expect(backup).toBeGreaterThan(stop);
		expect(restart).toBeGreaterThan(backup);
		expect(health).toBeGreaterThan(restart);
		expect(scripts.join('\n')).not.toContain('pm2');
	});

	test('refuses a missing service before changing the server checkout', async () => {
		const result = await deploy('missing');
		expect(result.code).toBe(1);
		expect(result.output).toContain('adhd-tasker.service is not loaded');
		expect(result.remote.some((c) => c.script.includes('git reset'))).toBe(false);
	});

	test('does not back up or migrate when stopping the service fails', async () => {
		const result = await deploy('stop-fails', ['--db-push']);
		expect(result.code).toBe(1);
		expect(result.remote.map((c) => c.script)).toContain('systemctl stop adhd-tasker.service');
		expect(result.remote.some((c) => c.script.includes('mkdir -p db-backups'))).toBe(false);
		expect(result.remote.some((c) => c.script.includes('drizzle-kit push'))).toBe(false);
	});

	test('reports an unhealthy service with journal logs and a systemd rollback command', async () => {
		const result = await deploy('unhealthy');
		expect(result.code).toBe(1);
		expect(result.output).toContain('systemd: failed');
		expect(result.output).toContain('systemctl restart adhd-tasker.service');
		expect(result.remote.map((c) => c.script)).toContain(
			'journalctl -u adhd-tasker.service -n 20 --no-pager || true'
		);
	});

	test('prints the systemd steps in a dry run without connecting to the server', async () => {
		const result = await deploy('healthy', ['--dry-run']);
		expect(result.code).toBe(0);
		expect(result.remote).toEqual([]);
		expect(result.output).toContain('systemctl restart adhd-tasker.service');
	});
});
