
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderToken } from '@/lib/provider-tokens';
import { safeJson } from '@/lib/http';

const VERSION = process.env.META_API_VERSION || 'v23.0';

type MetaPage = {
  id: string;
  access_token?: string;
};

type MetaLead = {
  id: string;
  created_time?: string;
  field_data?: {
    name: string;
    values: string[];
  }[];
};

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const pageId = request.nextUrl.searchParams.get('pageId');
  const formId = request.nextUrl.pathname
    .split('/')
    .filter(Boolean)
    .at(-2);

  if (
    !pageId ||
    !/^\d+$/.test(pageId) ||
    !formId ||
    !/^\d+$/.test(formId)
  ) {
    return NextResponse.json(
      { error: 'A valid Page ID and Lead Form ID are required.' },
      { status: 400 },
    );
  }

  try {
    const { accessToken } = await getProviderToken(user.id, 'meta');

    // Resolve the selected Page's access token.
    const pagesUrl = new URL(
      `https://graph.facebook.com/${VERSION}/me/accounts`,
    );
    pagesUrl.searchParams.set('fields', 'id,access_token');
    pagesUrl.searchParams.set('limit', '100');
    pagesUrl.searchParams.set('access_token', accessToken);

    const pagesResult = await safeJson(
      await fetch(pagesUrl, { cache: 'no-store' }),
    );

    const pages: MetaPage[] = pagesResult.data ?? [];
    const selectedPage = pages.find((p) => p.id === pageId);

    if (!selectedPage?.access_token) {
      return NextResponse.json(
        {
          error:
            'Could not obtain the Page access token. Check Page access and Meta permissions.',
        },
        { status: 403 },
      );
    }

    // Verify that the selected form belongs to the selected Page.
    const formsUrl = new URL(
      `https://graph.facebook.com/${VERSION}/${pageId}/leadgen_forms`,
    );
    formsUrl.searchParams.set('fields', 'id,name');
    formsUrl.searchParams.set('limit', '100');
    formsUrl.searchParams.set(
      'access_token',
      selectedPage.access_token,
    );

    const formsResult = await safeJson(
      await fetch(formsUrl, { cache: 'no-store' }),
    );

    const formExists = (formsResult.data ?? []).some(
      (form: { id: string }) => form.id === formId,
    );

    if (!formExists) {
      return NextResponse.json(
        {
          error:
            'The selected form does not belong to this Page or is not accessible.',
        },
        { status: 403 },
      );
    }

    // Fetch up to five real leads using the Page access token.
    const leadsUrl = new URL(
      `https://graph.facebook.com/${VERSION}/${formId}/leads`,
    );
    leadsUrl.searchParams.set(
      'fields',
      'id,created_time,field_data',
    );
    leadsUrl.searchParams.set('limit', '5');
    leadsUrl.searchParams.set(
      'access_token',
      selectedPage.access_token,
    );

    const leadsResult = await safeJson(
      await fetch(leadsUrl, { cache: 'no-store' }),
    );

    const leads: MetaLead[] = (leadsResult.data ?? []).slice(0, 5);

    return NextResponse.json(
      { success: true, count: leads.length, leads },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Meta connection test failed.',
      },
      { status: 400 },
    );
  }
}
