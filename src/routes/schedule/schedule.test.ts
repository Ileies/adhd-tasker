/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test';
import { POST as chooseDisplay } from './display/+server.js';
import { DELETE, PATCH, PUT } from './[id]/+server.js';
import { GET, POST } from './+server.js';
import { dbRepo } from '#lib/server/db-repo.js';
import { resetDb } from '#test/db.js';
import { TEST_EMAIL, callRoute, makeUser } from '#test/fixtures.js';

beforeEach(resetDb);

const alarm = { in_minutes: 10, label: 'Stretch', tone: 'chime' };

/** An alarm of the signed in user, its id comes from the route that made it. */
async function makeAlarm(user: Awaited<ReturnType<typeof makeUser>>) {
	const result = await callRoute(POST, { user, body: alarm });
	return (result.body as { id: number }).id;
}

describe('/schedule', () => {
	test('every method needs a login', async () => {
		const params = { id: '1' };
		expect((await callRoute(GET)).status).toBe(401);
		expect((await callRoute(POST, { body: alarm })).status).toBe(401);
		expect((await callRoute(PATCH, { params, body: { enabled: false } })).status).toBe(401);
		expect((await callRoute(PUT, { params, method: 'PUT', body: alarm })).status).toBe(401);
		expect((await callRoute(DELETE, { params, method: 'DELETE' })).status).toBe(401);
		expect((await callRoute(chooseDisplay, { body: { device: null } })).status).toBe(401);
	});

	test('an alarm is made with 201 and listed', async () => {
		const user = await makeUser();
		const made = await callRoute(POST, { user, body: alarm });
		expect(made).toMatchObject({ status: 201, body: { id: expect.any(Number) } });
		const listed = await callRoute(GET, { user });
		expect(listed.body).toMatchObject({ alarms: [{ label: 'Stretch' }], wakeups: [] });
	});

	test('a body that is not an alarm is refused with the reason', async () => {
		const user = await makeUser();
		expect(await callRoute(POST, { user, method: 'POST' })).toMatchObject({
			status: 400,
			body: { message: 'Invalid request' }
		});
	});
});

describe('/schedule/[id]', () => {
	test('an id that is not a number is refused', async () => {
		const user = await makeUser();
		const params = { id: 'abc' };
		expect((await callRoute(PATCH, { user, params, body: { enabled: true } })).status).toBe(400);
		expect((await callRoute(PUT, { user, params, method: 'PUT', body: alarm })).status).toBe(400);
		expect((await callRoute(DELETE, { user, params, method: 'DELETE' })).status).toBe(400);
	});

	test('an alarm is turned off and on again', async () => {
		const user = await makeUser();
		const params = { id: String(await makeAlarm(user)) };
		expect((await callRoute(PATCH, { user, params, body: { enabled: false } })).status).toBe(204);
		expect((await callRoute(GET, { user })).body).toMatchObject({ alarms: [{ enabled: false }] });
		expect((await callRoute(PATCH, { user, params, body: { enabled: true } })).status).toBe(204);
	});

	test('enabled has to be true or false', async () => {
		const user = await makeUser();
		const params = { id: String(await makeAlarm(user)) };
		expect(await callRoute(PATCH, { user, params, body: { enabled: 'yes' } })).toMatchObject({
			status: 400,
			body: { message: 'enabled must be true or false' }
		});
	});

	test('an alarm that does not exist answers 404', async () => {
		const user = await makeUser();
		const params = { id: '999' };
		expect((await callRoute(PATCH, { user, params, body: { enabled: true } })).status).toBe(404);
		expect((await callRoute(PUT, { user, params, method: 'PUT', body: alarm })).status).toBe(404);
		expect((await callRoute(DELETE, { user, params, method: 'DELETE' })).status).toBe(404);
	});

	test('an alarm is changed with the same body as a new one', async () => {
		const user = await makeUser();
		const params = { id: String(await makeAlarm(user)) };
		const renamed = { ...alarm, label: 'Walk' };
		expect((await callRoute(PUT, { user, params, method: 'PUT', body: renamed })).status).toBe(204);
		expect((await callRoute(GET, { user })).body).toMatchObject({ alarms: [{ label: 'Walk' }] });
	});

	test('a change the rules refuse is answered with their reason', async () => {
		const user = await makeUser();
		const params = { id: String(await makeAlarm(user)) };
		expect((await callRoute(PUT, { user, params, method: 'PUT' })).status).toBe(400);
	});

	test('an alarm is cancelled', async () => {
		const user = await makeUser();
		const params = { id: String(await makeAlarm(user)) };
		expect((await callRoute(DELETE, { user, params, method: 'DELETE' })).status).toBe(204);
		expect((await callRoute(GET, { user })).body).toMatchObject({ alarms: [] });
	});
});

describe('POST /schedule/display', () => {
	test('a device is chosen, null means every device', async () => {
		const user = await makeUser();
		expect((await callRoute(chooseDisplay, { user, body: { device: 'kitchen' } })).status).toBe(
			204
		);
		expect((await dbRepo(TEST_EMAIL).settings.get()).displayDevice).toBe('kitchen');
		expect((await callRoute(chooseDisplay, { user, body: { device: null } })).status).toBe(204);
		expect((await dbRepo(TEST_EMAIL).settings.get()).displayDevice).toBeNull();
	});

	test('a device that is not a name is refused', async () => {
		const user = await makeUser();
		expect(await callRoute(chooseDisplay, { user, body: { device: '' } })).toMatchObject({
			status: 400,
			body: { message: 'Invalid device' }
		});
		expect((await callRoute(chooseDisplay, { user, method: 'POST' })).status).toBe(400);
	});
});
