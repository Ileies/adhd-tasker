import { tasker } from '#lib/app.svelte.js';
import { audioContext } from '#lib/audio.js';
import { openSoundsDb, readSounds, removeSound, saveSound } from '#lib/local/sounds.js';
import {
	checkSoundFile,
	checkSoundLength,
	shortFileName,
	type SoundSlot,
	type StoredSound
} from '#lib/sounds.js';

/** The decoded audio of each replaced sound. Not state: `tasker.sounds` carries what the screen shows. */
const buffers = new Map<SoundSlot, AudioBuffer>();

let database: ReturnType<typeof openSoundsDb> | null = null;
const db = () => (database ??= openSoundsDb());

/** The user's own sound for a slot, or undefined when the built-in one plays. */
export const customBuffer = (slot: SoundSlot) => buffers.get(slot);

/** Reads the replaced sounds from the device. A sound that no longer decodes is skipped, the built-in one plays instead. */
export async function loadCustomSounds(): Promise<void> {
	try {
		const stored = await readSounds(await db());
		const names: typeof tasker.sounds = {};
		for (const sound of stored) {
			try {
				buffers.set(sound.slot, await audioContext().decodeAudioData(sound.data.slice(0)));
				names[sound.slot] = sound.name;
			} catch {
				buffers.delete(sound.slot);
			}
		}
		tasker.sounds = names;
	} catch {
		// A browser that blocks storage keeps the built-in sounds
	}
}

/** Replaces a slot with a picked file. Returns why it was refused, or null when it is saved. */
export async function setCustomSound(slot: SoundSlot, file: File): Promise<string | null> {
	const refused = checkSoundFile(file, slot);
	if (refused) return refused;

	const data = await file.arrayBuffer();
	let buffer: AudioBuffer;
	try {
		buffer = await audioContext().decodeAudioData(data.slice(0));
	} catch {
		return 'That file could not be read as audio.';
	}
	const tooLong = checkSoundLength(buffer.duration, slot);
	if (tooLong) return tooLong;

	const name = shortFileName(file.name);
	const sound: StoredSound = { slot, name, data };
	try {
		await saveSound(await db(), sound);
	} catch {
		return 'This browser would not keep the sound on this device.';
	}
	buffers.set(slot, buffer);
	tasker.sounds = { ...tasker.sounds, [slot]: name };
	return null;
}

/** Goes back to the built-in sound for a slot. */
export async function clearCustomSound(slot: SoundSlot): Promise<void> {
	buffers.delete(slot);
	const { [slot]: _gone, ...rest } = tasker.sounds;
	tasker.sounds = rest;
	try {
		await removeSound(await db(), slot);
	} catch {
		// Nothing stored that could be removed
	}
}
