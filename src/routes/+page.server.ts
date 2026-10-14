import type { Actions } from './$types';
import { google, login } from '#lib/server/index.js';

export const actions = {
	login: async (event) => {
		login(event);
	},
	logout: async ({ cookies }) => {
		const token = cookies.get('token');
		if (token) await google.revokeToken(token);
		cookies.delete('session', { path: '/' });
		cookies.delete('token', { path: '/' });
		return { success: true };
	}
} satisfies Actions;
