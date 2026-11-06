
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { makeOAuthState } from '@/lib/oauth-state';
import { appUrl } from '@/lib/http';

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(appUrl('/login'));
  }

  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  const configId = process.env.META_LOGIN_CONFIG_ID;
  const version = process.env.META_API_VERSION || 'v23.0';

  if (!appId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          'Meta OAuth is not configured. Set META_APP_ID and META_OAUTH_REDIRECT_URI.',
      },
      { status: 503 },
    );
  }

  const state = makeOAuthState(user.id, 'meta');

  const url = new URL(
    `https://www.facebook.com/${version}/dialog/oauth`,
  );

  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');

  if (configId) {
    // Facebook Login for Business.
    // Permissions are configured in the selected Meta login configuration.
    url.searchParams.set('config_id', configId);
    url.searchParams.set('override_default_response_type', 'true');
  } else {
    // Basic login fallback for diagnosing OAuth.
    // This does not grant Lead Ads or Facebook Page access.
    url.searchParams.set('scope', 'public_profile');
  }

  return NextResponse.redirect(url);
}
