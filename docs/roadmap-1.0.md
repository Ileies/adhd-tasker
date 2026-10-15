# Roadmap to 1.0

Status: decided scope, 2026-10-14, updated 2026-10-16 for the local first plan. Progress: **58 of 135 points, 43 %**.

This file owns the definition of 1.0, how progress is measured and the order of the work. It does not replace the detailed plans. Each criterion points to the plan that describes how it is built (`checks-and-tests-plan.md`, `ux-plan.md`, `feature-ideas.md`). When a plan and this file disagree about scope, this file wins. When they disagree about how, the plan wins.

## 1. What 1.0 is

> A person with ADHD, who is not the author, opens the app, with or without an account, plans a day in under five minutes, and from then on the app shows what to do right now on a screen or a phone, and calls them back with sound or a push, without ever being silently wrong. None of it needs an AI key.

Five promises, each one measurable. 1.0 is reached when all five hold:

1. **It never lies.** The screen shows what the server has, the current task is the same on client and server, and a rejected edit rolls back visibly.
2. **It is never silently quiet.** An alarm, a reminder or a task ending always produces a signal. If the signal cannot be made (muted, browser blocks audio, tab closed), the user can see that or gets a push instead.
3. **The hard moments are designed.** A task ending, a task that was missed, running late and being stuck each have a one tap way forward.
4. **It holds a real week.** Recurring tasks, a capture inbox and a defined end of day, so the user does not rebuild the plan every morning.
5. **A stranger can trust it.** Gated deploys, tested guardrails, ownership checks, deletable data, a privacy page that matches reality, and two weeks of real use without a wrong or silent screen.

The principle in `CLAUDE.md` stays the filter: anything that adds cognitive load without an ADHD justification is out, even if it is cheap.

## 2. Scope

### In 1.0

| Pillar          | What                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Core loop    | Now, Plan, priority engine, transitions (time up, wrapping up, more time), feedback, silence line, missed triage, push the rest of the day, overbooked warning |
| B. Reach        | Alarms on every open screen (done), Web Push for alarms, reminders, overrun and wakeups on a closed app, quick timers and snooze                               |
| C. Daily rhythm | Recurring tasks, capture inbox, end-of-day shutdown, actual start and finish recorded                                                                          |
| D. Assistant    | Chat, event agent with guardrails, voice (all done), plus the drawer cleanup. Stays optional                                                                   |
| E. Craft        | UX plan phases 3 to 10 except 8b: navigation, one color ramp, Plan rework, task sheet, settings, secondary pages, first run, accessibility                     |
| F. Trust        | Gate, tests, D1 to D8, server and route tests, e2e smoke, CI, security review                                                                                  |
| H. Local first  | Guest mode on the device, first run, optional account and the move into it, Google Calendar read and write (local first plan, deleted, git history)            |
| G. Launch       | Account deletion and data export, privacy and terms in sync, backup restore drill, uptime check, clean clone setup, dogfood and three outside users            |

### Not in 1.0 (1.1 and later, in this order)

1. **Daylight theme from location** (UX phase 8b). Adds a third party (IP geolocation) and a Privacy page change for a theme. Until then the existing day hours stay under Appearance and the first run default is still "by daylight" with them.
2. **Morning briefing** (`day.started`), **Break it down**, **Leave-by alarms**, **Save your place**, **Estimate learning** (needs the actual times recorded in C4 first).
3. Everything under Parked in `CLAUDE.md` stays parked. Everything in `feature-ideas.md` that is not named here is 1.1 or later.

These cuts are my call and open to veto. The one I would argue hardest to keep out is 8b (privacy surface for a cosmetic gain). Calendar sync moved into 1.0 with the local first plan (H4).

## 3. How progress is measured

- Every criterion has **points** (1 is about half a dev day, 2 about a day, 3 about two days, 5 about a week) and a **proof**: a command, a test or a thing to look at. A criterion counts only when its proof passes, never when "most of it is done".
- Shipped work counts too, scored on the same scale, so the percentage is a share of the whole of 1.0 and not of what is left.
- Progress = points done / 135. Update the checkboxes and the number at the top in the same commit that lands a criterion.
- Remaining estimate: 77 points, about 38 dev days, 8 weeks full time. Re-estimate at each milestone, not in between.

## 4. Scorecard

`[x]` done, `[ ]` open. Source column points to the detailed plan.

### A. Core loop (23 of 29)

| ID  | Criterion                                                                                              | Pts | Proof                                                                     | Source        |     |
| --- | ------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------- | ------------- | --- |
| A1  | Current task derived by `rank()`, same on client and server                                            | 3   | `priority.test.ts` green                                                  | shipped       | x   |
| A2  | Now screen: urgency hero, rail, missed strip, wake lock, fullscreen                                    | 3   | Looks right on a wide screen and a phone                                  | shipped       | x   |
| A3  | Plan: dated days, timeline drag and resize, quick add                                                  | 3   | `plan.test.ts`, `quickadd.test.ts` green                                  | shipped       | x   |
| A4  | Synthesized audio cues                                                                                 | 2   | `tones.test.ts` green, heard                                              | shipped       | x   |
| A5  | Transitions: wrapping up, time up, transition bar, 15 more min, `...` menu, "I'm stuck" action buttons | 5   | `now.test.ts`, `plan.test.ts` green; a task that runs out is never silent | soon plan 4   | x   |
| A6  | Feedback: Done confirmation and sound, draining bar, time in words, tab title                          | 3   | `format.test.ts` green; seen on a real screen                             | soon plan 5   | x   |
| A7  | Silence is visible: muted and audio-blocked line                                                       | 2   | Reload with a blocked context shows "Tap anywhere to turn sound on"       | soon plan 5.3 | x   |
| A8  | Missed triage: one task at a time, Done, Later today, Tomorrow, Drop                                   | 3   | Triage sheet works, each answer has Undo                                  | ux plan 4     |     |
| A9  | Push the rest of the day by 15, 30 or 60 min, with a "did not fit" list                                | 2   | Pure `pushDay()` test incl. midnight edge; Undo restores all              | feature ideas |     |
| A10 | Overbooked day warning on Plan                                                                         | 1   | Pure test; line shows when unfinished minutes exceed time left            | feature ideas |     |
| A11 | "I'm stuck" with fixed hints and agent card                                                            | 2   | `anchoring.test.ts` green                                                 | shipped       | x   |

### B. Reach (4 of 11)

| ID  | Criterion                                                                                        | Pts | Proof                                                                                            | Source    |     |
| --- | ------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------ | --------- | --- |
| B1  | Alarms and wakeups on every open screen, display device, no double ring                          | 3   | Schedule tests green                                                                             | shipped   | x   |
| B2  | Web Push for alarms, reminders, overrun and wakeups on a closed app or phone, opt in, per device | 5   | With the tab closed, an alarm arrives on a phone within 10 s; one push per alarm; revoking works | new       |     |
| B3  | PWA installable                                                                                  | 1   | Lighthouse installable check                                                                     | shipped   | x   |
| B4  | Quick timers (5, 10, 25 min, 1 h) and one snooze per alarm                                       | 2   | Snooze gone on second ring; timer is one tap                                                     | ux plan 8 |     |

### C. Daily rhythm (0 of 13)

| ID  | Criterion                                                                                                                      | Pts | Proof                                                                                                   | Source        |     |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------- | ------------- | --- |
| C1  | Recurring tasks, the core feature: essentials (sleep, meals, water, shower, nails) by cadence. Edit one or all, DST safe, Undo | 5   | Pure `recurrence.test.ts` with property test; a daily task appears on the right days in the user's zone | planned       |     |
| C2  | Capture inbox: `Shift+Space` anywhere, no time, schedule or drop from a list                                                   | 4   | Capture in under 3 s; an inbox item can become a task in two taps; survives reload                      | planned       |     |
| C3  | End-of-day shutdown at day end: what got done, move unfinished to tomorrow or drop in one tap, calm screen                     | 3   | Pure summary test; works without a key                                                                  | planned       |     |
| C4  | `startedAt` and `completedAt` recorded on tasks (schema, no UI)                                                                | 1   | Test; `bun run db:push` applied; set on Done                                                            | feature ideas |     |

### D. Assistant (12 of 14)

| ID  | Criterion                                                                                   | Pts | Proof                                                     | Source       |     |
| --- | ------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------- | ------------ | --- |
| D1  | Chat with plan tools, every write logged and undoable                                       | 3   | `assistant-tools.test.ts` green                           | shipped      | x   |
| D2  | Event agent with guardrails, quiet hours, budget                                            | 5   | `guardrails.test.ts` green                                | shipped      | x   |
| D3  | Push-to-talk and spoken replies                                                             | 3   | `voice.test.ts` green                                     | shipped      | x   |
| D4  | Drawer suggestions, single mic and send button, entry only with a key, Activity restructure | 2   | Seen on a real screen                                     | ux plan 7, 9 |     |
| D5  | Whole app works without a key                                                               | 1   | Server integration test with no key (F4) plus manual pass | shipped      | x   |

### E. Craft (0 of 20)

| ID  | Criterion                                                                                                                                                                   | Pts | Proof                                                                              | Source     |     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------- | ---------- | --- |
| E1  | Navigation: Now/Plan switch, context slot, menu, sound popover with timed mute, shortcuts                                                                                   | 3   | `shortcuts.test.ts` green; every route reachable in two taps                       | ux plan 3  |     |
| E2  | One priority color ramp, page frame, type scale, 44 px targets, sentence case                                                                                               | 3   | No priority color is defined twice (architecture test)                             | ux plan 5  |     |
| E3  | Plan rework: day switcher in bar, live parse preview, 30 min default, drag to create, keyboard blocks, grouped phone list                                                   | 5   | `visibleHours` test; a day can be planned with the keyboard only                   | ux plan 6  |     |
| E4  | Task sheet with chips and priority control, failed save shows a toast                                                                                                       | 2   | Seen on a real screen                                                              | ux plan 7  |     |
| E5  | Settings: auto-save, presets, sections, My day, Google card hidden                                                                                                          | 4   | No Save button except the key; schema applied                                      | ux plan 8  |     |
| E6  | First run: no theme question, essentials intro (sleep, meals, water, shower, nails: pick a time for each, needs planning first, see section 6), one-time second screen hint | 1   | A new account reaches a useful screen after only choosing times for the essentials | ux plan 10 |     |
| E7  | Accessibility: axe has no serious or critical violation on Now in light and dark, everything reachable by keyboard                                                          | 2   | `bun run test:e2e` axe spec green                                                  | ux plan 13 |     |

### F. Trust (8 of 21)

| ID  | Criterion                                                                                                                                               | Pts | Proof                                                                          | Source               |     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------ | -------------------- | --- |
| F1a | Static gate and test infrastructure: type aware lint, architecture rules, preload, fixtures                                                             | 2   | `bun run lint`, `check`, `test` green                                          | soon plan 1.1 to 1.7 | x   |
| F1b | `bun run verify` and a deploy that refuses to ship without it, fatal schema check                                                                       | 1   | `bun run deploy --dry-run` fails on a red tree                                 | soon plan 1.8, 1.9   | x   |
| F2  | Every pure module tested, property tests in place                                                                                                       | 2   | Pairing rule in the architecture test passes with the temporary allowlist only | soon plan 2          | x   |
| F3  | D1 to D8 fixed, each with a test that failed first                                                                                                      | 3   | Test names in the plan resolve; foreign keys on in production                  | soon plan 3          | x   |
| F4  | Server integration: every guardrail proven silent without a model call, schedule never rings twice                                                      | 4   | `server/*.test.ts` green, fake OpenAI fails on any unexpected request          | checks plan 4        |     |
| F5  | Route contracts: login matrix and ownership matrix cover every route                                                                                    | 3   | Route coverage rule in the architecture test passes                            | checks plan 5        |     |
| F6  | Client wiring tests, coverage threshold raised to the measured floor                                                                                    | 1   | `verify` green at the new threshold                                            | checks plan 6        |     |
| F7  | E2E smoke: six specs                                                                                                                                    | 2   | `bun run test:e2e` green locally and in CI                                     | checks plan 7        |     |
| F8  | CI on every push, dependencies updated, weekly audit                                                                                                    | 1   | CI green on `master`                                                           | checks plan 8        |     |
| F9  | Security pass: `/security-review`, response headers (CSP, frame, referrer), rate limits on every route that costs money or writes, session cookie flags | 2   | Review findings closed or written down with a reason                           | new                  |     |

### G. Launch (0 of 10)

| ID  | Criterion                                                                                                                 | Pts | Proof                                                                                                      | Source |     |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------- | ------ | --- |
| G1  | Delete account and export my data (JSON) from Settings, matching what `/privacy` promises                                 | 2   | Test: deleting a user leaves no row anywhere; export contains every table that holds their data            | new    |     |
| G2  | `/privacy` and `/terms` re-read against the final data handling (push subscriptions, recurring, inbox, new fields)        | 1   | Checklist in the commit, every new field and third party named                                             | new    |     |
| G3  | Backup restore drill: restore the last deploy backup into a scratch DB and open the app on it. Uptime check with an alert | 2   | Written steps that worked once; an alert reaches the author when the site is down                          | new    |     |
| G4  | A clean clone runs from README and `.env.example` alone                                                                   | 1   | Fresh clone, follow the README, reach the sign-in page                                                     | new    |     |
| G5  | Dogfood: the author uses it as the only planner for 14 days, then three outside users for 7 days                          | 3   | At most one incident in the 14 days where the screen was wrong or silent, no blocking issue from the three | new    |     |
| G6  | Docs match the code: `CLAUDE.md`, `README.md` rewritten, finished plans deleted, `TODO.md` empty of 1.0 items             | 1   | `grep` for removed concepts finds nothing                                                                  | new    |     |

### H. Local first (11 of 17)

| ID  | Criterion                                                                                                                                          | Pts | Proof                                                                                  | Source                  |     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- | ----------------------- | --- |
| H1  | Guest mode: the plan, alarms, settings and key on the device, the agent tick in a leading tab, export, import and delete                           | 5   | Contract suite on both repos; a guest turn sends nothing to this origin                | local first plan 1 to 3 | x   |
| H2  | First run without a question: welcome, sample day, empty day, second screen hint, `/about`                                                         | 2   | `sample.test.ts`, `flags` tests green; seen on a real screen                           | local first plan 4      | x   |
| H3  | Optional account: Google's script on demand, the move into the account with Undo, snapshots, sign out, export and delete                           | 4   | `account.test.ts`, `merge.test.ts` green                                               | local first plan 5      | x   |
| H4  | Google Calendar read and write (preview, import, sync, patch guarded by etag, optional own events), Google verification, tried against real Google | 6   | A real calendar: import, move, done and conflict by hand; Google verification approved | local first plan 6      |     |

Totals: A 29, B 11, C 13, D 14, E 20, F 21, G 10, H 17 = 135. Done: A 23, B 4, D 12, F 8, H 11 = 58.

## 5. Milestones

Order follows the dependencies: the gate before anything that mutates data (D1 before "15 more min"), untouched-by-UI tests before UI work, Plan before recurring, alarms cleanup before push.

| #   | Milestone  | Contains                                                | Points | Cumulative  | Exit                                                                                             |
| --- | ---------- | ------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------ |
| 0   | Baseline   | What exists today                                       | 58     | 58 (43 %)   | Now                                                                                              |
| 1   | **Solid**  | C4, F4, F5 (the rest is done)                           | 8      | 66 (49 %)   | `verify` gates deploy. A task that runs out is never silent. Every guardrail and route is tested |
| 2   | **Calm**   | E1, A8, E2, E3, E4, E5, B4, D4, E6, E7, then F6, F7, F8 | 31     | 97 (72 %)   | Every screen reworked, CI and e2e green. Nothing below this line changes the existing screens    |
| 3   | **Rhythm** | C1, C2, C3, A9, A10                                     | 15     | 112 (83 %)  | A real week can be planned once. Day has a defined end                                           |
| 4   | **Reach**  | B2                                                      | 5      | 117 (87 %)  | The anchor works with the tab closed                                                             |
| 5   | **Launch** | H4, F9, G1, G2, G3, G4, G6, G5                          | 18     | 135 (100 %) | The five promises in section 1 hold. Tag `v1.0.0`                                                |

Notes on the order:

- **Solid first** because everything after it relies on its gate, which is built (`soon-plan.md` was finished and deleted on 2026-10-14, see git history). F4 and F5 do not depend on the UX work, so they go here, while F6 and F7 touch screens the UX phases rewrite and go at the end of Calm.
- **C4 in Solid** because the data only exists from the day it starts being recorded, and it costs one column. Estimate learning in 1.1 will thank it.
- **Calm before Rhythm** because recurring tasks and the inbox change Plan and Now, and doing them on top of a rework avoids doing them twice.
- **Web Push late** because it needs the alarm page cleaned up (B4) and a settled Privacy page, and because the always-on second screen, the main use case, already works without it. It is still in 1.0 because "an alarm is never silent" is a promise.
- **Dogfood starts at the end of Rhythm**, in parallel with Reach and the Launch items. Running the real plan from Rhythm on is what finds the incidents, so G5's 14 days are the critical path of the whole release. Start the clock as early as the app can carry the author's real week.

## 6. Risks and open decisions

| Risk or question                                                                                                                      | Plan                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web Push on iOS needs an installed PWA and has quirks. The in-process SSE design also assumes a single server                         | Build for the author's devices first. State plainly in Settings which platforms get push. The single process stays, no queue needed    |
| Recurring tasks conflict with "a task belongs to one `task.date`". Materialize or compute?                                            | Decide at the start of C1. Leaning to materialize rows ahead (14 days) so `rank()` and every other module stay untouched               |
| Essentials usually beat other tasks but not always (one less hour of sleep for the only exam hour)                                    | Decide at the start of C1: each essential has a floor, numbers decide small trades, the user is asked for anything below the floor     |
| First run asks for the essentials and their times (E6). Not planned yet: which items, defaults, skippable or required, how it fits C1 | Plan it before E6 and C1 start, together, since the intro creates the recurring tasks. E6 points will grow                             |
| `CLAUDE.md` says no stat tiles. The "3 done today" line is an exception already agreed in the UX plan                                 | Write the exception into `CLAUDE.md` in UX phase 4                                                                                     |
| Scope creep from `feature-ideas.md`. Many ideas rate 9 out of 10                                                                      | Nothing joins 1.0 without a new row in section 4 with points and a proof, and without removing points of equal size or moving the date |
| The estimate is mine, not measured. UX phases have no estimate in their own plan                                                      | Re-estimate at each milestone. A phase that took twice the points is recorded here so the next estimate is honest                      |
| 8b removed from 1.0 against decision 5 in the UX plan                                                                                 | Revisit when Calm ends. If wanted, it is 4 points and replaces nothing                                                                 |

## 7. Next actions

1. Local first plan: parts 1 to 6 are built (scored as H). Open: the real Google run, the Google verification (`google-verification.md`), the check of E6 against the new welcome flow. Then re-read `ux-plan.md`, `checks-and-tests-plan.md` and `feature-ideas.md` against the code (checks plan phase 4 was waiting for the storage seam, which now exists).
2. C4 (`startedAt` and `completedAt`, one column), then server integration and route contracts (checks plan 4 and 5). That closes Solid.

The soon plan (gate, pure tests, D1 to D8, transitions, feedback and silence) is finished and deleted. The other plans were re-read against the code on 2026-10-14, and each says at its top what changed.
