/**
 * Sunrise and sunset for a place and a day, from the NOAA sunrise equation (good to a minute or two,
 * which is plenty for a theme). Pure: the day is a `YYYY-MM-DD` key and the answer is in minutes
 * since midnight in the given timezone, like every other time in the app.
 */
import { localMoment, type DateKey } from '#lib/time.js';

/** The light window when the sun does not rise or set (polar day and night) or the place is unknown: 07:00 to 19:00. */
export const FALLBACK_DAY: { start: number; end: number } = { start: 420, end: 1140 };

export interface DayLight {
	/** Minutes since midnight, sunrise. Wraps past `end` only when the zone is far from the place. */
	start: number;
	/** Sunset. */
	end: number;
	/** The sun stays up or down all day, `start` and `end` are the fixed fallback hours. */
	polar: 'day' | 'night' | null;
}

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const UNIX_EPOCH_JULIAN = 2_440_587.5;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;
const mod = (value: number, by: number) => ((value % by) + by) % by;

/**
 * The light window of one day at a place. `lat` and `lon` are degrees (east positive). A polar day or
 * night, where the sun never crosses the horizon, answers the fixed fallback hours.
 */
export function sunTimes(lat: number, lon: number, date: DateKey, timezone: string): DayLight {
	const [year, month, day] = date.split('-').map(Number);
	// Whole days since J2000 for the day's UTC noon
	const n = Math.round((Date.UTC(year, month - 1, day, 12) - J2000_MS) / DAY_MS);

	// Mean solar time at the place, then the sun's position at that moment
	const meanSolar = n - lon / 360;
	const anomaly = mod(357.5291 + 0.98560028 * meanSolar, 360);
	const center =
		1.9148 * Math.sin(rad(anomaly)) +
		0.02 * Math.sin(rad(2 * anomaly)) +
		0.0003 * Math.sin(rad(3 * anomaly));
	const eclipticLongitude = mod(anomaly + center + 180 + 102.9372, 360);
	const transit =
		2_451_545 +
		meanSolar +
		0.0053 * Math.sin(rad(anomaly)) -
		0.0069 * Math.sin(rad(2 * eclipticLongitude));
	const sinDeclination = Math.sin(rad(eclipticLongitude)) * Math.sin(rad(23.4397));
	const cosDeclination = Math.cos(Math.asin(sinDeclination));

	// -0.833 degrees: the sun's disc touches the horizon, with refraction
	const cosHourAngle =
		(Math.sin(rad(-0.833)) - Math.sin(rad(lat)) * sinDeclination) /
		(Math.cos(rad(lat)) * cosDeclination);
	if (cosHourAngle > 1) return { ...FALLBACK_DAY, polar: 'night' };
	if (cosHourAngle < -1) return { ...FALLBACK_DAY, polar: 'day' };

	const hourAngle = deg(Math.acos(cosHourAngle));
	const minutesIn = (julian: number) =>
		localMoment(Math.round((julian - UNIX_EPOCH_JULIAN) * DAY_MS), timezone).minutes;
	return {
		start: minutesIn(transit - hourAngle / 360),
		end: minutesIn(transit + hourAngle / 360),
		polar: null
	};
}
