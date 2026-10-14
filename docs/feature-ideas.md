# Feature Ideas (Brainstorm)

Raw inspiration, not a roadmap. Nothing here is decided. Ideas marked **(planned)** or **(parked)** already appear in `TODO.md` / `CLAUDE.md` and need discussion before work starts. "Wrap-up cue before a task ends" and "Hyperfocus exit ramp" moved to `docs/soon-plan.md` (Part 4).

**Rating (1 to 10)** = how much this would improve the day of a person with ADHD if done well. It measures impact only, not effort. Effort is the scope section.

**Scopes**

| Scope               | Rough effort for one dev                                    |
| ------------------- | ----------------------------------------------------------- |
| XS                  | An hour to an afternoon                                     |
| S                   | One to two days                                             |
| M                   | Three days to a week                                        |
| L                   | One to three weeks                                          |
| XL                  | One to three months                                         |
| Way out             | Team or company sized, not something one dev should plan    |
| Impossible but cool | Physics, biology or the current state of technology says no |

Within each scope the ideas are sorted by rating, highest first.

---

## Start here: best impact per effort

The ideas that look like the strongest return on a small investment. Details are in their scope sections.

1. **Push the rest of the day** (S, 9)
2. **Save your place before a switch** (S, 9)
3. **Fit the gap / waiting mode helper** (S, 9)
4. **Leave-by alarms for appointments** (S, 9)
5. **Record actual start and finish** (XS, 8, unlocks a lot)
6. **Overbooked day warning** (XS, 8)
7. **Break it down button** (S, 9)
8. **Overwhelmed button** (S, 9)
9. **Missed tasks: one-tap rehome** (S, 9)

---

## XS: an hour to an afternoon

- **Record actual start and finish** `8/10`
  Store `startedAt` (first moment the task was current with the screen visible, or a Start tap) and `completedAt` on each task. Invisible on its own, but it is the foundation for estimate learning, honest end-of-day summaries and task aging. Time blindness can only be corrected with real data.

- **Overbooked day warning** `8/10`
  Pure function: sum of unfinished task minutes vs. minutes left until `dayEnd`. When the plan cannot fit, the Plan view says so in one calm line ("About 90 minutes more than fits today"). ADHD planning is chronically optimistic; this catches it at planning time instead of at 9 pm.

- **Wire up focus mode** `7/10`
  `enableFocusMode` already exists in the schema and is unused. Make it hide the rail, missed strip and card strip so only the current task and its remaining time stay. One thing at a time, taken literally.

- **Variable completion reward** `6/10`
  Rotate between a few completion chimes instead of always the same one, occasionally a slightly "bigger" one. Variable rewards keep dopamine feedback from going stale. Still calm, no confetti.

- **Keyboard shortcuts on Now** `6/10`
  `D` done, `S` stuck, `P` push, `F` focus mode, `?` shows them. Fewer clicks between intention and action on the desktop display.

- **Shame-free wording audit** `6/10`
  Go through every string and remove guilt words ("overdue", "failed", "missed" as a judgement). "This did not happen. Where should it go?" Rejection sensitivity is real and shame is a strong reason people abandon planners.

- **"Pick for me"** `6/10`
  When the user is choosing between options (inbox, free time suggestions, tied tasks), a button that just decides. Decision paralysis is a bigger blocker than the decision itself.

- **Done today, one line** `5/10`
  A faint "4 done today" under the hero. Not a stat tile, one quiet line. Counters the "I did nothing today" feeling that ADHD brains produce even on productive days.

- **Configurable reminder interval** `5/10`
  The 5 minute "still on this" chime is fixed. Some people need 2 minutes, some 15, some never.

- **Verb-first placeholder** `4/10`
  Quick add placeholder nudges toward action phrasing ("Call dentist", not "Dentist"). A task that starts with a verb is easier to start.

- ! **Dyslexia-friendly / larger font option** `4/10`
  Comorbidity is common. A font and size toggle in settings.

---

## S: one to two days

- **Push the rest of the day** `9/10`
  One button on Now: "I'm behind by 15 / 30 / 60 min". Shifts every unfinished task from now on, keeps order, shows Undo. Tasks that would cross `dayEnd` land in a "did not fit" list. Running late is the default ADHD state; fixing the plan should take one tap, not ten drags.

- **Save your place before a switch** `9/10`
  When the current task is about to switch (or the user marks it done or is pulled away), offer a one-line "where am I?" note ("halfway through section 3, next: the chart"). The note is shown on top of the hero the next time that task (or its continuation) becomes current. Cuts the cost of getting back into a task, which for ADHD is often the reason it never gets resumed.

- **Fit the gap / waiting mode helper** `9/10`
  "Waiting mode" is the ADHD state before an appointment where nothing gets done because something is coming. In free time before a task, show "You have 35 min until Dentist" plus up to three short tasks (from inbox or unfinished tasks) that fit, with a hard stop cue built in. Turns dead time into safe time.

- **Leave-by alarms for appointments** `9/10`
  Tasks can be marked as appointments with a "travel minutes" and "getting ready minutes" field. The app rings at "start getting ready" and "leave now", not at the appointment time. Being late is a top ADHD pain point and almost every calendar gets this wrong.

- **Break it down button** `9/10`
  Next to Stuck: "Break it down". The assistant returns 3 to 6 tiny physical steps ("open laptop", "open the doc", "write one ugly sentence"), the hero shows only the current step with a checkbox. Falls back to a fixed template without a key. Task initiation is the core ADHD problem; the first step has to look trivially small.

- **Overwhelmed button** `9/10` **(parked as Crisis Mode)**
  A simple version: one tap collapses the day to the next single thing, hides everything else and (with a key, autonomy act) asks the agent to propose what to drop or move. The full Crisis Mode can stay parked; this is the minimal version.

- **Missed tasks: one-tap rehome** `9/10`
  Every item in the missed strip gets three buttons: "Later today" (next free slot that fits), "Tomorrow", "Drop". No drag, no thinking. Missed tasks currently ask for a decision the user is least able to make in that moment.

- **Agent "about me" notes** `8/10`
  A free text field in settings ("I crash after lunch", "mornings are my best focus", "phone calls take me forever to start") that goes into every system prompt. Cheap, and makes every reaction and replan feel like it knows the person.

- **Next tiny step on the hero** `8/10`
  An optional "first step" field per task. When set, the hero shows it bigger than the title ("Open the tax folder" above "Taxes"). The title is the goal, the step is what you actually do now.

- **Morning briefing** `8/10` **(planned)**
  `day.started` event: one card with the shape of the day, the one most important thing, and anything that does not fit. Spoken if voice replies are on.

- **End-of-day shutdown** `8/10` **(planned as end-of-day summary)**
  At `dayEnd`: what got done (honest, warm), one tap to move all unfinished tasks to tomorrow or drop them, then the screen goes dark and calm. A defined end prevents the open-loop guilt that keeps ADHD brains awake.

- **Time-timer disc** `8/10`
  A shrinking colored disc or bar (like the physical Time Timer) that shows remaining time as an amount, not a number. Time is felt visually instead of read. Colors follow the existing urgency tokens.

- **Basics check** `7/10`
  Optional quiet prompts at chosen times: "Eaten? Water? Meds?" with one tap per item. Hyperfocus regularly skips meals and medication. Built on the existing alarm system.

- **Voice quick add on Now** `7/10`
  Hold a key or button on Now to say a task; it goes through transcribe and quick add parsing without opening the drawer. Capturing a thought in 3 seconds is the difference between keeping it and losing it.

- **Race the clock** `7/10`
  Optional challenge framing for boring tasks: "Beat 12 minutes". The ADHD nervous system responds to urgency, novelty and challenge; this manufactures a little of each.

- **Dopamine menu** `7/10`
  The user keeps a short list of quick rewards and good breaks (walk, tea, one song). When a break or free time comes up, the app suggests one from the list instead of letting the phone fill the gap.

- **Mid-task check-in** `7/10`
  For long tasks, the agent schedules a wakeup halfway ("Still on the report?") with one-tap answers. A lightweight body double. Uses existing wakeups and guardrails.

- **Bedtime guard** `7/10`
  After `dayEnd` the Now screen turns into a dim "Day is done" view with a single wind-down task, and a firm alarm at bedtime. Targets revenge bedtime procrastination.

- **Brown noise / focus sound** `7/10`
  A synthesized brown or pink noise toggle on the display device (Web Audio, no files). Many people with ADHD focus better with it; having it in the anchor app removes one more thing to set up.

- **Share target capture** `7/10`
  Register the PWA as a Web Share Target so a link or text shared on the phone lands in the inbox. Capture from wherever the thought happens.

- **Photo of a paper list** `6/10`
  Snap a handwritten list, a vision model turns it into tasks for the inbox. Paper is still where many plans start.

- **A "why" per task** `6/10`
  Optional one line: why this matters or what the reward is. Shown when Stuck is pressed. Connects a boring task to something the user cares about.

- **Per-task energy tag** `6/10`
  High focus / low focus / physical. The agent and fit-the-gap suggestions use it ("you have 20 minutes and low energy: these fit").

- **Duration suggestion in quick add** `6/10`
  When no duration is typed, suggest one from history of similar titles (needs actual durations) instead of a fixed default.

- **Printable day** `4/10`
  One-page print or PDF of today for people who think better on paper or want it on the fridge.

---

## M: three days to a week

- **Capture inbox** `9/10` **(planned)**
  `Shift+Space` from anywhere in the app, type, Enter, gone. Inbox items have no time. Free time, fit-the-gap, the morning briefing and the agent pull from it. The parking lot for intrusive thoughts during a task.

- **Estimate learning** `9/10`
  With real start and finish data, learn how long things actually take per kind of task and show it gently while planning: "Emails usually take you 1.7x your estimate". Optionally auto-pad durations. Directly attacks time blindness with the user's own evidence.

- **Web Push** `9/10`
  Reminders, alarms and wakeups reach a closed app and the phone (with vibration, which also reaches many smartwatches). Currently the biggest gap: the anchor only works while the screen is open and looked at.

- **Smart replan: "I lost the afternoon"** `9/10`
  One request: the agent rebuilds the rest of the day by priority, keeps fixed appointments, drops or moves the lowest value tasks, shows it as a proposal with one Accept and Undo. `replan` already exists as a use.

- **Task aging** `8/10`
  Count how often a task was moved or missed. At 3, it gets a gentle flag: "This keeps sliding. Break it down, ask someone, or drop it?" Chronic postponement usually means the task is too big, too vague or not actually wanted.

- **Deadlines with backward planning** `8/10`
  A task can have a due date separate from its scheduled slot. The agent proposes work sessions before the deadline and warns early when the remaining sessions do not fit. ADHD brains only feel deadlines when they are close; this moves the feeling earlier.

- **Routines as step-through chains** `8/10`
  Morning routine, leaving the house, shutdown: a chain of small steps shown one at a time on the hero, each with its own short duration and a tick. Works with recurring tasks.

- **Recurring tasks** `8/10` **(planned)**

- **Home Assistant / smart lights** `8/10`
  Webhook on task switch, overrun and alarm. The room light shifts color with urgency, the desk lamp pulses once at a switch. External anchoring that does not require looking at a screen at all.

- **Protect this block** `8/10`
  Mark a task as deep work: reminders and agent cards are held until it ends, and if it overruns the app offers to push the following tasks instead of nagging.

- **Stuck flows per reason** `8/10`
  Turn each stuck reason into a short tailored path: "too big" leads to break down, "boring" to race the clock or a reward, "don't know how" to a 10 minute research step, "anxious" to the smallest possible first move. Partly exists as fixed hints today.

- **Clock-face day view** `7/10`
  A 12 or 24 hour dial with tasks as arcs and a hand for now. Many people with ADHD read time spatially much better than as a list.

- **Medication window** `7/10`
  User-defined "my focus window" after taking meds (the user sets it, no medical claims). The agent prefers putting high focus tasks there and the timeline shades it.

- **Physical buttons** `7/10`
  Support a cheap ESP32 or Flic button: single press done, double press stuck, long press push. Completing something with a real click on the desk is satisfying and needs no screen.

- **Weekly review** `7/10`
  A calm, guided 10 minute flow: what happened, what kept sliding, what next week must contain. One question at a time. Without it, the plan drifts away from reality.

- **Messenger bot** `7/10`
  Telegram or Matrix bot for the assistant: capture tasks and get alarms from the phone's messenger, which people check anyway.

- **Focus status sync** `7/10`
  Set Slack / Discord status and phone Do Not Disturb (via automation webhooks) during focus tasks, clear it afterwards.

- **Gentle drift question** `6/10`
  If the current task was never started (no Start, no interaction) 10 minutes into its window, the display shows one soft question: "Starting, moving, or skipping?" Avoids silent drift without being loud.

- **Someday list resurfacing** `6/10`
  Low priority ideas go to "someday" and one random item is resurfaced each week. Fixes object permanence (out of sight, out of mind) without cluttering today.

- **Music integration** `6/10`
  Start a chosen focus playlist when a deep work task starts, pause it at the switch. A strong sensory transition cue.

- **Offline read-only Now** `5/10`
  Keep the last loaded day in memory so a short outage does not blank the anchor. Must stay read-only and must not become a localStorage task fallback (explicitly avoided in the project rules).

- **E-ink / ultra calm display mode** `5/10`
  High contrast, no animation, minute-level updates, for e-ink panels or very old tablets used as a dedicated anchor screen.

- **Email to inbox** `5/10`
  A private address that turns forwarded mails into inbox items.

---

## L: one to three weeks

- **Always-on-top mini window** `9/10`
  A desktop companion (Tauri or a native wrapper) that shows the current task and remaining time as a small floating strip above every app. For anyone without a second screen, this is the anchor. With a second screen, it still follows the eyes when they leave it.

- **Browser extension** `9/10`
  New tab page shows the current task. During focus tasks, distracting sites get a soft wall ("You're on: Write report. Open anyway for 5 min?"). Adds friction exactly where ADHD distraction happens, without hard blocking.

- **Activity awareness (opt-in, local)** `9/10`
  Integrate with ActivityWatch or a small local daemon: knows which app or site is active, compares with the current task, and the agent can notice drift ("20 minutes on YouTube during the report, want to push or come back?"). Also gives true actual durations. Privacy sensitive: local data only, summaries only, strict opt-in.

- **Google Calendar two-way sync** `8/10` **(planned)**

- **Resume cards with context** `8/10`
  Extends "save your place": with the desktop companion, also remember the open file, URL or folder when a task was last active, and reopen them with one click when it becomes current again.

- **Accountability partner** `7/10`
  Share a minimal view with one trusted person: only "done / not done" for flagged tasks, or a daily one-line summary. External accountability works very well for ADHD, but it must stay opt-in per task.

- **Live body doubling** `7/10`
  Invite a friend into a shared session: both see each other's current task title and a presence dot, nothing else. Working "next to someone" without video.

- **Adaptive behavior model** `7/10` **(parked)**
  Learn when the user actually gets things done (time of day, task type, energy) and let the agent schedule accordingly.

- **Webcam presence (local only)** `6/10`
  On-device presence detection on the display device: knows if anyone is at the desk, so anchors escalate only when the user is actually there and stop when they left. Privacy heavy, opt-in.

- **Anti-context-switch scheduler** `6/10` **(parked)**
  Batch similar small tasks (calls, mails, errands) into blocks automatically.

- **Integrations import** `6/10`
  Pull open items from Todoist, GitHub issues, Notion, mail flags into the inbox. Fewer places to remember.

- **Household mode** `5/10`
  Shared chores between people living together, each with their own Now screen. Many ADHD struggles are domestic.

---

## XL: one to three months

- **Native apps with live lock-screen activity** `9/10`
  iOS Live Activities and an Android ongoing notification that show the current task and a countdown on the lock screen and the always-on display. The anchor travels with the user away from the desk.

- **Watch app with haptic transitions** `8/10`
  A distinct tap pattern for "task starting", "wrap up" and "overrun" on the wrist. Anchoring that works in a meeting, in the kitchen or on a walk, and no one else notices.

- **Agent that does the boring part** `8/10`
  With computer use or tool integrations, the agent prepares the dreaded admin task: drafts the email, fills in the form, finds the document, then hands it over for a final check. Many ADHD blockers are 5 minute tasks that feel like a mountain.

- **Skill programs** `7/10`
  Short evidence-based ADHD coping modules (in the style of CBT for adult ADHD) introduced one skill per week, practiced inside the app ("this week: the 2 minute start"). Needs expert input to be honest.

- **Coach view** `6/10`
  A read-only weekly summary the user can share with an ADHD coach or therapist. Turns the planner into material for real support.

- **On-device model** `6/10`
  A small local model (WebGPU) for breakdown, stuck hints and quick add so basic AI works without a key, offline and privately.

- **Full Crisis Mode** `6/10` **(parked)**
  A complete overwhelm protocol: reduce the day, contact a chosen person, grounding steps, recovery plan for tomorrow.

---

## Way out: not something one dev should plan

- **Notification firewall across all devices** `9/10`
  Every notification from every app and person routes through the planner, which holds anything non-urgent until the next task boundary and releases it in a calm batch. Interruptions are the biggest productivity killer for ADHD; this would remove them at the source. Partly doable on Android, nearly impossible on iOS.

- **AR peripheral timer** `8/10`
  Smart glasses that show the current task's remaining time as a slowly changing color at the edge of vision. Time you never have to look at.

- **Room projection anchor** `8/10`
  A projector plus camera that highlights the actual object of the current task (the laundry basket, the desk drawer with the tax papers). The task literally points at itself.

- **Clinical study** `7/10`
  A real study with ADHD researchers measuring whether the app improves outcomes, and which features matter. Would make every future decision evidence based.

- **Body doubling network** `7/10`
  A Focusmate-like matching service built in: one tap and you are working next to a stranger for 50 minutes.

- **Cross-user estimate model** `6/10`
  Privacy-preserving (federated) learning of how long tasks really take across many users, used as the starting point before personal data exists.

---

## Impossible but cool

- **Drift detector** `10/10`
  A comfortable sensor that notices the exact second attention drifts away from the task and gives one gentle tap back. Not the moment after 20 minutes of scrolling, the moment it starts.

- **Felt time** `10/10`
  A sense of time passing that feels like a body sense, as reliable as feeling cold. Time blindness, cured.

- **Future-you on the line** `9/10`
  A message from yourself three hours from now, with the actual emotional weight of how that version of you feels about what you are doing right now.

- **The task comes to you** `9/10`
  A household robot that does not do the chore, but hands you the first object of it at the right moment. The dishes sponge appears in your hand at 18:00.

- **Perfect estimator** `8/10`
  Type any task, get its true duration for you, today, in your current state. Never wrong.

- **Undo the last 20 minutes** `8/10`
  Real Undo for time, not just plan edits. Scrolled away the morning? Toast: "Undo".

- **Instant interest switch** `8/10`
  Make any boring task feel exactly as interesting as the thing you would rather be doing, on demand, without side effects.

- **Telepathic body double** `7/10`
  The quiet presence of someone working beside you, available anytime, with no one actually needing to be there.
