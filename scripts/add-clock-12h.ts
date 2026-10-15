/**
 * One-off migration: the 12 hour clock flag on users, null follows the device. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-clock-12h.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'clock_12h')) {
	db.run('ALTER TABLE users ADD COLUMN clock_12h integer');
	console.log('added users.clock_12h');
}
console.log('clock format ready');
