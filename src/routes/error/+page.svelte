<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';

	// Only known reasons are shown, the query string is never rendered as it is
	const message = $derived(
		page.url.searchParams.get('error') === 'invalid_request'
			? 'The sign-in request could not be verified. Please try again.'
			: 'Signing in did not work. Please try again.'
	);
</script>

<div class="mx-auto max-w-md p-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Sign-in failed</Card.Title>
			<Card.Description>{message}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href="/">Back to start</Button>
		</Card.Content>
	</Card.Root>
</div>
