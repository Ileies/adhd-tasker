import { quickAlarmFields, quickAlarmPreview, parseQuickAlarm } from '#lib/quickalarm.js';
import { parseQuickTask, quickPreview } from '#lib/quickadd.js';

export type QuickMode = 'task' | 'alarm';

/** One thing the line understands, with a line that shows it. */
export interface QuickRule {
	name: string;
	how: string;
	example: string;
}

export const QUICK_RULES: Record<QuickMode, QuickRule[]> = {
	task: [
		{
			name: 'Start time',
			how: 'Write a clock time: 14:30, 2pm, 2:30pm or at 14.',
			example: 'Call dentist 14:30'
		},
		{
			name: 'Length',
			how: 'Write 45m, 2h, 1h30m or 1.5h. Without one the task lasts 30 min.',
			example: 'Write intro 2h'
		},
		{
			name: 'Both',
			how: 'Order does not matter, the rest of the line is the title.',
			example: 'Lunch 45m at 12'
		},
		{
			name: 'No time',
			how: 'The task starts at the next free quarter hour when you plan today.',
			example: 'Water the plants'
		}
	],
	alarm: [
		{
			name: 'Clock time',
			how: 'Write a time: 7:00, 8am or at 14. It rings at the next one.',
			example: 'Wake up 7:00'
		},
		{
			name: 'Timer',
			how: 'Write in 5 min, in 1h30m or in 1.5h. A timer rings once.',
			example: 'Tea in 5 min'
		},
		{ name: 'Every day', how: 'Add daily or every day.', example: 'Meds 8:00 daily' },
		{
			name: 'Workdays',
			how: 'Add weekdays, every weekday or Mon-Fri.',
			example: 'Standup 9:30 weekdays'
		},
		{
			name: 'Chosen days',
			how: 'Name the days: Sat, Wed-Fri, Tue/Thu/Sun, Mon and Fri.',
			example: 'Gym 7am Wed-Fri'
		}
	]
};

/** What the line makes, in words: the title and when. Null when it makes nothing yet. */
export function quickOutcome(
	mode: QuickMode,
	text: string
): { title: string; when: string } | null {
	if (mode === 'alarm') {
		const fields = quickAlarmFields(text);
		const when = quickAlarmPreview(text);
		return fields && when ? { title: parseQuickAlarm(text).label, when } : null;
	}
	const title = parseQuickTask(text).title;
	if (!title) return null;
	return {
		title,
		when: quickPreview(text, '2026-01-05', null) ?? 'Next free quarter hour, 30m'
	};
}
