# UI Rework Plan

Status: draft for review. Decisions taken so far are marked **[decided]**, defaults I chose are marked **[default]** and are open for veto.

## 1. Product definition

ADHD Tasker is an **ambient priority display**. It runs fullscreen on an always-on second screen and answers one question at a glance: _what should I be doing right now, and what is coming next?_ The user trusts it instead of re-deciding, scrolling, or sinking time into an unnecessary task.

Usage **[decided]**: desktop-first (permanent second screen), fully responsive down to phone. Focus view is the primary idea, not an optional mode.

### In scope (final)

| Area                     | What it is                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now** (home)           | Current top-priority task in an urgency color, countdown, Done + undo, and a rail of the following tasks so the user can prepare mentally         |
| **Plan**                 | Dated days, timeline and list view, quick add, touch-friendly drag and resize                                                                     |
| **Assistant**            | Text + voice conversation that reads and edits the plan, challenges conflicts, and talks back                                                     |
| **Agent events**         | Every plan change and task switch becomes an event the AI can react to (comment, ask, edit the plan, set an alarm) or ignore                      |
| **Scheduler and alarms** | The AI can wake itself at chosen times (e.g. "check if the user is done at 15:40") and set timed alarms with its own tones, plus user-made alarms |
| **Anchoring**            | Chime on switch and every 5 min, overdue handling, hyperfocus alarm, "I'm stuck"                                                                  |
| **Settings**             | Timezone, sound, theme, reminders, OpenAI key                                                                                                     |
| **Platform**             | Fullscreen API, Screen Wake Lock, PWA install                                                                                                     |

### Out of scope for now

Adaptive behavior model, Crisis Mode, Anti-context-switch scheduler, full analytics dashboard (replaced later by a small end-of-day summary), Google Calendar sync (needs dated days first, comes after this rework).

## 2. Priority engine

The screen is only trustworthy if the ranking is predictable and explainable. Extract it into one pure, unit-tested function `rank(tasks, now) -> { current, upcoming[], missed[] }` in `src/lib/priority.ts`. The page only renders its output.

**[default] Rules**

1. Candidates are today's tasks that are not completed.
2. **Current** = among tasks whose time window contains `now`, the highest priority; ties go to the earlier start, then the shorter task.
3. A higher-priority task that starts preempts the current one. The preempted task is not lost: it moves to `upcoming` with its remaining time.
4. **Upcoming** = not-yet-started tasks by start time (the rail shows the next 3 to 5, configurable).
5. **Missed** = window ended without completion. Never silently the top item. Shown as a quiet strip with one-tap "reschedule" or "drop".
6. When nothing is current: show the next task with a "starts in" countdown, or a calm "free time" state.
7. Every switch shows a one-line reason ("Critical task started", "Previous task done"), so the user keeps trusting it.

`rank()` is shared code: the client renders its result, and the server runs the same function on a scheduler tick to detect `task.switched`, `task.missed` and `task.overrun` for the agent (section 6). One ranking, two consumers, so what the screen shows and what the AI reacts to can never disagree.

## 3. Visual design

### Urgency scale

Replace the current time-left-only traffic light with a single urgency level (0 to 3) derived from **priority and time pressure**:

| Level | Meaning                                        | Color feel         |
| ----- | ---------------------------------------------- | ------------------ |
| 0     | Calm: low priority, plenty of time             | Cool blue-green    |
| 1     | Normal                                         | Soft amber-neutral |
| 2     | Pressing: high priority or under 25% time left | Warm orange        |
| 3     | Critical or overrunning                        | Red                |

- Tokens `--urgency-0..3` plus foreground tokens in `src/app.css`, tuned for WCAG AA text contrast in light and dark.
- Color changes crossfade slowly (1 to 2 s). No flashing, no pulsing, no decorative elements.
- Priority is also shown as a non-color cue (label + bar segments) for color-blind users.

### Layout (Now)

Wide screen:

```
+--------------------------------------+-------------------+
| 14:32                       [mic][..]| NEXT              |
|                                      | 15:00  Call dentist   15m
|   CURRENT TASK TITLE                 | 15:30  Groceries      45m
|   description                        | 16:30  Study          2h
|                                      | 18:00  Dinner         1h
|   00:23  remaining   [====----]      |                   |
|                                      | MISSED (1)        |
|   [ Done ]   [ I'm stuck ]           |                   |
+--------------------------------------+-------------------+
```

- Hero takes roughly 2/3, rail 1/3. Everything legible from across a room (title at least 6vw clamp, tabular-nums clock).
- The first upcoming item gets slightly more weight and shows its description as a "prepare" hint.
- Phone: hero on top, rail below, single column, sticky Done button.
- Chrome: one thin auto-hiding top bar (clock, mic, Plan, menu). No sidebar, no stat tiles, no footer, no emoji.

### Typography and system

- One display style for the title and countdown, one body style. Large tabular numerals for time.
- Keep shadcn-svelte primitives (button, dialog, sheet, dropdown, slider). Remove hand-rolled badge-color maps from `+layout.svelte`, `TaskList` and `edit` and replace them with one shared `priority`/`urgency` module.
- Night behavior: optional dimmed palette after a configured hour, to suit a bedroom screen.

## 4. Plan screen

- Day switcher (today, tomorrow, pick date). Timeline on wide screens, grouped list on phone.
- Pointer events instead of HTML5 drag-and-drop (works with touch), 15 minute snap, drag to move, handle to resize.
- Quick add: one line "title, time, duration" with smart defaults. Full form only for details.
- Overlap warning instead of silent stacking.
- Delete and complete are undoable via toast (forgiving interactions). Replace the confirm dialog with undo.

## 5. Assistant

Persistent drawer on desktop, full sheet on phone. Text field plus mic button.

**Behavior** (example from the brief)

1. User: "I just got a call, tonight I'm invited to eat Chinese with friends."
2. Assistant sees today and tomorrow in the plan, notices tomorrow's exam and tonight's study block, and asks whether they are sure.
3. User: "Yes, I already studied enough." Assistant: "All right, what time?"
4. User gives a time, assistant creates the task, confirms, and the change appears with an Undo toast.

**Design**

- Server endpoint `POST /assistant` streams the reply. Tools: `list_tasks(range)`, `add_task`, `update_task`, `delete_task`. The model gets today and tomorrow as context on every turn. Tool calls run server-side with the logged-in user's id only.
- Writes go through the same code path as the UI so the optimistic `tasker` state, undo and the Now screen all update live.
- Voice is phased: push-to-talk first (an always-listening mic on a wall display is a privacy and false-trigger problem). Speech to text, then spoken replies. Spoken replies are short; long details stay on screen.
- Assistant speech must duck or pause while the task chime plays, and only speak unprompted for reactions allowed by the guardrails in 6.4 or for alarms.
- **Security**: `openaiKey` is currently stored in plain text. Encrypt it at rest, never send it to the client, and make all model calls server-side.

**[default] Provider approach**: text chat with tools first. Then Whisper (STT) and OpenAI TTS since the user already supplies an OpenAI key. Evaluate the Realtime API later if latency feels bad. Browser `SpeechRecognition` is not available in Firefox, so it is only an optional fallback.

## 6. Event-driven agent

The assistant is not only a chat box. It is an agent that observes the plan and may act on it. The core app must work fully without it (no key, key invalid, API down): AI is an enhancement, never a dependency.

### 6.1 Events

One server-side `emit(event)` is called from every mutation path and from the scheduler. Events are persisted in an `events` log.

| Event                                          | Trigger                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `task.completed`                               | User marks a task done (or undoes it)                                                                             |
| `task.created`, `task.updated`, `task.deleted` | Any plan edit, from UI or assistant                                                                               |
| `task.switched`                                | The ranking's current task changed, payload has the reason (higher priority started, previous done, window ended) |
| `task.missed`                                  | A task's window ended without completion ("not done for too long")                                                |
| `task.overrun`                                 | A task is past its planned time by the hyperfocus threshold                                                       |
| `stuck.pressed`                                | User pressed "I'm stuck" and chose an option                                                                      |
| `alarm.fired`                                  | A timed alarm went off                                                                                            |
| `wakeup.fired`                                 | A wakeup the agent scheduled for itself arrived, carrying its own note                                            |
| `day.started`                                  | First load of the day or configured wake time (morning briefing)                                                  |
| `user.message`                                 | Text or voice input                                                                                               |

Every event carries `origin: user | agent | system`. **Events caused by the agent never trigger the agent again**, which prevents loops. A reaction may use at most 4 tool calls.

### 6.2 What a reaction can be

The model answers each event with zero or more of these, and **doing nothing is the default**:

- `say(text)`: a short line shown in a bounded assistant strip on Now, optionally spoken
- `ask(text, options?)`: a question card (e.g. "Done with the call? Move study to 17:00?")
- plan tools: `add_task`, `update_task`, `delete_task`
- `schedule_wakeup`, `set_alarm`, `play_tone` (see 6.3)

The reaction never covers the hero. The assistant strip is a fixed small region on the Now screen, so the priority display stays trustworthy.

### 6.3 Scheduler, wakeups and alarms

The server owns time for the agent. A persisted `schedule` table is polled every 15 s by a scheduler in the Bun process (PM2 restart safe). On startup, entries that are less than 10 minutes late fire, older ones are dropped with a note in the log.

- `schedule_wakeup(at | in_minutes, note)`: the agent wakes itself later. The note is fed back when it fires, so it has memory ("at 15:40 check whether the dentist call is done, if not offer to move the next task"). Max 10 pending wakeups, no wakeups during quiet hours unless the user requested one.
- `set_alarm(at, tone, label, repeat?, task_id?)`: a user-visible alarm, listed and cancellable in the UI. Created by the user or the agent (`created_by`). Examples: 5 minutes before a task, a "leave now" alarm, a recurring evening wind-down.
- `play_tone(tone)` and the tone library: tones are synthesized with Web Audio (no files). The agent may pick named tones (`chime`, `soft`, `nudge`, `rising`, `urgent`) or **define a custom one** as a short note sequence (waveform, notes, durations). Safety caps: max 5 s, never louder than the user's volume, max 3 custom tones per day, flashing and strobing never used. Tones are stored with the alarm so they replay identically.
- Alarms play on the client. Server-side schedule entries are pushed to connected clients over an event stream (SSE), and the client also keeps the next alarms locally so a brief disconnect does not lose them. Web Push for a closed app comes with the PWA.

### 6.4 Guardrails (the AI must not become another source of nagging)

- **Autonomy setting**: `observe` (log only), `suggest` (cards, never edits), `act` (may edit, with undo). Default `suggest`. Voice replies are a separate toggle.
- **Coalescing**: events within 5 s are batched into one call (dragging a task triggers one reaction, not 20).
- **Rate limit**: at most 6 unprompted reactions per hour and a minimum 3 minute gap, quiet hours respected. `user.message` and alarms the user set are exempt.
- **Per-event toggles**: the user can switch each event type on or off in Settings.
- **Cost control**: reactions use a small, cheap model, chat uses the stronger one. Show a daily usage meter and an optional daily token budget, after which the agent goes silent instead of failing.
- **Visibility and undo**: every agent change is tagged `source: agent`, listed in an activity log ("Moved Study to 17:00 because ..."), and has an Undo toast. The plan view marks agent-made tasks and alarms.
- **Output device**: with several open devices, only the device marked "display" speaks and plays agent tones, to avoid double audio. Others show cards silently.
- **Privacy**: task text is sent to OpenAI using the user's own key. Say so in Settings. The key is encrypted at rest and never reaches the client.

### 6.5 Context given to the model

Today and tomorrow's tasks, the current ranking, last 20 events, pending wakeups and alarms, a small `agent_notes` store it can write to (e.g. "exam on Thursday, user studies in the evenings"), user preferences (autonomy, quiet hours, timezone).

## 7. Data changes

- `tasks.date` (`YYYY-MM-DD`, user timezone). Migration sets all existing tasks to today. `bun run db:push` afterwards.
- `startTime` stays minutes since midnight, `duration` stays minutes. Tasks crossing midnight are out of scope (split them).
- `events` (id, email, type, payload JSON, origin, createdAt, handledAt).
- `schedule` (id, email, kind `wakeup | alarm`, fireAt, note, tone JSON, label, repeat, taskId, createdBy, status).
- `agent_actions` (id, email, eventId, tool, before JSON, after JSON, createdAt) for the activity log and undo.
- `agent_notes` (email, key, value).
- `users`: `aiAutonomy`, `quietHoursStart/End`, `dailyTokenBudget`, `displayDeviceId`, per-event toggle flags.
- `tasks.source` (`user | agent`) for marking agent-made tasks.
- `current_task_id` per user so the server can detect `task.switched` by diffing the ranking on each scheduler tick.
- Later: recurrence rule column, conversation history table (the drawer session is enough for v1).
- Server load returns the current day plus tomorrow, other dates are fetched when the Plan screen navigates.

## 8. Phases

Phases 0 to 9 are all done and removed from this plan. What is left is tracked in `TODO.md`.

## 9. Open questions

1. **Missed tasks**: should a critical missed task ever outrank the current one, or is the quiet strip always enough? (default: strip only)
2. **Rail length**: next 4 tasks, or "everything today"? (default: 4, configurable)
3. **Voice provider**: Whisper + OpenAI TTS (default) vs browser APIs vs Realtime API.
4. **Assistant wake**: push-to-talk only (default) vs a wake word later.
5. **Existing data**: OK to assign all current tasks to today in the migration?
6. **Agent autonomy default**: `suggest` (default) or should it edit the plan on its own with undo from day one?
7. **Reaction model**: a cheap model for events and a stronger one for chat (default), or one model for everything?
8. **Closed app**: should wakeups and alarms still reach you when no tab is open (needs Web Push, comes with the PWA phase), or is the always-on screen enough for now? (default: screen only)
9. **Custom tones**: allow fully custom note sequences (default, capped) or only the named tone library?
