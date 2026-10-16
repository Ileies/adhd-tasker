/**
 * One-off migration: how often the app asks how it is going and when the morning call starts. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-flow-settings.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
const wanted = [
	['check_minutes', 30],
	['start_work_at', 540]
] as const;
for (const [name, value] of wanted) {
	if (columns.some((column) => column.name === name)) continue;
	db.run(`ALTER TABLE users ADD COLUMN ${name} integer DEFAULT ${value} NOT NULL`);
	console.log(`added users.${name}`);
}
console.log('flow settings ready');
