import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

/** A 256 bit key derived from the server secret, one per purpose so keys are never shared. */
function deriveKey(secret: string, purpose: string) {
	return Buffer.from(hkdfSync('sha256', secret, 'adhd-tasker', purpose, 32));
}

/** AES-256-GCM. The result is `v1.iv.tag.ciphertext`, all base64url, safe to keep in a text column. */
export function encrypt(plain: string, secret: string, purpose = 'secret') {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [PREFIX, iv, cipher.getAuthTag(), data]
		.map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
		.join('.');
}

/** Returns undefined for anything that was not produced by `encrypt` with this secret (also old plain text values). */
export function decrypt(stored: string | null | undefined, secret: string, purpose = 'secret') {
	const [prefix, iv, tag, data] = stored?.split('.') ?? [];
	if (prefix !== PREFIX || !iv || !tag || !data) return;
	try {
		const decipher = createDecipheriv(
			'aes-256-gcm',
			deriveKey(secret, purpose),
			Buffer.from(iv, 'base64url')
		);
		decipher.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(data, 'base64url')),
			decipher.final()
		]).toString('utf8');
	} catch {
		return;
	}
}
