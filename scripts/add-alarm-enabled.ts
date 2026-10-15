/**
 * One-off migration: the on/off switch of an alarm, on the schedule table. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-alarm-enabled.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(schedule)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'enabled')) {
	db.run('ALTER TABLE schedule ADD COLUMN enabled integer DEFAULT 1 NOT NULL');
	console.log('added schedule.enabled');
}
console.log('alarm switch ready');
