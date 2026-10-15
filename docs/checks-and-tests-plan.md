# Checks and Tests Plan

Status: proposed, 2026-10-14, re-read against the code after the local first plan on 2026-10-15. Measured on `ffec608` with Bun 1.4.2, SvelteKit 3.0.1, Svelte 5.57, drizzle-kit 0.31.10, TypeScript 6.0.3. Every technical claim below that the plan depends on was run on this machine, not assumed (see section 11).

**Re-read after the local first plan (deleted, git history `a419224`).** The green baseline, static checks, `bun run verify`, the test infrastructure, the pure module tests and the fixes for D1 to D8 were built by the soon plan (former phases 0 to 3, 4.1, 4.6, the `/edit` part of 5.3 and 6.5), which was finished and deleted on 2026-10-14 (git history, `docs/soon-plan.md` at `3802a8e`). So were the target gate (section 4) and the test writing rules (section 7, now in `CLAUDE.md`). The local first plan moved the assistant, agent, schedule and voice rules into `src/lib/core/` behind a `Repo`, a `Model` and a context, and put the client behind a `Backend`. It also brought its own tests: the repo contract suite (`src/test/repo-contract.ts`, run against `db-repo.ts` and `local/repo.ts`), every module of `src/lib/local/`, `remote-backend.ts`, the account move, Google Calendar (core, server and routes) and the route tests for `/account`, `/activity`, `/calendar`, `/callback`, `/export`, `/import`, `/login`, `/logout`, `/settings`. The architecture test now also guards the guest rules (IndexedDB only in the local repo, `fetch` only in backends, adapters and server code) and `deferred.test.ts` checks that `BACKEND_METHODS`, `remote-backend.ts` and `local/backend.ts` name the same methods. Phases 4 and 6 below are rewritten against `core/` and `backend.ts`. Section and phase numbers are kept so references stay valid.

**The both-backends rule.** One set of rules now serves an account and a guest, so a rule is tested once in `core/` against the contract suite's repo and a fake `Model`, not once per backend. What differs per backend (the `db-repo` mapping, the IndexedDB repo, the remote HTTP shape, `local/agent-loop.ts`) is covered by its own wrapper test. A new feature that touches `core/` gets one core test, and a `Backend` method gets a case in each backend test.

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
| Signing in never loses a guest's plan                     | `moveIntoAccount`, merge rules, the snapshot, the device copy removed early  | `merge.test.ts`, `account.test.ts` (exist), the guest e2e spec               |
| Calendar never overwrites what Google changed             | `writeTaskChange` without the `etag` guard, a deleted task recreated         | `calendar-write.test.ts`, `calendar.test.ts` (exist), one real run by hand   |
| A deploy never replaces a working build with a broken one | Missing gates, unapplied schema                                              | `bun run verify` in deploy and CI, fatal schema check                        |

Principles:

1. **One command is the definition of green:** `bun run verify`. Deploy, CI and Claude run exactly the same thing.
2. **Fast:** unit plus integration suite under 3 s, the full gate around 60 s, the quick gate around 20 s.
3. **Deterministic:** no network, no wall clock, no machine timezone, no order dependence. Each test file runs isolated (`--isolate`) and in random order (`--randomize`), and the suite runs in three timezones.
4. **Cheapest level that can see the bug:** pure test, then integration (real Drizzle on in-memory SQLite, fake `fetch`), then e2e only for what nothing else can see.
5. **Test contracts, not internals:** assert HTTP status and body, DB rows, outbound requests and `tasker` state.
6. **Rules are enforced by machines:** every project rule in `CLAUDE.md` that can be checked mechanically gets a check.

## 2. Starting point

Now (2026-10-15): `bun run verify` is green and gates deploy, the test infrastructure exists, D1 to D8 are fixed, and the guest side is covered: every module in `src/lib/local/` has a test (IndexedDB through `src/test/idb.ts`), as do the repo contract, the remote backend, the account move, Calendar and the Google token store.

Still untested, as the allowlist in `src/test/architecture.test.ts` says:

- Route modules without a test: `/agent` (and `cards`, `stuck`), `/assistant` (and `undo`, `speak`, `transcribe`), `/schedule` (and `display`) and `/stream`. The `/settings/timezone` action has no test either. No login or ownership matrix exists yet (`src/routes/auth.test.ts`, `ownership.test.ts`)
- Client wiring: `alarms.ts`, `agent.ts`, `assistant.ts`, `stream.ts` (including the `calendar` hint). `theme.ts` waits for the daylight theme (`daylight-theme.md`). `speech.ts`, `display.ts`, `audio.ts` and `index.ts` stay permanent entries (browser API wiring, their rules live in tested pure modules such as `silence.ts` and `tones.ts`)
- No e2e, no CI, no `playwright.config.ts` (phases 7 and 8)

Re-measure the coverage floor before phase 6: the threshold is still 0.90.

## 3. Open gaps

| ID  | Gap                                                                                                                                                                                       | Fixed in                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| G8  | No CI                                                                                                                                                                                     | Phase 8                             |
| G10 | `.gitignore` ignores every dotfile (`.*`), so `.github/` and `.envrc` would silently stay untracked (`.git-blame-ignore-revs` is handled)                                                 | 7, 8                                |
| G11 | Google Calendar is only tested against fakes: no real import, move, done or conflict has run (`TODO.md` Now, by hand). Fakes cannot show a changed Google API                             | by hand, then keep the fake in step |
| G12 | A guest plan lives in IndexedDB, which only a real browser shows: quota, private windows, cleared site data and two tabs (`leader.ts`) are tested against a fake IndexedDB and fake locks | Phase 7 (one guest spec)            |

## 5. Phases

Each numbered item is one commit unless noted. Commits stay small and thematic, as `CLAUDE.md` asks.

### Phase 4: Core and server integration (done)

Built on 2026-10-15, one commit per theme (git history from `d740e28`). The rules live in `src/lib/core/` and take a `Ctx`, so each core module has its test next to it, run on `testCtx()` with a fake `Model`, and that one test serves the account and the guest. The server wrappers have thin tests for what only they do.

- **Fakes** (`src/test/fakes.ts`): `fakeModel(...answers)` (a queue of `text(...)`, `toolCalls([...])` or an `Error`, every call recorded with a copy of its input), `forbiddenModel()` (records the call and fails the test), `expectEveryRequestValid()`, `FakeWebSocket` and `fakeConnect()` for `speak`. `testCtx().state.screens` sets how many screens a hint reaches (0 for "no screen is open").
- **`core/agent.test.ts`:** every guardrail (observe, event type off, quiet hours, budget, hourly limit, minimum gap, no key) ends in `silent: <reason>` with the model never called, and the same matrix runs through the guest loop (`local/agent-loop.test.ts`). `stuck.pressed` skips quiet hours, budget and gap but not `observe` or the hourly limit. `suggest` offers no editing tool and refuses a forged one, `act` edits with reason and event id, at most 4 tool calls, one card, a failing model still records usage, a second `react()` while the first waits finds nothing (claimed before the call), `watch` and `prune`.
- **`core/assistant.test.ts`:** `parseMessages`, every `runTool` branch (undo log, overlaps, agent event never wakes the agent), `runAssistant` with tool rounds, the 6 round stop and usage on failure, `undoAction` for add, update and delete, the second undo (409) and the pinned case of undoing an update whose task is gone. The adapter errors (401, 429 retry, network) were already in `openai.test.ts`.
- **`core/usage.test.ts`, `core/voice.test.ts`, `core/schedule.test.ts`** (the missing cases: quiet hours for wakeups, the 10 wakeup and 30 alarm caps, custom tones counted per day, `play_tone` without a screen, a daily alarm across the end of daylight saving, a failing announcement never makes an alarm ring twice).
- **Server wrappers:** `server/schedule.test.ts` (`fireAllDue` per account and timezone, `announceDisplay`), `server/assistant.test.ts` (the saved key, the 20 per 5 minutes limit per account), `server/voice.test.ts` (30 per 5 minutes shared by `transcribe` and `speak`), `server/agent.test.ts` (`tick` is exported for this: due alarms, `watch` per account, the safety net for events left behind, hourly pruning, the coalescing timer behind `startAgent`).

What stays for later phases: the ownership of `agent_actions`, cards and schedule rows through `db-repo` belongs to the ownership matrix (5.2). The guest backend has its own chat and voice limits (`local/backend.ts`): the chat limit is tested in `local/backend.test.ts`, the voice limit is not yet.

### Phase 5: Route contracts

Route tests live next to their route (`src/routes/edit/edit.test.ts` exists from the soon plan; SvelteKit ignores files without the `+` prefix). The two matrices live in `src/routes/auth.test.ts` and `src/routes/ownership.test.ts`.

**5.1 Login matrix (the guest column).** A guest is a request without a user: every API answers 401 to it and the guest never calls it (the local backend answers instead), so the matrix below is also the guest matrix. `/activity` and `/alarms` do not redirect any more, they load for a guest from the device, and the layout load without a user returns no user and no tasks. Every exported handler and action in every route module, called without a user, gives 401 (handlers) or `fail(401)` (actions). Exempt by design: `/callback` and `/login`. Several of these files already hold a 401 case (`calendar`, `account`, `export`, `import`, `settings`): the matrix replaces those one-off checks by one table so a new route cannot be forgotten.

**5.2 Ownership matrix.** Users A and B; A owns a task, an agent action, a card, a schedule entry, a Calendar link (`calendar_events`) and a plan snapshot. B calls `PUT` and `DELETE /edit`, `GET /edit?date=`, `POST /assistant/undo`, `POST /agent/cards/[id]`, `DELETE /schedule/[id]`, `POST /agent/stuck`, `POST /account/restore` and `/calendar/*` with A's ids: each answers 404 or returns nothing of A's, and all of A's rows are unchanged afterwards. `/export` returns only the caller's rows.

**5.3 Route coverage rule.** Add a further rule to `src/test/architecture.test.ts`: the set of route modules found by globbing `src/routes/**/+{server,page.server,layout.server}.ts` equals the set listed in the two matrices, so a new route cannot skip the login and ownership checks.

**5.4 Per route:**

- `/schedule`: `POST` rejects custom tones (agent only), caps at 30, answers 201 with the id; `GET` shape; `DELETE /schedule/[id]` 204, 404 and 400.
- `/schedule/display`: `null` is allowed, more than 64 characters is not, the display is announced.
- `/agent`: without `since` only the cursor; with it only reaction changes (event id set) that are not undone, in order; only the newest open card.
- `/agent/cards/[id]`: 404 for a resolved card. `/agent/stuck`: unknown reason 400, emits `stuck.pressed` with origin `user`.
- `/assistant`: an `AssistantError` keeps its status, anything else is a 500 with a generic message that leaks nothing. `/assistant/undo`: id validation. `/assistant/speak`: empty text 400, otherwise `audio/wav` with `no-store`. `/assistant/transcribe`: no file 400.
- `/settings`: `saveOpenaiKey` checks the key against a fake `/v1/models` and stores it encrypted (the stored value is not the key and decrypts with the secret and purpose); the layout data never contains the key anywhere, only `hasOpenaiKey`; invalid `saveAgent` and `saveAnchoring` forms give 400 and change nothing; `linkGoogle` without services is 400 and with services redirects to Google with the scopes and `include_granted_scopes`, setting the state cookies; `removeOpenaiKey`, `saveVoice`; `unlinkGoogle` and the key route have tests already (`settings.test.ts`, `unlink.test.ts`, `openai-key.test.ts`), check them against this list and add only what is missing. `/settings/timezone` rejects an invalid zone. Write these after UX phase 8 (auto-save and presets change the actions) or adjust them then.
- `/stream`: event stream headers, the first chunks are `retry: 3000` and `hello`, and an abort unsubscribes (`publish` count goes from 1 to 0).
- `/callback`: state mismatch and missing verifier redirect to the error page; declined linking returns to Settings; One Tap with a CSRF mismatch is refused; a verified ID token (fake `tokeninfo`, matching `aud`, verified email) sets the `session` cookie `httpOnly`, `sameSite: lax`, `secure`; a wrong `aud` fails; the code exchange runs against a fake Google token endpoint.
- `/logout` (own route now): revokes the token and deletes both cookies. `/activity` load: shape and limits. Already covered by their own route tests and not to be repeated: `/calendar`, `/account`, `/export`, `/import`, `/login`, the `/settings` actions and the OpenAI key route.

### Phase 6: Client wiring

Compiled runes, timers and `EventSource`. Components never call `fetch`, so these modules are driven through `tasker.backend`: a small fake `Backend` (or `localBackend` on `testCtx()`, which already speaks the whole interface and gives the guest case for free) instead of a fake `fetch`. Only `stream.ts` needs `FakeEventSource` in `src/test/fakes.ts`; it runs for an account only, a guest hears the same hints from the local runtime (`local/runtime.ts`, tested).

1. `alarms.ts`: rings once per `id@fireAt` whichever path comes first; replays up to 3 times, 30 s apart, until dismissed; dismissing stops the replays; `playsSound` for no display, this device and another device; arming rings alarms from the last 60 s, schedules future ones, ignores older ones and anything beyond the `setTimeout` limit; a failed `loadSchedule` changes nothing; `deviceId` is stable and falls back when storage throws.
2. `agent.ts`: the first poll after a load stays silent, a later new card is spoken once and only on the display device with voice on; the cursor advances; touched days are refreshed once each; the Undo toast reverts newest first; answering a card resolves it and continues in the chat.
3. `assistant.ts`: ignored while busy or empty; error entries are not sent back; a server message becomes an error entry; a network failure shows "Could not reach the server."; `busy` is reset in every case; changes refresh the days and offer Undo; a 409 on undo shows "Already undone".
4. `stream.ts`: each message type reaches its handler (`agent`, `schedule`, `alarm`, `tone`, `display` and `calendar`, which shows the toast about Google and refreshes the plan); malformed data is ignored; the fallback poll runs only while disconnected and visible; the cleanup closes the source and removes the listener.

Each module leaves the pairing allowlist when its test lands. Run each case once with the remote and once with the local backend where the module reads or writes through it, so a behavior that differs between an account and a guest shows up here. The Settings Calendar write select (TODO) is a component and stays an e2e or manual check, per section 8.

### Phase 7: End to end smoke

Playwright, deliberately small: only what no other layer can see. Specs are named `e2e/*.e2e.ts` and `testMatch` is set to that, because `bun test` would pick up `*.spec.ts` files. Add `e2e` and `playwright.config.ts` to the root tsconfig `include`. Write the specs after the UX phases that change the screens they touch, or adjust them then.

**Setup.** `webServer` builds and starts the app with test values for the static env (`GOOGLE_CLIENT_SECRET=e2e-secret`, `DATABASE_URL=./e2e/e2e.db`, a dummy client id, port 4173). The global setup creates the schema, seeds a user with timezone `Europe/Berlin` and three tasks for the real current date in Berlin: missed (09:00 to 09:30), current (11:30 to 12:30) and next (13:00 to 13:30). The browser context uses `timezoneId: 'Europe/Berlin'`, a `session` cookie minted with `signSession` (soon plan 2.2), and `page.clock.install()` at 12:00 Berlin on that date. Seeding on the real date keeps the server's preload window (from yesterday in UTC) correct at any hour, and the fixed browser clock makes the hero deterministic. If the build did not pick up the test secret, the first spec fails at once, so the setup verifies itself. Note: the e2e build overwrites the local `build/`, which is only a local artifact.

**Specs:**

1. Now shows the current task without any tap: hero title, the next task in the rail, the missed strip.
2. Done gives feedback and is undoable: Done moves the hero on and shows the Undo toast; Undo brings the task back; after a reload the screen matches (catches the D4 class).
3. Quick add on Plan: "Call mom at 14:00 for 30m" lands at 14:00 and survives a reload.
4. Guest: on a clean browser `/` shows the first run and no task data, the page sends no request to a task API, a task added through quick add is kept in IndexedDB across a reload, and `/edit?date=` answers 401 to a plain request.
5. Hydration smoke: `/`, `/edit`, `/alarms`, `/activity`, `/settings`, `/about`, `/privacy` and `/terms` load with no console error and no failed request.
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

| Phase                 | Commits        | Effort | Exit criterion                                     |
| --------------------- | -------------- | ------ | -------------------------------------------------- |
| 4 Server integration  | done           | done   | Every guardrail proven silent without a model call |
| 5 Route contracts     | 4 to 6         | 1 day  | Login and ownership matrices cover every route     |
| 6 Client wiring       | one per module | 4 h    | Coverage threshold raised to the measured floor    |
| 7 E2E smoke           | 3              | 4 h    | Six specs green locally (Nix shell) and in CI      |
| 8 CI and dependencies | 2              | 2 h    | CI green on `master`, audit job scheduled          |

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
