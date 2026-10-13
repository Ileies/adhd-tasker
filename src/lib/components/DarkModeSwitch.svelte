<script lang="ts">
	import { onMount } from 'svelte';
	import { Moon, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	let isDarkMode = $state(false);

	// The initial class is set by the inline script in app.html, so just sync state
	onMount(() => {
		isDarkMode = document.documentElement.classList.contains('dark');
	});

	function toggle() {
		isDarkMode = !isDarkMode;
		document.documentElement.classList.toggle('dark', isDarkMode);
		localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
	}
</script>

<Button variant="ghost" size="icon" onclick={toggle} aria-label="Toggle dark mode">
	{#if isDarkMode}
		<Moon class="h-5 w-5" />
	{:else}
		<Sun class="h-5 w-5" />
	{/if}
</Button>
