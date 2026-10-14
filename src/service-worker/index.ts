import { self as sw } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `app-${version}`;
const ASSETS: string[] = [...immutable, ...assets].map((entry) => '/' + entry.path);

// Only the static app files are cached. Pages and task data always come from the server, so the plan is never stale.
sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	if (!ASSETS.includes(new URL(request.url).pathname)) return;
	event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
