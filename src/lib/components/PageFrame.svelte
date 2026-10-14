<script lang="ts">
	import type { Snippet } from 'svelte';

	type Section = { id: string; label: string };

	let {
		title,
		subtitle,
		sections = [] as Section[],
		prose = false,
		children
	}: {
		title: string;
		subtitle?: string;
		sections?: Section[];
		/** Running text: reading width and a body that grows with the screen. Otherwise the children are cards in two columns from `xl`. */
		prose?: boolean;
		children: Snippet;
	} = $props();

	// A list of one section is no navigation
	const showNav = $derived(sections.length > 1);
</script>

<!-- The frame grows with the screen so a big display is used, not a small column in the middle -->
<div
	class="mx-auto w-full px-4 pt-6 pb-12 2xl:pt-10 {prose
		? '3xl:max-w-7xl max-w-4xl 2xl:max-w-6xl'
		: '3xl:max-w-[100rem] max-w-4xl xl:max-w-6xl 2xl:max-w-7xl'}"
>
	<h1 class="3xl:text-4xl text-2xl font-bold 2xl:text-3xl">{title}</h1>
	{#if subtitle}<p class="text-muted-foreground mt-1 text-sm 2xl:text-base">{subtitle}</p>{/if}

	<!-- Wide screens use the space beside the content for the section list -->
	<div
		class="mt-6 lg:grid lg:gap-10 2xl:mt-8 2xl:gap-14 {showNav
			? 'lg:grid-cols-[12rem_minmax(0,1fr)] 2xl:grid-cols-[14rem_minmax(0,1fr)]'
			: ''}"
	>
		{#if showNav}
			<nav aria-label="Sections" class="sticky top-6 hidden self-start lg:block">
				<ul class="flex flex-col gap-1 border-l">
					{#each sections as section (section.id)}
						<li>
							<a
								href="#{section.id}"
								class="text-muted-foreground hover:text-foreground focus-visible:text-foreground -ml-px block border-l border-transparent py-1 pl-3 text-sm hover:border-current focus-visible:border-current 2xl:text-base"
								>{section.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
		<div
			class="min-w-0 {prose
				? '3xl:text-2xl max-w-[70ch] leading-relaxed lg:text-lg 2xl:text-xl'
				: 'xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 2xl:gap-6 xl:[&>*]:mt-0'} {showNav
				? ''
				: 'mx-auto'}"
		>
			{@render children()}
		</div>
	</div>
</div>
