import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR || 'data';
mkdirSync(dataDir, { recursive: true });

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: join(dataDir, 'local.db') },
	verbose: true,
	strict: true
});
