/**
 * One-off migration: the speech language of the microphone on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-voice-language.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'voice_language')) {
	db.run('ALTER TABLE users ADD COLUMN voice_language text');
	console.log('added users.voice_language');
}
console.log('voice language ready');
