import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderToken } from '@/lib/provider-tokens';
import { safeJson } from '@/lib/http';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { accessToken } = await getProviderToken(user.id, 'meta');
    const url = new URL(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v23.0'}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token');
    url.searchParams.set('access_token', accessToken);
    const data = await safeJson(await fetch(url, { cache: 'no-store' }));
    return NextResponse.json({ pages: (data.data || []).map((p: any) => ({ id: p.id, name: p.name })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load Meta Pages' }, { status: 400 });
  }
}
