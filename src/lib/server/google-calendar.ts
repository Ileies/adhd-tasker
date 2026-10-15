/**
 * The Google side of Calendar: an access token from the stored refresh token, the user's calendars and their
 * events. Nothing here writes to Google. The rules about what an event becomes are in `#lib/core/calendar.ts`.
 */
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';
import type { CalendarEvent } from '#lib/core/calendar.js';
import { accessTokens, readRefreshToken } from '#lib/server/google-tokens.js';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const API = 'https://www.googleapis.com/calendar/v3';

/** At most this many events of one calendar are read in one go, a calendar with more is cut. */
const MAX_EVENTS = 1000;

/** Google no longer accepts the grant (the user removed the app, or the token expired): linking has to be redone. */
export class GoogleAuthError extends Error {}
/** Google answered something else than success. */
export class GoogleError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

const tokens = accessTokens;

/** An access token for the user, kept in memory until a minute before it expires. */
export async function accessToken(email: string, now: number): Promise<string> {
	const cached = tokens.get(email);
	if (cached && cached.expiresAt - 60_000 > now) return cached.token;

	const refresh = readRefreshToken(email);
	if (!refresh) throw new GoogleAuthError('Google is not linked');
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: PUBLIC_GOOGLE_CLIENT_ID,
			client_secret: GOOGLE_CLIENT_SECRET,
			refresh_token: refresh,
			grant_type: 'refresh_token'
		})
	});
	const body = (await response.json().catch(() => ({}))) as {
		access_token?: string;
		expires_in?: number;
		error?: string;
	};
	if (body.error === 'invalid_grant') {
		tokens.delete(email);
		throw new GoogleAuthError('Google no longer accepts the link');
	}
	if (!response.ok || !body.access_token)
		throw new GoogleError('Google did not give an access token', response.status);
	tokens.set(email, {
		token: body.access_token,
		expiresAt: now + (body.expires_in ?? 3600) * 1000
	});
	return body.access_token;
}

async function get<T>(email: string, now: number, path: string, query: Record<string, string>) {
	const url = new URL(`${API}${path}`);
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${await accessToken(email, now)}` }
	});
	// 401 with a fresh token and 403 for a scope the grant lacks both mean linking has to be redone
	if (response.status === 401) {
		tokens.delete(email);
		throw new GoogleAuthError('Google refused the access token');
	}
	if (!response.ok) throw new GoogleError(`Google answered ${response.status}`, response.status);
	return (await response.json()) as T;
}

export interface CalendarInfo {
	id: string;
	name: string;
	primary: boolean;
}

/** The calendars the user can read, the primary one first. */
export async function listCalendars(email: string, now: number): Promise<CalendarInfo[]> {
	const found: CalendarInfo[] = [];
	let pageToken: string | undefined;
	do {
		const page = await get<{
			items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean }[];
			nextPageToken?: string;
		}>(email, now, '/users/me/calendarList', {
			minAccessRole: 'reader',
			maxResults: '100',
			...(pageToken ? { pageToken } : {})
		});
		for (const item of page.items ?? [])
			found.push({
				id: item.id,
				name: item.summaryOverride ?? item.summary ?? item.id,
				primary: item.primary === true
			});
		pageToken = page.nextPageToken;
	} while (pageToken);
	return found.sort(
		(a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)
	);
}

/** Events that start inside the window, recurring ones as single instances, deleted ones left out. */
export async function listEvents(
	email: string,
	now: number,
	calendarId: string,
	window: { timeMin: string; timeMax: string }
): Promise<CalendarEvent[]> {
	const events: CalendarEvent[] = [];
	let pageToken: string | undefined;
	do {
		const page = await get<{ items?: CalendarEvent[]; nextPageToken?: string }>(
			email,
			now,
			`/calendars/${encodeURIComponent(calendarId)}/events`,
			{
				...window,
				singleEvents: 'true',
				showDeleted: 'false',
				maxResults: '250',
				...(pageToken ? { pageToken } : {})
			}
		);
		events.push(...(page.items ?? []));
		pageToken = events.length < MAX_EVENTS ? page.nextPageToken : undefined;
	} while (pageToken);
	return events;
}
