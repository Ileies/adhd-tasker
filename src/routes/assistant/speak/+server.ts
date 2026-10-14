import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/server/assistant.js';
import { speak } from '#lib/server/voice.js';
import { parseSpeakBody } from '#lib/voice.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const text = parseSpeakBody(await request.json().catch(() => null));
	if (!text) error(400, 'Nothing to say');

	try {
		const audio = await speak(locals.user.email, text);
		return new Response(audio as BodyInit, {
			headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
		});
	} catch (e) {
		if (e instanceof AssistantError) error(e.status as 400, e.message);
		console.error('Speak error:', e);
		error(500, 'Could not speak that');
	}
};
