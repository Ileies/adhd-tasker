/**
 * One-off migration for phase 7: the schedule table (alarms and wakeups) and the display device on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-schedule.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'display_device')) {
	db.run('ALTER TABLE users ADD COLUMN display_device text');
	console.log('added users.display_device');
}

db.run(`CREATE TABLE IF NOT EXISTS schedule (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	kind text NOT NULL,
	fire_at integer NOT NULL,
	minutes integer,
	repeat text DEFAULT 'none' NOT NULL,
	label text,
	note text,
	tone text,
	created_by text NOT NULL,
	status text DEFAULT 'pending' NOT NULL,
	created_at integer NOT NULL
)`);
db.run('CREATE INDEX IF NOT EXISTS schedule_due ON schedule (status, fire_at)');
console.log('schedule ready');
