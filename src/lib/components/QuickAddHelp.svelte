<script lang="ts">
	import { QUICK_RULES, quickOutcome, type QuickMode } from '#lib/quickhelp.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		mode,
		onuse
	}: { open: boolean; mode: QuickMode; onuse: (text: string) => void } = $props();

	const rules = $derived(QUICK_RULES[mode]);
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title>{mode === 'alarm' ? 'Quick add an alarm' : 'Quick add a task'}</Dialog.Title>
			<Dialog.Description>
				{mode === 'alarm'
					? 'Type one line and press Enter. The line is a name plus when it rings.'
					: 'Type one line and press Enter. The line is a title plus an optional time and length.'}
			</Dialog.Description>
		</Dialog.Header>

		<ul class="divide-y">
			{#each rules as rule (rule.name)}
				{@const outcome = quickOutcome(mode, rule.example)}
				<li class="space-y-1 py-3">
					<div class="text-sm font-semibold">{rule.name}</div>
					<p class="text-muted-foreground text-sm">{rule.how}</p>
					<div class="flex items-center gap-2">
						<code class="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1 text-sm"
							>{rule.example}</code
						>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() => {
								onuse(rule.example);
								open = false;
							}}>Try it</Button
						>
					</div>
					{#if outcome}
						<p class="text-muted-foreground text-xs">{outcome.title}: {outcome.when}</p>
					{/if}
				</li>
			{/each}
		</ul>

		<p class="text-muted-foreground text-sm">
			The line shows what it understood under the field before you add it.
		</p>
	</Dialog.Content>
</Dialog.Root>
