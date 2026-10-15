<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { BackendError } from '#lib/backend.js';
	import { DEVICE_PLACE_NAME, locationFields, savedLocation, type Place } from '#lib/location.js';
	import { detectLocation, setLocation } from '#lib/theme.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	const chosen = $derived.by(() => {
		const location = savedLocation(tasker.settings);
		return location !== null && location.source !== 'ip';
	});
	const signedIn = $derived(tasker.account.email !== null);

	let searching = $state(false);
	let query = $state('');
	let results = $state<Place[] | null>(null);
	let busy = $state(false);
	let message = $state<string | null>(null);

	function devicePosition(): Promise<GeolocationPosition> {
		return new Promise((resolve, reject) =>
			navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15_000 })
		);
	}

	async function useDevice() {
		busy = true;
		message = null;
		try {
			const { latitude, longitude } = (await devicePosition()).coords;
			message = await setLocation(
				locationFields({ name: DEVICE_PLACE_NAME, lat: latitude, lon: longitude }, 'device')
			);
		} catch {
			message = 'The browser did not share a position. Search for a city instead.';
			searching = true;
		}
		busy = false;
	}

	async function search(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		try {
			results = await tasker.backend.settings.searchPlaces(query);
			if (results.length === 0) message = 'No city found with that name.';
		} catch (error) {
			results = null;
			message = error instanceof BackendError ? error.message : 'Could not search for cities.';
		}
		busy = false;
	}

	async function choose(place: Place) {
		busy = true;
		message = await setLocation(locationFields(place, 'city'));
		if (message === null) {
			searching = false;
			query = '';
			results = null;
		}
		busy = false;
	}

	async function automatic() {
		busy = true;
		message = await detectLocation();
		busy = false;
	}
</script>

<div class="space-y-3">
	<div class="flex flex-wrap gap-2">
		{#if 'geolocation' in navigator}
			<Button variant="outline" size="sm" disabled={busy} onclick={useDevice}>
				Use this device's location
			</Button>
		{/if}
		{#if !searching}
			<Button variant="outline" size="sm" onclick={() => (searching = true)}>
				Search for a city
			</Button>
		{/if}
		{#if chosen}
			<Button variant="ghost" size="sm" disabled={busy} onclick={automatic}>
				{signedIn ? 'Detect automatically' : "Use my timezone's city"}
			</Button>
		{/if}
	</div>

	{#if searching}
		<form class="flex gap-2" onsubmit={search}>
			<Input
				name="city"
				autocomplete="off"
				placeholder="City"
				aria-label="City name"
				bind:value={query}
			/>
			<Button type="submit" disabled={busy}>Search</Button>
		</form>
	{/if}

	{#if results && results.length > 0}
		<ul class="space-y-1">
			{#each results as place (`${place.name}${place.lat}${place.lon}`)}
				<li>
					<Button
						variant="ghost"
						size="sm"
						class="h-auto w-full justify-start py-2 text-left"
						disabled={busy}
						onclick={() => choose(place)}
					>
						{place.name}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
</div>
