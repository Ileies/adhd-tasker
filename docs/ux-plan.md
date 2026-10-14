# UX and UI Plan

Status: decided, ready to implement. No code changes yet. The answers to the open questions are in section 15.

Basis: a review of every route and component (`+layout.svelte`, Now, Plan, TaskForm, AssistantDrawer, Alarms, Activity, Settings and all settings forms, dialogs, toast, banner). It was read from code, not from screenshots, so every phase ends with a look at the real screen on a wide display and a phone.

## 1. How every control is judged

The app has one job: keep the user anchored to the present task with the least possible thinking. So each control gets a tier, and its size and place follow from the tier, never from how much work it was to build.

| Tier | Rule | Members |
|---|---|---|
| **1. Always visible, large** | Needed many times a day, at the moment of acting | Done |
| **2. Visible, secondary** | Needed often, or exactly in a specific moment (shown only in that moment) | I'm stuck, 15 more minutes (only near and after the end), mute, Now/Plan switch, quick add on Plan |
| **3. One tap away** | Needed sometimes | Edit, move to later, drop, assistant, alarms, missed triage |
| **4. In a menu or another page** | Configured once or rarely | Fullscreen, settings, activity, account, legal |

Three more rules:
- **In context beats transient.** The screen is always on, so a cue that stays where the eye goes (a line in the hero) beats a toast that disappears after 8 s.
- **The moment of transition is the hardest moment** for ADHD (ending one thing, starting the next). It deserves the most design care, and today it gets the least.
- **Silence must be visible.** Muted sound or a browser that blocks audio removes the anchor without the user knowing. That state is always shown.

## 2. The ten biggest problems, ranked by impact

1. **A task that runs out silently vanishes from the hero.** `rank()` moves it to `missed` the minute its window ends, the hero switches to the next task or "Free time", and the only trace is a small entry in the rail. A hyperfocused user looks up and sees "Free time" while still on the task. The overrun signal is a toast. There is no "time is up, what now" moment at all. (`urgencyLevel` even has a level for time below zero, but the hero can never reach it.)
2. **No way to ask for more time on the current task.** "+15 min" only exists for missed tasks in the rail. Running long is the most common case and needs a trip to Plan and a resize.
3. **Completing a task has weak feedback.** Done shows a toast. The only sound is the task-started chime, and only if another task becomes current. Finishing the last task of the block is silent.
4. **Sound can be off without the user knowing.** Browsers block Web Audio until the first tap after a load, so an always-on screen that reloaded overnight plays nothing. Mute has no timer and no visible reminder, so "muted for a meeting" easily becomes "muted all day".
5. **Navigation has no clear model.** Plan is a button on the left, Now is the logo, `/edit` adds its own "Back to Now", and Alarms, Activity and Settings sit under a user icon that reads as "account".
6. **Priority colors disagree across the app.** High is orange on Now, a blue block on the Plan timeline and an amber chip in the phone list. Urgent is a yellow block but a red chip. Colors only help if they mean one thing.
7. **Settings mixes instant and Save-button saving.** Theme and timezone apply at once, three other cards need their own Save. Forgetting to press Save is a typical ADHD failure. Free number inputs ask for decisions that presets could answer.
8. **Missed tasks pile up as a wall of buttons.** Up to three cards with Done, +15 min and Drop each sit in the peripheral rail. It is noisy and invites guilt, and there is no "move to later" or "tomorrow", only extend from now or delete.
9. **Plan has two rows of chrome and a dialog-heavy create flow.** Global bar plus a wrapping toolbar (Back, day switcher, date input, Today, quick add, Details). Clicking the timeline opens a full dialog with a 60 min default, while quick add uses 30 min.
10. **The first visit asks a question before showing anything** (theme dialog), and an empty day shows "Free time / Nothing else is planned" with no way forward.

Smaller findings are listed per page below.

## 3. Navigation and the top bar

### Model

Two primary places and one tool, everything else is secondary:
- **Now** and **Plan**: a two-segment switch at the left of the bar, always visible (tier 2). Keys `1` and `2`.
- **Assistant**: an icon in the bar, only when a key is saved (tier 3). Without a key the button is a dead end, so it is hidden and Settings explains how to turn it on.
- **Menu** (icon changes from a user to a plain menu icon): Alarms, Assistant activity, Settings, then Fullscreen, Keyboard shortcuts, then the email and Log out, then Privacy and Terms as one small line.

### Bar layout

```
+--------------------------------------------------------------------------+
| [ Now | Plan ]            <context slot>             [chat] [sound] [=]  |
+--------------------------------------------------------------------------+
```

- **Context slot** (center) replaces the logo and app name, which carry no information on a screen the user already chose to open:
  - Now: empty on wide screens (the clock is in the rail), the clock on phones (the rail is below the fold there).
  - Plan: the day switcher `< Today, Wed 14 Oct >`. This removes the second toolbar row on Plan.
  - Other pages: the page title.
- **Sound button** opens a small popover instead of the hover slider (which is hidden on touch and mutes on the same tap):
  - Mute for 1 hour (first), 30 min, or until I unmute. Stored as `mutedUntil` in `tasker`, sound returns on its own
  - Volume slider
  - "This screen plays sound" switch (moved from the Alarms page, this is where the user thinks about sound)
- **Fullscreen** leaves the bar (tier 4: once per session). Menu item plus the `F` key.
- The bar keeps auto-hiding on Now after 5 s. Logged out, the bar shows nothing but the logo: no Plan button, no menu with Settings, since none of it works without an account. `/edit`, `/alarms`, `/activity` and `/settings` redirect to the sign-in page when logged out.

### Keyboard (desktop, shown under Menu > Keyboard shortcuts)

| Key | Action |
|---|---|
| `1` / `2` | Now / Plan |
| `D` | Done (Now) |
| `N` or `/` | Focus quick add (Plan, and Now on an empty day) |
| `Left` / `Right`, `T` | Previous / next day, today (Plan) |
| `A` | Open the assistant |
| `M` | Mute or unmute |
| `F` | Fullscreen |
| `Esc` | Close whatever is open |

Shortcuts are ignored while typing in a field. Pure key map in `src/lib/shortcuts.ts` (tested), wired once in the layout.

## 4. Now screen

### Hero states

The hero becomes a small state machine. A pure `heroState(ranking, now, settings)` in `src/lib/now.ts` (tested) returns one of the states below, the component only renders it. `rank()` stays as it is, so client and server still agree.

| State | When | What the hero shows |
|---|---|---|
| **active** | A task is current, more than the wrap-up threshold left | Time window, title, note, time left, Done, I'm stuck, `...` |
| **wrapping up** | Last 10 min or last 25% of the current task | Same, plus "15 more min" as a ghost button, and the heads-up line for the next task |
| **time up** | No task is current (or the new current started at the same minute) and the latest unfinished task ended less than its overrun window ago | "Time is up" over the ended task's title, "ended 3 min ago", Done, 15 more min, Move to later. The next task is one line below |
| **free** | Nothing current, something later today | "Free time", next task and "starts in" |
| **empty** | Nothing left today | "Nothing left today" plus a quick add line and "Open Plan" (see 11) |

The time-up state replaces both the silent switch to "Free time" and the overrun toast, and it is the screen the hyperfocus tap sounds for. When the next task has already started, the hero shows the new task and a slim **transition bar** across its top: "Time for Write intro is up. [Done] [15 more min] [Later]". It stays until answered or until the new task is 15 min old.

### Layout, wide screen

```
+--------------------------------------------------+------------------------+
|                                                  | 14:32                  |
| 14:00 - 15:00                                    | 3 done today           |
|                                                  | [Assistant card]       |
| Write the report intro                           |                        |
| Outline is in the shared folder                  | NEXT                   |
|                                                  | 15:00  Call dentist    |
| 28 min left, until 15:00                         |        in 28 min, 15 min|
| [===================--------------------------]  | 15:30  Groceries 45 min|
|                                                  | 16:30  Study      2 h  |
| [   Done   ]   [ I'm stuck ]   [ ... ]           | +3 later today >       |
|                                                  |                        |
|                                                  | Alarm 15:40 Leave      |
|                                                  | 2 tasks need a decision >|
|                                                  | Sound off until 15:30  |
+--------------------------------------------------+------------------------+
```

### Layout, phone

```
+-----------------------------+
| [Now|Plan]   14:32  [=]     |
|                             |
| 14:00 - 15:00               |
| Write the report intro      |
| 28 min left                 |
| [============-----------]   |
| Next 15:00 Call dentist     |
| 1 assistant note >          |
|                             |
+-----------------------------+
| [    Done    ] [Stuck] [..] |   sticky, thumb reach
+-----------------------------+
```

### Hero details

- **Time left in words**: "28 min left, until 15:00" and "1 h 20 min left". The current `0:28` reads like minutes and seconds. New `formatLeft` in `src/lib/format.ts` (tested).
- **Time bar drains instead of fills**: full hero width, thicker (about 12 to 16 px), showing what is left like a Time Timer. Time blindness is the core problem, an emptying bar is easier to feel than digits.
- **Meta line**: the time window only. The "High priority" label leaves the hero: the urgency color already says it, and it is one more thing to read. When several tasks run at once, the meta line says "Highest of 2 right now", which is the only time priority explains anything.
- **Reason line**: only shown after a switch that happened while the page was open, and faded out after 60 s. "Scheduled for now" on every load is noise.
- **Done**: stays the largest control. After a tap the hero shows a short confirmation (check mark, title struck through, about 1.5 s, no motion beyond a crossfade), a distinct warm **done** sound plays (new `playSound('done')`, on the display device, respects mute), then the hero crossfades to the next state. Toast with Undo stays.
- **I'm stuck**: stays secondary but slightly smaller than Done so the hierarchy is clear. Every hint gets one action button: "Start a 2 min timer", "Start a 5 min break" and so on create a short alarm, so the app holds the timer instead of the user. The action lives next to the hint text in `STUCK_REASONS` (`anchoring.ts`, tested).
- **`...` menu** (tier 3): Edit, 15 more min, Move to later today (next free slot), Move to tomorrow, Drop. Every entry has Undo. Edit opens the same task sheet as Plan without leaving Now.
- **Heads-up for the next task** moves from a toast into the hero: "Call dentist starts in 5 min. Start wrapping up." The chime stays. A toast could replace an Undo toast and is gone in 8 s.

### Rail details

- Clock stays at the top on wide screens, with one quiet line under it: "3 done today". Done count only, never "of 7", so it only grows and cannot turn into a guilt meter. Hidden at 0. This is one plain line, not a stat tile, CLAUDE.md gets that exception written down. A productivity rating is tracked in `TODO.md` for later.
- **Next list**: "in 28 min, 15 min" is ambiguous. Show "15:00 - 15:15" under the title and "in 28 min" only on the first item. Items are tappable and open the task sheet. "+3 later today" links to Plan.
- **Next alarm** line when an alarm is set for today ("Alarm 15:40 Leave"). Knowing the app will ring removes the urge to watch the clock.
- **Missed**: the card stack becomes one quiet line, "2 tasks need a decision", that opens a **triage sheet** showing one task at a time: "Did you do Write intro?" [Done] [Later today] [Tomorrow] [Drop], with "1 of 2". One decision at a time instead of a wall of nine buttons. "Later today" uses a pure `nextFreeSlot(tasks, now, duration)` in `src/lib/plan.ts` (tested). Tasks from earlier days stay out of scope here, as today.
- **Assistant card** stays above Next (it is rare and time-sensitive). On phones the hero gets a one-line "1 assistant note" link, because the rail is below the fold and a question there is never seen.
- **Silence line**: "Sound off until 15:30" when muted, "Tap anywhere to turn sound on" when the browser blocks audio (see 12). Placed at the bottom of the rail, in the hero on phones.

### Tab title

`document.title` follows the hero: "28 min - Write intro", "Time is up - Write intro", "Free until 15:00". When the app is a background tab instead of a second screen, the tab itself becomes the anchor. Other pages get "Plan - ADHD Tasker" and so on (only Privacy and Terms set a title today).

### Sounds on Now

The 5 minute check-in chime is hardcoded today. It moves into the Reminders settings as "Check-in chime: every 5, 10, 15 min, or off" (default 5, as now).

## 5. Plan screen

```
+--------------------------------------------------------------------------+
| [ Now | Plan ]          < Today, Wed 14 Oct >  [Today]   [chat][sound][=] |
+--------------------------------------------------------------------------+
| Quick add: Call dentist 14:30 45m                               [+] [Add] |
|   Call dentist  14:30 - 15:15  45 min                (live parse preview) |
+--------------------------------------------------------------------------+
| ! Study and Dinner overlap at 18:00. Now shows Dinner (higher priority).  |
+--------------------------------------------------------------------------+
| 06:00 |///// past, dimmed /////                                           |
| ...   |                                                                   |
```

- **Remove "Back to Now"**: the Now/Plan switch handles it.
- **Day switcher in the bar**: arrows, the day name, and a click on the name opens a calendar popover. The separate date input goes. "Today" appears only when another day is shown.
- **Quick add is the main control**: full width, focused with `N` or `/`. A live preview under it shows what will be created ("Call dentist, 14:30 to 15:15, 45 min"), so the parse is trusted before Enter. After adding, the new block is scrolled into view and outlined for 2 s. `[+]` (was "Details") opens the task sheet for more options.
- **One default duration**: 30 min everywhere (timeline click, quick add, task sheet).
- **Timeline**:
  - Past time on today is dimmed, so what is left of the day is visible at a glance.
  - Hours outside the user's day collapse into one thin "00:00 - 07:00" row that expands on click. The range is a new **My day** setting (default 07:00 to 23:00) and auto-extends to include any task planned outside it, so nothing is ever hidden. Pure `visibleHours(tasks, dayStart, dayEnd)` in `plan.ts` (tested). Less scrolling, the day fits the screen.
  - Drag on empty space creates a block of the dragged length with an inline title field (Enter saves, Esc cancels). A plain click still works and creates 30 min. No dialog for the common case.
  - Blocks become focusable (Tab), Enter opens, arrow keys move by 15 min, Shift+arrows resize. Each move keeps its Undo toast.
  - The done circle gets a larger hit area (the 24 px circle is fine visually, the target is not).
  - Agent-made tasks get a small marker (already in TODO, belongs here).
- **Overlap banner** names the tasks and the winner instead of a generic sentence.
- **Phone list**: grouped "Earlier" (done items collapsed into one line), "Now" (highlighted in its urgency color), "Later". Quick add sticks to the bottom of the screen for thumb reach. Rows keep the done toggle on the right.

## 6. Task sheet (replaces the TaskForm dialog)

```
+---------------------------------------------+
| Write the report intro             (focus)  |
|                                             |
| [Today] [Tomorrow] [Pick date]              |
| Start [14:00]   [15m][30m][45m][1h][2h][..] |
| Ends 14:30                                  |
|                                             |
| Priority  [Low][Medium][High][Urgent][Crit] |
| + Add a note                                |
|                                             |
| [Delete]                [Done]   [ Save ]   |
+---------------------------------------------+
```

- Centered dialog on wide screens, bottom sheet on phones.
- Title field first, large, focused on open. No "Title *" labels with asterisks: only the title is required and the field says so.
- Date as chips (Today, Tomorrow) plus a picker. Duration chips sit next to the start time (today they are split by the priority select), a free value behind `..`. "Ends 14:30" is shown, so nobody does the math.
- Priority as a five-segment control in the shared priority colors, one tap instead of opening a select.
- Note collapsed behind "Add a note" so the form looks short.
- Edit mode: "Done" / "Reopen" toggle, Delete on the left as a quiet text button (Undo exists, no confirm). Buttons say "Save" and "Add", not "Update Task" / "Create Task".
- A failed save shows a toast. Today it only logs to the console and the dialog stays open without explanation.

## 7. Assistant drawer

- Entry point only with a saved key (see 3). Key `A`.
- **Empty state**: three tappable suggestions instead of one example sentence, for example "Plan the rest of my day", "Push everything 30 min later", "What is next?". A blank chat box is a decision.
- **Composer**: when the field is empty the right button is a large hold-to-talk mic, with text it turns into Send. One button instead of two, and talking becomes as easy as typing.
- Header: "New chat" (clears the session) and "What it changed" (link to Assistant activity).
- Per-change Undo in the thread stays as it is.

## 8. Alarms

- **Quick timers** at the top: [5 min] [10 min] [25 min] [1 h], one tap sets an alarm labeled "Timer". The infrastructure exists, and short timers are the most common ADHD use of a clock.
- Add form: time and label in one row, "Add". Tone and repeat behind an "Options" disclosure with the current defaults. Preview becomes a play icon next to the tone. Use the shadcn Select instead of the hand-styled native selects, so it matches the rest of the app.
- List grouped "Today" and "Later", each with a small "by assistant" tag when relevant. Cancel shows an Undo toast (today it deletes at once, which breaks the "forgiving" rule).
- The **Sound** card moves to the sound popover (3) and Settings. **Assistant wakeups** move to Assistant activity (9). The page is then only about alarms.
- **Ringing banner**: add "Snooze 5 min" next to Dismiss, limited to once per alarm (the button is gone on the second ring) so it cannot become an endless loop.

## 9. Assistant activity (was Activity)

- Renamed so the menu entry says what it is. In the menu only when a key is saved or past actions exist.
- Sections: **Changes** (grouped by day, Undo per row), **Planned check-ins** (the wakeups from Alarms, with Cancel), **Event log** collapsed by default (it is diagnostic). Token use becomes one footnote line.

## 10. Settings

### Structure

Sections ordered by how much they shape the daily experience. Wide screens get a sticky section list on the left, phones one scroll.

1. **Reminders and sound**: check-in chime interval, heads-up before the next task, overrun tap, "this screen plays sound", volume.
2. **Appearance**: theme (light, dark, by daylight). "By daylight" has no hour fields any more: it follows sunrise and sunset at the user's location, like Google Maps, and shows "Light from 07:12 to 18:40, based on Leipzig. [Change location]".
3. **Time**: timezone, shown as the current value with a "Change" button that reveals the long list. **My day** (default 07:00 to 23:00), which drives the collapsed hours on the Plan timeline.

### Location for the daylight theme

- **Detection**: the server looks up the client IP with an external IP geolocation API on login, and again when the IP changes. The request takes the real client IP from the reverse proxy header. Only a rounded position (2 decimals, about 1 km) and the city name are stored, never the IP. The provider must be HTTPS and gets named on the Privacy page (new third party, purpose, what is sent).
- **Override** (for a VPN or a wrong guess): "Use this device's location" asks the browser once for a precise position, and a city search (a geocoding API, also named on the Privacy page) covers browsers that refuse. A manual location is never replaced by IP detection until the user resets it to automatic.
- **Math**: sunrise and sunset come from a pure `sunTimes(lat, lon, date, timezone)` in `src/lib/sun.ts` (tested, including polar day and night, which fall back to fixed 07:00 to 19:00). Recomputed daily on the client.
- **Data**: `users` gets `locationLat`, `locationLon`, `locationName`, `locationSource` (`ip | device | city`), `myDayStart`, `myDayEnd`. Applied with `bun run db:push`, production with `bun run deploy --db-push`. The old local `dayStart`/`dayEnd` theme hours in `tasker` go away.
- Without any location (lookup failed, offline), the theme falls back to the timezone's main city, and Settings says so.
4. **Assistant**: without a key, only the key field and two lines on what it does and what is sent. With a key: autonomy as three option cards, voice replies, then an "Advanced" disclosure with event toggles, quiet hours and the token budget.
5. **Account**: email, Log out, Privacy, Terms.

The **Google Workspace** card is hidden until Calendar sync uses the grant. Existing grants stay stored. Today it records permissions that nothing uses, which is a decision with no effect.

### Behavior

- **Everything saves on change**, with a small inline "Saved" next to the control. The per-card Save buttons go. The OpenAI key keeps an explicit Save because it is validated.
- **Presets instead of number fields**: heads-up [5][10][15][30] min, overrun [10][15][30][60] min, budget [none][50k][200k][custom]. The pure parsers and limits in `anchoring.ts` and `guardrails.ts` stay the validators.
- Copy gets shorter: one sentence per option, details on demand.

## 11. First run, sign-in, empty states

- **Remove the theme SetupDialog.** Default stays "by daylight" (now automatic, see 10), which suits a wall screen, and Settings has the choice. The first screen after sign-in should be the plan, not a question.
- **Empty day on Now**: "Nothing planned today" with a quick add line right in the hero ("What is the first thing?") and "Open Plan". This is the same quick add as Plan, not the capture inbox from the roadmap.
- **One-time desktop hint** on Now, dismissible, never shown again: "Running this on a second screen? Press F for fullscreen and make it the sound screen." Two setup steps that matter for the main use case and are otherwise hidden.
- Sign-in page stays as it is (it is already calm and clear), minus the header controls (see 3).
- The timezone dialog stays, it only appears on a real mismatch.

## 12. Feedback system

| Signal | Today | Planned |
|---|---|---|
| Task done | Toast, sound only if another task starts | Hero confirmation, `done` sound, toast with Undo |
| Next task soon | Toast plus chime | Hero line plus chime, first rail item emphasized |
| Overrun | Toast plus nudge tone | Time-up state or transition bar plus nudge tone |
| Task switch | Chime, reason line | Same, reason line fades after 60 s |
| Muted | Icon in a hidden bar | Silence line with the unmute time |
| Audio blocked by the browser | Nothing, sounds fail silently | Silence line "Tap anywhere to turn sound on", cleared by the first gesture |
| Undoable action | Toast, 8 s, newest replaces older | Same. Toasts are now only for Undo, so a reminder can no longer push an Undo away |

Audio unlock: create one shared `AudioContext` on load, read its `state`, and set `tasker.device.audioBlocked` until `resume()` succeeds on the first pointer or key event. Today every sound creates its own context.

## 13. Visual system

- **One priority color ramp** used by the hero, timeline blocks, phone list chips, the priority control and the meter, derived from the urgency tokens (Low calm teal, Medium amber, High and Urgent orange, Critical red). `priorityStyle` in `urgency.ts` gets rebuilt on these tokens and its `chip` and `block` maps agree. Done items stay muted with a line through.
- **Primary color** (the purple) is used only for primary buttons and focus, never for meaning, so it does not compete with urgency colors.
- **Page frame**: one shared layout for secondary pages (title in the bar, `max-w-2xl`, sections with the same spacing) instead of each page choosing its own width and stacking cards.
- **Type scale**: display (title), clock (time left), body large (hero note, rail first item), body, small. Remove one-off sizes.
- **Touch targets**: at least 44 px on phones (the rail buttons at `size="sm"` and the timeline done circle are below that).
- **Focus**: every interactive element reachable by keyboard with a visible ring, including timeline blocks and rail items.
- **Motion**: unchanged rule, crossfades only. The done confirmation and the new-block outline are the only additions, both static after their fade.
- **Copy**: sentence case everywhere ("Edit task", not "Edit Task"), verbs on buttons, no jargon on main views ("Planned check-ins" instead of "wakeups").

## 14. Phases

Each phase is shippable on its own and ends with `bun run check`, `bun test`, a look on a wide screen and a phone, and small separate commits. Pure logic first with tests, then components.

| Phase | Content | Main files |
|---|---|---|
| **1. Transitions** | `heroState`, time-up state, transition bar, 15 more min, `...` menu with move to later or tomorrow, `nextFreeSlot`, heads-up line in the hero | `src/lib/now.ts` (new), `plan.ts`, `NowHero.svelte`, `+page.svelte` |
| **2. Feedback and silence** | Done confirmation and sound, `formatLeft`, draining bar, reason fade, shared AudioContext and blocked state, silence line, tab title | `index.ts`, `format.ts`, `NowHero.svelte`, `UpcomingRail.svelte`, `+layout.svelte` |
| **3. Navigation** | Now/Plan switch, context slot, menu, sound popover with timed mute, fullscreen to menu, assistant icon only with key, logged-out redirects, keyboard shortcuts | `+layout.svelte`, `VolumeMenu.svelte`, `src/lib/shortcuts.ts` (new), `app.svelte.ts` |
| **4. Rail and phone Now** | Done today line (plus the CLAUDE.md exception), next list clarity, tappable items, next alarm line, missed triage sheet, phone sticky actions, phone assistant link | `UpcomingRail.svelte`, `AgentStrip.svelte`, new `MissedTriage.svelte` |
| **5. Colors and system** | One priority ramp, page frame, type scale, touch targets, sentence case | `app.css`, `urgency.ts`, `PriorityMeter.svelte`, all pages |
| **6. Plan** | Day switcher in the bar, quick add with preview, 30 min default, past dimming, collapsed hours outside My day (07:00 to 23:00 until phase 8 adds the setting), drag to create, keyboard blocks, named overlaps, grouped phone list | `edit/+page.svelte`, `DayTimeline.svelte`, `quickadd.ts`, `plan.ts` |
| **7. Task sheet** | New layout, chips, priority control, failure toast | `TaskForm.svelte` |
| **8. Settings** | Sections, auto-save, presets, check-in interval, My day, Google card hidden, assistant disclosure | `settings/+page.svelte`, `+page.server.ts`, settings forms, `users` schema (then `bun run db:push`) |
| **8b. Daylight theme** | `sunTimes`, IP lookup on login, device location and city search override, theme without hour fields, Privacy page update | `src/lib/sun.ts` (new), `src/lib/server/location.ts` (new), `theme.ts`, `ThemePicker.svelte`, `hooks.server.ts`, `privacy/+page.svelte` |
| **9. Secondary pages** | Alarms cleanup, quick timers, one snooze, Assistant activity with check-ins, assistant drawer suggestions and composer | `alarms/+page.svelte`, `AlarmBanner.svelte`, `activity/+page.svelte`, `AssistantDrawer.svelte` |
| **10. First run** | Remove SetupDialog, empty day state, one-time second screen hint | `SetupDialog.svelte` (delete), `NowHero.svelte`, `theme.ts` |

Phases 1 and 2 carry most of the ADHD value and touch the fewest files, so they come first. CLAUDE.md and the Privacy page get updated in the phases that change what they describe.

## 15. Decisions (2026-10-14)

1. **Timed mute**: yes. 1 hour first, then 30 min and "until I unmute".
2. **Timer buttons in "I'm stuck"**: yes, one action per hint.
3. **Quick timers** on Alarms: 5, 10, 25 min and 1 h.
4. **Snooze**: 5 min, once per alarm.
5. **"15 more min" appears** in the last 10 min or the last 25 %, whichever comes first.
6. **Collapsed hours** on the timeline: a separate **My day** setting, default 07:00 to 23:00, auto-extending to fit tasks outside it.
7. **Daylight theme**: no user-set hours any more. Sunrise and sunset at the user's location, found by an external IP geolocation API, overridable with the device location or a city search (for a VPN). See section 10.
8. **Google card**: hidden until Calendar sync.
9. **First-run theme dialog**: removed, default "by daylight".
10. **Done count**: one plain line "3 done today" in the rail, done count only. A productivity rating is wanted later but depends on the day's real load, which the app cannot know yet, so it is in `TODO.md` under Later.
