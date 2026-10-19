import { error } from '@sveltejs/kit';
import { clientSettings, parseSettingsPatch } from '#lib/settings.js';
import { clientIp, refreshIpLocation } from '#lib/server/location.js';
import { handler } from '#lib/server/route.js';
import type { RequestHandler } from './$types';

/** The settings the screens show. The OpenAI key itself never leaves the server, only whether one is saved. */
export const GET: RequestHandler = handler(async ({ ctx }) =>
	Response.json(clientSettings(await ctx.repo.settings.get()))
);

/** Saves changed settings. The OpenAI key and the timezone have their own, checked paths. */
export const PUT: RequestHandler = handler(
	async ({ ctx, user, request, json, getClientAddress }) => {
		const parsed = parseSettingsPatch(await json());
		if (!parsed.ok) error(400, parsed.error);

		await ctx.repo.settings.update(parsed.value);
		// "Detect automatically" hands the location back: find it again from this visit
		if (parsed.value.locationSource === null)
			await refreshIpLocation(user.email, clientIp(request.headers, getClientAddress()), {
				force: true
			});
		return Response.json(true);
	}
);
