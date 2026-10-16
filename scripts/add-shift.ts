/**
 * One-off migration for the flow plan, phase 5: how far a task at a time may move to make room for an appointment.
 * Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-shift.ts
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

addColumn('tasks', 'shift', 'integer DEFAULT 0 NOT NULL');
console.log('shift ready');
