/**
 * One-off migration for the flow plan, phase 1: the todos and flow_log tables, tasks.completed_at, users.last_current_key
 * and plan_snapshots.todo_count. drizzle-kit push cannot do this one (it rebuilds tasks before the new column exists).
 * Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-todos.ts
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

addColumn('tasks', 'completed_at', 'integer');
addColumn('users', 'last_current_key', 'text');
addColumn('plan_snapshots', 'todo_count', 'integer DEFAULT 0 NOT NULL');

db.run(`CREATE TABLE IF NOT EXISTS todos (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	title text NOT NULL,
	description text DEFAULT '' NOT NULL,
	priority integer DEFAULT 2 NOT NULL,
	status text DEFAULT 'open' NOT NULL,
	estimate integer,
	learned integer DEFAULT false NOT NULL,
	progress integer DEFAULT 0 NOT NULL,
	spent_minutes integer DEFAULT 0 NOT NULL,
	skips integer DEFAULT 0 NOT NULL,
	due_date text,
	due_time integer,
	parent_id integer,
	not_before text,
	next_step text,
	created_at integer NOT NULL,
	completed_at integer
)`);

db.run(`CREATE TABLE IF NOT EXISTS flow_log (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	at integer NOT NULL,
	date text NOT NULL,
	type text NOT NULL,
	todo_id integer,
	task_id integer,
	data text NOT NULL,
	key text
)`);
db.run('CREATE UNIQUE INDEX IF NOT EXISTS flow_log_email_key ON flow_log (email, key)');
db.run('CREATE INDEX IF NOT EXISTS flow_log_email_date ON flow_log (email, date)');
console.log('todos and flow_log ready');
