# ADHS Tasker - Claude Instructions

## What This App Is

A task management web app built for people with ADHD. The core concept: the app is always open, always visible, and always shows exactly what the user should be doing *right now*. It is an external anchor - it holds the plan so the user's working memory doesn't have to.

Every design and implementation decision should be evaluated against this: does it reduce cognitive load, minimize unnecessary decisions, and keep the user anchored to the present task?

## ADHD-Specific Design Principles

This is not a generic productivity app. ADHD users have specific needs that must be treated as first-class constraints:

- **One thing at a time.** The UI should never overwhelm. The active task gets visual dominance; everything else recedes.
- **Minimal friction.** Every extra tap, decision, or step before a user can see their current task is a failure. Login once, then it just works.
- **Forgiving interactions.** Accidental task completion, mis-scheduling - these should be easy to undo.
- **External anchoring.** The app should re-attract attention (audio cues, color shifts) rather than expect the user to remember to look at it.
- **Immediate feedback.** Completing a task should feel satisfying. Audio + visual confirmation matters.

When implementing new features, think carefully about the ADHD experience. When in doubt, do less and do it better rather than adding more.

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (Runes API - `$state`, `$derived`, `$effect`)
- **Styling:** Tailwind CSS 4 + shadcn-svelte (components in `src/lib/components/ui`, add more with `bun x shadcn-svelte@latest add <name>`). Dark mode is a `.dark` class on `<html>`; status colors are `success`, `warning`, `info` tokens in `src/app.css`
- **Database:** SQLite via Drizzle ORM (file: `local.db`)
- **Auth:** Google OAuth 2.0 via Arctic 3
- **Runtime:** Bun (dev + production)
- **Deployment:** `@sveltejs/adapter-node` + PM2 on port 3002

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Now - current task hero in an urgency color, rail with the next 4 tasks, missed strip. Top bar auto-hides, fullscreen + wake lock |
| `/edit` | Plan - day switcher, 24-hour timeline (drag to move, handle to resize, 15 min snap), quick add line, phone list |
| `/edit` (API) | Task CRUD - GET (one day, `?date=`), POST, PUT, DELETE |
| `/callback` | Google OAuth callback |
| `/assistant` (API) | `POST` chat turn (tool loop against OpenAI with the user's own key), `POST /assistant/undo` reverts one logged change |
| `/settings` | Theme, timezone, OpenAI key (form actions `saveOpenaiKey`/`removeOpenaiKey`), "Assistant on its own" (autonomy, events, quiet hours, daily budget, form action `saveAgent`), and "Google Workspace": tick Tasks, Calendar, Keep and link them (incremental Google authorization, form actions `linkGoogle`/`unlinkGoogle`) |
| `/activity` | What the assistant changed (reason, Undo) and the events it saw with what became of them, plus today's token use |
| `/agent` (API) | `GET` what the agent did on its own (open card, plan changes since `?since=<action id>`), fetched when the stream says so. `POST /agent/cards/[id]` dismisses or answers a card |
| `/stream` (API) | Server-Sent Events (`?device=<id>`): hints `agent`, `schedule`, `alarm`, `tone`, `display`. The client fetches the data itself, a missed push costs nothing |
| `/schedule` (API) | `GET` pending alarms and wakeups, `POST` a user alarm (`at`, `label`, `tone` name, `repeat`), `DELETE /schedule/[id]` cancels, `POST /schedule/display` chooses the display device |
| `/alarms` | User alarms with tone preview, the "use this device for sound" choice, the assistant's wakeups |

### State Management

Single global reactive object in `src/lib/app.svelte.ts`:

```ts
tasker = {
  tasks: Task[],
  isMuted: boolean, volume: number,
  themeMode, dayStart, dayEnd, timezone,
  toast: { message, undo? } | null,  // transient confirmation with an Undo button
  assistant: { open, busy, messages },
  agent: { cards, cursor },          // open card for the strip on Now, last agent action id seen
  schedule: { alarms, wakeups, ringing, loaded },  // pending alarms (rung by local timers and the stream), the alarm banner
  device: { id, display, streaming } // id: per-browser, display: the device that plays sound (null = all)
}
```

There is no stored "active task". What is current is derived on every tick by the pure `rank(tasks, now)` in `src/lib/priority.ts` (highest priority among tasks whose window contains now; completed tasks are the only status that matters). `switchReason()` explains each switch. Urgency colors come from `urgencyLevel()` in `src/lib/urgency.ts`.

Hydrated from server on layout load. Updated optimistically on mutations. Destructive actions have an Undo toast (`showToast` in `src/lib/index.ts`) instead of confirm dialogs. **Login is required** - there is no unauthenticated localStorage fallback (by design).

### Database Schema (`src/lib/server/db/schema.ts`)

**`users`** - keyed by Google email
- `email` (PK), `enableReminders`, `reminderAdvanceTime` (minutes), `enableOverdueNotifications`, `enableFocusMode`, `darkMode`, `openaiKey`, `timezone`, `googleServices` (space separated ids of linked Google services, scopes in `src/lib/google.ts`), agent settings `aiAutonomy` (observe|suggest|act, default suggest), `aiEvents` (space separated event types it may react to), `quietStart`/`quietEnd`, `dailyTokenBudget` (null = none), `lastCurrentTaskId` (what the scheduler saw as current, 0 = free time, null = never tracked), `displayDevice` (browser id that plays alarms and agent tones, null = every device)

**`tasks`**
- `id`, `title`, `description`, `email` (FK), `date` (`YYYY-MM-DD` in the user's timezone), `startTime` (minutes since midnight), `duration` (minutes), `priority` (1–5 enum), `status` ('pending'|'active'|'completed'|'overdue')

**`agent_actions`** - every plan change the assistant made: `email`, `tool`, `before`/`after` (task JSON), `eventId` (set when a reaction made it, null for chat), `reason`, `createdAt`, `undoneAt`. Undo restores `before`

**`events`** - everything the agent can observe: `type`, `payload`, `origin` (user|agent|system), `key` (detected events only, unique per user so a fact is logged once), `createdAt`, `handledAt`, `outcome` (what became of it, e.g. `silent: quiet hours`, `reacted: ask`). Pruned after 30 days

**`agent_cards`** - notes (`say`) and questions (`ask`, with `options`) shown in the strip on Now until resolved. A new card resolves the older open ones

**`ai_usage`** - tokens per model call (`use`: chat|reaction), for the daily meter, the budget and the reaction rate limit. Rows with `use: tone` (0 tokens) count the custom tones the agent defined today

**`schedule`** - `kind` alarm|wakeup, `fireAt` (epoch ms), `repeat` none|daily|weekdays with `minutes` (local clock time, so repeats follow daylight saving), `label`/`tone` (alarm, tone JSON stored so it replays identically), `note` (wakeup, the agent's note to itself), `createdBy` user|agent, `status` pending|done|cancelled. Pruned 7 days after it ended

**`reminders`** - prepared for Google Calendar sync, not yet wired up
- `id`, `taskId` (FK), `reminderTime` (minutes since midnight)

### Auth Flow (`src/hooks.server.ts`, `src/routes/callback/+server.ts`)

1. User clicks login → server generates OAuth state + PKCE verifier, stores in httpOnly cookies, redirects to Google
2. Google redirects to `/callback` → validates state, exchanges code for token, sets 7-day token cookie
3. Every request: `hooks.server.ts` validates token with Google OIDC, creates user in DB on first login, populates `event.locals.user`

### PWA

`static/manifest.webmanifest` and icons make the app installable (standalone, fullscreen preferred). `src/service-worker/` caches only built assets and static files, pages and task data always come from the server. The service worker has its own tsconfig and is excluded from the root one (SvelteKit 3 layout). `DATABASE_URL` is a static env: it is baked in at build time, so a production build always uses the DB from `.env`.

### Assistant

Chat drawer (`AssistantDrawer.svelte`, opened from the top bar, chat state in `tasker.assistant`, lives for the page session). Server side in `src/lib/server/assistant.ts`: system prompt with today and tomorrow, tools `list_tasks`, `add_task`, `update_task`, `delete_task` (validated by the pure `src/lib/assistant-tools.ts`, always scoped to the logged-in email), max 6 tool rounds, 20 requests per 5 minutes per user. Every write is logged to `agent_actions`; the client refreshes the touched days with `loadDay` and shows an Undo toast plus per-change Undo buttons.

**OpenAI rules, always enforced** (`src/lib/openai.ts`, every request is built by `buildRequest`, covered by tests): Responses API (`/v1/responses`), model `gpt-6-luna`, `store: false`, `service_tier: 'flex'`. Because nothing is stored at OpenAI, each round sends the whole conversation and the previous output items, with `reasoning.encrypted_content` included. Reasoning effort is not a user setting: it is fixed per use in `EFFORT_BY_USE` (`chat` medium, `reaction` low, `replan` high). New model calls must go through `buildRequest` with a `Use`. Flex can be slow or out of capacity, so the call waits up to 120 s and retries once on 429.

The OpenAI key is encrypted at rest (AES-256-GCM, key derived from `GOOGLE_CLIENT_SECRET`, `src/lib/server/crypto.ts`) and never reaches the client: the layout only passes `hasOpenaiKey`. Changing `GOOGLE_CLIENT_SECRET` invalidates saved keys, the user pastes the key again.

### Event-driven agent

Every plan edit calls `emit()` (`src/lib/server/events.ts`): the UI routes in `/edit`, the assistant tools and undo. Events are logged first, `emit` never throws so an edit cannot fail because of logging. Types and detection are pure and shared: `src/lib/events.ts` (`detectEvents` runs the same `rank()` as the screen to find `task.switched`, `task.missed` after 5 min, `task.overrun` after 15 min for the most recently ended unfinished task, `describeChange` turns a before/after pair into an event). The scheduler (`src/lib/server/agent.ts`, started once in `hooks.server.ts`, skipped during the build) ticks every 15 s and compares with `users.lastCurrentTaskId`.

**Events caused by the agent never wake the agent**: its own edits are emitted with `origin: agent` and are only logged, a switch within 60 s of an agent edit counts as agent too. A reaction may use at most 4 tool calls and show at most one card.

Guardrails live in the pure `src/lib/guardrails.ts` (`decideReaction`, covered by tests) and run before any model call: autonomy (`observe` logs only, `suggest` offers `say`/`ask` and cannot edit, `act` may also edit with a reason and Undo, enforced again server side), per-event toggles (default: completed, missed, overrun), quiet hours (default 22:00 to 07:00), events within 5 s are coalesced into one reaction, at most 6 reactions per hour and 3 minutes apart, optional daily token budget (unprompted reactions only, chat is exempt), no key means silence. Events older than 10 minutes are dropped instead of answered late. The reaction model call uses `reaction` effort (low) and `reactionTools(mayEdit)` through `buildRequest`. Every event gets an `outcome`, shown on `/activity`.

The client opens one event stream (`src/lib/stream.ts`, started in the layout) and fetches `/agent` when it says the agent did something, for the card and for plan changes the agent made on its own, which show an Undo toast. On every (re)connect and when the page becomes visible it fetches again, and while the stream is down `/agent` is polled every 30 s. Answering a card continues in the chat: the question becomes the assistant's last message and the chosen option the user's reply.

**Schedule, wakeups and alarms** (`src/lib/schedule.ts` pure and tested, `src/lib/server/schedule.ts`): the same 15 s tick runs `fireDue()`. A repeating alarm moves on before anything else so a crash cannot ring twice, an entry more than 10 minutes late is retired without ringing. Alarms emit `alarm.fired` (logged, never wakes the agent) and push `alarm` over the stream. The client also keeps the next alarms in `setTimeout`s (`src/lib/alarms.ts`) and dedupes by `id@fireAt`, so a dropped stream or a slow tick does not delay one. A ringing alarm shows a calm banner and repeats its tone up to 3 times, 30 s apart, until dismissed. Wakeups emit `wakeup.fired` with the agent's own note, they need no toggle but obey autonomy, quiet hours, rate limit and budget (a wakeup that is silenced is gone, its outcome says why). Tools (`assistant-tools.ts`): `schedule_wakeup` (at least 5 min ahead, max 10 pending, not in quiet hours unless the user asked in chat), `set_alarm` (unprompted only with autonomy `act`), `play_tone`, `cancel_schedule`. Max 30 alarms, at most 14 days ahead.

**Tones** (`src/lib/tones.ts`, no audio files): library `chime soft nudge rising urgent`, or a custom note sequence (wave, up to 12 notes, 100 to 2000 Hz, 5 s in total). Custom tones are for the agent only (3 per day, enforced server side), the user picks library tones. `playTone` in `src/lib/index.ts` validates again and uses the user's volume as the ceiling, nothing flashes.

**Display device**: with several open screens only the chosen device makes sound (`users.displayDevice`, a per-browser id from localStorage), the others show the alarm silently. If the chosen device is not connected to the stream, every device plays, so an alarm is never silent. `/stream` announces the effective device with a `display` message.

### Time Representation

All times are stored as **minutes since midnight** (0–1440). A task at 9:30am = `570`. Duration of 90 minutes = `90`. Convert carefully when working with JS `Date` objects.

The day a task belongs to is `task.date` (`YYYY-MM-DD`, user timezone, helpers in `src/lib/time.ts`). Tasks do not cross midnight, split them. The Now screen ranks only today's tasks. The layout preloads tasks from yesterday on, the Plan screen fetches any other day with `loadDay(date)`.

### Audio (`src/lib/index.ts`)

Synthesized via Web Audio API - no audio files. `playSound('task-started')` and `playSound('reminder')`, `playTone(tone)` for alarms and agent tones (see Tones above). Reminder fires every 5 minutes while a task is current and app is unmuted. `task-started` plays when the current task switches while the page is open.

## Development Commands

```bash
bun run dev          # Dev server
bun run build        # Production build
bun run check        # Type check
bun run lint         # Prettier + ESLint
bun run format       # Auto-format
bun run db:push      # Apply schema to SQLite
bun run db:studio    # Drizzle Studio GUI
```

## Current Gaps & Known Issues

- Linking Google services only records the grant. Access and refresh tokens are not stored yet, store them encrypted when the first feature (Calendar sync) needs them. Google Clock has no API, so it is not offered

- Stored statuses `active` and `overdue` are no longer written or read. Missed tasks are derived by `rank()` (window ended, not completed). Remove the unused enum values in a later cleanup
- Reminder notifications are schema-ready but not wired up
- The assistant answers in one piece, not streamed. Voice and wakeups come in later phases
- Events `stuck.pressed` and `day.started` arrive with their phases. Agent-made tasks are not yet marked in the Plan view, the activity page lists them. Every open device shows the agent card, only sound follows the display device
- Alarms and wakeups reach only open screens (no Web Push for a closed app yet). Alarms cannot be tied to a task (`task_id` of the plan was left out), the agent computes the time. The stream is in process, one server process only
- The overrun event is a fixed 15 minutes (`OVERRUN_MINUTES` in `src/lib/events.ts`), the hyperfocus alarm of phase 9 makes it configurable

## Product Direction (UI rework)

The full plan is in `docs/ui-rework-plan.md`. Summary:

- The app is an **ambient priority display** for an always-on second screen (desktop first, fully responsive). The Now view is the home page, not an optional mode.
- Now shows the current top-priority task in an urgency color, plus a rail of the following tasks. Ranking lives in one pure function (`src/lib/priority.ts`).
- Plan screen with dated days replaces the dashboard list and sidebar.
- An assistant (text and push-to-talk voice) reads and edits the plan through server-side tool calls.
- The assistant is event-driven: task completed, created, changed, switched or missed, alarms and its own scheduled wakeups all become events it may react to or ignore. It can schedule wakeups and set alarms with tones. Guardrails (autonomy setting, rate limits, undo for every agent change) come before autonomy. The app must work fully without AI.

## Planned Features (Do Not Implement Without Discussion)

- **Google Calendar sync** - two-way, needs dated days first
- **End-of-day summary** - small retrospective, replaces the full analytics dashboard
- **Recurring tasks, capture inbox** - dated days exist now
- Parked on purpose: adaptive behavior model, Crisis Mode, anti-context-switch scheduler

## What to Avoid

- Do not add features that increase cognitive load on the user without a clear ADHD-experience justification
- Do not split state into multiple stores - the single `tasker` object is intentional
- Do not add unauthenticated/localStorage fallback - login is required by design
- Do not add animation or visual complexity that competes with the active task display (no emoji, no decorative elements, no flashing)
- Do not add stat tiles, marketing copy or footers to the main views
- Do not touch the DB schema without applying it afterward (`bun run db:push`, or a script like `scripts/add-task-date.ts` when drizzle-kit cannot run)
