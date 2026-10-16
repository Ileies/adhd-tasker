/** Response header the server sets on every page it sends to a guest (nobody signed in). */
export const SHELL_HEADER = 'x-app-shell';
export const SHELL_GUEST = 'guest';

/** What the service worker does with a page it just fetched: keep it as the offline copy, drop the old copy, or leave it alone. */
export type ShellAction = 'store' | 'forget' | 'ignore';

/**
 * Only a guest's page may be kept for offline use: it holds no plan (a guest's plan is read from the device), so
 * nothing private is cached and it never shows another person's tasks. A page of a signed in visitor carries their
 * plan, so it is never kept and it removes the copy a guest left behind (an offline reload then fails, as before).
 * Errors and redirects change nothing.
 */
export function shellAction(response: {
	ok: boolean;
	redirected: boolean;
	headers: { get(name: string): string | null };
}): ShellAction {
	if (!response.ok || response.redirected) return 'ignore';
	return response.headers.get(SHELL_HEADER) === SHELL_GUEST ? 'store' : 'forget';
}

/** One offline copy per page address, without the query: `/edit?x=1` and `/edit` are the same page. */
export function shellKey(url: string): string {
	const { origin, pathname } = new URL(url);
	return origin + pathname;
}
