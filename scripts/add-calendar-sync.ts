/**
 * One-off migration for reading Google Calendar: the calendar_sync and calendar_events tables. Safe to run twice.
 * `drizzle-kit push` wants to rebuild the users table for unrelated differences, so this adds only what is new.
 * Usage: DATABASE_URL=local.db bun scripts/add-calendar-sync.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

db.run(`CREATE TABLE IF NOT EXISTS calendar_sync (
	email text PRIMARY KEY NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	calendars text NOT NULL,
	status text NOT NULL,
	synced_at integer,
	created_at integer NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS calendar_events (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	calendar_id text NOT NULL,
	event_id text NOT NULL,
	etag text NOT NULL,
	kind text NOT NULL,
	title text NOT NULL,
	dates text NOT NULL,
	task_ids text NOT NULL
)`);
db.run(
	'CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_key ON calendar_events (email, calendar_id, event_id)'
);
console.log('calendar_sync and calendar_events ready');
