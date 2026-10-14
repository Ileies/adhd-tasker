<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { dismissAlarm } from '#lib/alarms.js';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

{#if tasker.schedule.ringing}
	<!-- Calm on purpose: a fixed bar with text and one button, no flashing and no motion -->
	<div
		class="fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border-2 border-primary bg-popover py-3 pr-3 pl-4 text-popover-foreground shadow-lg"
		role="alert"
	>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-semibold tracking-wide text-muted-foreground uppercase">Alarm</span>
			<span class="block break-words text-lg">{tasker.schedule.ringing.label}</span>
		</span>
		<Button onclick={dismissAlarm}>Dismiss</Button>
	</div>
{/if}
