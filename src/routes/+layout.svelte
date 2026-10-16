<script lang="ts">
	import '../app.css';
	import { CalendarDays, Maximize, Menu, MessageSquare, Minimize, Target } from '@lucide/svelte';
	import AssistantDrawer from '#lib/components/AssistantDrawer.svelte';
	import { onMount, untrack } from 'svelte';
	import { initAudio } from '#lib/audio.js';
	import { loadCustomSounds } from '#lib/custom-sounds.js';
	import { initPreferences, setTimezone, syncTheme } from '#lib/theme.js';
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
	import { pageTitle, place } from '#lib/nav.js';
	import ClockReadout from '#lib/components/ClockReadout.svelte';
	import DaySwitcher from '#lib/components/DaySwitcher.svelte';
	import { loadFlags } from '#lib/welcome.js';
	import SampleBanner from '#lib/components/SampleBanner.svelte';
	import TimezoneDialog from '#lib/components/TimezoneDialog.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tasker } from '#lib/app.svelte.js';
	import { effectiveClock12h, setClockHour12 } from '#lib/format.js';
	import SoundMenu from '#lib/components/SoundMenu.svelte';
	import UndoToast from '#lib/components/UndoToast.svelte';
	import AlarmBanner from '#lib/components/AlarmBanner.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { browser } from '$app/env';
	import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_REDIRECT_URI } from '$app/env/public';

	let { children, data } = $props();

	// Every time on screen follows this. Setting it in the derived runs before the page below renders, and the key renders the page again when it changes
	const clock12h = $derived.by(() => {
		const value = effectiveClock12h(browser ? tasker.settings.clock12h : data.user?.clock12h);
		setClockHour12(value);
		return value;
	});

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
		// Sounds this device replaced with the user's own files
		void loadCustomSounds();
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

	// The theme follows the sun where the user is: a guest's settings arrive after the first paint, and the
	// place can change. A microtask, because the cross-fade flushes synchronously and that is not allowed in an effect
	$effect(() => {
		void [
			tasker.settings.locationLat,
			tasker.settings.locationLon,
			tasker.timezone,
			tasker.account.ready
		];
		queueMicrotask(syncTheme);
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
	let loginForm = $state<HTMLFormElement>();
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleHide() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			// Keep the bars while one holds keyboard focus
			if (document.querySelector('[data-bar]:focus-within')) scheduleHide();
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

	const current = $derived(place(page.url.pathname));
	const title = $derived(pageTitle(page.url.pathname));
</script>

<svelte:window onpointermove={activity} onpointerdown={activity} onkeydown={activity} />
<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />

<TimezoneDialog />
<UndoToast />
<AlarmBanner />
<AssistantDrawer hasKey={tasker.settings.hasOpenaiKey} />

<!-- Hidden form: dropdown content is portaled, so it cannot live inside a form -->
<form method="POST" action="/logout" bind:this={logoutForm} class="hidden"></form>

<div class="relative flex h-dvh flex-col {barHidden ? 'cursor-none' : ''}">
	<header
		data-bar
		class="z-(--z-bar) grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 py-1 transition-opacity duration-500
			{overlay ? 'bg-background/70 absolute inset-x-0 top-0 backdrop-blur-md' : 'bg-background border-b'}
			{barHidden ? 'pointer-events-none opacity-0' : ''}"
	>
		<div class="flex gap-1" role="group" aria-label="Places">
			{#each [{ id: 'now', label: 'Now', href: '/', icon: Target }, { id: 'plan', label: 'Plan', href: '/edit', icon: CalendarDays }] as item (item.id)}
				<Button
					variant={current === item.id ? 'secondary' : 'ghost'}
					size="icon-lg"
					onclick={() => goto(item.href)}
					aria-current={current === item.id ? 'page' : undefined}
					aria-label={item.label}
					title={item.label}
					class="lg:w-auto lg:gap-2 lg:px-4"
				>
					<item.icon class="size-5" />
					<span class="hidden lg:inline">{item.label}</span>
				</Button>
			{/each}
		</div>

		<!-- Wide screens show the clock in the rail, on a phone the rail is below the fold -->
		<div class="min-w-0 px-2 text-center">
			{#if current === 'now'}
				{#if tasker.settings.showClock}
					<div class="sm:hidden"><ClockReadout timezone={tasker.timezone} /></div>
				{/if}
			{:else if current === 'plan'}
				<DaySwitcher />
			{:else if title}
				<span class="block truncate text-lg font-semibold">{title}</span>
			{/if}
		</div>

		<div class="flex items-center justify-end gap-1">
			{#if tasker.settings.hasOpenaiKey}
				<Button
					variant="ghost"
					size="icon-lg"
					onclick={() => (tasker.assistant.open = true)}
					aria-label="Assistant"
					title="Assistant"
				>
					<MessageSquare class="size-5" />
				</Button>
			{/if}
			<SoundMenu />
			<Button
				variant="ghost"
				size="icon-lg"
				onclick={toggleFullscreen}
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			>
				{#if isFullscreen}<Minimize class="size-5" />{:else}<Maximize class="size-5" />{/if}
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-lg" aria-label="Menu">
							<Menu class="size-5" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-64">
					<DropdownMenu.Item onSelect={() => goto('/activity')}>
						Assistant activity
					</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => goto('/settings')}>Settings</DropdownMenu.Item>
					<DropdownMenu.Separator />
					{#if data.user}
						<DropdownMenu.Label class="truncate">{data.user.email}</DropdownMenu.Label>
					{:else}
						<DropdownMenu.Item onSelect={() => loginForm?.requestSubmit()}>
							Sync across devices
						</DropdownMenu.Item>
					{/if}
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
			<form method="POST" action="/login" bind:this={loginForm} hidden></form>
		</div>
	</header>

	<SampleBanner />

	<main class="relative min-h-0 flex-1 overflow-auto">
		<!-- A plan on this device waits for the visitor's choice before anything else is shown -->
		{#if tasker.move.comparison}
			<MoveScreen onCancel={logout} />
		{:else}
			{#key clock12h}
				{@render children()}
			{/key}
		{/if}
	</main>
</div>
