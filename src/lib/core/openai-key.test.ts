/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { checkOpenaiKey } from '#lib/core/openai-key.js';
import { failureOf } from '#test/errors.js';
import { fakeFetch } from '#test/fakes.js';

const MODELS = 'https://api.openai.com/v1/models';

describe('checkOpenaiKey', () => {
	test('an accepted key comes back trimmed and was sent as a bearer token', async () => {
		const { requests } = fakeFetch({ [`GET ${MODELS}`]: () => Response.json({ data: [] }) });
		expect(await checkOpenaiKey('  sk-good  ')).toBe('sk-good');
		expect(requests[0].headers.get('authorization')).toBe('Bearer sk-good');
	});

	test('an empty key is refused without asking OpenAI', async () => {
		const { requests } = fakeFetch({});
		expect(await failureOf(checkOpenaiKey('   '))).toMatchObject({
			status: 400,
			message: 'Paste your key first'
		});
		expect(requests).toEqual([]);
	});

	test('a key OpenAI does not accept says so', async () => {
		fakeFetch({ [`GET ${MODELS}`]: () => new Response('no', { status: 401 }) });
		expect(await failureOf(checkOpenaiKey('sk-bad'))).toMatchObject({
			status: 400,
			message: 'OpenAI did not accept this key'
		});
	});

	test('an unreachable OpenAI says the key could not be checked', async () => {
		fakeFetch({
			[`GET ${MODELS}`]: () => {
				throw new Error('offline');
			}
		});
		expect(await failureOf(checkOpenaiKey('sk-x'))).toMatchObject({ status: 502 });
	});
});
