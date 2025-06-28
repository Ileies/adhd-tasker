import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { google } from '$lib/server';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');

	if (!code || !codeVerifier || state !== storedState) {
		throw redirect(302, '/error?error=invalid_request');
	}

	try {
		const tokens = await google.validateAuthorizationCode(code, codeVerifier);
		const accessToken = tokens.accessToken();

		cookies.delete('google_oauth_state', { path: '/' });
		cookies.delete('google_code_verifier', { path: '/' });

		cookies.set('token', accessToken, {
			path: '/',
			secure: true,
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});
	} catch (error) {
		console.error('OAuth error:', error);
		redirect(302, '/error?auth_failed');
	}
	redirect(302, '/');
};