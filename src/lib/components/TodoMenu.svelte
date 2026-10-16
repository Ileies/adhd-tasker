<script lang="ts">
	import { Ellipsis } from '@lucide/svelte';
	import type { Todo } from '#lib/core/repo.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	let {
		todo,
		onEdit,
		onRest,
		onDrop
	}: {
		todo: Todo;
		onEdit: (todo: Todo) => void;
		onRest: () => void;
		onDrop: (todo: Todo) => void;
	} = $props();
</script>

<!-- Drop shows an Undo toast, so there is no confirm step -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-lg"
				class="size-16 hover:bg-current/10 [&_svg:not([class*='size-'])]:size-7"
				aria-label="More for this to-do"
			>
				<Ellipsis />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56">
		<DropdownMenu.Item onSelect={() => onEdit(todo)}>Edit</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={onRest}>Call it a day</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item class="text-destructive" onSelect={() => onDrop(todo)}>
			Drop
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
