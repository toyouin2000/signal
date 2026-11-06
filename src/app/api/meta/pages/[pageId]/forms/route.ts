
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderToken } from '@/lib/provider-tokens';
import { safeJson } from '@/lib/http';

const GRAPH_VERSION = process.env.META_API_VERSION || 'v23.0';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pageId } = await params;

  if (!pageId || !/^\d+$/.test(pageId)) {
    return NextResponse.json(
      { error: 'Invalid Facebook Page ID.' },
      { status: 400 },
    );
  }

  try {
    const { accessToken } = await getProviderToken(user.id, 'meta');

    // Retrieve the Page access token using the connected user's token.
    const pagesUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`,
    );
    pagesUrl.searchParams.set('fields', 'id,name,access_token');
    pagesUrl.searchParams.set('limit', '100');
    pagesUrl.searchParams.set('access_token', accessToken);

    const pagesResult = await safeJson(
      await fetch(pagesUrl, { cache: 'no-store' }),
    );

    const selectedPage = (pagesResult.data ?? []).find(
      (page: { id: string; name: string; access_token?: string }) =>
        page.id === pageId,
    );

    if (!selectedPage?.access_token) {
      return NextResponse.json(
        {
          error:
            'Could not obtain a Page access token. Reconnect Meta and verify Page access and permissions.',
        },
        { status: 403 },
      );
    }

    // Fetch Lead Forms using the Page access token, not the user token.
    const formsUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms`,
    );
    formsUrl.searchParams.set('fields', 'id,name,status');
    formsUrl.searchParams.set('limit', '100');
    formsUrl.searchParams.set('access_token', selectedPage.access_token);

    const formsResult = await safeJson(
      await fetch(formsUrl, { cache: 'no-store' }),
    );

    return NextResponse.json(
      {
        forms: (formsResult.data ?? []).map(
          (form: { id: string; name: string; status?: string }) => ({
            id: form.id,
            name: form.name,
            status: form.status ?? 'UNKNOWN',
          }),
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not load Meta Lead Forms.',
      },
      { status: 400 },
    );
  }
}
