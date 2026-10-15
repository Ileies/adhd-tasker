<script lang="ts">
	import PageFrame from '#lib/components/PageFrame.svelte';

	const sections = [
		{ id: 'who-is-responsible', label: 'Who is responsible' },
		{ id: 'what-is-stored', label: 'What is stored' },
		{ id: 'how-long-it-is-kept', label: 'How long it is kept' },
		{ id: 'other-services-involved', label: 'Other services involved' },
		{ id: 'cookies-and-local-storage', label: 'Cookies and local storage' },
		{ id: 'server-logs', label: 'Server logs' },
		{ id: 'legal-basis', label: 'Legal basis' },
		{ id: 'your-rights', label: 'Your rights' },
		{ id: 'changes', label: 'Changes' }
	];
</script>

<svelte:head>
	<title>Privacy - ADHD Tasker</title>
</svelte:head>

<PageFrame title="Privacy" subtitle="Last updated October 15, 2026" {sections} prose>
	<p>
		ADHD Tasker is a small, privately run planner. It stores what it needs to show you your plan and
		nothing more. There is no advertising, no analytics, no tracking and no selling of data. How the
		app works is described on the <a class="underline" href="/about">About</a> page.
	</p>

	<h2 id="who-is-responsible" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Who is responsible
	</h2>
	<p class="mt-2">
		Elias Klassen, reachable at <a class="underline" href="mailto:admin@ileies.de"
			>admin@ileies.de</a
		>. Write to this address for every question or request about your data.
	</p>

	<h2 id="what-is-stored" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		What is stored
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>
			<strong>Your account:</strong> the email address of your Google account. Nothing else from your
			Google profile is requested or stored.
		</li>
		<li>
			<strong>Your plan:</strong> the tasks you create (title, description, date, time, duration, priority,
			done or not) and your alarms.
		</li>
		<li>
			<strong>Plan snapshots:</strong> when you sign in and your account already has a plan, or you restore
			an earlier plan, the server first keeps a copy of your account's plan (tasks, alarms and settings),
			so the change can be undone.
		</li>
		<li>
			<strong>Your settings:</strong> theme, timezone, reminders, assistant and voice settings, and which
			device plays sound.
		</li>
		<li>
			<strong>Your OpenAI key</strong>, if you add one. It is stored encrypted and never sent back
			to your browser.
		</li>
		<li>
			<strong>Assistant records</strong>, if you use the assistant: every change it made to your
			plan with its reason (so you can undo it), the events it reacted to, its notes and questions
			to you, and how many tokens each call used.
		</li>
		<li>
			<strong>Linked Google services:</strong> only which services you allowed. No access to them is stored
			yet.
		</li>
	</ul>
	<p class="mt-2">
		Chat messages and voice recordings are not stored on the server. They pass through to OpenAI for
		the answer and are gone afterwards. The app never asks whether you have ADHD or any other
		diagnosis.
	</p>

	<h2 id="how-long-it-is-kept" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		How long it is kept
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>Events the assistant saw and token counts: 30 days. Plan snapshots: 30 days.</li>
		<li>Alarms and wakeups: 7 days after they ended. Resolved assistant notes: 7 days.</li>
		<li>
			Your account, tasks, settings and the change history: until you delete your account. Settings
			has "Delete my account", which removes all of it, snapshots included, after ten seconds in
			which you can undo it.
		</li>
	</ul>

	<h2 id="other-services-involved" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Other services involved
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>
			<strong>Google</strong> handles sign-in. The sign-in script is loaded from Google only on a
			device that has signed in before, so Google sees your IP address and browser there like on any
			site that offers "Sign in with Google". A first visit loads nothing from Google. Google's
			<a
				class="underline"
				href="https://policies.google.com/privacy"
				target="_blank"
				rel="noreferrer">privacy policy</a
			> applies.
		</li>
		<li>
			<strong>OpenAI</strong>, only if you add your own key. Then your plan, chat messages and voice
			recordings are sent to OpenAI with your key whenever the assistant works, under your own
			OpenAI account and
			<a
				class="underline"
				href="https://openai.com/policies/privacy-policy"
				target="_blank"
				rel="noreferrer">OpenAI's policies</a
			>. Requests are sent with storage at OpenAI turned off. Without a key nothing goes to OpenAI.
		</li>
	</ul>
	<p class="mt-2">
		Both companies may process data in the United States. Google and OpenAI take part in the EU-US
		Data Privacy Framework.
	</p>

	<h2 id="cookies-and-local-storage" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Cookies and local storage
	</h2>
	<p class="mt-2">
		Only what is needed to keep you signed in and to remember this device's preferences:
	</p>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li><code>session</code> and <code>token</code>: keep you signed in, 7 days.</li>
		<li>
			<code>google_oauth_state</code>, <code>google_code_verifier</code>,
			<code>google_oauth_link</code>: protect the sign-in, 10 minutes.
		</li>
		<li>
			<code>g_csrf_token</code>: set by Google to protect One Tap sign-in, on devices that load it.
		</li>
		<li>
			Local storage: theme, volume, mute, day start and end, a random device id, whether setup was
			done, and whether this device signed in before. Without an account your plan lives in this
			browser's own database (IndexedDB) and is not sent to this server.
		</li>
	</ul>
	<p class="mt-2">There are no tracking or advertising cookies, so there is no cookie banner.</p>

	<h2 id="server-logs" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Server logs</h2>
	<p class="mt-2">
		The server records which page was requested and when, and the web server in front of it may
		record your IP address. These logs are used only to keep the service running and secure, and are
		rotated regularly.
	</p>

	<h2 id="legal-basis" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Legal basis</h2>
	<p class="mt-2">
		Storing your account, plan and settings is needed to provide the service you signed up for (Art.
		6(1)(b) GDPR). Server logs and sign-in protection rest on the legitimate interest in a secure
		service (Art. 6(1)(f) GDPR). Sending data to OpenAI happens only because you added your key and
		use the assistant.
	</p>

	<h2 id="your-rights" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Your rights</h2>
	<p class="mt-2">
		You can ask for a copy of your data, for corrections, for deletion of your account and
		everything in it, for a restriction of processing, and you can object to processing based on
		legitimate interest. Write to
		<a class="underline" href="mailto:admin@ileies.de">admin@ileies.de</a>. You can also complain to
		a data protection supervisory authority.
	</p>
	<p class="mt-2">
		Access you granted to this app can be removed at any time in
		<a
			class="underline"
			href="https://myaccount.google.com/permissions"
			target="_blank"
			rel="noreferrer">your Google account</a
		>. Your OpenAI key can be removed under Settings and is then deleted.
	</p>

	<h2 id="changes" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Changes</h2>
	<p class="mt-2">If this policy changes, the date at the top changes with it.</p>
</PageFrame>
