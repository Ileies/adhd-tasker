/**
 * One-off migration for phase 6: event log, agent cards, usage log and the agent settings on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-agent-events.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

function addColumn(table: string, name: string, definition: string) {
	const columns = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (columns.some((column) => column.name === name)) return;
	db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
	console.log(`added ${table}.${name}`);
}

addColumn('users', 'ai_autonomy', `text DEFAULT 'suggest' NOT NULL`);
addColumn('users', 'ai_events', `text DEFAULT 'task.completed task.missed task.overrun' NOT NULL`);
addColumn('users', 'quiet_start', 'integer DEFAULT 1320 NOT NULL');
addColumn('users', 'quiet_end', 'integer DEFAULT 420 NOT NULL');
addColumn('users', 'daily_token_budget', 'integer');
addColumn('users', 'last_current_task_id', 'integer');
addColumn('agent_actions', 'event_id', 'integer');
addColumn('agent_actions', 'reason', 'text');

db.run(`CREATE TABLE IF NOT EXISTS events (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	type text NOT NULL,
	payload text NOT NULL,
	origin text NOT NULL,
	key text,
	created_at integer NOT NULL,
	handled_at integer,
	outcome text
)`);
db.run('CREATE UNIQUE INDEX IF NOT EXISTS events_email_key ON events (email, key)');

db.run(`CREATE TABLE IF NOT EXISTS agent_cards (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	kind text NOT NULL,
	text text NOT NULL,
	options text,
	event_id integer,
	created_at integer NOT NULL,
	resolved_at integer
)`);

db.run(`CREATE TABLE IF NOT EXISTS ai_usage (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	use text NOT NULL,
	tokens integer NOT NULL,
	created_at integer NOT NULL
)`);
console.log('agent events ready');
