<script lang="ts">
	import { page } from '$app/state';
	import ErrorPanel from '#lib/components/ErrorPanel.svelte';

	// Only known reasons are shown, the query string is never rendered as it is
	const message = $derived(
		page.url.searchParams.get('error') === 'invalid_request'
			? 'The sign-in request could not be verified. Please try again.'
			: 'Signing in did not work. Please try again.'
	);
</script>

<svelte:head>
	<title>Sign-in failed - ADHD Tasker</title>
</svelte:head>

<ErrorPanel title="Sign-in failed" {message} action={{ label: 'Back to Now', href: '/' }} />
