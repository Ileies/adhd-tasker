# Daylight theme from location (1.1)

Status: designed, not built. Out of 1.0 (`roadmap-1.0.md`, "Not in 1.0"): it adds a third party (IP geolocation) and a Privacy page change for a cosmetic gain. Until then the theme "by daylight" keeps its two hour fields (`dayStart`, `dayEnd`) under Appearance and stays the first run default.

Goal: no user-set hours. The theme follows sunrise and sunset at the user's location, like Google Maps, and Settings shows "Light from 07:12 to 18:40, based on Leipzig. [Change location]".

## Decide before building

A guest has no server request to look up an IP from. For a guest this would be the device location or a city search only, and IP detection would only apply to an account.

## Design

- **Detection**: the server looks up the client IP with an external IP geolocation API on login, and again when the IP changes. The request takes the real client IP from the reverse proxy header. Only a rounded position (2 decimals, about 1 km) and the city name are stored, never the IP. The provider must be HTTPS and gets named on the Privacy page (new third party, purpose, what is sent).
- **Override** (for a VPN or a wrong guess): "Use this device's location" asks the browser once for a precise position, and a city search (a geocoding API, also named on the Privacy page) covers browsers that refuse. A manual location is never replaced by IP detection until the user resets it to automatic.
- **Math**: sunrise and sunset come from a pure `sunTimes(lat, lon, date, timezone)` in `src/lib/sun.ts` (tested, including polar day and night, which fall back to fixed 07:00 to 19:00). Recomputed daily on the client.
- **Data**: `users` gets `locationLat`, `locationLon`, `locationName`, `locationSource` (`ip | device | city`). `myDayStart`/`myDayEnd` already exist. Applied with `bun run db:push`, production with `bun run deploy --db-push`. The local `dayStart`/`dayEnd` theme hours in `tasker` go away. A new field goes through `remote-backend.ts`, `local/backend.ts` and `settings.ts` (`parseSettingsPatch`).
- Without any location (lookup failed, offline), the theme falls back to the timezone's main city, and Settings says so.

## Files

`src/lib/sun.ts` (new), `src/lib/server/location.ts` (new), `theme.ts` (then it gets a test, it is on the untested list in `architecture.test.ts` until this), `ThemePicker.svelte`, `hooks.server.ts`, `privacy/+page.svelte`.

Estimate: 4 points, replaces nothing (`roadmap-1.0.md`).
