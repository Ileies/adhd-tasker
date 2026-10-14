<script lang="ts">
	import { downloadExport, eraseSoon, importFile } from '#lib/data.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const { signedIn }: { signedIn: boolean } = $props();

	let message = $state<{ ok: boolean; text: string } | null>(null);
	let picker: HTMLInputElement | undefined = $state();

	async function exportNow() {
		const failure = await downloadExport();
		message = failure ? { ok: false, text: failure } : { ok: true, text: 'Export saved.' };
	}

	async function chosen() {
		const file = picker?.files?.[0];
		if (!file) return;
		const result = await importFile(file);
		message = { ok: result.ok, text: result.message };
		// The same file can be chosen again
		if (picker) picker.value = '';
	}
</script>

<div class="space-y-4">
	<p class="text-sm">
		{#if signedIn}
			Your plan, alarms and settings are kept in your account. Download a copy any time.
		{:else}
			Your plan lives only in this browser. Clearing site data deletes it. Export a copy, or sign in
			to sync.
		{/if}
	</p>

	<div class="flex flex-wrap gap-2">
		<Button variant="secondary" onclick={exportNow}>Export</Button>
		<Button variant="secondary" onclick={() => picker?.click()}>Import</Button>
		{#if !signedIn}
			<Button variant="ghost" onclick={eraseSoon}>Delete everything on this device</Button>
		{/if}
	</div>
	<input
		bind:this={picker}
		type="file"
		accept="application/json,.json"
		class="hidden"
		aria-label="Choose an export file to import"
		onchange={chosen}
	/>

	{#if message}
		<p class="text-sm {message.ok ? 'text-success' : 'text-destructive'}" role="status">
			{message.text}
		</p>
	{/if}

	<p class="text-muted-foreground text-sm">
		The file holds your plan, your alarms and your settings. Your OpenAI key and the assistant's log
		are not in it. Importing adds what the file has and leaves what is already here alone.
	</p>
</div>
