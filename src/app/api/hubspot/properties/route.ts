import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderToken } from '@/lib/provider-tokens';
import { safeJson } from '@/lib/http';

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const objectType = request.nextUrl.searchParams.get('object') === 'deals' ? 'deals' : 'contacts';
  try {
    const { accessToken } = await getProviderToken(user.id, 'hubspot');
    const data = await safeJson(await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store'
    }));
    return NextResponse.json({ properties: (data.results || []).map((p: any) => ({ name: p.name, label: p.label, type: p.type })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load HubSpot properties' }, { status: 400 });
  }
}
