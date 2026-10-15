<script lang="ts">
	import { onMount } from 'svelte';
	import {
		accountSnapshots,
		deviceBackupLabel,
		downloadExport,
		eraseSoon,
		importFile,
		restoreAccountSnapshot,
		restoreDeviceBackup
	} from '#lib/data.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const { signedIn }: { signedIn: boolean } = $props();

	let message = $state<{ ok: boolean; text: string } | null>(null);
	let picker: HTMLInputElement | undefined = $state();
	/** Plans that can be brought back: the account's snapshots, or the copy of a plan that moved into an account. */
	let snapshots = $state<{ id: number; label: string }[]>([]);
	let backup = $state<string | null>(null);

	onMount(async () => {
		if (signedIn) snapshots = await accountSnapshots();
		else backup = await deviceBackupLabel();
	});

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

	async function restoreSnapshot(id: number) {
		const failure = await restoreAccountSnapshot(id);
		message = failure
			? { ok: false, text: failure }
			: { ok: true, text: 'The plan is back. What was there before is kept for 30 days too.' };
		snapshots = await accountSnapshots();
	}

	async function restoreCopy() {
		const failure = await restoreDeviceBackup();
		if (failure) message = { ok: false, text: failure };
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
		<Button variant="ghost" onclick={eraseSoon}>
			{signedIn ? 'Delete my account' : 'Delete everything on this device'}
		</Button>
	</div>
	<input
		bind:this={picker}
		type="file"
		accept="application/json,.json"
		class="hidden"
		aria-label="Choose an export file to import"
		onchange={chosen}
	/>

	{#if snapshots.length > 0 || backup}
		<div class="space-y-2">
			{#each snapshots.slice(0, 3) as snapshot (snapshot.id)}
				<div>
					<Button variant="outline" size="sm" onclick={() => restoreSnapshot(snapshot.id)}>
						{snapshot.label}
					</Button>
				</div>
			{/each}
			{#if backup}
				<div>
					<Button variant="outline" size="sm" onclick={restoreCopy}>{backup}</Button>
				</div>
			{/if}
			<p class="text-muted-foreground text-sm">
				{#if signedIn}
					The plan from before a move is kept for 30 days. Restoring it keeps what is there now for
					30 days too, so it can be taken back.
				{:else}
					The copy is kept for 30 days after the move. Restoring it adds the plan to this device and
					leaves what is already here alone.
				{/if}
			</p>
		</div>
	{/if}

	{#if message}
		<p class="text-sm {message.ok ? 'text-success' : 'text-destructive'}" role="status">
			{message.text}
		</p>
	{/if}

	<p class="text-muted-foreground text-sm">
		The file holds your plan, your alarms and your settings. Your OpenAI key and the assistant's log
		are not in it. Importing adds what the file has and leaves what is already here alone.
		{#if signedIn}
			Deleting your account removes your plan, alarms, settings, key and the assistant's log from
			this server. You have ten seconds to take it back.
		{/if}
	</p>
</div>
