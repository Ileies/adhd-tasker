# Google app verification for Calendar

Local first plan 6.4. The Calendar scope is sensitive. Until Google verifies the app, a Google Cloud project in production shows users an "unverified app" warning and is capped at 100 users who ever granted it. Verification takes weeks, so it starts as soon as 6.2 and 6.3 work in production, before the 100th user is near. The steps here are a checklist to confirm against the current text of Google's verification pages, which change.

## What the app asks for and why

| Scope                                             | Used for                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://www.googleapis.com/auth/calendar.events` | Reading events of the next 14 days into the plan (6.2). Changing the time of an imported event and marking it done, and adding the user's own tasks when they turn that on (6.3). Never deleting an event the app did not make. |

Everything else Settings offers (`tasks`, `keep`) is not used by any code yet. Ask for a scope only when a feature uses it: before submitting, take Tasks and Keep out of `GOOGLE_SERVICES` in `src/lib/google.ts` (or hide them from the picker) so the consent screen and the justification only name Calendar.

## Before submitting

- The consent screen names the app, has the logo, the home page and a link to `/privacy`, and lists the authorized domain (`ileies.de`), which is verified in Google Search Console.
- `/privacy` carries the Limited Use statement and says what is read and written (done in 6.4, checked against the code by `src/routes/privacy`). Keep it in step with any change to the Calendar code.
- The app is reachable without a login on its home page and on `/privacy`, as Google checks the home page.
- Scope justification, short and concrete: what a user sees (events become tasks, a task moved in the app moves its event) and why a narrower scope does not do (`calendar.events.readonly` cannot write the time back, which 6.3 needs).
- A screen recording (unlisted video) of the whole flow on the production domain: sign in, linking Calendar with the consent screen showing the client id, the preview and the choice, an event becoming a task, moving the task and the event moving in Google Calendar, unlinking.
- A test account for the reviewer is not needed for a sensitive scope, but have one ready.

## While it runs

- Google may ask follow-up questions by email to the address on the project. Answer within the time they give, or the request closes.
- Do not change the scopes of the request while it is under review.
- A refresh token from an unverified app expires after 7 days while the consent screen is in "Testing". Linking again fixes it, and verification and "In production" status end it.

## Afterwards

Remove the "unverified" notes from user facing text if any were added, and update `CLAUDE.md` (Part 8 of the plan).
