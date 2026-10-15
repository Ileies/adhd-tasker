# Checks and Tests Plan

Status: proposed, 2026-10-14. Measured on `ffec608` with Bun 1.4.2, SvelteKit 3.0.1, Svelte 5.57, drizzle-kit 0.31.10, TypeScript 6.0.3. Every technical claim below that the plan depends on was run on this machine, not assumed (see section 11).

**Waits for the local first plan (deleted, git history `a419224`).** The green baseline, static checks, `bun run verify`, the test infrastructure, the pure module tests and the fixes for D1 to D8 were built by the soon plan (former phases 0 to 3, 4.1, 4.6, the `/edit` part of 5.3 and 6.5), which was finished and deleted on 2026-10-14 (git history, `docs/soon-plan.md` at `3802a8e`). So were the target gate (section 4) and the test writing rules (section 7, now in `CLAUDE.md`). The local first plan moved the assistant, agent, schedule and voice rules into `src/lib/core/` behind a `Repo`, a `Model` and a context (with a repo contract suite and `db-repo.ts`), and put the client behind a `Backend`. Phases 4 and 6 below name the old module paths: re-read them against `core/` and `backend.ts` before starting, the seams and fakes are probably simpler now. Section and phase numbers are kept so references stay valid.

## 1. What the checks are for

Tests protect promises. These are the promises the app makes, and what has to guard each one:

| Promise                                                   | What can break it                                                            | Guarded by                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The screen always shows the right task                    | `rank()`, time and timezone math, hydration, invalid tasks in the DB         | Pure tests, property tests, `/edit` validation tests, e2e                    |
| The screen never lies about the plan                      | Optimistic client updates that the server rejected                           | Client wiring tests, e2e reload check                                        |
| An alarm is never silent and never rings twice            | `fireDue()`, display device fallback, client dedupe                          | Server integration, client wiring                                            |
| The agent never acts outside its guardrails               | `react()` calling the model or editing despite autonomy, quiet hours, limits | Agent integration tests with a fake OpenAI that fails on any unexpected call |
| Your data is only yours                                   | One query without the email scope                                            | Ownership matrix over every route that takes an id                           |
| Every change is undoable                                  | `undoAction()`, client Undo paths                                            | Integration and client tests                                                 |
| The app works fully without AI                            | Code paths that assume a key                                                 | Integration tests with no key                                                |
| Deleting an account deletes the data                      | Foreign keys not enforced                                                    | Integration test with the production DB settings                             |
| A deploy never replaces a working build with a broken one | Missing gates, unapplied schema                                              | `bun run verify` in deploy and CI, fatal schema check                        |

Principles:

1. **One command is the definition of green:** `bun run verify`. Deploy, CI and Claude run exactly the same thing.
2. **Fast:** unit plus integration suite under 3 s, the full gate around 60 s, the quick gate around 20 s.
3. **Deterministic:** no network, no wall clock, no machine timezone, no order dependence. Each test file runs isolated (`--isolate`) and in random order (`--randomize`), and the suite runs in three timezones.
4. **Cheapest level that can see the bug:** pure test, then integration (real Drizzle on in-memory SQLite, fake `fetch`), then e2e only for what nothing else can see.
5. **Test contracts, not internals:** assert HTTP status and body, DB rows, outbound requests and `tasker` state.
6. **Rules are enforced by machines:** every project rule in `CLAUDE.md` that can be checked mechanically gets a check.

## 2. Starting point

Now (2026-10-14): `bun run verify` is green and gates deploy, the test infrastructure exists, every pure module is tested (572 tests, about 2.9 s in three time zones, 99 % of lines), and D1 to D8 are fixed.

Still untested, as the allowlist in `src/test/architecture.test.ts` says:

- Server and core: `core/agent.ts`, `core/assistant.ts`, `core/schedule.ts`, `core/usage.ts`, `core/voice.ts` and their server wrappers `server/agent.ts`, `server/assistant.ts`, `server/schedule.ts`, `server/voice.ts`
- Route modules other than `/edit`
- Client wiring: `alarms.ts`, `agent.ts`, `assistant.ts`, `stream.ts`, `theme.ts`. `speech.ts`, `display.ts`, `audio.ts` and `index.ts` stay permanent entries (browser API wiring, their rules live in tested pure modules such as `silence.ts` and `tones.ts`)

Re-measure before starting: the local first plan rewrote the layer under the server logic, and the soon plan changed `index.ts` (one shared audio context) and the Now components.

## 3. Open gaps

| ID  | Gap                                                                                                                                       | Fixed in |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G8  | No CI                                                                                                                                     | Phase 8  |
| G10 | `.gitignore` ignores every dotfile (`.*`), so `.github/` and `.envrc` would silently stay untracked (`.git-blame-ignore-revs` is handled) | 7, 8     |

## 5. Phases

Each numbered item is one commit unless noted. Commits stay small and thematic, as `CLAUDE.md` asks.

### Phase 4: Server integration

Real modules, real Drizzle, in-memory SQLite, fake `fetch`. One test file next to each module.

**4.0 Prerequisites:**

- **Seams.** Export three internals of `src/lib/server/agent.ts` for tests: `watch(user)`, `tick()` and the hourly pruning as `prune(nowMs)`. No behavior change.
- **More fakes in `src/test/fakes.ts`:** `fakeOpenAI()` on top of `fakeFetch`: a queue of Responses API answers (`text('...')`, `toolCalls([...])`, `status(429)`, `networkError()`), the recorded request bodies, and `expectEveryRequestValid()` which checks each body against the fixed rules: model, `store: false`, `service_tier: 'flex'`, reasoning effort per use, encrypted reasoning included. `FakeWebSocket` for `speak()`.

**4.2 `server/events.test.ts`:**

- `emit` logs and returns the id; the same `key` twice returns `null` the second time and does not wake the agent.
- Origin `agent`, `user.message` and `alarm.fired` are stored as handled with their outcome and never call the reactor; everything else calls it exactly once.
- `emit` never throws: with `db.insert` made to throw, it returns `null`.
- `emitChange` emits nothing for an invisible edit and merges `extra`.
- `tokensSince`, `countUses` and `reactionTimes` are scoped by email, use and time.

**4.3 `server/schedule.test.ts`:**

- `runScheduleTool`: invalid JSON; a wakeup in quiet hours is refused unless `fromChat`; at most 10 pending wakeups and 30 alarms; 3 custom tones per day, counted through `ai_usage`, available again the next day; `play_tone` reports `played: false` when no screen is connected; `cancel_schedule` with another user's id gives "no such pending entry"; unknown tool.
- `fireDue(nowMs)`: a one-off alarm becomes `done`, emits `alarm.fired` with its key and publishes `alarm` and `schedule`; a daily alarm moves to the same local time the next day, also across a daylight saving change, and stays pending; an entry more than 10 minutes late is retired without ringing; a wakeup emits `wakeup.fired` with its note; a second call at the same moment rings nothing.
- **Never rings twice:** make `publish` throw during the first `fireDue`, call it again, assert the alarm was not rung again because it had already moved on.
- `pruneSchedule` removes only finished and cancelled entries older than the cutoff.

**4.4 `server/assistant.test.ts`:**

- `parseMessages`: not an array, wrong roles, empty content, only the last 20, content capped at 2000.
- `runTool` add, update, delete: the row changes; `agent_actions` holds before, after, reason and event id; the event is logged with origin `agent` and handled (it never wakes the agent); the change is reported with summary and dates; `overlaps_with` lists only unfinished tasks of the same day.
- Update and delete of another user's task id answer "no such task" and leave that row untouched. `list_tasks` sees only the caller's tasks. Schedule tools through `runTool` run as `fromChat`.
- `undoAction`: add is reverted by deleting, update by restoring (a moved task reports both dates), delete by re-inserting with the same id; a second undo is 409; another user's action is 404; the undo is emitted with origin `user` and `undoOfAgentChange`. Pin, then decide: undoing an update whose task was deleted meanwhile currently marks it undone and restores nothing.
- `runAssistant` with `fakeOpenAI`: the last message must be the user's (400); no key, or a key encrypted with another secret, gives 400 "Add your OpenAI key"; a tool round followed by a reply returns the reply and the changes, and the second request carries the `function_call_output` and the previous output items; the loop stops after 6 rounds with the fallback reply; usage is recorded even when OpenAI fails; the 21st request in 5 minutes is 429 and is allowed again after the window. Every request passes `expectEveryRequestValid()`.
- `complete`: 401 becomes a 400 with the Settings hint; 429 then 200 retries once after 3 s (fake timers); 429 twice is 429; network error and other failures are 502.

**4.5 `server/agent.test.ts`,** the most important file of the plan:

- Nothing pending: returns without a model call. Events older than 10 minutes: "dropped, too old to react to". Unknown user: "dropped, no such user".
- **Every guardrail end to end, each with a fake OpenAI that fails on any call:** `observe`, no key, event type switched off, quiet hours (system time 23:00 in the user's zone), daily budget used up, 6 reactions in the last hour, a reaction 2 minutes ago. Each outcome reads `silent: <reason>` and `fetch` was never called. This proves no path reaches the model past the guardrails.
- `stuck.pressed` in quiet hours with the budget used up still calls the model; with `observe` it stays silent.
- `suggest`: the offered tools contain no edit tool and no `set_alarm` (asserted on the request body); a forged `update_task` call is refused and the task is unchanged.
- `act`: an edit with a reason changes the task, logs the action with event id and reason, and leaves no unhandled event behind (the agent's own event never wakes it).
- At most 4 tool calls: a round with 6 calls executes 4 and answers the rest with an error. At most one card: say then ask, the second is refused. A new card resolves older open cards.
- A failing model call: outcome "failed, the model could not be reached", usage still recorded, no event left in `reacting`.
- **Claimed before the call:** while the first `react()` waits on a deferred model answer, a second `react()` finds nothing to do, so the model is called once.
- `react()` publishes `agent` when it is done.
- `watch()`: the first tick ever stores the current task and reports nothing; a switch is logged with origin `system`; a switch within 60 s of an agent edit is logged with origin `agent` and wakes nothing; a missed task is logged once across many ticks; a user without a timezone is skipped; free time is stored as 0.
- `prune(nowMs)`: handled events and usage older than 30 days go, unhandled events stay, resolved cards go after 7 days.

**4.7 `server/voice.test.ts`:** `transcribe` rejects empty (400), too large (413) and non-audio (415) recordings before any network call, needs a key, sends the model and a file name with the right extension, trims the text, maps 401, 429 and 500, rate limits at 30 per 5 minutes. `speak` with `FakeWebSocket`: sends the events on open with the key in the headers, collects audio and returns a WAV on `done`, and answers 502 for an error event, a close before `done`, no audio, and the 30 s timeout.

### Phase 5: Route contracts

Route tests live next to their route (`src/routes/edit/edit.test.ts` exists from the soon plan; SvelteKit ignores files without the `+` prefix). The two matrices live in `src/routes/auth.test.ts` and `src/routes/ownership.test.ts`.

**5.1 Login matrix (the guest column).** A guest is a request without a user: every API answers 401 to it and the guest never calls it (the local backend answers instead), so the matrix below is also the guest matrix. `/activity` and `/alarms` no longer redirect, they load for a guest from the device. **5.1 continued.** Every exported handler, action and load in every route module, called without a user, gives 401 (handlers), `fail(401)` (actions) or the redirect (`/activity`). Exempt by design: `/callback`. The layout load without a user returns no user and no tasks.

**5.2 Ownership matrix.** Users A and B; A owns a task, an agent action, a card and a schedule entry. B calls `PUT` and `DELETE /edit`, `GET /edit?date=`, `POST /assistant/undo`, `POST /agent/cards/[id]`, `DELETE /schedule/[id]` and `POST /agent/stuck` with A's ids: each answers 404 or returns nothing of A's, and all of A's rows are unchanged afterwards.

**5.3 Route coverage rule.** Add a seventh rule to `src/test/architecture.test.ts`: the set of route modules found by globbing `src/routes/**/+{server,page.server,layout.server}.ts` equals the set listed in the two matrices, so a new route cannot skip the login and ownership checks.

**5.4 Per route:**

- `/schedule`: `POST` rejects custom tones (agent only), caps at 30, answers 201 with the id; `GET` shape; `DELETE /schedule/[id]` 204, 404 and 400.
- `/schedule/display`: `null` is allowed, more than 64 characters is not, the display is announced.
- `/agent`: without `since` only the cursor; with it only reaction changes (event id set) that are not undone, in order; only the newest open card.
- `/agent/cards/[id]`: 404 for a resolved card. `/agent/stuck`: unknown reason 400, emits `stuck.pressed` with origin `user`.
- `/assistant`: an `AssistantError` keeps its status, anything else is a 500 with a generic message that leaks nothing. `/assistant/undo`: id validation. `/assistant/speak`: empty text 400, otherwise `audio/wav` with `no-store`. `/assistant/transcribe`: no file 400.
- `/settings`: `saveOpenaiKey` checks the key against a fake `/v1/models` and stores it encrypted (the stored value is not the key and decrypts with the secret and purpose); the layout data never contains the key anywhere, only `hasOpenaiKey`; invalid `saveAgent` and `saveAnchoring` forms give 400 and change nothing; `linkGoogle` without services is 400 and with services redirects to Google with the scopes and `include_granted_scopes`, setting the state cookies; `removeOpenaiKey`, `saveVoice`, `unlinkGoogle`. `/settings/timezone` rejects an invalid zone. Write these after UX phase 8 (auto-save and presets change the actions) or adjust them then.
- `/stream`: event stream headers, the first chunks are `retry: 3000` and `hello`, and an abort unsubscribes (`publish` count goes from 1 to 0).
- `/callback`: state mismatch and missing verifier redirect to the error page; declined linking returns to Settings; One Tap with a CSRF mismatch is refused; a verified ID token (fake `tokeninfo`, matching `aud`, verified email) sets the `session` cookie `httpOnly`, `sameSite: lax`, `secure`; a wrong `aud` fails; the code exchange runs against a fake Google token endpoint.
- `/` actions: `logout` revokes the token and deletes both cookies. `/activity` load: shape and limits.

### Phase 6: Client wiring

Compiled runes and fake `fetch`, timers and `EventSource`. Add `FakeEventSource` to `src/test/fakes.ts`.

1. `alarms.ts`: rings once per `id@fireAt` whichever path comes first; replays up to 3 times, 30 s apart, until dismissed; dismissing stops the replays; `playsSound` for no display, this device and another device; arming rings alarms from the last 60 s, schedules future ones, ignores older ones and anything beyond the `setTimeout` limit; a failed `loadSchedule` changes nothing; `deviceId` is stable and falls back when storage throws.
2. `agent.ts`: the first poll after a load stays silent, a later new card is spoken once and only on the display device with voice on; the cursor advances; touched days are refreshed once each; the Undo toast reverts newest first; answering a card resolves it and continues in the chat.
3. `assistant.ts`: ignored while busy or empty; error entries are not sent back; a server message becomes an error entry; a network failure shows "Could not reach the server."; `busy` is reset in every case; changes refresh the days and offer Undo; a 409 on undo shows "Already undone".
4. `stream.ts`: each message type reaches its handler; malformed data is ignored; the fallback poll runs only while disconnected and visible; the cleanup closes the source and removes the listener.

Each module leaves the pairing allowlist when its test lands.

### Phase 7: End to end smoke

Playwright, deliberately small: only what no other layer can see. Specs are named `e2e/*.e2e.ts` and `testMatch` is set to that, because `bun test` would pick up `*.spec.ts` files. Add `e2e` and `playwright.config.ts` to the root tsconfig `include`. Write the specs after the UX phases that change the screens they touch, or adjust them then.

**Setup.** `webServer` builds and starts the app with test values for the static env (`GOOGLE_CLIENT_SECRET=e2e-secret`, `DATABASE_URL=./e2e/e2e.db`, a dummy client id, port 4173). The global setup creates the schema, seeds a user with timezone `Europe/Berlin` and three tasks for the real current date in Berlin: missed (09:00 to 09:30), current (11:30 to 12:30) and next (13:00 to 13:30). The browser context uses `timezoneId: 'Europe/Berlin'`, a `session` cookie minted with `signSession` (soon plan 2.2), and `page.clock.install()` at 12:00 Berlin on that date. Seeding on the real date keeps the server's preload window (from yesterday in UTC) correct at any hour, and the fixed browser clock makes the hero deterministic. If the build did not pick up the test secret, the first spec fails at once, so the setup verifies itself. Note: the e2e build overwrites the local `build/`, which is only a local artifact.

**Specs:**

1. Now shows the current task without any tap: hero title, the next task in the rail, the missed strip.
2. Done gives feedback and is undoable: Done moves the hero on and shows the Undo toast; Undo brings the task back; after a reload the screen matches (catches the D4 class).
3. Quick add on Plan: "Call mom at 14:00 for 30m" lands at 14:00 and survives a reload.
4. Logged out: `/` shows the login and no task data; `/edit?date=` answers 401.
5. Hydration smoke: `/`, `/edit`, `/alarms`, `/activity`, `/settings`, `/privacy` and `/terms` load with no console error and no failed request.
6. Accessibility: `@axe-core/playwright` on Now in light and dark reports no serious or critical violation, which guards the WCAG AA contrast goal of the urgency colors.

**NixOS.** Browsers downloaded by Playwright do not run on NixOS. Locally the browsers come from nixpkgs `playwright-driver.browsers` through a project `flake.nix` dev shell, loaded by `.envrc` with `use flake` (add `!.envrc` to `.gitignore`), which sets `PLAYWRIGHT_BROWSERS_PATH` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`. `@playwright/test` must be pinned to the exact version of nixpkgs' `playwright-driver`; bump both together. The e2e run is not part of `verify` (it needs browsers and takes 30 to 60 s): it runs in CI on every push and locally with `bun run test:e2e` (`"test:e2e": "playwright test"`).

### Phase 8: CI and dependencies

**8.1** Update dependencies within their ranges (`bun update`), run `bun run verify`, commit separately. The advisories measured on `ffec608` (23, 13 high) were all in tooling (brace-expansion, flatted, nanoid, postcss, source-map-js, and a Windows-only Vite issue), none in code that serves requests.

**8.2** `.github/workflows/ci.yml` (add `!.github` to `.gitignore`, G10). On push and pull request, with concurrency that cancels older runs of the same branch:

- `verify`: `oven-sh/setup-bun@v2` pinned to Bun 1.4.2, `bun install --frozen-lockfile`, a `.env` with dummy values for the static env, `bun run verify`.
- `e2e` (after `verify`): `bun x playwright install --with-deps chromium`, `bun run test:e2e`, upload the Playwright report when it fails.
- `audit`: `bun audit --audit-level=high` as a non-blocking step on pushes, and as its own weekly scheduled run, which fails visibly when a new high advisory appears.

## 6. Coverage policy

- `verify` runs with `--coverage` and the thresholds in `bunfig.toml` (0.90 for lines and functions, set in the soon plan). Raise them to the measured value rounded down to whole percent after Phase 6 (expected around 0.95). Never lower them without a reason in the commit message.
- Coverage only sees imported files; the pairing rule (soon plan 1.6) covers the rest.
- Coverage is a floor, not the goal. The goal is the promise table in section 1.

## 8. Decided against

| Option                              | Why not                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests for `.svelte` components | No supported Svelte 5 plus Bun component test setup without a custom compiler plugin and a DOM shim. By convention components only render and wire, the logic lives in tested modules, and the e2e smoke covers rendering. If a component grows logic, extract it |
| Mutation testing (Stryker)          | No Bun test runner integration. Property tests and the guardrail matrix give most of the same signal                                                                                                                                                              |
| Git pre-commit hook                 | Hooks are not versioned, and 20 s on every commit is friction. The instruction in `CLAUDE.md`, the deploy gate and CI cover it                                                                                                                                    |
| Snapshot tests of prompts           | Every wording change breaks them. The guarantees are asserted instead                                                                                                                                                                                             |
| Tests against the live OpenAI API   | Cost, flakiness, and they would spend the user's own key. The request contract is pinned by `buildRequest` tests and the fake                                                                                                                                     |
| A 100 % coverage target             | Pushes toward testing wiring instead of promises                                                                                                                                                                                                                  |
| Tests for `src/lib/components/ui`   | Generated by shadcn                                                                                                                                                                                                                                               |
| Rebuilding the database per test    | Deleting rows is enough and much faster                                                                                                                                                                                                                           |
| A committed schema snapshot         | Deploy already diffs `schema.ts` against the server's commit; making that fatal (soon plan 1.9) guards the actual risk                                                                                                                                            |

## 9. Docs and config to update

- `CLAUDE.md`: the `test:e2e` command and the e2e location (`e2e/*.e2e.ts`) in the Tests section.
- `README.md`: the e2e command and the Nix dev shell.

## 10. Order and definition of done

| Phase                 | Commits        | Effort   | Exit criterion                                     |
| --------------------- | -------------- | -------- | -------------------------------------------------- |
| 4 Server integration  | one per module | 1.5 days | Every guardrail proven silent without a model call |
| 5 Route contracts     | 4 to 6         | 1 day    | Login and ownership matrices cover every route     |
| 6 Client wiring       | one per module | 4 h      | Coverage threshold raised to the measured floor    |
| 7 E2E smoke           | 3              | 4 h      | Six specs green locally (Nix shell) and in CI      |
| 8 CI and dependencies | 2              | 2 h      | CI green on `master`, audit job scheduled          |

4 and 5 carry the most value and do not depend on the UX work. 6 and 7 touch client code the UX plan changes, so they come after the UX phases they overlap with. 8 comes last.

**Done when:**

1. `bun run verify` is green in CI.
2. Every guardrail has a test proving the model is never called when it should be silent.
3. Every route is in the login matrix, and every route that takes an id is in the ownership matrix.

## 11. Evidence

What was run on 2026-10-14 to ground this plan and the parts that moved to the soon plan (throwaway files in the session scratchpad, nothing in the repo changed):

- All existing checks with timings, the suite under five timezones and with `--isolate --randomize`, and Bun honoring `TZ` (`getTimezoneOffset` changes as expected).
- A Bun preload plugin with virtual `$app/env*` modules let `bun test` import `server/db`, `server/events`, `server/session`, `routes/edit/+server.ts` and `hooks.server.ts`. `drizzle-kit/api` built the full schema in memory (9 statements, about 0.3 s). `emit` deduped by key, and `readSession(createSession(...))` round-tripped.
- Calling `POST /edit` directly stored a midnight-crossing, priority 9 task (D1), a missing title gave the raw constraint error (D2), and `PUT` with an unknown id answered `200 true` (D3).
- Compiling `app.svelte.ts` with `compileModule` in an `onLoad` hook made `tasker` and `alarms.ts` testable (ring dedupe and `playsSound` asserted). The plugin also works under `--isolate`.
- `coverageThreshold` in `bunfig.toml` fails the run with exit code 1. `jest.useFakeTimers()` and `advanceTimersByTime()` work. `PRAGMA foreign_keys` is 0 in `bun:sqlite` (D8). Module state is shared across test files without `--isolate`.
- `drizzle-kit export` accepted `schema.ts` with `#lib` imports. A type-aware ESLint probe found 17 floating and 10 misused promises in about 3 s more lint time. TypeScript rejects the agent's `outcome` without its initializer (TS2454).
