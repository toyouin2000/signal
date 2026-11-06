import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const { id } = await params;
  const supabaseAdmin = createAdminClient();

  const { data: integration, error: fetchError } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !integration) {
    return NextResponse.json(
      { error: 'Integration not found.' },
      { status: 404 },
    );
  }

  const { data: connections, error: connectionError } =
    await supabaseAdmin
      .from('provider_connections')
      .select('provider,status')
      .eq('user_id', user.id);

  if (connectionError) {
    return NextResponse.json(
      { error: 'Could not verify provider connections.' },
      { status: 500 },
    );
  }

  const connected = new Set(
    (connections ?? [])
      .filter((connection) => connection.status === 'connected')
      .map((connection) => connection.provider),
  );

  if (
    integration.flow === 'meta_leads' &&
    (!connected.has('meta') || !connected.has('hubspot'))
  ) {
    return NextResponse.json(
      {
        error:
          'Connect both Meta and HubSpot before activating this integration.',
      },
      { status: 400 },
    );
  }

  if (
    integration.flow === 'meta_leads' &&
    (
      !integration.source_config?.page ||
      !integration.source_config?.form ||
      !(integration.field_mapping || []).some(
        (mapping: { source: string; target: string }) =>
          mapping.source === 'email' &&
          mapping.target === 'email',
      )
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Select a Meta Page and Lead Form, and map email to HubSpot email before activating.',
      },
      { status: 400 },
    );
  }

  if (
    integration.flow === 'hubspot_capi' &&
    (
      !connected.has('hubspot') ||
      !integration.destination_config?.datasetId ||
      !integration.destination_token_encrypted
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Connect HubSpot and validate Meta Dataset ID/Auth Token before activating.',
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('integrations')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,status')
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        error: error?.message || 'Could not activate integration.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    integration: data,
  });
}
