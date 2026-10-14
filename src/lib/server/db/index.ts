import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '#lib/server/db/schema.js';
import { DATABASE_URL } from '$app/env/private';

export const db = drizzle(DATABASE_URL, { schema });

// SQLite leaves foreign keys off per connection, which makes every `onDelete: 'cascade'` inert
db.$client.run('PRAGMA foreign_keys = ON');
