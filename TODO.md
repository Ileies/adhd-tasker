# ADHD Tasker - TODO

Plans in `docs/`:

- `roadmap-1.0.md`: scope, scorecard and milestones to 1.0
- `flow-plan.md`: built (phases 1 to 8), short form with what was done, what differs from the plan and what is still open
- `checks-and-tests-plan.md`, `feature-ideas.md`: next, re-read against the new code
- Finished and deleted (git history): the local first plan (`docs/local-first-plan.md` at `a419224`), the UX plan (`docs/ux-plan.md` at `24192b1`) and the daylight theme (`docs/daylight-theme.md` at `56be755`)

## Now

- Tag `docs/roadmap-1.0.md` (pillar I, Flow) and `docs/feature-ideas.md` with what the flow plan built (the list is in `docs/flow-plan.md` section 4)
- Assistant by hand with a real key: "Suggest steps" for an appointment, an imported appointment answered by a question and by `add_prep_steps` in act, "It feels too big" on a to-do, a rotation, a routine made and undone in the chat. Only fakes so far. A guest who saved their settings before keeps their old list of events (`aiEvents`), an account gets the two new events from `scripts/add-flow-events.ts`
- Visual pass, by eye: only the wide light and phone dark views of Now, Plan, the session hero and Settings were checked. Not checked: the check, "Still there?", Away and break heroes, the prep sheet, the "Tight" and "Does not fit" lines, wide dark, a visible focus ring on every interactive element, 44 px targets on phones. Also one type scale and the same section spacing on every page
- Run a real week on it (the milestone "usable") and see whether the capacity line (60 % realistic share, tight from 80 %) cries wolf. Routine days exist only 14 days ahead, so a due date further out counts the days after them as free
- Essentials: the step for a new account (only a guest sees the welcome), and a hard check that keeps meds, meals and bed from being deleted (the assistant only has a rule in its prompt)
- Pick the next plan. Suggested by the checks plan: its phases 4 and 5 (core guardrails, route matrices)
- Google Calendar, real run: import, move, done and a forced conflict on a real calendar, by hand (only fakes so far)
- Google verification (`docs/google-verification.md`): remove Tasks and Keep from `GOOGLE_SERVICES` first, record the demo video, submit. The consent screen must allow the Calendar scope
- Component test for the Calendar write select in Settings, and a test for the stream `calendar` hint in `src/lib/stream.ts`
- The sample week fills only the evenings and the weekend with to-dos (work or school on weekdays): watch whether a first time visitor during the day still sees what Now does
- Flaky under the full parallel run: `local/runtime.test.ts` "erasing in one tab deletes the database and tells every other tab to start again" (once in `verify --quick`, passes alone)

## Later

- Travel for imported appointments is only added through the prep sheet or "Prepare for it" in the task sheet, nothing offers it on its own except the assistant's answer to `appointment.added`, which offers preparation steps and no travel. "Leave now" rings only on an open page: with Web Push (B2) the start of travel can be a real alarm
- Travel and preparation are not written to Google Calendar yet (the setting "Add my own tasks" covers tasks the user made, not travel)
- Calendar write gaps: assistant and agent edits are not written to Google, Google-side edits to an event the app made do not flow back, existing tasks are not copied when "Add my own tasks" is turned on, stopping the sync also ends that setting, read-only (midnight) tasks are not marked in the UI, the unlink case `revoked: false` has no UI
- Capture inbox (`Shift+Space`)
- End-of-day summary
- Morning briefing (`day.started` event)
- Mark agent-made tasks in the Plan view (a small marker on timeline blocks)
- Plan: a calendar grid in the day switcher popover
- Productivity rating for the day so far (next to the "done today" line). Needs a fair measure of the day's load, including load the app cannot see, before it can be honest

## Parked

- Adaptive behavior model, Crisis Mode, anti-context-switch scheduler, deeper AI
