/** Google services the user can link on top of the plain sign-in. */
export const GOOGLE_SERVICES = [
	{
		id: 'tasks',
		label: 'Tasks',
		description: 'Read and edit your Google Tasks lists.',
		scope: 'https://www.googleapis.com/auth/tasks'
	},
	{
		id: 'calendar',
		label: 'Calendar',
		description: 'Read and edit events, for syncing your plan.',
		scope: 'https://www.googleapis.com/auth/calendar.events'
	},
	{
		id: 'keep',
		label: 'Keep',
		description: 'Read and edit notes. Google only offers this to Workspace accounts.',
		scope: 'https://www.googleapis.com/auth/keep'
	}
] as const;

export type GoogleServiceId = (typeof GOOGLE_SERVICES)[number]['id'];

export function isGoogleServiceId(value: string): value is GoogleServiceId {
	return GOOGLE_SERVICES.some((service) => service.id === value);
}

/** The services whose scope Google reports as granted. */
export function servicesFromScopes(scopes: string[]): GoogleServiceId[] {
	return GOOGLE_SERVICES.filter((service) => scopes.includes(service.scope)).map(
		(service) => service.id
	);
}

/** Services are stored space separated in `users.googleServices`. */
export function parseServices(stored: string | null | undefined): GoogleServiceId[] {
	return (stored ?? '').split(' ').filter(isGoogleServiceId);
}
