# ADHD Tasker

A planner for people with ADHD. The app stays open on a second screen and always shows exactly what you should be doing _right now_: one task, in a color that tells you how urgent it is, with the next few tasks lined up beside it. Your working memory gets to rest.

**Live:** [tasker.ileies.de](https://tasker.ileies.de)

## The Problem

People with ADHD struggle less with _doing_ things than with _knowing what comes next_ and _staying anchored_ to a plan. Classic to-do apps need constant self-directed attention, which is the thing ADHD impairs. ADHD Tasker holds the plan for you, works out what is current from the clock and priorities, and pulls your attention back when you drift.

## Features

- **Now screen:** the current task in an urgency color (priority and time pressure), a countdown, Done with undo, a rail of the next tasks, and a quiet strip for missed ones. The top bar hides itself, and the screen can go fullscreen and stay awake.
- **Predictable priority engine:** the current task is derived, never stored. Among tasks whose time window contains now, the highest priority wins, and every switch shows a one-line reason.
- **Plan screen:** dated days with a 24 hour timeline (drag to move, handle to resize, 15 minute snap), a quick add line ("call dentist 14:30 20m") and a list view for phones.
- **Audio cues:** synthesized with the Web Audio API, no audio files. A sound when the task changes and a soft reminder every 5 minutes.
- **Alarms:** your own alarms (one-off, daily, weekdays) with a tone library and preview. With several screens open, one device can be chosen to make the sound.
- **AI assistant (optional, bring your own OpenAI key):** chat that reads and edits your plan. Every change it makes is logged with a reason and can be undone.
- **Event-driven agent (optional):** it can react to completed, missed or overrunning tasks with a short note or a question, schedule its own wakeups and set alarms. You control autonomy (observe, suggest, act), which events it may react to, quiet hours and a daily token budget. It never wakes itself with its own edits. See `/activity` for what it saw and did.
- **Forgiving by design:** destructive actions show an Undo toast instead of a confirm dialog.
- **PWA:** installable, fullscreen, with a service worker that only caches static assets so your plan is never stale.
- **Google sign-in:** one login, data lives server side and follows you across devices.

The app works fully without AI. Without a key the agent stays silent.

## Tech Stack

| Layer      | Technology                                                     |
| ---------- | -------------------------------------------------------------- |
| Framework  | SvelteKit 3 + Svelte 5 (Runes)                                 |
| Styling    | Tailwind CSS 4 + shadcn-svelte                                 |
| Database   | SQLite + Drizzle ORM                                           |
| Auth       | Google OAuth 2.0 (PKCE) and One Tap via Arctic                 |
| AI         | OpenAI Responses API with the user's own key, stored encrypted |
| Runtime    | Bun                                                            |
| Deployment | `adapter-node` + PM2                                           |

## Getting Started

```bash
bun install
cp .env.example .env      # fill in the values below
bun run db:push           # create the SQLite schema
bun run dev
```

`.git-blame-ignore-revs` lists formatting-only commits. To keep them out of `git blame`, run once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Environment variables (all read at build time):

| Variable                  | Meaning                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client id                                                                                                                                                |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth client secret. Also signs sessions and derives the key that encrypts saved OpenAI keys, so changing it logs everyone out and requires pasting keys again |
| `PUBLIC_REDIRECT_URI`     | OAuth callback, e.g. `http://localhost:5173/callback` for local dev. Must be registered in your Google client                                                         |
| `DATABASE_URL`            | SQLite file, `local.db` by default                                                                                                                                    |

## Commands

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `bun run dev`       | Dev server                                                  |
| `bun run build`     | Production build                                            |
| `bun run check`     | Type check (svelte-check and tsc)                           |
| `bun run test`      | Unit tests, short output                                    |
| `bun run verify`    | Format, tests, types, lint, build. `--quick` before commits |
| `bun run lint`      | Prettier and ESLint                                         |
| `bun run format`    | Auto-format                                                 |
| `bun run db:push`   | Apply the schema to the database                            |
| `bun run db:studio` | Drizzle Studio                                              |
| `bun run deploy`    | Deploy the committed HEAD to the server (see below)         |

## Project Layout

```
src/
├── routes/
│   ├── +page.svelte            Now screen
│   ├── edit/                   Plan screen and task CRUD API
│   ├── alarms/                 Alarms, tone preview, display device
│   ├── activity/               What the assistant changed and saw
│   ├── settings/               Theme, timezone, OpenAI key, agent, Google services
│   ├── assistant/              Chat turn and undo API
│   ├── agent/                  Agent feed and card API
│   ├── schedule/               Alarm and wakeup API
│   ├── stream/                 Server-Sent Events
│   └── callback/               Google OAuth callback
├── lib/
│   ├── app.svelte.ts           The single global state object
│   ├── priority.ts, urgency.ts Ranking and urgency colors (pure)
│   ├── events.ts, guardrails.ts, assistant-tools.ts, schedule.ts, tones.ts   Agent logic (pure, tested)
│   ├── openai.ts               Request builder for every model call
│   ├── components/             App components, ui/ is shadcn-svelte
│   └── server/                 DB, auth session, agent scheduler, events, crypto, stream
├── service-worker/             PWA asset cache
scripts/                        deploy.ts and one-off schema scripts
docs/roadmap-1.0.md             Scope, scorecard and milestones to 1.0
TODO.md                         Open items and plan index
```

Times are stored as minutes since midnight, each task belongs to a dated day (`YYYY-MM-DD` in the user's timezone). Imports use the `#lib/` alias.

## Deployment

`bun run deploy` pushes nothing by default: it takes the committed HEAD of the current branch, resets the server's clone to it, installs, builds on the server (the database path is baked in from the server's `.env`), backs up the database, restarts PM2 and verifies the site. It refuses to start when `bun run verify` fails, and when `schema.ts` changed since the server's commit unless `--db-push` (apply it) or `--schema-applied` (applied by hand) is given. Useful flags: `--push`, `--dry-run`, `--db-push`, `--schema-applied`, `--skip-check` (skips `verify`), `--force` (deploy the committed HEAD despite uncommitted changes). The app runs as a single process on port 3002, which the event stream requires.

## Roadmap

Done: priority engine, Now and Plan screens, PWA, assistant, event-driven agent, scheduler, alarms and tones. Next: voice assistant (push-to-talk), "I'm stuck", hyperfocus alarm and reminders. Later: Google Calendar sync, recurring tasks, capture inbox, end-of-day summary. Scope and order to 1.0 in `docs/roadmap-1.0.md`, open items in `TODO.md`.
