<script lang="ts">
	import { page } from '$app/state';
	import { errorCopy } from '#lib/errors.js';
	import ErrorPanel from '#lib/components/ErrorPanel.svelte';

	const copy = $derived(errorCopy(page.status));
</script>

<svelte:head>
	<title>{copy.title} - ADHD Tasker</title>
</svelte:head>

<ErrorPanel
	title={copy.title}
	message={copy.message}
	action={copy.action.kind === 'home'
		? { label: copy.action.label, href: '/' }
		: { label: copy.action.label, onclick: () => location.reload() }}
/>
