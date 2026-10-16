/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import {
	MAX_SPOKEN_CHARS,
	REALTIME_URL,
	audioExtension,
	buildSpeechEvents,
	isAudioMime,
	parseSpeakBody,
	pcm16ToWav,
	pickRecordingType,
	readSpeechEvent,
	speakable,
	speechVolume,
	sttEngine,
	VOICE_LANGUAGES,
	isVoiceLanguage,
	recognitionLang,
	transcribeLanguage
} from '#lib/voice.js';

describe('speech language', () => {
	test('the chosen language wins over the device language', () => {
		expect(recognitionLang('de-DE', 'en-US')).toBe('de-DE');
	});
	test('automatic follows the device language, English when it has none', () => {
		expect(recognitionLang(null, 'fr-FR')).toBe('fr-FR');
		expect(recognitionLang(null, undefined)).toBe('en-US');
		expect(recognitionLang(null, '')).toBe('en-US');
	});
	test('OpenAI gets the bare language code, or nothing to detect it', () => {
		expect(transcribeLanguage('de-DE')).toBe('de');
		expect(transcribeLanguage('en-GB')).toBe('en');
		expect(transcribeLanguage(null)).toBeUndefined();
	});
	test('only listed tags are languages', () => {
		expect(VOICE_LANGUAGES.every((language) => isVoiceLanguage(language.tag))).toBe(true);
		expect(isVoiceLanguage('xx-XX')).toBe(false);
		expect(isVoiceLanguage(null)).toBe(false);
	});
});

describe('pickRecordingType', () => {
	test('takes the first supported container', () => {
		expect(pickRecordingType((type) => type === 'audio/mp4')).toBe('audio/mp4');
		expect(pickRecordingType(() => true)).toBe('audio/webm;codecs=opus');
	});
	test('is undefined when nothing is supported', () => {
		expect(pickRecordingType(() => false)).toBeUndefined();
	});
});

describe('audioExtension', () => {
	test('maps containers', () => {
		expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
		expect(audioExtension('audio/mp4')).toBe('m4a');
		expect(audioExtension('audio/ogg;codecs=opus')).toBe('ogg');
		expect(audioExtension('')).toBe('webm');
	});
});

describe('isAudioMime', () => {
	test('accepts audio and webm recordings only', () => {
		expect(isAudioMime('audio/webm;codecs=opus')).toBe(true);
		expect(isAudioMime('video/webm')).toBe(true);
		expect(isAudioMime('text/html')).toBe(false);
	});
	test('a recording without a type is let through, OpenAI reads the container', () => {
		expect(isAudioMime('')).toBe(true);
		expect(isAudioMime('application/octet-stream')).toBe(true);
	});
});

describe('speakable', () => {
	test('strips markdown and links', () => {
		expect(speakable('**Done.** See [the plan](https://x.test/a) or https://x.test')).toBe(
			'Done. See the plan or'
		);
	});
	test('drops code blocks and list marks', () => {
		expect(speakable('Added:\n- study\n- gym\n```js\nx\n```')).toBe('Added: study gym');
	});
	test('keeps short text as is', () => {
		expect(speakable('Moved study to 17:00.')).toBe('Moved study to 17:00.');
	});
	test('cuts long text at a sentence end within the limit', () => {
		const text = `${'First sentence here. '.repeat(30)}`;
		const out = speakable(text);
		expect(out.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
		expect(out.endsWith('.')).toBe(true);
	});
	test('cuts at a word when there is no sentence end', () => {
		const out = speakable('word '.repeat(200));
		expect(out.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS + 1);
		expect(out.endsWith('.')).toBe(true);
	});
	test('empty stays empty', () => {
		expect(speakable('   ')).toBe('');
	});
});

describe('parseSpeakBody', () => {
	test('returns the speakable text', () => {
		expect(parseSpeakBody({ text: '**Hi**' })).toBe('Hi');
	});
	test('rejects anything else', () => {
		expect(parseSpeakBody(null)).toBeUndefined();
		expect(parseSpeakBody({ text: 5 })).toBeUndefined();
		expect(parseSpeakBody({ text: '  ' })).toBeUndefined();
	});
});

describe('buildSpeechEvents', () => {
	test('configures audio only output, then sends the text and asks for a response', () => {
		const [session, item, response] = buildSpeechEvents('Hello');
		expect(session).toMatchObject({
			type: 'session.update',
			session: {
				output_modalities: ['audio'],
				audio: {
					output: { format: { type: 'audio/pcm', rate: 24000 } },
					input: { turn_detection: null }
				}
			}
		});
		expect(item).toMatchObject({ item: { content: [{ type: 'input_text', text: 'Hello' }] } });
		expect(response).toMatchObject({ type: 'response.create' });
	});
	test('targets the realtime mini model', () => {
		expect(REALTIME_URL).toContain('model=gpt-realtime-2.1-mini');
	});
});

describe('readSpeechEvent', () => {
	test('decodes audio chunks', () => {
		const event = readSpeechEvent(
			JSON.stringify({ type: 'response.output_audio.delta', delta: btoa('\x01\x02\x03') })
		);
		expect(event).toEqual({ kind: 'audio', pcm: new Uint8Array([1, 2, 3]) });
	});
	test('knows when the response is done', () => {
		expect(readSpeechEvent('{"type":"response.done","response":{"status":"completed"}}')).toEqual({
			kind: 'done'
		});
	});
	test('a failed response is an error', () => {
		expect(readSpeechEvent('{"type":"response.done","response":{"status":"failed"}}').kind).toBe(
			'error'
		);
	});
	test('reports server errors', () => {
		expect(readSpeechEvent('{"type":"error","error":{"message":"nope"}}')).toEqual({
			kind: 'error',
			message: 'nope'
		});
	});
	test('ignores everything else', () => {
		expect(readSpeechEvent('{"type":"session.created"}').kind).toBe('other');
		expect(readSpeechEvent('not json').kind).toBe('other');
	});
});

describe('pcm16ToWav', () => {
	test('writes a valid header around the samples', () => {
		const wav = pcm16ToWav([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
		const view = new DataView(wav.buffer);
		expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
		expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
		expect(view.getUint32(4, true)).toBe(40);
		expect(view.getUint32(24, true)).toBe(24000);
		expect(view.getUint32(40, true)).toBe(4);
		expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
	});
});

describe('speechVolume', () => {
	test('follows the user volume and clamps', () => {
		expect(speechVolume(50, false)).toBe(0.5);
		expect(speechVolume(500, false)).toBe(1);
		expect(speechVolume(-3, false)).toBe(0);
	});
	test('is lower while ducked', () => {
		expect(speechVolume(100, true)).toBeLessThan(0.5);
	});
});

describe('sttEngine', () => {
	const base = { hasKey: true, openaiTranscribe: true, canRecord: true, browser: true };

	test.each([
		['a key and the switch on', base, 'openai'],
		['a key but the switch off', { ...base, openaiTranscribe: false }, 'browser'],
		['no key', { ...base, hasKey: false }, 'browser'],
		['a key but no recorder', { ...base, canRecord: false }, 'browser'],
		['no key and no browser recognition', { ...base, hasKey: false, browser: false }, null],
		[
			'the switch off and no browser recognition',
			{ ...base, openaiTranscribe: false, browser: false },
			null
		]
	] as const)('%s', (_name, opts, expected) => {
		expect(sttEngine(opts)).toBe(expected);
	});
});
