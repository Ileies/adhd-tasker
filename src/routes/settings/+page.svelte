<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import TimezonePicker from '#lib/components/TimezonePicker.svelte';
	import { effectiveClock12h } from '#lib/format.js';
	import ClockFormatForm from '#lib/components/ClockFormatForm.svelte';
	import MyDayForm from '#lib/components/MyDayForm.svelte';
	import ReminderSettingsForm from '#lib/components/ReminderSettingsForm.svelte';
	import OpenAiKeyForm from '#lib/components/OpenAiKeyForm.svelte';
	import AgentSettingsForm from '#lib/components/AgentSettingsForm.svelte';
	import VoiceSettingsForm from '#lib/components/VoiceSettingsForm.svelte';
	import AccountCard from '#lib/components/AccountCard.svelte';
	import GoogleLinkPicker from '#lib/components/GoogleLinkPicker.svelte';
	import CalendarSettings from '#lib/components/CalendarSettings.svelte';
	import { parseServices } from '#lib/google.js';
	import DataSettings from '#lib/components/DataSettings.svelte';
	import SyncSettings from '#lib/components/SyncSettings.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import PageFrame from '#lib/components/PageFrame.svelte';
	import { browser } from '$app/env';
	import { tasker } from '#lib/app.svelte.js';

	const { data } = $props();

	// The server render has no shared client state, so an account reads its load data there
	const settings = $derived(browser ? tasker.settings : (data.user ?? tasker.settings));
	// A guest's settings are on the device: the forms wait until they were read, so they never show defaults that are not theirs
	const ready = $derived(!!data.user || tasker.account.ready);

	// Ordered by how much a section shapes the day
	const sections = $derived([
		{ id: 'reminders', label: 'Reminders and sound' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'time', label: 'Time' },
		{ id: 'assistant', label: 'Assistant' },
		{ id: 'account', label: data.user ? 'Account and data' : 'Your data and sync' }
	]);
</script>

<svelte:head>
	<title>Settings - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Settings" {sections}>
	{#if ready}
		<Card.Root id="reminders" class="scroll-mt-6">
			<Card.Header>
				<Card.Title>Reminders and sound</Card.Title>
			</Card.Header>
			<Card.Content>
				<ReminderSettingsForm
					checkIn={settings.checkInMinutes}
					reminders={settings.enableReminders}
					advance={settings.reminderAdvanceTime}
					hyperfocus={settings.hyperfocusAlarm}
					overrun={settings.overrunMinutes}
					showClock={settings.showClock}
				/>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root id="appearance" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Appearance</Card.Title>
		</Card.Header>
		<Card.Content>
			<ThemePicker />
		</Card.Content>
	</Card.Root>

	<Card.Root id="time" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Time</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-6">
			<TimezonePicker />
			{#if ready}
				<ClockFormatForm twelve={effectiveClock12h(settings.clock12h)} />
				<MyDayForm start={settings.myDayStart} end={settings.myDayEnd} />
			{/if}
		</Card.Content>
	</Card.Root>

	{#if ready}
		<Card.Root id="assistant" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Assistant</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-6">
				<OpenAiKeyForm hasKey={settings.hasOpenaiKey} signedIn={!!data.user} />
				{#if settings.hasOpenaiKey}
					<div class="space-y-3 border-t pt-6">
						<p class="text-muted-foreground text-sm">
							By default it stays quiet and only offers a note or a question. See what it did on the
							<a class="underline" href="/activity">Activity</a> page.
							{#if !data.user}
								Without an account it only works while this app is open.
							{/if}
						</p>
						<AgentSettingsForm
							autonomy={settings.aiAutonomy}
							events={settings.aiEvents}
							quietStart={settings.quietStart}
							quietEnd={settings.quietEnd}
							budget={settings.dailyTokenBudget}
						/>
					</div>
					<div class="border-t pt-6">
						<VoiceSettingsForm replies={settings.voiceReplies} />
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root id="account" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>{data.user ? 'Account and data' : 'Your data and sync'}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-6">
				{#if data.user}
					<AccountCard email={data.user.email} />
					<div class="space-y-4">
						<GoogleLinkPicker linked={data.user.googleServices} />
						{#if parseServices(data.user.googleServices).includes('calendar')}
							<div class="border-t pt-6">
								<CalendarSettings />
							</div>
						{/if}
					</div>
				{:else}
					<SyncSettings />
				{/if}
				<div class="space-y-3 border-t pt-6">
					<p class="font-medium">Your data</p>
					<DataSettings signedIn={!!data.user} />
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</PageFrame>
