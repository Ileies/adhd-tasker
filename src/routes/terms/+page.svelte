<script lang="ts">
	import PageFrame from '#lib/components/PageFrame.svelte';

	const sections = [
		{ id: 'the-service', label: 'The service' },
		{ id: 'not-a-medical-service', label: 'Not a medical service' },
		{ id: 'do-not-rely-on-it-for-anything-critical', label: 'Nothing critical' },
		{ id: 'the-assistant', label: 'The assistant' },
		{ id: 'your-account-and-content', label: 'Your account and content' },
		{ id: 'liability', label: 'Liability' },
		{ id: 'changes-and-law', label: 'Changes and law' }
	];
</script>

<svelte:head>
	<title>Terms - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Terms of use" subtitle="Last updated October 16, 2026" {sections} prose>
	<p>
		ADHD Tasker is a free planner run privately by Elias Klassen (<a
			class="underline"
			href="mailto:admin@ileies.de">admin@ileies.de</a
		>). By using the app, with or without an account, you agree to these terms. How your data is
		handled is described under
		<a class="underline" href="/privacy">Privacy</a>.
	</p>

	<h2 id="the-service" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">The service</h2>
	<p class="mt-2">
		The app is offered free of charge and as it is. Features can change or be removed, and the
		service can be paused or ended. If it ends, you will be able to ask for a copy of your data
		first.
	</p>

	<h2 id="not-a-medical-service" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Not a medical service
	</h2>
	<p class="mt-2">
		The app helps you keep a plan in view. It is not a medical device and does not diagnose, treat
		or replace professional care. Suggestions from the assistant are not medical advice.
	</p>

	<h2
		id="do-not-rely-on-it-for-anything-critical"
		class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl"
	>
		Do not rely on it for anything critical
	</h2>
	<p class="mt-2">
		Alarms, reminders and sounds only reach a screen where the app is open, and they can fail, for
		example when the device sleeps, the browser closes the tab or the connection drops. Do not use
		the app as the only reminder for medication, appointments or anything where missing it could
		cause harm.
	</p>

	<h2 id="the-assistant" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		The assistant
	</h2>
	<p class="mt-2">
		The assistant works only with your own OpenAI key. You are responsible for that key, for the
		costs OpenAI charges you and for following
		<a class="underline" href="https://openai.com/policies/" target="_blank" rel="noreferrer"
			>OpenAI's terms</a
		>. The assistant can make mistakes, including changes to your plan. Every change it makes is
		listed under Activity and can be undone.
	</p>

	<h2 id="your-account-and-content" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Your account and content
	</h2>
	<p class="mt-2">
		Without an account, your plan lives only in your browser. It can be lost when you clear site
		data, switch browsers or lose the device, and nobody can restore it for you. Use the export
		under Settings to keep a copy.
	</p>
	<p class="mt-2">
		If you sign in, you use your own Google account and keep it secure. What you write into the app
		stays yours. You may use the app only for yourself and not to harm the service or other people,
		for example by overloading it, probing it for weaknesses without permission or storing unlawful
		content. Accounts that do so can be blocked.
	</p>
	<p class="mt-2">
		You can stop using the app at any time and delete your account yourself under Settings, or ask
		for it by writing to
		<a class="underline" href="mailto:admin@ileies.de">admin@ileies.de</a>.
	</p>

	<h2 id="liability" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Liability</h2>
	<p class="mt-2">
		As the service is free, liability is limited to intent and gross negligence. This does not limit
		liability for injury to life, body or health, or where the law does not allow a limitation.
	</p>

	<h2 id="changes-and-law" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Changes and law
	</h2>
	<p class="mt-2">
		These terms can change. The date at the top shows the current version. German law applies,
		without prejudice to mandatory consumer protection in the country where you live.
	</p>
</PageFrame>
