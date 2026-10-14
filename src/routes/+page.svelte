<script lang="ts">
	import { enhance } from '$app/forms';
	import { tasker } from '#lib/app.svelte.js';
	import NowHero from '#lib/components/NowHero.svelte';
	import UpcomingRail from '#lib/components/UpcomingRail.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { keepAwake } from '#lib/display.js';
	import { createTask, deleteTask, playSound, showToast, updateTask } from '#lib';
	import { rank, switchReason } from '#lib/priority.js';
	import { minutesNow } from '#lib/time.js';
	import { TaskStatus, type Task } from '#lib/types.js';

	const { data } = $props();

	let now = $state(minutesNow(tasker.timezone));
	const ranking = $derived(rank(tasker.tasks, now));
	const hasCurrent = $derived(ranking.current !== null);

	$effect(() => {
		const timer = setInterval(() => (now = minutesNow(tasker.timezone)), 1000);
		return () => clearInterval(timer);
	});

	$effect(keepAwake);

	// Soft chime every 5 minutes while there is something to do, to pull attention back
	$effect(() => {
		if (!hasCurrent) return;
		const timer = setInterval(() => playSound('reminder'), 300_000);
		return () => clearInterval(timer);
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
		setStatus(task, TaskStatus.Completed);
		showToast(`Done: ${task.title}`, () => setStatus(task, before));
	}

	/** Gives a missed task 15 more minutes from now. */
	function extend(task: Task) {
		const before = task.duration;
		updateTask({ ...task, duration: now - task.startTime + 15 });
		showToast(`${task.title}: 15 more minutes`, () => updateTask({ ...task, duration: before }));
	}

	function drop(task: Task) {
		const { id: _id, ...rest } = task;
		deleteTask(task);
		showToast(`Dropped: ${task.title}`, () => createTask(rest));
	}
</script>

{#if !data.user}
	<div class="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
		<h1 class="text-display font-bold">ADHD Tasker</h1>
		<p class="max-w-md text-xl text-muted-foreground">One task at a time, always on screen. Sign in to see your plan.</p>
		<form method="POST" action="?/login" use:enhance>
			<Button type="submit" size="lg" class="h-14 px-8 text-lg">Sign in with Google</Button>
		</form>
	</div>
{:else}
	<div class="grid min-h-svh lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
		<NowHero task={ranking.current} next={ranking.upcoming[0] ?? null} {now} {reason} onDone={complete} />
		<UpcomingRail upcoming={ranking.upcoming} missed={ranking.missed} {now} onDone={complete} onExtend={extend} onDrop={drop} />
	</div>
{/if}
