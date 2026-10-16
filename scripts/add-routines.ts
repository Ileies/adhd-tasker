/**
 * One-off migration for the flow plan, phase 5: the routines table (tasks at a time that repeat) and tasks.routine_id.
 * Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-routines.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

function addColumn(table: string, column: string, definition: string) {
	const columns = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (columns.some((entry) => entry.name === column)) return;
	db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	console.log(`added ${table}.${column}`);
}

addColumn('tasks', 'routine_id', 'integer');

db.run(`CREATE TABLE IF NOT EXISTS routines (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	title text NOT NULL,
	description text DEFAULT '' NOT NULL,
	priority integer DEFAULT 2 NOT NULL,
	start_time integer NOT NULL,
	duration integer NOT NULL,
	shift integer DEFAULT 0 NOT NULL,
	kind text DEFAULT 'block' NOT NULL,
	repeat text NOT NULL,
	first_day text NOT NULL,
	last_day text,
	through text
)`);
console.log('routines ready');
