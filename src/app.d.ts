// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { users } from '$lib/server/db/schema';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: users.$inferSelect;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
