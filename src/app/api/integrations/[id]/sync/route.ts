import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/crypto';
import { safeJson } from '@/lib/http';

function sha256(value: string) { return createHash('sha256').update(value.trim().toLowerCase()).digest('hex'); }
function normalizePhone(value: string) { return value.replace(/[^\d]/g, ''); }

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data: integration, error } = await supabaseAdmin.from('integrations').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error || !integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });

  const { data: connections } = await supabaseAdmin.from('provider_connections').select('provider,access_token_encrypted,status,metadata').eq('user_id', user.id);
  const byProvider = new Map((connections || []).map((c: any) => [c.provider, c]));
  const meta = byProvider.get('meta') as any;
  const hubspot = byProvider.get('hubspot') as any;
  const apiVersion = process.env.META_API_VERSION || 'v23.0';

  try {
    if (integration.flow === 'meta_leads') {
      if (!meta || meta.status !== 'connected' || !hubspot || hubspot.status !== 'connected') {
        throw new Error('Connect both Meta and HubSpot before running a sync.');
      }
      const { page, form } = integration.source_config || {};
      if (!page || !form) throw new Error('Select and save a Facebook Page and Lead Form first.');
      const metaToken = decryptSecret(meta.access_token_encrypted);
      const hubspotToken = decryptSecret(hubspot.access_token_encrypted);
      const leadUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(form)}/leads`);
      leadUrl.searchParams.set('fields', 'id,created_time,field_data,ad_id,form_id');
      leadUrl.searchParams.set('limit', '25');
      leadUrl.searchParams.set('access_token', metaToken);
      const leadResponse = await safeJson(await fetch(leadUrl, { cache: 'no-store' }));
      let synced = 0, skipped = 0;
      for (const lead of (leadResponse.data || [])) {
        const fields: Record<string, string> = {};
        for (const field of (lead.field_data || [])) fields[field.name] = Array.isArray(field.values) ? String(field.values[0] ?? '') : '';
        const properties: Record<string, string> = {};
        for (const map of (integration.field_mapping || [])) {
          const value = fields[map.source];
          if (value !== undefined && value !== '') properties[map.target] = value;
        }
        if (!properties.email) { skipped++; continue; }
        const search = await safeJson(await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST', headers: { Authorization: `Bearer ${hubspotToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: properties.email }] }], properties: ['email'], limit: 1 })
        }));
        if (search.results?.[0]?.id) {
          await safeJson(await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${search.results[0].id}`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${hubspotToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ properties })
          }));
        } else {
          await safeJson(await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST', headers: { Authorization: `Bearer ${hubspotToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ properties })
          }));
        }
        const { error: jobError } = await supabaseAdmin.from('sync_jobs').upsert({
          integration_id: integration.id, provider: 'meta', event_type: 'lead_import',
          external_event_id: `meta-lead:${lead.id}`, payload: { leadId: lead.id, formId: form },
          status: 'succeeded', attempts: 1, updated_at: new Date().toISOString()
        }, { onConflict: 'provider,external_event_id' });
        if (jobError) console.error('Could not write sync log', jobError.message);
        synced++;
      }
      await supabaseAdmin.from('integrations').update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', integration.id);
      return NextResponse.json({ ok: true, synced, skipped, message: 'Fetched the latest 25 leads from the selected Meta Lead Form and upserted matching HubSpot contacts.' });
    }

    if (!hubspot || hubspot.status !== 'connected') throw new Error('Connect HubSpot before running a sync.');
    if (!integration.destination_config?.datasetId || !integration.destination_token_encrypted) throw new Error('Save a Meta Dataset ID and Auth Token first.');
    const hubspotToken = decryptSecret(hubspot.access_token_encrypted);
    const metaToken = decryptSecret(integration.destination_token_encrypted);
    const objectType = integration.source_config?.module === 'deals' ? 'deals' : 'contacts';
    const props = objectType === 'contacts'
      ? ['email','phone','firstname','lastname','hs_lead_status','lifecyclestage','lastmodifieddate']
      : ['dealname','dealstage','pipeline','hs_lastmodifieddate','hubspot_owner_id'];
    const data = await safeJson(await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}?limit=25&properties=${encodeURIComponent(props.join(','))}&archived=false`, {
      headers: { Authorization: `Bearer ${hubspotToken}` }, cache: 'no-store'
    }));
    let sent = 0, skipped = 0;
    for (const record of data.results || []) {
      const p = record.properties || {};
      const email = p.email;
      const phone = p.phone;
      if (!email && !phone) { skipped++; continue; }
      const modified = p.lastmodifieddate || p.hs_lastmodifieddate || record.updatedAt || new Date().toISOString();
      const eventName = (p.hs_lead_status || p.lifecyclestage || p.dealstage || 'Lead').toString().replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,40) || 'Lead';
      const userData: Record<string, unknown> = { external_id: [sha256(String(record.id))] };
      if (email) userData.em = [sha256(String(email))];
      if (phone) userData.ph = [sha256(normalizePhone(String(phone)))];
      const event = {
        event_name: eventName,
        event_time: Math.floor(new Date(modified).getTime() / 1000) || Math.floor(Date.now() / 1000),
        action_source: 'system_generated',
        user_data: userData,
        event_id: `${integration.id}:${record.id}:${modified}`,
        custom_data: { lead_event_source: 'HubSpot CRM', status: p.hs_lead_status || p.lifecyclestage || p.dealstage || 'unknown' }
      };
      const endpoint = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(integration.destination_config.datasetId)}/events`);
      endpoint.searchParams.set('access_token', metaToken);
      await safeJson(await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: [event] })
      }));
      const { error: jobError } = await supabaseAdmin.from('sync_jobs').upsert({
        integration_id: integration.id, provider: 'meta', event_type: 'crm_conversion',
        external_event_id: `hubspot:${objectType}:${record.id}:${modified}`,
        payload: { recordId: record.id, objectType, eventName }, status: 'succeeded',
        attempts: 1, updated_at: new Date().toISOString()
      }, { onConflict: 'provider,external_event_id' });
      if (jobError) console.error('Could not write sync log', jobError.message);
      sent++;
    }
    await supabaseAdmin.from('integrations').update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', integration.id);
    return NextResponse.json({ ok: true, sent, skipped, message: 'Processed the latest 25 HubSpot records. Configure lifecycle/event mappings carefully before production use.' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    await supabaseAdmin.from('sync_jobs').insert({
      integration_id: integration.id, provider: 'signalbridge', event_type: 'manual_sync',
      external_event_id: `sync-error:${integration.id}:${Date.now()}`,
      payload: { flow: integration.flow }, status: 'failed', attempts: 1, last_error: message
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
