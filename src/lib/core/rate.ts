import { AssistantError } from '#lib/core/context.js';

/**
 * A sliding window per key: at most `requests` inside `windowMs`, the next one throws with `message`.
 * A server shares one process between users and keys by email, a device has one user and one key.
 */
export function rateLimit(limit: { requests: number; windowMs: number }, message: string) {
	const recent = new Map<string, number[]>();
	return (key: string, now = Date.now()) => {
		const hits = (recent.get(key) ?? []).filter((at) => now - at < limit.windowMs);
		if (hits.length >= limit.requests) throw new AssistantError(message, 429);
		recent.set(key, [...hits, now]);
	};
}
