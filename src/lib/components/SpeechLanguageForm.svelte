<script lang="ts">
	import { saveSettings } from '#lib/autosave.js';
	import { VOICE_LANGUAGES } from '#lib/voice.js';

	const { language }: { language: string | null } = $props();

	let message = $state<string | null>(null);

	async function put(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		message = await saveSettings({ ok: true, value: { voiceLanguage: value || null } });
	}
</script>

<div class="space-y-2">
	<label class="font-medium" for="speech-language">Speech language</label>
	<select
		id="speech-language"
		class="border-input bg-background h-11 w-full rounded-md border px-2 text-sm md:h-9 md:w-64"
		value={language ?? ''}
		onchange={put}
	>
		<option value="">Automatic (browser language)</option>
		{#each VOICE_LANGUAGES as option (option.tag)}
			<option value={option.tag}>{option.label}</option>
		{/each}
	</select>
	<p class="text-muted-foreground text-sm">
		The language you speak into the microphone buttons. Set it if your browser is in another
		language than you talk.
	</p>
	{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
</div>
