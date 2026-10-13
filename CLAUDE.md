# ADHS Tasker - Claude Instructions

## What This App Is

A task management web app built for people with ADHD. The core concept: the app is always open, always visible, and always shows exactly what the user should be doing *right now*. It is an external anchor - it holds the plan so the user's working memory doesn't have to.

Every design and implementation decision should be evaluated against this: does it reduce cognitive load, minimize unnecessary decisions, and keep the user anchored to the present task?

## ADHD-Specific Design Principles

This is not a generic productivity app. ADHD users have specific needs that must be treated as first-class constraints:

- **One thing at a time.** The UI should never overwhelm. The active task gets visual dominance; everything else recedes.
- **Minimal friction.** Every extra tap, decision, or step before a user can see their current task is a failure. Login once, then it just works.
- **Forgiving interactions.** Accidental task completion, mis-scheduling - these should be easy to undo.
- **External anchoring.** The app should re-attract attention (audio cues, color shifts) rather than expect the user to remember to look at it.
- **Immediate feedback.** Completing a task should feel satisfying. Audio + visual confirmation matters.

When implementing new features, think carefully about the ADHD experience. When in doubt, do less and do it better rather than adding more.

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (Runes API - `$state`, `$derived`, `$effect`)
- **Styling:** Tailwind CSS 4 + shadcn-svelte (components in `src/lib/components/ui`, add more with `bun x shadcn-svelte@latest add <name>`). Dark mode is a `.dark` class on `<html>`; status colors are `success`, `warning`, `info` tokens in `src/app.css`
- **Database:** SQLite via Drizzle ORM (file: `local.db`)
- **Auth:** Google OAuth 2.0 via Arctic 3
- **Runtime:** Bun (dev + production)
- **Deployment:** `@sveltejs/adapter-node` + PM2 on port 3002

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard - active task display + task list |
| `/edit` | 24-hour timeline calendar for scheduling tasks |
| `/edit` (API) | Task CRUD - POST (create), PUT (update), DELETE |
| `/callback` | Google OAuth callback |
| `/settings` | User preferences (currently theme only; stored in localStorage) |

### State Management

Single global reactive object in `src/lib/app.svelte.ts`:

```ts
tasker = {
  tasks: Task[],
  activeTask: Task | null,
  isFullScreen: boolean,
  timeLeft: number,       // minutes remaining on active task
  isMuted: boolean
}
```

Hydrated from server on layout load. Updated optimistically on mutations. **Login is required** - there is no unauthenticated localStorage fallback (by design).

### Database Schema (`src/lib/server/db/schema.ts`)

**`users`** - keyed by Google email
- `email` (PK), `enableReminders`, `reminderAdvanceTime` (minutes), `enableOverdueNotifications`, `enableFocusMode`, `darkMode`, `openaiKey`

**`tasks`**
- `id`, `title`, `description`, `email` (FK), `startTime` (minutes since midnight), `duration` (minutes), `priority` (1–5 enum), `status` ('pending'|'active'|'completed'|'overdue')

**`reminders`** - prepared for Google Calendar sync, not yet wired up
- `id`, `taskId` (FK), `reminderTime` (minutes since midnight)

### Auth Flow (`src/hooks.server.ts`, `src/routes/callback/+server.ts`)

1. User clicks login → server generates OAuth state + PKCE verifier, stores in httpOnly cookies, redirects to Google
2. Google redirects to `/callback` → validates state, exchanges code for token, sets 7-day token cookie
3. Every request: `hooks.server.ts` validates token with Google OIDC, creates user in DB on first login, populates `event.locals.user`

### Time Representation

All times are stored as **minutes since midnight** (0–1440). A task at 9:30am = `570`. Duration of 90 minutes = `90`. Convert carefully when working with JS `Date` objects.

### Audio (`src/lib/index.ts`)

Synthesized via Web Audio API - no audio files. `playSound('task-started')` and `playSound('reminder')`. Reminder fires every 5 minutes while a task is active and app is unmuted.

## Development Commands

```bash
bun run dev          # Dev server
bun run build        # Production build
bun run check        # Type check
bun run lint         # Prettier + ESLint
bun run format       # Auto-format
bun run db:push      # Apply schema to SQLite
bun run db:studio    # Drizzle Studio GUI
```

## Current Gaps & Known Issues

- Overdue task status (`TaskStatus.Overdue`) is defined but never automatically set
- Reminder notifications are schema-ready but not wired up
- `test.ts` in root is a leftover - should be deleted
- `openaiKey` in user schema is prepared for AI integration (not implemented yet)

## Planned Features (Do Not Implement Without Discussion)

- **Productivity analytics dashboard** - retrospective view of completion rates, patterns by time of day/priority
- **Google Calendar sync** - two-way (killer feature, high complexity)
- **AI integration** - scheduling assistant during daily planning, contextual ADHD tips. Uses `openaiKey` stored per user. Scope needs design before implementation.
- **Settings page** - user preferences: reminders, focus mode, dark mode, OpenAI key input
- **Overdue detection** - automatic status transitions with notifications

## What to Avoid

- Do not add features that increase cognitive load on the user without a clear ADHD-experience justification
- Do not split state into multiple stores - the single `tasker` object is intentional
- Do not add unauthenticated/localStorage fallback - login is required by design
- Do not add animation or visual complexity that competes with the active task display
- Do not touch the DB schema without running `bun run db:push` afterward
