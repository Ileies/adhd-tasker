import { browser } from '$app/environment';
import type { tasks } from '$lib/server/db/schema';
import { type Task, TaskStatus } from '$lib/types';
import { tasker } from '$lib/state.svelte';

export function playSound(type: 'task-started' | 'reminder') {
	if (!browser || tasker.isMuted) return;

	const audioContext = new AudioContext();

	switch (type) {
		case 'task-started': {
			// Energizing upward sweep to signal task start - helps with motivation
			// Quick, punchy "power-on" sound with bright harmonics for immediate focus activation
			const fundamental = audioContext.createOscillator();
			const harmonic1 = audioContext.createOscillator();
			const harmonic2 = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			fundamental.connect(gainNode);
			harmonic1.connect(gainNode);
			harmonic2.connect(gainNode);
			gainNode.connect(audioContext.destination);

			// Bright, energetic frequencies - like a notification "ding" but richer
			fundamental.frequency.setValueAtTime(880, audioContext.currentTime); // A5 - bright and attention-grabbing
			harmonic1.frequency.setValueAtTime(1760, audioContext.currentTime); // A6 - octave for brightness
			harmonic2.frequency.setValueAtTime(1320, audioContext.currentTime); // E6 - perfect fifth for fullness

			// Quick, punchy envelope - like a bell strike
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(0.6, audioContext.currentTime + 0.005); // Very fast attack
			gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2); // Quick decay

			fundamental.start(audioContext.currentTime);
			harmonic1.start(audioContext.currentTime);
			harmonic2.start(audioContext.currentTime);
			fundamental.stop(audioContext.currentTime + 0.2);
			harmonic1.stop(audioContext.currentTime + 0.2);
			harmonic2.stop(audioContext.currentTime + 0.2);
			break;
		}
		case 'reminder': {
			// Gentle but attention-grabbing reminder - not jarring but noticeable
			// Soft two-tone chime that's pleasant but noticeable
			const oscillator1 = audioContext.createOscillator();
			const oscillator2 = audioContext.createOscillator();
			const gainNode = audioContext.createGain();

			oscillator1.connect(gainNode);
			oscillator2.connect(gainNode);
			gainNode.connect(audioContext.destination);

			// Gentle harmonic interval (perfect fifth)
			oscillator1.frequency.setValueAtTime(440, audioContext.currentTime); // A4
			oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5

			// Soft, non-intrusive envelope
			gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
			gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.3);
			gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.2);

			oscillator1.start(audioContext.currentTime);
			oscillator2.start(audioContext.currentTime);
			oscillator1.stop(audioContext.currentTime + 1.2);
			oscillator2.stop(audioContext.currentTime + 1.2);
			break;
		}
	}
}

export async function createTask(taskData: typeof tasks.$inferInsert) {
	if (taskData.email) {
		const response = await fetch('/edit', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(taskData)
		});

		if (!response.ok) {
			throw new Error('Failed to create task');
		}

		tasker.tasks = [...tasker.tasks, await response.json()];
	} else {
		// If no email is provided, add to localStorage
		tasker.tasks = [
			...tasker.tasks,
			{
				...taskData,
				status: TaskStatus.Pending,
				id: Date.now()
			} as Task
		];
		saveTasksLocally();
	}
}

export async function updateTask(taskData: Task) {
	const taskIndex = tasker.tasks.findIndex((t) => t.id === taskData.id);
	if (taskIndex === -1) return;
	tasker.tasks[taskIndex] = { ...taskData };

	if (taskData.email) {
		await fetch('/edit', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(taskData)
		});
	} else saveTasksLocally();
}

export async function deleteTask(task: Task) {
	tasker.tasks = tasker.tasks.filter((t) => t.id !== task.id);
	if (task.email) {
		await fetch('/edit', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ id: task.id })
		});
	} else saveTasksLocally();
}

function saveTasksLocally() {
	localStorage.setItem('tasks', JSON.stringify(tasker.tasks));
}
