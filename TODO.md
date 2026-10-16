# ADHD Tasker - TODO

Plans in `docs/`:

- `roadmap-1.0.md`: scope, scorecard and milestones to 1.0
- `checks-and-tests-plan.md`, `feature-ideas.md`: next, re-read against the new code
- Finished and deleted (git history): the local first plan (`docs/local-first-plan.md` at `a419224`), the UX plan (`docs/ux-plan.md` at `24192b1`) and the daylight theme (`docs/daylight-theme.md` at `56be755`)

## Now

- Recurring tasks, planned for 1.0 (`docs/roadmap-1.0.md` C1): sleep, food, water, hygiene by cadence, with a floor the AI cannot trade below without asking. Today only alarms repeat, tasks do not. Once they exist, build the sample day and the first run essentials (E6) from them: the routine in `src/lib/core/sample.ts` is the template, today it is 7 days of plain tasks
- Pick the next plan. Suggested by the checks plan: its phases 4 and 5 (core guardrails, route matrices)
- Visual pass, by eye on a wide screen, a phone and as a guest (the UX plan was built from code, not screenshots): one type scale (display, clock, body large, body, small, no one-off sizes), a visible focus ring on every interactive element including timeline blocks and rail items, 44 px targets on phones (rail buttons at `size="sm"`, the timeline done circle), sentence case and no jargon in copy, same section spacing on every page, the page title in the bar
- Production schema deploy of the UX settings fields (`myDayStart`, `myDayEnd`, `checkInMinutes`): `bun run deploy --db-push`

- Google Calendar, real run: import, move, done and a forced conflict on a real calendar, by hand (only fakes so far)
- Google verification (`docs/google-verification.md`): remove Tasks and Keep from `GOOGLE_SERVICES` first, record the demo video, submit
- Deploy the local first work: on the server run `add-calendar-sync.ts`, `add-calendar-write.ts` and `add-google-tokens.ts` with `DATABASE_URL=<server db>`, then `bun run deploy --schema-applied`. The consent screen must allow the Calendar scope
- Privacy page: check each statement against the code, and state nginx's real IP logging and retention
- Component test for the Calendar write select in Settings, and a test for the stream `calendar` hint in `src/lib/stream.ts`

## Later

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
