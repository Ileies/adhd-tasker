<script lang="ts">
	import { GOOGLE_SERVICES, parseServices } from '#lib/google.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const { linked: stored, message }: { linked: string | null | undefined; message?: string } =
		$props();

	const linked = $derived(parseServices(stored));
	// Ticks start from what is already linked, so adding one service keeps the others
	let ticked = $state<string[]>([]);
	let seeded = false;
	$effect(() => {
		if (seeded) return;
		seeded = true;
		ticked = [...linked];
	});
</script>

<form method="POST" action="?/linkGoogle" class="space-y-4">
	<fieldset class="space-y-3">
		<legend class="sr-only">Google services to link</legend>
		{#each GOOGLE_SERVICES as service (service.id)}
			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="checkbox"
					name="service"
					value={service.id}
					class="accent-primary mt-1 size-4"
					checked={ticked.includes(service.id)}
					onchange={(e) =>
						(ticked = e.currentTarget.checked
							? [...ticked, service.id]
							: ticked.filter((id) => id !== service.id))}
				/>
				<span>
					<span class="font-medium">{service.label}</span>
					{#if linked.includes(service.id)}<span class="text-success text-sm"> - linked</span>{/if}
					<span class="text-muted-foreground block text-sm">{service.description}</span>
				</span>
			</label>
		{/each}
	</fieldset>

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}

	<div class="flex flex-wrap items-center gap-2">
		<Button type="submit" disabled={ticked.length === 0}
			>{linked.length ? 'Update Google link' : 'Link Google Workspace'}</Button
		>
		{#if linked.length}
			<Button type="submit" variant="ghost" formaction="?/unlinkGoogle" formnovalidate
				>Unlink</Button
			>
		{/if}
	</div>
	<p class="text-muted-foreground text-sm">
		Google asks you to confirm each permission. To take access away completely, remove the app in
		your
		<a
			class="underline"
			href="https://myaccount.google.com/permissions"
			target="_blank"
			rel="noreferrer">Google account permissions</a
		>.
	</p>
</form>
