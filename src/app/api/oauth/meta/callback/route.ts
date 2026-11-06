import { NextRequest, NextResponse } from 'next/server';
import { verifyOAuthState } from '@/lib/oauth-state';
import { safeJson, appUrl } from '@/lib/http';
import { saveProviderConnection } from '@/lib/integrations';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error_description');
  if (error) return NextResponse.redirect(appUrl('/?oauthError='+encodeURIComponent(error)));
  const userId = state ? verifyOAuthState(state, 'meta') : null;
  if (!code || !userId) return NextResponse.redirect(appUrl('/?oauthError=Invalid%20Meta%20OAuth%20state'));
  try {
    const url = new URL(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v23.0'}/oauth/access_token`);
    url.searchParams.set('client_id', process.env.META_APP_ID!); url.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    url.searchParams.set('redirect_uri', process.env.META_OAUTH_REDIRECT_URI!); url.searchParams.set('code', code);
    const token = await safeJson(await fetch(url, {cache:'no-store'}));
    await saveProviderConnection(userId,'meta',token.access_token,{expires_in:token.expires_in,token_type:token.token_type});
    return NextResponse.redirect(appUrl('/?connected=meta'));
  } catch (e) { return NextResponse.redirect(appUrl('/?oauthError='+encodeURIComponent(e instanceof Error?e.message:'Meta OAuth failed'))); }
}
