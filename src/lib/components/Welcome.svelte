<script lang="ts">
	import NowHero from '#lib/components/NowHero.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import TimeInput from '#lib/components/TimeInput.svelte';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import {
		ESSENTIALS,
		essentialTimes,
		type EssentialKey,
		type EssentialTimes
	} from '#lib/essentials.js';
	import { welcomeExample } from '#lib/firstrun.js';
	import { formatClock24 } from '#lib/format.js';

	let { onPlan, onSample }: { onPlan: (times: EssentialTimes) => void; onSample: () => void } =
		$props();

	const example = welcomeExample();

	// Every essential starts on at its usual time, the form is the whole choice
	let on = $state(
		Object.fromEntries(ESSENTIALS.map(({ key }) => [key, true])) as Record<EssentialKey, boolean>
	);
	let clocks = $state(
		Object.fromEntries(ESSENTIALS.map(({ key, time }) => [key, formatClock24(time)])) as Record<
			EssentialKey,
			string
		>
	);
	const nothing = () => {};

	// "Plan my first task" first explains where things are. Nothing is answered until "Start planning",
	// so Back (or a reload) lands on the first page again
	let tour = $state(false);

	const STEPS = [
		{
			name: 'Now',
			text: 'This page. It shows the one task that is on right now and how much time is left. Tap Done when you finish.'
		},
		{
			name: 'Plan',
			text: 'The calendar icon in the top bar. Drag on empty space to draw a task, drag a block to move it, pull its handle to resize it.'
		},
		{
			name: 'Quick add',
			text: 'Type a line such as "Write intro 14:00 1h" and press Enter. Time and length are read from the text.'
		}
	];
</script>

<div
	class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-5 px-6 pt-20 pb-10 md:gap-8 md:py-24"
>
	{#if tour}
		<h1 class="text-3xl leading-tight font-bold md:text-4xl">Three things to know.</h1>

		<ol class="space-y-5">
			{#each STEPS as step, index (step.name)}
				<li class="flex gap-4">
					<span class="text-muted-foreground w-6 shrink-0 text-xl">{index + 1}</span>
					<p class="text-xl leading-relaxed">
						<span class="font-semibold">{step.name}.</span>
						{step.text}
					</p>
				</li>
			{/each}
		</ol>

		<section class="space-y-3" aria-labelledby="essentials-title">
			<h2 id="essentials-title" class="text-xl font-semibold">What happens every day?</h2>
			<p class="text-muted-foreground text-base">
				Pick a time for each, or turn it off. They repeat daily and a meal moves a little for an
				appointment. Change them any time with the Repeat icon on Plan.
			</p>
			<ul class="space-y-2">
				{#each ESSENTIALS as essential (essential.key)}
					<li class="flex items-center gap-3">
						<Switch bind:checked={on[essential.key]} aria-label="{essential.label} every day" />
						<span class="w-24 text-lg">{essential.label}</span>
						<TimeInput label={essential.label} bind:value={clocks[essential.key]} />
					</li>
				{/each}
			</ul>
		</section>

		<p class="text-muted-foreground text-base">
			You can change or undo everything. Delete a task and an Undo appears.
		</p>

		<div class="flex flex-wrap gap-3">
			<Button
				size="lg"
				class="h-14 px-8 text-lg"
				onclick={() => onPlan(essentialTimes(on, clocks))}
			>
				Start planning
			</Button>
			<Button size="lg" variant="outline" class="h-14 px-8 text-lg" onclick={() => (tour = false)}>
				Back
			</Button>
		</div>
	{:else}
		<h1 class="text-3xl leading-tight font-bold md:text-4xl">
			This screen shows the one thing to do right now.
		</h1>

		<!-- The real hero on a made up task: it cannot be pressed, it only shows what to expect -->
		<div inert class="pointer-events-none select-none" aria-hidden="true">
			<NowHero
				compact
				hero={example.hero}
				now={example.now}
				reason={null}
				headsUp={null}
				onDone={nothing}
				onStuck={nothing}
				onExtend={nothing}
				onLater={nothing}
				onTomorrow={nothing}
				onEdit={nothing}
				onDrop={nothing}
				onTimer={nothing}
				concurrent={1}
			/>
		</div>

		<p class="text-xl leading-relaxed">
			Plan your day in blocks. Keep this open on a second screen or your phone. It calls you back
			when it is time.
		</p>

		<div class="flex flex-wrap gap-3">
			<Button size="lg" class="h-14 px-8 text-lg" onclick={() => (tour = true)}>
				Plan my first task
			</Button>
			<Button size="lg" variant="outline" class="h-14 px-8 text-lg" onclick={onSample}>
				Try a sample day
			</Button>
		</div>

		<div class="text-muted-foreground space-y-2 text-base">
			<p>Works without an account. Your plan stays on this device.</p>
			<div class="flex flex-wrap items-center gap-x-2">
				<a href="/about" class="hover:text-foreground underline underline-offset-4">How it works</a>
				<span aria-hidden="true">-</span>
				<span>Use it on another device?</span>
				<form method="POST" action="/login" class="inline">
					<button
						type="submit"
						class="hover:text-foreground cursor-pointer underline underline-offset-4"
					>
						Sign in
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
