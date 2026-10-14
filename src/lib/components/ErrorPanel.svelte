<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';

	let {
		title,
		message,
		action
	}: {
		title: string;
		message: string;
		action: { label: string; href?: string; onclick?: () => void };
	} = $props();
</script>

<div class="mx-auto max-w-md p-4 pt-12">
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{title}</Card.Title>
			<Card.Description>{message}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href={action.href} onclick={action.onclick}>{action.label}</Button>
		</Card.Content>
	</Card.Root>
</div>
