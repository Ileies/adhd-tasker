/**
 * One-off migration: the check-in chime and My day columns on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-my-day.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
const wanted = [
	['check_in_minutes', 5],
	['my_day_start', 420],
	['my_day_end', 1380]
] as const;
for (const [name, value] of wanted) {
	if (columns.some((column) => column.name === name)) continue;
	db.run(`ALTER TABLE users ADD COLUMN ${name} integer DEFAULT ${value} NOT NULL`);
	console.log(`added users.${name}`);
}
console.log('my day ready');
