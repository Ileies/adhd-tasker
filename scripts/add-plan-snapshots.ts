/**
 * One-off migration for moving a device's plan into an account: the plan_snapshots table, the account's plan as it
 * was before a move or a restore replaced it. Safe to run twice. `drizzle-kit push` wants to rebuild the users
 * table for unrelated differences, so this adds only what is new.
 * Usage: DATABASE_URL=local.db bun scripts/add-plan-snapshots.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

db.run(`CREATE TABLE IF NOT EXISTS plan_snapshots (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	created_at integer NOT NULL,
	task_count integer NOT NULL,
	alarm_count integer NOT NULL,
	file text NOT NULL
)`);
console.log('plan_snapshots ready');
