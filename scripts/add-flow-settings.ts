/**
 * One-off migration for the flow plan's settings and the to-do's skip day: how often the app asks how it is going,
 * when the morning call starts, how long a break is, and the day a to-do was first pushed away. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-flow-settings.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
const wanted = [
	['check_minutes', 30],
	['start_work_at', 540],
	['break_minutes', 10]
] as const;
for (const [name, value] of wanted) {
	if (columns.some((column) => column.name === name)) continue;
	db.run(`ALTER TABLE users ADD COLUMN ${name} integer DEFAULT ${value} NOT NULL`);
	console.log(`added users.${name}`);
}

const todoColumns = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
if (todoColumns.length > 0 && !todoColumns.some((column) => column.name === 'skip_since')) {
	db.run('ALTER TABLE todos ADD COLUMN skip_since text');
	console.log('added todos.skip_since');
}
console.log('flow settings ready');
