#!/usr/bin/env bun
/**
 * Deploys the committed state of the current branch to pronix (tasker.rizinos.com).
 *
 * Unlike the other projects, the server has no git clone and no node_modules: /var/www/adhd-tasker
 * holds only the adapter-node output (`index.js`, `handler.js`, `client/`, `server/`) next to the
 * files that belong to the server (`.env`, `local.db`, `pm2.config.cjs`). The dependencies are
 * bundled into the build, so a deploy is: build here, rsync `build/`, restart pm2, verify.
 *
 * Usage:
 *   bun run deploy                 preflight, check, build, sync, restart, verify
 *   bun run deploy --push          push the current branch first, instead of refusing
 *   bun run deploy --dry-run       print every step without touching the server
 *   bun run deploy --skip-check    skip `bun run check` / `bun test`
 *   bun run deploy --host <alias>  deploy somewhere other than `home`
 */
import { $ } from 'bun';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

/** ssh alias for pronix (root@192.168.10.85); root is required for the shared pm2 daemon. */
const HOST = value('host', 'home');
const REMOTE_ROOT = value('remote-root', '/var/www/adhd-tasker');
const PM2_NAME = 'adhd-tasker';

/** Must match the nginx proxy target in /etc/nixos/hosts/pronix/nginx.nix. */
const PORT = value('port', '3002');
const PUBLIC_URL = value('url', 'https://tasker.rizinos.com/');

/** pm2 on pronix runs as root out of a shared home, not out of /root/.pm2. */
const PM2 = 'PM2_HOME=/etc/.pm2 pm2';

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
	const out = await $`ssh -o ConnectTimeout=10 ${HOST} bash -s < ${new Response(script)}`.text();
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
	fail('working tree has uncommitted changes - the build would contain something else than HEAD');
}

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
const head = (await $`git rev-parse HEAD`.text()).trim();
console.log(`  ${branch} @ ${head.slice(0, 8)}`);

await $`git fetch --quiet origin ${branch}`;
const ahead = (await $`git rev-list --count origin/${branch}..${branch}`.text()).trim();
const behind = (await $`git rev-list --count ${branch}..origin/${branch}`.text()).trim();

// Behind means this build lacks work that is already on origin, and shipping it would put an older
// state live than the one everybody else sees.
if (behind !== '0') {
	fail(
		`${behind} commit(s) on origin/${branch} are not in the local branch. Pull or rebase first.`
	);
}

if (ahead !== '0') {
	if (!flag('push')) {
		fail(
			`${ahead} commit(s) not on origin. Rerun with --push once you mean to publish them, or push yourself.`
		);
	}
	step(`Pushing ${ahead} commit(s) to origin/${branch}`);
	if (DRY) console.log(`  [dry-run] git push origin ${branch}`);
	else await $`git push origin ${branch}`;
}

if (!flag('skip-check')) {
	step('bun run check / bun test');
	if (DRY) {
		console.log('  [dry-run] check, test');
	} else {
		// Run before anything touches the server so a broken build never replaces a working one.
		// Lint is not a gate: Prettier currently flags most of the repo, which would block every deploy.
		await $`bun run check`.quiet().catch(() => fail('`bun run check` failed - not deploying'));
		await $`bun test`.quiet().catch(() => fail('`bun test` failed - not deploying'));
		console.log('  check and test pass');
	}
}

// === BUILD ===

step('Building');
if (DRY) console.log('  [dry-run] bun run build');
else await $`bun run build`.quiet().catch(() => fail('`bun run build` failed - not deploying'));

// === PREFLIGHT: REMOTE ===

step(`Preflight (${HOST})`);

const rootExists = await remoteSoft(`test -d ${REMOTE_ROOT} && echo yes`);
if (!DRY && rootExists !== 'yes') {
	fail(
		`${HOST}:${REMOTE_ROOT} does not exist - this script updates a deploy, it does not create one`
	);
}

// `.env` is never synced from here: the two carry the same keys with different values (database
// path, OAuth redirect), so copying it would break one of the machines.
const envExists = await remoteSoft(`test -f ${REMOTE_ROOT}/.env && echo yes`);
if (!DRY && envExists !== 'yes') {
	fail(`${HOST}:${REMOTE_ROOT}/.env is missing - the app would start with no config`);
}

// Schema changes are applied with `db:push`, which needs the repo and drizzle-kit, neither of which
// is on the server. The commit of the last deploy is recorded so a schema change can be flagged.
const previousCommit = await remoteSoft(`cat ${REMOTE_ROOT}/.deployed-commit 2>/dev/null`);
if (!DRY && previousCommit) {
	const known = await $`git cat-file -e ${previousCommit}^{commit}`.quiet().then(
		() => true,
		() => false
	);
	if (known) {
		const schemaChanged = (
			await $`git diff --name-only ${previousCommit} ${head} -- src/lib/server/db/schema.ts scripts`.text()
		).trim();
		if (schemaChanged) {
			console.log(
				`  \x1b[33m!\x1b[0m the schema or scripts/ changed since ${previousCommit.slice(0, 8)}:\n` +
					schemaChanged
						.split('\n')
						.map((l) => `      ${l}`)
						.join('\n') +
					`\n    apply it to ${HOST}:${REMOTE_ROOT}/local.db (a script from scripts/ or db:push) before this goes live`
			);
		}
	}
}

// === SYNC ===

step(`Syncing build/ to ${HOST}:${REMOTE_ROOT}`);
// `-rlpt`, not `-a`: keep times and modes, not the workstation's ownership. --delete drops files
// that left the build (hashed client assets) and never touches excluded paths, so the server's own
// .env, database and pm2 config survive it.
const rsyncArgs = [
	'-rlpt',
	'--delete',
	'--itemize-changes',
	...(DRY ? ['--dry-run'] : []),
	'--exclude=.env',
	'--exclude=local.db*',
	'--exclude=pm2.config.cjs',
	'--exclude=.deployed-commit',
	'build/',
	`${HOST}:${REMOTE_ROOT}/`
];
const changes = (await $`rsync ${rsyncArgs}`.text()).trim();
const changeCount = changes ? changes.split('\n').length : 0;
console.log(`  ${changeCount} file(s) ${DRY ? 'would change' : 'changed'}`);

await remote(`echo ${head} > ${REMOTE_ROOT}/.deployed-commit`);

// === RESTART ===

step(`Restarting ${PM2_NAME}`);
const known = await remoteSoft(`${PM2} describe ${PM2_NAME} >/dev/null 2>&1 && echo yes`);
if (!DRY && known !== 'yes') {
	fail(
		`no pm2 entry "${PM2_NAME}" on ${HOST}. Create it once: cd ${REMOTE_ROOT} && ${PM2} start pm2.config.cjs && ${PM2} save`
	);
}
await remote(`${PM2} restart ${PM2_NAME} --update-env`);

// === VERIFY ===

step('Verifying');

if (!DRY) {
	const status = await remoteSoft(
		`${PM2} jlist 2>/dev/null | bun -e 'const l=JSON.parse(await Bun.stdin.text());console.log(l.find(p=>p.name==="${PM2_NAME}")?.pm2_env.status??"missing")'`
	);
	mark(status === 'online', `pm2: ${status || 'unknown'}`);
}

// Retried because the process needs a moment to bind the port after a restart. Unauthenticated
// requests may be answered with the page or a redirect to login; both mean the build is serving.
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
	console.error(await remoteSoft(`${PM2} logs ${PM2_NAME} --lines 20 --nostream`));
}

console.log(
	DRY
		? '\n\x1b[33mDry run finished. Nothing on the server was touched.\x1b[0m'
		: failed
			? `\n\x1b[31mX Deployed, but something is not healthy - see above.\x1b[0m\n` +
				`  Roll back: git checkout ${previousCommit ? previousCommit.slice(0, 8) : '<previous commit>'} && bun run deploy`
			: `\n\x1b[32mok ${PUBLIC_URL} is on ${head.slice(0, 8)}.\x1b[0m`
);
process.exit(failed ? 1 : 0);
