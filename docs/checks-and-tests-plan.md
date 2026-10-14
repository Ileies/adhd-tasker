# Checks and Tests Plan

Status: proposed, 2026-10-14. Measured on `ffec608` with Bun 1.4.2, SvelteKit 3.0.1, Svelte 5.57, drizzle-kit 0.31.10, TypeScript 6.0.3. Every technical claim below that the plan depends on was run on this machine, not assumed (see section 11).

## 1. What the checks are for

Tests protect promises. These are the promises the app makes, and what has to guard each one:

| Promise                                                   | What can break it                                                            | Guarded by                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The screen always shows the right task                    | `rank()`, time and timezone math, hydration, invalid tasks in the DB         | Pure tests (exist), property tests, `/edit` validation tests, e2e            |
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
6. **Rules are enforced by machines:** every project rule in `CLAUDE.md` that can be checked mechanically gets a check (section 5, Phase 1.5).

## 2. Baseline (measured)

| Check                | Command                                   | Result                                                                                 | Time   |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| Types                | `bun run check`                           | 0 errors, 1 warning (`+layout.svelte:27`, `state_referenced_locally`)                  | 9.0 s  |
| Unit tests           | `bun test`                                | 148 pass in 15 files, 395 expects                                                      | 0.1 s  |
| Coverage             | `bun test --coverage`                     | 97.1 % lines, 97.8 % functions, but only of the 17 files a test imports                | 0.1 s  |
| Formatting           | `prettier --check .`                      | **fails, 168 files**                                                                   | 3.8 s  |
| ESLint               | `eslint .`                                | **18 errors**, and it never runs inside `bun run lint` because Prettier fails first    | 23.6 s |
| Build                | `bun run build`                           | passes                                                                                 | 11.7 s |
| Service worker types | not run (excluded from the root tsconfig) | passes when run by hand                                                                | 1.0 s  |
| `scripts/*.ts` types | not run (outside every tsconfig)          | passes when run by hand                                                                | 2 s    |
| Dependency audit     | `bun audit`                               | 23 advisories (13 high), all in build and lint tooling                                 | 2 s    |
| Deploy gate          | `scripts/deploy.ts`                       | check and test only, lint skipped on purpose, no local build, schema change only warns |        |
| CI                   | none                                      |                                                                                        |        |

The suite is also robust today: it passes under `TZ=Pacific/Kiritimati`, `America/St_Johns`, `Asia/Kathmandu` and `Pacific/Pago_Pago`, and with `--isolate --randomize`.

**Tested today:** 15 pure modules in `src/lib` and `src/lib/server/crypto.ts`.

**Untested today** (lines in parentheses):

- Server: `agent.ts` (315), `assistant.ts` (249), `schedule.ts` (164), `voice.ts` (101), `events.ts` (77), `stream.ts` (48), `session.ts` (46), `index.ts` (31), `hooks.server.ts` (32)
- All 18 route modules
- Client wiring: `index.ts` (170), `speech.ts` (154), `theme.ts` (108), `alarms.ts` (96), `stream.ts` (76), `assistant.ts` (68), `agent.ts` (60), `display.ts` (32)
- Pure but untested: `google.ts`, the clock-reading half of `time.ts` (`minutesNow`, `deviceTimezone`, the invalid-timezone fallback)

Bun only reports coverage for files a test imports, so the 97 % says nothing about the files above. Section 6 closes that hole.

## 3. Findings

### 3.1 Gaps in the checks

| ID  | Gap                                                                                                                                                                                                                  | Fixed in  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| G1  | Lint is red (168 Prettier files, 18 ESLint errors) and gates nothing                                                                                                                                                 | Phase 0   |
| G2  | svelte-check warnings do not fail the check                                                                                                                                                                          | 1.1       |
| G3  | The service worker and `scripts/*.ts` are never type checked                                                                                                                                                         | 1.2       |
| G4  | No type-aware lint. A probe found 17 floating promises and 10 misused promises (async callbacks where a void return is expected)                                                                                     | 1.3       |
| G5  | The `#lib` import convention is not enforced: relative imports in 7 test files, `app.svelte.ts`, `db/schema.ts`, `db/index.ts`. A probe showed drizzle-kit resolves `#lib` in `schema.ts`, so no exception is needed | 1.4       |
| G6  | Project rules are not checked by anything: no em dashes, `bun x` not `bunx`, every pure module has a test, model calls only through `buildRequest`, one `$state` object, every route requires login                  | 1.5       |
| G7  | Deploy: no lint, no local build, and a changed `schema.ts` only prints a warning, after the server was already reset to the new commit                                                                               | 1.7       |
| G8  | No CI                                                                                                                                                                                                                | Phase 8   |
| G9  | Coverage cannot see unimported files and has no threshold                                                                                                                                                            | 2.1, 1.5  |
| G10 | `.gitignore` ignores every dotfile (`.*`), so `.github/`, `.git-blame-ignore-revs` and `.envrc` would silently stay untracked                                                                                        | 0.1, 7, 8 |

### 3.2 Defects found during the audit

Each was confirmed by running code against the real modules (section 11). Each gets a failing test first, then a fix, as two commits.

| ID  | Severity | Defect                                                                                                                                                                                                                                                                                                                 | Test lands in |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| D1  | high     | `POST /edit` stores invalid tasks. A task at 23:20 (`startTime: 1400`) lasting 120 minutes with `priority: 9` returned 200 and was saved. That breaks "tasks never cross midnight" and the 1 to 5 priority scale that `rank()` and `urgencyLevel()` assume. `PUT /edit` has the same gap, and no field is type checked | 3.3, 5.3      |
| D2  | low      | `POST /edit` without a title answers 500 (`NOT NULL constraint failed: tasks.title`) instead of 400                                                                                                                                                                                                                    | 5.3           |
| D3  | low      | `PUT` and `DELETE /edit` answer `200 true` for an unknown or foreign id, and `200 false` for a non-numeric id. Not a leak (queries are scoped), but the client cannot tell success from failure                                                                                                                        | 5.3           |
| D4  | high     | `updateTask` and `deleteTask` in `src/lib/index.ts` change `tasker` optimistically, never check the response and never roll back. Once D1 is fixed, a rejected edit leaves the screen showing a plan the server does not have                                                                                          | 6.5           |
| D5  | medium   | `extend()` in `src/routes/+page.svelte` sets `duration = now - startTime + 15`, which crosses midnight when used after 23:45. Today it is stored, after D1 it is rejected. Needs a pure, clamped helper                                                                                                                | 3.3           |
| D6  | medium   | `hooks.server.ts`: with no valid `session` cookie but a `token` cookie, a network error from Google's userinfo endpoint throws, so every request of that user fails with 500                                                                                                                                           | 4.6           |
| D7  | low      | `+layout.svelte:27` copies `data.tasks` once (the svelte-check warning). Probably intended, but the intent is not visible                                                                                                                                                                                              | 0.3           |
| D8  | high     | SQLite foreign keys are off (`PRAGMA foreign_keys` is 0 by default in `bun:sqlite`, and nothing turns it on), so every `onDelete: 'cascade'` in the schema is inert. Deleting a user, which `/privacy` promises on request, would leave their tasks, events, actions, cards, schedule and usage rows behind            | 4.1           |

## 4. Target: the gate

`bun run verify` runs `scripts/verify.ts`: fail-fast, cheapest and most likely failure first, one line per step with its time.

| #   | Step                     | Command                                                                                                                   | Budget  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Format                   | `prettier --check .`                                                                                                      | 4 s     |
| 2   | Tests with coverage      | `TZ=UTC bun test --isolate --randomize --coverage` (thresholds from `bunfig.toml`)                                        | 3 s     |
| 3   | Tests in other timezones | the same without coverage, `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=America/St_Johns` (half hour offset, daylight saving) | 2 x 3 s |
| 4   | Types                    | `bun run check` (svelte-check with `--fail-on-warnings`, then `tsc` for the service worker and the scripts)               | 12 s    |
| 5   | Lint                     | `eslint .` (type aware)                                                                                                   | 27 s    |
| 6   | Build                    | `bun run build`                                                                                                           | 12 s    |

`bun run verify --quick` runs steps 1 to 4 (about 20 s).

Who runs what:

- **Before every commit:** `bun run verify --quick` (replaces "run check and test" in `CLAUDE.md`).
- **Deploy preflight:** `bun run verify` in full, so a broken build never reaches the server. `--skip-check` stays as the escape hatch.
- **CI:** `bun run verify` on every push, plus the e2e job.

## 5. Phases

Each numbered item is one commit unless noted. Commits stay small and thematic, as `CLAUDE.md` asks.

### Phase 0: Green baseline

**0.1 Formatting commit.** Run `bun run format` on a clean tree and commit only that, with no other change. Then add its hash to a new `.git-blame-ignore-revs`, add `!.git-blame-ignore-revs` to `.gitignore` (G10), and note `git config blame.ignoreRevsFile .git-blame-ignore-revs` in the README. Review the Markdown part of the diff: Prettier rewrites tables in `CLAUDE.md`, `README.md` and `docs/`.

**0.2 ESLint config fixes** (one commit):

- `**/*.cjs`: `sourceType: 'commonjs'`, `@typescript-eslint/no-require-imports` off (2 errors in `pm2.config.cjs`).
- `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`, `ignoreRestSiblings: true` (5 errors: `DayTimeline.svelte` twice, `+page.svelte`, `edit/+page.svelte`, `server/assistant.ts`). The `{ id: _id, ...rest }` pattern is idiomatic here.
- `@typescript-eslint/no-unused-expressions` off for `**/*.svelte` only: a bare read like `tasker.isMuted;` inside `$effect` is Svelte's way to declare a dependency (4 errors in `AssistantDrawer.svelte` and `+layout.svelte`). It stays on for `.ts`.

**0.3 ESLint code fixes** (one commit):

- `src/lib/quickadd.ts:41,45`: rewrite the `take(a) || take(b) || take(c)` statement chains as `if` statements.
- `src/lib/theme.ts:8,99`: a comment in each empty `catch` saying why (storage blocked, preferences are a convenience).
- `src/lib/server/agent.ts:133`: keep the initial value and add `// eslint-disable-next-line no-useless-assignment -- read in finally if the catch itself throws, TypeScript requires it`. Verified: without the initializer TypeScript reports TS2454 in the `finally` block, so ESLint is wrong here.
- `src/routes/+page.svelte:59`: keep the plain `Set` with a disable comment and the reason (a memo of moments already sounded, never rendered; a `SvelteSet` read and written inside the same `$effect` would re-trigger it).
- `src/lib/voice.test.ts:83`: replace `as any[]` with the event types from `voice.ts`.
- D7, `src/routes/+layout.svelte:27`: make the one-time hydration explicit: `if (browser) tasker.tasks = untrack(() => data.tasks);` with a comment that `tasker` is the source of truth after hydration. Keep the `browser` guard: the module-level `$state` is shared across requests on the server, so it must never be written there.

Exit: `bun run lint` and `bun run check` pass with zero warnings.

### Phase 1: Static checks

**1.1** `check` gets `--fail-on-warnings`.

**1.2** Type check everything that is code:

- Service worker: append `tsc -p src/service-worker/tsconfig.json --noEmit` to `check`.
- New `scripts/tsconfig.json` (`strict`, `noEmit`, `module: esnext`, `moduleResolution: bundler`, `target: esnext`, `types: ["bun"]`, `include: ["*.ts"]`), appended to `check`. This also gives ESLint's project service a config for the scripts, which fixes the 8 parse errors the type-aware probe hit there.

**1.3 Type-aware lint** for `**/*.ts` and `**/*.svelte`: `no-floating-promises`, `no-misused-promises` (with `checksVoidReturn: { attributes: false }` for Svelte event attributes), `await-thenable`, `switch-exhaustiveness-check` (`considerDefaultExhaustiveForUnions: true`). Measured cost: about 3 s more lint time. Fix the 27 findings in a separate commit: intentional fire-and-forget gets `void` (already the house style, as in `void loadSchedule().catch(() => {})`), and a call whose rejection would otherwise go unhandled gets a `.catch`. Files: `AssistantDrawer.svelte`, `TimezoneDialog.svelte`, `display.ts`, `+layout.svelte`, `+page.svelte`, `edit/+page.svelte`, `agent.ts`, `assistant.ts`, `server/agent.ts`.

**1.4 Import convention:** `no-restricted-imports` with the patterns `./*` and `../*`, allowing `./$types`, and ignoring `src/lib/components/ui/**` (generated by the shadcn CLI). Fix the existing relative imports in the same commit.

**1.5 Repo rules as an architecture test,** `src/test/architecture.test.ts`. It runs inside `bun test`, so it is part of every gate and costs milliseconds:

1. No em dash (U+2014) in any tracked text file (`git ls-files`, skipping binaries and `bun.lock`).
2. No `bunx` anywhere except the rule itself in `CLAUDE.md`.
3. **Pairing rule:** every module in `src/lib/*.ts` and `src/lib/server/**/*.ts` has a sibling `*.test.ts`, except an explicit allowlist where each entry carries its reason. End state of the allowlist: `types.ts` (types only), `utils.ts` (generated shadcn helper), `app.svelte.ts` (the state object, used by every client test), `display.ts` and `speech.ts` (browser API wiring, their rules live in tested modules), `server/index.ts` (covered by the login and `linkGoogle` route tests), `server/db/index.ts` and `server/db/schema.ts` (used by every integration test). This replaces the coverage blind spot with a hard rule.
4. **OpenAI call sites:** only `src/lib/openai.ts` and `src/lib/voice.ts` define OpenAI URLs; only `src/lib/server/assistant.ts` uses `OPENAI_URL`; only `src/lib/server/voice.ts` uses `TRANSCRIBE_URL` and `REALTIME_URL`; the only other mention of `api.openai.com` is the key check in `src/routes/settings/+page.server.ts`. This enforces "new model calls must go through `buildRequest`" at commit time.
5. **Single state object:** no module-level `$state(` in any `*.svelte.ts` except `src/lib/app.svelte.ts`.
6. **Browser storage allowlist:** `localStorage` appears only in `theme.ts` and `alarms.ts`. A new use has to be added on purpose, which makes a task data fallback impossible to slip in.
7. **Route coverage:** the set of route modules found by globbing `src/routes/**/+{server,page.server,layout.server}.ts` equals the set listed in the route matrices of Phase 5, so a new route cannot skip the login and ownership checks.

**1.6 `scripts/verify.ts`** and the package scripts:

```json
"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings && tsc -p src/service-worker/tsconfig.json --noEmit && tsc -p scripts/tsconfig.json --noEmit",
"test": "bun test --isolate --randomize",
"test:coverage": "bun test --isolate --coverage",
"test:e2e": "playwright test",
"verify": "bun run scripts/verify.ts"
```

Plain `bun test` keeps working (the preload lives in `bunfig.toml`); the flags only add isolation and random order, which measured at zero cost (0.09 s either way).

**1.7 Deploy gate** (`scripts/deploy.ts`):

- Preflight runs `bun run verify` instead of check plus test. Remove the comment "Lint is not a gate".
- Move the schema check before the server is reset (`previousHead` is already known at that point) and make it fatal unless `--db-push` is given, or a new `--schema-applied` flag for a schema change that was applied by hand.

### Phase 2: Test infrastructure

All of this was spiked successfully (section 11).

**2.1 `bunfig.toml`:**

```toml
[test]
preload = ["./src/test/preload.ts"]
coverageSkipTestFiles = true
coverageThreshold = { lines = 0.9, functions = 0.9 }
```

Verified: a run below the threshold exits with code 1. The threshold applies when `--coverage` is passed, which `verify` does.

**2.2 `src/test/preload.ts`,** one Bun plugin:

- Virtual modules for `$app/env` (`building: true` so importing `hooks.server.ts` never starts the 15 s scheduler, `dev: false` so cookie flags are tested as in production, `browser: false`), `$app/env/private` (`GOOGLE_CLIENT_SECRET: 'test-secret'`, `DATABASE_URL: ':memory:'`) and `$app/env/public`. No `.ts` module in `src/lib` imports any other `$app/*` module (checked), so these three are enough.
- An `onLoad` hook for `*.svelte.ts` that strips types with `Bun.Transpiler` and compiles the runes with `svelte/compiler`'s `compileModule`. This makes `tasker` and every client wiring module importable in tests.
- A `fetch` guard: `globalThis.fetch` is replaced by a function that throws "network access in a test" unless the test installed a fake. No test can ever reach Google or OpenAI by accident.

**2.3 `src/test/db.ts`:** `resetDb()`, called in `beforeEach`. The first call builds the schema from `schema.ts` with `drizzle-kit/api` (`generateSQLiteDrizzleJson` plus `generateSQLiteMigration` against an empty snapshot, 9 statements) and runs it on the app's own `db` instance. Later calls delete all rows, children before parents, and clear `sqlite_sequence` so ids are predictable. With `--isolate` every test file gets its own in-memory database.

**2.4 `src/test/fixtures.ts`:**

- `makeUser(overrides)` and `makeTask(overrides)` insert real rows with calm defaults (timezone `Europe/Berlin`, date `2026-10-14`).
- `requestEvent({ user, method, url, body, params, cookies })` builds what a route handler needs, with an in-memory `Cookies` fake that records `set` and `delete` with their options.
- `callRoute(handler, init)` returns `{ status, body, headers }` and turns a thrown SvelteKit `error()` or `redirect()` into a result (`isHttpError`, `isRedirect` from `@sveltejs/kit`).

**2.5 `src/test/fakes.ts`:**

- `fakeFetch(routes)` replaces `fetch` for one test, records every request, and fails on any URL it does not know.
- `fakeOpenAI()` on top of it: a queue of Responses API answers (`text('...')`, `toolCalls([...])`, `status(429)`, `networkError()`), the recorded request bodies, and `expectEveryRequestValid()` which checks each body against the fixed rules: model, `store: false`, `service_tier: 'flex'`, reasoning effort per use, encrypted reasoning included.
- `FakeWebSocket` for `speak()`, `FakeEventSource` for `stream.ts`.

**2.6 Time:** `setSystemTime()` from `bun:test` (affects `Date` and therefore `Intl`), reset in `afterEach`. `jest.useFakeTimers()` and `jest.advanceTimersByTime()` work in Bun 1.4.2 (verified) for the 3 s OpenAI retry, the 30 s alarm replays and the 30 s speech timeout, so no test sleeps. Where code takes `now` as a parameter (`fireDue(nowMs)`), tests pass it instead.

**2.7 Seams.** Export three internals of `src/lib/server/agent.ts` for tests: `watch(user)`, `tick()` and the hourly pruning as `prune(nowMs)`. No behavior change.

**2.8 Import alias:** add `"#test/*": "./src/test/*"` to `imports` in `package.json`.

### Phase 3: Pure modules

**3.1 Close the existing gaps:**

- `time.ts`: `minutesNow` with a fixed system time in several zones, including half and three-quarter hour offsets; the invalid timezone fallback; `isValidTimezone`; `zonedToEpoch` inside the spring-forward gap (2026-03-29 02:30 `Europe/Berlin`) and the repeated autumn hour, pinning the current behavior explicitly.
- `events.ts`: a table test over `EVENT_TYPES` asserting every type has a description and none contains `undefined` or `[object Object]`. New event types are covered automatically.
- `assistant-tools.ts`: the untested `parseUpdateTask` branches (description not text, bad date, start, duration, priority).
- `schedule.ts`: `nextRepeat` returning `null`, `parseId`.
- `guardrails.ts`: `parseEvents` (ignores junk, keeps order).
- New `google.test.ts`: `isGoogleServiceId`, `servicesFromScopes` ignores unknown scopes, `parseServices` with `null`, empty and junk input.
- `server/events.ts` `startOfDayMs` and `server/stream.ts` (`subscribe`, `publish`, `effectiveDisplay`) are pure in-memory code: test them directly (unsubscribe removes the connection, the last one removes the user entry, `publish` returns the count, the display falls back to `null` when the chosen device is not connected).

**3.2 Session tokens.** Move the signing logic of `server/session.ts` into pure functions that take the secret, as `crypto.ts` already does (`signSession(email, secret, nowMs)`, `verifySession(value, secret, nowMs)`); `session.ts` wraps them with the env. The e2e setup needs this to mint a cookie. Tests: round trip, expired, tampered payload, tampered signature, signature of the wrong length, payload that is not JSON, missing parts, email that is not a string.

**3.3 New pure helpers for the defects:**

- D1: `parseTaskInput(body, mode)` for `/edit` in a new `src/lib/task-input.ts`, built on the same primitives as `assistant-tools.ts` (`parseTitle`, `parseDuration`, `parsePriority`, the midnight rule) so chat and Plan enforce identical rules. Create requires all fields; update takes a partial patch, and the route checks the merged task still fits in the day. Status accepts only `pending` and `completed` (the others are dead, see `CLAUDE.md`).
- D5: `extendTask(task, now, minutes)` in `plan.ts`, clamped to end by 1440.
- `theme.ts`: extract the day window test from `resolveDark` as a pure `isDaytime(minutes, dayStart, dayEnd)` and test the wrap over midnight and equal bounds.

**3.4 Property tests** with `fast-check` (the one new test library). Each property runs 100 cases; a failure prints the seed and the shrunk input for replay.

| Module                                | Property                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time.ts`                             | For zones `Europe/Berlin`, `America/St_Johns`, `Asia/Kathmandu`, `Australia/Lord_Howe`, `Pacific/Kiritimati`, `Pacific/Pago_Pago` and any date and minute outside a DST gap: `minutesOf(zonedToEpoch(d, m, tz), tz) === m` and `todayIn(tz, epoch) === d`. `addDays(addDays(d, n), -n) === d` |
| `priority.ts`                         | `current` is `null` or contains `now` and is not completed; no task with a higher priority also contains `now`; the result does not depend on input order (for inputs without full ties)                                                                                                      |
| `plan.ts`                             | Snapped, moved and resized tasks stay within 0 to 1440, on the 15 minute grid, with at least the minimum duration                                                                                                                                                                             |
| `quickadd.ts`                         | Never throws; start is `null` or within the day; duration is `null` or positive; the title is trimmed                                                                                                                                                                                         |
| `schedule.ts`                         | `nextRepeat` is always after `afterMs`, keeps the local minutes outside DST gaps, never lands on a weekend for `weekdays`                                                                                                                                                                     |
| `tones.ts`                            | Anything `parseTone` accepts is within the caps (12 notes, 100 to 2000 Hz, 5 s)                                                                                                                                                                                                               |
| `assistant-tools.ts`, `task-input.ts` | Never throw on arbitrary JSON (`fc.jsonValue()`); an accepted task never crosses midnight                                                                                                                                                                                                     |
| `crypto.ts`                           | `decrypt(encrypt(s))` returns `s` for any Unicode string                                                                                                                                                                                                                                      |

### Phase 4: Server integration

Real modules, real Drizzle, in-memory SQLite, fake `fetch`. One test file next to each module.

**4.1 Database settings (D8).** Turn on `PRAGMA foreign_keys = ON` in `src/lib/server/db/index.ts`. Test: deleting a user removes every row in every table that references it. Before deploying, run `PRAGMA foreign_key_check` on a copy of the production DB, because existing orphans are not reported until they are touched.

**4.2 `server/events.test.ts`:**

- `emit` logs and returns the id; the same `key` twice returns `null` the second time and does not wake the agent.
- Origin `agent`, `user.message` and `alarm.fired` are stored as handled with their outcome and never call the reactor; everything else calls it exactly once.
- `emit` never throws: with `db.insert` made to throw, it returns `null`.
- `emitChange` emits nothing for an invisible edit and merges `extra`.
- `tokensSince`, `countUses` and `reactionTimes` are scoped by email, use and time.

**4.3 `server/schedule.test.ts`:**

- `runScheduleTool`: invalid JSON; a wakeup in quiet hours is refused unless `fromChat`; at most 10 pending wakeups and 30 alarms; 3 custom tones per day, counted through `ai_usage`, available again the next day; `play_tone` reports `played: false` when no screen is connected; `cancel_schedule` with another user's id gives "no such pending entry"; unknown tool.
- `fireDue(nowMs)`: a one-off alarm becomes `done`, emits `alarm.fired` with its key and publishes `alarm` and `schedule`; a daily alarm moves to the same local time the next day, also across the 2026-10-25 change, and stays pending; an entry more than 10 minutes late is retired without ringing; a wakeup emits `wakeup.fired` with its note; a second call at the same moment rings nothing.
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

**4.6 `hooks.server.test.ts`:** a valid session loads the user; the first login creates the user row; an expired or forged session without a token means no user; the token fallback with a fake userinfo answer logs in; a rejected token clears the cookie; D6: a network error from userinfo means no user and no throw.

**4.7 `server/voice.test.ts`:** `transcribe` rejects empty (400), too large (413) and non-audio (415) recordings before any network call, needs a key, sends the model and a file name with the right extension, trims the text, maps 401, 429 and 500, rate limits at 30 per 5 minutes. `speak` with `FakeWebSocket`: sends the events on open with the key in the headers, collects audio and returns a WAV on `done`, and answers 502 for an error event, a close before `done`, no audio, and the 30 s timeout.

### Phase 5: Route contracts

Route tests live next to their route (`src/routes/edit/edit.test.ts`; SvelteKit ignores files without the `+` prefix). The two matrices live in `src/routes/auth.test.ts` and `src/routes/ownership.test.ts`.

**5.1 Login matrix.** Every exported handler, action and load in every route module, called without a user, gives 401 (handlers), `fail(401)` (actions) or the redirect (`/activity`). Exempt by design: `/callback`. The layout load without a user returns no user and no tasks. The architecture test (1.5.7) keeps this table complete.

**5.2 Ownership matrix.** Users A and B; A owns a task, an agent action, a card and a schedule entry. B calls `PUT` and `DELETE /edit`, `GET /edit?date=`, `POST /assistant/undo`, `POST /agent/cards/[id]`, `DELETE /schedule/[id]` and `POST /agent/stuck` with A's ids: each answers 404 or returns nothing of A's, and all of A's rows are unchanged afterwards.

**5.3 Per route:**

- `/edit`: `GET` validates the date and returns only that day. D1 to D3: invalid bodies give 400 with the reason, an unknown id 404, a valid create 200 with the row (the status stays 200 so the client contract does not change). Every change emits its event with origin `user`.
- `/schedule`: `POST` rejects custom tones (agent only), caps at 30, answers 201 with the id; `GET` shape; `DELETE /schedule/[id]` 204, 404 and 400.
- `/schedule/display`: `null` is allowed, more than 64 characters is not, the display is announced.
- `/agent`: without `since` only the cursor; with it only reaction changes (event id set) that are not undone, in order; only the newest open card.
- `/agent/cards/[id]`: 404 for a resolved card. `/agent/stuck`: unknown reason 400, emits `stuck.pressed` with origin `user`.
- `/assistant`: an `AssistantError` keeps its status, anything else is a 500 with a generic message that leaks nothing. `/assistant/undo`: id validation. `/assistant/speak`: empty text 400, otherwise `audio/wav` with `no-store`. `/assistant/transcribe`: no file 400.
- `/settings`: `saveOpenaiKey` checks the key against a fake `/v1/models` and stores it encrypted (the stored value is not the key and decrypts with the secret and purpose); the layout data never contains the key anywhere, only `hasOpenaiKey`; invalid `saveAgent` and `saveAnchoring` forms give 400 and change nothing; `linkGoogle` without services is 400 and with services redirects to Google with the scopes and `include_granted_scopes`, setting the state cookies; `removeOpenaiKey`, `saveVoice`, `unlinkGoogle`. `/settings/timezone` rejects an invalid zone.
- `/stream`: event stream headers, the first chunks are `retry: 3000` and `hello`, and an abort unsubscribes (`publish` count goes from 1 to 0).
- `/callback`: state mismatch and missing verifier redirect to the error page; declined linking returns to Settings; One Tap with a CSRF mismatch is refused; a verified ID token (fake `tokeninfo`, matching `aud`, verified email) sets the `session` cookie `httpOnly`, `sameSite: lax`, `secure`; a wrong `aud` fails; the code exchange runs against a fake Google token endpoint.
- `/` actions: `logout` revokes the token and deletes both cookies. `/activity` load: shape and limits.

### Phase 6: Client wiring

Compiled runes and fake `fetch`, timers and `EventSource` (Phase 2).

1. `alarms.ts`: rings once per `id@fireAt` whichever path comes first; replays up to 3 times, 30 s apart, until dismissed; dismissing stops the replays; `playsSound` for no display, this device and another device; arming rings alarms from the last 60 s, schedules future ones, ignores older ones and anything beyond the `setTimeout` limit; a failed `loadSchedule` changes nothing; `deviceId` is stable and falls back when storage throws.
2. `agent.ts`: the first poll after a load stays silent, a later new card is spoken once and only on the display device with voice on; the cursor advances; touched days are refreshed once each; the Undo toast reverts newest first; answering a card resolves it and continues in the chat.
3. `assistant.ts`: ignored while busy or empty; error entries are not sent back; a server message becomes an error entry; a network failure shows "Could not reach the server."; `busy` is reset in every case; changes refresh the days and offer Undo; a 409 on undo shows "Already undone".
4. `stream.ts`: each message type reaches its handler; malformed data is ignored; the fallback poll runs only while disconnected and visible; the cleanup closes the source and removes the listener.
5. `index.ts` mutations (D4): fix `updateTask`, `deleteTask` and `createTask` to check the response, restore the previous `tasker` state on failure and show a toast. Tests cover success, a 400 and a network failure for each.

### Phase 7: End to end smoke

Playwright, deliberately small: only what no other layer can see. Specs are named `e2e/*.e2e.ts` and `testMatch` is set to that, because `bun test` would pick up `*.spec.ts` files. Add `e2e` and `playwright.config.ts` to the root tsconfig `include`.

**Setup.** `webServer` builds and starts the app with test values for the static env (`GOOGLE_CLIENT_SECRET=e2e-secret`, `DATABASE_URL=./e2e/e2e.db`, a dummy client id, port 4173). The global setup creates the schema, seeds a user with timezone `Europe/Berlin` and three tasks for the real current date in Berlin: missed (09:00 to 09:30), current (11:30 to 12:30) and next (13:00 to 13:30). The browser context uses `timezoneId: 'Europe/Berlin'`, a `session` cookie minted with `signSession` (3.2), `setupDone` in localStorage, and `page.clock.install()` at 12:00 Berlin on that date. Seeding on the real date keeps the server's preload window (from yesterday in UTC) correct at any hour, and the fixed browser clock makes the hero deterministic. If the build did not pick up the test secret, the first spec fails at once, so the setup verifies itself. Note: the e2e build overwrites the local `build/`, which is only a local artifact.

**Specs:**

1. Now shows the current task without any tap: hero title, the next task in the rail, the missed strip.
2. Done gives feedback and is undoable: Done moves the hero on and shows the Undo toast; Undo brings the task back; after a reload the screen matches (catches the D4 class).
3. Quick add on Plan: "Call mom at 14:00 for 30m" lands at 14:00 and survives a reload.
4. Logged out: `/` shows the login and no task data; `/edit?date=` answers 401.
5. Hydration smoke: `/`, `/edit`, `/alarms`, `/activity`, `/settings`, `/privacy` and `/terms` load with no console error and no failed request.
6. Accessibility: `@axe-core/playwright` on Now in light and dark reports no serious or critical violation, which guards the WCAG AA contrast goal of the urgency colors.

**NixOS.** Browsers downloaded by Playwright do not run on NixOS. Locally the browsers come from nixpkgs `playwright-driver.browsers` through a project `flake.nix` dev shell, loaded by `.envrc` with `use flake` (add `!.envrc` to `.gitignore`), which sets `PLAYWRIGHT_BROWSERS_PATH` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`. `@playwright/test` must be pinned to the exact version of nixpkgs' `playwright-driver`; bump both together. The e2e run is not part of `verify` (it needs browsers and takes 30 to 60 s): it runs in CI on every push and locally with `bun run test:e2e`.

### Phase 8: CI and dependencies

**8.1** Update dependencies within their ranges (`bun update`), run `bun run verify`, commit separately. The current advisories are all in tooling (brace-expansion, flatted, nanoid, postcss, source-map-js, and a Windows-only Vite issue), none in code that serves requests.

**8.2** `.github/workflows/ci.yml` (add `!.github` to `.gitignore`, G10). On push and pull request, with concurrency that cancels older runs of the same branch:

- `verify`: `oven-sh/setup-bun@v2` pinned to Bun 1.4.2, `bun install --frozen-lockfile`, a `.env` with dummy values for the static env, `bun run verify`.
- `e2e` (after `verify`): `bun x playwright install --with-deps chromium`, `bun run test:e2e`, upload the Playwright report when it fails.
- `audit`: `bun audit --audit-level=high` as a non-blocking step on pushes, and as its own weekly scheduled run, which fails visibly when a new high advisory appears.

## 6. Coverage policy

- `verify` runs with `--coverage` and the thresholds in `bunfig.toml`. Start at 0.90 for lines and functions once Phase 4 is in, then raise to the measured value rounded down to whole percent after Phase 6 (expected around 0.95). Never lower it without a reason in the commit message.
- Coverage only sees imported files; the pairing rule (1.5.3) covers the rest.
- Coverage is a floor, not the goal. The goal is the promise table in section 1.

## 7. How to write tests here

These go into `CLAUDE.md` under a new Tests section.

- Next to the code as `name.test.ts`; route tests next to the route without the `+` prefix; helpers in `src/test/`, imported as `#test/...`; e2e in `e2e/*.e2e.ts`.
- `describe` names the unit, `test` states the behavior as a sentence, in the existing style ("window is start inclusive and end exclusive").
- Import through `#lib`. Keep the `/// <reference types="bun" />` header (adding Bun's types to the root tsconfig would leak them into client code).
- No network: fakes only, the preload enforces it.
- No wall clock or machine timezone: `setSystemTime`, fake timers or explicit `now`. The gate runs three timezones.
- Database tests start with `resetDb()`, build data with the fixtures and assert on rows.
- One behavior per test, tables for matrices.
- Prompts: assert the facts that matter (the plan lines are present, user data is declared as data, the autonomy sentence matches the setting), never the full text.
- A bug fix starts with a failing test, in its own commit before the fix.

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
| A committed schema snapshot         | Deploy already diffs `schema.ts` against the server's commit; making that fatal (1.7) guards the actual risk                                                                                                                                                      |

## 9. Docs and config to update

- `CLAUDE.md`: Commands (`verify`, `verify --quick`, `test:e2e`), "Run `bun run verify --quick` before committing", the Tests section from section 7, the deploy gate, foreign keys on.
- `README.md`: commands and the blame ignore note.
- `scripts/deploy.ts` header: `--skip-check` now skips `verify`, the new `--schema-applied`.
- `/privacy`: no change needed once D8 is fixed, because deletion then does what the page says.

## 10. Order and definition of done

| Phase                 | Commits                                               | Effort   | Exit criterion                                                    |
| --------------------- | ----------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| 0 Green baseline      | 3 to 4                                                | 1 to 2 h | `bun run lint` and `bun run check` pass, zero warnings            |
| 1 Static checks       | 6 to 8                                                | 3 h      | `bun run verify` exists and is green, deploy uses it              |
| 2 Infrastructure      | 3                                                     | 3 h      | One example test per helper passes under `--isolate --randomize`  |
| 3 Pure modules        | one per module                                        | 4 h      | Pairing allowlist down to its end state, D1 and D5 helpers tested |
| 4 Server integration  | one per module, plus test and fix pairs for D6 and D8 | 1.5 days | Every guardrail proven silent without a model call                |
| 5 Route contracts     | 4 to 6, plus D1 to D3 fixes                           | 1 day    | Login and ownership matrices cover every route                    |
| 6 Client wiring       | one per module, plus the D4 fix                       | 4 h      | Coverage threshold raised to the measured floor                   |
| 7 E2E smoke           | 3                                                     | 4 h      | Six specs green locally (Nix shell) and in CI                     |
| 8 CI and dependencies | 2                                                     | 2 h      | CI green on `master`, audit job scheduled                         |

Phases 0 to 2 are the foundation and go in order. After that, 3 to 6 can be done in any order; 4 and 5 carry the most value and fix the high severity defects. 7 and 8 come last.

**Done when:**

1. `bun run verify` is green locally and in CI, and deploy refuses to ship without it.
2. Every project rule in Phase 1.5 fails the gate when broken.
3. D1 to D8 each have a test that failed before its fix.
4. Every guardrail has a test proving the model is never called when it should be silent.
5. Every route is in the login matrix, and every route that takes an id is in the ownership matrix.
6. The suite passes in three timezones, isolated and in random order, in under 3 s.

## 11. Evidence

What was run on 2026-10-14 to ground this plan (throwaway files in the session scratchpad, nothing in the repo changed):

- All existing checks with timings (section 2), the suite under five timezones and with `--isolate --randomize`, and Bun honoring `TZ` (`getTimezoneOffset` changes as expected).
- A Bun preload plugin with virtual `$app/env*` modules let `bun test` import `server/db`, `server/events`, `server/session`, `routes/edit/+server.ts` and `hooks.server.ts`. `drizzle-kit/api` built the full schema in memory (9 statements, about 0.3 s). `emit` deduped by key, and `readSession(createSession(...))` round-tripped.
- Calling `POST /edit` directly stored a midnight-crossing, priority 9 task (D1), a missing title gave the raw constraint error (D2), and `PUT` with an unknown id answered `200 true` (D3).
- Compiling `app.svelte.ts` with `compileModule` in an `onLoad` hook made `tasker` and `alarms.ts` testable (ring dedupe and `playsSound` asserted). The plugin also works under `--isolate`.
- `coverageThreshold` in `bunfig.toml` fails the run with exit code 1. `jest.useFakeTimers()` and `advanceTimersByTime()` work. `PRAGMA foreign_keys` is 0 in `bun:sqlite` (D8). Module state is shared across test files without `--isolate`.
- `drizzle-kit export` accepted `schema.ts` with `#lib` imports. A type-aware ESLint probe found 17 floating and 10 misused promises in about 3 s more lint time. TypeScript rejects the agent's `outcome` without its initializer (TS2454).
