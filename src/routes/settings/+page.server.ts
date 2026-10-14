import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { isGoogleServiceId } from '#lib/google.js';
import { parseSettingsForm } from '#lib/guardrails.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { login } from '#lib/server/index.js';
import { encrypt } from '#lib/server/crypto.js';
import { OPENAI_KEY_PURPOSE } from '#lib/server/assistant.js';
import { GOOGLE_CLIENT_SECRET } from '$app/env/private';

export const actions = {
	/** Asks Google for the ticked services on top of the sign-in. Nothing is stored until Google confirms in /callback. */
	linkGoogle: async (event) => {
		if (!event.locals.user) return fail(401, { message: 'Sign in first' });

		const services = (await event.request.formData()).getAll('service').filter((value) => typeof value === 'string').filter(isGoogleServiceId);
		if (services.length === 0) return fail(400, { message: 'Tick at least one service' });

		login(event, services);
	},

	/** Checks the key with OpenAI, then stores it encrypted. It is never sent back to the client. */
	saveOpenaiKey: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { openaiMessage: 'Sign in first' });

		const key = String((await request.formData()).get('key') ?? '').trim();
		if (!key) return fail(400, { openaiMessage: 'Paste your key first' });

		const check = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
		if (!check) return fail(502, { openaiMessage: 'Could not reach OpenAI to check the key' });
		if (!check.ok) return fail(400, { openaiMessage: 'OpenAI did not accept this key' });

		await db.update(users).set({ openaiKey: encrypt(key, GOOGLE_CLIENT_SECRET, OPENAI_KEY_PURPOSE) }).where(eq(users.email, locals.user.email));
		return { openaiSaved: true };
	},

	/** Autonomy, which events it may react to, quiet hours and the daily budget. */
	saveAgent: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { agentMessage: 'Sign in first' });

		const parsed = parseSettingsForm(await request.formData());
		if (!parsed.ok) return fail(400, { agentMessage: parsed.error });

		const { autonomy, events, quietStart, quietEnd, dailyTokenBudget } = parsed.value;
		await db.update(users).set({ aiAutonomy: autonomy, aiEvents: events.join(' '), quietStart, quietEnd, dailyTokenBudget }).where(eq(users.email, locals.user.email));
		return { agentSaved: true };
	},

	/** Whether the assistant speaks its replies and notes. */
	saveVoice: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { voiceMessage: 'Sign in first' });
		const replies = (await request.formData()).has('replies');
		await db.update(users).set({ voiceReplies: replies }).where(eq(users.email, locals.user.email));
		return { voiceSaved: true };
	},

	removeOpenaiKey: async ({ locals }) => {
		if (!locals.user) return fail(401, { openaiMessage: 'Sign in first' });
		await db.update(users).set({ openaiKey: null }).where(eq(users.email, locals.user.email));
		return { openaiRemoved: true };
	},

	/** Forgets the link here. Access is removed for good in the Google account permissions. */
	unlinkGoogle: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Sign in first' });
		await db.update(users).set({ googleServices: '' }).where(eq(users.email, locals.user.email));
		return { unlinked: true };
	}
} satisfies Actions;
