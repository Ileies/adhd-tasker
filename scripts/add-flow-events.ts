/**
 * One-off data migration for the flow plan, phase 6: the assistant now answers an appointment that came in without
 * preparation (`appointment.added`) and a rotation after a struggle (`focus.rotated`), both on by default. Users who
 * never changed the list of events get the two added, a list somebody edited is left alone. Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-flow-events.ts
 */
import { Database } from 'bun:sqlite';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const OLD_DEFAULT = 'task.completed task.missed task.overrun';
const NEW_DEFAULT = `${OLD_DEFAULT} appointment.added focus.rotated`;

const db = new Database(url);
const { changes } = db.run('UPDATE users SET ai_events = ? WHERE ai_events = ?', [
	NEW_DEFAULT,
	OLD_DEFAULT
]);
console.log(`updated ${changes} user${changes === 1 ? '' : 's'}`);
