/// <reference types="bun" />
import { afterEach, describe, expect, test } from 'bun:test';
import { localBackend } from '#lib/local/backend.js';
import { testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';
import { fakeFetch } from '#test/fakes.js';

/**
 * D3: a guest's key never leaves the browser except to OpenAI. The fake fetch only knows api.openai.com,
 * so a request to this origin (or anywhere else) is refused and fails the test.
 */
const KEY = 'sk-guest-key';

const message = (text: string) => ({
	output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
	usage: { total_tokens: 5 }
});
const toolCall = (name: string, args: object) => ({
	output: [{ type: 'function_call', call_id: 'c1', name, arguments: JSON.stringify(args) }]
});

class FakeSocket {
	static OPEN = 1;
	static sockets: FakeSocket[] = [];
	readyState = 0;
	sent: string[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	constructor(
		readonly url: string,
		readonly protocols: string[]
	) {
		FakeSocket.sockets.push(this);
		queueMicrotask(() => {
			this.readyState = 1;
			this.onopen?.();
		});
	}
	send(data: string) {
		this.sent.push(data);
		if (JSON.parse(data).type !== 'response.create') return;
		queueMicrotask(() => {
			this.onmessage?.({
				data: JSON.stringify({
					type: 'response.output_audio.delta',
					delta: btoa('\x01\x02\x03\x04')
				})
			});
			this.onmessage?.({
				data: JSON.stringify({ type: 'response.done', response: { status: 'completed' } })
			});
		});
	}
	close() {
		this.readyState = 3;
	}
}

const realSocket = globalThis.WebSocket;
afterEach(() => {
	globalThis.WebSocket = realSocket;
	FakeSocket.sockets = [];
});

describe('a guest talking to OpenAI from the browser', () => {
	test('a key check, an assistant turn, a transcription and a spoken reply reach only OpenAI', async () => {
		globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
		const answers = [
			toolCall('add_task', {
				title: 'Call dentist',
				date: '2026-10-14',
				start: '14:00',
				duration_minutes: 15
			}),
			message('Added it.')
		];
		const { requests } = fakeFetch({
			'GET https://api.openai.com/v1/models': () => Response.json({ data: [] }),
			'POST https://api.openai.com/v1/responses': () => Response.json(answers.shift()),
			'POST https://api.openai.com/v1/audio/transcriptions': () =>
				Response.json({ text: ' call the dentist ' })
		});

		const made = await testCtx();
		const backend = localBackend({
			repo: made.repo,
			now: () => made.state.now,
			hint: () => 1,
			react: () => {}
		});

		await backend.settings.saveKey(`  ${KEY}  `);
		const turn = await backend.assistant.chat([
			{ role: 'user', content: 'Call the dentist at 14:00' }
		]);
		const text = await backend.voice.transcribe(new Blob(['audio'], { type: 'audio/webm' }));
		const audio = await backend.voice.speak(turn.reply);

		expect(turn.reply).toBe('Added it.');
		expect(turn.changes).toHaveLength(1);
		expect(text).toBe('call the dentist');
		expect(audio?.type).toBe('audio/wav');

		// Every request went to OpenAI, none to this origin, and each one carries the guest's own key
		expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
			[
				'GET /v1/models',
				'POST /v1/responses',
				'POST /v1/responses',
				'POST /v1/audio/transcriptions'
			]
		);
		for (const request of requests) {
			expect(new URL(request.url).origin).toBe('https://api.openai.com');
			expect(request.headers.get('authorization')).toBe(`Bearer ${KEY}`);
		}

		// The spoken reply used the Realtime socket with the key as a subprotocol, not a header
		expect(FakeSocket.sockets).toHaveLength(1);
		expect(FakeSocket.sockets[0].url).toStartWith('wss://api.openai.com/v1/realtime');
		expect(FakeSocket.sockets[0].protocols).toEqual(['realtime', `openai-insecure-api-key.${KEY}`]);
	});

	test('the key stays on the device: the settings the page sees only say that one is saved', async () => {
		fakeFetch({ 'GET https://api.openai.com/v1/models': () => Response.json({ data: [] }) });
		const made = await testCtx();
		const backend = localBackend({
			repo: made.repo,
			hint: () => 1,
			react: () => {}
		});
		await backend.settings.saveKey(KEY);
		expect((await made.repo.settings.get()).openaiKey).toBe(KEY);
		const shown = await backend.settings.load();
		expect(shown.hasOpenaiKey).toBe(true);
		expect(JSON.stringify(shown)).not.toContain(KEY);
	});

	test('a key OpenAI does not accept is not stored', async () => {
		fakeFetch({
			'GET https://api.openai.com/v1/models': () => new Response('no', { status: 401 })
		});
		const made = await testCtx();
		const backend = localBackend({ repo: made.repo, hint: () => 1, react: () => {} });
		expect(await failureOf(backend.settings.saveKey('sk-bad'))).toMatchObject({ status: 400 });
		expect((await made.repo.settings.get()).openaiKey).toBeNull();
	});

	test('removing the key forgets it', async () => {
		fakeFetch({ 'GET https://api.openai.com/v1/models': () => Response.json({ data: [] }) });
		const made = await testCtx();
		const backend = localBackend({ repo: made.repo, hint: () => 1, react: () => {} });
		await backend.settings.saveKey(KEY);
		await backend.settings.removeKey();
		expect((await backend.settings.load()).hasOpenaiKey).toBe(false);
	});
});
