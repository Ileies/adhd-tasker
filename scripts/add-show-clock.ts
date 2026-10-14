/**
 * One-off migration: the show clock flag on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-show-clock.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'show_clock')) {
	db.run('ALTER TABLE users ADD COLUMN show_clock integer DEFAULT 0 NOT NULL');
	console.log('added users.show_clock');
}
console.log('clock ready');
