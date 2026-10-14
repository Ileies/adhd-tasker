/**
 * One-off migration for phase 5: creates the `agent_actions` table. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-agent-actions.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);
db.run(`CREATE TABLE IF NOT EXISTS agent_actions (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	tool text NOT NULL,
	before text,
	after text,
	created_at integer NOT NULL,
	undone_at integer
)`);
console.log('agent_actions ready');
