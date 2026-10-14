/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { MAX_SPOKEN_CHARS, audioExtension, buildSpeechRequest, isAudioMime, parseSpeakBody, pickRecordingType, speakable, speechVolume } from './voice';

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
});

describe('speakable', () => {
	test('strips markdown and links', () => {
		expect(speakable('**Done.** See [the plan](https://x.test/a) or https://x.test')).toBe('Done. See the plan or');
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

describe('buildSpeechRequest', () => {
	test('asks for mp3 with the fixed voice', () => {
		const request = buildSpeechRequest('Hello');
		expect(request.input).toBe('Hello');
		expect(request.response_format).toBe('mp3');
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
