import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Exercise the real entry point in an isolated checkout without contacting a server. */
async function deploy(scenario = 'healthy', flags: string[] = []) {
	const dir = await mkdtemp(join(tmpdir(), 'tasker-deploy-'));
	dirs.push(dir);
	const bin = join(dir, 'bin');
	await mkdir(bin);
	await mkdir(join(dir, 'scripts'));
	await mkdir(join(dir, 'src/lib/server/db'), { recursive: true });
	await Bun.write(join(dir, 'src/lib/server/db/schema.ts'), '// test schema');
	await Bun.write(join(dir, 'scripts/deploy.ts'), Bun.file(join(import.meta.dir, 'deploy.ts')));
	const trace = join(dir, 'commands.jsonl');
	const fake = `#!${process.execPath}
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
const command = basename(process.argv[1]);
const args = process.argv.slice(2).join(' ');
const script = command === 'ssh' ? readFileSync(0, 'utf8') : args;
appendFileSync(process.env.DEPLOY_TRACE, JSON.stringify({ command, script }) + '\\n');
const scenario = process.env.DEPLOY_SCENARIO;
if (command === 'ssh') {
	if (script.includes('systemctl cat') && scenario === 'missing') process.exit(1);
	else if (script.includes('cat') && script.includes('/.env')) console.log('DATA_DIR=' + (scenario === 'custom-data-dir' ? 'persistent data' : ''));
	else if (script.includes('systemctl stop') && scenario === 'stop-fails') process.exit(1);
	else if (script.includes('bun -e') && scenario === 'backup-fails') process.exit(1);
	else if (script.includes('systemctl is-active --quiet') && scenario === 'unhealthy') process.exit(1);
	else if (script.includes('systemctl is-active')) console.log('active');
} else if (command === 'bun') {
	mkdirSync('build', { recursive: true });
	writeFileSync('build/index.js', '// test build');
} else if (command === 'curl') console.log('200');
`;
	for (const command of ['ssh', 'curl', 'bun', 'rsync']) {
		const path = join(bin, command);
		await Bun.write(path, fake);
		await chmod(path, 0o755);
	}
	const proc = Bun.spawnSync(
		[process.execPath, 'run', 'scripts/deploy.ts', '--skip-check', ...flags],
		{
			cwd: dir,
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
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
		commands,
		remote: commands.filter((c) => c.command === 'ssh')
	};
}

describe('deploy', () => {
	test('builds locally before stopping, backs up before rsync, and starts before health checks', async () => {
		const result = await deploy('healthy', ['--schema-applied']);
		expect(result.code, JSON.stringify(result)).toBe(0);
		const commands = result.commands;
		const build = commands.findIndex((c) => c.command === 'bun' && c.script === 'run build');
		const stop = commands.findIndex((c) => c.script.endsWith('systemctl stop adhd-tasker.service'));
		const backup = commands.findIndex((c) => c.script.includes('mkdirSync'));
		const sync = commands.findIndex((c) => c.command === 'rsync');
		const start = commands.findIndex((c) =>
			c.script.endsWith('systemctl start adhd-tasker.service')
		);
		const health = commands.findIndex((c) => c.script.includes('systemctl is-active --quiet'));
		expect(build).toBeGreaterThan(-1);
		expect(stop).toBeGreaterThan(build);
		expect(backup).toBeGreaterThan(stop);
		expect(sync).toBeGreaterThan(backup);
		expect(start).toBeGreaterThan(sync);
		expect(health).toBeGreaterThan(start);
		expect(commands[sync]!.script).toContain('--exclude=*.db*');
		expect(commands[sync]!.script).toContain('--exclude=/data/');
		expect(commands[sync]!.script).toContain('--exclude=.env*');
	});

	test('protects a configured data directory from rsync deletion', async () => {
		const result = await deploy('custom-data-dir', ['--schema-applied']);
		expect(result.code, JSON.stringify(result)).toBe(0);
		expect(result.commands.find((c) => c.command === 'rsync')!.script).toContain(
			'--exclude=/persistent data/'
		);
	});

	test('passes the rsync destination without literal shell quotes', async () => {
		const result = await deploy('healthy', ['--schema-applied']);
		expect(result.code, JSON.stringify(result)).toBe(0);
		expect(result.commands.find((c) => c.command === 'rsync')!.script).toEndWith(
			'ros:/var/www/adhd-tasker/'
		);
	});

	test('refuses a missing service before building or syncing', async () => {
		const result = await deploy('missing', ['--schema-applied']);
		expect(result.code).toBe(1);
		expect(result.commands.every((c) => c.command === 'ssh')).toBe(true);
		expect(result.remote.some((c) => c.script.includes('systemctl stop'))).toBe(false);
	});

	test('requires schema acknowledgement before building or stopping the service', async () => {
		const result = await deploy();
		expect(result.code).toBe(1);
		expect(result.output).toContain('Schema differs or has no deployment record');
		expect(result.commands.every((c) => c.command === 'ssh')).toBe(true);
	});

	test('does not back up or sync when stopping the service fails', async () => {
		const result = await deploy('stop-fails', ['--schema-applied']);
		expect(result.code).toBe(1);
		expect(result.remote.some((c) => c.script.includes('systemctl stop'))).toBe(true);
		expect(result.remote.some((c) => c.script.includes('mkdirSync'))).toBe(false);
		expect(result.commands.some((c) => c.command === 'rsync')).toBe(false);
	});

	test('restores an active service when the database backup fails', async () => {
		const result = await deploy('backup-fails', ['--schema-applied']);
		expect(result.code).toBe(1);
		expect(result.output).toContain('attempting to restore service availability');
		expect(result.remote.at(-1)!.script).toContain('systemctl start adhd-tasker.service');
		expect(result.commands.some((c) => c.command === 'rsync')).toBe(false);
	});

	test('fails deployment when the service is unhealthy', async () => {
		const result = await deploy('unhealthy', ['--schema-applied']);
		expect(result.code).toBe(1);
		expect(result.commands.some((c) => c.command === 'curl')).toBe(false);
	});

	test('previews rsync without stopping the service or recording a schema in a dry run', async () => {
		const result = await deploy('healthy', ['--dry-run', '--schema-applied']);
		expect(result.code, JSON.stringify(result)).toBe(0);
		expect(result.commands.find((c) => c.command === 'rsync')!.script).toContain('--dry-run');
		expect(result.remote.some((c) => /systemctl (stop|start)|printf/.test(c.script))).toBe(false);
	});
});
