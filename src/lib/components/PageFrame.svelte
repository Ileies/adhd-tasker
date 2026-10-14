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
		/** Running text: reading width, a little wider on big screens. */
		prose?: boolean;
		children: Snippet;
	} = $props();

	// A list of one section is no navigation
	const showNav = $derived(sections.length > 1);
</script>

<!-- The frame gets a little wider on big screens so it is not a thin strip -->
<div class="mx-auto w-full max-w-4xl px-4 pt-6 pb-12 xl:max-w-5xl 2xl:max-w-6xl">
	<h1 class="text-2xl font-bold">{title}</h1>
	{#if subtitle}<p class="text-muted-foreground mt-1 text-sm">{subtitle}</p>{/if}

	<!-- Wide screens use the space beside the content for the section list -->
	<div class="mt-6 lg:grid lg:gap-10 {showNav ? 'lg:grid-cols-[12rem_minmax(0,1fr)]' : ''}">
		{#if showNav}
			<nav aria-label="Sections" class="sticky top-6 hidden self-start lg:block">
				<ul class="flex flex-col gap-1 border-l">
					{#each sections as section (section.id)}
						<li>
							<a
								href="#{section.id}"
								class="text-muted-foreground hover:text-foreground focus-visible:text-foreground -ml-px block border-l border-transparent py-1 pl-3 text-sm hover:border-current focus-visible:border-current"
								>{section.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
		<div
			class="min-w-0 {prose
				? 'max-w-[70ch] leading-relaxed lg:text-lg xl:max-w-[80ch] 2xl:max-w-[90ch]'
				: ''} {showNav ? '' : 'mx-auto'}"
		>
			{@render children()}
		</div>
	</div>
</div>
