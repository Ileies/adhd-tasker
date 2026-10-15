<script lang="ts">
	import { tasker } from '#lib/app.svelte.js';
	import { clearCustomSound, setCustomSound } from '#lib/custom-sounds.js';
	import { playSound } from '#lib/index.js';
	import { SOUND_LIMITS, SOUND_SLOTS, SOUND_TEXT, type SoundSlot } from '#lib/sounds.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let message = $state<{ slot: SoundSlot; text: string } | null>(null);
	let busy = $state<SoundSlot | null>(null);
	const pickers: Partial<Record<SoundSlot, HTMLInputElement>> = {};

	async function pick(slot: SoundSlot, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		busy = slot;
		message = null;
		const problem = await setCustomSound(slot, file);
		busy = null;
		if (problem) message = { slot, text: problem };
		else playSound(slot);
	}
</script>

<div class="space-y-3">
	<div>
		<p class="font-medium">Your own sounds</p>
		<p class="text-muted-foreground text-sm">
			Replace a built-in sound with an audio file, up to {SOUND_LIMITS.maxMs / 1000} seconds. Kept on
			this device only, never uploaded.
		</p>
	</div>

	<ul class="divide-y">
		{#each SOUND_SLOTS as slot (slot)}
			{@const name = tasker.sounds[slot]}
			<li class="flex flex-wrap items-center justify-between gap-2 py-2">
				<div class="min-w-0">
					<p class="text-sm font-medium">{SOUND_TEXT[slot].label}</p>
					<p class="text-muted-foreground truncate text-sm">
						{name ?? `Built-in. ${SOUND_TEXT[slot].hint}`}
					</p>
				</div>
				<div class="flex gap-2">
					<Button variant="ghost" size="sm" onclick={() => playSound(slot)}>Play</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={busy === slot}
						onclick={() => pickers[slot]?.click()}
					>
						{name ? 'Replace' : 'Choose file'}
					</Button>
					{#if name}
						<Button variant="ghost" size="sm" onclick={() => clearCustomSound(slot)}>Reset</Button>
					{/if}
					<input
						bind:this={pickers[slot]}
						type="file"
						accept="audio/*"
						class="hidden"
						aria-label="Audio file for {SOUND_TEXT[slot].label}"
						onchange={(e) => pick(slot, e.currentTarget)}
					/>
				</div>
				{#if message?.slot === slot}
					<p class="text-destructive w-full text-sm" role="alert">{message.text}</p>
				{/if}
			</li>
		{/each}
	</ul>
</div>
