/**
 * One-off migration: adds `users.google_services` (linked Google services, space separated).
 * Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-google-services.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);
const columns = db.query<{ name: string }, []>('PRAGMA table_info(users)').all();
if (columns.some((column) => column.name === 'google_services')) {
	console.log('users.google_services already exists, nothing to do');
	process.exit(0);
}

db.run("ALTER TABLE users ADD COLUMN google_services text NOT NULL DEFAULT ''");
console.log('users.google_services added');
