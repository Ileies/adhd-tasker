/**
 * Pushes small messages to the open tabs of a user over Server-Sent Events. In process only: the app runs as one
 * process, and a client that misses a push catches up on its next request, so nothing here is the source of truth.
 */
export type StreamMessage =
	/** The agent did something, fetch `/agent`. */
	| { type: 'agent' }
	/** Alarms or wakeups changed, fetch `/schedule`. */
	| { type: 'schedule' }
	/** To-dos changed, fetch `/todos`. */
	| { type: 'todos' }
	/** Routines changed or made tasks, fetch `/routines` and the plan. */
	| { type: 'routines' }
	/** The flow log got a row, fetch `/flow`. */
	| { type: 'flow' }
	| { type: 'alarm'; id: number; fireAt: number; label: string; tone: unknown; durationMin: number }
	/** An agent tone, played right now on the display device. */
	| { type: 'tone'; tone: unknown }
	/** The device that plays sound, null means every device does. */
	| { type: 'display'; device: string | null }
	| { type: 'calendar'; message: string }
	| { type: 'hello' };

interface Connection {
	device: string | null;
	send: (message: StreamMessage) => void;
}

// On globalThis so a hot reload in development does not orphan the open connections
const state = globalThis as { __taskerStreams?: Map<string, Set<Connection>> };
const connections: Map<string, Set<Connection>> = (state.__taskerStreams ??= new Map());

/** Registers one open tab, returns what to call when it closes. */
export function subscribe(
	email: string,
	device: string | null,
	send: Connection['send']
): () => void {
	const connection: Connection = { device, send };
	const own = connections.get(email) ?? new Set();
	own.add(connection);
	connections.set(email, own);
	return () => {
		own.delete(connection);
		if (own.size === 0) connections.delete(email);
	};
}

export function publish(email: string, message: StreamMessage): number {
	const own = connections.get(email);
	own?.forEach((connection) => connection.send(message));
	return own?.size ?? 0;
}

/** The chosen display device while it is connected. When it is not, every device plays, so an alarm is never silent. */
export function effectiveDisplay(email: string, configured: string | null): string | null {
	if (!configured) return null;
	return [...(connections.get(email) ?? [])].some((connection) => connection.device === configured)
		? configured
		: null;
}
