
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderToken } from '@/lib/provider-tokens';
import { safeJson } from '@/lib/http';

const GRAPH_VERSION = process.env.META_API_VERSION || 'v23.0';

type MetaPage = {
  id: string;
  access_token?: string;
};

type MetaForm = {
  id: string;
  name?: string;
};

type MetaLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{
    name: string;
    values: string[];
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in again.' },
      { status: 401 },
    );
  }

  const { formId } = await params;
  const pageId = request.nextUrl.searchParams.get('pageId');

  if (
    !pageId ||
    !formId ||
    !/^\d+$/.test(pageId) ||
    !/^\d+$/.test(formId)
  ) {
    return NextResponse.json(
      { error: 'A valid Facebook Page ID and Lead Form ID are required.' },
      { status: 400 },
    );
  }

  try {
    // Retrieve the connected user's Meta access token.
    const { accessToken } = await getProviderToken(user.id, 'meta');

    // Get the Pages accessible to the connected Meta account.
    const pagesUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`,
    );

    pagesUrl.searchParams.set('fields', 'id,name,access_token');
    pagesUrl.searchParams.set('limit', '100');
    pagesUrl.searchParams.set('access_token', accessToken);

    const pagesResponse = await fetch(pagesUrl, {
      cache: 'no-store',
    });

    const pagesResult = await safeJson(pagesResponse);

    const pages: MetaPage[] = pagesResult.data ?? [];

    // Ensure the requested Page belongs to the connected account.
    const selectedPage = pages.find((item) => item.id === pageId);

    if (!selectedPage?.access_token) {
      return NextResponse.json(
        {
          error:
            'Could not obtain the Page access token. Check Meta Page access and permissions, then reconnect Meta.',
        },
        { status: 403 },
      );
    }

    // Verify that the Lead Form belongs to the selected Page.
    const formsUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms`,
    );

    formsUrl.searchParams.set('fields', 'id,name');
    formsUrl.searchParams.set('limit', '100');
    formsUrl.searchParams.set(
      'access_token',
      selectedPage.access_token,
    );

    const formsResponse = await fetch(formsUrl, {
      cache: 'no-store',
    });

    const formsResult = await safeJson(formsResponse);
    const forms: MetaForm[] = formsResult.data ?? [];

    const selectedForm = forms.find((item) => item.id === formId);

    if (!selectedForm) {
      return NextResponse.json(
        {
          error:
            'The selected Lead Form was not found under this Page or is not accessible.',
        },
        { status: 403 },
      );
    }

    // Retrieve up to five real leads using the Page access token.
    const leadsUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${formId}/leads`,
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

    const leadsResponse = await fetch(leadsUrl, {
      cache: 'no-store',
    });

    const leadsResult = await safeJson(leadsResponse);

    const leads: MetaLead[] = (leadsResult.data ?? []).slice(0, 5);

    return NextResponse.json(
      {
        success: true,
        pageId,
        formId,
        formName: selectedForm.name ?? '',
        count: leads.length,
        leads,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to test the Meta connection.',
      },
      { status: 400 },
    );
  }
}
