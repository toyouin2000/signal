# SignalBridge

A fresh Next.js + TypeScript application scaffold for the SignalBridge integration product. Supabase is used for Auth and PostgreSQL. The UI preserves the two intended flows:

1. **Meta Lead Ads → HubSpot CRM**: Meta OAuth → page/form configuration → map Meta form fields to HubSpot properties → test and activate.
2. **HubSpot CRM → Meta CRM CAPI**: HubSpot OAuth → choose Contacts/Deals → instance name → Webhook or API/Polling → map fields in the HubSpot source step → enter Meta Dataset ID and Auth Token → validate and test.

## Important implementation status

This repository is a secure integration foundation, not yet a production-complete connector. It includes Supabase authentication, database schema/RLS, OAuth authorization-code exchanges, encrypted access-token storage, Meta webhook signature verification, an event queue table, a protected worker endpoint, integration persistence, logs, and Meta dataset credential validation.

A manual **Sync now** route is included for a first real API pass: it imports up to 25 recent leads from the selected Meta form into HubSpot (email-based upsert) or sends up to 25 HubSpot records to the configured Meta dataset. It writes per-record results to the sync log. This is a bounded manual sync, not a complete production event pipeline. Before production, implement and test:
- Meta Lead Ads Graph API page/form discovery, lead retrieval, and HubSpot contact upsert/deduplication.
- HubSpot refresh-token lifecycle and webhook subscription registration/signature verification; polling worker for changed contacts/deals.
- HubSpot property schema discovery and source-side field mapping.
- Meta CRM CAPI payload construction, hashing/normalization where required, event IDs/idempotency, and real test-event delivery.
- Retry/backoff, dead-letter handling, job locking/claiming, per-tenant rate limits, and integration activation validation.
- OAuth scopes/app review, token expiry/revocation handling, security review, tests, monitoring, and deployment configuration.

## Requirements

- Node.js 20+
- A Supabase project
- A Meta developer app configured for OAuth and Lead Ads permissions
- A HubSpot developer app with CRM scopes

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in Supabase project URL, anon key and service-role key. In Supabase SQL Editor, run `supabase/migrations/0001_initial.sql`.

Generate a 32-byte token encryption key:

```bash
openssl rand -base64 32
```

Put the output in `TOKEN_ENCRYPTION_KEY`. Set `NEXT_PUBLIC_APP_URL` to the origin where this app is running.

Configure exact OAuth callback URLs in the Meta and HubSpot developer dashboards:
- `http://localhost:3000/api/oauth/meta/callback`
- `http://localhost:3000/api/oauth/hubspot/callback`

Set `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, and `HUBSPOT_OAUTH_REDIRECT_URI`.

Then run:

```bash
npm run dev
```

Open http://localhost:3000. Create an account using the sign-up option. If Supabase email confirmation is enabled, confirm the email before signing in.

## Environment and security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, provider client secrets, access tokens, or `TOKEN_ENCRYPTION_KEY` to the browser.
- `provider_connections.access_token_encrypted` is encrypted using AES-256-GCM at the application layer.
- The HubSpot refresh token is currently carried in metadata by the callback; before production, encrypt refresh tokens separately and implement rotation.
- For production, use a durable job runner (e.g. Supabase Queues/pgmq or a managed worker) instead of relying on a manually triggered route. Protect `/api/jobs/run` with `Authorization: Bearer $JOB_SECRET`.
- Configure the Meta webhook callback URL as `/api/meta/webhook` and set `META_WEBHOOK_VERIFY_TOKEN`. Meta signature validation uses `META_APP_SECRET`.
- Supabase RLS protects user-owned integration rows. Service-role operations must remain server-only and explicitly check tenant ownership.

## API routes

- `GET /api/oauth/meta/start` and `/api/oauth/meta/callback`
- `GET /api/oauth/hubspot/start` and `/api/oauth/hubspot/callback`
- `POST /api/integrations` / `GET /api/integrations`
- `POST /api/integrations/[id]/sync` (manual sync, up to 25 records)\n- `POST /api/integrations/[id]/activate`\n- `GET /api/meta/pages` and `GET /api/meta/pages/[pageId]/forms`\n- `GET /api/hubspot/properties` and `POST /api/hubspot/test`\n- `POST /api/meta/validate-dataset`
- `GET|POST /api/meta/webhook`
- `POST /api/jobs/run` (requires job secret)
