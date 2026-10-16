import { self as sw } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { dev, version } from '$app/env';
import { shellAction, shellKey } from '#lib/offline.js';

const CACHE = `app-${version}`;
const ASSETS: string[] = [...immutable, ...assets].map((entry) => '/' + entry.path);

// In development the worker caches nothing and clears what an earlier build left, so hot reloads always see the dev server
sw.addEventListener('install', (event) => {
	event.waitUntil(
		(dev ? Promise.resolve() : caches.open(CACHE).then((cache) => cache.addAll(ASSETS))).then(() =>
			sw.skipWaiting()
		)
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => dev || key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

/**
 * A page always comes from the server, so the plan is never stale. Only when the network fails does a guest's page
 * (which holds no plan, see `shellAction`) come from the copy kept at the last visit, so a reload offline still opens.
 */
async function page(event: FetchEvent): Promise<Response> {
	const key = shellKey(event.request.url);
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(event.request);
		const action = shellAction(response);
		if (action === 'store') event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
		if (action === 'forget') event.waitUntil(cache.delete(key));
		return response;
	} catch (error) {
		const copy = await cache.match(key);
		if (copy) return copy;
		throw error;
	}
}

sw.addEventListener('fetch', (event) => {
	if (dev) return;
	const { request } = event;
	if (request.method !== 'GET') return;
	if (request.mode === 'navigate') {
		event.respondWith(page(event));
		return;
	}
	if (!ASSETS.includes(new URL(request.url).pathname)) return;
	event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
