import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/crypto';

export async function saveProviderConnection(userId: string, provider: 'meta' | 'hubspot', accessToken: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from('provider_connections').upsert({
    user_id: userId,
    provider,
    access_token_encrypted: encryptSecret(accessToken),
    metadata,
    status: 'connected',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,provider' });
  if (error) throw error;
}
