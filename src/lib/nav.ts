/** What the bar's center shows: nothing on Now (wide screens), the page title elsewhere. */

const TITLES: [string, string][] = [
	['/edit', 'Plan'],
	['/alarms', 'Alarms'],
	['/activity', 'Assistant activity'],
	['/settings', 'Settings'],
	['/about', 'About'],
	['/privacy', 'Privacy'],
	['/terms', 'Terms']
];

/** `null` for Now and for pages without a title. */
export function pageTitle(pathname: string): string | null {
	return TITLES.find(([path]) => pathname === path || pathname.startsWith(path + '/'))?.[1] ?? null;
}

/** Which of the two places the switch marks as current. */
export function place(pathname: string): 'now' | 'plan' | null {
	if (pathname === '/') return 'now';
	return pathname === '/edit' || pathname.startsWith('/edit/') ? 'plan' : null;
}
