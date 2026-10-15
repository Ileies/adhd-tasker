/**
 * One-off migration for writing to Google Calendar: `calendar_sync.write_calendar` (the calendar the user's own
 * tasks go to, empty while that is off) and `calendar_events.origin` (`google` for an imported event, `app` for one
 * the app made). Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-calendar-write.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);

function addColumn(table: string, column: string, definition: string) {
	const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
	if (columns.some((existing) => existing.name === column)) return;
	db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('calendar_sync', 'write_calendar', 'text');
addColumn('calendar_events', 'origin', "text NOT NULL DEFAULT 'google'");
console.log('calendar_sync.write_calendar and calendar_events.origin ready');
