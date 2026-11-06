
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { saveProviderConnection } from '@/lib/integrations';

export async function GET() {
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

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        error:
          'HubSpot Private App token is missing. Set HUBSPOT_PRIVATE_APP_TOKEN in .env.local.',
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts?limit=1&properties=email,firstname,lastname',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          connected: false,
          error:
            result.message ||
            'HubSpot rejected the token. Check that the token is valid and has the required CRM scopes.',
        },
        { status: response.status },
      );
    }

    // Save the connection using the existing provider-connection helper.
    // This lets the existing OAuth status endpoint recognize HubSpot.
    await saveProviderConnection(user.id, 'hubspot', token, {
      auth_type: 'private_app',
    });

    return NextResponse.json(
      {
        connected: true,
        message: 'HubSpot connected successfully.',
        sampleCount: result.results?.length ?? 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not connect to HubSpot.',
      },
      { status: 500 },
    );
  }
}
