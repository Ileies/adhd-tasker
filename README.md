# ADHD Tasker
This project is a simple 24 hour task management application designed to help individuals with ADHD manage their tasks and stay focused. It allows users to create, edit, and delete everyday tasks, set reminders, and categorize tasks based on priority.

## It works like the following:
1. Users can create tasks with a title, description, and time.
2. Tasks can be categorized by priority (high, medium, low).
3. Then, the currently active task is displayed on full screen.
4. The background changes color based on the time left to complete it.
5. When a task with higher priority starts, it replaces the currently active task.
6. When the task is clicked, it gets completed and the next task is displayed.
7. A short sound plays when the task is started, completed, or changes.
8. From time to time, a short sound plays to remind the user to stay focused.

Users are only connected via Google OAuth, to keep it simple and connect the Google Calendar on an instant.

Roadmap:
- [X] Implement task creation and editing functionality
- [X] Implement task deletion functionality
- [ ] Implement task categorization by priority
- [X] Reminder notifications
- [X] Calendar view for tasks
- [X] Add Sounds
- [ ] Sync tasks with Google Calendar
- [X] User-friendly interface
- [X] Implement user authentication

Stack:
- SvelteKit with Svelte 5 for webapp and routing
- DaisyUI and Tailwind for design
- Bun for package management
- Arctic for OAuth authentication
- SQLite for database management
- Lucide for icons
