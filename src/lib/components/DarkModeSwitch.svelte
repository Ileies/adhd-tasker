<script lang="ts">
	import { onMount } from 'svelte';
	import { Moon, Sun } from 'lucide-svelte';

	let isDarkMode = $state(false);

	// Initialize theme from localStorage or system preference
	onMount(() => {
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			isDarkMode = savedTheme === 'dark';
		} else {
			isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	});

	$effect(() => {
		localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
	});
</script>

<label class="swap swap-rotate">
	<!-- this hidden checkbox controls the state -->
	<input
		type="checkbox"
		class="theme-controller"
		value={isDarkMode ? 'aqua' : 'cupcake'}
		onchange={() => isDarkMode = !isDarkMode}
	/>

	<!-- sun icon (light mode) -->
	<Sun class="swap-off h-6 w-6" />

	<!-- moon icon (dark mode) -->
	<Moon class="swap-on h-6 w-6" />
</label>