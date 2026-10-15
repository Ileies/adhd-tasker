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
		async since(date) {
			return (await request(`/edit?from=${date}`)).json();
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

	activity: {
		async load() {
			return (await request('/activity')).json();
		}
	},

	settings: {
		async load() {
			return (await request('/settings')).json();
		},
		async saveTimezone(timezone) {
			await send('/settings/timezone', {
				method: 'PUT',
				headers: JSON_HEADERS,
				body: JSON.stringify({ timezone })
			});
		},
		async saveKey(key) {
			await request(
				'/settings/openai-key',
				{ method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ key }) },
				'Could not save the key'
			);
		},
		async removeKey() {
			await request('/settings/openai-key', { method: 'DELETE' }, 'Could not remove the key');
		},
		async save(patch) {
			await send('/settings', {
				method: 'PUT',
				headers: JSON_HEADERS,
				body: JSON.stringify(patch)
			});
		}
	},

	data: {
		async export() {
			return (await request('/export')).json();
		},
		async import(raw) {
			return (await post('/import', raw, 'Could not import the file')).json();
		},
		async erase() {
			await request('/account', { method: 'DELETE' }, 'Could not delete the account');
		}
	},

	account: {
		async move(file, mode, today) {
			return (
				await post('/account/import', { file, mode, today }, 'Could not move the plan')
			).json();
		},
		async snapshots() {
			return (await request('/account/snapshots')).json();
		},
		async restore(id) {
			return (await post('/account/restore', { id }, 'Could not restore the plan')).json();
		}
	},

	calendar: {
		async overview() {
			return (await request('/calendar', undefined, 'Could not read your calendars')).json();
		},
		async preview(calendars) {
			return (
				await post('/calendar/preview', { calendars }, 'Could not read your calendars')
			).json();
		},
		async import(mode) {
			return (await post('/calendar/import', { mode }, 'Could not import your calendars')).json();
		},
		async sync() {
			const { changed } = await (
				await post('/calendar/sync', {}, 'Could not sync your calendars')
			).json();
			return changed === true;
		},
		async stop() {
			await request('/calendar', { method: 'DELETE' }, 'Could not stop following your calendars');
		},
		async allDay(from, to) {
			// Plan shows what it has, a failed read leaves the days without the line
			const response = await send(`/calendar/all-day?from=${from}&to=${to}`);
			return response.ok ? response.json() : [];
		}
	},

	sample: {
		// An account starts from its own plan, the sample day is for a device that has none
		ids: async () => [],
		async start() {
			throw new BackendError('The sample day is only for this device', 501);
		},
		clear: async () => 0
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
