<script lang="ts">
	import { enhance } from '$app/forms';
	import { tasker } from '#lib/app.svelte.js';
	import NowHero from '#lib/components/NowHero.svelte';
	import UpcomingRail from '#lib/components/UpcomingRail.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { keepAwake } from '#lib/display.js';
	import {
		createTask,
		deleteTask,
		loadDay,
		playSound,
		playTone,
		showToast,
		updateTask
	} from '#lib';
	import { playsSound } from '#lib/alarms.js';
	import { reportStuck } from '#lib/agent.js';
	import { OVERRUN_LIMITS, hyperfocusDue, momentKey, reminderDue } from '#lib/anchoring.js';
	import { heroState, wrapUpStarted } from '#lib/now.js';
	import { extendTask, moveLater } from '#lib/plan.js';
	import { rank, switchReason } from '#lib/priority.js';
	import { formatClock } from '#lib/format.js';
	import { minutesNow, todayIn } from '#lib/time.js';
	import { untrack } from 'svelte';
	import { TaskStatus, type Task } from '#lib/types.js';

	const { data } = $props();

	let now = $state(minutesNow(tasker.timezone));
	let today = $state(todayIn(tasker.timezone));
	// Only today's tasks compete for the screen, other days live on the Plan screen
	const ranking = $derived(
		rank(
			tasker.tasks.filter((task) => task.date === today),
			now
		)
	);
	const hasCurrent = $derived(ranking.current !== null);
	const hero = $derived(
		heroState(ranking, now, { overrunMinutes: data.user?.overrunMinutes ?? OVERRUN_LIMITS.default })
	);

	$effect(() => {
		const tick = () => {
			now = minutesNow(tasker.timezone);
			today = todayIn(tasker.timezone);
		};
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	});

	// The layout preloads from yesterday on, so only a day change after a long uptime needs a fetch
	let checkedDay = untrack(() => today);
	$effect(() => {
		if (today === checkedDay) return;
		checkedDay = today;
		if (data.user) loadDay(today).catch(() => {});
	});

	$effect(keepAwake);

	// Soft chime every 5 minutes while there is something to do, to pull attention back
	$effect(() => {
		if (!hasCurrent) return;
		const timer = setInterval(() => playSound('reminder'), 300_000);
		return () => clearInterval(timer);
	});

	// Heads-up before the next task starts and a tap when the latest task runs over, while the time up screen shows it.
	// Each moment sounds once on the display device, and a late page load stays quiet because `hyperfocusDue` only
	// reports the minutes right after the threshold.
	// Bookkeeping only: a reactive set would make the effect below depend on what it just sounded
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const sounded = new Set<string>();
	$effect(() => {
		const user = data.user;
		if (!user) return;
		const quiet = !playsSound();

		let chimed = false;
		const upcoming = user.enableReminders
			? reminderDue(ranking.upcoming, now, user.reminderAdvanceTime)
			: null;
		if (upcoming) {
			const key = momentKey('reminder', today, upcoming);
			if (!sounded.has(key)) {
				sounded.add(key);
				chimed = true;
				showToast(`${upcoming.title} starts in ${upcoming.startTime - now} min`);
				if (!quiet) playSound('reminder');
			}
		}

		// One soft cue when the task enters its wrap-up, unless the heads-up chime sounded in the same minute
		const wrapping =
			hero.kind === 'wrapping-up' && wrapUpStarted(hero.task, now) ? hero.task : null;
		if (wrapping) {
			const key = momentKey('wrap-up', today, wrapping);
			if (!sounded.has(key)) {
				sounded.add(key);
				if (!quiet && !chimed) playSound('wrap-up');
			}
		}

		const over = user.hyperfocusAlarm
			? hyperfocusDue(ranking.missed, now, user.overrunMinutes)
			: null;
		if (over) {
			const key = momentKey('overrun', today, over);
			if (!sounded.has(key)) {
				sounded.add(key);
				if (!quiet) playTone('nudge');
			}
		}
	});

	// Explain every switch, and chime for switches that happen while the page is open
	let reason = $state<string | null>(null);
	let previous: Task | null = null;
	let initialized = false;
	$effect(() => {
		const current = ranking.current;
		const why = switchReason(previous, ranking, tasker.tasks, now);
		if (why !== null) {
			reason = why;
			if (current && initialized) playSound('task-started');
		}
		previous = current;
		initialized = true;
	});

	function setStatus(task: Task, status: TaskStatus) {
		return updateTask({ ...task, status });
	}

	function complete(task: Task) {
		const before = task.status;
		void setStatus(task, TaskStatus.Completed);
		showToast(`Done: ${task.title}`, () => setStatus(task, before));
	}

	/** Gives a task 15 more minutes: from now when it already ran out, on top of its end while it runs. */
	function extend(task: Task) {
		const before = task.duration;
		void updateTask({ ...task, duration: extendTask(task, now, 15) });
		showToast(`${task.title}: 15 more minutes`, () => updateTask({ ...task, duration: before }));
	}

	/** Moves a task that ran out to the next free slot today, or to tomorrow when nothing fits. */
	function later(task: Task) {
		const others = tasker.tasks.filter((other) => other.date === today && other.id !== task.id);
		const to = moveLater(task, others, today, now);
		const before = { date: task.date, startTime: task.startTime };
		void updateTask({ ...task, date: to.date, startTime: to.startTime });
		showToast(
			to.tomorrow
				? `Nothing fits today. ${task.title} moved to tomorrow at ${formatClock(to.startTime)}`
				: `${task.title} moved to ${formatClock(to.startTime)}`,
			() => updateTask({ ...task, ...before })
		);
	}

	function drop(task: Task) {
		const { id: _id, ...rest } = task;
		void deleteTask(task);
		showToast(`Dropped: ${task.title}`, () => createTask(rest));
	}
</script>

{#if !data.user}
	<div class="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
		<h1 class="text-display font-bold">ADHD Tasker</h1>
		<p class="text-muted-foreground max-w-md text-xl">
			One task at a time, always on screen. Sign in to see your plan.
		</p>
		<form method="POST" action="?/login" use:enhance>
			<Button type="submit" size="lg" class="h-14 px-8 text-lg">Sign in with Google</Button>
		</form>
	</div>
{:else}
	<div
		class="grid min-h-svh md:min-h-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"
	>
		<NowHero
			{hero}
			{now}
			{reason}
			onDone={complete}
			onExtend={extend}
			onLater={later}
			onStuck={(task, why) => reportStuck(task.id, why.id)}
		/>
		<UpcomingRail
			upcoming={ranking.upcoming}
			missed={ranking.missed}
			{now}
			onDone={complete}
			onExtend={extend}
			onDrop={drop}
		/>
	</div>
{/if}
