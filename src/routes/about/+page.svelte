<script lang="ts">
	import PageFrame from '#lib/components/PageFrame.svelte';

	const sections = [
		{ id: 'what-it-is-for', label: 'What it is for' },
		{ id: 'now', label: 'Now' },
		{ id: 'plan', label: 'Plan' },
		{ id: 'sound-and-alarms', label: 'Sound and alarms' },
		{ id: 'the-assistant', label: 'The assistant' },
		{ id: 'with-or-without-an-account', label: 'With or without an account' }
	];
</script>

<svelte:head>
	<title>About - ADHD Tasker</title>
</svelte:head>

<PageFrame title="About" subtitle="What ADHD Tasker is and how it works" {sections} prose>
	<h2 id="what-it-is-for" class="scroll-mt-6 text-lg font-semibold lg:text-xl">What it is for</h2>
	<p class="mt-2">
		ADHD Tasker holds your plan so your working memory does not have to. It is meant to stay open on
		a second screen or your phone and show what to do right now, and nothing else that competes with
		it.
	</p>

	<h2 id="now" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Now</h2>
	<p class="mt-2">
		The home screen shows one task: the one that is running at this moment. When several overlap,
		the one with the higher priority wins. The color shifts slowly as time runs out, and a bar
		drains with it, so you can see the time left from across the room without reading a number.
		Below it are the next tasks. When a task runs over, you can finish it, keep going or move it to
		later. "I'm stuck" offers one small first step and a short timer.
	</p>

	<h2 id="plan" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Plan</h2>
	<p class="mt-2">
		Plan your day in blocks on a timeline: drag a block to move it, pull its edge to resize it. For
		a quick one, type a line such as <em>Call dentist 14:30 45m</em> and press Enter. Nothing is deleted
		without a way back: after every change an Undo button stays for a few seconds.
	</p>

	<h2 id="sound-and-alarms" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Sound and alarms
	</h2>
	<p class="mt-2">
		The app calls you back with sound instead of expecting you to look: a soft chime shortly before
		the next task, a tone when a task starts, a nudge when time is up. You can also set alarms and
		timers. Sounds play only while the app is open, and browsers keep them off until you tap or
		press a key once. When the page is silent for that reason, it says so.
	</p>

	<h2 id="the-assistant" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		The assistant
	</h2>
	<p class="mt-2">
		The assistant is optional. It needs your own OpenAI key, which you add in Settings. You can ask
		it to plan or change your day in plain words, by typing or by holding the microphone button. It
		can also look at what happens on your plan and offer a note, a question or a change. How much it
		may do on its own is your choice, and every change it makes is listed under Activity with its
		reason and an Undo. Everything else in the app works without it.
	</p>

	<h2 id="with-or-without-an-account" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		With or without an account
	</h2>
	<p class="mt-2">You can use all of it without an account, or sign in with Google.</p>
	<ul class="mt-2 list-disc space-y-2 pl-5">
		<li>
			<strong>Without an account</strong>, your plan, alarms, settings and OpenAI key stay in this
			browser on this device. This server never receives them. The assistant talks to OpenAI
			straight from your browser. The assistant and your alarms only work while the app is open.
			Clearing this site's data in the browser deletes your plan, so Settings lets you export it to
			a file and import it again.
		</li>
		<li>
			<strong>With an account</strong>, your plan and settings are stored on this server, so every
			device shows the same plan. Your OpenAI key is stored encrypted, and the assistant runs on the
			server.
		</li>
	</ul>
	<p class="mt-4">
		What is stored where, for how long and with whom it is shared is in the
		<a class="underline" href="/privacy">privacy policy</a>.
	</p>
</PageFrame>
