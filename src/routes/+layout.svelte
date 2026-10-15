<script lang="ts">
	import '../app.css';
	import { CalendarDays, Maximize, Minimize, MessageSquare, User } from '@lucide/svelte';
	import AssistantDrawer from '#lib/components/AssistantDrawer.svelte';
	import { onMount, untrack } from 'svelte';
	import { initAudio } from '#lib/audio.js';
	import { initPreferences, setTimezone } from '#lib/theme.js';
	import { deviceTimezone } from '#lib/time.js';
	import { keepAwake, toggleFullscreen } from '#lib/display.js';
	import { startStream } from '#lib/stream.js';
	import { loadGsi, showOneTap, stopAutoSignIn, wantsOneTap } from '#lib/onetap.js';
	import { startCalendarSync } from '#lib/calendar.js';
	import { parseServices } from '#lib/google.js';
	import { checkMove } from '#lib/move.js';
	import MoveScreen from '#lib/components/MoveScreen.svelte';
	import { beginGuest, useAccount } from '#lib/mode.js';
	import { syncSpeechVolume } from '#lib/speech.js';
	import { isFullscreenKey } from '#lib/shortcuts.js';
	import { loadFlags } from '#lib/welcome.js';
	import TimezoneDialog from '#lib/components/TimezoneDialog.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tasker } from '#lib/app.svelte.js';
	import VolumeMenu from '#lib/components/VolumeMenu.svelte';
	import UndoToast from '#lib/components/UndoToast.svelte';
	import AlarmBanner from '#lib/components/AlarmBanner.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { browser } from '$app/env';
	import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_REDIRECT_URI } from '$app/env/public';

	let { children, data } = $props();

	// Hydrate once: later invalidations must not overwrite optimistic edits or days loaded since.
	// A signed in visitor's plan and settings came with the page, a guest's are read from the device below
	// A guest runs on the device: the plan is read from IndexedDB, the agent, alarms and sound run in this tab.
	// Started right here, before the page below runs its own effects, so that its first requests already wait for the device
	let stopGuest = () => {};
	if (browser)
		untrack(() => {
			if (data.user) {
				const { email, ...settings } = data.user;
				useAccount(email, settings, data.tasks);
			} else stopGuest = beginGuest();
		});
	onMount(() => stopGuest);

	onMount(() => {
		// A device that was a guest may still hold a plan: it moves into the account, or asks first
		if (data.user) void checkMove();
		// Calendar events follow Google while a screen is open, the server also does it with every screen closed
		const stopCalendar = parseServices(data.user?.googleServices).includes('calendar')
			? startCalendarSync()
			: () => {};
		loadFlags();
		const stopPreferences = initPreferences();
		// One audio context for the page, unlocked by the first tap or key
		const stopAudio = initAudio();
		return () => {
			stopCalendar();
			stopPreferences();
			stopAudio();
		};
	});

	// Pages to read, public: no One Tap prompt in the way
	const legal = $derived(['/privacy', '/terms', '/about'].includes(page.url.pathname));

	// The GSI script can scan the DOM before hydration, so close a prompt that is already showing
	$effect(() => {
		if (!data.user) return;
		const cancel = () =>
			(
				window as { google?: { accounts?: { id?: { cancel?: () => void } } } }
			).google?.accounts?.id?.cancel?.();
		cancel();
		const timer = setTimeout(cancel, 1000);
		return () => clearTimeout(timer);
	});

	// One Tap for everyone who is not signed in, also on a first visit.
	// Started from code so it also shows after a client side navigation (for example from /privacy to /).
	// The cleanup closes it again on legal pages.
	$effect(() => {
		if (!wantsOneTap({ signedIn: !!data.user, legal })) return;
		loadGsi();
		return showOneTap({ clientId: PUBLIC_GOOGLE_CLIENT_ID, loginUri: PUBLIC_REDIRECT_URI });
	});

	// Alarms, cards and plan changes the agent made on its own arrive over one pushed stream
	$effect(() => {
		if (!data.user) return;
		return startStream();
	});

	// The screen stays on on every page while the app is in view, like a playing video
	$effect(keepAwake);

	$effect(() => {
		tasker.voice.replies = tasker.settings.voiceReplies;
	});

	// Muting or turning the volume down also quiets speech that is being said
	$effect(() => {
		void tasker.isMuted;
		void tasker.volume;
		syncSpeechVolume();
	});

	// The saved timezone is the source of truth, the first visit saves this device's timezone
	$effect(() => {
		if (!tasker.account.ready || tasker.account.problem) return;
		if (tasker.settings.timezone) tasker.timezone = tasker.settings.timezone;
		// Applied locally at once, a failed save is retried on the next load
		else setTimezone(deviceTimezone()).catch(() => {});
	});

	let logoutForm: HTMLFormElement | undefined = $state();

	function logout() {
		// Otherwise One Tap auto select would sign the user straight back in
		stopAutoSignIn();
		logoutForm?.requestSubmit();
	}

	// On the Now screen the bar floats over the content and fades out when nothing is touched,
	// so the display stays calm. Any input brings it back.
	const HIDE_AFTER_MS = 5000;
	const overlay = $derived(page.url.pathname === '/');
	let barVisible = $state(true);
	let isFullscreen = $state(false);
	let headerEl: HTMLElement | undefined = $state();
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleHide() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			// Keep the bar while it holds keyboard focus
			if (headerEl?.matches(':focus-within')) scheduleHide();
			else barVisible = false;
		}, HIDE_AFTER_MS);
	}

	function activity() {
		barVisible = true;
		if (overlay) scheduleHide();
	}

	$effect(() => {
		if (overlay) scheduleHide();
		else {
			clearTimeout(hideTimer);
			barVisible = true;
		}
		return () => clearTimeout(hideTimer);
	});

	const barHidden = $derived(overlay && !barVisible);
</script>

<svelte:window
	onpointermove={activity}
	onpointerdown={activity}
	onkeydown={(event) => {
		activity();
		if (isFullscreenKey(event)) void toggleFullscreen();
	}}
/>
<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />

<TimezoneDialog />
<UndoToast />
<AlarmBanner />
<AssistantDrawer hasKey={tasker.settings.hasOpenaiKey} />

<!-- Hidden form: dropdown content is portaled, so it cannot live inside a form -->
<form method="POST" action="/logout" bind:this={logoutForm} class="hidden"></form>

<div class="relative flex h-dvh flex-col {barHidden ? 'cursor-none' : ''}">
	<header
		bind:this={headerEl}
		class="z-(--z-bar) grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 py-1 transition-opacity duration-500
			{overlay ? 'bg-background/70 absolute inset-x-0 top-0 backdrop-blur-md' : 'bg-background border-b'}
			{barHidden ? 'pointer-events-none opacity-0' : ''}"
	>
		<div class="flex">
			<Button variant="ghost" size="lg" onclick={() => goto('/edit')} aria-label="Plan">
				<CalendarDays class="size-5" />
				<span class="hidden sm:inline">Plan</span>
			</Button>
		</div>

		<button class="flex cursor-pointer items-center" onclick={() => goto('/')}>
			<img src="/logo.svg" alt="Logo" class="mr-1 h-9" /><span
				class="hidden text-xl font-bold sm:inline">ADHD Tasker</span
			>
		</button>

		<div class="flex items-center justify-end gap-1">
			<Button
				variant="ghost"
				size="icon-lg"
				onclick={() => (tasker.assistant.open = true)}
				aria-label="Assistant"
				title="Assistant"
			>
				<MessageSquare class="size-5" />
			</Button>
			<VolumeMenu />

			<Button
				variant="ghost"
				size="icon-lg"
				onclick={toggleFullscreen}
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
			>
				{#if isFullscreen}
					<Minimize class="size-5" />
				{:else}
					<Maximize class="size-5" />
				{/if}
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-lg" aria-label="Profile menu">
							<User class="size-5" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-64">
					{#if data.user}
						<DropdownMenu.Label class="truncate">{data.user.email}</DropdownMenu.Label>
					{:else}
						<DropdownMenu.Item onSelect={() => goto('/settings#sync')}>
							Sync across devices
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => goto('/alarms')}>Alarms</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/activity')}>Activity</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/settings')}>Settings</DropdownMenu.Item>
					{#if data.user}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={logout} class="flex-col items-start gap-0.5">
							<span>Log out</span>
							<span class="text-muted-foreground text-xs">
								Your plan stays in your account, this device goes back to its own plan.
							</span>
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => goto('/about')}>About</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/privacy')}>Privacy</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/terms')}>Terms</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<main class="min-h-0 flex-1 overflow-auto">
		<!-- A plan on this device waits for the visitor's choice before anything else is shown -->
		{#if tasker.move.comparison}
			<MoveScreen onCancel={logout} />
		{:else}
			{@render children()}
		{/if}
	</main>
</div>
