<script lang="ts">
	import { onMount } from 'svelte';
	import { finishSetup, isSetupDone } from '#lib/theme.js';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let open = $state(false);

	onMount(() => {
		open = !isSetupDone();
	});

	function done() {
		finishSetup();
		open = false;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(value) => {
		// Closing in any way counts as done, so this is only ever shown once
		if (!value) finishSetup();
	}}
>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Welcome to ADHD Tasker</Dialog.Title>
			<Dialog.Description>How should the app look? You can change this later in Settings.</Dialog.Description>
		</Dialog.Header>
		<ThemePicker />
		<Dialog.Footer>
			<Button onclick={done}>Continue</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
