/**
 * One-off migration for phase 8: the voice replies flag on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-voice.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'voice_replies')) {
	db.run('ALTER TABLE users ADD COLUMN voice_replies integer DEFAULT 0 NOT NULL');
	console.log('added users.voice_replies');
}
console.log('voice ready');
