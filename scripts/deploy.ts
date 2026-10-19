#!/usr/bin/env bun
/**
 * Deploys the committed state of the current branch to pronix (tasker.ileies.de).
 *
 * The server runs a clone of the GitHub repo at /var/www/adhd-tasker, so a deploy is a `git reset`
 * to this HEAD plus what a checkout cannot carry: the dependency install, the production build, a
 * database backup and a systemd restart. The build runs on the server because `DATABASE_URL` is a
 * static env, baked in from the `.env` that lives there.
 *
 * Usage:
 *   bun run deploy                   preflight, pull, build, back up, restart, verify
 *   bun run deploy --push            push the current branch first, instead of refusing
 *   bun run deploy --dry-run         run verify, print every server step without touching it
 *   bun run deploy --skip-check      skip `bun run verify` (format, tests, types, lint, build)
 *   bun run deploy --db-push         run `drizzle-kit push --force` after the backup (schema changes)
 *   bun run deploy --schema-applied  deploy a schema.ts change that is already applied by hand
 *   bun run deploy --force           deploy the committed HEAD although the working tree has uncommitted
 *                                    changes (`verify` still runs on the working tree, not on HEAD)
 *   bun run deploy --host <alias>    deploy somewhere other than `ros`
 *
 * Without --db-push or --schema-applied, a change to schema.ts since the server's commit stops the
 * deploy before the server is touched.
 */
import { $ } from 'bun';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

/** ssh alias for pronix; root is required to manage the systemd service. */
const HOST = value('host', 'ros');
const REMOTE_ROOT = value('remote-root', '/var/www/adhd-tasker');
const SERVICE = 'adhd-tasker.service';

/** Must match the nginx proxy target in /etc/nixos/hosts/pronix/nginx.nix. */
const PORT = value('port', '3002');
const PUBLIC_URL = value('url', 'https://tasker.ileies.de/');

// Runtime environment and the Bun executable belong to the NixOS service definition.

const DRY = flag('dry-run');
let failed = false;

function step(title: string) {
	console.log(`\n\x1b[1m> ${title}\x1b[0m`);
}

function mark(ok: boolean, text: string) {
	console.log(`  ${ok ? '\x1b[32mok\x1b[0m' : '\x1b[31mX\x1b[0m'} ${text}`);
	if (!ok) failed = true;
}

function fail(message: string): never {
	console.error(`\n\x1b[31mX ${message}\x1b[0m`);
	process.exit(1);
}

/**
 * Runs a command on the server. Fed to `bash -s` over stdin because root's login shell on pronix is
 * fish, which rejects `VAR=value cmd`; over stdin the script reaches bash byte for byte.
 */
async function remote(script: string): Promise<string> {
	if (DRY) {
		console.log(`  [dry-run] ssh ${HOST}: ${script}`);
		return '';
	}
	const proc = Bun.spawn(['ssh', '-o', 'ConnectTimeout=10', HOST, 'bash', '-s'], {
		stdin: Buffer.from(script),
		stdout: 'pipe',
		stderr: 'inherit'
	});
	const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (code !== 0) fail(`remote command failed (exit ${code}): ${script}`);
	return out.trim();
}

/** Same, but a non-zero exit is an expected answer rather than a failure. */
async function remoteSoft(script: string): Promise<string> {
	return await remote(`${script} || true`);
}

// === PREFLIGHT: LOCAL ===

step('Preflight (local)');

const dirty = (await $`git status --porcelain`.text()).trim();
if (dirty) {
	console.error(dirty);
	if (!flag('force'))
		fail(
			'working tree has uncommitted changes - the server deploys a commit, so it would get something else. ' +
				'Rerun with --force to deploy the committed HEAD anyway.'
		);
	console.log(
		'  --force: deploying the committed HEAD, the changes above stay local and unshipped'
	);
}

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
const head = (await $`git rev-parse HEAD`.text()).trim();
console.log(`  ${branch} @ ${head.slice(0, 8)}`);

await $`git fetch --quiet origin ${branch}`;
const ahead = (await $`git rev-list --count origin/${branch}..${branch}`.text()).trim();
const behind = (await $`git rev-list --count ${branch}..origin/${branch}`.text()).trim();

// Behind means someone else pushed, and the server is reset to this HEAD, so deploying would roll
// their work off it.
if (behind !== '0') {
	fail(
		`${behind} commit(s) on origin/${branch} are not in the local branch, so deploying would move ` +
			`${HOST} backwards past them. Pull or rebase first.`
	);
}

if (ahead !== '0') {
	if (!flag('push')) {
		fail(
			`${ahead} commit(s) not on origin, and the server deploys by pulling from it. Rerun with ` +
				`--push once you mean to publish them, or push yourself.`
		);
	}
	step(`Pushing ${ahead} commit(s) to origin/${branch}`);
	if (DRY) console.log(`  [dry-run] git push origin ${branch}`);
	else await $`git push origin ${branch}`;
}

if (!flag('skip-check')) {
	step('bun run verify');
	// Run before anything touches the server so a broken build never replaces a working one. Also in
	// a dry run, which only spares the server. verify prints one line per step, or the failing output.
	await $`bun run verify`.catch(() => fail('`bun run verify` failed - not deploying'));
}

// === PREFLIGHT: REMOTE ===

step(`Preflight (${HOST})`);

const isClone = await remoteSoft(`test -d ${REMOTE_ROOT}/.git && echo yes`);
if (!DRY && isClone !== 'yes') {
	fail(
		`${HOST}:${REMOTE_ROOT} is not a git clone. One-time setup, keeping the server's own files:\n` +
			`  ssh ${HOST} 'cd ${REMOTE_ROOT} && mkdir -p ../adhd-tasker-old && cp -a .env local.db ../adhd-tasker-old/ && ` +
			`rm -rf client server index.js handler.js adapter-node.js && ` +
			`git init -q && git remote add origin git@github.com:Ileies/adhd-tasker.git && git fetch -q origin ${branch} && git checkout -q -f ${branch}'`
	);
}

// `.env` is never synced from here: the two carry the same keys with different values (database
// path, OAuth redirect), and the build reads it.
const envExists = await remoteSoft(`test -f ${REMOTE_ROOT}/.env && echo yes`);
if (!DRY && envExists !== 'yes') {
	fail(`${HOST}:${REMOTE_ROOT}/.env is missing - the build would have no database path`);
}

// -uno: build/, node_modules/, the database and .env are untracked there by design and do not stop a
// reset. Tracked modifications do, because the reset would silently discard them.
const remoteDirty = await remote(`cd ${REMOTE_ROOT} && git status --porcelain -uno`);
if (remoteDirty) {
	console.error(remoteDirty);
	fail(`${HOST}:${REMOTE_ROOT} has modified tracked files - deploying would discard them.`);
}

const loadState = await remote('systemctl show --property=LoadState --value ' + SERVICE);
if (!DRY && loadState !== 'loaded') {
	fail(
		`${SERVICE} is not loaded on ${HOST} (${loadState || 'unknown'}). Configure the NixOS service first.`
	);
}

// The build needs Bun on the SSH user's PATH. systemd uses the executable from NixOS.
const bunPath = (await remoteSoft('command -v bun')) || (DRY ? '$(command -v bun)' : '');
if (!DRY && !bunPath) fail(`bun is not on PATH for ${HOST}`);

const previousHead = await remote(`cd ${REMOTE_ROOT} && git rev-parse HEAD`);
if (!DRY) console.log(`  clean, on ${previousHead.slice(0, 8)}, bun at ${bunPath}`);

// Checked before anything changes on the server: the new build against the old tables breaks as
// soon as it touches a new column. Exit code 1 is a difference, anything else means this repo does
// not know the server's commit, so the change cannot be ruled out either.
if (!DRY && !flag('db-push') && !flag('schema-applied')) {
	const { exitCode } =
		await $`git diff --quiet ${previousHead} ${head} -- src/lib/server/db/schema.ts`
			.nothrow()
			.quiet();
	if (exitCode !== 0) {
		fail(
			(exitCode === 1
				? `schema.ts changed since ${previousHead.slice(0, 8)}.`
				: `could not compare schema.ts with ${previousHead.slice(0, 8)}, which is not in this repo.`) +
				' Rerun with --db-push, or with --schema-applied once the schema is applied by hand.'
		);
	}
	console.log('  schema unchanged');
}

// === PULL ===

step(`Checking out ${head.slice(0, 8)} on ${HOST}`);
await remote(
	`cd ${REMOTE_ROOT} && git fetch --quiet origin ${branch} && git checkout --quiet ${branch} && git reset --hard --quiet ${head}`
);
const remoteHead = await remote(`cd ${REMOTE_ROOT} && git rev-parse HEAD`);
if (!DRY && remoteHead !== head)
	fail(`${HOST} is at ${remoteHead.slice(0, 8)}, expected ${head.slice(0, 8)}`);

// === INSTALL AND BUILD ===

// Both run while the old process still serves, so a failure leaves the site up on the previous
// build. That is why the restart comes after them.
step('Installing dependencies');
await remote(`cd ${REMOTE_ROOT} && bun install --frozen-lockfile`);

step('Building');
await remote(`cd ${REMOTE_ROOT} && bun run build`);

// === STOP, BACK UP, MIGRATE ===

// Stopping first is what makes the backup worth having: a copy taken while the app holds the file
// can catch a half-written WAL.
step(`Stopping ${SERVICE}`);
await remote(`systemctl stop ${SERVICE}`);

// Read from the server's own .env: the path decides what gets backed up and what drizzle-kit pushes.
const rawDbPath = await remoteSoft(
	`cd ${REMOTE_ROOT} && sed -n 's/^DATABASE_URL=//p' .env | tail -1`
);
const dbPath = rawDbPath.replace(/^['"]|['"]$/g, '') || 'local.db';
const stamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+$/, '').replace('T', '-');

step(`Backing up ${dbPath}`);
// -wal and -shm come along because a stop is not guaranteed to checkpoint them. Five sets are kept,
// ordered by the name (the stamp sorts lexicographically), never by mtime, since `cp -a` keeps the
// source mtime.
await remote(
	`cd ${REMOTE_ROOT} && mkdir -p db-backups && base=$(basename ${dbPath}) && ` +
		`for f in ${dbPath} ${dbPath}-wal ${dbPath}-shm; do [ -f "$f" ] && cp -a "$f" "db-backups/${stamp}-$(basename "$f")"; done; ` +
		`ls -1 db-backups/*-"$base" 2>/dev/null | sort | head -n -5 | while read -r old; do rm -f "$old" "$old"-wal "$old"-shm; done; true`
);
const backup = await remoteSoft(
	`cd ${REMOTE_ROOT} && ls -1 db-backups/*-$(basename ${dbPath}) 2>/dev/null | sort | tail -1`
);
if (!DRY)
	mark(
		Boolean(backup),
		backup ? `${REMOTE_ROOT}/${backup}` : `no copy of ${dbPath} was made - does it exist?`
	);

if (flag('db-push')) {
	step('Applying the schema (drizzle-kit push --force)');
	// drizzle-kit runs under node and connects through @libsql/client, which wants a `file:` URL
	// where the app itself takes a bare path. Overridden for this one command, `.env` is untouched.
	await remote(`cd ${REMOTE_ROOT} && DATABASE_URL=file:${dbPath} bun x drizzle-kit push --force`);
}

// === START ===

step(`Restarting ${SERVICE}`);
await remote(`systemctl restart ${SERVICE}`);

// === VERIFY ===

step('Verifying');

const serviceState = await remoteSoft(`systemctl is-active ${SERVICE}`);
if (!DRY) mark(serviceState === 'active', `systemd: ${serviceState || 'unknown'}`);

// Retried because the process needs a moment to bind the port. Unauthenticated requests may be
// answered with the page or a redirect to login; both mean the build is serving.
const OK_CODES = [200, 302, 303, 307];
const localCode = await remoteSoft(
	`curl -s -o /dev/null -w '%{http_code}' --retry 15 --retry-all-errors --retry-connrefused --max-time 30 http://127.0.0.1:${PORT}/`
);
if (!DRY) mark(OK_CODES.includes(Number(localCode)), `:${PORT} answered ${localCode || 'nothing'}`);

// The only check that covers nginx, TLS and DNS rather than just the app.
if (!DRY) {
	const publicCode = (
		await $`curl -s -o /dev/null -w '%{http_code}' --max-time 20 ${PUBLIC_URL}`
			.text()
			.catch(() => '')
	).trim();
	mark(OK_CODES.includes(Number(publicCode)), `${PUBLIC_URL} answered ${publicCode || 'nothing'}`);
}

if (failed && !DRY) {
	console.error('\n--- last 20 log lines ---');
	console.error(await remoteSoft(`journalctl -u ${SERVICE} -n 20 --no-pager`));
}

console.log(
	DRY
		? '\n\x1b[33mDry run finished. Nothing on the server was touched.\x1b[0m'
		: failed
			? `\n\x1b[31mX Deployed, but something is not healthy - see above.\x1b[0m\n` +
				`  Roll back on the server: cd ${REMOTE_ROOT} && git reset --hard ${previousHead.slice(0, 8)} && bun install && bun run build && systemctl restart ${SERVICE}`
			: `\n\x1b[32mok ${PUBLIC_URL} is on ${head.slice(0, 8)}.\x1b[0m`
);
process.exit(failed ? 1 : 0);
