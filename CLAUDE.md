# ADHD Tasker - Claude Instructions

## What This App Is

A planner for people with ADHD that is always open and always shows what to do _right now_. It is an external anchor: it holds the plan so the user's working memory does not have to. It runs fullscreen on an always-on second screen (desktop first, responsive down to phone, installable as a PWA). It works without an account: a guest's plan, settings and OpenAI key live in the browser. Signing in is optional and adds sync across devices, alarms from the server and Google Calendar.

Judge every design and implementation decision against this: does it reduce cognitive load, minimize decisions, and keep the user anchored to the present task? When in doubt, do less and do it better.

## ADHD Design Principles (first-class constraints)

- **One thing at a time.** The current task dominates the screen, everything else recedes.
- **Minimal friction.** Login once, then the current task is visible without any tap.
- **Forgiving.** Destructive or accidental actions are undoable (Undo toast, not confirm dialogs).
- **External anchoring.** The app re-attracts attention with audio and color shifts instead of expecting the user to look.
- **Immediate feedback.** Completing a task gets audio and visual confirmation.
- **Calm.** No emoji, no decoration, no flashing, no animation that competes with the current task.
- **Color is never the only cue.** Priority and urgency also have a non-color signal (label or bar segments) for color-blind users. Color changes crossfade slowly, they never flash or pulse.

## Tech Stack

- SvelteKit 3 + Svelte 5 (Runes only: `$state`, `$derived`, `$effect`, `$props`; no stores, no Svelte 4 patterns)
- Tailwind CSS 4 + shadcn-svelte (components in `src/lib/components/ui`, add with `bun x shadcn-svelte@latest add <name>`). Dark mode is a `.dark` class on `<html>`. Status color tokens `success`, `warning`, `info` and the urgency tokens live in `src/app.css`
- SQLite + Drizzle ORM (`local.db`, config in `drizzle.config.ts`)
- Auth: Google OAuth 2.0 with PKCE via Arctic 3, plus Google One Tap
- Bun for dev, tests and production (`bun x`, never `bunx`)
- `@sveltejs/adapter-node`, PM2 on port 3002, deployed with `bun run deploy`
- Env vars are declared in `src/env.ts` (all static, baked in at build time): `PUBLIC_GOOGLE_CLIENT_ID`, `PUBLIC_REDIRECT_URI`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`. See `.env.example`

## Commands

```bash
bun run dev          # dev server
bun run build        # production build
bun run check        # svelte-kit sync + svelte-check --fail-on-warnings, tsc for the service worker and scripts
bun run test         # unit tests (*.test.ts next to the code), isolated, random order, one line on pass, only failures on fail, -v for full output
bun run verify       # the gate: format, tests with coverage, tests in two more timezones, types, lint, build
bun run verify --quick  # the same without lint and build (about 20 s)
bun run lint         # prettier --check + eslint (type aware)
bun run format       # prettier --write
bun run db:push      # apply schema to SQLite
bun run db:studio    # Drizzle Studio
bun run deploy       # see Deployment
```

Run `bun run verify --quick` before committing. While working, prefer `bun run test` over plain `bun test`: it keeps the output short (`scripts/test.ts`). `verify` stops at the first failing step and prints its output. Tests need 90 % of all lines and functions covered, counted over the whole report (`scripts/coverage.ts`), not per file.

## Conventions

- **Imports:** use the `#lib/...` alias (declared in `package.json` `imports`, e.g. `#lib/time.js`, `#lib/server/db/index.js`), not relative paths up to `src/`. Server-only code lives in `src/lib/server/`.
- **Logic goes in pure modules.** Anything with rules (ranking, events, guardrails, tools validation, schedule math, tones, quick add parsing, time helpers) is a pure function in `src/lib/*.ts` with a test next to it. Components and routes only render or wire.
- **Single state object.** All client state is one `tasker` object in `src/lib/app.svelte.ts`. Do not split it into multiple stores.
- **Components never call `fetch`.** They go through `tasker.backend` (the `Backend` interface in `src/lib/backend.ts`). Rules shared by server and device live in `src/lib/core/` and run against a `Repo`, so the same code serves an account and a guest. A new `Backend` method must be added to `remote-backend.ts`, `local/backend.ts` and `BACKEND_METHODS` in `local/deferred.ts`.
- **Time:** times are minutes since midnight (0 to 1440), durations in minutes. A task belongs to `task.date` (`YYYY-MM-DD` in the user's timezone, helpers in `src/lib/time.ts`). Tasks never cross midnight, split them. Convert carefully around JS `Date`.
- **Schema changes** must be applied afterwards: `bun run db:push`, or a one-off script in `scripts/` (like `scripts/add-schedule.ts`) when drizzle-kit cannot run. Production uses `bun run deploy --db-push`.
- **No em dashes** in code, comments, docs or replies.

## Tests

- Next to the code as `name.test.ts`; route tests next to the route without the `+` prefix; helpers in `src/test/` (`db.ts`, `fixtures.ts`, `fakes.ts`), imported as `#test/...`.
- `describe` names the unit, `test` states the behavior as a sentence ("window is start inclusive and end exclusive").
- Import through `#lib`. Keep the `/// <reference types="bun" />` header in tests under `src/` (Bun's types in the root tsconfig would leak into client code).
- No network: fakes only (`fakeFetch`). The preload (`src/test/preload.ts`) refuses every real request and fails the test even when the code swallowed the error.
- No wall clock or machine timezone: `setSystemTime`, fake timers or an explicit `now`. The gate runs three timezones.
- Database tests start with `beforeEach(resetDb)` (in-memory SQLite, own database per file), build data with `makeUser`/`makeTask` and assert on rows. Routes are called directly with `callRoute`.
- One behavior per test, tables for matrices.
- Prompts: assert the facts that matter, never the full text.
- A bug fix starts with a failing test, in its own commit before the fix.
- `src/test/architecture.test.ts` checks the repo rules (no em dashes, `bun x` only, every module paired with a test or listed as untested with a reason, OpenAI call sites, module-level `$state`, browser storage). Remove a module from its untested list once it has a test.

## Architecture

### Routes

| Route                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Now: hero in an urgency color (active, wrapping up, time up with a transition bar, free, empty: `heroState` in `now.ts`), rail with the next tasks, missed strip, agent card strip. Top bar auto-hides, fullscreen and wake lock                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/edit`              | Plan: day switcher in the bar (`tasker.plan.date`), timeline with the hours outside My day (`myDayStart`/`myDayEnd`, default 07:00 to 23:00) folded (drag to move, handle to resize, drag on empty space to draw, arrow keys on a block, 15 min snap), quick add line with preview (Task                                                                                                                                                                                                                                                                                                                                                                                               | Alarm switch: alarms are one line such as `Meds 8:00 daily` or `Tea in 5 min`, one tone), Comfortable/Compact icon at the end of the bar, an alarm lane beside the timeline (alarms of the day as cards in time order with an on/off switch and Cancel, joined to a thin line at their time under the tasks: strong when they ring that day, soft dashed on other days, grey when off, `alarmview.ts`), grouped phone list |
| `/edit` (API)        | Task CRUD: GET one day (`?date=`), POST, PUT, DELETE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/activity`          | Assistant activity: changes grouped by day (reason, Undo), planned check-ins (the assistant wakeups, Cancel), a folded event log, today token use as a footnote                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/settings`          | Sections: Reminders and sound (check-in chime, heads-up, overrun tap, clock, as chips), Appearance (theme, "By daylight" with its location: device, city search, automatic), Time (timezone, My day), Assistant (key, then autonomy cards, Advanced, voice when a key is saved), Account and data. Everything saves on change through `PUT /settings` (`tasker.backend.settings.save`, validated by `parseSettingsPatch` in `settings.ts`), except the OpenAI key (`saveOpenaiKey`/`removeOpenaiKey`) and Google (`linkGoogle`/`unlinkGoogle`, Calendar only is offered). `/settings/timezone` saves the timezone. `GET /settings/location?q=` is the city search (see Daylight theme) |
| `/privacy`, `/terms` | Privacy policy and terms of use, public, linked from the profile menu. Keep them in sync when data handling changes (new fields, retention, third parties, cookies)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/callback`          | Google OAuth callback (GET) and One Tap credential (POST)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/assistant` (API)   | `POST` one chat turn (tool loop against OpenAI with the user's own key). `POST /assistant/undo` reverts one logged change. `POST /assistant/transcribe` speech to text, `POST /assistant/speak` text to wav (see Voice)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/agent` (API)       | `GET` what the agent did on its own (open card, changes since `?since=<action id>`). `POST /agent/cards/[id]` dismisses or answers a card. `POST /agent/stuck` (`{ taskId, reason }`) logs `stuck.pressed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/stream` (API)      | Server-Sent Events (`?device=<id>`) with hints `agent`, `schedule`, `alarm`, `tone`, `display`. Hints only: the client fetches the data itself, a missed push costs nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/schedule` (API)    | `GET` pending alarms and wakeups, `POST` a user alarm, `DELETE /schedule/[id]`, `POST /schedule/display` chooses the display device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/calendar` (API)    | Google Calendar: `GET` overview, `/calendar/preview`, `/calendar/import`, `/calendar/sync`, `/calendar/all-day`, `PUT /calendar/write` (where own tasks go), `DELETE` stops following                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/account` (API)     | Move a device's plan in (`/account/import`), list and restore snapshots, delete the account. `/export` and `/import` serve the data file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/about`             | What the app is for and what each mode stores where, public                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Core principle: nothing stored for "current"

There is no stored active task. What is current is derived on every tick by the pure `rank(tasks, now)` in `src/lib/priority.ts`: highest priority among today's tasks whose window contains now, completed is the only status that matters. `switchReason()` explains each switch. Urgency colors come from `urgencyLevel()` in `src/lib/urgency.ts`. The client and the server scheduler run the same `rank()`, so what the screen shows and what the agent reacts to can never disagree.

### State

`tasker` in `src/lib/app.svelte.ts`: `backend` (the remote or the local `Backend`, chosen by the layout), `tasks`, `isMuted`, `volume`, `themeMode`, `timezone`, `toast` (message plus optional Undo), `assistant` (`open`, `busy`, `messages`), `agent` (`cards`, `cursor`), `schedule` (`alarms`, `wakeups`, `ringing`, `loaded`), `device` (`id`, `display`, `streaming`). Hydrated by the layout load, updated optimistically on mutations. Day data comes from `loadDay(date)`; the layout preloads from yesterday on. Toasts via `showToast` in `src/lib/index.ts`.

### Database (`src/lib/server/db/schema.ts`)

- `users`: keyed by Google email. Reminder flags (`enableReminders`, `reminderAdvanceTime`), hyperfocus (`hyperfocusAlarm`, `overrunMinutes`), `enableFocusMode` (unused), `darkMode`, `timezone`, encrypted `openaiKey`, `googleServices` (space separated, scopes in `src/lib/google.ts`), agent settings (`aiAutonomy` observe|suggest|act default suggest, `aiEvents`, `quietStart`/`quietEnd`, `dailyTokenBudget`), `lastCurrentTaskId` (what the scheduler last saw as current, 0 = free time, null = never tracked), `displayDevice`, `voiceReplies`, `showClock`, `checkInMinutes` (check-in chime, 0 = off), `myDayStart`/`myDayEnd` (the hours Plan shows in full), `locationLat`/`locationLon` (rounded to 2 decimals), `locationName`, `locationSource` (`ip` | `device` | `city`, null = find it automatically) for the daylight theme
- `tasks`: `title`, `description`, `email`, `date`, `startTime`, `duration`, `priority` (1 to 5), `status`. Only `completed` is meaningful; `active` and `overdue` are no longer written or read and can be removed from the enum in a cleanup
- `agent_actions`: every plan change by the assistant with `before`/`after` JSON, `eventId`, `reason`, `undoneAt`. Undo restores `before`
- `events`: everything the agent can observe (`type`, `payload`, `origin` user|agent|system, unique `key` per user for detected events, `handledAt`, `outcome`). Pruned after 30 days
- `agent_cards`: `say` notes and `ask` questions (with `options`) shown on Now until resolved. A new card resolves older open ones
- `ai_usage`: tokens per model call (`use`: chat|reaction|replan, plus `tone` rows with 0 tokens counting custom tones per day)
- `schedule`: alarms and wakeups. `fireAt` epoch ms, `repeat` none|daily|weekdays with local `minutes` (follows daylight saving), `label`/`tone` (tone JSON stored so it replays identically), `note` (agent's note to itself), `createdBy`, `status`. Pruned 7 days after it ended
- `plan_snapshots`: a copy of an account's plan (tasks, alarms, settings) kept 30 days before a move into the account or a restore
- `google_tokens`: the Google refresh token per user, encrypted like the OpenAI key, revoked at Google on Unlink and on account deletion
- `calendar_sync`: per user the followed calendars, status (`preview`, `active`), `write_calendar` (null = off) and the last read
- `calendar_events`: the link between a Google event and the tasks made from it (`taskIds`, `etag`, `origin` `google` or `app`)
- `reminders`: unused

### Auth (`src/hooks.server.ts`, `src/routes/callback/+server.ts`, `src/lib/server/session.ts`)

1. Login generates OAuth state and a PKCE verifier in httpOnly cookies and redirects to Google (`login()` in `src/lib/server/index.ts`). One Tap posts an ID token to `/callback`.
2. `/callback` validates state, exchanges the code and sets the cookie. A signed `session` cookie (HMAC with `GOOGLE_CLIENT_SECRET`, 7 days) is the primary credential; the Google `token` cookie is the fallback checked against the OIDC userinfo endpoint.
3. `hooks.server.ts` resolves the email on every request, creates the user on first login and fills `event.locals.user`. It also starts the agent scheduler once (skipped while building).
4. **Two modes.** Without an account (guest) the plan lives in IndexedDB on the device (`src/lib/local/`), the layout load returns no user and no tasks, `tasker.backend` is the local backend and every server API answers 401 to a guest (the guest never calls it). With an account `tasker.backend` is `remoteBackend`. Never keep task data in `localStorage`: only `src/lib/local/**` may hold the guest's data.
5. **Sign in is optional.** Google's sign-in script is loaded on demand (never for a guest who does not ask, and not on `/privacy` or `/terms`). On the first sign in the device's plan moves into the account (`moveIntoAccount` in `src/lib/server/account.ts`, `src/lib/core/merge.ts`): a new account takes it at once with an Undo, an account that has a plan asks first, and the account's plan is kept as a `plan_snapshots` row for 30 days.
6. Linking Google services reuses the flow with incremental scopes (`google_oauth_link` cookie), asks for offline access and stores the refresh token encrypted in `google_tokens` (`src/lib/server/google-tokens.ts`). Unlink and Delete my account revoke it at Google first.

### Google Calendar (`src/lib/core/calendar.ts`, `src/lib/server/calendar*.ts`, `google-calendar.ts`, `CalendarSettings.svelte`)

Scope `calendar.events` only. Read: the user picks calendars, sees a preview (counts and clashes, nothing written), then imports. Events of the next 14 days become tasks (split at midnight, all-day events show as a line on Plan). A sync while a screen is open, every 5 minutes, diffs the window by `etag` (no sync tokens). A deleted task is never recreated. Write: moving, resizing or completing an imported task patches the event (time, and the line "Done in ADHD Tasker" in its description, never a deletion) guarded by `etag`, and when Google changed it meanwhile Google wins and a toast says so (`writeTaskChange` in `calendar-write.ts`, hooked into the `/edit` routes). Events cut at midnight are read only in the app. The setting "Add my own tasks to Google Calendar" (off by default) creates events for the user's own tasks in a writable calendar. Assistant and agent edits are not written to Google yet. Google verification for the sensitive scope is in `docs/google-verification.md`. The Privacy page carries the Limited Use statement: change it together with this code.

### Guest mode (`src/lib/local/`)

`localBackend` runs the `core/` rules on `local/repo.ts` (IndexedDB with a versioned list of upgrade steps). `deferred.ts` stands in until the database is open, so Now shows nothing for one calm frame, never the empty state. A client tick every 15 s (`agent-loop.ts`) does what the server loop does for one user: `detectEvents`, the agent through `decideReaction` (same guardrails), due alarms and wakeups, pruning. It runs only in the leading tab (`leader.ts`, `navigator.locks`). The OpenAI key lives in the local repo and the browser calls `api.openai.com` directly (`openai-direct`, the one extra OpenAI call site). A Content Security Policy limits where the page may send data. Settings has Your data: export, import and delete everything on the device.

### Assistant (chat)

`AssistantDrawer.svelte`, opened from the top bar (only when a key is saved, or with `A`), state in `tasker.assistant`. Server side in `src/lib/server/assistant.ts`: system prompt with today and tomorrow, tools `list_tasks`, `add_task`, `update_task`, `delete_task` (validated by pure `src/lib/assistant-tools.ts`, always scoped to the logged-in email), max 6 tool rounds, 20 requests per 5 minutes per user. Every write is logged to `agent_actions`; the client refreshes touched days and shows an Undo toast plus per-change Undo buttons. The reply arrives in one piece, not streamed.

**OpenAI rules, always enforced** (`src/lib/openai.ts`, tested): every request is built by `buildRequest` with a `Use` (`chat`, `reaction`, `replan`). Responses API (`/v1/responses`), model `gpt-6-luna`, `store: false`, `service_tier: 'flex'`. Nothing is stored at OpenAI, so each round resends the whole conversation and previous output items with `reasoning.encrypted_content` included. Reasoning effort is fixed per use in `EFFORT_BY_USE` (chat medium, reaction low, replan high), never a user setting. Calls wait up to 120 s and retry once on 429. New model calls must go through `buildRequest`.

The user's OpenAI key is encrypted at rest (AES-256-GCM, key derived from `GOOGLE_CLIENT_SECRET`, `src/lib/server/crypto.ts`) and never reaches the client (the layout only passes `hasOpenaiKey`). Changing `GOOGLE_CLIENT_SECRET` invalidates saved keys. The app must work fully without AI.

### Voice

Push-to-talk only (no always-listening mic). The mic button in `AssistantDrawer.svelte` records while held (or Space on it), `POST /assistant/transcribe` (multipart `audio`) returns `{ text }` via `gpt-transcribe`, and the text is sent like a typed message. `POST /assistant/speak` (`{ text }`) returns a wav: the server opens one short Realtime WebSocket session to `gpt-realtime-2.1-mini` (audio only out, voice `marin`, instructed to read the text verbatim), collects the 24 kHz PCM chunks and wraps them in a WAV header (the old speech endpoint models are removed 2027-01-06). Pure rules (models, limits, `speakable()` trimming to 280 chars, recording type, ducking volume) in `src/lib/voice.ts` (tested), server calls in `src/lib/server/voice.ts` (user's key, 30 requests per 5 minutes), browser side in `src/lib/speech.ts`. These two endpoints are the only OpenAI calls that do not go through `buildRequest` (file transcription endpoint and Realtime, not the Responses API), nothing is stored. Spoken output is the `users.voiceReplies` setting (default off, on `/settings`, `tasker.voice.replies`): chat replies are spoken on the device where they were asked, new agent cards only on the display device and never on the first fetch after a load. Every chime and tone calls `duckSpeech()`, so speech drops to a whisper while an anchor sound plays. Muting stops speech. Starting to talk or sending a message stops speech.

### Event-driven agent

Every plan edit calls `emit()` (`src/lib/server/events.ts`): the `/edit` routes, assistant tools and undo. Events are logged first and `emit` never throws. Types and detection are pure and shared in `src/lib/events.ts` (`detectEvents` uses `rank()` to find `task.switched`, `task.missed` after 5 min, `task.overrun` after `users.overrunMinutes`, default 15 = `OVERRUN_MINUTES`; `describeChange` turns a before/after pair into an event). The scheduler in `src/lib/server/agent.ts` ticks every 15 s and compares with `users.lastCurrentTaskId`.

- **Agent-caused events never wake the agent.** Its edits are emitted with `origin: agent` and only logged; a switch within 60 s of an agent edit counts as agent too. A reaction may use at most 4 tool calls and show at most one card.
- **Guardrails** are pure in `src/lib/guardrails.ts` (`decideReaction`, tested) and run before any model call: autonomy (`observe` logs only, `suggest` offers `say`/`ask` and cannot edit, `act` may also edit with a reason and Undo, enforced again server side), per-event toggles (default completed, missed, overrun), quiet hours (default 22:00 to 07:00), events within 5 s coalesced, at most 6 reactions per hour and 3 minutes apart, optional daily token budget (unprompted only, chat is exempt), no key means silence. Events older than 10 minutes are dropped. Every event gets an `outcome`, shown on `/activity`.
- **Client side:** one event stream (`src/lib/stream.ts`, started in the layout). It fetches `/agent` when the stream says so, on every (re)connect and when the page becomes visible, and polls every 30 s while the stream is down. Agent edits made on their own show an Undo toast. Answering a card continues in the chat.
- The stream is in process (`src/lib/server/stream.ts`), so the app must run as one server process.

### Anchoring: "I'm stuck", reminders, hyperfocus alarm

Pure rules in `src/lib/anchoring.ts` (tested). All three work without an OpenAI key.

- **"I'm stuck"** is a button next to Done in `NowHero.svelte`. The user picks what is in the way (`STUCK_REASONS`), a fixed hint with one small first step shows at once with a button that sets a short timer alarm (`POST /schedule` with `in_minutes`), and `POST /agent/stuck` logs `stuck.pressed` (origin user). The agent answers with one `say`/`ask` card when it can. The event is not a toggle: it ignores per-event toggles, quiet hours, the budget and the 3 minute gap (the user is here and asking), but `observe`, a missing key and the hourly limit still apply.
- **Reminders:** the heads-up line for the next task in the hero ("Call dentist starts in 5 min. Start wrapping up.") and the soft `reminder` chime when it starts within `users.reminderAdvanceTime` minutes (`reminderDue`), if `enableReminders`.
- **Hyperfocus alarm:** the hero shows time up (`heroState`: the latest unfinished task ended, stays until answered or for two overrun windows) and the `nudge` tone sounds when it passed its end by `users.overrunMinutes` (`hyperfocusDue`), if `hyperfocusAlarm`. Time up offers Done, 15 more min and Move to later (`extendTask`, `moveLater` in `plan.ts`), every change with an Undo toast. The same minutes drive the `task.overrun` event. A page loaded long after the moment stays quiet. Entering the wrap-up of a task plays one soft `wrap-up` sound (`wrapUpStarted`).
- Both run in `src/routes/+page.svelte`, sound only on the display device (`playsSound()`), once per moment (`momentKey`), muted when muted. Both settings are on `/settings`.
- **Done:** after Done on the task the hero shows (`heroFocus`) the hero confirms for 1.5 s (check mark, title struck through, `DONE_CONFIRM_MS`) while the `done` sound plays on the display device, then moves on. The page reads the hero before the optimistic update, which moves it on at once. A task that starts meanwhile gets its `task-started` chime when the confirmation ends. Done from the rail or the transition bar needs no confirmation. The Undo toast stays.
- **Time and the reason line:** the hero says the time in words (`formatMinutes`, "1 h 20 min / left, until 15:00") over a bar that drains, and the browser tab title follows it (`tabTitle`: "28 min - Write intro", "Time is up - ...", "Free until 15:00"). The reason for a switch only shows for a switch while the page is open and fades after `REASON_MS` (60 s), so there is no "Scheduled for now" on every load.

### Schedule, alarms, wakeups, tones

Pure logic in `src/lib/schedule.ts` (tested), server in `src/lib/server/schedule.ts`; the same 15 s tick runs `fireDue()`. A repeating alarm moves on before anything else so a crash cannot ring twice; an entry more than 10 minutes late is retired without ringing. Alarms emit `alarm.fired` (logged, never wakes the agent) and push `alarm` on the stream. The client also keeps the next alarms in `setTimeout`s (`src/lib/alarms.ts`) and dedupes by `id@fireAt`. A ringing alarm shows a calm banner and repeats its tone up to 3 times, 30 s apart, until dismissed. Wakeups emit `wakeup.fired` with the agent's note; they obey autonomy, quiet hours, rate limit and budget (a silenced wakeup is gone, its outcome says why).

Agent tools (`assistant-tools.ts`): `schedule_wakeup` (at least 5 min ahead, max 10 pending, not in quiet hours unless asked in chat), `set_alarm` (unprompted only with autonomy `act`), `play_tone`, `cancel_schedule`. Max 30 alarms, at most 14 days ahead.

Tones (`src/lib/tones.ts`, no audio files): library `chime soft nudge rising urgent`, or a custom note sequence (wave, up to 12 notes, 100 to 2000 Hz, 5 s total). Custom tones are agent only (3 per day, enforced server side). `playTone` in `src/lib/index.ts` validates again and uses the user's volume as the ceiling.

**Display device:** with several open screens only the chosen device (`users.displayDevice`, per-browser id from localStorage) makes sound. If it is not connected to the stream, every device plays so an alarm is never silent. `/stream` announces the effective device with a `display` message.

### Audio and platform (`src/lib/index.ts`, `src/lib/audio.ts`, `src/lib/display.ts`)

Everything is synthesized with the Web Audio API on one shared `AudioContext` (`audio.ts`, created on load by the layout). Browsers keep it suspended until the first tap or key, so `initAudio` unlocks it on the first one and keeps `tasker.device.audioBlocked` in step with its state. `playSound` and `playTone` stay silent while it is not running (a sound scheduled on a suspended clock would play late, once it unlocks); `startRinging` may wait for the unlock so an alarm that is still ringing sounds at the first tap. The silence line (`silenceLine` in `silence.ts`, `SilenceLine.svelte`: "Sound off" or "Tap anywhere to turn sound on", nothing on a device that is not the display device) sits at the bottom of the rail on wide screens and in the hero on phones. `playSound('task-started')` when the current task switches while the page is open, `playSound('wrap-up')` when a task enters its last minutes, `playSound('done')` when Done is tapped, `playSound('reminder')` every 5 minutes while a task is current and unmuted, `playTone(tone)` for alarms and agent tones. Fullscreen and Screen Wake Lock (`keepAwake`). PWA: `static/manifest.webmanifest`, icons, and `src/service-worker/` which caches only built assets and static files (pages and task data always come from the server). The service worker has its own tsconfig and is excluded from the root one.

### Daylight theme (`src/lib/sun.ts`, `location.ts`, `places.ts`, `core/geocode.ts`, `server/location.ts`, `theme.ts`, `LocationPicker.svelte`)

"By daylight" has no user-set hours: dark outside sunrise to sunset at the user's location. `sunTimes(lat, lon, date, timezone)` (NOAA equation, polar day and night fall back to 07:00 to 19:00) and `daylight()` in `location.ts` pick the place: the saved location, else the main city of the timezone (`places.ts`), else the fixed hours. Settings says which ("Light from 07:12 to 18:40, based on Leipzig."). `theme.ts` recomputes today's window every minute and saves it to `localStorage` key `daylight` so `app.html` paints the right theme before the app loads.

- **Account:** the server finds the place from the client IP (`X-Forwarded-For`) with ipwho.is when the IP changes (`refreshIpLocation` in `server/location.ts`, called from `hooks.server.ts`, only the first visit without any place waits, at most 1.5 s). Only the rounded position and city name are stored, never the IP. A place chosen by hand (`device`, `city`) is never replaced; "Detect automatically" sends all four location settings as `null` and the server looks again.
- **Guest:** no IP lookup (this server never sees a guest's request for it). Device location or city search only, otherwise the timezone's city.
- **City search:** Open-Meteo geocoding through `tasker.backend.settings.searchPlaces` (server route for an account, the browser directly for a guest, allowed in the CSP). The device position needs no network.
- The four location settings are saved together (`parseSettingsPatch` rejects partial sets and the `ip` source) and are not part of the export file. Both services are named on the Privacy page, an architecture test keeps that in step.

### Other pure modules

`now.ts` (hero states, wrap-up window, heads-up line, tab title, `heroFocus`), `plan.ts` (snap and drag math, 15 min grid, `extendTask`, `nextFreeSlot`, `moveLater`), `quickadd.ts` (parses the quick add line), `format.ts` (clock, durations, time left in words), `silence.ts` (why nothing will be heard), `activity.ts` (one line summaries of agent changes), `types.ts` (`Task`, `Priority`, `TaskStatus`).

## Deployment

`bun run deploy` (`scripts/deploy.ts`) deploys the committed HEAD of the current branch to the server (`tasker.ileies.de`, ssh alias `home`, clone at `/var/www/adhd-tasker`): preflight, `git reset`, install, build on the server (because `DATABASE_URL` is baked in from the server's `.env`), database backup, pm2 restart, verify. Preflight runs `bun run verify` in full and refuses to deploy when it fails. A change to `schema.ts` since the server's commit stops the deploy before the server is touched, unless `--db-push` applies it or `--schema-applied` says it was applied by hand. Flags: `--push`, `--dry-run`, `--skip-check` (skips `verify`), `--force` (deploy HEAD despite uncommitted changes), `--db-push`, `--schema-applied`, `--host <alias>`. `pm2.config.cjs` is the local pm2 spec (port 3002).

## Known Gaps

- The refresh token is stored encrypted (`google_tokens`). Only Calendar uses it. Tasks and Keep are still offered in `GOOGLE_SERVICES` but nothing uses them: remove them before submitting the Google verification. Google Clock has no API
- Calendar write is not tried against real Google yet. Assistant and agent edits are not written to Google, Google-side edits to an event the app made do not flow back, existing tasks are not copied when "Add my own tasks" is turned on, and stopping the sync also ends that setting
- A guest's agent and alarms run only in a leading, open tab (no Web Push). Reminders and the overrun tap only reach an open Now screen. `reminders`, `enableFocusMode`, `enableOverdueNotifications` are unused
- Alarms and wakeups reach only open screens (no Web Push for a closed app). Alarms cannot be tied to a task, the agent computes the time
- Agent-made tasks are not marked in the Plan view (the activity page lists them). Every open device shows the agent card, only sound follows the display device
- The event `day.started` (morning briefing) is not built yet

## Roadmap (`TODO.md`, scope and progress to 1.0 in `docs/roadmap-1.0.md`)

**Done: the local first plan** (login optional, guest mode on the device, first run, the account move, Google Calendar read and write, Privacy and Terms), finished and deleted (git history, `docs/local-first-plan.md` at `a419224`). The UX plan is finished and deleted too (git history, `docs/ux-plan.md` at `24192b1`), what is left of it is in `TODO.md`. The daylight theme (its last item) is built, its design is deleted too (`docs/daylight-theme.md` at `56be755`). `docs/checks-and-tests-plan.md` and `docs/feature-ideas.md` are next: re-read them against the new code once and pick the next plan. Open items are in `TODO.md`.

**Planned, do not implement without discussion:** end-of-day summary, recurring tasks, capture inbox. **Parked on purpose:** adaptive behavior model, Crisis Mode, anti-context-switch scheduler, full analytics dashboard.

## What to Avoid

- Features that add cognitive load without a clear ADHD-experience justification
- Splitting state into multiple stores
- Task data in `localStorage` or anywhere in the browser except `src/lib/local/` (IndexedDB, the guest's data by design). The architecture test enforces it
- A component that calls `fetch`, or a Backend method that only one backend implements
- Animation, emoji, decoration or flashing that competes with the current task
- Stat tiles, marketing copy or footers on the main views. The one exception is the plain line "3 done today" under the rail clock (done count only, never "of 7", hidden at 0)
- Model calls that bypass `buildRequest`, or agent logic that skips the guardrails
- Touching the DB schema without applying it afterwards
