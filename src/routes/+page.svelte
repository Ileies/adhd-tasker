<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import NowHero from '#lib/components/NowHero.svelte';
	import UpcomingRail from '#lib/components/UpcomingRail.svelte';
	import Welcome from '#lib/components/Welcome.svelte';
	import { showWelcome } from '#lib/firstrun.js';
	import { answerWelcome, clearSampleDay, trySampleDay } from '#lib/welcome.js';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		addQuickTask,
		createTask,
		deleteTask,
		loadDay,
		playSound,
		playTone,
		showToast,
		updateTask
	} from '#lib';
	import { playsSound, startTimer } from '#lib/alarms.js';
	import { reportStuck } from '#lib/agent.js';
	import { hyperfocusDue, momentKey, reminderDue, type StuckAction } from '#lib/anchoring.js';
	import {
		DONE_CONFIRM_MS,
		REASON_MS,
		heroFocus,
		heroDark,
		heroState,
		isNight,
		tabTitle,
		wrapUpStarted
	} from '#lib/now.js';
	import { extendTask, moveLater } from '#lib/plan.js';
	import { rank, switchReason } from '#lib/priority.js';
	import { doneToday } from '#lib/rail.js';
	import MissedTriage from '#lib/components/MissedTriage.svelte';
	import { formatClock } from '#lib/format.js';
	import { addDays, minutesNow, todayIn } from '#lib/time.js';
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';

	const { data } = $props();

	// The server render has no shared client state (it is module level and must not leak between requests),
	// so it reads the load data directly. Otherwise the first paint would be the empty state, then flip.
	const tasks = $derived(browser ? tasker.tasks : data.tasks);
	const settings = $derived(browser ? tasker.settings : (data.user ?? tasker.settings));
	// A signed in visitor's plan came with the page. A guest's is on the device and shows once it was read:
	// until then one calm frame, never the empty state, which would be a lie for a moment
	const ready = $derived(!!data.user || tasker.account.ready);
	const timezone = $derived(tasker.timezone ?? settings.timezone ?? null);

	// First run: a guest with an empty device is welcomed once
	const firstRun = $derived({
		guest: !data.user,
		ready,
		problem: !!tasker.account.problem,
		taskCount: tasks.length,
		welcomed: tasker.firstRun.welcomed
	});
	const welcome = $derived(browser && showWelcome(firstRun));
	// "Plan my first task" lands in the empty state, with the cursor in its line
	let focusAdd = $state(false);

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
		settings.enableReminders
			? reminderDue(ranking.upcoming, now, settings.reminderAdvanceTime)
			: null
	);
	const hero = $derived(heroState(ranking, now, { overrunMinutes: settings.overrunMinutes }));

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
		loadDay(today).catch(() => {});
	});

	// Soft chime every few minutes (the check-in setting, 0 is off) while there is something to do, to pull attention back
	$effect(() => {
		const minutes = settings.checkInMinutes;
		if (!hasCurrent || minutes <= 0) return;
		const timer = setInterval(() => playSound('reminder'), minutes * 60_000);
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
		// A guest's plan is still being read from the device: nothing is due yet, and what is due after it came in is old
		if (!ready) return;
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

		const over = settings.hyperfocusAlarm
			? hyperfocusDue(ranking.missed, now, settings.overrunMinutes)
			: null;
		if (over) {
			const key = momentKey('overrun', today, over);
			if (!sounded.has(key)) {
				sounded.add(key);
				if (!quiet) playTone('nudge');
			}
		}
	});

	// The hero confirms Done for a moment (the title struck through) before it moves on to the next state
	let confirming = $state<string | null>(null);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	// A task that started while the confirmation showed gets its chime when the confirmation ends, not on top of the done sound
	let startPending = false;

	function endConfirmation() {
		clearTimeout(confirmTimer);
		confirming = null;
		if (startPending && ranking.current) playSound('task-started');
		startPending = false;
	}

	// Explain every switch that happens while the page is open, and chime for it. A switch the page loads with
	// ("Scheduled for now" on every load) is noise: the screen already shows the task.
	let reason = $state<string | null>(null);
	let previous: Task | null = null;
	let initialized = false;
	$effect(() => {
		const current = ranking.current;
		const why = switchReason(previous, ranking, tasker.tasks, now);
		if (why !== null && initialized) {
			reason = why;
			if (current) {
				if (untrack(() => confirming) !== null) startPending = true;
				else playSound('task-started');
			}
		}
		previous = current;
		initialized = true;
	});

	// The reason fades out after a minute, a new one starts the minute again
	$effect(() => {
		if (reason === null) return;
		const timer = setTimeout(() => (reason = null), REASON_MS);
		return () => clearTimeout(timer);
	});

	function setStatus(task: Task, status: TaskStatus) {
		return updateTask({ ...task, status });
	}

	function complete(task: Task) {
		const before = task.status;
		// Read before the update: the optimistic edit moves the hero on at once
		const inHero = heroFocus(hero)?.id === task.id;
		void setStatus(task, TaskStatus.Completed);
		if (playsSound()) playSound('done');
		// Only the task the hero is about gets the confirmation, one finished from the rail needs none
		if (inHero) {
			clearTimeout(confirmTimer);
			confirming = task.title;
			confirmTimer = setTimeout(endConfirmation, DONE_CONFIRM_MS);
		}
		showToast(`Done: ${task.title}`, () => {
			// Undoing brings the task back at once, so the confirmation has nothing left to say
			endConfirmation();
			return setStatus(task, before);
		});
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

	// The triage sheet asks about missed tasks one at a time
	let triage = $state(false);

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
	async function startStuckTimer(action: StuckAction) {
		await startTimer({
			in_minutes: action.minutes,
			label: action.alarm,
			tone: 'soft',
			repeat: 'none'
		});
	}
</script>

<svelte:head>
	<title>{ready ? tabTitle(hero) : 'Now - ADHD Tasker'}</title>
</svelte:head>

{#if !ready}
	<div class="min-h-full" aria-hidden="true"></div>
{:else if tasker.account.problem}
	<div class="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
		<p class="max-w-md text-xl" role="alert">{tasker.account.problem}</p>
		<form method="POST" action="/login">
			<Button type="submit" size="lg" class="h-14 px-8 text-lg">Sign in with Google</Button>
		</form>
	</div>
{:else if welcome}
	<Welcome
		onPlan={() => {
			answerWelcome();
			focusAdd = true;
		}}
		onSample={() => void trySampleDay(today, now)}
	/>
{:else}
	<div
		class="grid min-h-svh md:min-h-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"
	>
		<NowHero
			{hero}
			{now}
			{reason}
			{headsUp}
			done={confirming}
			onDone={complete}
			onExtend={extend}
			onLater={later}
			onTomorrow={tomorrow}
			onEdit={edit}
			onDrop={drop}
			onTimer={startStuckTimer}
			concurrent={ranking.concurrent}
			onStuck={(task, why) => reportStuck(task.id, why.id)}
			planned={tasks.filter((task) => task.date === today).length}
			onQuickAdd={(text) => void addQuickTask(text, today, now)}
			focusQuickAdd={focusAdd}
			noteCount={tasker.agent.cards.length}
			dark={heroDark(hero, isNight(now, settings.myDayStart, settings.myDayEnd))}
		/>
		<UpcomingRail
			upcoming={ranking.upcoming}
			missedCount={ranking.missed.length}
			{now}
			{today}
			{timezone}
			done={doneToday(tasks, today)}
			headsUp={headsUp !== null}
			onEdit={edit}
			onTriage={() => (triage = true)}
			sample={tasker.sample.length > 0}
			onClearSample={() => void clearSampleDay()}
		/>
	</div>
	<MissedTriage
		bind:open={triage}
		missed={ranking.missed}
		onDone={complete}
		onLater={later}
		onTomorrow={tomorrow}
		onDrop={drop}
	/>
	<TaskForm bind:form onDelete={drop} />
{/if}
