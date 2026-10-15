# ADHD Tasker - TODO

Plans in `docs/`:

- `roadmap-1.0.md`: scope, scorecard and milestones to 1.0
- `ux-plan.md`, `checks-and-tests-plan.md`, `feature-ideas.md`: next, re-read against the new code (the local first plan is finished and deleted, git history: `docs/local-first-plan.md` at `a419224`)

## Now

- Pick the next plan: the three plans are re-read. UX phase 3 (navigation) is built, phases 4 to 9 are open in `docs/ux-plan.md`. Suggested by the checks plan: its phases 4 and 5 (core guardrails, route matrices)

- Google Calendar, real run: import, move, done and a forced conflict on a real calendar, by hand (only fakes so far)
- Google verification (`docs/google-verification.md`): remove Tasks and Keep from `GOOGLE_SERVICES` first, record the demo video, submit
- Deploy the local first work: on the server run `add-calendar-sync.ts`, `add-calendar-write.ts` and `add-google-tokens.ts` with `DATABASE_URL=<server db>`, then `bun run deploy --schema-applied`. The consent screen must allow the Calendar scope
- Privacy page: check each statement against the code, and state nginx's real IP logging and retention
- Component test for the Calendar write select in Settings, and a test for the stream `calendar` hint in `src/lib/stream.ts`

## Later

- Calendar write gaps: assistant and agent edits are not written to Google, Google-side edits to an event the app made do not flow back, existing tasks are not copied when "Add my own tasks" is turned on, stopping the sync also ends that setting, read-only (midnight) tasks are not marked in the UI, the unlink case `revoked: false` has no UI
- Google verification and a real Google run of Calendar (`docs/google-verification.md`), then assistant edits written to Google
- Recurring tasks (core: sleep, food, water, hygiene by cadence, with a floor the AI cannot trade below without asking)
- Capture inbox (`Shift+Space`)
- End-of-day summary
- Morning briefing (`day.started` event)
- Mark agent-made tasks in the Plan view
- Productivity rating for the day so far (next to the "done today" line). Needs a fair measure of the day's load, including load the app cannot see, before it can be honest

## Parked

- Adaptive behavior model, Crisis Mode, anti-context-switch scheduler, deeper AI
