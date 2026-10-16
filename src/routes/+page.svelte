<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import NowHero from '#lib/components/NowHero.svelte';
	import UpcomingRail from '#lib/components/UpcomingRail.svelte';
	import Welcome from '#lib/components/Welcome.svelte';
	import { showWelcome } from '#lib/firstrun.js';
	import { addEssentials, trySampleDay } from '#lib/welcome.js';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		createTask,
		deleteTask,
		errorText,
		loadDay,
		playSound,
		playTone,
		showToast,
		updateTask
	} from '#lib';
	import { dropTask } from '#lib/prepare.js';
	import { playsSound, ring, startTimer } from '#lib/alarms.js';
	import { leaveLine } from '#lib/prep.js';
	import { reportStuck } from '#lib/agent.js';
	import {
		awayCallMoment,
		hyperfocusDue,
		momentKey,
		reminderDue,
		startCallMoment,
		type StuckAction,
		type StuckReason
	} from '#lib/anchoring.js';
	import type { CheckData } from '#lib/checks.js';
	import type { Todo } from '#lib/core/repo.js';
	import { currentKey, flow, heroFromFlow, switchLine } from '#lib/flow.js';
	import {
		DONE_CONFIRM_MS,
		REASON_MS,
		heroFocus,
		heroDark,
		tabTitle,
		wrapUpStarted
	} from '#lib/now.js';
	import { isCandidate } from '#lib/pick.js';
	import { extendTask, moveLater, todoFromTask } from '#lib/plan.js';
	import { placeDay, stored } from '#lib/placeday.js';
	import { rank, switchReason } from '#lib/priority.js';
	import { doneToday, todosDoneBetween } from '#lib/rail.js';
	import MissedTriage from '#lib/components/MissedTriage.svelte';
	import { formatClock } from '#lib/format.js';
	import { addDays, deviceTimezone, minutesNow, todayIn, zonedToEpoch } from '#lib/time.js';
	import TodoSheet from '#lib/components/TodoSheet.svelte';
	import {
		addQuickLine,
		addTodo,
		answerCheck,
		answerFace,
		changeTodo,
		chooseTodo,
		dropTodo,
		endBreak,
		finishTodo,
		recordAnswer,
		removeTodo,
		struggleOn,
		takeBreak,
		undoStep,
		type StruggleOptions
	} from '#lib/todos.js';
	import { breakActivity } from '#lib/breaks.js';
	import { daylight, isLight } from '#lib/location.js';
	import { OFFER_BREAK_MINUTES, type FaceAnswer } from '#lib/struggle.js';
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { Priority, TaskStatus, type Task, type TaskForm as TaskFormType } from '#lib/types.js';

	const { data } = $props();

	// The server render has no shared client state (it is module level and must not leak between requests),
	// so it reads the load data directly. Otherwise the first paint would be the empty state, then flip.
	const tasks = $derived(browser ? tasker.tasks : data.tasks);
	const todos = $derived(browser ? tasker.todos : data.todos);
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
		taskCount: tasks.length + todos.length,
		welcomed: tasker.firstRun.welcomed
	});
	const welcome = $derived(browser && showWelcome(firstRun));
	// "Plan my first task" lands in the empty state, with the cursor in its line
	let focusAdd = $state(false);

	let now = $state(minutesNow(untrack(() => timezone)));
	let today = $state(todayIn(untrack(() => timezone)));
	let nowMs = $state(Date.now());
	// Only today's tasks compete for the screen, other days live on the Plan screen
	// Tasks that may move have made room for appointments and travel (`placeDay`), the stored times never change
	const todays = $derived(placeDay(tasks.filter((task) => task.date === today)));
	// The days after today, for the free time a to-do has until it is due
	const ahead = $derived(tasks.filter((task) => task.date > today));
	const ranking = $derived(rank(todays, now));
	// What is current, replayed from today's answers and finished items (the server runs the same function)
	const zone = $derived(timezone ?? deviceTimezone());
	const flowRows = $derived(
		(browser ? tasker.flow : data.flow).date === today
			? (browser ? tasker.flow : data.flow).rows
			: []
	);
	const flowState = $derived(
		flow({
			date: today,
			now,
			nowMs,
			at: (minutes) => zonedToEpoch(today, minutes, zone),
			tasks: todays,
			later: ahead,
			todos,
			log: flowRows,
			settings
		})
	);
	const hero = $derived(heroFromFlow(flowState, now, nowMs));
	const hasCurrent = $derived(
		hero.kind === 'active' ||
			hero.kind === 'wrapping-up' ||
			hero.kind === 'todo' ||
			(hero.kind === 'time-up' && hero.current !== null)
	);
	// Past the time to start and nobody did: the morning calls until Start
	const calling = $derived(
		hero.kind === 'away' && hero.since === null && now >= settings.startWorkAt
	);
	const openTodos = $derived(todos.filter((todo) => isCandidate(todo, today)).length);
	const doneCount = $derived(
		doneToday(tasks, today) +
			todosDoneBetween(todos, zonedToEpoch(today, 0, zone), zonedToEpoch(today, 1440, zone))
	);
	// The next task when it starts within the heads-up minutes, shown in the hero (the chime sounds below)
	const headsUp = $derived(
		settings.enableReminders
			? reminderDue(ranking.upcoming, now, settings.reminderAdvanceTime)
			: null
	);

	$effect(() => {
		const tick = () => {
			now = minutesNow(timezone);
			today = todayIn(timezone);
			nowMs = Date.now();
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

		// A question is asked with the soft chime and asked again with the nudge
		const asked = flowState.check;
		if (asked) {
			const key = `check:${asked.dueAt}:${asked.level}`;
			if (!sounded.has(key)) {
				sounded.add(key);
				if (!quiet) {
					if (asked.level === 1) playTone('nudge');
					// The end of a break says it is over softly, a question about work is the usual chime
					else playSound(asked.about === 'break' || asked.about === 'day' ? 'wrap-up' : 'reminder');
				}
			}
		}

		// The calls whose job is to bring the user back: the morning one, and the one from away every half hour
		const call =
			hero.kind === 'away' && hero.since === null
				? startCallMoment(now - settings.startWorkAt)
				: hero.kind === 'away' && hero.since !== null
					? awayCallMoment(now - hero.since)
					: null;
		if (call) {
			const key = `call:${today}:${hero.kind === 'away' && hero.since === null ? 'start' : 'away'}:${call.index}`;
			if (!sounded.has(key)) {
				sounded.add(key);
				if (!quiet) {
					if (call.tone === 'nudge') playTone('nudge');
					else playSound('reminder');
				}
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
		if (startPending && hasCurrent) playSound('task-started');
		startPending = false;
	}

	// A session needs its to-do pinned, so adding or editing a to-do halfway does not change what is current.
	// The first screen or tick that sees an unpinned session writes the pin, the key makes a second write a no-op.
	$effect(() => {
		const pin = flowState.pin;
		if (!ready || !pin) return;
		untrack(
			() =>
				void recordAnswer({
					type: 'pin',
					todoId: pin.todoId,
					key: pin.key,
					...(pin.face ? { data: { face: true } } : {})
				})
		);
	});

	// Explain every switch that happens while the page is open, and chime for it. A switch the page loads with
	// ("Scheduled for now" on every load) is noise: the screen already shows what is current.
	let reason = $state<string | null>(null);
	let previous: Task | null = null;
	let previousKey: string | null = null;
	let initialized = false;
	$effect(() => {
		const current = ranking.current;
		const key = currentKey(flowState.current);
		if (initialized && key !== previousKey) {
			const betweenTasks = previousKey?.startsWith('task:') && key.startsWith('task:');
			// Two tasks at a time: `rank()` explains it. Anything else (a to-do, rest, plan) the engine does
			reason = betweenTasks
				? switchReason(previous, ranking, tasker.tasks, now)
				: hasCurrent || hero.kind === 'plan'
					? (flowState.reason ?? switchLine(flowState))
					: null;
			if (current?.kind === 'travel') {
				// Leaving on time is the moment that matters: it rings like an alarm until it is tapped, a minute at most
				ring({
					id: -current.id,
					fireAt: zonedToEpoch(today, current.startTime, zone),
					label: leaveLine(current, tasker.tasks) ?? current.title,
					tone: 'urgent',
					durationMin: 1
				});
			} else if (hasCurrent) {
				if (untrack(() => confirming) !== null) startPending = true;
				else playSound('task-started');
			}
		}
		previous = current;
		previousKey = key;
		initialized = true;
	});

	// The reason fades out after a minute, a new one starts the minute again
	$effect(() => {
		if (reason === null) return;
		const timer = setTimeout(() => (reason = null), REASON_MS);
		return () => clearTimeout(timer);
	});

	// The tasks on this screen are the placed day: what is saved is always the time the user gave (`stored`)
	function setStatus(task: Task, status: TaskStatus) {
		return updateTask({ ...stored(task), status });
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
	function extend(placed: Task) {
		const task = stored(placed);
		const before = task.duration;
		// The end is counted from the time it was placed at, the time it is saved at stays
		void updateTask({ ...task, duration: extendTask(placed, now, 15) });
		showToast(`${task.title}: 15 more minutes`, () => updateTask({ ...task, duration: before }));
	}

	/** Moves a task that ran out to the next free slot today, or to tomorrow when nothing fits. */
	function later(placed: Task) {
		const task = stored(placed);
		const others = todays.filter((other) => other.id !== task.id);
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
	function tomorrow(placed: Task) {
		const task = stored(placed);
		const before = task.date;
		void updateTask({ ...task, date: addDays(today, 1) });
		showToast(`${task.title} moved to tomorrow`, () => updateTask({ ...task, date: before }));
	}

	function drop(task: Task) {
		void dropTask(stored(task), 'Dropped');
	}

	/** The triage's "Do it when there is time": the task that ran out becomes a to-do of its length. */
	async function whenThereIsTime(placed: Task) {
		const task = stored(placed);
		const { id: _id, ...rest } = task;
		let made: Todo;
		try {
			made = await addTodo(todoFromTask(task));
		} catch (error) {
			showToast(errorText(error, 'Could not make a to-do of it'));
			return;
		}
		void deleteTask(task);
		showToast(`${task.title} is a to-do now`, async () => {
			await createTask(rest);
			await removeTodo(made);
		});
	}

	function completeTodo(todo: Todo) {
		finishTodo(todo, endConfirmation);
		if (playsSound()) playSound('done');
		clearTimeout(confirmTimer);
		confirming = todo.title;
		confirmTimer = setTimeout(endConfirmation, DONE_CONFIRM_MS);
	}

	// The to-do sheet opens over Now from the hero's menu
	let editingTodo = $state<Todo | null>(null);

	/** "Start" in the morning: from here the day runs in sessions. */
	function start() {
		void recordAnswer({ type: 'start' });
	}

	/** "I'm back" after away, "I'm here" when asked in the plan state: the same row as Start. */
	const back = start;

	/** What a struggle needs to know: when the session began, how long a break is and what it would say. */
	function struggleOptions(minutes = settings.breakMinutes): StruggleOptions {
		const session = flowState.current.kind === 'todo' ? flowState.current.session.start : nowMs;
		return { sessionStart: session, breakMinutes: minutes, activity: nextActivity(minutes) };
	}

	/** The activity of the next break: never the one before, no food before a meal, no walk in the dark. */
	function nextActivity(minutes: number): string {
		const upcoming = ranking.upcoming[0];
		const light = daylight(tasker.settings, timezone, today);
		return breakActivity({
			minutes,
			recent: flowRows
				.filter((row) => row.type === 'break' && typeof row.data.activity === 'string')
				.map((row) => row.data.activity as string),
			next: upcoming ? { title: upcoming.title, inMinutes: upcoming.startTime - now } : null,
			daylight: isLight(light, now),
			seed: nowMs / 60_000
		}).id;
	}

	/** "How far is it?" answered: the to-do changes at once and the next session starts. */
	function check(todo: Todo, data: CheckData) {
		void answerCheck(todo, data, struggleOptions());
	}

	/** The 5 minute break chip: the session counts like Keep going, then the break starts. */
	async function checkBreak(todo: Todo, data: CheckData) {
		await answerCheck(todo, data);
		void takeBreak(OFFER_BREAK_MINUTES, nextActivity(OFFER_BREAK_MINUTES), 'offer');
	}

	/** "Take a break" in the menu. */
	function breakNow() {
		void takeBreak(settings.breakMinutes, nextActivity(settings.breakMinutes));
	}

	/** "5 more min" after a break: the same activity for five more minutes. */
	function breakMore() {
		const current = flowState.current;
		void takeBreak(5, current.kind === 'break' ? current.activity : nextActivity(5));
	}

	/** "Keep working instead" and "Stay on it": the last step is taken back. */
	function takeBack(rowId: number) {
		const row = flowRows.find((entry) => entry.id === rowId);
		if (row) void undoStep(row, row.todoId);
	}

	/** "Something else", and the stuck reasons the ladder cares about, on a to-do. */
	function pushAway(todo: Todo, reason: 'else' | 'low-energy' | 'cant-start') {
		void struggleOn(todo, reason, struggleOptions());
	}

	function todoStuck(todo: Todo, why: StuckReason) {
		// Too big: the assistant may answer with one small next step, the fixed hint is already on screen
		if (why.id === 'too-big') void reportStuck({ todoId: todo.id }, why.id);
		else if (why.id === 'break') breakNow();
		else if (why.id === 'low-energy' || why.id === 'cant-start') pushAway(todo, why.id);
	}

	/** The question after a Face it session: what the user says is what happens to the to-do. */
	async function face(todo: Todo, answer: FaceAnswer, detail: { step?: string; days?: number }) {
		await answerFace(todo, answer);
		if (answer === 'smaller' && detail.step)
			await changeTodo({ id: todo.id, nextStep: detail.step });
		else if (answer === 'move' && detail.days)
			await changeTodo({ id: todo.id, dueDate: addDays(today, detail.days) });
		else if (answer === 'drop') dropTodo(todo);
	}

	/** "Call it a day": the hero rests until the user comes back. */
	function rest() {
		void recordAnswer({ type: 'rest' });
		showToast('Day is done', resume);
	}

	/** Takes back the last "Call it a day". */
	function resume() {
		const row = flowRows.findLast((entry) => entry.type === 'rest' && entry.id > 0);
		return row ? recordAnswer({ type: 'undo', data: { ref: row.id } }) : Promise.resolve(null);
	}

	/** What is typed in the plan state becomes current at once: the first thing of the day, or the next. */
	async function addFromHero(text: string) {
		const made = await addQuickLine(text, today, now, today);
		if (made?.kind === 'todo') await chooseTodo(made.todo);
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
		priority: Priority.Medium,
		kind: 'block',
		shift: 0
	});

	function edit(placed: Task) {
		// The sheet shows and saves the time the user gave, not the one the day placed it at
		const task = stored(placed);
		form.selectedTask = task;
		form.title = task.title;
		form.description = task.description;
		form.date = task.date;
		form.duration = task.duration;
		form.startTime = task.startTime;
		form.priority = task.priority;
		form.kind = task.kind;
		form.shift = task.shift;
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
		onPlan={(times) => {
			void addEssentials(times, today, now);
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
			onStuck={(task, why) => reportStuck({ taskId: task.id }, why.id)}
			todoCount={openTodos}
			firstUp={ranking.upcoming[0] ?? null}
			onQuickAdd={(text) => void addFromHero(text)}
			focusQuickAdd={focusAdd}
			onAsk={tasker.settings.hasOpenaiKey ? () => (tasker.assistant.open = true) : undefined}
			onStart={start}
			onResume={() => void resume()}
			onRest={rest}
			onTodoDone={completeTodo}
			onTodoEdit={(todo) => (editingTodo = todo)}
			onTodoDrop={dropTodo}
			onCheck={check}
			onBack={back}
			onSomethingElse={(todo) => pushAway(todo, 'else')}
			onTodoStuck={todoStuck}
			onBreak={breakNow}
			onCheckBreak={checkBreak}
			onBreakBack={() => void endBreak()}
			onBreakMore={breakMore}
			onBreakStop={takeBack}
			onStay={takeBack}
			onFace={face}
			{nowMs}
			{calling}
			noteCount={tasker.agent.cards.length}
			dark={heroDark(hero)}
		/>
		<UpcomingRail
			upcoming={ranking.upcoming}
			missedCount={ranking.missed.length}
			{now}
			{today}
			{timezone}
			done={doneCount}
			headsUp={headsUp !== null}
			onEdit={edit}
			onTriage={() => (triage = true)}
		/>
	</div>
	<MissedTriage
		bind:open={triage}
		missed={ranking.missed}
		onDone={complete}
		onLater={later}
		onTomorrow={tomorrow}
		onWhenTime={whenThereIsTime}
		onDrop={drop}
	/>
	<TaskForm bind:form onDelete={drop} />
	<TodoSheet bind:todo={editingTodo} />
{/if}
