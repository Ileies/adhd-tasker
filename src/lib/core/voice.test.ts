/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import { AssistantError } from '#lib/core/context.js';
import { checkAudio, speak, transcribe } from '#lib/core/voice.js';
import {
	MAX_AUDIO_BYTES,
	REALTIME_URL,
	SPEECH_RATE,
	TRANSCRIBE_MODEL,
	TRANSCRIBE_URL
} from '#lib/voice.js';
import { failureOf } from '#test/errors.js';
import { fakeConnect, fakeFetch } from '#test/fakes.js';

const route = `POST ${TRANSCRIBE_URL}`;
const recording = (type = 'audio/webm;codecs=opus', size = 100) =>
	new Blob([new Uint8Array(size)], { type });

describe('checkAudio', () => {
	test.each([
		['an empty recording', () => recording('audio/webm', 0), 400],
		['a recording that is too large', () => recording('audio/webm', MAX_AUDIO_BYTES + 1), 413],
		['a file that is not audio', () => recording('text/html'), 415]
	])('%s is refused', (_name, blob, status) => {
		expect(() => checkAudio(blob())).toThrow(AssistantError);
		try {
			checkAudio(blob());
		} catch (error) {
			expect((error as AssistantError).status).toBe(status);
		}
	});

	test('a recording without a type passes, some browsers report none', () => {
		expect(() => checkAudio(recording(''))).not.toThrow();
	});
});

describe('transcribe', () => {
	test('refuses a bad recording before any network call', async () => {
		const { requests } = fakeFetch({ [route]: () => Response.json({ text: 'x' }) });
		await failureOf(transcribe('sk-test', recording('audio/webm', 0)));
		await failureOf(transcribe('sk-test', recording('image/png')));
		expect(requests).toEqual([]);
	});

	test('sends the model, the key and a file name with the right extension', async () => {
		const { requests } = fakeFetch({ [route]: () => Response.json({ text: '  Move my run  ' }) });
		const text = await transcribe('sk-test', recording('audio/mp4'));

		expect(text).toBe('Move my run');
		const [request] = requests;
		expect(request.headers.get('authorization')).toBe('Bearer sk-test');
		const form = await request.formData();
		expect(form.get('model')).toBe(TRANSCRIBE_MODEL);
		expect((form.get('file') as File).name).toBe('speech.m4a');
	});

	test('a webm recording is named webm', async () => {
		const { requests } = fakeFetch({ [route]: () => Response.json({ text: 'x' }) });
		await transcribe('sk-test', recording());
		expect(((await requests[0].formData()).get('file') as File).name).toBe('speech.webm');
	});

	test('an answer without text is an empty string', async () => {
		fakeFetch({ [route]: () => Response.json({}) });
		expect(await transcribe('sk-test', recording())).toBe('');
	});

	test.each([
		['a rejected key', 401, 400, 'rejected the saved key'],
		['no capacity', 429, 429, 'out of capacity'],
		['a server error', 500, 502, 'could not handle the audio']
	])('%s becomes an error with a reason', async (_name, upstream, status, reason) => {
		fakeFetch({ [route]: () => new Response('no', { status: upstream }) });
		const error = await failureOf(transcribe('sk-test', recording()));
		expect(error).toBeInstanceOf(AssistantError);
		expect(error).toMatchObject({ status, message: expect.stringContaining(reason) });
	});

	test('a lost connection says so', async () => {
		fakeFetch({
			[route]: () => {
				throw new Error('offline');
			}
		});
		expect(await failureOf(transcribe('sk-test', recording()))).toMatchObject({ status: 502 });
	});
});

describe('speak', () => {
	const chunk = (bytes: number[]) => ({
		type: 'response.output_audio.delta',
		delta: btoa(String.fromCharCode(...bytes))
	});

	test('opens the session with the key, sends the events and returns a WAV on done', async () => {
		const { connect, sockets } = fakeConnect();
		const result = speak('sk-test', 'Time to stretch', connect);
		const [socket] = sockets;
		expect(socket).toMatchObject({ url: REALTIME_URL, key: 'sk-test' });

		socket.open();
		expect(socket.sent.map((event) => (event as { type: string }).type)).toEqual([
			'session.update',
			'conversation.item.create',
			'response.create'
		]);
		expect(JSON.stringify(socket.sent[1])).toContain('Time to stretch');

		socket.receive(chunk([1, 2]));
		socket.receive(chunk([3, 4]));
		socket.receive({ type: 'response.done', response: { status: 'completed' } });

		const wav = await result;
		expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
		expect(new DataView(wav.buffer).getUint32(24, true)).toBe(SPEECH_RATE);
		expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
		expect(socket.closed).toBe(true);
	});

	test('messages that are not speech are ignored', async () => {
		const { connect, sockets } = fakeConnect();
		const result = speak('sk-test', 'x', connect);
		const [socket] = sockets;
		socket.open();
		socket.receive('not json');
		socket.receive({ type: 'session.created' });
		socket.receive(chunk([9]));
		socket.receive({ type: 'response.done' });
		expect((await result).length).toBe(45);
	});

	describe('failures', () => {
		let errors: ReturnType<typeof spyOn>;
		beforeEach(() => {
			errors = spyOn(console, 'error').mockImplementation(() => {});
		});
		afterEach(() => errors.mockRestore());

		test('an error event answers 502 and closes the socket', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].open();
			sockets[0].receive({ type: 'error', error: { message: 'bad' } });
			expect(await failureOf(result)).toMatchObject({ status: 502 });
			expect(sockets[0].closed).toBe(true);
		});

		test('a response that did not complete is an error', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].open();
			sockets[0].receive({ type: 'response.done', response: { status: 'failed' } });
			expect(await failureOf(result)).toMatchObject({ status: 502 });
		});

		test('a close before done answers 502', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].open();
			sockets[0].drop();
			expect(await failureOf(result)).toMatchObject({
				status: 502,
				message: expect.stringContaining('closed early')
			});
		});

		test('a rejected handshake (error without messages) names the key', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].fail();
			expect(await failureOf(result)).toMatchObject({
				status: 502,
				message: expect.stringContaining('rejected the saved key')
			});
		});

		test('done without any audio is an error', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].open();
			sockets[0].receive({ type: 'response.done' });
			expect(await failureOf(result)).toMatchObject({
				status: 502,
				message: expect.stringContaining('no audio')
			});
		});

		test('nothing happening for 30 seconds is a timeout', async () => {
			jest.useFakeTimers();
			try {
				const { connect, sockets } = fakeConnect();
				const result = speak('sk-test', 'x', connect);
				const failed = failureOf(result);
				sockets[0].open();
				jest.advanceTimersByTime(30_000);
				expect(await failed).toMatchObject({
					status: 502,
					message: expect.stringContaining('took too long')
				});
				expect(sockets[0].closed).toBe(true);
			} finally {
				jest.useRealTimers();
			}
		});

		test('the first outcome wins, later events change nothing', async () => {
			const { connect, sockets } = fakeConnect();
			const result = speak('sk-test', 'x', connect);
			sockets[0].open();
			sockets[0].receive(chunk([1]));
			sockets[0].receive({ type: 'response.done' });
			sockets[0].receive({ type: 'error', error: { message: 'late' } });
			sockets[0].drop();
			expect((await result).length).toBe(45);
		});
	});
});
