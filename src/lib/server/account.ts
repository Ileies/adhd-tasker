/**
 * Moving a device's plan into an account and bringing a replaced plan back (local first plan 5.3). Every
 * change is one SQLite transaction: a failure halfway writes nothing. A plan is never changed without a
 * snapshot of what it was, kept for 30 days, so a move can always be taken back. The rules about what is
 * compared and what is a duplicate are in `core/export.ts` and `core/merge.ts`.
 */
import { and, desc, eq, lt, gte } from 'drizzle-orm';
import {
	assembleExport,
	EXPORT_LIMITS,
	parseExport,
	sameTask,
	type ExportFile,
	type ImportResult
} from '#lib/core/export.js';
import { db } from '#lib/server/db/index.js';
import { planSnapshots, schedule, tasks, users } from '#lib/server/db/schema.js';

export const SNAPSHOT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `both` adds the device's plan to the account's, `replace` puts it in place of the account's plan from today on. */
export type MoveMode = 'both' | 'replace';
export const MOVE_MODES: readonly MoveMode[] = ['both', 'replace'];

export interface MoveResult extends ImportResult {
	/** The account's plan as it was before, to bring back with `restoreSnapshot`. */
	snapshotId: number;
}

export interface SnapshotInfo {
	id: number;
	createdAt: number;
	tasks: number;
	alarms: number;
}

/** A transaction handle or the database itself: both answer the same queries. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The rows are written in pieces, SQLite allows only so many values in one statement. */
const CHUNK = 100;
const chunks = <T>(items: T[]) =>
	Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
		items.slice(i * CHUNK, (i + 1) * CHUNK)
	);

/** Everything an account has that an export holds, read inside the transaction. */
function readAccount(tx: Tx, email: string, now: number): ExportFile {
	const [user] = tx.select().from(users).where(eq(users.email, email)).limit(1).all();
	if (!user) throw new Error('Unknown account');
	return assembleExport({
		settings: user,
		tasks: tx.select().from(tasks).where(eq(tasks.email, email)).all(),
		schedule: tx
			.select()
			.from(schedule)
			.where(and(eq(schedule.email, email), eq(schedule.status, 'pending')))
			.all(),
		now
	});
}

function saveSnapshot(tx: Tx, email: string, file: ExportFile, now: number): number {
	tx.delete(planSnapshots)
		.where(
			and(eq(planSnapshots.email, email), lt(planSnapshots.createdAt, now - SNAPSHOT_DAYS * DAY_MS))
		)
		.run();
	const [row] = tx
		.insert(planSnapshots)
		.values({
			email,
			createdAt: now,
			taskCount: file.tasks.length,
			alarmCount: file.alarms.length,
			file
		})
		.returning({ id: planSnapshots.id })
		.all();
	return row.id;
}

/** Writes what the file holds that the account does not have yet. Answers what was added and what was already there. */
function writeFile(
	tx: Tx,
	email: string,
	file: ExportFile,
	now: number,
	keepPast = false
): ImportResult {
	const known = new Set(tx.select().from(tasks).where(eq(tasks.email, email)).all().map(sameTask));
	const fresh = file.tasks.filter((task) => {
		const key = sameTask(task);
		if (known.has(key)) return false;
		known.add(key);
		return true;
	});
	for (const part of chunks(fresh))
		tx.insert(tasks)
			.values(part.map((task) => ({ ...task, email })))
			.run();

	const pending = tx
		.select()
		.from(schedule)
		.where(
			and(eq(schedule.email, email), eq(schedule.kind, 'alarm'), eq(schedule.status, 'pending'))
		)
		.all();
	let alarms = 0;
	for (const alarm of file.alarms) {
		// A one-off alarm in the past would only be retired, an old alarm is not worth bringing back.
		// A restore brings back exactly what was there.
		if (!keepPast && alarm.repeat === 'none' && alarm.fireAt < now) continue;
		const same = pending.some(
			(entry) =>
				entry.fireAt === alarm.fireAt &&
				entry.repeat === alarm.repeat &&
				(entry.label ?? '') === alarm.label
		);
		if (same || pending.length >= EXPORT_LIMITS.alarms) continue;
		const [row] = tx
			.insert(schedule)
			.values({
				email,
				kind: 'alarm',
				fireAt: alarm.fireAt,
				minutes: alarm.minutes,
				repeat: alarm.repeat,
				label: alarm.label,
				tone: alarm.tone,
				durationMin: alarm.durationMin,
				createdBy: 'user',
				createdAt: now
			})
			.returning()
			.all();
		pending.push(row);
		alarms++;
	}

	return { tasks: fresh.length, skipped: file.tasks.length - fresh.length, alarms };
}

const applySettings = (tx: Tx, email: string, settings: ExportFile['settings']) => {
	if (Object.keys(settings).length > 0)
		tx.update(users).set(settings).where(eq(users.email, email)).run();
};

/**
 * Moves a device's plan into the account. A new account (no task, no alarm) takes the device's settings with
 * it, an existing one keeps its own unless `replace` was chosen. `replace` removes the account's tasks from
 * `today` on and all its alarms first. The account's plan is stored as a snapshot before anything changes.
 */
export function moveIntoAccount(
	email: string,
	file: ExportFile,
	mode: MoveMode,
	today: string,
	now: number
): MoveResult {
	return db.transaction((tx) => {
		const before = readAccount(tx, email, now);
		const snapshotId = saveSnapshot(tx, email, before, now);
		const wasEmpty = before.tasks.length === 0 && before.alarms.length === 0;

		if (mode === 'replace') {
			tx.delete(tasks)
				.where(and(eq(tasks.email, email), gte(tasks.date, today)))
				.run();
			tx.delete(schedule)
				.where(
					and(eq(schedule.email, email), eq(schedule.kind, 'alarm'), eq(schedule.status, 'pending'))
				)
				.run();
		}
		const result = writeFile(tx, email, file, now);
		if (mode === 'replace' || wasEmpty) applySettings(tx, email, file.settings);
		return { ...result, snapshotId };
	});
}

/** The snapshots that are still there, newest first. A snapshot of an empty plan is only there for Undo. */
export function listSnapshots(email: string, now: number): SnapshotInfo[] {
	return db
		.select({
			id: planSnapshots.id,
			createdAt: planSnapshots.createdAt,
			tasks: planSnapshots.taskCount,
			alarms: planSnapshots.alarmCount
		})
		.from(planSnapshots)
		.where(
			and(
				eq(planSnapshots.email, email),
				gte(planSnapshots.createdAt, now - SNAPSHOT_DAYS * DAY_MS)
			)
		)
		.orderBy(desc(planSnapshots.id))
		.all()
		.filter((snapshot) => snapshot.tasks > 0 || snapshot.alarms > 0);
}

/**
 * Puts the account's plan, alarms and settings back as the snapshot has them. What is there now is stored as a
 * snapshot first, so a restore can be taken back too. `null` when the account has no such snapshot.
 */
export function restoreSnapshot(email: string, id: number, now: number): MoveResult | null {
	return db.transaction((tx) => {
		const [row] = tx
			.select()
			.from(planSnapshots)
			.where(and(eq(planSnapshots.email, email), eq(planSnapshots.id, id)))
			.limit(1)
			.all();
		if (!row) return null;
		const parsed = parseExport(row.file);
		if (!parsed.ok) throw new Error(`The snapshot cannot be read: ${parsed.error}`);

		const snapshotId = saveSnapshot(tx, email, readAccount(tx, email, now), now);
		tx.delete(tasks).where(eq(tasks.email, email)).run();
		tx.delete(schedule)
			.where(
				and(eq(schedule.email, email), eq(schedule.kind, 'alarm'), eq(schedule.status, 'pending'))
			)
			.run();
		const result = writeFile(tx, email, parsed.value, now, true);
		applySettings(tx, email, parsed.value.settings);
		return { ...result, snapshotId };
	});
}
