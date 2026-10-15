/**
 * One-off migration: where the user is, for the daylight theme, as columns on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-location.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
const wanted = [
	['location_lat', 'real'],
	['location_lon', 'real'],
	['location_name', 'text'],
	['location_source', 'text']
] as const;
for (const [name, type] of wanted) {
	if (columns.some((column) => column.name === name)) continue;
	db.run(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
	console.log(`added users.${name}`);
}
console.log('location ready');
