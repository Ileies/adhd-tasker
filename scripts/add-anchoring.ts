/**
 * One-off migration for phase 9: the hyperfocus alarm settings on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-anchoring.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
const add = (name: string, definition: string) => {
	if (columns.some((column) => column.name === name)) return;
	db.run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
	console.log(`added users.${name}`);
};

add('hyperfocus_alarm', 'integer DEFAULT 1 NOT NULL');
add('overrun_minutes', 'integer DEFAULT 15 NOT NULL');
console.log('anchoring ready');
