import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/crypto';

export async function getProviderToken(userId: string, provider: 'meta'|'hubspot') {
  const { data, error } = await supabaseAdmin.from('provider_connections')
    .select('access_token_encrypted,status,metadata')
    .eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'connected') throw new Error(`${provider} account is not connected`);
  return { accessToken: decryptSecret(data.access_token_encrypted), metadata: data.metadata || {} };
}

export async function getIntegrationToken(integrationId: string, userId: string) {
  const { data, error } = await supabaseAdmin.from('integrations')
    .select('destination_token_encrypted')
    .eq('id', integrationId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data?.destination_token_encrypted) throw new Error('Destination auth token is not configured');
  return decryptSecret(data.destination_token_encrypted);
}
