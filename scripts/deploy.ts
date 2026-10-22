#!/usr/bin/env bun
/** Build locally, deploy build/ over SSH + rsync, restart the systemd service.
 * bun run deploy [--host ros|user@server] [--remote-root /var/www/adhd-tasker]
 *                [--dry-run] [--skip-check] [--schema-applied]
 * Deploys the working tree; Git commits and pushes are independent of deployment.
 */
import { $ } from 'bun';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
	const i = args.indexOf(`--${name}`);
	if (i < 0) return fallback;
	if (!args[i + 1] || args[i + 1]!.startsWith('--')) throw new Error(`Missing --${name} value`);
	return args[i + 1]!;
};
const HOST = value('host', 'ros');
const ROOT = value('remote-root', '/var/www/adhd-tasker');
const PORT = value('port', '3002');
const PUBLIC_URL = value('url', 'https://tasker.ileies.de/');
const SERVICE = 'adhd-tasker.service';
const DRY = flag('dry-run');
const PROJECT = resolve(import.meta.dir, '..');
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
if (!/^\d+$/.test(PORT) || !ROOT.startsWith('/') || ROOT === '/') {
	throw new Error('Use a numeric port and an absolute application directory');
}
const options = new Set(['host', 'remote-root', 'port', 'url']);
for (let i = 0; i < args.length; i++) {
	const name = args[i]!.replace(/^--/, '');
	if (options.has(name)) i++;
	else if (!['dry-run', 'skip-check', 'schema-applied'].includes(name)) {
		throw new Error(`Unknown option: ${args[i]}`);
	}
}

async function remote(script: string): Promise<string> {
	const proc = Bun.spawn(['ssh', '-o', 'ConnectTimeout=10', '--', HOST, 'bash', '-s'], {
		stdin: Buffer.from(`set -euo pipefail\n${script}`),
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const [out, , code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	if (code !== 0) throw new Error(`Remote command failed (exit ${code})`);
	return out.trim();
}
async function change(script: string) {
	if (DRY) console.log(`[dry-run] ${script}`);
	else await remote(script);
}
function step(title: string) {
	console.log(`\n> ${title}`);
}

step(`Preflight: ${HOST}:${ROOT}`);
await remote(`test -d ${quote(ROOT)} && test -f ${quote(`${ROOT}/.env`)}
command -v rsync >/dev/null
command -v bun >/dev/null
systemctl cat ${SERVICE} >/dev/null
case "$(systemctl show ${SERVICE} -p ExecStart --value)" in
  *' ./index.js '*) ;;
  *) echo 'Activate the NixOS configuration with command = "./index.js" before deploying.' >&2; exit 1 ;;
esac`);
// Never print this response: it contains the target's production secrets.
const productionEnv = parseEnv(await remote(`cat ${quote(`${ROOT}/.env`)}`));
const schema = createHash('sha256')
	.update(await Bun.file(resolve(PROJECT, 'src/lib/server/db/schema.ts')).text())
	.digest('hex');
const previousSchema = await remote(
	`if [ -f ${quote(`${ROOT}/.deploy-schema`)} ]; then cat ${quote(`${ROOT}/.deploy-schema`)}; fi`
);
if (previousSchema !== schema && !flag('schema-applied')) {
	throw new Error(
		'Schema differs or has no deployment record. Apply schema changes to the target database, then use --schema-applied.'
	);
}

step('Building locally with the target configuration');
const buildEnv = { ...process.env, ...productionEnv, NODE_ENV: 'production' };
if (!flag('skip-check')) await $`bun run verify`.cwd(PROJECT).env(buildEnv);
// Always build, including with --skip-check; never ship an old build/.
await $`bun run build`.cwd(PROJECT).env(buildEnv);
if (!(await Bun.file(resolve(PROJECT, 'build/index.js')).exists())) {
	throw new Error('Build did not produce build/index.js');
}

// These remain on the target. --delete only removes obsolete deployed artifacts.
const filters = [
	'--exclude=.env*',
	'--exclude=*.db*',
	'--exclude=db-backups/',
	'--exclude=node_modules/',
	'--exclude=.deploy-schema'
];
// Protect everything in a configured data directory inside the deployment root.
const dataRelative = relative(ROOT, resolve(ROOT, productionEnv.DATA_DIR || 'data'));
if (dataRelative && dataRelative !== '..' && !dataRelative.startsWith('../')) {
	filters.push(`--exclude=/${dataRelative}/`);
}
const destination = `${HOST}:${quote(ROOT + '/')}`;
if (DRY) {
	step('Preview rsync');
	await $`rsync -az --delete --dry-run --itemize-changes ${filters} -e ${'ssh -o ConnectTimeout=10'} -- ${resolve(PROJECT, 'build') + '/'} ${destination}`;
	console.log('Dry run complete. The target was not modified.');
	process.exit(0);
}

step('Stopping service and backing up the database');
// bun loads the target .env from ROOT. Copy the database and any WAL together
// while the service is stopped. No database path or secret enters a shell command.
const backupScript = `
const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { basename, join } = require('node:path');
const db = join(Bun.env.DATA_DIR || 'data', 'local.db');
if (!existsSync(db)) throw new Error('Target database is missing; refusing deployment');
mkdirSync('db-backups', { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-');
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(db + suffix)) copyFileSync(db + suffix, 'db-backups/' + stamp + '-' + basename(db) + suffix);
}
`;
const wasActive = await remote(`systemctl is-active ${SERVICE} || true`);
let stopped = false;
try {
	await change(`systemctl stop ${SERVICE}`);
	stopped = true;
	await change(`cd ${quote(ROOT)} && bun -e ${quote(backupScript)}`);
	step('Syncing build/ to the target');
	await $`rsync -az --delete ${filters} -e ${'ssh -o ConnectTimeout=10'} -- ${resolve(PROJECT, 'build') + '/'} ${destination}`;
	await change(`printf '%s\\n' ${quote(schema)} > ${quote(`${ROOT}/.deploy-schema`)}`);
	step('Starting service');
	await change(`systemctl start ${SERVICE}`);
	stopped = false;
} catch (error) {
	if (stopped && wasActive === 'active') {
		console.error('Deployment failed; attempting to restore service availability.');
		await remote(`systemctl start ${SERVICE}`).catch(console.error);
	}
	throw error;
}

step('Checking service and HTTP');
await remote(`systemctl is-active --quiet ${SERVICE}
for attempt in {1..20}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${PORT}/ || true)
  case "$code" in 200|302|303|307|308) exit 0 ;; esac
  sleep 1
done
journalctl -u ${SERVICE} -n 20 --no-pager
exit 1`);
const publicCode = (
	await $`curl -s -o /dev/null -w ${'%{http_code}'} --max-time 20 ${PUBLIC_URL}`.text()
).trim();
if (![200, 302, 303, 307, 308].includes(Number(publicCode))) {
	throw new Error(`${PUBLIC_URL} answered ${publicCode}`);
}
console.log(`Deployed to ${HOST}:${ROOT}. ${PUBLIC_URL} answered ${publicCode}.`);
