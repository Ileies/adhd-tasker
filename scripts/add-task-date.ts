/**
 * One-off migration for phase 3: adds `tasks.date` and puts every existing task on today
 * (today in the owner's timezone, UTC when none is saved). Safe to run twice.
 * Usage: DATABASE_URL=local.db bun scripts/add-task-date.ts
 */
import { Database } from 'bun:sqlite';
import { todayIn } from '../src/lib/time';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url);
const columns = db.query<{ name: string }, []>('PRAGMA table_info(tasks)').all();
if (columns.some((column) => column.name === 'date')) {
	console.log('tasks.date already exists, nothing to do');
	process.exit(0);
}

db.transaction(() => {
	db.run("ALTER TABLE tasks ADD COLUMN date text NOT NULL DEFAULT ''");
	const users = db
		.query<{ email: string; timezone: string | null }, []>('SELECT email, timezone FROM users')
		.all();
	for (const user of users) {
		db.run('UPDATE tasks SET date = ? WHERE email = ?', [
			todayIn(user.timezone ?? 'UTC'),
			user.email
		]);
	}
})();
console.log('tasks.date added, existing tasks moved to today');
