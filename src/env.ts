import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_GOOGLE_CLIENT_ID: { public: true, static: true },
	PUBLIC_REDIRECT_URI: { public: true, static: true },
	GOOGLE_CLIENT_SECRET: { static: true },
	DATA_DIR: { static: false, schema: (value) => value || 'data' }
});
