<script lang="ts">
	import { flushSync, onMount } from 'svelte';
	import { Moon, Sun } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	let isDarkMode = $state(false);

	// The initial class is set by the inline script in app.html, so just sync state
	onMount(() => {
		isDarkMode = document.documentElement.classList.contains('dark');
	});

	function apply(dark: boolean) {
		isDarkMode = dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('theme', dark ? 'dark' : 'light');
	}

	function toggle() {
		const next = !isDarkMode;
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!document.startViewTransition || reduceMotion) {
			apply(next);
			return;
		}

		// Cross-fade the whole page between the two color schemes
		document.startViewTransition(() => {
			flushSync(() => apply(next));
		});
	}
</script>

<Button variant="ghost" size="icon" onclick={toggle} aria-label="Toggle dark mode">
	<span class="relative grid h-5 w-5 place-items-center">
		<Sun
			class="absolute h-5 w-5 transition-all duration-500 ease-out {isDarkMode
				? 'scale-50 rotate-90 opacity-0'
				: 'scale-100 rotate-0 opacity-100'}"
		/>
		<Moon
			class="absolute h-5 w-5 transition-all duration-500 ease-out {isDarkMode
				? 'scale-100 rotate-0 opacity-100'
				: 'scale-50 -rotate-90 opacity-0'}"
		/>
	</span>
</Button>

<style>
	:global(::view-transition-old(root)),
	:global(::view-transition-new(root)) {
		animation-duration: 450ms;
		animation-timing-function: ease-in-out;
	}
</style>
