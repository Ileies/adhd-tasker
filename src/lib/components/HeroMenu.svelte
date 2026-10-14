<script lang="ts">
	import { Ellipsis } from '@lucide/svelte';
	import type { Task } from '#lib/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	let {
		task,
		onEdit,
		onExtend,
		onLater,
		onTomorrow,
		onDrop
	}: {
		task: Task;
		onEdit: (task: Task) => void;
		onExtend: (task: Task) => void;
		onLater: (task: Task) => void;
		onTomorrow: (task: Task) => void;
		onDrop: (task: Task) => void;
	} = $props();
</script>

<!-- Every entry that changes the plan shows an Undo toast, so there is no confirm step -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-lg"
				class="size-16 hover:bg-current/10 [&_svg:not([class*='size-'])]:size-7"
				aria-label="More for this task"
			>
				<Ellipsis />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56">
		<DropdownMenu.Item onSelect={() => onEdit(task)}>Edit</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => onExtend(task)}>15 more min</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => onLater(task)}>Move to later today</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => onTomorrow(task)}>Move to tomorrow</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item class="text-destructive" onSelect={() => onDrop(task)}>
			Drop
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
