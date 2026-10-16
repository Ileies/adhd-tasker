# ADHD Tasker - TODO

Plans in `docs/`:

- `roadmap-1.0.md`: scope, scorecard and milestones to 1.0
- `flow-plan.md`: accepted, phases 1 to 4 built (to-dos, the flow engine, the Now and Plan screens on it, the check, Away and the calls, rotation, breaks and holding on, appointments with travel and preparation). Next: phase 5 (tasks at a time make room and repeat). To-dos without a time, a flow engine that decides, holds and calls back, appointments with preparation, routines that make room
- `checks-and-tests-plan.md`, `feature-ideas.md`: next, re-read against the new code
- Finished and deleted (git history): the local first plan (`docs/local-first-plan.md` at `a419224`), the UX plan (`docs/ux-plan.md` at `24192b1`) and the daylight theme (`docs/daylight-theme.md` at `56be755`)

## Now

- Routines exist now (flow plan 5.2, `docs/roadmap-1.0.md` C1). Still open: build the sample day and the first run essentials (E6) from them (flow plan 5.3, `src/lib/core/sample.ts` is 7 days of plain tasks today), and a floor the AI cannot trade below without asking for sleep, food and water (phase 6)
- Pick the next plan. Suggested by the checks plan: its phases 4 and 5 (core guardrails, route matrices)
- Visual pass, by eye on a wide screen, a phone and as a guest (the UX plan was built from code, not screenshots): one type scale (display, clock, body large, body, small, no one-off sizes), a visible focus ring on every interactive element including timeline blocks and rail items, 44 px targets on phones (rail buttons at `size="sm"`, the timeline done circle), sentence case and no jargon in copy, same section spacing on every page, the page title in the bar
- Deploy phases 1 to 5 of the flow plan (to-dos, the flow log, the check, rotation and breaks, appointments, tasks that make room, routines): on the server run `DATABASE_URL=<server db> bun scripts/add-todos.ts`, `bun scripts/add-flow-settings.ts`, `bun scripts/add-appointments.ts`, `bun scripts/add-shift.ts` and `bun scripts/add-routines.ts` the same way (they add `check_minutes`, `start_work_at`, `break_minutes`, `todos.skip_since`, `tasks.kind`, `tasks.parent_id`, `arrive_early_minutes`, `tasks.shift`, `tasks.routine_id` and the `routines` table), then `bun run deploy --schema-applied`. The server (`ssh home`) was not reachable from the dev machine on 2026-10-16
- Production schema deploy of the UX settings fields (`myDayStart`, `myDayEnd`, `checkInMinutes`): `bun run deploy --db-push`

- Google Calendar, real run: import, move, done and a forced conflict on a real calendar, by hand (only fakes so far)
- Google verification (`docs/google-verification.md`): remove Tasks and Keep from `GOOGLE_SERVICES` first, record the demo video, submit
- Deploy the local first work: on the server run `add-calendar-sync.ts`, `add-calendar-write.ts` and `add-google-tokens.ts` with `DATABASE_URL=<server db>`, then `bun run deploy --schema-applied`. The consent screen must allow the Calendar scope
- Privacy page: check each statement against the code, and state nginx's real IP logging and retention
- Component test for the Calendar write select in Settings, and a test for the stream `calendar` hint in `src/lib/stream.ts`

## Later

- Travel for imported appointments is only added through the prep sheet or "Prepare for it" in the task sheet, nothing offers it on its own until the assistant answers `appointment.added` (flow plan phase 6). "Leave now" rings only on an open page: with Web Push (B2) the start of travel can be a real alarm
- Travel and preparation are not written to Google Calendar yet (the setting "Add my own tasks" covers tasks the user made, not travel)

- Calendar write gaps: assistant and agent edits are not written to Google, Google-side edits to an event the app made do not flow back, existing tasks are not copied when "Add my own tasks" is turned on, stopping the sync also ends that setting, read-only (midnight) tasks are not marked in the UI, the unlink case `revoked: false` has no UI
- Google verification and a real Google run of Calendar (`docs/google-verification.md`), then assistant edits written to Google
- Capture inbox (`Shift+Space`)
- End-of-day summary
- Morning briefing (`day.started` event)
- Mark agent-made tasks in the Plan view (a small marker on timeline blocks)
- Plan: a calendar grid in the day switcher popover
- Productivity rating for the day so far (next to the "done today" line). Needs a fair measure of the day's load, including load the app cannot see, before it can be honest

## Parked

- Adaptive behavior model, Crisis Mode, anti-context-switch scheduler, deeper AI
