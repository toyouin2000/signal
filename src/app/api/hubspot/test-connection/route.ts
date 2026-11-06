
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
      { error: 'Please sign in to connect HubSpot.' },
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
            'HubSpot rejected the token. Check the token and its CRM permissions.',
        },
        { status: response.status },
      );
    }

    // Save the connection so the app can recognize HubSpot as connected.
    await saveProviderConnection(user.id, 'hubspot', token, {
      auth_type: 'private_app',
    });

    return NextResponse.json(
      {
        connected: true,
        message: 'HubSpot connected successfully.',
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
            : 'HubSpot connection failed.',
      },
      { status: 500 },
    );
  }
}
