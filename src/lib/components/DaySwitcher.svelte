<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { addDays, formatDay, isDateKey, todayIn } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';

	let today = $state(todayIn(tasker.timezone));
	$effect(() => {
		const timer = setInterval(() => (today = todayIn(tasker.timezone)), 15_000);
		return () => clearInterval(timer);
	});

	const date = $derived(tasker.plan.date ?? today);
	const shift = (days: number) => (tasker.plan.date = addDays(date, days));
</script>

<div class="relative flex items-center justify-center gap-1">
	<Button variant="ghost" size="icon" aria-label="Previous day" onclick={() => shift(-1)}>
		<ChevronLeft />
	</Button>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" class="min-w-28 text-lg font-semibold">
					{formatDay(date, today)}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto">
			<Input
				type="date"
				aria-label="Pick a date"
				value={date}
				onchange={(e) =>
					isDateKey(e.currentTarget.value) && (tasker.plan.date = e.currentTarget.value)}
			/>
		</Popover.Content>
	</Popover.Root>
	<Button variant="ghost" size="icon" aria-label="Next day" onclick={() => shift(1)}>
		<ChevronRight />
	</Button>
	{#if date !== today}
		<Button
			variant="outline"
			class="absolute left-full ml-1"
			onclick={() => (tasker.plan.date = today)}>Today</Button
		>
	{/if}
</div>
