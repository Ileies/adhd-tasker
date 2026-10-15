<script lang="ts">
	import { stopAutoSignIn } from '#lib/onetap.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const { email }: { email: string } = $props();
</script>

<!-- Otherwise One Tap auto select would sign the user straight back in -->
<form
	method="POST"
	action="/logout"
	class="flex flex-wrap items-center gap-3"
	onsubmit={() => stopAutoSignIn()}
>
	<p class="min-w-0 flex-1 truncate">Signed in as <span class="font-medium">{email}</span></p>
	<Button type="submit" variant="outline">Log out</Button>
</form>
