import type { Actions } from './$types';
import { google, login } from '$lib/server';

export const actions = {
	login: async (event) => {
		login(event);
	},
	logout: async ({ cookies }) => {
		await google.revokeToken(cookies.get('token') || '');
		return { success: true };
	}
} satisfies Actions;
