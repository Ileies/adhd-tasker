/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { resetDb } from '#test/db.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import { parseSettingsPatch } from '#lib/settings.js';
import { dbRepo } from '#lib/server/db-repo.js';

describe('DEFAULT_SETTINGS', () => {
	test('a new account starts with exactly these settings', async () => {
		await resetDb();
		await db.insert(users).values({ email: 'ada@example.com' });
		expect(await dbRepo('ada@example.com').settings.get()).toMatchObject(DEFAULT_SETTINGS);
	});

	test('the values that can be patched are valid patches', () => {
		const { enableReminders, reminderAdvanceTime, hyperfocusAlarm, overrunMinutes } =
			DEFAULT_SETTINGS;
		const { aiAutonomy, aiEvents, quietStart, quietEnd, voiceReplies, showClock } =
			DEFAULT_SETTINGS;
		expect(
			parseSettingsPatch({
				enableReminders,
				reminderAdvanceTime,
				hyperfocusAlarm,
				overrunMinutes,
				aiAutonomy,
				aiEvents,
				quietStart,
				quietEnd,
				voiceReplies,
				showClock,
				dailyTokenBudget: DEFAULT_SETTINGS.dailyTokenBudget
			}).ok
		).toBe(true);
	});
});
