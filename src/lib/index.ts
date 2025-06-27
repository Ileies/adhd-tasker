import { browser } from '$app/environment';

export function playSound(type: 'task-created' | 'task-started' | 'task-completed' | 'reminder') {
	if (!browser) return;

	// Simple beep sounds using Web Audio API
	const audioContext = new AudioContext();
	const oscillator = audioContext.createOscillator();
	const gainNode = audioContext.createGain();

	oscillator.connect(gainNode);
	gainNode.connect(audioContext.destination);

	switch (type) {
		case 'task-created':
			oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
			break;
		case 'task-started':
			oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
			break;
		case 'task-completed':
			oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime); // G5
			break;
		case 'reminder':
			oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
			break;
	}

	gainNode.gain.setValueAtTime(0, audioContext.currentTime);
	gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01);
	gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);

	oscillator.start(audioContext.currentTime);
	oscillator.stop(audioContext.currentTime + 0.3);
}
