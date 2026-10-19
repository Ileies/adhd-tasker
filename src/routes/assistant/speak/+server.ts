import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handler } from '#lib/server/route.js';
import { speak } from '#lib/server/voice.js';
import { parseSpeakBody } from '#lib/voice.js';

export const POST: RequestHandler = handler(
	async ({ user, json }) => {
		const text = parseSpeakBody(await json());
		if (!text) error(400, 'Nothing to say');

		const audio = await speak(user.email, text);
		return new Response(audio as BodyInit, {
			headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
		});
	},
	{ failure: { label: 'Speak error:', message: 'Could not speak that' } }
);
