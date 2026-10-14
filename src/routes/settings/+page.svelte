<script lang="ts">
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import TimezonePicker from '#lib/components/TimezonePicker.svelte';
	import AnchoringSettingsForm from '#lib/components/AnchoringSettingsForm.svelte';
	import OpenAiKeyForm from '#lib/components/OpenAiKeyForm.svelte';
	import AgentSettingsForm from '#lib/components/AgentSettingsForm.svelte';
	import VoiceSettingsForm from '#lib/components/VoiceSettingsForm.svelte';
	import GoogleLinkPicker from '#lib/components/GoogleLinkPicker.svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	const { data, form } = $props();
</script>

<div class="mx-auto max-w-xl p-4">
	<Card.Root>
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

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Timezone</Card.Title>
			<Card.Description>Task times and the active task follow this timezone.</Card.Description>
		</Card.Header>
		<Card.Content>
			<TimezonePicker />
		</Card.Content>
	</Card.Root>

	{#if data.user}
		<Card.Root class="mt-4">
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
					message={form && 'anchoringMessage' in form ? form.anchoringMessage : undefined}
					saved={!!form && 'anchoringSaved' in form}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-4">
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

		<Card.Root class="mt-4">
			<Card.Header>
				<Card.Title>Voice</Card.Title>
				<Card.Description
					>Talk to the assistant and let it talk back. Off by default.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<VoiceSettingsForm
					replies={data.user.voiceReplies}
					saved={!!form && 'voiceSaved' in form}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-4">
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
					message={form && 'agentMessage' in form ? form.agentMessage : undefined}
					saved={!!form && 'agentSaved' in form}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mt-4">
			<Card.Header>
				<Card.Title>Google Workspace</Card.Title>
				<Card.Description
					>Ask your Google account for more permissions. Nothing is read or changed until a feature
					uses them.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<GoogleLinkPicker
					linked={data.user.googleServices}
					message={form && 'message' in form ? form.message : undefined}
				/>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
