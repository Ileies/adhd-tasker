import { Priority, TaskStatus } from '#lib/types.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import type { ExportFile } from '#lib/core/export.js';
import type { EventOrigin, EventType } from '#lib/events.js';
import type { Autonomy } from '#lib/guardrails.js';
import type { Repeat, ScheduleKind } from '#lib/schedule.js';
import type { Tone } from '#lib/tones.js';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Column defaults come from `DEFAULT_SETTINGS`, so an account and a guest start the same. */
const D = DEFAULT_SETTINGS;

export const users = sqliteTable('users', {
	email: text('email').notNull().primaryKey(),
	enableReminders: integer('enable_reminders', { mode: 'boolean' })
		.default(D.enableReminders)
		.notNull(),
	reminderAdvanceTime: integer('reminder_advance_time').default(D.reminderAdvanceTime).notNull(), // minutes before the next task starts
	hyperfocusAlarm: integer('hyperfocus_alarm', { mode: 'boolean' })
		.default(D.hyperfocusAlarm)
		.notNull(), // a tone when a task runs past its end
	overrunMinutes: integer('overrun_minutes').default(D.overrunMinutes).notNull(), // how long past its end counts as an overrun, for the alarm and the agent event
	enableOverdueNotifications: integer('enable_overdue_notifications', { mode: 'boolean' })
		.default(true)
		.notNull(),
	enableFocusMode: integer('enable_focus_mode', { mode: 'boolean' }).default(false).notNull(),
	darkMode: integer('dark_mode', { mode: 'boolean' }).default(D.darkMode).notNull(),
	openaiKey: text('openai_key'),
	timezone: text('timezone'), // IANA name, null until first set
	googleServices: text('google_services').default(D.googleServices).notNull(), // linked Google services, space separated (see #lib/google)
	aiAutonomy: text('ai_autonomy').$type<Autonomy>().default(D.aiAutonomy).notNull(),
	aiEvents: text('ai_events').default(D.aiEvents).notNull(), // event types the agent may react to, space separated
	quietStart: integer('quiet_start').default(D.quietStart).notNull(), // minutes since midnight, no unprompted reactions from here
	quietEnd: integer('quiet_end').default(D.quietEnd).notNull(), // until here
	dailyTokenBudget: integer('daily_token_budget'), // null: no limit for unprompted reactions
	lastCurrentTaskId: integer('last_current_task_id'), // what the scheduler saw as current at its last tick, to detect task.switched
	displayDevice: text('display_device'), // id of the device that plays alarms and agent tones, null: every device does
	voiceReplies: integer('voice_replies', { mode: 'boolean' }).default(D.voiceReplies).notNull(), // the assistant speaks its replies and notes
	showClock: integer('show_clock', { mode: 'boolean' }).default(D.showClock).notNull() // the time of day with seconds on the Now screen
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	date: text('date').notNull(), // YYYY-MM-DD in the user's timezone
	startTime: integer('start_time').notNull(),
	duration: integer('duration').notNull(),
	priority: integer('priority').$type<Priority>().default(Priority.Medium).notNull(),
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending).notNull()
});

/** Every change the assistant made to the plan, with enough to undo it. `before`/`after` are task JSON, null when absent. */
export const agentActions = sqliteTable('agent_actions', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	tool: text('tool').notNull(), // add_task | update_task | delete_task
	before: text('before', { mode: 'json' }),
	after: text('after', { mode: 'json' }),
	eventId: integer('event_id'), // the event the agent reacted to, null for changes made while chatting
	reason: text('reason'), // why, in the agent's words, shown in the activity log
	createdAt: integer('created_at').notNull(), // ms since epoch
	undoneAt: integer('undone_at')
});

/** Everything the agent can observe. Handled events are done, `outcome` says what became of them. */
export const events = sqliteTable(
	'events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
		email: text('email')
			.references(() => users.email, { onDelete: 'cascade' })
			.notNull(),
		type: text('type').$type<EventType>().notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		origin: text('origin').$type<EventOrigin>().notNull(),
		key: text('key'), // detected events only: one row per fact
		createdAt: integer('created_at').notNull(), // ms since epoch
		handledAt: integer('handled_at'),
		outcome: text('outcome')
	},
	(table) => [uniqueIndex('events_email_key').on(table.email, table.key)]
);

/** What the agent said or asked, shown in the strip on the Now screen until it is resolved. */
export const agentCards = sqliteTable('agent_cards', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	kind: text('kind').$type<'say' | 'ask'>().notNull(),
	text: text('text').notNull(),
	options: text('options', { mode: 'json' }).$type<string[]>(), // answers offered by an ask
	eventId: integer('event_id'),
	createdAt: integer('created_at').notNull(),
	resolvedAt: integer('resolved_at')
});

/** Alarms (ring on the client) and the agent's own wakeups. Repeating alarms stay pending and move `fireAt` on. */
export const schedule = sqliteTable('schedule', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	kind: text('kind').$type<ScheduleKind>().notNull(),
	fireAt: integer('fire_at').notNull(), // epoch ms
	minutes: integer('minutes'), // local clock time of a repeating alarm
	repeat: text('repeat').$type<Repeat>().default('none').notNull(),
	label: text('label'), // alarm
	note: text('note'), // wakeup: the agent's note to itself
	tone: text('tone', { mode: 'json' }).$type<Tone>(), // alarm, stored so it replays identically
	durationMin: integer('duration_min').default(5).notNull(), // alarm: minutes it rings before it stops by itself
	createdBy: text('created_by').$type<'user' | 'agent'>().notNull(),
	status: text('status').$type<'pending' | 'done' | 'cancelled'>().default('pending').notNull(),
	createdAt: integer('created_at').notNull()
});

/** Tokens of every model call, for the daily meter and the budget. */
export const aiUsage = sqliteTable('ai_usage', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	use: text('use').notNull(), // chat | reaction | replan
	tokens: integer('tokens').notNull(),
	createdAt: integer('created_at').notNull()
});

/**
 * The account's plan as it was before a move from a device or a restore replaced it, in the export format,
 * so it can be brought back for 30 days. The counts are kept beside the file to list snapshots cheaply.
 */
export const planSnapshots = sqliteTable('plan_snapshots', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	createdAt: integer('created_at').notNull(), // ms since epoch
	taskCount: integer('task_count').notNull(),
	alarmCount: integer('alarm_count').notNull(),
	file: text('file', { mode: 'json' }).$type<ExportFile>().notNull()
});

/**
 * The refresh token Google gave when the user linked a service, encrypted (`#lib/server/crypto`). With it the
 * server reads and writes the user's calendar while the app is closed. One row per user, deleted on unlink
 * (after Google was told to revoke it) and with the account.
 */
export const googleTokens = sqliteTable('google_tokens', {
	email: text('email')
		.primaryKey()
		.references(() => users.email, { onDelete: 'cascade' }),
	refreshToken: text('refresh_token').notNull(), // encrypted
	scopes: text('scopes').notNull(), // as Google reported them, space separated
	createdAt: integer('created_at').notNull() // ms since epoch
});

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id')
		.references(() => tasks.id, { onDelete: 'cascade' })
		.notNull(),
	reminderTime: integer('reminder_time').notNull()
});
