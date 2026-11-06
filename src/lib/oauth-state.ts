import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TOKEN_ENCRYPTION_KEY || 'development-only-change-me';
export function makeOAuthState(userId: string, provider: string) {
  const nonce = randomBytes(18).toString('hex');
  const payload = `${userId}:${provider}:${nonce}:${Date.now()}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}
export function verifyOAuthState(state: string, provider: string) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    const sig = parts.pop()!;
    const payload = parts.join(':');
    const expected = createHmac('sha256', secret()).update(payload).digest('hex');
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const [userId, gotProvider, , timestamp] = parts;
    if (gotProvider !== provider || Date.now() - Number(timestamp) > 10 * 60 * 1000) return null;
    return userId;
  } catch { return null; }
}
