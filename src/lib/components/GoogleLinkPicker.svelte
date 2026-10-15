<script lang="ts">
	import { GOOGLE_SERVICES, parseServices } from '#lib/google.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	const { linked: stored }: { linked: string | null | undefined } = $props();

	let confirmingUnlink = $state(false);

	// Tasks and Keep are not used by anything yet: only Calendar is offered (see TODO.md)
	const VISIBLE = GOOGLE_SERVICES.filter((service) => service.id === 'calendar');
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

<Dialog.Root bind:open={confirmingUnlink}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Unlink Google?</Dialog.Title>
			<Dialog.Description>
				This takes the app's access away at Google and stops following your calendars. Tasks already
				in your plan stay. Linking again asks Google for permission again.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmingUnlink = false)}>Keep it linked</Button>
			<!-- The dialog is portaled out of the form, so the button names the form -->
			<Button
				type="submit"
				variant="destructive"
				form="google-link"
				formaction="/settings?/unlinkGoogle"
				formnovalidate>Unlink</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<form id="google-link" method="POST" action="/login" class="space-y-4">
	<fieldset class="space-y-3">
		<legend class="sr-only">Google services to link</legend>
		{#each VISIBLE as service (service.id)}
			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="checkbox"
					name="services"
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

	<div class="flex flex-wrap items-center gap-2">
		<Button type="submit" disabled={ticked.length === 0}
			>{linked.length ? 'Update Google link' : 'Link Google Calendar'}</Button
		>
		{#if linked.length}
			<Button type="button" variant="ghost" onclick={() => (confirmingUnlink = true)}>Unlink</Button
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
