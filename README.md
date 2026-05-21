# ADHS Tasker

A task management web app built specifically for people with ADHD. The core idea is simple: instead of a to-do list you have to mentally manage, the app is always open, always visible, and always shows you exactly what to do *right now*. One task. Full screen. No ambiguity. Your working memory gets to rest.

**Live:** [tasker.ileies.de](https://tasker.ileies.de)

---

## The Problem It Solves

People with ADHD struggle less with *doing* things and more with *knowing what to do next* and *staying anchored* to a plan. Classic to-do apps fail because they require constant self-directed attention - the very thing ADHD impairs. ADHS Tasker is a safe external anchor: it holds the entire plan so you never have to. It tracks the time, surfaces the right task automatically, and keeps pulling your attention back when you drift - so you don't have to juggle 100 things in your head. Just look at the screen and do the one thing it shows you.

---

## Core Features

- **Active task display** - Fullscreen focus view shows the current task, a live countdown, and a color-coded progress bar (green → yellow → red as time runs out)
- **24-hour timeline editor** - Drag-and-drop task scheduling on a visual day view with compact/expanded toggle
- **Priority system** - 5 levels (Low → Critical) with automatic active task selection by priority and time window
- **Audio cues** - Synthesized tones via Web Audio API on task start; soft reminder chimes every 5 minutes to re-anchor attention
- **Productivity analytics** *(planned)* - Retrospective view of completion rates, patterns by time of day, and priority adherence
- **AI integration** *(planned)* - Scheduling assistance and contextual ADHD-specific tips during daily planning
- **Google Calendar sync** *(planned)* - Two-way sync so tasks appear in and can be created from Google Calendar
- **Google OAuth** - Sign in with Google; all data is stored server-side and persists across devices

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (Runes) |
| Styling | Tailwind CSS 4 + DaisyUI 5 |
| Database | SQLite + Drizzle ORM |
| Auth | Google OAuth 2.0 via Arctic |
| Runtime | Bun |
| Deployment | Node.js adapter + PM2 on NixOS |

---

## Architecture

```
src/
├── routes/
│   ├── +layout.svelte          # Navbar, drawer sidebar, global layout
│   ├── +layout.server.ts       # Session validation, task loading
│   ├── +page.svelte            # Dashboard: active task + task list
│   ├── +page.server.ts         # Auth actions (login/logout)
│   ├── edit/
│   │   ├── +page.svelte        # 24h timeline calendar editor
│   │   └── +server.ts          # Task CRUD API (POST/PUT/DELETE)
│   └── callback/+server.ts     # Google OAuth callback
├── lib/
│   ├── app.svelte.ts           # Global reactive state (Svelte 5 $state)
│   ├── types.ts                # Task, Priority, TaskStatus types
│   ├── index.ts                # Client-side task operations + audio
│   ├── components/
│   │   ├── ActiveTaskDisplay.svelte
│   │   ├── TaskList.svelte
│   │   ├── TaskForm.svelte
│   │   └── DarkModeSwitch.svelte
│   └── server/
│       ├── db/schema.ts        # Drizzle schema (users, tasks, reminders)
│       ├── db/index.ts         # DB connection
│       └── index.ts            # Server-side helpers
```

**State management:** A single global `tasker` object (Svelte 5 `$state`) holds all tasks, the active task, focus mode state, and mute state. It is hydrated server-side on load and updated optimistically on mutations.

**Time representation:** Task times are stored as *minutes since midnight* (0–1440). Durations are also in minutes.

---

## Development Setup

```bash
# Install dependencies
bun install

# Environment variables
cp .env.example .env
# Fill in GOOGLE_CLIENT_SECRET and PUBLIC_GOOGLE_CLIENT_ID

# Push DB schema
bun run db:push

# Start dev server
bun run dev
```

**Useful commands:**

| Command | Description |
|---|---|
| `bun run dev` | Dev server with hot reload |
| `bun run build` | Production build |
| `bun run check` | TypeScript + Svelte type checks |
| `bun run lint` | Prettier + ESLint |
| `bun run format` | Auto-format everything |
| `bun run db:push` | Apply schema changes to DB |
| `bun run db:studio` | Open Drizzle Studio (DB GUI) |

**Production:** Build with `bun run build`, run with PM2 (`pm2 start pm2.config.cjs`). App serves on port 3002.
