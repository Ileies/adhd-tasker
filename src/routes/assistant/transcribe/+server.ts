import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handler } from '#lib/server/route.js';
import { transcribe } from '#lib/server/voice.js';

export const POST: RequestHandler = handler(
	async ({ user, request }) => {
		const audio = (await request.formData().catch(() => null))?.get('audio');
		if (!(audio instanceof Blob)) error(400, 'No recording');

		return Response.json({ text: await transcribe(user.email, audio) });
	},
	{
		failure: {
			label: 'Transcribe error:',
			message: 'Could not turn the recording into text'
		}
	}
);
