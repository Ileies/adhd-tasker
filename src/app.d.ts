// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { users } from '#lib/server/db/schema.js';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: users.$inferSelect;
		}
		interface PageData {
			user?: Omit<users.$inferSelect, 'openaiKey'> & { hasOpenaiKey: boolean };
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
