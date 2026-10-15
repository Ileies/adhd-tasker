# Local First Plan

Status: written 2026-10-14, decisions in section 1 open for veto. This plan comes before every other plan. The soon plan (gate, tests, D1 to D8, transitions, feedback and silence) was finished and deleted on 2026-10-14, so this is the only plan being worked on.

## Why

A first visit, logged out, in an incognito window (2026-10-14), told step by step:

| #   | What the visitor met                                                             | Cause in the code                                                                                                                           | Fixed in |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| V1  | A settings dialog (theme) before knowing what the app is                         | `SetupDialog` renders on every non-legal page, signed in or not (`+layout.svelte`)                                                          | 4.1      |
| V2  | Google One Tap at once                                                           | The GSI script is in `app.html` and One Tap starts for every logged out visitor                                                             | 5.2      |
| V3  | After closing both: "Sign in to see your plan", nothing to learn, nothing to try | Login is required by design (`CLAUDE.md`), the logged out `/` is a wall                                                                     | 3, 4     |
| V4  | Mute, fullscreen, Settings and Plan offered without an account                   | The header hides only the assistant, Alarms and Activity when logged out                                                                    | 3.7      |
| V5  | `/settings`, `/privacy`, `/terms` stay a narrow column on a wide screen          | Each page sets its own `max-w-xl` or `max-w-2xl`, no shared page frame                                                                      | 1.6      |
| V6  | "Log in" on `/settings` gives an unstyled 404                                    | The hidden login form posts to `?/login`, which only exists on `/`. No `+error.svelte`, so SvelteKit's bare fallback renders                | 1.3, 1.4 |
| V7  | Plan lets a visitor fill the whole task form, then refuses                       | `/edit` has no gate in the UI, only the API answers 401                                                                                     | 3        |
| V8  | The refusal toast is blurred behind the still open dialog                        | `UndoToast` and the dialog overlay are both `z-50`, the overlay is portaled later and has `backdrop-blur`. `TaskForm` stays open on failure | 1.1      |
| V9  | Quick add says "Could not add task" without a reason                             | `addQuick` in `edit/+page.svelte` drops the reason `createTask` already builds                                                              | 1.2      |
| V10 | The visitor leaves and rates it as unfinished                                    | All of the above. The logged out state was never designed, it is the signed in app with the data missing                                    | all      |

On top of the fixes, the product changes: **the app is fully usable without an account.** Everything a guest does stays in their browser, including their own OpenAI key, and this server never receives their plan. Signing in with Google is optional and adds sync across devices, the server side assistant and alarms, and Google Calendar. Privacy and Terms lead with that.

## 1. Decisions

D1 and D9 are the user's decisions. D2 to D8 are recommendations applied throughout this plan; a veto changes only the steps that name them. Decide before Part 2 starts.

| ID  | Decision                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Login is optional.** Guest mode is the default and complete: plan, Now, alarms, settings, assistant with the user's own key. Sign-in adds sync across devices, the server side agent and Google Calendar. (Decided by the user)                                                                                                                                      |
| D2  | **Two modes, one source of truth each.** Guest: IndexedDB on the device is the truth. Signed in: the server is the truth, as today. On sign-in the device's data moves into the account (5.3). Rejected: local-first everywhere with the server as a sync replica (offline edits on several devices need conflict merging, far larger; revisit after 1.0)              |
| D3  | **The guest's OpenAI key stays on the device.** The browser calls OpenAI directly. Signed in, the key stays on the server as today, because the agent and wakeups run there with the tab closed. Moving to an account never uploads the key unless the user ticks it                                                                                                   |
| D4  | **The guest's agent runs in the browser**, only while the app is open (it is the always-on screen). Settings says so in one line. Signed in, it runs on the server as today                                                                                                                                                                                            |
| D5  | **Google's script loads for everyone who is not signed in** (not on the privacy and terms pages), also on a first visit, so One Tap offers a one tap sign in right away. Changed 2026-10-15 (was: only after Sign in or on a device signed in before). The privacy page says so: the GSI script sends the visitor's IP to Google                                       |
| D6  | **The first visit is the app, not a wall and not a marketing page.** A short welcome inside the app with a live sample, plus a separate `/about` page for those who want to read more                                                                                                                                                                                  |
| D7  | **Guest data is protected against loss** as far as a browser allows: `navigator.storage.persist()`, export and import as JSON, and a calm line in Settings that the plan lives only in this browser                                                                                                                                                                    |
| D8  | **Several guest tabs on one device:** one tab leads (Web Locks), only it runs the tick, the agent and the sound. The others follow over a `BroadcastChannel`. Otherwise two tabs ring twice and react twice                                                                                                                                                            |
| D9  | **Signing in or linking Google never loses data.** A guest plan moves into a new account completely. When the account or the linked calendar already holds a plan, the user is warned, sees the clashes, and chooses what to keep or cancels; nothing is written before that choice, and a replaced plan can be restored for 30 days (5.3, 6.2). (Decided by the user) |

## 2. Order

| Part                      | Effort      | Exit criterion                                                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. First impression fixes | 1 day       | V5, V6, V8, V9 gone on a real screen; any route answers a styled page                                                                                                     |
| 2. Storage seam           | 4 days      | Every existing test passes unchanged; the repo contract suite runs against the database; no component calls `fetch`                                                       |
| 3. Guest mode             | 4 days      | In a fresh browser, without signing in: plan a day, see it on Now, set an alarm, use the assistant with a key, reload, still there                                        |
| 4. First run              | 2 days      | A new visitor reaches a useful screen with no question asked, and can see a sample day in one tap                                                                         |
| 5. Optional account       | 4 days      | A guest with a full plan signs in and finds every task in the account; with an existing account each choice and Cancel leave no task lost; account deletion leaves no row |
| 6. Google Calendar        | 6 to 8 days | Events from a chosen calendar appear on Plan and Now within 5 minutes, an edit in the app reaches Google                                                                  |
| 7. Privacy and terms      | half day    | Every statement checked against the code, guest mode first                                                                                                                |
| 8. Docs                   | half day    | `CLAUDE.md`, `README.md`, the roadmap and the other plans describe the new model                                                                                          |

Part 1 ships on its own and first. Parts 2 to 5 are one line: seam, guest, first run, account. Part 6 needs Part 5 (tokens live in the account). Part 7 is written with Part 5 and finished after Part 6. Each numbered step is one commit unless noted, pure logic first with tests, every part ends with `bun run verify --quick` and a look at a wide screen and a phone in a fresh incognito window.

## 3. Part 1: first impression fixes

Independent of guest mode, they stay right after it.

### 1.1 Toasts above everything

A layer scale in `app.css` (`--z-bar`, `--z-overlay`, `--z-toast`, `--z-alarm`) used by the header, the dialog overlay and content, `UndoToast` and `AlarmBanner`. The toast sits above dialogs, the alarm banner above all. A dialog that fails to save shows the reason inline above its buttons as well (`TaskForm`), since the eye is in the dialog.

### 1.2 Every failure says why

`addQuick` shows the message from `createTask` instead of "Could not add the task". Go through every `showToast('Could not ...')` and pass the reason on. A test in `tasks.test.ts` per mutation: the toast text contains the server's message.

### 1.3 Login and logout are routes

`POST /login` (with an optional `services` field for linking) and `POST /logout` as `+server.ts` routes, replacing the relative `?/login` and `?/logout` actions on `/` and the `linkGoogle` action. Route tests: both work from any page, `/login` sets the state and verifier cookies and redirects to Google, `/logout` clears both cookies. Part 5 changes what the buttons look like, not these routes.

### 1.4 Error page

`src/routes/+error.svelte` inside the app frame: "This page does not exist" for 404 with "Back to Now", a calm "Something went wrong" with "Try again" for 500, never a stack trace. `/error` (failed sign-in) uses the same layout.

### 1.5 Head

A `<title>` on every page ("Plan - ADHD Tasker"; the Now title is live, built with the soon plan). The meta description in `app.html` ("24-hour task management application") becomes the manifest's line. Open Graph title, description and image for link previews.

### 1.6 Page frame (moved from UX plan section 13)

One `PageFrame.svelte` for every secondary page (Settings, Alarms, Activity, About, Privacy, Terms): title, then on wide screens a sticky section list on the left and the content next to it; one scroll on phones. Running text stays at reading width (about 70 characters) on purpose: the fix for a wide screen is using the space beside it, not stretching lines. Body text one step larger from `lg`.

## 4. Part 2: storage seam

No behavior change. It makes Part 3 a second implementation instead of a rewrite.

### 2.1 Spike (half a day, before anything else in Part 2)

Measured in a real browser, results written into this section:

- `POST https://api.openai.com/v1/responses` and `/v1/audio/transcriptions` from a page on another origin with the user's key (CORS).
- The Realtime WebSocket from the browser with the key as subprotocol (`openai-insecure-api-key.<key>`), as `src/lib/server/voice.ts` uses it.
- `fake-indexeddb` under Bun with `--isolate`.

**Results (2026-10-14, from a shell, no browser and no key at hand):**

- CORS: the preflight for `/v1/responses` and `/v1/audio/transcriptions` from a foreign origin answers 200 with `access-control-allow-headers: authorization,content-type` and an allowed origin. An unauthenticated POST answers 401 with `access-control-allow-origin: *`, so the browser can read the error. Still to see once with a real key in a browser: a full `responses` call and a transcription upload.
- Realtime WebSocket: not measurable with curl (HTTP/2 answers 405 to the upgrade). Browsers do not apply CORS to WebSockets, so only the subprotocol key handshake is open. Check it in a browser console with a key before Part 3.5 relies on it. If it fails, voice replies for guests are the only feature that needs the relay.
- `fake-indexeddb` 6.2.5 works under `bun test --isolate --randomize`: each file gets its own database. Inside one file, tests share it, so the local repo tests need a fresh `IDBFactory` in `beforeEach` (the same shape as `resetDb`).

**With the key from `.env` (2026-10-14, from a Bun script that sends a foreign `Origin` and uses the browser's subprotocol form):**

- `/v1/models`, a full `/v1/responses` call built by `buildRequest`, and a `/v1/audio/transcriptions` upload all answer 200 with `access-control-allow-origin: *`.
- The Realtime WebSocket with `['realtime', 'openai-insecure-api-key.<key>']` as subprotocols works: `speak` from `core/voice.ts` returned a WAV (79 kB for "Time to start."). Header-less, so a browser can do it.
- **In a real browser (headless Chrome on `http://localhost:5199`, 2026-10-15, driven over the DevTools protocol, the key typed into the Settings form of a fresh guest profile):** the key check (`GET /v1/models` with its preflight), a full assistant turn (two `POST /v1/responses`, one preflight) that added a task to the guest's IndexedDB, a transcription upload (`200`) and the Realtime socket with `['realtime', 'openai-insecure-api-key.<key>']` (three audio chunks, response `completed`) all work. Over the whole session the page made no API call to this server. D3 stands without a relay.

If OpenAI refuses browser calls, D3 needs a stateless relay on this server that forwards and stores nothing. The key would then pass through the server, and Privacy must say so. Decide then, not now.

### 2.2 `Repo` port

`src/lib/core/repo.ts`: one interface, bound to one user, with exactly what the server modules use today: tasks (day range, get, insert, update, delete), agent actions, events, cards, schedule entries, usage rows, settings (the `users` fields). `src/lib/server/db-repo.ts` implements it with Drizzle, scoped by email in one place instead of in every query.

A **contract suite** `src/test/repo-contract.ts` describes the behavior once (ordering, scoping, missing ids answer `null`, pruning). `db-repo.test.ts` runs it now, the local repo in Part 3 runs the same suite. That is the proof that guest and account behave alike.

### 2.3 Core out of the server modules

The rules in `server/assistant.ts` (tool loop, `runTool`, `undoAction`), `server/agent.ts` (`react`), `server/schedule.ts` (alarm create, cancel, `fireDue` for one user), `server/events.ts` (`emit`, usage) and `server/voice.ts` (request building) move to `src/lib/core/`. They take `{ repo, model, now }`. `model` is a port that sends what `buildRequest` built, so the OpenAI rules stay where they are. The server modules keep the parts that only make sense there (the 15 s loop over all users, per-user rate limits, the stream) and become thin. One step per module.

Proof: every existing test passes without changes to its assertions. The temporary untested entries for these modules (checks plan phase 4) move to the core modules with the same reason.

### 2.4 `Backend` on the client

`src/lib/backend.ts`: the one interface the UI talks to: load a day, task create, update, delete, schedule, assistant turn, undo, agent poll, card answer, stuck, settings, transcribe, speak, export. `remoteBackend` is the fetch code that lives today in `tasks.ts`, `alarms.ts`, `agent.ts`, `assistant.ts`, `speech.ts` and `theme.ts`. `tasker.backend` is set once at hydration. The rollback and toast rules of soon plan 3.5 stay in `tasks.ts` above the backend, so both backends get them.

Architecture rule: `fetch(` appears only in backends and server code, never in a component or a route's `.svelte`.

### 2.5 Settings save on change (moved from UX plan section 10, Behavior)

Form actions only reach a server, so the settings forms move to the backend. In the same step they save on change with a small inline "Saved", and the per-card Save buttons go. The OpenAI key keeps an explicit Save, because it is checked. The pure parsers in `anchoring.ts` and `guardrails.ts` stay the validators on both sides. Presets instead of number fields stay in UX phase 8.

## 5. Part 3: guest mode

### 3.1 Local repo

`src/lib/local/repo.ts` on IndexedDB (through `idb`, about 1 kB, or plain IndexedDB if the spike shows it is enough). One object store per table, integer ids. A database version with a pure, tested list of upgrade steps, so a guest's data survives app updates. Runs the contract suite on `fake-indexeddb`.

### 3.2 Guest settings

`DEFAULT_SETTINGS` in one pure module, used by the `users` schema defaults and the local repo, so a new guest and a new account start identical. Theme and timezone stay where they are.

### 3.3 Local backend and the tick

`localBackend`: the core from 2.3 with the local repo and a browser model port that reads the key from the local repo. A client tick every 15 s does for one guest what the server loop does for every user: `detectEvents`, the agent through `decideReaction` (guardrails unchanged, D4), `fireDue` for local alarms and wakeups, pruning. The tick and the sound run only in the leading tab (D8, `navigator.locks`); other tabs reload a day when the leader broadcasts a change. The display device question does not exist for a guest: the leading tab plays.

### 3.4 Hydration without a flash

For a guest the layout load returns no user and no tasks. The client picks the local backend and loads today. Until IndexedDB answered, Now shows nothing (one calm frame), never the empty state, which would be a lie for a moment.

### 3.5 The key on the device

`OpenAiKeyForm` in guest mode checks the key against OpenAI from the browser (`/v1/models`) and stores it in the local repo. Transcribe and speak run from the browser too. A test with `fakeFetch`: across a full assistant turn, a voice turn and a key check, the guest backend sends nothing to this origin and only the expected requests to `api.openai.com`. The architecture rule on OpenAI call sites gets the browser model port as its one new entry. A Content Security Policy with `connect-src 'self' https://api.openai.com` (and Google's origins only on pages that load GSI) narrows what a script injection could do with a key held in the browser.

### 3.6 Export, import, delete

Settings > "Your data": export everything as one JSON file, import such a file, "Delete everything on this device" (with an Undo toast for 10 s before the data is actually removed). Pure `parseExport` with a format version (tested, property test: export then import gives the same plan). The same format serves account export in 5.5 and the move in 5.3. One quiet line: "Your plan lives only in this browser. Clearing site data deletes it. Export a copy, or sign in to sync." `navigator.storage.persist()` is asked once, when the first task is saved.

### 3.7 No more dead ends

Plan, Alarms, Activity, the assistant and every Settings section work for a guest. The header is the same in both modes. The menu's "Log in" becomes "Sync across devices" (Part 5). `/alarms` and `/activity` stop redirecting logged out visitors.

### 3.8 Rules

The architecture test's storage allowlist gains `src/lib/local/**` (IndexedDB, the guest's data by design) and the D5 flag; it still refuses task data in `localStorage` anywhere else. `CLAUDE.md` "What to avoid" changes in Part 8.

## 6. Part 4: first run

### 4.1 No question first (UX plan section 11)

`SetupDialog` is deleted. The timezone comes from the device without asking, the theme starts on "by daylight". The timezone dialog stays for a real mismatch on a signed in account.

### 4.2 Welcome

Only on the very first visit (no local data, no account, never dismissed). A full page on `/`, not a modal:

```
+--------------------------------------------------------------+
|                                                              |
|   This screen shows the one thing to do right now.           |
|                                                              |
|   +------------------------------------------------------+   |
|   | 14:00 - 15:00                                        |   |
|   | Write the report intro              (live sample,    |   |
|   | 28 min left   [=============-------]  real NowHero)  |   |
|   +------------------------------------------------------+   |
|                                                              |
|   Plan your day in blocks. Keep this open on a second        |
|   screen or your phone. It calls you back when it is time.   |
|                                                              |
|   [ Plan my first task ]     [ Try a sample day ]            |
|                                                              |
|   Works without an account. Your plan stays on this device.  |
|   How it works  -  Use it on another device? Sign in         |
+--------------------------------------------------------------+
```

Two buttons, two links. "Sign in" is there for the returning user on a new device, who must not be forced through a guest setup.

### 4.3 Sample day

`sampleDay(now)` in a pure module (tested, never crosses midnight, one task current at `now`): four or five tasks around now. They carry a local `sample` mark, a line in the rail says "Sample day. [Clear it]", and clearing removes exactly those. Samples are never moved into an account.

### 4.4 Empty day (UX plan section 11)

"Nothing planned today." with the quick add line right in the hero ("What is the first thing?") and "Open Plan".

### 4.5 Second screen hint (UX plan section 11)

One time, dismissible, after the first task exists: "Running this on a second screen? Press F for fullscreen." (The sound screen part only applies to accounts with several devices.)

### 4.6 `/about`

Public, in the page frame: what the app is for, how Now, Plan, sound and the optional assistant work, the two modes and what each stores where, a link to Privacy. Short, plain, no claims. Linked from the welcome, the menu and Privacy. `CLAUDE.md`'s "no marketing copy on the main views" still holds: About is not a main view.

## 7. Part 5: optional account

### 5.1 What signing in gives

A "Sync across devices" section in Settings (and the menu entry pointing to it): three lines on what signing in adds (your plan on every device, the assistant and alarms keep working with the app closed, Google Calendar), one line on what it costs (your plan is then stored on this server), and "Sign in with Google".

### 5.2 Google's script on demand (D5)

`app.html` loses the GSI script tag. `onetap.ts` injects it from the layout for every visitor who is not signed in, except on the privacy and terms pages (`wantsOneTap`). The `signedInBefore` flag is gone.

### 5.3 Moving the device into the account

The rule (D9): **no way through sign-in loses data, and nothing is written until the user has chosen.** A guest with a full schedule must find every task in the account afterwards, and an account that already holds a plan is never overwritten without a warning and a way back.

After the callback the device is signed in, but while it holds guest data the app shows the move screen before anything else. Closing the tab changes nothing: the guest data stays on the device and the screen comes back on the next load.

- **New account** (no tasks, no alarms): everything moves without a question. Toast "Your plan is now in your account" with Undo.
- **Existing account with data:** a warning screen, not a card, because it is a decision about the whole plan:

  ```
  Your account already has a plan.

  This device      48 tasks over 9 days, 3 alarms
  Your account     120 tasks over 14 days, 5 alarms
  Both plan the same time on 6 days (22 tasks)   [Show them]

  ( ) Keep both            Adds this device's plan to your account.
                           Overlapping tasks stay, Plan marks them.
  ( ) Keep my account's    This device's plan is not uploaded. It stays
                           on this device, and you can export it.
  ( ) Keep this device's   Replaces your account's plan from today on.
                           The old plan can be restored for 30 days.

  [ Continue ]     [ Cancel sign-in ]
  ```

  "Show them" lists the clashing days side by side, read only. No option is preselected, so Continue needs a choice.

- **Cancel sign-in** signs this device out again (revokes the token, clears the cookies) and leaves both plans exactly as they were. The device stays a guest.
- A tick box: "Also save my OpenAI key to my account", off by default (D3).
- Settings: a new account takes the device's settings, an existing one keeps its own unless "Keep this device's" was chosen.

Making "never lost" true:

- The comparison is pure: `comparePlans(device, account)` in `src/lib/merge.ts` (tested) returns the counts, the day ranges and the clashing tasks per day. Samples are left out.
- `POST /account/import` takes the export format (3.6) and a `mode` (`both`, `replace`). It validates every task with `parseTaskInput` and every alarm with the schedule parsers first and refuses the whole import with the reasons if one row is invalid, then writes in one transaction and emits the changes with origin `user`. A full plan is the normal case: tested with 5000 tasks, inside the request size limit.
- `replace` first stores a snapshot of the account's plan in the export format (new `plan_snapshots` table, pruned after 30 days, applied with `bun run db:push`, production with `deploy --db-push`). Settings > "Your data" offers "Restore the plan from before 14 Oct" while it exists. Restoring is itself snapshotted, so it can be undone too.
- The device deletes its guest data only after the server confirmed the import, and keeps one local backup in the export format for 30 days ("Restore" in Settings while signed out). With "Keep my account's", the guest data stays on the device untouched and reappears after signing out.
- Route tests: each mode, an invalid row refuses everything, a failure halfway writes nothing, another user's data is never touched, a snapshot exists before `replace` writes, restore brings back the exact plan.

### 5.4 Signing out

The menu entry says what happens: "Log out. Your plan stays in your account, this device goes back to its own plan." Guest data kept on the device with "Keep my account's" reappears.

### 5.5 Export and delete for accounts (roadmap G1)

`GET /account/export` in the same format as the guest export. "Delete my account" in Settings: an Undo toast for 10 s, then the user row goes and foreign keys (foreign keys on, built with the soon plan) take every other row with it; Google tokens are revoked (Part 6). Test: no row of the user is left in any table. The guest gets the device delete from 3.6.

## 8. Part 6: Google Calendar

Signed in only, because the server holds the tokens and syncs while the app is closed. This is the largest part. Its outline is decided here, the details at its start.

### 6.1 Tokens

Linking asks for offline access, the refresh token is stored encrypted (`crypto.ts`, as the OpenAI key) in a new `google_tokens` table, revoked on unlink and on account delete. Closes the known gap in `CLAUDE.md`. Schema applied with `bun run db:push`, production with `deploy --db-push`. The Google card in Settings returns (UX decision 6 held it back until Calendar used the grant).

### 6.2 Read

The first sync is a preview, not a write (D9). After the user picks one or more calendars, the server fetches their coming events and the app shows the same kind of screen as 5.3: "Your calendar has 34 events in the next 14 days, 9 of them at the same time as tasks in your plan [Show them]", with **Import all** (overlaps stay and Plan marks them), **Import only what does not clash**, and **Cancel linking**, which revokes the grant and deletes the stored token. Nothing in the plan or in Google changes before that choice, and the app never deletes or moves a Google event on its own during linking.

After that, the server pulls with incremental sync tokens every 5 minutes and when a screen opens. Timed events of the coming days become tasks with `source: 'google'`, `googleEventId`, `calendarId` and `etag`, so `rank()`, Now and the agent treat them like any task (priority 3 by default, changeable). All-day events show as one line on Plan, not as tasks. Events crossing midnight are split (the house rule) and are read-only in the app. Recurring series arrive as single instances (`singleEvents`).

### 6.3 Write

Moving, resizing or completing an imported task patches the event (time, and a "done" marker in the description, never a deletion), guarded by the `etag`: when Google changed it meanwhile, Google wins and a toast says so. A setting "Add my tasks to Google Calendar", off by default, writes app tasks into a chosen calendar. Editing a whole recurring series waits for recurring tasks (roadmap C1).

### 6.4 Before more than 100 users

Calendar scopes are sensitive: Google requires app verification and the Limited Use disclosure on the Privacy page. Start the verification when 6.2 works, it takes weeks.

## 9. Part 7: Privacy and terms

Rewritten, guest mode first:

- **Without an account:** your plan, settings and OpenAI key stay in this browser. This server never receives them, sets no cookie and does not load anything from Google. The assistant talks to OpenAI directly from your browser, under your key and OpenAI's terms. What this server still sees: the request for the app's files (check the reverse proxy for IP logging and state its retention).
- **With an account:** what is stored and why (as today), the OpenAI key only if you save it there, Google tokens and calendar data with the Limited Use statement, export and deletion (5.5).
- **Terms:** guest data lives in the browser and can be lost when site data is cleared; export exists for that. No change to the rest.

Each statement names the code that makes it true, in the commit message, as roadmap G2 asks.

## 10. Part 8: docs

- `CLAUDE.md`: "What This App Is" (works without an account), the Auth section ("Login is required" goes; the two modes, the move on sign-in, GSI on demand), State (`tasker.backend`), Architecture (core, `Repo`, `Backend`, local repo, guest tick, leader tab), What to Avoid (no task data in `localStorage`, the guest data lives in `src/lib/local/` only), Known Gaps (tokens are stored now).
- `README.md`: the two modes.
- `docs/roadmap-1.0.md`: the 1.0 sentence starts with "opens the app, with or without an account". New rows for guest mode, first run and the account move, Calendar sync moves from "Not in 1.0" into scope (E6's essentials intro is now part of the welcome flow when C1 lands), the scorecard total changes.
- `docs/ux-plan.md`: remove what moved here (section 3 logged out redirects and "sign-in page stays as it is" in section 11, both now wrong; section 10 Behavior; section 13 page frame; phase 10) and point to this plan.
- `docs/checks-and-tests-plan.md`: route matrices gain the guest column (every API still answers 401 to a guest, the guest never calls it).

Then delete this file, re-read `ux-plan.md`, `checks-and-tests-plan.md` and `feature-ideas.md` against the new code, update them once, and pick the next plan.
