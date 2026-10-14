<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import NowHero from '#lib/components/NowHero.svelte';
	import UpcomingRail from '#lib/components/UpcomingRail.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
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
	import { addAlarm, playsSound } from '#lib/alarms.js';
	import { reportStuck } from '#lib/agent.js';
	import {
		OVERRUN_LIMITS,
		hyperfocusDue,
		momentKey,
		reminderDue,
		type StuckAction
	} from '#lib/anchoring.js';
	import { heroState, wrapUpStarted } from '#lib/now.js';
	import { extendTask, moveLater } from '#lib/plan.js';
	import { rank, switchReason } from '#lib/priority.js';
	import { formatClock } from '#lib/format.js';
	import { addDays, minutesNow, todayIn } from '#lib/time.js';
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';

	const { data } = $props();

	// The server render has no shared client state (it is module level and must not leak between requests),
	// so it reads the load data directly. Otherwise the first paint would be the empty state, then flip.
	const tasks = $derived(browser ? tasker.tasks : data.tasks);
	const timezone = $derived(tasker.timezone ?? data.user?.timezone ?? null);

	let now = $state(minutesNow(untrack(() => timezone)));
	let today = $state(todayIn(untrack(() => timezone)));
	// Only today's tasks compete for the screen, other days live on the Plan screen
	const ranking = $derived(
		rank(
			tasks.filter((task) => task.date === today),
			now
		)
	);
	const hasCurrent = $derived(ranking.current !== null);
	// The next task when it starts within the heads-up minutes, shown in the hero (the chime sounds below)
	const headsUp = $derived(
		data.user?.enableReminders
			? reminderDue(ranking.upcoming, now, data.user.reminderAdvanceTime)
			: null
	);
	const hero = $derived(
		heroState(ranking, now, { overrunMinutes: data.user?.overrunMinutes ?? OVERRUN_LIMITS.default })
	);

	$effect(() => {
		const tick = () => {
			now = minutesNow(timezone);
			today = todayIn(timezone);
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
	let opened = false;
	$effect(() => {
		const user = data.user;
		if (!user) return;
		// The first run is the page opening: the user is looking at it, so moments already due stay silent
		const quiet = !playsSound() || !opened;
		opened = true;

		let chimed = false;
		const upcoming = headsUp;
		if (upcoming) {
			const key = momentKey('reminder', today, upcoming);
			if (!sounded.has(key)) {
				sounded.add(key);
				chimed = true;
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

	/** Keeps the start time and moves the task to the next day. */
	function tomorrow(task: Task) {
		const before = task.date;
		void updateTask({ ...task, date: addDays(today, 1) });
		showToast(`${task.title} moved to tomorrow`, () => updateTask({ ...task, date: before }));
	}

	function drop(task: Task) {
		const { id: _id, ...rest } = task;
		void deleteTask(task);
		showToast(`Dropped: ${task.title}`, () => createTask(rest));
	}

	// The edit dialog opens over Now, UX phase 7 replaces it with the task sheet
	let form: TaskFormType = $state({
		selectedTask: undefined,
		isEditing: true,
		showTaskForm: false,
		title: '',
		description: '',
		date: '',
		duration: 60,
		startTime: 0,
		priority: Priority.Medium
	});

	function edit(task: Task) {
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.date = task.date;
		form.duration = task.duration;
		form.startTime = task.startTime;
		form.priority = task.priority;
		form.isEditing = true;
		form.showTaskForm = true;
	}

	/** A short alarm from the "I'm stuck" hint, the app holds the timer. */
	async function startTimer(action: StuckAction) {
		const failure = await addAlarm({
			in_minutes: action.minutes,
			label: action.alarm,
			tone: 'soft',
			repeat: 'none'
		});
		showToast(failure ?? `Timer set: ${action.minutes} min`);
	}
</script>

<svelte:head>
	<title>Now - ADHD Tasker</title>
</svelte:head>

{#if !data.user}
	<div class="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
		<h1 class="text-display font-bold">ADHD Tasker</h1>
		<p class="text-muted-foreground max-w-md text-xl">
			One task at a time, always on screen. Sign in to see your plan.
		</p>
		<form method="POST" action="/login">
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
			{headsUp}
			onDone={complete}
			onExtend={extend}
			onLater={later}
			onTomorrow={tomorrow}
			onEdit={edit}
			onDrop={drop}
			onTimer={startTimer}
			concurrent={ranking.concurrent}
			showClock={data.user.showClock}
			{timezone}
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
	<TaskForm email={data.user.email} bind:form onDelete={drop} />
{/if}
