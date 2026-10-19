# Flow Plan

Status: built (phases 1 to 8), accepted 2026-10-16 with all 14 decisions as recommended. This file is the short form. The full original (scenarios, rules 5.1 to 5.14, data, code map, screens, phases, tests) is in git history: `git log -- docs/flow-plan.md`, the version before the rewrite. How it works now is in `CLAUDE.md` (core principle, routines, to-dos, anchoring) and in the pure modules with their tests.

## 1. In short

Today every task was a block with a start and an end, and between blocks the screen said "Free time". That fails where ADHD planning fails: the big task with a deadline and no time, the trip that has to start long before the appointment, the hour nobody planned, the moment the energy runs out.

The plan changed three things:

1. **Things without a time.** A to-do has a size, a progress and maybe a due date, never a time. Time-bound things split into appointments (fixed, end on their own, may need travel and preparation) and tasks at a time (lunch, meds: marked done, and they may move a little to make room for an appointment).
2. **A day that flows.** A pure flow engine (`flow.ts`, `pick.ts`) fills every gap of My day with the to-do that most needs time, holds it for a session, asks how far you got, rotates when you are stuck, sends you on a break when rotating does not help, notices when nobody answers and switches to Away. When nothing is open it says "Plan what's next". Free time is gone.
3. **The user's answers are data.** What is current is still derived and never stored, but from the plan, the clock and a short log of what the user answered today (`flow_log`). Client and server run the same function on the same data.

Everything works without an OpenAI key. With a key the assistant proposes preparation steps, sizes and a next tiny step. It never decides what is current, and it never places work blocks.

**Not a calendar.** The calendar part (appointments, travel, lunch) is only the frame the work has to fit around. The product is the driver inside it: it decides (one thing, no list, no empty screen), holds you (a session keeps its to-do until the check), asks (one question with one-tap answers, progress as an honest number), notices (low progress, lost energy, being gone, a to-do avoided for days), calls you back (the morning, a break, an unanswered question) and organizes for you (a title is enough). Calm in how it looks, firm in what it does.

## 2. What was done

| Phase | Built                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | To-dos and the flow log in both backends, `completedAt` on tasks, `flow.ts` and `pick.ts`, the Now hero on the engine, the To do panel and sheet, quick add for to-dos with due dates (`dates.ts`), "Do it when there is time", no "Free time" anywhere                                           |
| 2     | `checks.ts`: the check at the end of a session with its follow-up questions, asked again, Away and "I'm back" derived by the replay, `check` rows that update the to-do, the morning call and the call back from away, `checkMinutes` and `startWorkAt` in Settings                               |
| 3     | `struggle.ts` and `breaks.ts`: the ladder, rotations and breaks as rows, cool downs, the low energy hour, Give it 5 minutes first, `skips` and Face it, the offered 5 min break, the cost line of Call it a day, `breakMinutes`                                                                   |
| 4     | `kind` and `parentId` on tasks, imported events as appointments that end on their own, travel that follows and is deleted with its appointment in every path (`core/appointments.ts`), the prep sheet, prep to-dos that end with the appointment, `arriveEarlyMinutes`                            |
| 5     | `placeday.ts` and `shift` (the moved drawing on Plan), routines (`recurrence.ts`, `makeRoutines`, edits, Undo, quick add, the Routines sheet), the essentials as routines in the first run                                                                                                        |
| 6     | Assistant tools for to-dos, routines, `kind`, `shift` and prep steps, `dayline.ts` in the prompt, "Suggest steps" (the `prep` use), the next tiny step on "It feels too big", the events `appointment.added` and `focus.rotated` (`scripts/add-flow-events.ts`)                                   |
| 7     | `capacity.ts`: "Tight" and "Does not fit" on the To do panel, one warning line on Plan, the pick uses the free time until a due date, due-today to-dos at a time in Next                                                                                                                          |
| 8     | The sample week (routines, to-dos, one appointment with travel and steps), the Privacy page checked against the code, `CLAUDE.md` in step, a first visual pass (Now, Plan, session hero and Settings, wide light and phone dark), the nginx request log instead of an app log, small layout fixes |

## 3. What differs from the original plan

- **The ladder runs on the device at the moment of the answer.** Its step is a row (`rotate`, `break`), so adding a to-do later never rewrites the past. Face it needs a new column (`skipSince`) to know a skip spans more than one day.
- **Travel is made by the prep sheet** through the ordinary task routes (`kind` travel, `parentId`). "Leave now" rings only while a page is open (a real alarm needs Web Push). A prep to-do is left out of the pick the minute its appointment starts and written as `ended` by `watch`.
- **A routine's days are ordinary tasks** (`routineId`), made 14 days ahead by every tick on the server and on a guest's device, no events, no Google writes. `routines.through` stops a deleted day from coming back. "Detached" is not a flag: a task follows its routine while its fields equal the routine's (`followsRoutine`).
- **The first run asks only a guest.** An essential that is over today starts tomorrow, an account's first sign in is not asked for the essentials.
- **Assistant:** routine tools exist in the chat only (an unprompted reaction never changes two weeks at once), the floor of meds, meals, sleep and water is a rule in the prompt and not a number, no schema change (`agent_actions.tool` says what `before` and `after` are). The events `user.away`, `user.back`, `check.answered` and `break.started` stay unbuilt, and so does speaking "Still there?".
- **Capacity:** the engine takes the days after today as an optional `later` input, the server and the assistant read them, and a routine's 14 days are what is known: later days count as free. The shares (60 %, tight from 80 %) are guesses, not a promise.
- **The sample week** is an ordinary week that fits anybody, so nothing in it draws attention and the visitor sees what the app does (the first version was a calendar of breaks, emails and errands and read as the thing this app is not; a student's week and a dentist were too specific): the essentials, Plan the day, a short walk and winding down as routines, one plain "Appointment" with travel and two steps, "Do the taxes" (4 h) and "Clean the apartment" (2 h) as the big to-dos with a due date, a few small errands, and no block for the work itself, so Now opens on a big to-do after Start, holds it, asks how far and can rotate to the other. Its marks live in three kinds (`sample`, `sample-routines`, `sample-todos`), clearing removes all three, keeping unmarks them, the move into an account leaves them out.
- **Phase 8 tags:** `roadmap-1.0.md` and `feature-ideas.md` are not tagged yet.

## 4. Still open

- Tag `docs/roadmap-1.0.md` (a new pillar I, Flow) and `docs/feature-ideas.md` with what this built (Task aging, Deadlines with backward planning, Leave-by alarms, Next tiny step, Mid-task check-in, Pick for me, Dopamine menu, Estimate learning).
- By hand with a real OpenAI key: "Suggest steps", an imported appointment answered by a question and by `add_prep_steps` in act, "It feels too big", a rotation, a routine made and undone in the chat.
- By eye: the check, "Still there?", Away and break heroes, the prep sheet, the "Tight" and "Does not fit" lines, wide dark, focus rings and 44 px targets. Run a real week and see whether the capacity line cries wolf.
- The essentials step for a new account, and a hard check that keeps essentials from being deleted (the prompt only asks).
- The milestone "usable": the author runs a real week on it (four exams without a study block by hand, no "Free time" inside My day for 7 days, every away caught within 5 min, every rotation or break felt right or undone in one tap).
- Later, not planned here: Web Push (checks, "Leave now" and alarms on a closed app), sub-steps as a tree, energy tags, travel times from a map service, the capture inbox, the end-of-day summary, an aggressive mode. Parked on purpose: adaptive behavior model, Crisis Mode.

## 5. Decisions (taken as recommended)

Rotation on struggle is automatic with Undo. The break after two rotations starts on its own ("Keep working instead"). Call it a day exists as rest the user chooses. Checks every 30 min after a 15 min warm-up. Asked again after 2 min, Away after 5. A one-off item with a time made in the app is a task at a time unless marked or worded as an appointment, calendar events are appointments. No energy question after a break or a meal. Time while away counts only after "I was working on it", at most 2 h. The 5 min check-in chime keeps chiming during to-do sessions. Flow comes before Calm on the roadmap. The start call repeats every 15 min until Start, Away calls back every 30 min. Give it 5 minutes first and Face it are always on. No switch turns the driver off. `CLAUDE.md` says: calm in how it looks, firm in what it does.
