/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { POST as prep } from './prep/+server.js';
import { POST as speak } from './speak/+server.js';
import { POST as transcribe } from './transcribe/+server.js';
import { POST as undo } from './undo/+server.js';
import { POST as chat } from './+server.js';
import { resetDb } from '#test/db.js';
import { callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const NO_KEY = 'Add your OpenAI key in Settings first';

describe('assistant routes', () => {
	test('every route needs a login', async () => {
		const statuses = [
			(await callRoute(chat, { body: {} })).status,
			(await callRoute(prep, { body: {} })).status,
			(await callRoute(speak, { body: {} })).status,
			(await callRoute(transcribe, { body: {} })).status,
			(await callRoute(undo, { body: {} })).status
		];
		expect(statuses).toEqual([401, 401, 401, 401, 401]);
	});
});

describe('POST /assistant', () => {
	test('a conversation that does not end with the user is refused', async () => {
		const user = await makeUser();
		const result = await callRoute(chat, { user, body: { messages: [] } });
		expect(result).toMatchObject({ status: 400, body: { message: 'Nothing to answer' } });
	});

	test('a body without messages is refused the same way', async () => {
		const user = await makeUser();
		expect((await callRoute(chat, { user, method: 'POST' })).status).toBe(400);
	});

	test('without an OpenAI key the reason is told', async () => {
		const user = await makeUser();
		const body = { messages: [{ role: 'user', content: 'hello' }] };
		const result = await callRoute(chat, { user, body });
		expect(result).toMatchObject({ status: 400, body: { message: NO_KEY } });
	});
});

describe('POST /assistant/prep', () => {
	test('a request the rules refuse is answered with their status', async () => {
		const user = await makeUser();
		const result = await callRoute(prep, { user, body: { id: 'x' } });
		expect(result.status).toBeGreaterThanOrEqual(400);
		expect(result.status).toBeLessThan(500);
	});
});

describe('POST /assistant/speak', () => {
	test('nothing to say is refused', async () => {
		const user = await makeUser();
		expect(await callRoute(speak, { user, body: { text: '  ' } })).toMatchObject({
			status: 400,
			body: { message: 'Nothing to say' }
		});
		expect((await callRoute(speak, { user, method: 'POST' })).status).toBe(400);
	});

	test('without an OpenAI key the reason is told', async () => {
		const user = await makeUser();
		const result = await callRoute(speak, { user, body: { text: 'Time to start' } });
		expect(result).toMatchObject({ status: 400, body: { message: NO_KEY } });
	});
});

describe('POST /assistant/transcribe', () => {
	test('a request without a recording is refused', async () => {
		const user = await makeUser();
		const result = await callRoute(transcribe, { user, body: new FormData() });
		expect(result).toMatchObject({ status: 400, body: { message: 'No recording' } });
	});

	test('a recording without an OpenAI key tells the reason', async () => {
		const user = await makeUser();
		const form = new FormData();
		form.set('audio', new Blob([new Uint8Array(2000)], { type: 'audio/webm' }), 'a.webm');
		const result = await callRoute(transcribe, { user, body: form });
		expect(result).toMatchObject({ status: 400, body: { message: NO_KEY } });
	});
});

describe('POST /assistant/undo', () => {
	test('an id that is not a change id is refused', async () => {
		const user = await makeUser();
		expect(await callRoute(undo, { user, body: { id: 'x' } })).toMatchObject({
			status: 400,
			body: { message: 'id must be a change id' }
		});
		expect((await callRoute(undo, { user, method: 'POST' })).status).toBe(400);
	});

	test('a change that does not exist answers 404', async () => {
		const user = await makeUser();
		expect(await callRoute(undo, { user, body: { id: 99 } })).toMatchObject({
			status: 404,
			body: { message: 'No such change' }
		});
	});
});
