<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { setTimezone } from '#lib/theme.js';
	import { deviceTimezone } from '#lib/time.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let { loggedIn }: { loggedIn: boolean } = $props();

	const device = deviceTimezone();
	let dismissed = $state(false);

	// Only ask when a timezone was saved earlier and this device differs from it
	const open = $derived(loggedIn && !dismissed && tasker.timezone !== null && tasker.timezone !== device);

	function useDevice() {
		setTimezone(device);
		dismissed = true;
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) dismissed = true;
	}}
>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Different timezone detected</Dialog.Title>
			<Dialog.Description>
				Your settings use {tasker.timezone?.replaceAll('_', ' ')}, but this device is in {device.replaceAll('_', ' ')}. Task
				times follow the timezone in your settings.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dismissed = true)}>Keep {tasker.timezone?.replaceAll('_', ' ')}</Button>
			<Button onclick={useDevice}>Switch to {device.replaceAll('_', ' ')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
