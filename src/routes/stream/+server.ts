import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { subscribe, type StreamMessage } from '#lib/server/stream.js';
import { announceDisplay } from '#lib/server/schedule.js';

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: tells the open screen about alarms, agent cards, schedule changes and which device plays sound.
 * Messages are hints, the client fetches the real data itself, so a missed message costs nothing.
 */
export const GET: RequestHandler = async ({ locals, url, request }) => {
	if (!locals.user) error(401, 'Login required');
	const email = locals.user.email;
	const device = url.searchParams.get('device')?.slice(0, 64) || null;

	let close = () => {};
	const body = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const write = (text: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					close();
				}
			};

			const unsubscribe = subscribe(email, device, (message: StreamMessage) =>
				write(`data: ${JSON.stringify(message)}\n\n`)
			);
			// A comment line keeps proxies from closing a quiet connection
			const beat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(beat);
				unsubscribe();
				// Tabs that were using this device as the display now fall back to playing sound themselves
				announceDisplay(email).catch(() => {});
				try {
					controller.close();
				} catch {
					// already closed by the client
				}
			};
			request.signal.addEventListener('abort', close);

			write('retry: 3000\n\n');
			write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
			announceDisplay(email).catch(() => {});
		},
		cancel() {
			close();
		}
	});

	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no'
		}
	});
};
