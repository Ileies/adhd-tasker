# Refactor Plan: DX, modularity, token weight

Status: steps 1 and 2 done (2026-10-19), step 3 next. Decisions are settled (section 6). Analysis measured on `c844ca2` (548 tracked files), before any step.

Goal: someone cloning the repo understands the app fast, and an agent finds what it needs by name and reads
little. Behavior does not change. Every step keeps `bun run verify --quick` green and is its own commit.

## 1. What the analysis found

Baseline: 21.1k lines of TypeScript, 8.9k lines of Svelte (without shadcn), 28.8k lines of tests, 93 shadcn files.

The last column shows what steps 1 and 2 have already resolved.

| Problem                             | Evidence                                                                                                                                                                                                                                | Why it hurts                                                             | Status                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Flat `src/lib`                      | 80 modules plus 70 tests side by side in one folder, no grouping                                                                                                                                                                        | Nothing says which files belong together, `ls` is 150 lines              | open (step 3)                                            |
| Same name in several layers         | `flow`, `agent`, `assistant`, `calendar`, `schedule`, `plan`, `todos`, `events`, `activity`, `openai-key` exist in `lib/` and `core/` (some also in `server/`)                                                                          | Search for "flow" returns two files, the role is only in the folder      | open (step 3)                                            |
| Files over 300 lines                | 26 source files, 27 test files (see P2 and P5)                                                                                                                                                                                          | Reading one concern costs the whole file                                 | open (steps 4 to 6)                                      |
| One giant function                  | `flow()` in `flow.ts` is 480 lines (256 to 737), `dbRepo` 471, `localRepo` 406, `localBackend` 284                                                                                                                                      | Cannot be understood or tested in parts                                  | open (step 4)                                            |
| Route boilerplate                   | 37 copies of `if (!locals.user) error(401, ...)` in 24 files, 18 copies of the `AssistantError` catch, 21 copies of `request.json().catch(...)`, `todos/+server.ts` already defines a local `answering` helper that others re-implement | 30 `+server.ts` files of 6 to 25 lines that differ only in the core call | done (step 2, `handler()`)                               |
| Grab-bag `lib/index.ts`             | Is the sound player (`playSound`, `playTone`, `startRinging`) plus re-exports of toast and tasks                                                                                                                                        | The name says nothing, `#lib` imports hide what is used                  | open (step 3, the `addQuickTask` re-export is gone)      |
| Parallel input and form modules     | `task-input`, `todo-input`, `routine-input` (parsers) and `taskform`, `todoform`, `routineform` (form state), `quick*` (4 files) all repeat the same parse, limit and patch shape                                                       | Three places to change for one field                                     | open (step 5)                                            |
| Dead code                           | 54 unused exports and 14 unused exported types (almost all needlessly exported, not dead), `OptionSelect.svelte`, 5 unused shadcn components, unused `Reminder` type, two different types both named `Clash`                            | Noise for readers and for grep                                           | done (step 1), `knip` now guards it                      |
| One-off migration scripts           | 23 `scripts/add-*.ts`, 17 to 59 lines each, identical skeleton. `db:push` and `deploy --db-push` replace them                                                                                                                           | 23 files for 5 lines of idea each                                        | done (step 1), one data migration still to check (see 7) |
| Tracked IDE config                  | `.idea/` had 10 tracked files                                                                                                                                                                                                           | Not source, pollutes diffs                                               | done (step 1)                                            |
| Big components mix logic and markup | `NowHero` 861 (script 245), `DayTimeline` 675 (script 396, drag logic), `routes/+page.svelte` 655 (script 561, 52 handlers), `routes/edit/+page.svelte` 579 (script 296), `+layout.svelte` 315 (9 effects)                              | Rule says logic goes in pure modules, these hold it in the component     | open (step 5)                                            |
| Comment weight                      | 2,881 comment lines in non-test source, densest in `flow.ts` (122), `core/repo.ts` (86), `struggle.ts` (70), `+page.svelte` (63)                                                                                                        | Many restate the code, each costs tokens on every read                   | open (trimmed while each file is split)                  |

Not a problem: exact duplicated blocks are low (1.18 %, jscpd), almost all in migration scripts and route wrappers.
So the work is structure and naming, not copy-paste removal. The `core/` boundary (rules shared by server and
device, run against a `Repo`) is sound and stays.

## 2. Target shape

### Folder layout

`core/`, `server/`, `local/`, `components/` stay. The 80 flat modules move into domain folders, and each domain
folder owns its tests. A grep for "flow" then lands in `flow/`, and the role is in the file name, not the folder.

```
src/lib/
  app/        app.svelte.ts, backend.ts, remote-backend.ts, settings.ts, stream.ts, toast.ts, errors.ts, nav.ts, offline.ts, mode.ts, flags.ts
  time/       time.ts, dates.ts, format.ts, sun.ts, dayline.ts
  plan/       plan.ts, placeday.ts, move.ts, capacity.ts, priority.ts, urgency.ts, rail.ts, recurrence.ts, routines.ts, breaks.ts, tasks.ts
  todos/      todos.ts, pick.ts, prep.ts, prepare.ts, struggle.ts, checks.ts, todo-input, todoform
  flow/       flow engine split by stage (section 4), anchoring.ts
  quick/      quickadd.ts, quickroutine.ts, quickalarm.ts, quickhelp.ts
  alarms/     alarms.ts, alarmview.ts, schedule.ts, silence.ts, mute.ts, custom-sounds.ts, sounds.ts
  sound/      audio.ts, tones.ts, play.ts (from index.ts), speech.ts, voice.ts
  assistant/  assistant.ts, agent.ts, guardrails.ts, openai.ts, openai-key.ts, tools/ (split in P2)
  core/ server/ local/ components/ ui/(shadcn)
```

This grouping is a proposal. Step 3 produces the final mapping from the import graph (what imports what), so
a module lands next to its heaviest user and no folder cycle appears. Target: no folder above 25 files, no
flat module left in `src/lib/`.

### Naming rules (added to `CLAUDE.md` in step 3)

- A file name says its role. The same base name never appears in two folders. Where a client wrapper and a core
  rule share a topic, the client file gets the role suffix: `flow/engine.ts` and `core/flow.ts`, `app/todos-actions.ts`
  and `core/todos.ts`, `assistant/chat.ts` and `core/assistant.ts`.
- `#lib` (the `index.ts` re-export) is removed. Import from the module, so the origin of a symbol is visible.
  The one `knip` hint left (`package.json` `#lib` points at a `.js` file that does not exist) goes with it.
- Constants are exported only when another file or a test uses them (applied in step 1, `knip` enforces it).

### Size rules, enforced

- 300 lines per source file, 400 per test file. Add a test to `src/test/architecture.test.ts` with a
  `LONG: Record<string, reason>` allowlist, the same pattern as `UNTESTED`. The list starts with the files that
  cannot be split cheaply yet and each entry needs a reason, the list may only shrink.
- Minimum size: a module under about 25 lines is merged into its nearest sibling unless it is a route,
  a config or a barrel needed by tooling.
- Comment rule: keep a comment when it states a reason, a contract, a unit or a trap. Delete a comment that
  restates the next line or the function name. Doc comments on exported functions stay one line.

## 3. Work packages

Order is by risk and payoff. Each package is one or a few commits, verify between each.

**P0. Guardrails and hygiene** (done, `6d2ec90` to `33a4826`)

1. `.idea/` untracked. The `.*` rule in `.gitignore` already covered it, so no ignore change was needed.
2. 23 `scripts/add-*.ts` migrations deleted (history keeps them), `CLAUDE.md` now points at `deploy --db-push` only.
3. `OptionSelect.svelte` and the shadcn alert, badge, label, progress and select components deleted.
   `src/env.ts` stays, SvelteKit reads it.
4. About 85 module-private constants and types lost their `export` (`knip` list). Truly dead and removed:
   `chooseDisplay`, the `addQuickTask` re-export, the `Reminder` type, `DEFAULT_QUIET`, `ChosenSource`,
   `SCHEDULE_KINDS` (now a union type), an unused import. The rest of the symbols named in the first plan
   (`createAlarm`, `describeCounts`, `agentSettings`, `canRecord`, `soundLimits`, `parseCustomTone`, `reopenWelcome`,
   `candidatesFor`, `isFlowType`, `FLOW_TYPES`) were only exported needlessly and are used, so they stayed.
   The two `Clash` types are different types, renamed `EventClash` and `PlanClash`. The unused test helpers
   (`DAY`, `DAY_START_MS`, `SETTINGS`, `FakeWebSocket`) lost their `export`.
5. `knip` added as a devDependency with `knip.json` and a `knip` script, run as the `unused code` step of the
   full `bun run verify`. It ignores `drizzle.config.ts` (read by `drizzle-kit`) and the generated
   `src/lib/components/ui/**`, and treats `src/env.ts` as an entry.

**P1. Route and API boilerplate** (done, `8089441` to `252eec7`)

1. `handler(work, { failure? })` in `src/lib/server/route.ts` (with `route.test.ts`): answers 401 to a guest, builds
   `ctx` on first use, gives the work `user`, `json(fallback)`, `url`, `params`, `cookies`, `request` and
   `getClientAddress`, and maps `AssistantError` to an HTTP error. With `failure` set, other errors are logged and
   answered as 500.
2. All authenticated routes converted, the local `answering` and `readBody` copies are gone. Routes went from
   1018 to 823 lines, 401 sites from 43 to 2 (the helper and `login`), `AssistantError` catches in routes from 15 to 0.
3. Hand-written on purpose: `login` (a guest is the normal caller), `callback` (no user yet), `logout` (must work
   for a stale session).
4. The architecture test requires every `+server.ts` to use `handler` or be listed with a reason. The schedule,
   agent and assistant routes got tests, written against the old code before the conversion.
5. Behavior changes, all at the auth edge: a guest gets 401 before body validation on the calendar routes, the 401
   text on the settings, openai-key, location and timezone routes is now "Login required", `withCalendar` takes
   `{ email }` and no longer checks the login. The 500 path of the four model routes is tested on the helper only
   (parked in `TODO.md`).

**P2. Split the large pure modules** (largest payoff for agents)

| File                                                                 | Lines              | Split                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistant-tools.ts`                                                 | 870                | `parse.ts` (primitives), `tasks.ts`, `todos.ts`, `routines.ts`, `prep.ts`, `definitions.ts` (JSON schemas), `index.ts` is NOT recreated, callers import the part they need. The 300-line `DEFINITIONS` array moves with its parsers per domain so a tool lives in one file |
| `flow.ts`                                                            | 836                | See section 4, `flow()` is 480 lines                                                                                                                                                                                                                                       |
| `core/export.ts`                                                     | 630                | `export-shape.ts` (types, version), `export-build.ts`, `export-parse.ts` (`parseExport` 98 lines), `export-import.ts` (`importExport` 89 lines)                                                                                                                            |
| `struggle.ts`                                                        | 417                | by option: options builder, the answer handlers, the limits                                                                                                                                                                                                                |
| `todos.ts` (client)                                                  | 365                | CRUD actions vs flow answers (`answerCheck`, `struggleOn`, `takeBreak`)                                                                                                                                                                                                    |
| `core/calendar.ts`, `server/calendar.ts`                             | 413, 453           | mapping events, clash and preview, sync loop                                                                                                                                                                                                                               |
| `core/repo.ts`                                                       | 402                | The `Repo` interface by area (tasks, todos, routines, flow, agent, schedule, settings), re-composed in one type. 86 comment lines also get trimmed                                                                                                                         |
| `server/db-repo.ts`, `local/repo.ts`                                 | 507, 457           | One file per area that mirrors the `core/repo.ts` split, `dbRepo` becomes a composition of area factories. The shared `src/test/repo-contract.ts` (829 lines) splits the same way, which keeps both repos honest                                                           |
| `local/backend.ts`, `remote-backend.ts`                              | 370, 326           | Same area split, so adding a `Backend` method touches one area file per implementation (replaces the three-place rule in `CLAUDE.md`, still enforced by `BACKEND_METHODS`)                                                                                                 |
| `server/account.ts`, `core/agent.ts`, `core/assistant.ts`, `plan.ts` | 309, 351, 324, 318 | Small trims, one extraction each, many only need comment and dead code removal to fall under 300. `pick.ts` (296) is fine                                                                                                                                                  |
| `server/db/schema.ts`                                                | 308                | Leave as one file, it is declarative, list in `LONG`                                                                                                                                                                                                                       |

**P3. Collapse the parallel input and form modules**

1. Shared parse primitives in one place (`Parsed`, `fail`, `isWhole`, `parseTime`, `parseDuration`, `parseTitle`, id parsing).
   Today `assistant-tools.ts` owns them and `task-input`, `todo-input`, `routine-input` each re-derive limits and
   id parsers. One `parse.ts`, three small parsers on top.
2. Limits (`ESTIMATE_LIMITS`, `MAX_*`, `SCHEDULE_LIMITS`, `PREP_STEP_LIMITS`, settings limits) live next to the field
   they validate and are used by both the parser and the form, no copies in the UI.
3. `quickadd`, `quickroutine`, `quickalarm`, `quickhelp` share `takeClock`, `takeDate`, `takeRepeat`. Move the
   `take*` token extractors into one `quick/take.ts`, keep one file per entry kind.
4. `taskform`, `todoform`, `routineform`: move clock and number stepping (`stepClock`, `stepNumber`, `parseClock`,
   `parseClockInput`) to `time/` and the chips to the form that shows them.
5. `RoutinesSheet.svelte` has 5 cloned markup blocks (jscpd): extract the repeated field row into a component.

**P4. Components: logic out, markup stays**
Rule: a component script over about 80 lines means logic is in the wrong place.

- `routes/+page.svelte` (655): move the 52 handlers (complete, extend, later, tomorrow, struggle, check, break) into
  `app/now-actions.ts` as plain functions on `tasker`, the page only wires. Same for `routes/edit/+page.svelte`
  (`edit-actions.ts`) and `+layout.svelte` (`useLayoutEffects` in `app/`: wake lock, hide timer, keep awake).
- `NowHero.svelte` (861): split by state it already has (task, todo, check, stuck, break, rest) into
  `hero/` components. `HeroFace`, `HeroCheck`, `HeroMenu` already started this, finish it. Pure parts (`surfaceOf`,
  `choose`) move to `flow/hero.ts`, which already has `heroFromFlow`.
- `DayTimeline.svelte` (675): drag, resize and draw gestures (`begin`, `track`, `finish`, `drawBegin`...)
  move to `plan/gestures.ts` (pure pointer math, tested) and the night toggle, scroll and block markup become
  `TimelineBlock.svelte`, `TimelineDraft.svelte`.
- `TaskForm` (438), `RoutinesSheet` (364), `TodoSheet` (331): extract shared field components (`TimeInput`,
  `NumberInput`, `PresetChips`, `SegmentedControl` exist, check what is cloned inline), repeat/date pickers.
- Settings forms (`*Form.svelte`, 12 files of 26 to 180 lines): audit for one shared `SettingRow` / `SettingsSection`.
  Merge the ones under 30 lines (`ClockFormatForm`, `SpeechLanguageForm`, `SyncSettings`, `AccountCard`) into the
  section that renders them, unless reused.
- Tiny shells (`SampleBanner` 21, `PriorityMeter` 23, `QuickAlarmBar` 24, `AlarmBanner` 31, `ErrorPanel` 26):
  keep when reused in 2 or more places, inline otherwise. Decide per file during the step.

**P5. Tests**

- Split every test file over 400 lines along its `describe` blocks: `flow.test.ts` (1673), `core/agent.test.ts` (1053),
  `core/export.test.ts` (745), `local/backend.test.ts` (692), and about 20 more. The split follows the source split,
  so each source file keeps one test file.
- `src/test/repo-contract.ts` splits by area as in P2. `simulate.ts` (263) stays.
- Update `UNTESTED` in `architecture.test.ts` as modules move.

**P6. Docs and navigation (the DX goal itself)**

- `CLAUDE.md`: add a 15 to 20 line "Where things live" map (folder to purpose) and the new naming and size rules.
  Keep the rest, do not grow the file.
- One `README.md` section "Code map" (10 lines) pointing to the folders, so a new reader does not need the tree.
- `docs/`: `checks-and-tests-plan.md` (185), `roadmap-1.0.md` (188) and `feature-ideas.md` (341, see decision 5)
  stay. Drop `flow-plan.md` if the code now says the same (check first).
- No per-folder README files (files for 5 lines). The map lives once, in `CLAUDE.md`.

## 4. The `flow()` function and the flow module

`flow()` (`flow.ts:256-737`) replays the day's `flow_log` and finished items into sessions and picks the current
to-do. It must stay pure and identical on client and server, so this is the highest-risk split and gets its own
steps:

1. Before touching it, run `flow.test.ts` (1673 lines, the net) and add a snapshot-style test only where a
   stage has no direct test.
2. Cut along its stages, in this order, one commit each: collect inputs and answers, build stretches and points,
   assign sessions, derive `current`, build the state returned. Each stage becomes a pure function with explicit
   inputs, under 80 lines, in `flow/` files: `replay.ts`, `sessions.ts`, `current.ts`, `state.ts`, `keys.ts`
   (`pinKey`, `pinStart`, `currentKey`), `hero.ts`, `timing.ts` (`sessionTiming`).
3. The public API (`flow`, `heroFromFlow`, `currentTitle`, `switchLine`, the types) is unchanged, only the
   import path moves.
4. The 122 comment lines in `flow.ts` become: one short comment per stage, the rest deleted or moved to
   `docs/flow-plan.md` if they carry design rationale.

## 5. Order, size and checks

| Step | Packages                                                                       | Rough size           | Risk                                                      |
| ---- | ------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------- |
| 1    | P0 hygiene, knip in verify (done, `6d2ec90` to `33a4826`)                      | small                | none                                                      |
| 2    | P1 route helper (done, `8089441` to `252eec7`)                                 | small                | low, covered by route tests                               |
| 3    | Final folder mapping, then move files (git mv, update imports, no logic edits) | large but mechanical | low, the type check and 3 timezone test runs catch breaks |
| 4    | P2 splits, `flow` last                                                         | large                | medium (flow)                                             |
| 5    | P3 and P4                                                                      | large                | low to medium, UI needs a manual look                     |
| 6    | P5 tests, P6 docs, enable the size test with a shrunken `LONG` list            | medium               | none                                                      |

Per step: `bun run verify --quick`, commit only files touched in the step, `bun run verify` before the last
commit of a package. Moves and edits never share a commit, so `git log --follow` stays useful. Visual checks of
`NowHero`, `DayTimeline`, the edit page and the layout, at most 6 screenshots, only when you ask, as in `CLAUDE.md`.

Expected result (targets, not promises): no source file over 300 lines except a short, reasoned `LONG` list
(schema, generated shadcn), `src/lib` root holds only folders, no module under 25 lines that is not a route or
config, route files 5 to 10 lines of intent, 23 fewer scripts (done), knip and the size test in the gate
(knip done), and a `CLAUDE.md` map that makes a file findable in one lookup.

## 6. Decisions (settled 2026-10-19)

1. **Folder grouping: yes.** Group the flat modules into domain folders (section 2). It touches about 150 files
   of imports, all mechanical, and it removes the 150-entry folder.
2. **Migration scripts: delete all 23** (the first count of 22 was off by one, done). `db:push` and
   `deploy --db-push` replace them. No generic `scripts/sql.ts` escape hatch, a future one-off is written when
   it is needed.
3. **`#lib` index import: dropped.** Import from the module so the origin of a symbol is visible.
4. **Size rule: 300 lines for source, 400 for tests** (tests are long because they list cases).
5. **`docs/feature-ideas.md`: leave as one document.** It is a brainstorm archive, not code, nobody reads it
   to change the app, so splitting it adds files for no gain. The size rule applies to code only.
6. **Scope and order: one step at a time.** Steps 1 and 2 are done, the next step starts only when asked.
   The original idea was steps 1 to 3 first (hygiene, routes, folder move), since they give most of the DX win at
   low risk. Then the splits one module at a time (step 4 onward), `flow` last.

## 7. Open items from steps 1 and 2

- `scripts/add-flow-events.ts` was a data migration that `db:push` does not replace (it updated `users.ai_events`).
  It is in git history at `0721884^`. Check whether production ever ran it, nobody has checked.
- The `reminders` table in `schema.ts` is only used by `src/test/harness.test.ts` (parked in `TODO.md`).
- The 500 path of the four model routes is covered on the `handler` helper only, not per route (parked in `TODO.md`).
- Step 1 was done with a `sed` script for the mechanical `export` removal, against the rule to edit with tool
  calls. The type check and tests passed afterwards. Later steps must use the Edit tool.

## 8. Parked, out of scope

Behavior changes, new features, schema changes, changing the `core/` boundary or the single `tasker` state object.
Anything found on the way that is a bug goes into `TODO.md` as one line.
