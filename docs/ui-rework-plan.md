# UI Rework Plan

Status: draft for review. Decisions taken so far are marked **[decided]**, defaults I chose are marked **[default]** and are open for veto.

## 1. Product definition

ADHD Tasker is an **ambient priority display**. It runs fullscreen on an always-on second screen and answers one question at a glance: *what should I be doing right now, and what is coming next?* The user trusts it instead of re-deciding, scrolling, or sinking time into an unnecessary task.

Usage **[decided]**: desktop-first (permanent second screen), fully responsive down to phone. Focus view is the primary idea, not an optional mode.

### In scope (final)

| Area | What it is |
|---|---|
| **Now** (home) | Current top-priority task in an urgency color, countdown, Done + undo, and a rail of the following tasks so the user can prepare mentally |
| **Plan** | Dated days, timeline and list view, quick add, touch-friendly drag and resize |
| **Assistant** | Text + voice conversation that reads and edits the plan, challenges conflicts, and talks back |
| **Anchoring** | Chime on switch and every 5 min, overdue handling, hyperfocus alarm, "I'm stuck" |
| **Settings** | Timezone, sound, theme, reminders, OpenAI key |
| **Platform** | Fullscreen API, Screen Wake Lock, PWA install |

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

## 3. Visual design

### Urgency scale
Replace the current time-left-only traffic light with a single urgency level (0 to 3) derived from **priority and time pressure**:

| Level | Meaning | Color feel |
|---|---|---|
| 0 | Calm: low priority, plenty of time | Cool blue-green |
| 1 | Normal | Soft amber-neutral |
| 2 | Pressing: high priority or under 25% time left | Warm orange |
| 3 | Critical or overrunning | Red |

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
- Assistant speech must duck or pause while the task chime plays, and never start unprompted except for explicit alarms.
- **Security**: `openaiKey` is currently stored in plain text. Encrypt it at rest, never send it to the client, and make all model calls server-side.

**[default] Provider approach**: text chat with tools first. Then Whisper (STT) and OpenAI TTS since the user already supplies an OpenAI key. Evaluate the Realtime API later if latency feels bad. Browser `SpeechRecognition` is not available in Firefox, so it is only an optional fallback.

## 6. Data changes

- `tasks.date` (`YYYY-MM-DD`, user timezone). Migration sets all existing tasks to today. `bun run db:push` afterwards.
- `startTime` stays minutes since midnight, `duration` stays minutes. Tasks crossing midnight are out of scope (split them).
- Later: recurrence rule column, conversation history table (not needed for v1, the drawer session is enough).
- Server load returns the current day plus tomorrow, other dates are fetched when the Plan screen navigates.

## 7. Phases

Each phase ends with `bun run check`, a browser check at 3 widths (1920 wide, tablet, phone) via the `run` skill, and its own small commits.

0. **Cleanup**: delete `test.ts` (it contains tokens), stale German comments, localStorage fallback, marketing footer, dead README/TODO entries. Update `CLAUDE.md` with the new scope.
1. **Design foundations**: urgency tokens, typography, shared priority module, remove duplicated color maps.
2. **Priority engine + Now screen**: `priority.ts` with unit tests, new hero + rail, switch reasons, overdue to `missed`, fullscreen and wake lock, auto-hiding bar. Delete dashboard, stat tiles, sidebar and the separate fullscreen overlay.
3. **Dated days + Plan screen**: schema, migration, day switcher, pointer-based timeline, quick add, undo.
4. **Responsive and PWA**: manifest, installability, phone layouts for Now and Plan.
5. **Assistant (text)**: endpoint, tools, drawer UI, key encryption, undo integration.
6. **Assistant (voice)**: push-to-talk, STT, TTS, chime ducking.
7. **Anchoring and settings**: "I'm stuck", next-up preview behavior, hyperfocus alarm, reminders, real settings page.

Phases 0 to 2 already deliver the core idea and are worth shipping before the data and AI work.

## 8. Open questions

1. **Missed tasks**: should a critical missed task ever outrank the current one, or is the quiet strip always enough? (default: strip only)
2. **Rail length**: next 4 tasks, or "everything today"? (default: 4, configurable)
3. **Voice provider**: Whisper + OpenAI TTS (default) vs browser APIs vs Realtime API.
4. **Assistant wake**: push-to-talk only (default) vs a wake word later.
5. **Existing data**: OK to assign all current tasks to today in the migration?
