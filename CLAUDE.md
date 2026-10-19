# ADHD Tasker

A planner for people with ADHD that is always open and always shows what to do _right now_. It is an external anchor: it holds the plan so the user's working memory does not have to. Runs fullscreen on an always-on second screen (desktop first, responsive down to phone, installable PWA). Works without an account (guest: plan, settings and OpenAI key live in the browser). Signing in is optional and adds sync, server-side alarms and Google Calendar.

Judge every decision against this: does it reduce cognitive load, minimize decisions, keep the user anchored to the present task? When in doubt, do less and do it better.

## Design principles (hard constraints)

- **One thing at a time.** The current task dominates, everything else recedes.
- **Forgiving.** Destructive or accidental actions get an Undo toast, not a confirm dialog. Exception: anything that erases all data asks in a dialog first and keeps the Undo too.
- **Calm.** No emoji, no decoration, no flashing, no animation that competes with the current task. Color changes crossfade slowly.
- **Color is never the only cue.** Priority and urgency also get a label or bar segments.
- **External anchoring.** Re-attract attention with audio and color shifts, not by expecting the user to look.
- **Immediate feedback.** Completing a task gets audio and visual confirmation.
- No stat tiles, marketing copy or footers on the main views.

## Stack

SvelteKit + Svelte 5 (runes only, no stores) + Tailwind 4 + shadcn-svelte (`bun x shadcn-svelte@latest add <name>`), SQLite + Drizzle (`local.db`), Google OAuth with PKCE (Arctic) plus One Tap, `adapter-node`, Bun everywhere. Env vars are declared in `src/env.ts` (static, baked in at build time), see `.env.example`.

## Commands

```bash
bun run dev
bun run check            # svelte-kit sync, svelte-check, tsc for service worker and scripts
bun run test             # short output; -v for full. Prefer over plain `bun test`
bun run verify --quick   # format, tests, timezones, types (~20 s). Run once per batch before committing
bun run verify           # the full gate, also lint and build. Deploy runs it
bun run db:push          # apply schema to SQLite
bun run deploy           # see Deployment
```

Tests need 90 % line and function coverage over the whole report (`scripts/coverage.ts`).

## Conventions

- Imports use the `#lib/...` alias (e.g. `#lib/time.js`), never relative paths up to `src/`. Server-only code lives in `src/lib/server/`.
- **Logic goes in pure modules** (`src/lib/*.ts`, each with a test next to it). Components and routes only render or wire.
- **One state object:** `tasker` in `src/lib/app.svelte.ts`. Do not split it.
- **Components never call `fetch`.** They use `tasker.backend` (the `Backend` interface in `src/lib/backend.ts`). A new `Backend` method must be added to `remote-backend.ts`, `local/backend.ts` and `BACKEND_METHODS` in `local/deferred.ts`. Rules shared by server and device live in `src/lib/core/` and run against a `Repo`.
- **Time:** times are minutes since midnight, durations in minutes, a task belongs to `task.date` (`YYYY-MM-DD` in the user's timezone, helpers in `src/lib/time.ts`). Tasks never cross midnight, split them.
- **Schema changes** must be applied afterwards: `bun run db:push`. Production: `bun run deploy --db-push`.
- Task data never goes in `localStorage`. Only `src/lib/local/**` (IndexedDB) holds a guest's data.
- No em dashes anywhere (an architecture test checks it).
- Keep `/privacy` and `/terms` in sync when data handling changes (new fields, retention, third parties, cookies).

## Tests

- `name.test.ts` next to the code, route tests next to the route without the `+` prefix, helpers in `src/test/` (`#test/...`). Keep the `/// <reference types="bun" />` header in tests under `src/`.
- `describe` names the unit, `test` states the behavior as a sentence. One behavior per test.
- No network (use `fakeFetch`, the preload fails any real request) and no wall clock or machine timezone (`setSystemTime` or an explicit `now`; the gate runs three timezones).
- Database tests start with `beforeEach(resetDb)` and use `makeUser`/`makeTask`.
- Prompts: assert the facts that matter, never the full text.
- A bug fix starts with a failing test in its own commit, before the fix.
- `src/test/architecture.test.ts` enforces repo rules (every module has a test or is listed as untested with a reason, OpenAI call sites, module-level `$state`, browser storage). Remove a module from its untested list once it has a test.

## How it works (the parts you cannot infer from one file)

- **Nothing is stored for "current".** What is current is derived on every tick. Tasks at a time are ranked by `rank()` (`priority.ts`). Between them, `flow()` (`flow.ts`, plan in `docs/flow-plan.md`) replays today's `flow_log` answers and finished items into sessions on the to-do that `pick()` chooses. The client and the server scheduler run the same functions (`watch` in `core/agent.ts`), so the screen and the agent cannot disagree. Do not add a stored "active task".
- **The placed day.** `placeDay()` (`placeday.ts`) computes the day as lived (tasks with `shift` move aside for appointments and travel). Plan, Now and the tick all use it; saving goes through `stored(placed)` so the time the user gave stays.
- **Task kinds.** `block` is the user's own time. `appointment` and `travel` end on their own (no time up, no missed). `core/appointments.ts` keeps an appointment, its travel and its prep to-dos together on every path.
- **Routines** are tasks that repeat, made 14 days ahead on every tick by `core/routines.ts`. A task follows its routine until the user changes or finishes it.
- **Two modes.** Guest: plan in IndexedDB, `localBackend` runs the `core/` rules, a client tick (`agent-loop.ts`) does what the server loop does, only in the leading tab. Account: `remoteBackend`, and every server API answers 401 to a guest. On first sign in the device's plan moves into the account (`moveIntoAccount`, with a 30 day snapshot).
- **Agent.** `emit()` logs every plan edit as an event. Reactions pass the pure guardrails in `guardrails.ts` (`decideReaction`) before any model call: autonomy level, per-event toggles, quiet hours, rate and token limits. Agent-caused events never wake the agent. Every agent change is logged to `agent_actions` with before/after for Undo. The app must work fully without AI.
- **Sound** is synthesized with Web Audio (`audio.ts`, `tones.ts`), no files. With several open screens only the display device makes sound. The event stream is in process, so the app must run as one server process.
- **Google Calendar** uses the `calendar.events` scope only. Import 14 days ahead, sync every 5 minutes by `etag`, Google wins on conflict. Assistant and agent edits are not written to Google. Verification notes in `docs/google-verification.md`.

## OpenAI rules

- Every Responses API call goes through `buildRequest` in `src/lib/openai.ts` with a `Use` (`chat`, `reaction`, `prep`, `replan`): model `gpt-6-luna`, `store: false`, `service_tier: 'flex'`, reasoning effort fixed per use, whole conversation resent each round. Never bypass it.
- Exceptions that are not Responses API calls: transcription and the Realtime speech session (`src/lib/server/voice.ts`) and the guest's direct browser call (`openai-direct`). Nothing is stored at OpenAI.
- The user's key is encrypted at rest (AES-256-GCM, derived from `GOOGLE_CLIENT_SECRET`, so changing that secret invalidates saved keys) and never reaches the client.
- The assistant never decides what is current, never sets a to-do's progress, and never deletes, shortens or moves meds, meals, sleep or water without asking.

## Deployment

`bun run deploy` deploys the committed HEAD to `tasker.ileies.de` (ssh alias `ros`, clone at `/var/www/adhd-tasker`, systemd `adhd-tasker.service`, port 3002): preflight (`verify` in full), build on the server (`DATABASE_URL` is baked in from its `.env`), database backup, restart, health checks. A change to `schema.ts` stops the deploy unless `--db-push` or `--schema-applied` is given. Other flags: `--push`, `--dry-run`, `--skip-check`, `--force`, `--host <alias>`. The unit itself is defined in `/etc/nixos/hosts/pronix/default.nix`, deploy does not rewrite it.

## Working rules

- Do what was asked, no more. A plan line is a checklist, not permission to rebuild a module.
- Park, do not fix: a problem found on the way becomes one line in `TODO.md` and one line in the report. Fix it at once only for data loss, a security hole, or when it blocks the task.
- Visual checks only on request, at most 6 screenshots.
- Read cheaply: grep, or Read with `offset` and `limit`. Do not read large files whole.
- If the work is clearly larger than the request sounded, say so before doing it.

## Not built on purpose

Do not implement without discussion: end-of-day summary, capture inbox. Parked: adaptive behavior model, Crisis Mode, anti-context-switch scheduler, full analytics dashboard. Open work and known gaps are in `TODO.md` and `docs/roadmap-1.0.md`.
