/**
 * The app's own `db` on an in-memory SQLite database (`DATABASE_URL` is `:memory:` in tests).
 * With `--isolate` every test file gets its own database.
 */
import { is, sql } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { db } from '#lib/server/db/index.js';
import * as schema from '#lib/server/db/schema.js';

const tables = Object.values(schema as Record<string, unknown>).filter(
	(value): value is SQLiteTable => is(value, SQLiteTable)
);

/** Tables ordered children before parents, so deleting in this order never breaks a foreign key. */
function childrenFirst(all: SQLiteTable[]) {
	const parents = (table: SQLiteTable) =>
		getTableConfig(table).foreignKeys.map((key) => key.reference().foreignTable);
	const ordered: SQLiteTable[] = [];
	const visit = (table: SQLiteTable) => {
		if (ordered.includes(table)) return;
		for (const child of all.filter((other) => parents(other).includes(table))) visit(child);
		ordered.push(table);
	};
	for (const table of all) visit(table);
	return ordered;
}

let built = false;

/** Call in `beforeEach`: builds the schema on first use, later empties every table and resets ids. */
export async function resetDb() {
	if (!built) {
		const statements = await generateSQLiteMigration(
			await generateSQLiteDrizzleJson({}),
			await generateSQLiteDrizzleJson(schema)
		);
		for (const statement of statements) db.run(sql.raw(statement));
		built = true;
		return;
	}
	for (const table of childrenFirst(tables)) db.delete(table).run();
	db.run(sql`DELETE FROM sqlite_sequence`);
}
