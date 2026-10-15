/**
 * One-off migration: the OpenAI speech to text flag on users. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-openai-transcribe.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

const columns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!columns.some((column) => column.name === 'openai_transcribe')) {
	db.run('ALTER TABLE users ADD COLUMN openai_transcribe integer DEFAULT 1 NOT NULL');
	console.log('added users.openai_transcribe');
}
console.log('transcribe ready');
