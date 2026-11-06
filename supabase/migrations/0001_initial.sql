create extension if not exists pgcrypto;

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta','hubspot')),
  access_token_encrypted text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider)
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  flow text not null check (flow in ('meta_leads','hubspot_capi')),
  source_config jsonb not null default '{}'::jsonb,
  destination_config jsonb not null default '{}'::jsonb,
  destination_token_encrypted text,
  field_mapping jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused','error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integrations(id) on delete cascade,
  provider text not null,
  event_type text not null,
  external_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','needs_configuration')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_event_id)
);

create index if not exists integrations_user_idx on public.integrations(user_id,updated_at desc);
create index if not exists sync_jobs_queue_idx on public.sync_jobs(status,next_attempt_at,created_at);
create index if not exists sync_jobs_integration_idx on public.sync_jobs(integration_id,created_at desc);

alter table public.provider_connections enable row level security;
alter table public.integrations enable row level security;
alter table public.sync_jobs enable row level security;

create policy "Users can read their own provider connections"
on public.provider_connections for select to authenticated using (auth.uid() = user_id);
-- No browser access to encrypted provider credentials. Writes happen only through server routes.

create policy "Users can read their own integrations"
on public.integrations for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own integrations"
on public.integrations for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own integrations"
on public.integrations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own integrations"
on public.integrations for delete to authenticated using (auth.uid() = user_id);

create policy "Users can read jobs for their integrations"
on public.sync_jobs for select to authenticated using (
  exists(select 1 from public.integrations i where i.id = integration_id and i.user_id = auth.uid())
);
