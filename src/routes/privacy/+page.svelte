<script lang="ts">
	import PageFrame from '#lib/components/PageFrame.svelte';

	const sections = [
		{ id: 'who-is-responsible', label: 'Who is responsible' },
		{ id: 'without-an-account', label: 'Without an account' },
		{ id: 'what-is-stored', label: 'With an account' },
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

<PageFrame title="Privacy" subtitle="Last updated October 16, 2026" {sections} prose>
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

	<h2 id="without-an-account" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Without an account
	</h2>
	<p class="mt-2">
		You can use the app without signing in. Then your plan, routines, to-dos, alarms, settings and
		your OpenAI key, if you add one, stay in this browser. This server never receives them, sets no
		cookie and loads nothing from Google. The assistant, if you added a key, talks to OpenAI
		directly from your browser, under your key and OpenAI's terms (see below). All this server sees
		is the request for the app's files, like any web server (see Server logs). Clearing this site's
		data in your browser deletes your plan. Settings has a copy of everything to download, and
		"Delete everything on this device" removes it yourself.
	</p>
	<p class="mt-2">
		The daylight theme needs a place. Without an account it uses the main city of your timezone,
		which never leaves your browser. If you search for a city in Settings, the name you typed is
		sent from your browser to Open-Meteo (see below). If you use the device's location, the position
		stays in this browser.
	</p>

	<h2 id="what-is-stored" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		What is stored with an account
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>
			<strong>Your account:</strong> the email address of your Google account. Nothing else from your
			Google profile is requested or stored.
		</li>
		<li>
			<strong>Your plan:</strong> the tasks you create (title, description, date, time, duration, priority,
			done or not, whether it is your own time, an appointment, or the travel to an appointment and which
			one, how far it may move to make room) and your alarms.
		</li>
		<li>
			<strong>Your routines:</strong> tasks that repeat (title, notes, time, length, priority, the days
			they repeat on, the first and last day, and the last day the app made tasks for). The days of a
			routine are ordinary tasks in your plan.
		</li>
		<li>
			<strong>Your to-dos:</strong> things to do without a time (title, notes, size, due date, how far
			you are, the minutes you spent, how often, and since which day, you pushed it away and the appointment
			it prepares for), and the answers you gave while working through them (what you started, a check
			such as "done" or "a bit", breaks and the times you were away). The answers are kept for 30 days.
		</li>
		<li>
			<strong>Plan snapshots:</strong> when you sign in and your account already has a plan, or you restore
			an earlier plan, the server first keeps a copy of your account's plan (tasks, routines, to-dos,
			alarms and settings), so the change can be undone.
		</li>
		<li>
			<strong>Your settings:</strong> theme, timezone, reminders, assistant and voice settings, and which
			device plays sound.
		</li>
		<li>
			<strong>Your location for the daylight theme:</strong> a position rounded to about one kilometer
			and the name of a city, so the theme can follow sunrise and sunset where you are. Unless you chose
			a place yourself, the server finds it from your IP address when you sign in and when your IP address
			changes. The IP address itself is not stored, only the place that was found. A place you chose by
			city search or with the device's location is never replaced by this lookup, and "Detect automatically"
			in Settings hands it back.
		</li>
		<li>
			<strong>Your own sounds</strong>, if you replace a built-in sound with an audio file. The file
			stays in your browser on that device and is never sent to the server.
		</li>
		<li>
			<strong>Your OpenAI key</strong>, if you add one. It is stored encrypted and never sent back
			to your browser.
		</li>
		<li>
			<strong>Assistant records</strong>, if you use the assistant: every change it made to your
			plan, to-dos or routines with its reason (so you can undo it), the events it reacted to, its
			notes and questions to you, and how many tokens each call used.
		</li>
		<li>
			<strong>Linked Google services:</strong> which services you allowed, and the refresh token Google
			gave for them, stored encrypted so the server can reach them while the app is closed. Unlinking,
			or deleting your account, tells Google to revoke it and deletes it here. Of the linked services
			only Calendar is used, and only after you chose calendars and an import: the titles and times of
			events in the next 14 days become tasks in your plan, all-day events show on Plan. The events are
			used for nothing else.
		</li>
		<li>
			<strong>Changes to your calendar:</strong> moving or resizing a task that came from an event changes
			that event's time, and marking it done adds the line "Done in ADHD Tasker" to its description. If
			you also turn on "Add my own tasks to Google Calendar" (off by default), your tasks get events in
			the calendar you chose, with their title, notes and time, and the event goes when the task goes.
			The app never deletes an event it did not make.
		</li>
	</ul>
	<p class="mt-2">
		The use and transfer of information received from Google APIs to any other app by ADHD Tasker
		adheres to the
		<a
			class="underline"
			href="https://developers.google.com/terms/api-services-user-data-policy"
			target="_blank"
			rel="noreferrer">Google API Services User Data Policy</a
		>, including the Limited Use requirements. Calendar data is used only to show and keep your plan
		in step with your calendar, it is not used for advertising, it is not sold or passed on, it is
		not used to train any model, and no person at ADHD Tasker reads it except where needed for
		security, to follow the law, or when you ask for help with your account. The assistant, when you
		added your own OpenAI key, sees your plan, which then includes tasks made from events.
	</p>
	<p class="mt-2">
		Chat messages and voice recordings are not stored on the server. They pass through to OpenAI for
		the answer and are gone afterwards. Without a key, or when you switch off "Understand speech
		with OpenAI" in Settings, the microphone buttons use your browser's own speech recognition,
		which may send the audio to the browser's provider (for example Google in Chrome). The app never
		sees that audio. The app never asks whether you have ADHD or any other diagnosis.
	</p>

	<h2 id="how-long-it-is-kept" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		How long it is kept
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>
			Events the assistant saw and token counts: 30 days. Plan snapshots: 30 days. Your answers to
			to-dos (starts, checks, breaks, time away): 30 days.
		</li>
		<li>Alarms and wakeups: 7 days after they ended. Resolved assistant notes: 7 days.</li>
		<li>
			Your account, tasks, routines, to-dos, settings and the change history: until you delete your
			account. Settings has "Delete my account", which removes all of it, snapshots included, after
			ten seconds in which you can undo it.
		</li>
	</ul>

	<h2 id="other-services-involved" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">
		Other services involved
	</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>
			<strong>Google</strong> handles sign-in. The sign-in script is loaded from Google while you
			are not signed in (not on this page or the terms), so Google sees your IP address and browser
			like on any site that offers "Sign in with Google". Google's
			<a
				class="underline"
				href="https://policies.google.com/privacy"
				target="_blank"
				rel="noreferrer">privacy policy</a
			> applies.
		</li>
		<li>
			<strong>OpenAI</strong>, only if you add your own key. Then your plan, routines, to-dos, chat
			messages and voice recordings are sent to OpenAI with your key whenever the assistant works
			(also when it looks at an event on its own, and when you press "Suggest steps" for an
			appointment, which sends its title, day and time and the steps already there), under your own
			OpenAI account and
			<a
				class="underline"
				href="https://openai.com/policies/privacy-policy"
				target="_blank"
				rel="noreferrer">OpenAI's policies</a
			>. Requests are sent with storage at OpenAI turned off. Without a key nothing goes to OpenAI.
		</li>
		<li>
			<strong>ipwho.is</strong>, an IP geolocation service, only with an account and only until you
			choose a place yourself. When you sign in and when your IP address changes, the server sends
			your IP address to
			<a class="underline" href="https://ipwho.is" target="_blank" rel="noreferrer">ipwho.is</a>
			over HTTPS and gets back an approximate position and a city name. Nothing else is sent.
		</li>
		<li>
			<strong>Open-Meteo</strong>, only when you search for a city in Settings. The name you typed
			is sent to its geocoding service
			<a class="underline" href="https://open-meteo.com" target="_blank" rel="noreferrer"
				>(open-meteo.com)</a
			>
			over HTTPS, by the server for an account and by your browser without one, so Open-Meteo sees the
			IP address of whoever sends it. Nothing else is sent.
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
			<code>g_csrf_token</code>: set by Google to protect One Tap sign-in, while you are not signed
			in.
		</li>
		<li>
			Local storage: theme, volume, mute, today's sunrise and sunset, a random device id, whether
			setup was done, and whether this device signed in before. Without an account your plan lives
			in this browser's own database (IndexedDB) and is not sent to this server.
		</li>
	</ul>
	<p class="mt-2">There are no tracking or advertising cookies, so there is no cookie banner.</p>

	<h2 id="server-logs" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Server logs</h2>
	<p class="mt-2">
		With or without an account, the server records which page or file was requested and when, and
		the web server in front of it may record your IP address. These logs are used only to keep the
		service running and secure, and are rotated regularly.
	</p>

	<h2 id="legal-basis" class="mt-8 scroll-mt-6 text-lg font-semibold lg:text-xl">Legal basis</h2>
	<p class="mt-2">
		Storing your account, plan and settings is needed to provide the service you signed up for (Art.
		6(1)(b) GDPR). Server logs and sign-in protection rest on the legitimate interest in a secure
		service (Art. 6(1)(f) GDPR). Sending data to OpenAI happens only because you added your key and
		use the assistant. Finding your approximate place from your IP address rests on the legitimate
		interest in a theme that fits your day (Art. 6(1)(f) GDPR), and choosing a place yourself stops
		it. A city search happens only because you start it.
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
