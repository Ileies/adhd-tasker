/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { BackendError, type Backend } from '#lib/backend.js';
import { localBackend } from '#lib/local/backend.js';
import { BACKEND_METHODS, deferredBackend } from '#lib/local/deferred.js';
import { remoteBackend } from '#lib/remote-backend.js';
import { testCtx } from '#test/ctx.js';
import { failureOf } from '#test/errors.js';

const real = {
	tasks: { load: async (date: string) => [{ date }] },
	settings: { save: async () => {} }
} as unknown as Backend;

type Methods = Record<string, string[]>;

const methodsOf = (backend: Backend): Methods =>
	Object.fromEntries(
		Object.entries(backend).map(([area, methods]) => [area, Object.keys(methods).sort()])
	);

describe('BACKEND_METHODS', () => {
	const listed: Methods = Object.fromEntries(
		Object.entries(BACKEND_METHODS).map(([area, methods]) => [area, [...methods].sort()])
	);

	test('names every method of the remote backend', () => {
		expect(listed).toEqual(methodsOf(remoteBackend));
	});

	test('names every method of the local backend', async () => {
		const { repo } = await testCtx();
		expect(listed).toEqual(methodsOf(localBackend({ repo, hint: () => 1, react: () => {} })));
	});

	test('the deferred backend has all of them as real functions', () => {
		const deferred = deferredBackend(new Promise(() => {}));
		expect(methodsOf(deferred)).toEqual(listed);
		expect(typeof deferred.tasks.load).toBe('function');
	});
});

describe('deferredBackend', () => {
	test('a call made before the backend exists waits and then gets its answer', async () => {
		let open!: (backend: Backend) => void;
		const backend = deferredBackend(new Promise((resolve) => (open = resolve)));
		const answer = backend.tasks.load('2026-10-14');
		let settled = false;
		void answer.then(() => (settled = true));
		await Bun.sleep(5);
		expect(settled).toBe(false);
		open(real);
		expect(await answer).toMatchObject([{ date: '2026-10-14' }]);
	});

	test('calls made after it exists are forwarded with their arguments', async () => {
		const seen: unknown[] = [];
		const backend = deferredBackend(
			Promise.resolve({
				settings: { save: async (patch: unknown) => void seen.push(patch) }
			} as unknown as Backend)
		);
		await backend.settings.save({ showClock: true });
		expect(seen).toEqual([{ showClock: true }]);
	});

	test('when the backend cannot be made every call fails with that reason', async () => {
		const backend = deferredBackend(Promise.reject(new BackendError('No storage here', 503)));
		expect(await failureOf(backend.tasks.load('2026-10-14'))).toMatchObject({
			status: 503,
			message: 'No storage here'
		});
		expect(await failureOf(backend.activity.load())).toMatchObject({ status: 503 });
	});
});
