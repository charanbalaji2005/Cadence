import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * AES-256-GCM for secrets saved from the admin panel (integration API keys).
 * The key comes from INTEGRATION_ENCRYPTION_KEY; without it nothing can be sealed,
 * so a secret is never written to the database in plain text.
 */
const keyFrom = secret => crypto.createHash('sha256').update(String(secret)).digest();

export const canSeal = (secret = config.integrationKey) => !!secret && String(secret).length >= 16;

export function seal(plain, secret = config.integrationKey) {
  if (!canSeal(secret)) throw Object.assign(new Error('Set INTEGRATION_ENCRYPTION_KEY (16+ characters) on the server before saving secrets here.'), { status: 400 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

/** Returns the secret, or '' if it can't be opened (wrong or missing key, tampered value). */
export function open(sealed, secret = config.integrationKey) {
  if (!sealed || !canSeal(secret)) return '';
  try {
    const [v, iv, tag, body] = String(sealed).split(':');
    if (v !== 'v1') return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

/** "••••1a2b" for display. Short secrets show nothing of themselves. */
export const hint = s => (s && s.length >= 12 ? `••••${s.slice(-4)}` : s ? '••••' : '');
