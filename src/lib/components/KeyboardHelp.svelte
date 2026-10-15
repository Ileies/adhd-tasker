<script lang="ts">
	import { SHORTCUTS } from '#lib/shortcuts.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
			<Dialog.Description>They do nothing while you type in a field.</Dialog.Description>
		</Dialog.Header>
		<dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
			{#each SHORTCUTS as shortcut (shortcut.label)}
				<dt><kbd class="bg-muted rounded border px-2 py-0.5 font-mono">{shortcut.label}</kbd></dt>
				<dd>{shortcut.text}</dd>
			{/each}
			<dt><kbd class="bg-muted rounded border px-2 py-0.5 font-mono">Esc</kbd></dt>
			<dd>Close whatever is open</dd>
		</dl>
	</Dialog.Content>
</Dialog.Root>
