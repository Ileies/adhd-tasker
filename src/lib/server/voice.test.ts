/// <reference types="bun" />
import { beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { TRANSCRIBE_URL } from '#lib/voice.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/ctx.js';
import { encrypt } from '#lib/server/crypto.js';
import { speak, transcribe } from '#lib/server/voice.js';
import { resetDb } from '#test/db.js';
import { failureOf } from '#test/errors.js';
import { fakeFetch } from '#test/fakes.js';
import { makeUser } from '#test/fixtures.js';

const NOW = Date.parse('2026-10-14T09:00:00Z');
const route = `POST ${TRANSCRIBE_URL}`;
const sealed = (key: string) => encrypt(key, 'test-secret', OPENAI_KEY_PURPOSE);
const recording = () => new Blob([new Uint8Array(100)], { type: 'audio/webm' });

/** The rate limits remember an email for the whole run, so every test gets its own account. */
let seq = 0;
const account = (extra: Parameters<typeof makeUser>[0] = {}) =>
	makeUser({ email: `user${++seq}@example.com`, ...extra });

beforeEach(async () => {
	await resetDb();
	setSystemTime(new Date(NOW));
});

describe('transcribe (account)', () => {
	test("sends the recording with the account's own key", async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		const { requests } = fakeFetch({ [route]: () => Response.json({ text: 'Move my run' }) });
		expect(await transcribe(user.email, recording())).toBe('Move my run');
		expect(requests[0].headers.get('authorization')).toBe('Bearer sk-saved');
	});

	test("sends the account's speech language", async () => {
		const user = await account({ openaiKey: sealed('sk-saved'), voiceLanguage: 'de-DE' });
		const { requests } = fakeFetch({ [route]: () => Response.json({ text: 'x' }) });
		await transcribe(user.email, recording());
		expect((await requests[0].formData()).get('language')).toBe('de');
	});

	test('a bad recording is refused before the key is read or the limit counted', async () => {
		const user = await account();
		fakeFetch({});
		const empty = new Blob([], { type: 'audio/webm' });
		for (let i = 0; i < 40; i++)
			expect(await failureOf(transcribe(user.email, empty))).toMatchObject({ status: 400 });
	});

	test('without a key it asks for one', async () => {
		const user = await account();
		fakeFetch({});
		expect(await failureOf(transcribe(user.email, recording()))).toMatchObject({
			status: 400,
			message: expect.stringContaining('OpenAI key')
		});
	});

	test('30 requests in five minutes, then 429 until the window passes', async () => {
		const user = await account({ openaiKey: sealed('sk-saved') });
		fakeFetch({ [route]: () => Response.json({ text: 'x' }) });
		for (let i = 0; i < 30; i++) await transcribe(user.email, recording());
		expect(await failureOf(transcribe(user.email, recording()))).toMatchObject({ status: 429 });
		setSystemTime(new Date(NOW + 5 * 60_000 + 1));
		expect(await transcribe(user.email, recording())).toBe('x');
	});
});

describe('speak (account)', () => {
	test('without a key it asks for one before opening a connection', async () => {
		const user = await account();
		expect(await failureOf(speak(user.email, 'Hello'))).toMatchObject({
			status: 400,
			message: expect.stringContaining('OpenAI key')
		});
	});

	test('shares the voice limit with transcription', async () => {
		const user = await account();
		for (let i = 0; i < 30; i++) await failureOf(speak(user.email, 'Hello'));
		expect(await failureOf(speak(user.email, 'Hello'))).toMatchObject({ status: 429 });
	});
});
