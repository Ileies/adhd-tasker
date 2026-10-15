<script lang="ts">
	import { Mic } from '@lucide/svelte';
	import { tasker } from '#lib/app.svelte.js';
	import { canTalk, finishRecording, startRecording } from '#lib/speech.js';
	import { Button } from '#lib/components/ui/button/index.js';

	/** Push-to-talk for any text field: what was said goes to `onheard`. Only there when a key is saved. */
	const {
		onheard,
		onmessage,
		class: className = ''
	}: {
		onheard: (text: string) => void;
		onmessage?: (message: string) => void;
		class?: string;
	} = $props();

	const voice = tasker.voice;
	let pressed = false;

	function heard(text: string | null) {
		if (text) {
			onmessage?.('');
			onheard(text);
		} else onmessage?.('Did not catch that');
	}

	// Speaking lasts exactly as long as the button or Space is held
	async function press(event: Event) {
		event.preventDefault();
		if (pressed) return;
		pressed = true;
		onmessage?.('');
		const limited = (text: string | null) => {
			pressed = false;
			heard(text);
		};
		if (!(await startRecording(limited))) {
			pressed = false;
			onmessage?.('The microphone is not available');
		}
	}

	async function release() {
		if (!pressed) return;
		pressed = false;
		try {
			heard(await finishRecording());
		} catch (e) {
			onmessage?.(e instanceof Error ? e.message : 'Could not understand the recording');
		}
	}
</script>

{#if canTalk()}
	<Button
		type="button"
		variant={voice.recording ? 'default' : 'ghost'}
		size="icon"
		class="size-11 shrink-0 md:size-9 {className}"
		aria-label="Hold to talk"
		title="Hold to talk"
		aria-pressed={voice.recording}
		disabled={voice.transcribing}
		onpointerdown={(e) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			void press(e);
		}}
		onpointerup={release}
		onpointercancel={release}
		onkeydown={(e) => {
			if (e.key === ' ' && !e.repeat) void press(e);
		}}
		onkeyup={(e) => e.key === ' ' && release()}
		onclick={(e) => e.preventDefault()}
	>
		<Mic />
	</Button>
{/if}
