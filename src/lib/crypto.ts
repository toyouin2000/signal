import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes');
  return decoded;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString('base64url')).join('.');
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
