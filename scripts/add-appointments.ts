/**
 * One-off migration for the flow plan, phase 4: what kind a task is (block, appointment, travel), the appointment a
 * travel task leads to, and how early the user arrives. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-appointments.ts
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

addColumn('tasks', 'kind', "text DEFAULT 'block' NOT NULL");
addColumn('tasks', 'parent_id', 'integer');
addColumn('users', 'arrive_early_minutes', 'integer DEFAULT 10 NOT NULL');
console.log('appointments ready');
