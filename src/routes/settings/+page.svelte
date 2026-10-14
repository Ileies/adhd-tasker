<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import TimezonePicker from '#lib/components/TimezonePicker.svelte';
	import GoogleLinkPicker from '#lib/components/GoogleLinkPicker.svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	const { data, form } = $props();
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

	{#if data.user}
		<Card.Root class="mt-4">
			<Card.Header>
				<Card.Title>Google Workspace</Card.Title>
				<Card.Description>Ask your Google account for more permissions. Nothing is read or changed until a feature uses them.</Card.Description>
			</Card.Header>
			<Card.Content>
				<GoogleLinkPicker linked={data.user.googleServices} message={form && 'message' in form ? form.message : undefined} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>
