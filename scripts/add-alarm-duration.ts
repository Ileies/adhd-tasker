/**
 * One-off migration: how long an alarm rings, on the schedule table. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-alarm-duration.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(schedule)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'duration_min')) {
	db.run('ALTER TABLE schedule ADD COLUMN duration_min integer DEFAULT 5 NOT NULL');
	console.log('added schedule.duration_min');
}
console.log('alarm duration ready');
