import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AssistantError } from '#lib/server/assistant.js';
import { transcribe } from '#lib/server/voice.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Login required');

	const audio = (await request.formData().catch(() => null))?.get('audio');
	if (!(audio instanceof Blob)) error(400, 'No recording');

	try {
		return Response.json({ text: await transcribe(locals.user.email, audio) });
	} catch (e) {
		if (e instanceof AssistantError) error(e.status as 400, e.message);
		console.error('Transcribe error:', e);
		error(500, 'Could not turn the recording into text');
	}
};
