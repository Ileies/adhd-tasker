# Flow Plan

Status: accepted, 2026-10-16, written against `9e3c0a8`, all 14 decisions of section 13 taken as recommended. Phase 1 (1.1 to 1.4 in the phase list) is built: to-dos and the flow log in both backends, `flow.ts` and `pick.ts`, the Now hero on the engine, Plan with the To do panel and the to-do sheet, quick add for to-dos with due dates, the triage's "Do it when there is time", the sample without "Free time". Phase 2 (2.1 to 2.4) is built: `checks.ts`, the check at the end of a session with its follow-up questions, asked again, Away and "I'm back" derived by the replay, `check` rows that update the to-do, the check and Away in the hero, the morning call and the call back from away, `checkMinutes` and `startWorkAt` in Settings. Left out of phase 2 on purpose: the events `user.away`, `user.back` and `check.answered` (with the assistant in phase 6) and speaking "Still there?" aloud. Phase 3 (3.1 to 3.5) is built: `struggle.ts`, `breaks.ts`, rotations and breaks as rows written by the device when a struggle happens (the replay only reads them), cool downs, the low energy hour, Give it 5 minutes first, `skips` and `skipSince`, Face it, the offered 5 min break, the cost line of Call it a day, `breakMinutes` in Settings. Decided while building: the ladder runs on the device at the moment of the answer and its step is a row (`rotate`, `break`), so the past never changes when a to-do is added; Face it counts a skip once per rotation and needs `skipSince` (a new column) to know it spans more than one day; the struggle events for the assistant (`focus.rotated`, `break.started`) wait for phase 6. Phase 4 (4.1 to 4.4) is built: `kind` and `parentId` on tasks, imported events as appointments that end on their own (`rank()` never lists them as missed), the kind chip in quick add and the task sheet, travel as a task that follows and is deleted with its appointment in every path (`core/appointments.ts`: Plan, the assistant, the calendar sync), the prep sheet (`prep.ts`, `PrepSheet.svelte`), prep to-dos ending with the appointment, the To do panel grouped by appointment, the events `todo.ended` and `appointment.added` (logged only, the assistant answers them in phase 6), `arriveEarlyMinutes` in Settings. Decided while building: travel is created by the prep sheet through the ordinary task routes (`kind` travel, `parentId`), the sheet's "Suggest steps" waits for phase 6, "Leave now" rings only while a page is open (a real alarm entry for a closed app needs Web Push), a prep to-do is left out of the pick the minute its appointment starts by `flow()` itself and written as `ended` by `watch`, and "Call dentist" stays a task while "Dentist 14:30" is an appointment (first words like call, book or study keep a line a task). Phase 5 is half built: 5.1 (`placeday.ts`, `shift`, the moved drawing on Plan, the placed day in Now, the tick and the simulated day) and 5.2 (routines) are done, 5.3 (the first run essentials and the sample on routines) is not. Decided while building 5.2: a routine's days are ordinary tasks with `routineId`, made 14 days ahead by every tick on the server and on a guest's device (`makeRoutines`, no events, no Google writes), and a routine remembers the last day it made tasks for (`through`) so a day the user deleted is never made again until the routine is edited. "Detached" is not a stored flag: a task follows its routine while it is not done and its title, note, time, length, priority, kind and shift equal the routine's, so changing it back makes it follow again (`followsRoutine`, `planEdit` in `recurrence.ts`). Undo of an edit is the same edit with the old values, Undo of a delete makes the routine again (new id, its days made again). The routines sheet is on Plan (the Repeat icon in the bar, "Edit the routine" in the task sheet of a routine's day), quick add reads "daily", "weekdays", "every tue and thu" and "mon-fri" next to a clock time (a bare weekday stays a date). The assistant has no routine or `shift` tools yet (phase 6). Phases 6 to 8 are not started. Section 12 lists the effect on `roadmap-1.0.md`.

## 1. In short

Today every task is a block with a start and an end. `rank()` shows the block whose window contains now, and between blocks the screen says "Free time". That works for an organized person who already turned every goal into blocks. It fails where ADHD planning fails: the big task with a deadline and no time, the trip that has to start long before the appointment, the hour nobody planned, the moment the energy runs out.

This plan changes three things:

1. **Things without a time.** A to-do has a size, a progress and maybe a due date, never a time. Time-bound things split into appointments (fixed, end on their own, may need travel and preparation) and tasks at a time (lunch, meds: you mark them done, and they may move a little to make room for an appointment).
2. **A day that flows.** A pure flow engine replaces "the block that contains now". It fills every gap of My day with the to-do that most needs time, holds it for a session, asks how far you got, rotates when you are stuck, sends you on a break when rotating does not help, notices when nobody answers and switches to Away. When nothing is open it says "Plan what's next". Free time is gone.
3. **The user's answers are data.** What is current is still derived and never stored, but from the plan, the clock and a short log of what the user answered today (the flow log). Client and server run the same function on the same data, like `rank()` today.

Everything works without an OpenAI key. With a key the assistant proposes preparation steps, sizes and a next tiny step. It never decides what is current, and it never places work blocks.

### Not a calendar

ADHD Tasker is not one more calendar with a big clock. A calendar stores intentions and leaves the hard part to the person: deciding what to do now, starting, staying on it, noticing that it is not working, coming back. Those are exactly the parts an ADHD brain cannot do on demand. This app does them. The calendar part (appointments, travel, lunch) is only the frame the work has to fit around. The product is the driver inside the frame.

What no other tool does, and what this plan builds:

1. **It decides.** There is always exactly one thing to do, picked by rules the user can read in one line. No list to choose from, no empty screen, no "Free time".
2. **It holds you.** A session keeps its to-do until the check. Bailing out in the first minutes is caught ("Give it 5 minutes first"), switching away again and again is caught (the ladder), a to-do skipped for days is caught (5.14).
3. **It asks.** Every session ends with one question with one-tap answers. Progress is an honest number, not a feeling, and it feeds what comes next.
4. **It notices.** Low progress, losing steam, being gone, avoiding one task for days: each has its own reaction, without the user having to notice it first.
5. **It calls you back.** The day starts with a call, a break ends with a call, an unanswered question is asked again. Silence only when nobody is there.
6. **It organizes for you.** A title is enough to capture something. The size, the due date and the preparation are asked when they matter, or proposed, never demanded up front.

**Calm in how it looks, firm in what it does.** The Calm principle stays for the surface: no flashing, no decoration, slow crossfades. Firmness is in the mechanism: no empty screen, no silent drift, no easy way out without an honest word about what it costs. The two do not conflict. A firm coach can speak quietly.

## 2. What is wrong today, and why

| What the user meets                                              | Cause in the code                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The exam at 12:00 says "2 h left" at 12:00                       | A task is only a window (`startTime`, `duration`). Nothing knows what has to happen before the window                                 |
| Study has to be placed as blocks by hand                         | No task without a time. `quickTask` gives a line without a time the next free quarter hour                                            |
| "Free time" between blocks                                       | `heroState` kind `free`, `tabTitle` "Free until", `lastCurrentTaskId` 0 means free time, and the sample week plans "Free time" blocks |
| No size, no progress                                             | `Task` has neither. Only `completed` counts                                                                                           |
| Nobody asks how it goes                                          | The check-in chime (`checkInMinutes`) only chimes. "I'm stuck" is the only way to say something, and only when the user thinks of it  |
| Three hours away look like three hours of work                   | Nothing tracks whether anyone is there                                                                                                |
| No rotation                                                      | `rank()` is stateless on purpose: the same task stays current until its window ends, whatever the user goes through                   |
| Lunch cannot make room for a meeting                             | Overlaps are settled by priority (`compareCurrent`). The lower task is hidden until the higher one ends, then it is missed            |
| An imported meeting asks "Did you do it?"                        | Every task needs Done, calendar events too (time up, overrun, missed triage)                                                          |
| A task that ran out can only move to the next free slot or a day | `moveLater` and `nextFreeSlot` look for a window. There is no "do it when there is time"                                              |

## 3. The model

### 3.1 Four kinds of things

| Kind           | Example                                 | Time                         | Ends                                                 | Moves                                     | Stored                                     |
| -------------- | --------------------------------------- | ---------------------------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Appointment    | Exam, meeting, doctor, a calendar event | yes                          | on its own                                           | never by the app                          | `tasks`, `kind = appointment`              |
| Travel         | Drive to uni                            | yes, right before its parent | on its own                                           | with its appointment                      | `tasks`, `kind = travel`, `parentId`       |
| Task at a time | Lunch, meds, call mom at 18:00          | yes                          | the user marks it done (time up and triage as today) | up to `shift` minutes around appointments | `tasks`, `kind = block` (every task today) |
| To-do          | Study for Math, taxes, buy a gift       | no                           | done, dropped, or ended with its appointment         | the app picks when                        | `todos`                                    |

Who gets a minute: an appointment or travel first, then a task at a time, then a to-do. Between two time-bound items `rank()` decides as today. A to-do never pushes a time-bound item away, it fills what is left.

### 3.2 A to-do

| Field             | Meaning                                                                | In the UI                                                   |
| ----------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Title             | What it is                                                             | As today                                                    |
| Size (`estimate`) | Minutes the whole thing takes, optional                                | Chips 15 min, 30 min, 1 h, 3 h, 10 h, 30 h, Other, Not sure |
| Progress          | 0 to 100 %                                                             | The check on Now, a slider in the sheet                     |
| Time spent        | Minutes worked on it, counted by the engine                            | "4 h of about 15 h"                                         |
| Due               | A date and an optional time, optional                                  | "Due in 12 days"                                            |
| Part of           | An appointment. The due date then follows it: its start, before travel | "For Exam Math, Thu 5 Nov"                                  |
| Not before        | A date before which it is never picked, optional                       | Folded in the sheet                                         |
| Next step         | One line, the smallest next physical action                            | Shown above the title on Now                                |
| Priority          | 1 to 5 as today                                                        | The same control as tasks                                   |
| Status            | `open`, `done`, `dropped`, `ended` (its appointment began)             | Done and ended show in the done group, never as missed      |

### 3.3 The flow engine

`flow(input): FlowState` in `src/lib/flow.ts`, pure, with its test next to it.

Input: today's time-bound items (placed, see 5.11), the open to-dos, today's flow log rows, the done times of today's tasks and to-dos, the clock (`now` in minutes and ms), and the settings it needs (My day, check interval, break length, heads-up and overrun minutes).

Output:

```ts
type Current<T, D> =
	| { kind: 'task'; task: T } // a time-bound item runs now, rank() picks among overlaps
	| { kind: 'time-up'; ended: T; current: T | null } // a task at a time ran out, as today
	| { kind: 'todo'; todo: D; session: Session }
	| { kind: 'break'; startedAt: number; endsAt: number; activity: BreakActivity }
	| { kind: 'ready'; next: T } // too little time before the next item to start anything
	| { kind: 'away'; since: number | null } // null: not started today
	| { kind: 'plan' } // nothing open: plan what's next
	| { kind: 'rest'; why: 'night' | 'called' }; // outside My day, or the user called it a day

interface FlowState<T, D> {
	current: Current<T, D>;
	check: Check | null; // a question waiting for an answer, with its level (0 asked, 1 asked again)
	next: T[]; // upcoming time-bound items today, placed, in time order
	missed: T[]; // tasks at a time that ran out unanswered (the triage), never appointments
	reason: string | null; // why this is current, one line
	pin: { key: string; todoId: number } | null; // a session nobody pinned yet, see below
	present: boolean;
}
```

How it computes: **replay.** The engine puts today's points in time order (flow log rows, done taps, ends of time-bound items) and folds them through a small state machine, `step(state, point)`, then advances the state to `now`: a session runs out, a check becomes due, an unanswered check is asked again and then turns into Away. Every transition is a pure function with its own tests. Replaying a day is a few hundred rows at most, so the Now screen can run it every second like `rank()` today.

**Pins.** The to-do of a session is chosen once, when the session starts. The first device or server tick that sees a session without a pin writes a `pin` row with the key `pin:<session start ms>`, idempotent like the keys of detected events. From then on the session keeps its to-do even when to-dos are added, edited or reprioritized during it. That is what "not switch every 5 minutes" needs. Every device computes the same pick from the same data, so whoever pins first pins the same to-do.

### 3.4 Principle: nothing stored for current, only the user's answers

The core principle in `CLAUDE.md` becomes: there is no stored current task, session or mode. What is current is derived on every tick by `flow()` from the plan, the clock and the flow log. The flow log holds only what the user said or chose (and the pins that freeze a choice the engine already made). Client and server run the same `flow()`, so the screen and the agent never disagree, the same promise as today.

The flow log (`flow_log` table, `flow` store on a guest's device):

| Row      | Written by                                | Means                                                                                                |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `start`  | the user: Start, I'm back                 | The user is here. `worked` when they answer "I was working on it" after Away                         |
| `pin`    | the first device or tick                  | The to-do of the session that started at that moment                                                 |
| `check`  | the user                                  | The answer to a check: to-do, progress before and after, `pace` when asked (bigger, unfocused, hard) |
| `choose` | the user: Do this now, Undo of a rotation | Work on this to-do now                                                                               |
| `rotate` | the user: Something else                  | Leave this to-do for now                                                                             |
| `stuck`  | the user                                  | The reason from "I'm stuck"                                                                          |
| `break`  | the user: Take a break, I need a break    | A break of `minutes` starts. Breaks from the struggle ladder are derived and need no row             |
| `back`   | the user: I'm back (from a break)         | The break ends early, or "Keep working instead"                                                      |
| `rest`   | the user: Call it a day                   | No to-do until My day ends                                                                           |
| `undo`   | the user                                  | Takes back the row `ref`                                                                             |

Rotations and breaks from the struggle ladder (5.6) are not written: they follow from the answers, so replaying the day reaches them again. Away is not written either: it follows from a check nobody answered. Rows are kept 30 days, are part of the data export, and today's rows move with a guest's plan into an account.

### 3.5 Presence

The engine knows whether the user is here. Present from the first session point of the day (Start, a check answered, Done on Now, I'm back) until a check goes unanswered. Away is derived, never written. Sessions, checks and their sounds only run while the user is present. The exceptions are the calls whose job is to bring the user back: the start call in the morning and Away's call back (5.8, 5.14). Time-bound items do not care: lunch and the exam take the screen and sound whether anyone is present or not, because the world does not wait.

## 4. A day, step by step

Each of these becomes a table test of `flow()` (section 11). They are the user's own examples.

### 4.1 An exam in 20 days

Oct 16. The quick add line "Exam Math Nov 5 12:00 2h". The preview says "Appointment, Thu 5 Nov, 12:00 to 14:00" (the word exam marks it as an appointment, one tap on the chip makes it a task at a time). After Add the prep sheet asks two things, both one tap:

- **Getting there:** No travel, 15, 30, 45 min, 1 h, 1 h 30 min, Other. 45 min. "Arrive early" stays at 10 min. Drive to uni lands on Nov 5 from 11:05 to 11:50, a travel item.
- **Prepare:** Nothing, 30 min, 2 h, 5 h, 10 h, 20 h, Other. 10 h. "Prepare: Exam Math" (renamed to "Study Math" if the user wants) is a to-do at 0 %, due Nov 5 at 11:05, part of Exam Math.

With a key, "Suggest steps" fills the sheet instead: Study Math 15 h, Pack ID, pens and calculator 10 min due the evening before, Drive to uni 45 min. Nothing is written until Add.

From then on Study Math competes for the gaps of every day until Nov 5. Nobody places a study block. Plan's to-do list shows "Study Math, due in 20 days, 0 of about 10 h, on track".

Nov 5, 10:50: the heads-up as today, "Drive to uni starts in 15 min. Start wrapping up." 11:05 Drive to uni takes the screen and rings until it is tapped: "Leave now. Exam Math at 12:00." At 11:05 Study Math ends with its appointment at the progress it had ("ended with Exam Math at 85 %"), it never shows as missed. 12:00 to 14:00 Exam Math is current and ends on its own: nothing asks whether it happened.

If the exam moves to Nov 6, Drive to uni and the due date of Study Math move with it.

### 4.2 Four exams, lunch in an hour

Four to-dos, Study A to D, all critical, 15 h each, 0 %, due in 18 to 21 days. Lunch is a task at a time, every day 12:00 to 12:45. The user tapped Start at 10:30 and answered the 10:45 check. It is 11:00.

- Current: Study B. At 10:30 the four had the same share of the day, B is due first, so B was picked and pinned. The 10:45 answer was fine, so B stayed (continuity). The next check is at 11:15.
- Next in the rail: "12:00 Lunch, in 1 h". The other three studies are not in Next: Next lists what comes at a time.
- A fifth to-do typed at 11:05 does not change the current one: the session is pinned.
- 11:45, the heads-up for Lunch: the check comes early, "Lunch at 12:00. How far is Study B?", without asking twice.
- 12:00 Lunch takes the screen.
- Over the day each study gets about a quarter of the free time. B stays until its share of today is used (or 2 h), then the next session picks the one that is furthest behind. Every switch happens at a check, never in the middle of a session.

### 4.3 Losing steam: rotate, rotate, break, lunch

Another morning, the same plan. The 10:45 check: "No change", still 0 %. One question follows: "Slower than planned. What happened?" with "It's bigger than I thought", "I couldn't focus", "A hard part, keep going". "I couldn't focus" is struggle one: the app switches to Study C at once and says so, "Switched to Study C. Study B comes back later." with Undo. A short warm-up session of 15 min. The 11:00 check: no change, couldn't focus, struggle two: Study D. At 11:10, ten minutes into Study D, "I'm stuck", "I lost energy for this": struggle three, a break. (At 11:03 the same tap would have been answered with "Give it 5 minutes first", 5.6.)

"Break, 10 min. Stand up, fill a glass of water and drink it at the window. No phone. I'll call you back." with "Keep working instead". At 11:20 "Break is over. Back to Study A?" with "Let's go" and "5 more min". Had the break reached 12:00, Lunch would have taken the screen at 12:00 and ended the break.

If the struggles go on after the break, the next hour picks short to-dos first (the low energy hour). One more and the app offers a 20 min break with something physical and the question "Done with focus work for today?" with "Keep going" and "Call it a day".

### 4.4 Lunch done early

12:25, Done on Lunch. The app does not ask about energy, it takes the most likely answer: back to what was going well before Lunch, with a warm-up session, "Back to Study B. You were at 25 %." The check after 15 min catches a low: "I couldn't focus" goes down the same ladder, "Something else" rotates (after the first five minutes, 5.6), Take a break is in the menu.

### 4.5 Lunch and a meeting at the same time

A meeting from Google Calendar, 12:00 to 13:00, an appointment. Lunch may move by 1 h. The day is placed (5.11): Lunch goes after the meeting, 13:00 to 13:45. Had the meeting run to 13:30, nothing would fit after it within the hour, so Lunch would go before it, 11:15 to 12:00. When the meeting is deleted, Lunch is back at 12:00 on its own: the move is computed, the stored time stays. Plan draws Lunch at 13:00 with the line "moved for Meeting". Studying never pushes Lunch: it only fills what is left.

### 4.6 Nobody answers

11:15, the check is due: the question shows in the hero and the soft chime plays. 11:17: "Still there?", the nudge tone, the hero crossfades to the attention color over 2 s (never a flash), spoken when voice replies are on. 11:20: Away. A grey hero, "Away since 11:20", with "I'm back" and "I was working on Study B". No checks and no chimes, only a soft call back at 11:50 ("Back? Study B is waiting."). At 12:00 Lunch still takes the screen with its sound. When the user taps "I'm back" at 13:10: a warm-up session. "I was working on Study B" counts the time (at most 2 h) and asks for the progress.

### 4.7 Nothing left to do

14:00, no to-do is open, the next item is dinner at 18:00. The hero says "Plan what's next" in the attention color, with the quick add line focused, Open Plan and, with a key, Ask the assistant. Whatever is typed there becomes current at once. With less than 10 min left before the next time-bound item the hero says "Get ready: Dinner at 18:00" instead of starting a session.

A to-do due in ten years at low priority, when it is the only open one, is current. "Free time" does not exist.

### 4.8 The morning

7:00 My day starts and the user is asleep. Nothing rings for to-dos yet. The hero says "Good morning. First up: Study B" with Start, Next shows the first time-bound item. Meds at 8:00, a task at a time, takes the screen with its chime as today. Done on Meds starts presence, and the first session follows.

Had the user not come by 9:00 ("Start working at", a setting), the app calls: the chime and "Time to start: Study B", asked again after 2 min like a check, then once every 15 min until Start. The day starts whether the user feels like it or not.

## 5. Rules

Constants are named in the pure modules and tested. The numbers below are the defaults.

### 5.1 Who has the minute

1. A time-bound item that contains now and is not done: it is current (`rank()` among overlaps, as today).
2. A task at a time that ran out unanswered keeps the hero as time up while it is fresh (two overrun windows, as today). Appointments and travel never have time up: they end.
3. Outside My day: `rest` (night, the black "Sleep" hero as today). No to-do, no check.
4. After Call it a day: `rest` until My day ends. Time-bound items still come.
5. Not present: `away`.
6. A break that is running: `break`.
7. Less than 10 min before the next time-bound item: `ready`.
8. A to-do to pick: `todo`, in a session.
9. Nothing to pick: `plan`.

### 5.2 Sessions

A session is a stretch of work on one to-do. It starts at a session point: presence starting, a check answered, a Done, the end of a time-bound item or a break while the user is present, a rotation, a Do this now. It ends when its length is up (the check), when a time-bound item starts, at My day end, or with a Done, a rotation, a choice or a break.

- **Length:** 30 min (setting: 15, 25, 30, 45, 60). The first session after Start, I'm back, a break, a rotation, a Done or a time-bound item is a 15 min warm-up. After two good answers in a row the next session is 1.5 times as long, at most 60 min. After a struggle it is a warm-up again.
- **Cut short by a time-bound item:** the check comes with the item's heads-up instead of at the session's end, asked once, and only when 10 min passed since the last check.
- **Pinned:** see 3.3.
- **Time spent:** a session counts from its start to its answer, Done, rotation or the start of the item that cut it, at most its length plus 5 min. A session that ended in Away counts only after "I was working on it", up to the moment of I'm back and at most 2 h.

### 5.3 Picking a to-do

1. **Candidates:** open to-dos whose "not before" is reached and whose appointment has not started. A to-do a struggle rotated away from cools down for 60 min. A break clears every cool down. During a low energy hour only to-dos with at most 30 min left count. With no candidate left, the cool down and then the low energy filter are dropped, in that order. Still none: nothing to pick (5.9).
2. **Urgent first:** a to-do due today (or already past its due, which counts as today) whose remaining minutes do not fit into the free minutes before its due time with 30 min to spare is urgent. Urgent ones go first, the earliest due first.
3. **Fair share for the rest.** Need = remaining minutes divided by the days left until due, today included, at least 1. Without a due date the days left are 30, so a to-do without a date, or due in ten years, still has a small need and is picked when nothing else is open. Weight by priority W = 1, 2, 3, 5, 8 (Low to Critical). Today's free minutes (My day left minus time-bound items, phase 7 replaces this with the real free time until each due date) are split in proportion to need times W. Behind = that share minus the time spent on it today.
4. **Pick:** the to-do furthest behind, also when every one is ahead. Continuity first: the to-do of the previous session stays while it is still behind, had less than 2 h today and the last answer was no struggle. Ties: earlier due, then lower id.
5. **Remaining minutes:** a learned size (see 5.5) wins. A size: size times what is left of 100 %, at least 5. No size: 60.

The reason line says what decided, and it fades after a minute like today's switch reason:

| Rule               | Line                                                         |
| ------------------ | ------------------------------------------------------------ |
| Urgent             | "Due at 15:00, about 1 h left to do."                        |
| Fair share, behind | "Exam Math in 12 days. 1 h 10 min today keeps you on track." |
| Continuity         | "Back to Study B, where you were before Lunch."              |
| Only one           | "Nothing else is open."                                      |
| Low energy hour    | "A short one while energy is low."                           |
| Chosen             | none, the user just chose it                                 |

### 5.4 The check

When a session's length is up, the question shows inside the hero (not a dialog, nothing covers the task): "How far is Study B?" The answers are chips:

- **Keep going:** no number, not judged, a new session. For flow, when a number would break it. At most twice in a row: the third check in a row has no Keep going, the number is due.
- **No change:** the current %.
- **Three steps up:** around the gain expected for the session (session minutes divided by the size), rounded to 5 % steps, duplicates merged, at most 95 %. Without a size: +5, +10, +20 %.
- **Done.** The to-do is done, with the Done confirmation and sound as today.
- **Other:** a slider.

The answer writes a `check` row, sets the progress, adds the time spent and starts the next session. "Update progress" in the hero menu answers early. The check is shown on every open screen and sounds only on the display device.

### 5.5 Slow progress: one question, two opposite reactions

Slow progress has two causes that need opposite reactions. The task may be bigger than thought (then keep going and plan for more), or the user cannot focus (then staying wastes the hour). Rotating on a big task that is moving would be wrong, staying on one the user cannot touch would be wrong too. So the app asks once, one tap:

- **When:** "No change", or a gain below half of the expected one. Without a size and before the app learned one, after the first answer with a gain: "Was that good progress for 30 min?"
- **"It's bigger than I thought"** or **"Yes, normal pace":** the size becomes time spent divided by progress (rounded to 5 min). From then on "slow" is measured against it. Nothing rotates.
- **"I couldn't focus"** or **"No":** a struggle (5.6).
- **"A hard part, keep going":** nothing, a new session.

### 5.6 The struggle ladder

A stretch runs from the start of presence, the last break or the last good answer. Struggles in the stretch are: "I couldn't focus", "I'm stuck" with "I lost energy for this", "I cannot get started" for the second time on the same to-do, and the third "Something else" within 30 min.

| Struggle in the stretch | Before any break                                        | After a break                                                              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1                       | Rotate to the next pick, the left one cools down 60 min | Low energy hour: short to-dos first                                        |
| 2                       | Rotate again                                            | A 20 min break, something physical, then "Done with focus work for today?" |
| 3                       | A 10 min break with an activity                         | Same as 2                                                                  |

Every step happens on its own and says what it did, with Undo ("Stay on Study B", "Keep working instead"). A person who just said they cannot focus should not have to choose the next task. With only one candidate a rotation is replaced by the break. The ladder lives in `src/lib/struggle.ts`.

**Give it 5 minutes first.** Losing steam in the first five minutes of a to-do is usually not steam, it is the wall in front of starting. So "Something else" and "I lost energy for this" in the first 5 min of a session on a to-do that did not struggle today answer "Give it 5 minutes first. If it still does not work, I'll switch." with a timer in the hero. When the 5 min are up the switch happens without asking again, so the user is never trapped, only asked to try. "I'm stuck" with "I need a break" is never held back.

### 5.7 Breaks

- **Started by:** the ladder, "I'm stuck" with "I need a break" (a real break now, instead of today's 5 min timer), Take a break in the hero menu, and after 90 min of sessions without a break the check offers a "5 min break" chip once (offered, never forced).
- **Length:** 10 min (setting 5, 10, 15), 5 for the 90 min offer, 20 for the second ladder break. A break never runs into a time-bound item: Lunch ends it.
- **Activity:** `breakActivity(minutes, now, recent, next)` in `src/lib/breaks.ts` picks from a fixed library of concrete, screen free, body first activities (stretch and water, the window, a walk around the block without the phone, tea away from the desk, lie down with eyes closed, one song and move, a snack with water). Never the same twice in a row, nothing with food when a meal is within 45 min, daylight when it is light out (`sun.ts` knows).
- **Hero:** the activity in large type, the time draining, "I'm back" ends it early.
- **End:** a soft sound and the check "Break is over. Back to Study A?" with "Let's go" and "5 more min". Unanswered, it goes the same way as any check (5.8).

### 5.8 Presence and Away

- A check that is not answered is asked again after 2 min ("Still there?", the nudge tone, the attention color, spoken with voice replies on), and after 5 min the user is Away.
- Checks, their escalation and Away happen only in to-do sessions, at the end of a break and in "plan". Never during an appointment, travel or a task at a time: someone in a meeting or at lunch is not asked whether they are there.
- Away: the grey hero "Away since 11:20" with "I'm back" and "I was working on Study B". Silent except for time-bound items, alarms and one soft call back every 30 min within My day ("Back? Study B is waiting."), so a person who drifted to the couch is called back and a person out of the room only hears a chime nobody is bothered by. The 5 min check-in chime stops.
- Before the first session point of the day the same state is "Good morning" with Start, and from "Start working at" on it calls (4.8).
- Away and back are events for the agent (`user.away`, `user.back`), detected and logged like `task.missed`.

### 5.9 When there is nothing to pick

- **Plan what's next** (`plan`): the attention color (urgency level 2, plus the words, color is never the only cue), the quick add line focused, Open Plan, Ask the assistant with a key. It has checks like a session: nobody answering here is Away too.
- **Get ready** (`ready`): less than 10 min before the next time-bound item. "Get ready: Meeting at 14:00" with the heads-up line. Not a session, no check.
- **Call it a day** (`rest`): in the hero menu, a `rest` row with Undo. Before it takes effect the hero says once, plainly, what it costs, never as a reproach: "Study B is 40 min behind today, tomorrow needs 1 h 50 min for it." with "Call it a day" and "One more session". Then no to-do until My day ends, the hero is calm, "Day is done. Next: Dinner 18:00". Time-bound items still come. This is rest the user chose, the app never proposes it, except as the last step of the ladder.
- **Night:** outside My day, as today.

### 5.10 Appointments, travel and preparation

- **Kind:** imported calendar events are appointments. An item made in the app with a time is a task at a time, unless it is marked as an appointment: a chip in the quick add preview and in the task sheet, preselected by a short word list in `quickadd.ts` (exam, test, meeting, appointment, doctor, dentist, interview, lecture, class, flight, train). A wrong task at a time costs one "Did you do it?", a wrong appointment would silently skip a "Did you take your meds?", so the default leans to the task.
- **Appointments end on their own:** no time up, no overrun tone, no missed triage, no `task.missed` event. Done stays possible (a meeting that ended early) and moves the day on at once.
- **The prep sheet** opens after an appointment was added in the app, skippable with one tap (4.1). Each step is a to-do part of the appointment. "Add a step" adds more. With a key, "Suggest steps" fills the sheet and writes nothing until Add.
- **Travel:** `kind = travel` with `parentId`. It ends "arrive early" minutes (default 10) before its appointment. When the appointment moves, travel moves with it and keeps its gap (core rule in `updatePlanTask`, the calendar sync and the assistant tools, so every path does it). Deleting the appointment deletes its travel, with the same Undo. The start of travel rings like an alarm until it is tapped, at most 1 min: leaving on time is the moment that matters. The heads-up before it is today's reminder.
- **Prep to-dos:** due at the start of their appointment's travel, or of the appointment without travel, following its moves. When the appointment starts they end at the progress they had. If the appointment is deleted, they keep the last due date and the line "Exam Math was removed".
- **Calendar:** an imported appointment without prep in the next 14 days raises `appointment.added`, so the assistant can offer steps (section 9). Without a key nothing nags: the sheet of the appointment has "Prepare for it". Travel goes to Google like the user's own tasks when "Add my own tasks to Google Calendar" is on.

### 5.11 Tasks at a time make room

- `shift` on a task at a time: how far it may move for an appointment. Chips in the sheet: Stays, 15 min, 30 min, 1 h, 2 h. Meals in the sample start at 1 h.
- `placeDay(items)` in `src/lib/placeday.ts`: appointments and travel stay. Tasks at a time are placed in priority order: at their own time when nothing placed overlaps, else at the earliest free start after their time within `shift`, else at the latest free start before it within `shift`, on the 15 min grid. Nothing fits: it stays and overlaps as today, and the overlap line on Plan says so.
- The stored time never changes. Now, Plan, the server tick and the guest's tick all use the placed day.
- Dragging a moved task on Plan stores the new time: the user decided.

### 5.12 Tasks at a time repeat

This is roadmap C1, needed for a real week: nobody types Lunch every day.

- `routines`: title, priority, start minutes, duration, shift, kind, repeat in the alarm grammar (`daily`, `weekdays`, `days:1,3`), first day, last day (optional).
- Materialized 14 days ahead into `tasks` with `routineId`, on every tick that finds a day missing and right after an edit. Times are local minutes, so daylight saving needs nothing (the alarms already work like this, `nextRepeat`).
- Editing one day changes only that task, it is detached. Editing the routine changes the future tasks that are not detached. Deleting it removes them, with Undo.
- Quick add: "Lunch 12:00 45m daily", "Meds 8:00 weekdays".

### 5.13 Sound and color

Sound only on the display device, nothing when muted, the user's volume is the ceiling, as today.

| Moment                            | Sound                                                       | Color                                        |
| --------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| A session starts on another to-do | `task-started`                                              | The to-do's urgency (priority, due pressure) |
| A check is due                    | `reminder`                                                  | unchanged                                    |
| The check is asked again          | `nudge`                                                     | crossfades to level 2 over 2 s               |
| Away                              | none                                                        | grey                                         |
| A break starts, a break ends      | none, then `wrap-up` before the question                    | calm (level 0)                               |
| Travel starts                     | rings like an alarm until tapped, max 1 min                 | the travel's urgency                         |
| Plan what's next                  | `reminder` when it starts                                   | level 2                                      |
| The start call, asked again       | `reminder`, then `nudge` once, then `reminder` every 15 min | level 2 while it calls                       |
| Away calls back                   | `reminder`, every 30 min                                    | grey                                         |
| The 5 min check-in chime          | as today, only during to-do sessions                        |                                              |

A to-do's urgency color: its priority as today, at least level 2 when it is urgent (5.3), level 3 when its due date passed. The words carry the same ("Due at 15:00"), color is never the only cue.

### 5.14 Holding the user to it

The rules above fill the day. These keep the user in it. Each one is pure, tested, and has a way out, so firm never becomes trapped.

| Mechanism                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                  | Way out                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| The start call            | From "Start working at" (default 09:00) the app calls until Start: the chime, asked again after 2 min, then every 15 min (4.8)                                                                                                                                                                                                                                                                                                | Start, or Call it a day                              |
| Give it 5 minutes first   | Bailing out in the first 5 min of a fresh to-do gets a 5 min try first, then the switch happens by itself (5.6)                                                                                                                                                                                                                                                                                                               | "I need a break" is never held back                  |
| The number is due         | Keep going at most twice in a row, then the check wants a number (5.4)                                                                                                                                                                                                                                                                                                                                                        | Other: any number, including the same                |
| Asked again, called back  | An unanswered question is asked again, Away calls back every 30 min (5.8)                                                                                                                                                                                                                                                                                                                                                     | I'm back                                             |
| Face it                   | A to-do pushed away three times on at least two days (rotations, Something else, without progress in between: `skips`, reset when its progress goes up) is named when it is next picked: "Study B was pushed away 3 times. 10 minutes now, then you decide." A 10 min session that cannot be switched away from. At its end one question: "A smaller first step", "It's fine now, keep going", "Move its due date", "Drop it" | "I need a break", and the question at the end        |
| The honest cost           | Call it a day says once what it costs today and tomorrow (5.9)                                                                                                                                                                                                                                                                                                                                                                | Call it a day                                        |
| Ask later, not at capture | A to-do needs only a title. A missing size is asked at its first check ("How big is all of it?", the size chips) instead of the pace question. A missing due date is never demanded, the assistant may propose one. Preparation comes from the prep sheet                                                                                                                                                                     | Not sure (the size stays unknown, 60 min is assumed) |

"Face it" is the feature idea Task aging, built into the pick. With a key, "A smaller first step" asks the assistant for one (section 9), without a key the user types one line or keeps the fixed hint.

## 6. Data

### 6.1 Tables

`tasks`, new columns:

| Column        | Type                                     | Default                                       |
| ------------- | ---------------------------------------- | --------------------------------------------- |
| `kind`        | `block` \| `appointment` \| `travel`     | `block`, so every existing row stays as it is |
| `shift`       | minutes                                  | 0                                             |
| `parentId`    | task id (travel)                         | null                                          |
| `routineId`   | routine id (phase 5)                     | null                                          |
| `completedAt` | epoch ms, set on Done, cleared on Reopen | null (this is roadmap C4)                     |

`todos` (new): `id`, `email`, `title`, `description`, `priority`, `status` (`open` \| `done` \| `dropped` \| `ended`), `estimate` (minutes, null), `learned` (boolean: the size came from the pace), `progress` (0 to 100), `spentMinutes`, `skips` (pushed away without progress, see 5.14), `dueDate` (YYYY-MM-DD, null), `dueTime` (minutes, null means the end of My day), `parentId` (task id, null), `notBefore` (date, null), `nextStep` (null), `createdAt`, `completedAt`.

`flow_log` (new): `id`, `email`, `at` (epoch ms), `date` (YYYY-MM-DD in the user's timezone, so "today" is one index), `type`, `todoId`, `taskId`, `data` (JSON: progress, pace, reason, minutes, ref), `key` (unique per user, null allowed, for pins). Pruned after 30 days.

`routines` (new, phase 5): see 5.12.

`users`, new columns: `checkMinutes` (30), `breakMinutes` (10), `arriveEarlyMinutes` (10), `startWorkAt` (540, 09:00, minutes since midnight), `lastCurrentKey` (text, `task:12`, `todo:5`, `break`, `away`, `plan`, `rest`, `ready`). `lastCurrentTaskId` stays until a cleanup, like the unused statuses.

Every schema change is applied the way `CLAUDE.md` says: `bun run db:push`, production with `bun run deploy --db-push`.

### 6.2 Everything that has to follow

- **Repo port** (`core/repo.ts`): `todos` (open, recent done, get, insert, update, delete, restore), `flow` (day, insert returning null for a known key, prune), later `routines`. Both repos run the contract suite (`src/test/repo-contract.ts`).
- **IndexedDB:** one appended upgrade step with the stores `todos` and `flow` (index `date`, unique index `key`), later one for `routines`.
- **Backend:** `todos.load/create/update/delete`, `flow.load(date)/record(row)`, later `routines.*`, in `remote-backend.ts`, `local/backend.ts` and `BACKEND_METHODS`.
- **Routes:** `/todos` (GET, POST, PUT, DELETE), `/flow` (GET `?date=`, POST), later `/routines`. Each in the login and ownership matrices.
- **Stream:** hints `todos` and `flow`, so a check answered on the phone moves the second screen at once.
- **State:** `tasker.todos` and `tasker.flow` (today's rows) in the one `tasker` object. The layout load returns the open to-dos and today's rows for an account.
- **Export:** version 2 with `kind`, `shift`, `completedAt`, travel's parent as an index into the file's task list, the to-dos with their parent the same way, the routines, and the flow log (exported for the user, never imported). Version 1 files still import, every task as `block`.
- **Move into an account and snapshots:** carry to-dos, routines and today's flow rows, links remapped. `sameTask` gains `kind`, to-dos match by title and due date.
- **Settings:** the new keys in `SettingsPatch`, `parseSettingsPatch`, the export keys and `DEFAULT_SETTINGS`.
- **Privacy page:** progress, time spent, check answers and away times are stored (on the server for an account, on the device for a guest), kept 30 days, part of the export and of deletion. The architecture test that keeps the page in step gets the new tables.

## 7. Code map

### 7.1 New pure modules (each with a test)

| Module          | What it holds                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `flow.ts`       | `flow()`: the replay, the state machine steps, presence, the reason line, the pin to write                         |
| `pick.ts`       | Candidates, urgent first, fair share, continuity, remaining minutes                                                |
| `checks.ts`     | Session length, check chips, expected gain, slow, the pace question, the learned size, time spent                  |
| `struggle.ts`   | The ladder: what counts, the stretch, rotate, break, low energy hour, cool downs, Give it 5 minutes first, Face it |
| `breaks.ts`     | The activity library and its choice                                                                                |
| `placeday.ts`   | Tasks at a time making room for appointments                                                                       |
| `prep.ts`       | The prep sheet's template, travel placement, prep due dates, following the parent                                  |
| `todo-input.ts` | One validator for `/todos`, the local backend and the assistant's tools, like `task-input.ts`                      |
| `dates.ts`      | Due dates in the quick add: "Nov 5", "5.11.", "friday", "tomorrow", "in 20 days"                                   |
| `recurrence.ts` | Phase 5: which days a routine has, what to materialize, what an edit touches                                       |
| `capacity.ts`   | Phase 7: free minutes per day until a date, feasibility                                                            |

### 7.2 Changed

- `priority.ts`: `rank()` stays, `flow()` uses it for time-bound items. `switchReason` learns the new switches (session ended, rotated, break over, back).
- `now.ts`: `heroState` becomes a view of `FlowState`. No `free` kind, `tabTitle` without "Free until": "18 min - Study B", "How far? - Study B", "Break 6 min", "Away", "Plan what's next".
- `events.ts`: `detectEvents` runs on `flow()` and compares `lastCurrentKey`. New types `todo.created`, `todo.updated`, `todo.completed`, `todo.deleted`, `todo.ended`, `check.answered`, `focus.rotated`, `break.started`, `user.away`, `user.back`, `appointment.added`. `task.missed` and `task.overrun` only for tasks at a time.
- `anchoring.ts`: the stuck reasons gain "I lost energy for this" (a struggle) and "I need a break" starts a real break. `reminderDue`, `hyperfocusDue` only for tasks at a time. Leave-now for travel.
- `quickadd.ts`: no time means a to-do, a size without a time means its size, "by", "due" or "until" with a date means its due date, the appointment words, "daily" and "weekdays" mean a routine (phase 5).
- `plan.ts`: `moveLater` stays for tasks at a time. The triage gains "Do it when there is time": the task becomes a to-do of its length.
- `core/agent.ts` (`watch`): loads the to-dos and today's flow rows, runs `flow()`, writes a missing pin, emits what changed. `local/agent-loop.ts` does the same through it.
- `core/plan.ts`: travel follows and goes with its appointment, prep due dates follow, `completedAt` set and cleared.
- New core rules: `core/todos.ts` (to-do edits with events and the end with the appointment) and `core/flow.ts` (record an answer: validate, write the row, set progress and time spent, emit the event).
- `core/calendar.ts`: events become appointments.
- `core/sample.ts`: no "Free time" blocks (phase 1), then the sample week on routines, to-dos and one appointment with preparation (phase 8).

### 7.3 Components

`NowHero.svelte` (413 lines) becomes a switch over the current kind with one component per state: `HeroTask` (today's hero), `HeroTodo`, `HeroCheck` (inside the to-do hero), `HeroBreak`, `HeroAway`, `HeroPlan`. New: `TodoList.svelte`, `TodoSheet.svelte`, `PrepSheet.svelte`, `FlowSettingsForm.svelte`. `UpcomingRail.svelte` keeps Next for time-bound items only. `MissedTriage.svelte` gains the new answer. `DayTimeline.svelte` draws travel attached to its appointment and moved tasks at their placed time.

## 8. Screens

### 8.1 Now

| State                | Title (display size) | Above it                                                | Big number             | Bar                  | Buttons                                          |
| -------------------- | -------------------- | ------------------------------------------------------- | ---------------------- | -------------------- | ------------------------------------------------ |
| To-do                | Study B              | "For Exam Math, in 12 days", next step                  | session left, "18 min" | the session draining | Done, Something else, I'm stuck, menu            |
| Check                | the to-do stays      | "How far is Study B?"                                   | the progress, "25 %"   | progress             | the chips (5.4)                                  |
| Break                | the activity         | "Break"                                                 | time left              | draining             | I'm back                                         |
| Away                 | "Away since 11:20"   |                                                         |                        |                      | I'm back, I was working on Study B               |
| Face it              | the to-do            | "Pushed away 3 times. 10 minutes now, then you decide." | session left           | the session draining | Done, I'm stuck (no Something else)              |
| Good morning         | "First up: Study B"  | "Good morning"                                          |                        |                      | Start                                            |
| Plan                 | "Plan what's next"   |                                                         |                        |                      | the quick add line, Open Plan, Ask the assistant |
| Get ready            | "Get ready: Meeting" | "At 14:00"                                              | time until it, "8 min" |                      |                                                  |
| Day is done          | "Day is done"        | "Next: Dinner 18:00"                                    |                        |                      | Undo in the menu                                 |
| Task, time up, night | as today             |                                                         |                        |                      | as today                                         |

The to-do hero's progress is a thin labeled meter under the number ("25 %, 4 h of about 15 h"), so the session bar and the progress never look alike. The menu: Update progress, Take a break, Do something else (the same as the button), Edit, Call it a day, Drop. On phones the check's chips sit in the sticky action row at the bottom edge, like the buttons today.

The rail: the clock, "3 done today" (to-dos count too), the agent card, Next (time-bound items only, the first one with "in 50 min"), the alarms, the missed button, the quick alarms, the silence line. No to-do queue: one thing at a time.

### 8.2 Plan

Plan stops being a calendar with a list on the side. It opens on **To do**, the place things are dropped into, and the timeline becomes **Fixed times**, the frame for what really has a time. Capture stays one line on Now, on Plan and (later) `Shift+Space`: a title is enough.

- **To do**, first on wide screens with Fixed times beside it, the first tab on phones: "For appointments" (grouped under the appointment and its date) and "Other". A row: title, due ("in 12 days"), "4 of about 15 h" with the progress, phase 7 adds "on track", "tight", "does not fit". Actions: Do this now, Done, Drop (Undo), the row opens the sheet.
- **The to-do sheet:** title, size chips, due (None, Today, Tomorrow, Pick a date, an optional time), priority, part of (shown, not editable), next step, progress slider, note.
- **The task sheet:** the kind chip (Task at a time, Appointment), for a task "Can move by" chips, for an appointment its travel and preparation (the prep sheet's content, editable later).
- **The quick add line** makes all three (5.10, 7.2), the live preview names the kind: "To-do, about 10 h, due Thu 5 Nov".
- **The timeline:** travel sits on top of its appointment in the same color with a "Drive to uni" label, a moved task sits at its placed time with "moved for Meeting".

### 8.3 Settings

Under Reminders and sound: "Ask how it's going every" (15, 25, 30, 45, 60 min) and "Break length" (5, 10, 15 min). Under Time: "Start working at" (a time, the start call of 4.8) and "Arrive early by" (0, 5, 10, 15, 30 min). Nothing else: the ladder, the timings of Away, the mechanisms of 5.14 and the pick are fixed rules, not choices. Every switch would be one more decision, and a way to turn the driver off on a bad day, which is the day it matters most.

## 9. The assistant

Optional, every rule above works without it.

- **Tools:** `list_todos`, `add_todo`, `update_todo` (size, due, priority, next step, status, never the progress: only the user knows it), `delete_todo`. `add_task` gains `kind`, `shift` and `parent_id` for travel. Validated by `todo-input.ts` and `assistant-tools.ts`, logged to `agent_actions` with Undo, unprompted edits only with autonomy act, as today.
- **Prompts:** chat and reactions see the open to-dos (id, title, due, size, progress, part of) and today in one line each (current, sessions, struggles, away).
- **Steps for an appointment:** "Suggest steps" in the prep sheet is one `buildRequest` call with a new use `prep` (effort low), a JSON answer validated by a pure `parsePrepSuggestion`, nothing written until Add. A guest's device makes the same call through `openai-direct`. `appointment.added` lets the agent offer steps for an imported appointment as an ask card (autonomy suggest) or add them with Undo (act).
- **Next tiny step:** "I'm stuck" with "It feels too big" asks the agent for one next step, written to the to-do's `nextStep` (act) or offered as a card (suggest). Without a key, today's fixed hint and timer.
- **Event toggles:** new defaults on: `appointment.added`, `focus.rotated` (only rotations from a struggle). The rest off. Guardrails, quiet hours, the budget and the rate limits apply unchanged.
- **The agent never picks the current to-do and never places work blocks.** The engine decides, the user chooses, the agent helps with words and steps.

## 10. Phases

Points on the roadmap's scale (1 is about half a dev day). Each phase ends green (`bun run verify`), with its schema applied, `CLAUDE.md` and the Privacy page in step, and is usable on its own.

### Phase 1: to-dos fill the day (17)

| Step | What                                                                                                                                                                                                                                               | Pts |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1.1  | `todos` and `flow_log`: tables, IndexedDB step, repo port and contract suite, `todo-input.ts`, both backends, `/todos` and `/flow`, stream hints, export version 2, move into an account, Privacy page. `completedAt` on tasks (presence needs it) | 5   |
| 1.2  | `flow.ts` first version: time-bound items win, time up as today, to-do sessions of fixed length with pins, presence from Start and Done (no checks yet), plan, ready, rest, night. `pick.ts`. `watch` and the guest's tick on it, `lastCurrentKey` | 6   |
| 1.3  | Now: the to-do hero, plan and good morning, Next without to-dos, tab titles, no "Free time" anywhere, Call it a day                                                                                                                                | 3   |
| 1.4  | Plan: the To do panel and sheet, the quick add for to-dos and due dates (`dates.ts`), the triage's "Do it when there is time", the sample without "Free time"                                                                                      | 3   |

Proof: `flow.test.ts` green with 4.2 (without the checks), 4.7 and 4.8 (without the start call). A simulated day with one open to-do never shows `plan` inside My day. `grep -ri "free time" src` finds nothing.

### Phase 2: it asks how it's going (9)

| Step | What                                                                                                                              | Pts |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --- |
| 2.1  | `checks.ts`: lengths, chips, slow, the pace question, the learned size, time spent, Keep going at most twice, the size asked late | 2   |
| 2.2  | `flow.ts`: checks, asking again, Away, I'm back, "I was working on it". `core/flow.ts` records the answers                        | 3   |
| 2.3  | Now: the check in the hero, the crossfade and tone, the away hero, the setting                                                    | 3   |
| 2.4  | The start call from "Start working at" and the call back from Away                                                                | 1   |

Proof: 4.6 and 4.8 green. A slow answer with a size asks the pace question, "bigger than I thought" sets the learned size. Away never starts during an appointment (property test). The start call rings at 09:00 and every 15 min until Start.

### Phase 3: rotation, breaks and holding on (9)

| Step | What                                                                                            | Pts |
| ---- | ----------------------------------------------------------------------------------------------- | --- |
| 3.1  | `struggle.ts`: the ladder, cool downs, the low energy hour                                      | 2   |
| 3.2  | `breaks.ts`: the library and its choice                                                         | 1   |
| 3.3  | `flow.ts`: breaks, cut by time-bound items, break over, rotations, Undo                         | 2   |
| 3.4  | Now: Something else, the reworked stuck reasons, the break hero, toasts with Undo, break length | 2   |
| 3.5  | Give it 5 minutes first, `skips` and Face it, the honest cost of Call it a day                  | 2   |

Proof: 4.3 and 4.4 green, including Lunch ending a break. Something else at minute 2 of a fresh to-do gives the 5 min try and switches at minute 7 by itself. A to-do pushed away three times on two days gets a 10 min Face it session and its question.

### Phase 4: appointments with preparation (9)

| Step | What                                                                                                               | Pts |
| ---- | ------------------------------------------------------------------------------------------------------------------ | --- |
| 4.1  | `kind`: calendar events as appointments, appointments end on their own, the kind chip in the preview and the sheet | 2   |
| 4.2  | Travel: placement, following and deleting with the appointment in every path, leave now ringing, the timeline      | 3   |
| 4.3  | Prep to-dos and the prep sheet with the template, `prep.ts`, ending with the appointment                           | 3   |
| 4.4  | `appointment.added` emitted (the assistant answers it in phase 6), arrive early setting                            | 1   |

Proof: 4.1 green: moving the exam moves travel and the due date, the prep to-do ends at its progress, nothing asks "Did you do Exam Math?".

### Phase 5: tasks at a time make room and repeat (10)

| Step | What                                                                                                             | Pts |
| ---- | ---------------------------------------------------------------------------------------------------------------- | --- |
| 5.1  | `placeday.ts`, `shift` in the sheet, the moved drawing on Plan                                                   | 3   |
| 5.2  | Routines: table and store, `recurrence.ts` with a property test, materializing, edits, Undo, quick add daily     | 5   |
| 5.3  | First run: the essentials (meals, meds, bed) as routines with one time each (roadmap E6), the sample on routines | 2   |

Proof: 4.5 green. A daily routine appears on the right days in three timezones and across a daylight saving change.

**Milestone: usable.** After phase 5 the author runs the real week on it. The checklist for "usable": four exams studied for without one study block placed by hand, no "Free time" inside My day for 7 days, every away caught within 5 min of a missed check, every late morning started by the call, at least one to-do faced after being pushed away, Lunch moved around a real meeting at least once, an exam with travel that rang on time, and every automatic rotation or break felt right or was undone in one tap.

### Phase 6: the assistant joins (6)

Tools and prompts (2), steps for an appointment with the `prep` use and `appointment.added` (2), the next tiny step on "It feels too big" (1), event toggles and defaults (1).

Proof: tests with the fake model: a suggestion never writes before Add, autonomy act writes with Undo, every guardrail stays silent without a model call as today.

### Phase 7: will it fit (6)

`capacity.ts`: free minutes per day until each due date from the placed days and My day, times a realistic share (60 %, tested) (2). The pick's fair share and urgency use it (1). "On track", "tight" and "does not fit" per to-do, one line on Plan when the to-dos due before a date need more than its free time ("Your to-dos need about 52 h before Nov 5, about 40 h are free.") (2). Due-today to-dos in Next at their due time (1).

Proof: pure tests, including the four exams over three weeks. This is roadmap A10 (the overbooked warning), grown up.

### Phase 8: polish and docs (3)

The sample week on routines, to-dos and one appointment with preparation. `CLAUDE.md`: the principle, the state, the schema, the routes, the Now section. Privacy and Terms checked line by line. A visual pass on a phone and a wide screen for the new heroes. `roadmap-1.0.md` and `feature-ideas.md` tagged.

**Total: 69 points**, about 35 dev days, seven weeks full time. "Usable" (phases 1 to 5) is 54 points, about five and a half weeks.

## 11. Tests

- **The scenarios in section 4** as table tests of `flow()`, one behavior per test, named after the sentence ("Lunch moves after the meeting when it fits within its shift").
- **A day simulator** in `src/test/simulate.ts`: steps `flow()` minute by minute over a day with a scripted user (answers, taps, silence), writing pins and answers like a device would. The four exams, the stuck afternoon and the silent hour run as whole days.
- **Properties** (fast-check style, as `recurrence.test.ts` will need anyway): inside My day with an open to-do the current is never `plan`; without a new row, a time-bound item or the session's end, the current never changes inside a session; a time-bound item always wins its minutes; Away never starts during a time-bound item; equal to-dos split a simulated day within 15 %; over a simulated week every open to-do gets time.
- **The three timezones of the gate**, plus daylight saving days for sessions near midnight and routines.
- **Core:** `core/todos.ts` and `core/flow.ts` against the contract suite's repo and a fake model, once for both backends (the both-backends rule of the checks plan).
- **Routes:** `/todos`, `/flow`, `/routines` in the login and ownership matrices. A bug fix starts with a failing test, as always.

## 12. Effect on the roadmap

This plan changes promise 3 ("the hard moments are designed": stuck, losing steam and nobody answering get a way forward) and promise 4 ("it holds a real week": routines and to-dos). It also changes how 1.0 is described: section 1 of the roadmap says the app "shows what to do right now". After this plan it decides what to do, holds the user to it and calls them back. It proposes a new pillar **I. Flow** of 69 points in `roadmap-1.0.md`:

| Roadmap item                                           | Becomes                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| C1 Recurring tasks (5)                                 | Phase 5.2                                                                   |
| C4 `startedAt` and `completedAt` (1)                   | `completedAt` in phase 1.1, start times come from the flow log              |
| A10 Overbooked warning (1)                             | Phase 7                                                                     |
| E6 First run essentials (1)                            | Phase 5.3                                                                   |
| A9 Push the rest of the day (2)                        | Dropped: to-dos have no times, tasks at a time make room on their own       |
| A8 Missed triage (3)                                   | Stays, for tasks at a time only, with "Do it when there is time"            |
| 1.1: leave-by alarms, break it down, estimate learning | Leave-by is phase 4.2, the next tiny step phase 6, the learned size phase 2 |

Net 135 + 69 - 10 = 194 points, 58 done (30 %). The order this plan proposes: **Solid** without C4, then **Flow** phases 1 to 5, then dogfood starts (the critical path of G5 starts weeks earlier than planned), then **Calm** (it reworks screens that Flow changes, doing Calm first would mean doing those screens twice), then the rest of Rhythm (inbox, end of day) and Flow phases 6 to 8, then Reach and Launch.

From `feature-ideas.md` this builds, fully or in part: Task aging (Face it), Deadlines with backward planning, Leave-by alarms, Next tiny step, Mid-task check-in, Gentle drift question, Pick for me, Fit the gap (gone: there are no gaps), Dopamine menu (the break library), Break it down (one step, not a list), Estimate learning (the learned size).

## 13. Decisions for you

Each with the answer this plan assumes.

1. **Rotation on struggle:** automatic with Undo, or asked first? Assumed automatic: someone who just said they cannot focus should not have to choose.
2. **The break after two rotations:** started on its own with "Keep working instead", or offered? Assumed started on its own.
3. **Call it a day:** exists, as rest the user chooses, never proposed except as the ladder's last step. Without it the app pushes to-dos until My day ends every evening.
4. **Check every 30 min, warm-ups of 15 min.** Change the default?
5. **Asked again after 2 min, Away after 5.** Change the timings?
6. **The default kind:** a one-off item with a time made in the app is a task at a time unless marked (or worded) as an appointment, calendar events are appointments.
7. **No energy question after a break or a meal:** the app resumes what was going well, the warm-up check catches a low.
8. **Time while away counts only after "I was working on it"**, at most 2 h.
9. **The 5 min check-in chime** keeps chiming during to-do sessions and stops in appointments, breaks and Away. The alternative is to retire it now that the check exists.
10. **The roadmap order of section 12:** Flow before Calm.
11. **How firm the calls are:** the start call every 15 min until Start, and Away calling back every 30 min. The alternative is Away exactly as you described it, silent until I'm back.
12. **Give it 5 minutes first and Face it** are always on. Face it is a 10 min session that cannot be switched away from (a break still can).
13. **No switch that turns the driver off.** The mechanisms of 5.14 are rules, not settings. The alternative is an "easy day" switch, which would be used on exactly the days the driver is needed.
14. **The Calm principle in `CLAUDE.md`** gets its second half: calm in how it looks, firm in what it does.

## 14. Not in this plan

- Sub-steps as a tree. A to-do has one next step, the assistant can rewrite it.
- Energy tags per to-do and learning when the user focuses best (the parked adaptive behavior model). The low energy hour uses the size instead.
- Travel times from a map service. The user picks the minutes, the assistant can guess.
- Checks on a closed app. Web Push (B2) can carry them later, the flow log already holds what it needs.
- Shared to-dos, the capture inbox (C2, an inbox item would become a to-do without a size), the end-of-day summary (C3, the flow log feeds it).
- Aggressive mode (`feature-ideas.md`) stays a separate opt-in. Asking again with a tone and a crossfade is as loud as the calm default gets.
