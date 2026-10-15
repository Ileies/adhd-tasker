<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<div class="space-y-4">
	<ul class="list-disc space-y-1 pl-5">
		<li>Your plan on every device.</li>
		<li>The assistant and your alarms keep working with the app closed.</li>
	</ul>
	<p class="text-sm">
		The cost: your plan is then stored on this server. Everything on this device comes with you. If
		your account already has a plan, you see both and choose what to keep, before anything is
		changed.
	</p>
	<form method="POST" action="/login">
		<Button type="submit">Sign in with Google</Button>
	</form>
</div>
