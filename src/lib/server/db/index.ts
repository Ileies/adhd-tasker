import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '#lib/server/db/schema.js';
import { DATABASE_URL } from '$app/env/private';

export const db = drizzle(DATABASE_URL, { schema });
