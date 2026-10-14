# ADHD Tasker - Claude Instructions

## What This App Is

A planner for people with ADHD that is always open and always shows what to do *right now*. It is an external anchor: it holds the plan so the user's working memory does not have to. It runs fullscreen on an always-on second screen (desktop first, responsive down to phone, installable as a PWA).

Judge every design and implementation decision against this: does it reduce cognitive load, minimize decisions, and keep the user anchored to the present task? When in doubt, do less and do it better.

## ADHD Design Principles (first-class constraints)

- **One thing at a time.** The current task dominates the screen, everything else recedes.
- **Minimal friction.** Login once, then the current task is visible without any tap.
- **Forgiving.** Destructive or accidental actions are undoable (Undo toast, not confirm dialogs).
- **External anchoring.** The app re-attracts attention with audio and color shifts instead of expecting the user to look.
- **Immediate feedback.** Completing a task gets audio and visual confirmation.
- **Calm.** No emoji, no decoration, no flashing, no animation that competes with the current task.

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
bun run check        # svelte-kit sync + svelte-check
bun test             # unit tests (bun test, files named *.test.ts next to the code)
bun run lint         # prettier --check + eslint
bun run format       # prettier --write
bun run db:push      # apply schema to SQLite
bun run db:studio    # Drizzle Studio
bun run deploy       # see Deployment
```

Run `bun run check` and `bun test` before committing.

## Conventions

- **Imports:** use the `#lib/...` alias (declared in `package.json` `imports`, e.g. `#lib/time.js`, `#lib/server/db/index.js`), not relative paths up to `src/`. Server-only code lives in `src/lib/server/`.
- **Logic goes in pure modules.** Anything with rules (ranking, events, guardrails, tools validation, schedule math, tones, quick add parsing, time helpers) is a pure function in `src/lib/*.ts` with a test next to it. Components and routes only render or wire.
- **Single state object.** All client state is one `tasker` object in `src/lib/app.svelte.ts`. Do not split it into multiple stores.
- **Time:** times are minutes since midnight (0 to 1440), durations in minutes. A task belongs to `task.date` (`YYYY-MM-DD` in the user's timezone, helpers in `src/lib/time.ts`). Tasks never cross midnight, split them. Convert carefully around JS `Date`.
- **Schema changes** must be applied afterwards: `bun run db:push`, or a one-off script in `scripts/` (like `scripts/add-schedule.ts`) when drizzle-kit cannot run. Production uses `bun run deploy --db-push`.
- **No em dashes** in code, comments, docs or replies.

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Now: current task hero in an urgency color, rail with the next tasks, missed strip, agent card strip. Top bar auto-hides, fullscreen and wake lock |
| `/edit` | Plan: day switcher, 24 hour timeline (drag to move, handle to resize, 15 min snap), quick add line, phone list |
| `/edit` (API) | Task CRUD: GET one day (`?date=`), POST, PUT, DELETE |
| `/alarms` | User alarms with tone preview, "use this device for sound", the assistant's wakeups |
| `/activity` | What the assistant changed (reason, Undo), events it saw and their outcome, today's token use |
| `/settings` | Theme, timezone, OpenAI key (`saveOpenaiKey`/`removeOpenaiKey`), assistant autonomy (`saveAgent`), voice replies (`saveVoice`), reminders and overrun tap (`saveAnchoring`), Google services (`linkGoogle`/`unlinkGoogle`). `/settings/timezone` saves the timezone |
| `/privacy`, `/terms` | Privacy policy and terms of use, public, linked from the profile menu. Keep them in sync when data handling changes (new fields, retention, third parties, cookies) |
| `/callback` | Google OAuth callback (GET) and One Tap credential (POST) |
| `/assistant` (API) | `POST` one chat turn (tool loop against OpenAI with the user's own key). `POST /assistant/undo` reverts one logged change. `POST /assistant/transcribe` speech to text, `POST /assistant/speak` text to wav (see Voice) |
| `/agent` (API) | `GET` what the agent did on its own (open card, changes since `?since=<action id>`). `POST /agent/cards/[id]` dismisses or answers a card. `POST /agent/stuck` (`{ taskId, reason }`) logs `stuck.pressed` |
| `/stream` (API) | Server-Sent Events (`?device=<id>`) with hints `agent`, `schedule`, `alarm`, `tone`, `display`. Hints only: the client fetches the data itself, a missed push costs nothing |
| `/schedule` (API) | `GET` pending alarms and wakeups, `POST` a user alarm, `DELETE /schedule/[id]`, `POST /schedule/display` chooses the display device |

### Core principle: nothing stored for "current"

There is no stored active task. What is current is derived on every tick by the pure `rank(tasks, now)` in `src/lib/priority.ts`: highest priority among today's tasks whose window contains now, completed is the only status that matters. `switchReason()` explains each switch. Urgency colors come from `urgencyLevel()` in `src/lib/urgency.ts`. The client and the server scheduler run the same `rank()`, so what the screen shows and what the agent reacts to can never disagree.

### State

`tasker` in `src/lib/app.svelte.ts`: `tasks`, `isMuted`, `volume`, `themeMode`, `dayStart`, `dayEnd`, `timezone`, `toast` (message plus optional Undo), `assistant` (`open`, `busy`, `messages`), `agent` (`cards`, `cursor`), `schedule` (`alarms`, `wakeups`, `ringing`, `loaded`), `device` (`id`, `display`, `streaming`). Hydrated by the layout load, updated optimistically on mutations. Day data comes from `loadDay(date)`; the layout preloads from yesterday on. Toasts via `showToast` in `src/lib/index.ts`.

### Database (`src/lib/server/db/schema.ts`)

- `users`: keyed by Google email. Reminder flags (`enableReminders`, `reminderAdvanceTime`), hyperfocus (`hyperfocusAlarm`, `overrunMinutes`), `enableFocusMode` (unused), `darkMode`, `timezone`, encrypted `openaiKey`, `googleServices` (space separated, scopes in `src/lib/google.ts`), agent settings (`aiAutonomy` observe|suggest|act default suggest, `aiEvents`, `quietStart`/`quietEnd`, `dailyTokenBudget`), `lastCurrentTaskId` (what the scheduler last saw as current, 0 = free time, null = never tracked), `displayDevice`, `voiceReplies`
- `tasks`: `title`, `description`, `email`, `date`, `startTime`, `duration`, `priority` (1 to 5), `status`. Only `completed` is meaningful; `active` and `overdue` are no longer written or read and can be removed from the enum in a cleanup
- `agent_actions`: every plan change by the assistant with `before`/`after` JSON, `eventId`, `reason`, `undoneAt`. Undo restores `before`
- `events`: everything the agent can observe (`type`, `payload`, `origin` user|agent|system, unique `key` per user for detected events, `handledAt`, `outcome`). Pruned after 30 days
- `agent_cards`: `say` notes and `ask` questions (with `options`) shown on Now until resolved. A new card resolves older open ones
- `ai_usage`: tokens per model call (`use`: chat|reaction|replan, plus `tone` rows with 0 tokens counting custom tones per day)
- `schedule`: alarms and wakeups. `fireAt` epoch ms, `repeat` none|daily|weekdays with local `minutes` (follows daylight saving), `label`/`tone` (tone JSON stored so it replays identically), `note` (agent's note to itself), `createdBy`, `status`. Pruned 7 days after it ended
- `reminders`: prepared for Calendar sync, not wired up

### Auth (`src/hooks.server.ts`, `src/routes/callback/+server.ts`, `src/lib/server/session.ts`)

1. Login generates OAuth state and a PKCE verifier in httpOnly cookies and redirects to Google (`login()` in `src/lib/server/index.ts`). One Tap posts an ID token to `/callback`.
2. `/callback` validates state, exchanges the code and sets the cookie. A signed `session` cookie (HMAC with `GOOGLE_CLIENT_SECRET`, 7 days) is the primary credential; the Google `token` cookie is the fallback checked against the OIDC userinfo endpoint.
3. `hooks.server.ts` resolves the email on every request, creates the user on first login and fills `event.locals.user`. It also starts the agent scheduler once (skipped while building).
4. **Login is required.** There is no unauthenticated or localStorage fallback, by design.
5. Linking Google services reuses the flow with incremental scopes (`google_oauth_link` cookie) and only records the grant in `users.googleServices`. Tokens are not stored yet.

### Assistant (chat)

`AssistantDrawer.svelte`, opened from the top bar, state in `tasker.assistant`. Server side in `src/lib/server/assistant.ts`: system prompt with today and tomorrow, tools `list_tasks`, `add_task`, `update_task`, `delete_task` (validated by pure `src/lib/assistant-tools.ts`, always scoped to the logged-in email), max 6 tool rounds, 20 requests per 5 minutes per user. Every write is logged to `agent_actions`; the client refreshes touched days and shows an Undo toast plus per-change Undo buttons. The reply arrives in one piece, not streamed.

**OpenAI rules, always enforced** (`src/lib/openai.ts`, tested): every request is built by `buildRequest` with a `Use` (`chat`, `reaction`, `replan`). Responses API (`/v1/responses`), model `gpt-6-luna`, `store: false`, `service_tier: 'flex'`. Nothing is stored at OpenAI, so each round resends the whole conversation and previous output items with `reasoning.encrypted_content` included. Reasoning effort is fixed per use in `EFFORT_BY_USE` (chat medium, reaction low, replan high), never a user setting. Calls wait up to 120 s and retry once on 429. New model calls must go through `buildRequest`.

The user's OpenAI key is encrypted at rest (AES-256-GCM, key derived from `GOOGLE_CLIENT_SECRET`, `src/lib/server/crypto.ts`) and never reaches the client (the layout only passes `hasOpenaiKey`). Changing `GOOGLE_CLIENT_SECRET` invalidates saved keys. The app must work fully without AI.

### Voice

Push-to-talk only (no always-listening mic). The mic button in `AssistantDrawer.svelte` records while held (or Space on it), `POST /assistant/transcribe` (multipart `audio`) returns `{ text }` via `gpt-transcribe`, and the text is sent like a typed message. `POST /assistant/speak` (`{ text }`) returns a wav: the server opens one short Realtime WebSocket session to `gpt-realtime-2.1-mini` (audio only out, voice `marin`, instructed to read the text verbatim), collects the 24 kHz PCM chunks and wraps them in a WAV header (the old speech endpoint models are removed 2027-01-06). Pure rules (models, limits, `speakable()` trimming to 280 chars, recording type, ducking volume) in `src/lib/voice.ts` (tested), server calls in `src/lib/server/voice.ts` (user's key, 30 requests per 5 minutes), browser side in `src/lib/speech.ts`. These two endpoints are the only OpenAI calls that do not go through `buildRequest` (file transcription endpoint and Realtime, not the Responses API), nothing is stored. Spoken output is the `users.voiceReplies` setting (default off, `saveVoice` on `/settings`, `tasker.voice.replies`): chat replies are spoken on the device where they were asked, new agent cards only on the display device and never on the first fetch after a load. Every chime and tone calls `duckSpeech()`, so speech drops to a whisper while an anchor sound plays. Muting stops speech. Starting to talk or sending a message stops speech.

### Event-driven agent

Every plan edit calls `emit()` (`src/lib/server/events.ts`): the `/edit` routes, assistant tools and undo. Events are logged first and `emit` never throws. Types and detection are pure and shared in `src/lib/events.ts` (`detectEvents` uses `rank()` to find `task.switched`, `task.missed` after 5 min, `task.overrun` after `users.overrunMinutes`, default 15 = `OVERRUN_MINUTES`; `describeChange` turns a before/after pair into an event). The scheduler in `src/lib/server/agent.ts` ticks every 15 s and compares with `users.lastCurrentTaskId`.

- **Agent-caused events never wake the agent.** Its edits are emitted with `origin: agent` and only logged; a switch within 60 s of an agent edit counts as agent too. A reaction may use at most 4 tool calls and show at most one card.
- **Guardrails** are pure in `src/lib/guardrails.ts` (`decideReaction`, tested) and run before any model call: autonomy (`observe` logs only, `suggest` offers `say`/`ask` and cannot edit, `act` may also edit with a reason and Undo, enforced again server side), per-event toggles (default completed, missed, overrun), quiet hours (default 22:00 to 07:00), events within 5 s coalesced, at most 6 reactions per hour and 3 minutes apart, optional daily token budget (unprompted only, chat is exempt), no key means silence. Events older than 10 minutes are dropped. Every event gets an `outcome`, shown on `/activity`.
- **Client side:** one event stream (`src/lib/stream.ts`, started in the layout). It fetches `/agent` when the stream says so, on every (re)connect and when the page becomes visible, and polls every 30 s while the stream is down. Agent edits made on their own show an Undo toast. Answering a card continues in the chat.
- The stream is in process (`src/lib/server/stream.ts`), so the app must run as one server process.

### Anchoring: "I'm stuck", reminders, hyperfocus alarm

Pure rules in `src/lib/anchoring.ts` (tested). All three work without an OpenAI key.

- **"I'm stuck"** is a button next to Done in `NowHero.svelte`. The user picks what is in the way (`STUCK_REASONS`), a fixed hint with one small first step shows at once, and `POST /agent/stuck` logs `stuck.pressed` (origin user). The agent answers with one `say`/`ask` card when it can. The event is not a toggle: it ignores per-event toggles, quiet hours, the budget and the 3 minute gap (the user is here and asking), but `observe`, a missing key and the hourly limit still apply.
- **Reminders:** a toast and the soft `reminder` chime when the next task starts within `users.reminderAdvanceTime` minutes (`reminderDue`), if `enableReminders`.
- **Hyperfocus alarm:** a toast and the `nudge` tone when the latest unfinished task passed its end by `users.overrunMinutes` (`hyperfocusDue`), if `hyperfocusAlarm`. The same minutes drive the `task.overrun` event. A page loaded long after the moment stays quiet.
- Both run in `src/routes/+page.svelte`, sound only on the display device (`playsSound()`), once per moment (`momentKey`), muted when muted. Both settings are on `/settings` (`saveAnchoring`).

### Schedule, alarms, wakeups, tones

Pure logic in `src/lib/schedule.ts` (tested), server in `src/lib/server/schedule.ts`; the same 15 s tick runs `fireDue()`. A repeating alarm moves on before anything else so a crash cannot ring twice; an entry more than 10 minutes late is retired without ringing. Alarms emit `alarm.fired` (logged, never wakes the agent) and push `alarm` on the stream. The client also keeps the next alarms in `setTimeout`s (`src/lib/alarms.ts`) and dedupes by `id@fireAt`. A ringing alarm shows a calm banner and repeats its tone up to 3 times, 30 s apart, until dismissed. Wakeups emit `wakeup.fired` with the agent's note; they obey autonomy, quiet hours, rate limit and budget (a silenced wakeup is gone, its outcome says why).

Agent tools (`assistant-tools.ts`): `schedule_wakeup` (at least 5 min ahead, max 10 pending, not in quiet hours unless asked in chat), `set_alarm` (unprompted only with autonomy `act`), `play_tone`, `cancel_schedule`. Max 30 alarms, at most 14 days ahead.

Tones (`src/lib/tones.ts`, no audio files): library `chime soft nudge rising urgent`, or a custom note sequence (wave, up to 12 notes, 100 to 2000 Hz, 5 s total). Custom tones are agent only (3 per day, enforced server side). `playTone` in `src/lib/index.ts` validates again and uses the user's volume as the ceiling.

**Display device:** with several open screens only the chosen device (`users.displayDevice`, per-browser id from localStorage) makes sound. If it is not connected to the stream, every device plays so an alarm is never silent. `/stream` announces the effective device with a `display` message.

### Audio and platform (`src/lib/index.ts`, `src/lib/display.ts`)

Everything is synthesized with the Web Audio API. `playSound('task-started')` when the current task switches while the page is open, `playSound('reminder')` every 5 minutes while a task is current and unmuted, `playTone(tone)` for alarms and agent tones. Fullscreen and Screen Wake Lock (`keepAwake`). PWA: `static/manifest.webmanifest`, icons, and `src/service-worker/` which caches only built assets and static files (pages and task data always come from the server). The service worker has its own tsconfig and is excluded from the root one.

### Other pure modules

`plan.ts` (snap and drag math, 15 min grid), `quickadd.ts` (parses the quick add line), `format.ts`, `activity.ts` (one line summaries of agent changes), `types.ts` (`Task`, `Priority`, `TaskStatus`).

## Deployment

`bun run deploy` (`scripts/deploy.ts`) deploys the committed HEAD of the current branch to the server (`tasker.ileies.de`, ssh alias `home`, clone at `/var/www/adhd-tasker`): preflight, `git reset`, install, build on the server (because `DATABASE_URL` is baked in from the server's `.env`), database backup, pm2 restart, verify. Flags: `--push`, `--dry-run`, `--skip-check`, `--db-push` (needed after schema changes), `--host <alias>`. `pm2.config.cjs` is the local pm2 spec (port 3002).

## Known Gaps

- Linking Google services only records the grant, no access or refresh tokens are stored. Store them encrypted when the first feature (Calendar sync) needs them. Google Clock has no API
- Reminders and the overrun tap only reach an open Now screen (no Web Push). The `reminders` table (Calendar sync) and `enableFocusMode`, `enableOverdueNotifications` are unused
- Alarms and wakeups reach only open screens (no Web Push for a closed app). Alarms cannot be tied to a task, the agent computes the time
- Agent-made tasks are not marked in the Plan view (the activity page lists them). Every open device shows the agent card, only sound follows the display device
- The event `day.started` (morning briefing) is not built yet

## Roadmap (`TODO.md`, rationale in `docs/ui-rework-plan.md`)

The UI rework roadmap (phases 0 to 9) is complete and removed from `TODO.md`. What is left is under Planned.

**Planned, do not implement without discussion:** Google Calendar sync (two-way), end-of-day summary, recurring tasks, capture inbox. **Parked on purpose:** adaptive behavior model, Crisis Mode, anti-context-switch scheduler, full analytics dashboard.

## What to Avoid

- Features that add cognitive load without a clear ADHD-experience justification
- Splitting state into multiple stores
- Any unauthenticated or localStorage fallback for task data
- Animation, emoji, decoration or flashing that competes with the current task
- Stat tiles, marketing copy or footers on the main views
- Model calls that bypass `buildRequest`, or agent logic that skips the guardrails
- Touching the DB schema without applying it afterwards
