
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from('provider_connections')
    .select('provider,status')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json(
      { error: 'Could not check provider connections.' },
      { status: 500 }
    );
  }

  const connections = {
    meta: false,
    hubspot: false,
  };

  for (const connection of data ?? []) {
    if (
      connection.provider === 'meta' &&
      connection.status === 'connected'
    ) {
      connections.meta = true;
    }

    if (
      connection.provider === 'hubspot' &&
      connection.status === 'connected'
    ) {
      connections.hubspot = true;
    }
  }

  return NextResponse.json({ connections });
}
