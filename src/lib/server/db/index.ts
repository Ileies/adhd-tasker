import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { DATABASE_URL } from '$env/static/private';

export const db = drizzle(DATABASE_URL, { schema });
