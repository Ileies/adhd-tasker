/** How the Assistant activity page lists its changes: newest first, one heading per day. */
import { formatDay, localMoment, type DateKey } from '#lib/time.js';

export function groupByDay<T extends { at: number }>(
	items: T[],
	nowMs: number,
	timezone: string
): { date: DateKey; title: string; items: T[] }[] {
	const today = localMoment(nowMs, timezone).date;
	const groups: { date: DateKey; title: string; items: T[] }[] = [];
	for (const item of [...items].sort((a, b) => b.at - a.at)) {
		const date = localMoment(item.at, timezone).date;
		const last = groups.at(-1);
		if (last?.date === date) last.items.push(item);
		else groups.push({ date, title: formatDay(date, today), items: [item] });
	}
	return groups;
}
