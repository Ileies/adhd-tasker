<script lang="ts">
	import NowHero from '#lib/components/NowHero.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { welcomeExample } from '#lib/firstrun.js';

	let { onPlan, onSample }: { onPlan: () => void; onSample: () => void } = $props();

	const example = welcomeExample();
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

		<p class="text-muted-foreground text-base">
			You can change or undo everything. Delete a task and an Undo appears.
		</p>

		<div class="flex flex-wrap gap-3">
			<Button size="lg" class="h-14 px-8 text-lg" onclick={onPlan}>Start planning</Button>
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
				Try a sample week
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
