import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '#lib/server/db/schema.js';
import { building } from '$app/env';
import { DATA_DIR } from '$app/env/private';

const dataDir = DATA_DIR || 'data';
// Builds and isolated tests never open the runtime database.
if (!building) mkdirSync(dataDir, { recursive: true });
export const db = drizzle(building ? ':memory:' : join(dataDir, 'local.db'), { schema });

// SQLite leaves foreign keys off per connection, which makes every `onDelete: 'cascade'` inert
db.$client.run('PRAGMA foreign_keys = ON');
