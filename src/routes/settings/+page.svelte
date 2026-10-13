<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
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
</div>
