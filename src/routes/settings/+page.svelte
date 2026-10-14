<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import TimezonePicker from '#lib/components/TimezonePicker.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
</script>

<div class="mx-auto max-w-xl p-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Theme</Card.Title>
			<Card.Description>Choose one theme, or switch automatically based on your local time.</Card.Description>
		</Card.Header>
		<Card.Content>
			<ThemePicker />
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Timezone</Card.Title>
			<Card.Description>Task times and the active task follow this timezone.</Card.Description>
		</Card.Header>
		<Card.Content>
			<TimezonePicker />
		</Card.Content>
	</Card.Root>
</div>
