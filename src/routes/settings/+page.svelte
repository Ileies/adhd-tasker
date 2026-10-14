<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import TimezonePicker from '#lib/components/TimezonePicker.svelte';
	import AnchoringSettingsForm from '#lib/components/AnchoringSettingsForm.svelte';
	import OpenAiKeyForm from '#lib/components/OpenAiKeyForm.svelte';
	import AgentSettingsForm from '#lib/components/AgentSettingsForm.svelte';
	import VoiceSettingsForm from '#lib/components/VoiceSettingsForm.svelte';
	import ClockSettingsForm from '#lib/components/ClockSettingsForm.svelte';
	import GoogleLinkPicker from '#lib/components/GoogleLinkPicker.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import PageFrame from '#lib/components/PageFrame.svelte';

	const { data, form } = $props();

	const sections = $derived([
		{ id: 'theme', label: 'Theme' },
		{ id: 'timezone', label: 'Timezone' },
		...(data.user
			? [
					{ id: 'clock', label: 'Clock' },
					{ id: 'reminders', label: 'Reminders and overruns' },
					{ id: 'assistant', label: 'Assistant' },
					{ id: 'voice', label: 'Voice' },
					{ id: 'agent', label: 'Assistant on its own' },
					{ id: 'google', label: 'Google Workspace' }
				]
			: [])
	]);
</script>

<svelte:head>
	<title>Settings - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Settings" {sections}>
	<Card.Root id="theme" class="scroll-mt-6">
		<Card.Header>
			<Card.Title>Theme</Card.Title>
			<Card.Description
				>Choose one theme, or switch automatically based on your local time.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<ThemePicker />
		</Card.Content>
	</Card.Root>

	<Card.Root id="timezone" class="mt-4 scroll-mt-6">
		<Card.Header>
			<Card.Title>Timezone</Card.Title>
			<Card.Description>Task times and the active task follow this timezone.</Card.Description>
		</Card.Header>
		<Card.Content>
			<TimezonePicker />
		</Card.Content>
	</Card.Root>

	{#if data.user}
		<Card.Root id="clock" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Clock</Card.Title>
				<Card.Description>Show the time of day on the Now screen.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ClockSettingsForm show={data.user.showClock} />
			</Card.Content>
		</Card.Root>

		<Card.Root id="reminders" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Reminders and overruns</Card.Title>
				<Card.Description
					>Sounds that pull you back to the plan. They work without an OpenAI key.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<AnchoringSettingsForm
					reminders={data.user.enableReminders}
					advance={data.user.reminderAdvanceTime}
					hyperfocus={data.user.hyperfocusAlarm}
					overrun={data.user.overrunMinutes}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root id="assistant" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Assistant</Card.Title>
				<Card.Description
					>Bring your own OpenAI key to chat with the assistant about your plan.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<OpenAiKeyForm
					hasKey={data.user.hasOpenaiKey}
					message={form && 'openaiMessage' in form ? form.openaiMessage : undefined}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root id="voice" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Voice</Card.Title>
				<Card.Description
					>Talk to the assistant and let it talk back. Off by default.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<VoiceSettingsForm replies={data.user.voiceReplies} />
			</Card.Content>
		</Card.Root>

		<Card.Root id="agent" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Assistant on its own</Card.Title>
				<Card.Description>
					The assistant can notice what happens in your plan. By default it stays quiet and only
					offers a note or a question. See what it did on the <a class="underline" href="/activity"
						>Activity</a
					> page.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<AgentSettingsForm
					autonomy={data.user.aiAutonomy}
					events={data.user.aiEvents}
					quietStart={data.user.quietStart}
					quietEnd={data.user.quietEnd}
					budget={data.user.dailyTokenBudget}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root id="google" class="mt-4 scroll-mt-6">
			<Card.Header>
				<Card.Title>Google Workspace</Card.Title>
				<Card.Description
					>Ask your Google account for more permissions. Nothing is read or changed until a feature
					uses them.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<GoogleLinkPicker linked={data.user.googleServices} />
			</Card.Content>
		</Card.Root>
	{/if}
</PageFrame>
