import { BackendError, type Backend } from '#lib/backend.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** What the server said was wrong, `fallback` when it said nothing readable. */
async function reasonOf(response: Response, fallback?: string) {
	const body = await response.json().catch(() => null);
	return typeof body?.message === 'string'
		? body.message
		: (fallback ?? `error ${response.status}`);
}

/** One request. Throws a `BackendError` when the server cannot be reached or answers with an error. */
async function request(url: string, init?: RequestInit, fallback?: string) {
	const response = await send(url, init);
	if (!response.ok) throw new BackendError(await reasonOf(response, fallback), response.status);
	return response;
}

/** One request whose answer is looked at by the caller, only a lost connection throws. */
async function send(url: string, init?: RequestInit) {
	try {
		return await fetch(url, init);
	} catch {
		throw new BackendError('Could not reach the server.', null);
	}
}

const post = (url: string, body: unknown, fallback?: string) =>
	request(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }, fallback);

/** The backend of an account: everything goes to this server. */
export const remoteBackend: Backend = {
	tasks: {
		async load(date) {
			return (await request(`/edit?date=${date}`)).json();
		},
		async create(task) {
			return (await post('/edit', task)).json();
		},
		async update(task) {
			await request('/edit', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(task) });
		},
		async delete(id) {
			await request('/edit', {
				method: 'DELETE',
				headers: JSON_HEADERS,
				body: JSON.stringify({ id })
			});
		}
	},

	schedule: {
		async load() {
			const response = await send('/schedule');
			if (!response.ok) return null;
			const { alarms, wakeups } = await response.json();
			return { alarms, wakeups };
		},
		async addAlarm(fields) {
			await post('/schedule', fields, 'Could not save the alarm');
		},
		async remove(id) {
			await send(`/schedule/${id}`, { method: 'DELETE' });
		},
		async chooseDisplay(device) {
			await send('/schedule/display', {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ device })
			});
		}
	},

	assistant: {
		async chat(messages) {
			const response = await post(
				'/assistant',
				{ messages },
				'The assistant is not available right now.'
			);
			return response.json();
		},
		async undo(id) {
			return (await post('/assistant/undo', { id }, '')).json();
		}
	},

	agent: {
		async feed(since) {
			const response = await send(since === null ? '/agent' : `/agent?since=${since}`);
			return response.ok ? response.json() : null;
		},
		async resolveCard(id) {
			await send(`/agent/cards/${id}`, { method: 'POST' });
		},
		async stuck(taskId, reason) {
			await send('/agent/stuck', {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ taskId, reason })
			});
		}
	},

	settings: {
		async saveTimezone(timezone) {
			await send('/settings/timezone', {
				method: 'PUT',
				headers: JSON_HEADERS,
				body: JSON.stringify({ timezone })
			});
		},
		async save(patch) {
			await send('/settings', {
				method: 'PUT',
				headers: JSON_HEADERS,
				body: JSON.stringify(patch)
			});
		}
	},

	voice: {
		async transcribe(audio) {
			const form = new FormData();
			form.set('audio', audio);
			const response = await request(
				'/assistant/transcribe',
				{ method: 'POST', body: form },
				'Could not understand the recording'
			);
			const { text }: { text: string } = await response.json();
			return text.trim();
		},
		async speak(text) {
			const response = await send('/assistant/speak', {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ text })
			});
			return response.ok ? response.blob() : null;
		}
	}
};
