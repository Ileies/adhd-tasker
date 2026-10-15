# UX and UI Plan

Status: decided, ready to implement, re-read against the code on 2026-10-15 after the local first plan. Phases 5 to 7 and 9 are open, phase 8 is half built, phase 10 is built, phase 8b is out of 1.0. The answers to the open questions are in section 15.

**What is already built.** Phases 1 (Transitions) and 2 (Feedback and silence) came from the soon plan, finished and deleted on 2026-10-14 (git history, `docs/soon-plan.md` at `3802a8e`): hero states, time up, transition bar, `...` menu, Done confirmation and sound, draining bar, time in words, tab title, silence line, problems 1 to 3 and the blocked audio part of 4. The local first plan (finished and deleted, git history, `docs/local-first-plan.md` at `a419224`) built these parts of this plan:

- a shared page frame (`PageFrame.svelte`), a title on every page, failure toasts above dialogs, an error page
- **phase 10, first run** (`Welcome.svelte`, `welcome.ts`, `firstrun.ts`, `core/sample.ts`): no theme question, a welcome with a live example and a sample day, an empty day that asks for the first task, the one time second screen hint, `/about`
- **auto-save in settings** (`autosave.ts`, `PUT /settings`, "Saved." next to the control): the per-card Save buttons are gone, only the OpenAI key keeps an explicit Save
- **phase 3, navigation** (`SoundMenu.svelte`, `KeyboardHelp.svelte`, `shortcuts.ts`, `mute.ts`, `nav.ts`): the Now/Plan switch, the context slot, the sound popover with timed mute, Fullscreen and Keyboard shortcuts in the menu, the assistant icon only with a key. Keys `1`, `2`, `A`, `M`, `F` work, the page keys (`D`, `N`, `/`, arrows, `T`) come with phases 4 and 6, the Plan day switcher in the slot with phase 6
- **phase 4, rail and phone Now** (`rail.ts`, `UpcomingRail.svelte`, `MissedTriage.svelte`): "3 done today" under the clock, tappable next items with their time range, the next alarm line, one "N tasks need a decision" line that opens a triage sheet (Done, Later today, Tomorrow, Drop), sticky actions and an "assistant note" link in the hero on phones
- **login is optional**: there is no sign-in wall and no redirect, a guest sees the same app on the device (guest mode). This changed sections 3, 10 and 11 below

Section and phase numbers are kept so references stay valid. Decisions 5 and 6 of section 15 were changed by the roadmap and by Calendar sync.

Basis: a review of every route and component (`+layout.svelte`, Now, Plan, TaskForm, AssistantDrawer, Alarms, Activity, Settings and all settings forms, dialogs, toast, banner). It was read from code, not from screenshots, so every phase ends with a look at the real screen on a wide display and a phone.

## 1. How every control is judged

The app has one job: keep the user anchored to the present task with the least possible thinking. So each control gets a tier, and its size and place follow from the tier, never from how much work it was to build.

| Tier                             | Rule                                                                      | Members                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **1. Always visible, large**     | Needed many times a day, at the moment of acting                          | Done                                                                                               |
| **2. Visible, secondary**        | Needed often, or exactly in a specific moment (shown only in that moment) | I'm stuck, 15 more minutes (only near and after the end), mute, Now/Plan switch, quick add on Plan |
| **3. One tap away**              | Needed sometimes                                                          | Edit, move to later, drop, assistant, alarms, missed triage                                        |
| **4. In a menu or another page** | Configured once or rarely                                                 | Fullscreen, settings, activity, account, legal                                                     |

Three more rules:

- **In context beats transient.** The screen is always on, so a cue that stays where the eye goes (a line in the hero) beats a toast that disappears after 8 s.
- **The moment of transition is the hardest moment** for ADHD (ending one thing, starting the next). It deserves the most design care, and today it gets the least.
- **Silence must be visible.** Muted sound or a browser that blocks audio removes the anchor without the user knowing. That state is always shown.

## 2. The biggest problems, ranked by impact

Problems 1 to 3 and the blocked audio part of 4 are solved (hero states, Done feedback, silence line).

4. **Mute has no timer**, so "muted for a meeting" easily becomes "muted all day". (The visible silence line is built: "Sound off" or "Tap anywhere to turn sound on".)
5. **Navigation has no clear model.** Plan is a button on the left, Now is the logo, `/edit` adds its own "Back to Now", and Alarms, Activity and Settings sit under a user icon that reads as "account".
6. **Priority colors disagree across the app.** High is orange on Now, a blue block on the Plan timeline and an amber chip in the phone list. Urgent is a yellow block but a red chip. Colors only help if they mean one thing.
7. **Settings asks for decisions presets could answer.** (Saving is solved: everything saves on change.) Heads-up, overrun and the token budget are still free number inputs, the nine cards are a long scroll, and the assistant cards show all their options even without a key.
8. **Missed tasks pile up as a wall of buttons.** Up to three cards with Done, +15 min and Drop each sit in the peripheral rail. It is noisy and invites guilt, and there is no "move to later" or "tomorrow", only extend from now or delete.
9. **Plan has two rows of chrome and a dialog-heavy create flow.** Global bar plus a wrapping toolbar (Back, day switcher, date input, Today, quick add, Details). Clicking the timeline opens a full dialog with a 60 min default, while quick add uses 30 min.
10. ~~The first visit asks a question before showing anything~~ Solved by the first run (phase 10): the first visit shows a welcome with a live example, and an empty day says "Nothing planned today" with a quick add line.

Smaller findings are listed per page below.

## 3. Navigation and the top bar

### Model

Two primary places and one tool, everything else is secondary:

- **Now** and **Plan**: a two-segment switch at the left of the bar, always visible (tier 2). Keys `1` and `2`.
- **Assistant**: an icon in the bar, only when a key is saved (tier 3). Without a key the button is a dead end, so it is hidden and Settings explains how to turn it on.
- **Menu** (icon changes from a user to a plain menu icon): Alarms, Assistant activity, Settings, then Fullscreen, Keyboard shortcuts, then the account part (signed in: the email and Log out with its one line of explanation, a guest: "Sync across devices"), then About, Privacy and Terms as one small line. Built in phase 3.

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
  - Mute for 1 hour (first), 30 min, or until I unmute. Stored as `mutedUntil` in `tasker`, sound returns on its own. The silence line (built) then says "Sound off until 15:30"
  - Volume slider
  - "This screen plays sound" switch (moved from the Alarms page, this is where the user thinks about sound)
- **Fullscreen** leaves the bar (tier 4: once per session). Menu item plus the `F` key.
- The bar keeps auto-hiding on Now after 5 s. Logged out is guest mode: the bar is the same, nothing redirects. Today a guest sees the same menu entries as an account, and Activity opens for a guest too (the guest agent runs in the leading tab and logs to the device), so nothing is hidden. Keep it that way unless a page turns out to have nothing to show a guest.

### Keyboard (desktop, shown under Menu > Keyboard shortcuts)

| Key                   | Action                                          |
| --------------------- | ----------------------------------------------- |
| `1` / `2`             | Now / Plan                                      |
| `D`                   | Done (Now)                                      |
| `N` or `/`            | Focus quick add (Plan, and Now on an empty day) |
| `Left` / `Right`, `T` | Previous / next day, today (Plan)               |
| `A`                   | Open the assistant                              |
| `M`                   | Mute or unmute                                  |
| `F`                   | Fullscreen                                      |
| `Esc`                 | Close whatever is open                          |

Shortcuts are ignored while typing in a field. Pure key map in `src/lib/shortcuts.ts` (tested), wired once in the layout.

## 4. Now screen

The hero (states, time up, transition bar, `...` menu, Done feedback, time bar, tab title) is built. What is left here is the rail and the phone layout around it.

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

### Rail details

- Clock stays at the top on wide screens, with one quiet line under it: "3 done today". Done count only, never "of 7", so it only grows and cannot turn into a guilt meter. Hidden at 0. This is one plain line, not a stat tile, CLAUDE.md gets that exception written down. A productivity rating is tracked in `TODO.md` for later.
- **Next list**: "in 28 min, 15 min" is ambiguous. Show "15:00 - 15:15" under the title and "in 28 min" only on the first item. Items are tappable and open the task sheet. "+3 later today" links to Plan. While the hero shows the heads-up line, the first item is emphasized.
- **Next alarm** line when an alarm is set for today ("Alarm 15:40 Leave"). Knowing the app will ring removes the urge to watch the clock.
- **Missed**: the card stack becomes one quiet line, "2 tasks need a decision", that opens a **triage sheet** showing one task at a time: "Did you do Write intro?" [Done] [Later today] [Tomorrow] [Drop], with "1 of 2". One decision at a time instead of a wall of nine buttons. "Later today" uses `nextFreeSlot` in `plan.ts` (built). Tasks from earlier days stay out of scope here, as today.
- **Assistant card** stays above Next (it is rare and time-sensitive). On phones the hero gets a one-line "1 assistant note" link, because the rail is below the fold and a question there is never seen.

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

- Still true in the code: the toolbar has Back to Now, the date input, Today and Details, and a timeline click opens the dialog with a 60 min default (quick add uses 30).
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
- Title field first, large, focused on open. No "Title \*" labels with asterisks: only the title is required and the field says so.
- Date as chips (Today, Tomorrow) plus a picker. Duration chips sit next to the start time (today they are split by the priority select), a free value behind `..`. "Ends 14:30" is shown, so nobody does the math.
- Priority as a five-segment control in the shared priority colors, one tap instead of opening a select.
- Note collapsed behind "Add a note" so the form looks short.
- Edit mode: "Done" / "Reopen" toggle, Delete on the left as a quiet text button (Undo exists, no confirm). Buttons say "Save" and "Add", not "Update Task" / "Create Task".
- A failed save shows why, inline in the dialog and as a toast above it (built in the local first plan, keep it in the new sheet).

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

Today the page is nine cards in this order: Theme, Timezone, Clock, Reminders and overruns, Assistant (the key), Voice, Assistant on its own, Your data, and Sync across devices (guest) or Google Workspace with the Calendar settings (account). The target order:

1. **Reminders and sound**: check-in chime interval, heads-up before the next task, overrun tap, "this screen plays sound", volume. The Clock option joins this section.
2. **Appearance**: theme (light, dark, by daylight). Until phase 8b, "by daylight" keeps its two hour fields (`dayStart`, `dayEnd`, in `tasker` and on the device or account). With 8b they go and it follows sunrise and sunset at the user's location, like Google Maps, and shows "Light from 07:12 to 18:40, based on Leipzig. [Change location]".
3. **Time**: timezone, shown as the current value with a "Change" button that reveals the long list. **My day** (default 07:00 to 23:00), which drives the collapsed hours on the Plan timeline. It is a different thing from the theme hours (when the user is awake, not when it is light), so it is its own setting even before 8b. It must be stored for a guest too: it goes through `Backend.settings` and the `users` row like the other settings, so a new field is added to `remote-backend.ts`, `local/backend.ts`, `settings.ts` (`parseSettingsPatch`) and the schema.

### Location for the daylight theme (phase 8b, not in 1.0)

The roadmap moved this to 1.1: it adds a third party (IP geolocation) and a Privacy page change for a cosmetic gain. Everything below stays as the design for when it is picked up. A guest has no server request to look up an IP from, so for a guest this would be the device location or a city search only, and IP detection would only apply to an account. Decide that before building.

- **Detection**: the server looks up the client IP with an external IP geolocation API on login, and again when the IP changes. The request takes the real client IP from the reverse proxy header. Only a rounded position (2 decimals, about 1 km) and the city name are stored, never the IP. The provider must be HTTPS and gets named on the Privacy page (new third party, purpose, what is sent).
- **Override** (for a VPN or a wrong guess): "Use this device's location" asks the browser once for a precise position, and a city search (a geocoding API, also named on the Privacy page) covers browsers that refuse. A manual location is never replaced by IP detection until the user resets it to automatic.
- **Math**: sunrise and sunset come from a pure `sunTimes(lat, lon, date, timezone)` in `src/lib/sun.ts` (tested, including polar day and night, which fall back to fixed 07:00 to 19:00). Recomputed daily on the client.
- **Data**: `users` gets `locationLat`, `locationLon`, `locationName`, `locationSource` (`ip | device | city`), `myDayStart`, `myDayEnd`. Applied with `bun run db:push`, production with `bun run deploy --db-push`. The old local `dayStart`/`dayEnd` theme hours in `tasker` go away.
- Without any location (lookup failed, offline), the theme falls back to the timezone's main city, and Settings says so.

4. **Assistant**: without a key, only the key field and two lines on what it does and what is sent. With a key: autonomy as three option cards, voice replies, then an "Advanced" disclosure with event toggles, quiet hours and the token budget.
5. **Account and data**: signed in: email, Log out, Google and Calendar, Your data. Guest: Sync across devices, Your data. Privacy and Terms are in the menu already.

The **Google Workspace** card is no longer hidden: Calendar sync uses the grant and its settings live inside the card (`CalendarSettings.svelte`). What stays open is that it still offers Tasks and Keep, which nothing uses. They leave `GOOGLE_SERVICES` before Google verification (`TODO.md`), after which the card is the Calendar card.

### Behavior

- **Everything saves on change**: built (`autosave.ts`, "Saved." next to the control, no Save button except the OpenAI key, which is validated).
- **Presets instead of number fields** (open, the heads-up, overrun and budget fields in `AnchoringSettingsForm.svelte` and `AgentSettingsForm.svelte` are still `type="number"`): heads-up [5][10][15][30] min, overrun [10][15][30][60] min, budget [none][50k][200k][custom]. The pure parsers and limits in `anchoring.ts` and `guardrails.ts` stay the validators.
- Copy gets shorter: one sentence per option, details on demand.

## 11. First run, sign-in, empty states

Built (phase 10, commit `ba93df1`), kept here as the record of what it does:

- The theme SetupDialog is gone. The default stays "by daylight" (with the day hours until 8b) and Settings has the choice.
- The first visit is the app, with a welcome and a sample day to try (`Welcome.svelte`, `welcome.ts`), not a sign-in wall.
- **Empty day on Now**: "Nothing planned today" with a quick add line right in the hero ("What is the first thing?"). This is the same quick add as Plan, not the capture inbox from the roadmap.
- **One-time desktop hint** on Now, dismissible, never shown again, about `F` for fullscreen and the sound screen (`tasker.firstRun.screenHintSeen`, remembered on the device).
- The timezone dialog stays, it only appears on a real mismatch.

Left to check: the roadmap criterion E6 also wants an essentials intro (sleep, meals, water), which the first run does not have. That belongs to the recurring tasks plan, not here.

## 13. Visual system

- **One priority color ramp** used by the hero, timeline blocks, phone list chips, the priority control and the meter, derived from the urgency tokens (Low calm teal, Medium amber, High and Urgent orange, Critical red). `priorityStyle` in `urgency.ts` gets rebuilt on these tokens and its `chip` and `block` maps agree. Done items stay muted with a line through.
- **Primary color** (the purple) is used only for primary buttons and focus, never for meaning, so it does not compete with urgency colors.
- **Page frame**: built (`PageFrame.svelte`, a sticky section list on wide screens). What is left is the title in the bar and the same section spacing everywhere.
- **Type scale**: display (title), clock (time left), body large (hero note, rail first item), body, small. Remove one-off sizes.
- **Touch targets**: at least 44 px on phones (the rail buttons at `size="sm"` and the timeline done circle are below that).
- **Focus**: every interactive element reachable by keyboard with a visible ring, including timeline blocks and rail items.
- **Motion**: unchanged rule, crossfades only. The done confirmation and the new-block outline are the only additions, both static after their fade.
- **Copy**: sentence case everywhere ("Edit task", not "Edit Task"), verbs on buttons, no jargon on main views ("Planned check-ins" instead of "wakeups").

## 14. Phases

Each phase is shippable on its own and ends with `bun run verify --quick`, a look on a wide screen and a phone, and small separate commits. Pure logic first with tests, then components.

Phases 1 (Transitions), 2 (Feedback and silence) and 10 (First run) are built and shipped. Phase 8 is half built (auto-save). The rest is open. Nothing here needs a schema change except phase 8 (My day) and 8b.

| Phase                     | Content                                                                                                                                                                                                                            | Main files                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **3. Navigation**         | Built                                                                                                                                                                                                                              | `+layout.svelte`, `VolumeMenu.svelte`, `src/lib/shortcuts.ts` (new), `app.svelte.ts`                                                     |
| **4. Rail and phone Now** | Built                                                                                                                                                                                                                              | `UpcomingRail.svelte`, `AgentStrip.svelte`, new `MissedTriage.svelte`                                                                    |
| **5. Colors and system**  | One priority ramp, page frame, type scale, touch targets, sentence case                                                                                                                                                            | `app.css`, `urgency.ts`, `PriorityMeter.svelte`, all pages                                                                               |
| **6. Plan**               | Day switcher in the bar, quick add with preview, 30 min default, past dimming, collapsed hours outside My day (07:00 to 23:00 until phase 8 adds the setting), drag to create, keyboard blocks, named overlaps, grouped phone list | `edit/+page.svelte`, `DayTimeline.svelte`, `quickadd.ts`, `plan.ts`                                                                      |
| **7. Task sheet**         | New layout, chips, priority control, failure toast                                                                                                                                                                                 | `TaskForm.svelte`                                                                                                                        |
| **8. Settings**           | Left: sections in the new order, presets, check-in interval, My day (guest and account, on both backends), assistant disclosure, Google card trimmed to Calendar. Built: auto-save                                                 | `settings/+page.svelte`, settings forms, `settings.ts`, `local/backend.ts`, `remote-backend.ts`, `users` schema (then `bun run db:push`) |
| **8b. Daylight theme**    | Out of 1.0 (roadmap). `sunTimes`, IP lookup, device location and city search override, theme without hour fields, Privacy page update                                                                                              | `src/lib/sun.ts` (new), `src/lib/server/location.ts` (new), `theme.ts`, `ThemePicker.svelte`, `hooks.server.ts`, `privacy/+page.svelte`  |
| **9. Secondary pages**    | Alarms cleanup, quick timers, one snooze, Assistant activity with check-ins, assistant drawer suggestions and composer                                                                                                             | `alarms/+page.svelte`, `AlarmBanner.svelte`, `activity/+page.svelte`, `AssistantDrawer.svelte`                                           |
| **10. First run**         | Built                                                                                                                                                                                                                              | `Welcome.svelte`, `welcome.ts`, `firstrun.ts`, `NowHero.svelte`                                                                          |

Phase 3 comes first, because the silence line and the sound settings meet in its sound popover. Every new setting and every new `Backend` method must exist on both backends (CLAUDE.md, Conventions). A phase that changes the UI of a guest-visible page also needs a look as a guest. CLAUDE.md and the Privacy page get updated in the phases that change what they describe.

## 15. Decisions (2026-10-14)

Amended 2026-10-15: decision 5 moved to 1.1 (roadmap), decision 6 is replaced, decision 7 is done.

1. **Timed mute**: yes. 1 hour first, then 30 min and "until I unmute".
2. **Quick timers** on Alarms: 5, 10, 25 min and 1 h.
3. **Snooze**: 5 min, once per alarm.
4. **Collapsed hours** on the timeline: a separate **My day** setting, default 07:00 to 23:00, auto-extending to fit tasks outside it.
5. **Daylight theme**: no user-set hours any more. Sunrise and sunset at the user's location, found by an external IP geolocation API, overridable with the device location or a city search (for a VPN). See section 10. **Not in 1.0**: until then the theme keeps its hour fields.
6. ~~Google card hidden until Calendar sync~~ **Replaced**: Calendar sync exists, so the card stays and holds the Calendar settings. Tasks and Keep come out of the list before Google verification.
7. **First-run theme dialog**: removed, default "by daylight". Done.
8. **Done count**: one plain line "3 done today" in the rail, done count only. A productivity rating is wanted later but depends on the day's real load, which the app cannot know yet, so it is in `TODO.md` under Later.
