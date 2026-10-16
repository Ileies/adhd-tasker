import { Priority, TaskStatus } from '#lib/types.js';
import { DEFAULT_SETTINGS } from '#lib/core/defaults.js';
import type { ExportFile } from '#lib/core/export.js';
import type { FlowType, TaskKind, TodoStatus } from '#lib/core/repo.js';
import type { EventOrigin, EventType } from '#lib/events.js';
import type { Autonomy } from '#lib/guardrails.js';
import type { Repeat, ScheduleKind } from '#lib/schedule.js';
import type { Tone } from '#lib/tones.js';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
	lastCurrentKey: text('last_current_key'), // what the flow engine saw as current (`task:12`, `todo:5`, `away`, `plan`...), null: never tracked
	displayDevice: text('display_device'), // id of the device that plays alarms and agent tones, null: every device does
	voiceReplies: integer('voice_replies', { mode: 'boolean' }).default(D.voiceReplies).notNull(), // the assistant speaks its replies and notes
	openaiTranscribe: integer('openai_transcribe', { mode: 'boolean' })
		.default(D.openaiTranscribe)
		.notNull(), // speech to text with OpenAI (true) or the browser (false)
	voiceLanguage: text('voice_language'), // BCP 47 tag the microphone listens for, null follows the browser
	showClock: integer('show_clock', { mode: 'boolean' }).default(D.showClock).notNull(), // the time of day with seconds on the Now screen
	clock12h: integer('clock_12h', { mode: 'boolean' }), // 12 hour clock, null follows the device
	checkInMinutes: integer('check_in_minutes').default(D.checkInMinutes).notNull(), // soft chime interval while a task is current, 0 is off
	myDayStart: integer('my_day_start').default(D.myDayStart).notNull(), // minutes since midnight, the timeline folds the hours outside
	myDayEnd: integer('my_day_end').default(D.myDayEnd).notNull(),
	checkMinutes: integer('check_minutes').default(D.checkMinutes).notNull(), // a session on a to-do runs this long before the check
	breakMinutes: integer('break_minutes').default(D.breakMinutes).notNull(), // how long a break runs
	arriveEarlyMinutes: integer('arrive_early_minutes').default(D.arriveEarlyMinutes).notNull(), // travel ends this long before its appointment
	startWorkAt: integer('start_work_at').default(D.startWorkAt).notNull(), // minutes since midnight, the morning call until Start
	locationLat: real('location_lat'), // rounded to 2 decimals, null: not known (never the internet address itself)
	locationLon: real('location_lon'),
	locationName: text('location_name'), // the city shown in Settings
	locationSource: text('location_source').$type<'ip' | 'device' | 'city'>() // null: find it automatically
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
	status: text('status').$type<TaskStatus>().default(TaskStatus.Pending).notNull(),
	completedAt: integer('completed_at'), // epoch ms of Done, null while open
	kind: text('kind').$type<TaskKind>().default('block').notNull(), // block (the user's own time), appointment (ends on its own), travel (to an appointment)
	parentId: integer('parent_id'), // the appointment a travel task leads to, not a foreign key: deleting the appointment deletes its travel in the rules
	shift: integer('shift').default(0).notNull() // minutes a task of the user's own may move to make room, 0 stays
});

/**
 * Things to do without a time (`docs/flow-plan.md`): a size, a progress and maybe a due date. The flow engine
 * decides when one gets minutes. `parentId` is the appointment (a task) it prepares for, not a foreign key,
 * so deleting the appointment leaves the to-do with the last due date.
 */
export const todos = sqliteTable('todos', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	email: text('email')
		.references(() => users.email, { onDelete: 'cascade' })
		.notNull(),
	title: text('title').notNull(),
	description: text('description').default('').notNull(),
	priority: integer('priority').$type<Priority>().default(Priority.Medium).notNull(),
	status: text('status').$type<TodoStatus>().default('open').notNull(),
	estimate: integer('estimate'), // minutes the whole thing takes, null: not known
	learned: integer('learned', { mode: 'boolean' }).default(false).notNull(), // the size came from the pace
	progress: integer('progress').default(0).notNull(), // 0 to 100
	spentMinutes: integer('spent_minutes').default(0).notNull(),
	skips: integer('skips').default(0).notNull(), // pushed away without progress in between
	skipSince: text('skip_since'), // YYYY-MM-DD of the first of those skips
	dueDate: text('due_date'), // YYYY-MM-DD
	dueTime: integer('due_time'), // minutes since midnight, null: the end of My day
	parentId: integer('parent_id'), // the appointment this prepares for
	notBefore: text('not_before'), // YYYY-MM-DD
	nextStep: text('next_step'),
	createdAt: integer('created_at').notNull(), // ms since epoch
	completedAt: integer('completed_at')
});

/** What the user answered or chose today (and the pins that freeze a pick): the only stored input of the flow engine. */
export const flowLog = sqliteTable(
	'flow_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
		email: text('email')
			.references(() => users.email, { onDelete: 'cascade' })
			.notNull(),
		at: integer('at').notNull(), // ms since epoch
		date: text('date').notNull(), // YYYY-MM-DD in the user's timezone
		type: text('type').$type<FlowType>().notNull(),
		todoId: integer('todo_id'),
		taskId: integer('task_id'),
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		key: text('key') // pins only: one row per fact
	},
	(table) => [
		uniqueIndex('flow_log_email_key').on(table.email, table.key),
		index('flow_log_email_date').on(table.email, table.date)
	]
);

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
	enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(), // alarm: off keeps it in the list without ringing
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
	todoCount: integer('todo_count').default(0).notNull(),
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

/**
 * Which calendars of a user are read. `preview` is the choice before the first import: nothing was written to
 * the plan yet. `active` calendars are synced every few minutes. One row per user.
 */
export const calendarSync = sqliteTable('calendar_sync', {
	email: text('email')
		.primaryKey()
		.references(() => users.email, { onDelete: 'cascade' }),
	calendars: text('calendars', { mode: 'json' }).$type<string[]>().notNull(), // calendar ids
	status: text('status').$type<'preview' | 'active'>().notNull(),
	syncedAt: integer('synced_at'), // ms since epoch of the last successful sync
	writeCalendar: text('write_calendar'), // where the user's own tasks are added, null = off (the default)
	createdAt: integer('created_at').notNull()
});

/**
 * An event the app imported, so a sync can tell new from changed from gone (by `etag`) without touching tasks the
 * user changed. `taskIds` are the tasks made from it: empty for an event left out on import and for all-day
 * events, which are a line on Plan and not tasks. A task the user deleted is not made again.
 */
export const calendarEvents = sqliteTable(
	'calendar_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
		email: text('email')
			.references(() => users.email, { onDelete: 'cascade' })
			.notNull(),
		calendarId: text('calendar_id').notNull(),
		eventId: text('event_id').notNull(),
		etag: text('etag').notNull(),
		kind: text('kind').$type<'timed' | 'allDay'>().notNull(),
		// `google`: imported, Google owns it and it is never deleted there. `app`: made from a task of the user
		origin: text('origin').$type<'google' | 'app'>().notNull().default('google'),
		title: text('title').notNull(),
		dates: text('dates', { mode: 'json' }).$type<string[]>().notNull(), // days it covers, YYYY-MM-DD
		taskIds: text('task_ids', { mode: 'json' }).$type<number[]>().notNull()
	},
	(table) => [uniqueIndex('calendar_events_key').on(table.email, table.calendarId, table.eventId)]
);

// Only for Google Calendar
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	taskId: integer('task_id')
		.references(() => tasks.id, { onDelete: 'cascade' })
		.notNull(),
	reminderTime: integer('reminder_time').notNull()
});
