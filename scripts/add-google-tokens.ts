/**
 * One-off migration for Google Calendar: the google_tokens table, one encrypted refresh token per user. Safe to run
 * twice. `drizzle-kit push` wants to rebuild the users table for unrelated differences, so this adds only what is new.
 * Usage: DATABASE_URL=local.db bun scripts/add-google-tokens.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

db.run(`CREATE TABLE IF NOT EXISTS google_tokens (
	email text PRIMARY KEY NOT NULL REFERENCES users(email) ON DELETE CASCADE,
	refresh_token text NOT NULL,
	scopes text NOT NULL,
	created_at integer NOT NULL
)`);
console.log('google_tokens ready');
