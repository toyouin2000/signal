'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Facebook,
  Database,
  Plus,
} from 'lucide-react';

type Mapping = {
  source: string;
  target: string;
};

type MetaPage = {
  id: string;
  name: string;
};

type MetaForm = {
  id: string;
  name: string;
  status?: string;
};

type MetaSampleLead = {
  id: string;
  created_time?: string;
  field_data?: { name: string; values: string[] }[];
};

type HubSpotProperty = {
  name: string;
  label?: string;
  type?: string;
};

const metaFields = [
  'id',
  'created_time',
  'email',
  'first_name',
  'last_name',
  'phone',
  'company_name',
];

const hubspotFields = [
  'email',
  'firstname',
  'lastname',
  'phone',
  'company',
  'lifecyclestage',
  'hs_lead_status',
  'hs_analytics_source',
];

const normalizedFields = [
  'lead_id',
  'email',
  'phone',
  'lead_status',
  'lifecycle_stage',
  'event_time',
  'first_name',
  'last_name',
];

function Wizard() {
  const params = useSearchParams();
  

  const flow =
    params.get('flow') === 'hubspot_capi'
      ? 'hubspot_capi'
      : 'meta_leads';

  const isMeta = flow === 'meta_leads';
  const lastStep = isMeta ? 4 : 3;

  const [connections, setConnections] = useState({
    meta: false,
    hubspot: false,
  });
  const [checkingConnections, setCheckingConnections] = useState(true);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(
    isMeta ? 'Meta Lead Ads to HubSpot' : 'HubSpot CRM to Meta CAPI',
  );

  const [module, setModule] = useState('contacts');
  const [syncMode, setSyncMode] = useState('webhook');

  const [page, setPage] = useState('');
  const [form, setForm] = useState('');
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [forms, setForms] = useState<MetaForm[]>([]);

  const [testingMeta, setTestingMeta] = useState(false);
  const [sampleLeads, setSampleLeads] = useState<MetaSampleLead[]>([]);
  const [testedSelection, setTestedSelection] = useState('');

  const [hubspotProps, setHubspotProps] = useState<HubSpotProperty[]>([]);
  const [dataset, setDataset] = useState('');
  const [token, setToken] = useState('');

  const [mapping, setMapping] = useState<Mapping[]>(
    isMeta
      ? [
          { source: 'email', target: 'email' },
          { source: 'first_name', target: 'firstname' },
          { source: 'last_name', target: 'lastname' },
        ]
      : [
          { source: 'email', target: 'email' },
          { source: 'hs_lead_status', target: 'lead_status' },
          { source: 'lifecyclestage', target: 'lifecycle_stage' },
        ],
  );

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState('');

  const labels = isMeta
    ? [
        'Connect Meta',
        'Configure Meta',
        'Connect HubSpot',
        'Field mapping',
        'Test & finish',
      ]
    : [
        'Connect HubSpot',
        'HubSpot source & mapping',
        'Meta credentials',
        'Test & finish',
      ];

  const propertyOptions =
    hubspotProps.length > 0
      ? hubspotProps.map((property) => property.name)
      : hubspotFields;

  const isFinalStep = step === lastStep;

  const refreshConnections = useCallback(async () => {
    const response = await fetch('/api/oauth/status', {
      cache: 'no-store',
    });
    const data = await response.json();

    if (!response.ok || !data.connections) {
      throw new Error(
        data.error || 'Could not verify provider connections.',
      );
    }

    const next = {
      meta: Boolean(data.connections.meta),
      hubspot: Boolean(data.connections.hubspot),
    };

    setConnections(next);
    return next;
  }, []);

  const loadPages = useCallback(async () => {
    const response = await fetch('/api/meta/pages', {
      cache: 'no-store',
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not load Meta Pages.');
    }

    setPages(data.pages ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const response = await fetch('/api/oauth/status', {
          cache: 'no-store',
        });
        const data = await response.json();

        if (!response.ok || !data.connections) {
          throw new Error(
            data.error || 'Could not check provider connections.',
          );
        }

        if (!cancelled) {
          setConnections({
            meta: Boolean(data.connections.meta),
            hubspot: Boolean(data.connections.hubspot),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not check provider connections.',
          );
        }
      } finally {
        if (!cancelled) setCheckingConnections(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  // OAuth popup notifications are only a signal.
  // The server's saved connection status is authoritative.
  useEffect(() => {
    async function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (
        event.data?.type !== 'signalbridge-oauth' ||
        event.data?.status !== 'success'
      ) {
        return;
      }

      try {
        const status = await refreshConnections();
        const provider = event.data.provider as 'meta' | 'hubspot';

        if (!status[provider]) {
          setMessage('The server has not confirmed this connection yet.');
          return;
        }

        setMessage(
          `${provider === 'meta' ? 'Meta' : 'HubSpot'} connection verified.`,
        );

        if (provider === 'meta') {
          await loadPages();
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not verify the connection.',
        );
      }
    }

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [loadPages, refreshConnections]);

  // Load Pages and HubSpot properties for the active step.
  useEffect(() => {
    let cancelled = false;

    async function loadProperties(object: string) {
      try {
        const response = await fetch(
          `/api/hubspot/properties?object=${encodeURIComponent(object)}`,
          { cache: 'no-store' },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || 'Could not load HubSpot properties.',
          );
        }

        if (!cancelled) setHubspotProps(data.properties ?? []);
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not load HubSpot properties.',
          );
        }
      }
    }

    if (isMeta && step === 1 && connections.meta) {
      void loadPages().catch((error) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : 'Could not load Pages.',
          );
        }
      });
    }

    if (isMeta && step === 3 && connections.hubspot) {
      void loadProperties('contacts');
    }

    if (!isMeta && step === 1 && connections.hubspot) {
      void loadProperties(module);
    }

    return () => {
      cancelled = true;
    };
  }, [isMeta, step, module, connections.meta, connections.hubspot, loadPages]);

  // Load Lead Forms whenever the selected Page changes.
  useEffect(() => {
    let cancelled = false;

    async function loadForms() {
      try {
        const response = await fetch(
          `/api/meta/pages/${encodeURIComponent(page)}/forms`,
          { cache: 'no-store' },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Could not load Lead Forms.');
        }

        if (!cancelled) setForms(data.forms ?? []);
      } catch (error) {
        if (!cancelled) {
          setForms([]);
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not load Lead Forms.',
          );
        }
      }
    }

    setForms([]);

    if (page && connections.meta) void loadForms();

    return () => {
      cancelled = true;
    };
  }, [page, connections.meta]);
  

async function connectHubSpot() {
  setBusy(true);
  setMessage('');

  try {
    const response = await fetch('/api/hubspot/test-connection', {
      method: 'GET',
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok || !data.connected) {
      throw new Error(
        data.error || 'HubSpot connection failed.',
      );
    }

    // Update the UI only after the server confirms success.
    setConnections((current) => ({
      ...current,
      hubspot: true,
    }));

    setMessage('HubSpot connected successfully.');
  } catch (error) {
    setConnections((current) => ({
      ...current,
      hubspot: false,
    }));

    setMessage(
      error instanceof Error
        ? error.message
        : 'HubSpot connection failed.',
    );
  } finally {
    setBusy(false);
  }
}



  async function connect(provider: 'meta' | 'hubspot') {
    setMessage('');
    setBusy(true);

    const returnTo = window.location.pathname + window.location.search;
    const oauthUrl =
      `/api/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;

    const width = 600;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      oauthUrl,
      `${provider}-oauth`,
      `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      setBusy(false);
      setMessage(
        'The authentication popup was blocked. Allow popups for this site and try again.',
      );
      return;
    }

    popup.focus();

    try {
      // Check server-side status while the OAuth popup is open.
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));

        try {
          const status = await refreshConnections();

          if (status[provider]) {
            if (!popup.closed) popup.close();

            setMessage(
              `${provider === 'meta' ? 'Meta' : 'HubSpot'} connected successfully.`,
            );

            if (provider === 'meta') {
              await loadPages();
            }

            return;
          }
        } catch {
          // Retry temporary status failures while authorization is underway.
        }

        if (popup.closed) break;
      }

      await refreshConnections().catch(() => null);
      setMessage(
        'Connection was not confirmed. Complete authorization in the popup and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function testMetaConnection() {
    if (!page || !form) {
      setMessage('Select a Facebook Page and Lead Form first.');
      return;
    }

    setTestingMeta(true);
    setMessage('');
    setSampleLeads([]);
    setTestedSelection('');

    try {
      const response = await fetch(
        `/api/meta/forms/${encodeURIComponent(form)}/sample-leads?pageId=${encodeURIComponent(page)}`,
        { cache: 'no-store' },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Meta connection test failed.');
      }

      const leads: MetaSampleLead[] = Array.isArray(data.leads)
        ? data.leads.slice(0, 5)
        : [];

      setSampleLeads(leads);
      setTestedSelection(`${page}:${form}`);

      setMessage(
        leads.length
          ? `Connection successful. Loaded ${leads.length} sample lead${leads.length === 1 ? '' : 's'}.`
          : 'Connection successful. No accessible leads are available to preview.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Meta connection test failed.',
      );
    } finally {
      setTestingMeta(false);
    }
  }

  function canContinue() {
    if (checkingConnections || busy || testingMeta) return false;

    if (step === 0) {
      return isMeta ? connections.meta : connections.hubspot;
    }

    if (isMeta && step === 1) {
      return Boolean(
        page &&
          form &&
          testedSelection === `${page}:${form}`,
      );
    }

    if (isMeta && step === 2) return connections.hubspot;

    if (!isMeta && step === 1) return connections.hubspot;

    if (!isMeta && step === 2) {
      return Boolean(dataset.trim() && token.trim());
    }

    return true;
  }

  async function validateMeta(): Promise<boolean> {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/meta/validate-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: dataset,
          accessToken: token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Meta credential validation failed.',
        );
      }

      setMessage(
        `Validated dataset ${
          data.dataset?.name || data.dataset?.id || dataset
        }.`,
      );

      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Validation failed.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage('');

    try {
      if (!name.trim()) throw new Error('Enter an instance name.');

      if (isMeta && (!page || !form)) {
        throw new Error('Select a Facebook Page and Lead Form.');
      }

      if (
        isMeta &&
        testedSelection !== `${page}:${form}`
      ) {
        throw new Error('Test the selected Page and Lead Form before saving.');
      }

      if (!isMeta && (!dataset.trim() || !token.trim())) {
        throw new Error('Enter a Meta Dataset ID and Auth Token.');
      }

      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          flow,
          source: { module, syncMode, page, form },
          destination: { datasetId: dataset.trim() },
          fieldMapping: mapping,
          destinationToken: !isMeta ? token : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not save integration.');
      }

      if (!data.integration?.id) {
        throw new Error('The server did not return an integration ID.');
      }

      setSavedId(data.integration.id);
      setMessage(
        `Configuration saved (${data.integration.id}). The integration is saved as a draft until activation checks pass.`,
      );
      setStep(lastStep);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unexpected error while saving.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!savedId) return;

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(savedId)}/activate`,
        { method: 'POST' },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Activation checks failed.');
      }

      setMessage('Integration activated successfully.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Activation failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  function mappingEditor(
    leftLabel: string,
    leftOptions: string[],
    rightLabel: string,
    rightOptions: string[],
  ) {
    return (
      <>
        <div
          className="mapping"
          style={{ marginTop: 16, marginBottom: 6 }}
        >
          <b className="help">{leftLabel}</b>
          <b className="help">{rightLabel}</b>
        </div>

        {mapping.map((item, index) => (
          <div className="mapping" key={index}>
            <div className="field" style={{ margin: '6px 0' }}>
              <select
                aria-label={`${leftLabel} ${index + 1}`}
                value={item.source}
                onChange={(event) => {
                  const value = event.target.value;

                  setMapping((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, source: value }
                        : entry,
                    ),
                  );
                }}
              >
                {!leftOptions.includes(item.source) && (
                  <option value={item.source}>{item.source}</option>
                )}

                {leftOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ margin: '6px 0' }}>
              <select
                aria-label={`${rightLabel} ${index + 1}`}
                value={item.target}
                onChange={(event) => {
                  const value = event.target.value;

                  setMapping((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, target: value }
                        : entry,
                    ),
                  );
                }}
              >
                {!rightOptions.includes(item.target) && (
                  <option value={item.target}>{item.target}</option>
                )}

                {rightOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setMapping((current) =>
                  current.filter((_, entryIndex) => entryIndex !== index),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn"
          onClick={() =>
            setMapping((current) => [
              ...current,
              {
                source: leftOptions[0] ?? '',
                target: rightOptions[0] ?? '',
              },
            ])
          }
        >
          <Plus size={14} /> Add field
        </button>
      </>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          Signal<span>Bridge</span>
        </Link>

        <nav className="nav">
          <Link href="/">▦ &nbsp; Integrations</Link>
          <Link href="/logs">◷ &nbsp; Logs</Link>
          <Link href="/profile">◉ &nbsp; Profile</Link>
        </nav>

        <div className="sidebar-foot">Integration setup</div>
      </aside>

      <main className="main">
        <div className="wrap wizard">
          <Link
            href="/"
            className="btn"
            style={{ marginBottom: 24 }}
          >
            <ArrowLeft size={15} /> Back
          </Link>

          <div className="eyebrow">Integration setup</div>

          <h1 className="heading">
            {isMeta
              ? 'Meta Lead Ads → HubSpot CRM'
              : 'HubSpot CRM → Meta CAPI'}
          </h1>

          <p className="subheading">
            Configure your source, destination, and sync settings.
          </p>

          <div className="steps">
            {labels.map((label, index) => (
              <div
                key={label}
                className={`step ${index === step ? 'active' : ''}`}
              >
                {index + 1}. {label}
              </div>
            ))}
          </div>

          <section className="card">
            {/* STEP 1: Connect provider */}
            {step === 0 && (
              <>
                <h2 className="card-title">
                  {isMeta
                    ? '1. Connect Meta Lead Ads'
                    : '1. Connect HubSpot CRM'}
                </h2>

                <p className="card-copy">
                  Authorize the{' '}
                  {isMeta
                    ? 'Meta account that owns your Pages and Lead Forms'
                    : 'HubSpot account containing your CRM records'}
                  .
                </p>

                <div
                  className="row"
                  style={{
                    marginTop: 26,
                    padding: '16px 0',
                    borderBottom: '1px solid #edf0f4',
                  }}
                >
                  <div className="integration-head" style={{ margin: 0 }}>
                    <div className="provider-icon">
                      {isMeta ? (
                        <Facebook size={22} />
                      ) : (
                        <Database size={22} />
                      )}
                    </div>

                    <div>
                      <b>{isMeta ? 'Meta' : 'HubSpot'}</b>
                      <div className="help">
                        {isMeta
                          ? 'Access Pages and Lead Forms'
                          : 'Access CRM contacts and deals'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || checkingConnections}
                    onClick={() => connect(isMeta ? 'meta' : 'hubspot')}
                  >
                    {(isMeta ? connections.meta : connections.hubspot)
                      ? 'Connected ✓'
                      : `Connect ${isMeta ? 'Meta' : 'HubSpot'}`}
                    <ArrowRight size={14} />
                  </button>
                </div>

                <p className="help" style={{ marginTop: 18 }}>
                  OAuth uses your configured developer app and redirects back
                  after authorization.
                </p>
              </>
            )}

            {/* META: Configure source */}
            {isMeta && step === 1 && (
              <>
                <h2 className="card-title">
                  2. Configure Meta Lead Ads source
                </h2>

                <div className="field">
                  <label htmlFor="instance-name">Instance name</label>
                  <input
                    id="instance-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="facebook-page">Facebook Page</label>
                  <select
                    id="facebook-page"
                    value={page}
                    onChange={(event) => {
                      setPage(event.target.value);
                      setForm('');
                      setSampleLeads([]);
                      setTestedSelection('');
                      setMessage('');
                    }}
                  >
                    <option value="">Select a Page</option>
                    {pages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="lead-form">Lead Form</label>
                  <select
                    id="lead-form"
                    value={form}
                    disabled={!page}
                    onChange={(event) => {
                      setForm(event.target.value);
                      setSampleLeads([]);
                      setTestedSelection('');
                      setMessage('');
                    }}
                  >
                    <option value="">Select a Lead Form</option>
                    {forms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.status ? ` (${item.status})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="help">
                  Select a Page and Lead Form, then test the connection to
                  preview up to five sample leads before continuing.
                </p>

                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 14 }}
                  disabled={!page || !form || testingMeta || busy}
                  onClick={testMetaConnection}
                >
                  {testingMeta ? 'Testing connection…' : 'Test connection'}
                </button>

                {testedSelection === `${page}:${form}` &&
                  sampleLeads.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ marginBottom: 8 }}>
                        Sample data (up to 5 leads)
                      </h3>

                      <p className="help">
                        Connection successful. Showing sample fields returned
                        by Meta for this form.
                      </p>

                      <div style={{ overflowX: 'auto', marginTop: 10 }}>
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={tableHeader}>Lead ID</th>
                              <th style={tableHeader}>Created</th>
                              <th style={tableHeader}>Field data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sampleLeads.slice(0, 5).map((lead) => (
                              <tr key={lead.id}>
                                <td style={tableCell}>{lead.id}</td>
                                <td style={tableCell}>
                                  {lead.created_time
                                    ? new Date(
                                        lead.created_time,
                                      ).toLocaleString()
                                    : '—'}
                                </td>
                                <td style={tableCell}>
                                  {(lead.field_data ?? []).map((field) => (
                                    <div
                                      key={field.name}
                                      style={{ marginBottom: 4 }}
                                    >
                                      <strong>{field.name}:</strong>{' '}
                                      {field.values?.join(', ') || '—'}
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                {testedSelection === `${page}:${form}` &&
                  sampleLeads.length === 0 && (
                    <div className="notice" style={{ marginTop: 14 }}>
                      Connection successful, but this form has no accessible
                      leads to preview yet. You can continue.
                    </div>
                  )}
              </>
            )}

            {/* HUBSPOT CAPI: Source and mapping */}
            {!isMeta && step === 1 && (
              <>
                <h2 className="card-title">2. Configure HubSpot source</h2>

                <div className="field">
                  <label htmlFor="instance-name">Instance name</label>
                  <input
                    id="instance-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="hubspot-module">HubSpot module</label>
                  <select
                    id="hubspot-module"
                    value={module}
                    onChange={(event) => setModule(event.target.value)}
                  >
                    <option value="contacts">Contacts</option>
                    <option value="deals">Deals</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="sync-method">Sync method</label>
                  <select
                    id="sync-method"
                    value={syncMode}
                    onChange={(event) => setSyncMode(event.target.value)}
                  >
                    <option value="webhook">Webhook</option>
                    <option value="polling">API / Polling</option>
                  </select>

                  <p className="help">
                    The production webhook subscription and polling worker
                    must be enabled for this method to deliver events.
                  </p>
                </div>

                <h3 className="card-title" style={{ fontSize: 15 }}>
                  HubSpot field mapping
                </h3>

                <p className="card-copy">
                  Map HubSpot CRM properties to normalized SignalBridge
                  conversion fields.
                </p>

                {mappingEditor(
                  'HubSpot property',
                  propertyOptions,
                  'SignalBridge field',
                  normalizedFields,
                )}
              </>
            )}

            {/* META: Connect HubSpot */}
            {isMeta && step === 2 && (
              <>
                <h2 className="card-title">3. Connect HubSpot CRM</h2>

                <p className="card-copy">
                  Authorize the HubSpot account that will receive your Meta
                  leads.
                </p>

                <div
                  className="row"
                  style={{
                    marginTop: 26,
                    padding: '16px 0',
                    borderBottom: '1px solid #edf0f4',
                  }}
                >
                  <div className="integration-head" style={{ margin: 0 }}>
                    <div className="provider-icon">
                      <Database size={22} />
                    </div>
                    <div>
                      <b>HubSpot</b>
                      <div className="help">CRM contacts and properties</div>
                    </div>
                  </div>

                  
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || checkingConnections}
                      onClick={connectHubSpot}
                    >
                      {busy
                        ? 'Testing connection…'
                        : connections.hubspot
                          ? 'Connected ✓'
                          : 'Connect HubSpot'}
                      <ArrowRight size={14} />
                    </button>

                </div>
              </>
            )}

            {/* META: Field mapping */}
            {isMeta && step === 3 && (
              <>
                <h2 className="card-title">
                  4. Map Meta form fields to HubSpot
                </h2>

                <p className="card-copy">
                  Map each Meta lead field to the corresponding HubSpot CRM
                  property.
                </p>

                {mappingEditor(
                  'Meta lead field',
                  metaFields,
                  'HubSpot property',
                  propertyOptions,
                )}
              </>
            )}

            {/* HUBSPOT CAPI: Meta destination */}
            {!isMeta && step === 2 && (
              <>
                <h2 className="card-title">
                  3. Configure Meta CRM CAPI destination
                </h2>

                <p className="card-copy">
                  Enter the CRM dataset ID and authorization token. The token
                  should be encrypted by the server before storage.
                </p>

                <div className="field">
                  <label htmlFor="dataset-id">Dataset ID</label>
                  <input
                    id="dataset-id"
                    value={dataset}
                    onChange={(event) => setDataset(event.target.value)}
                    placeholder="Meta CRM dataset ID"
                    autoComplete="off"
                  />
                </div>

                <div className="field">
                  <label htmlFor="meta-token">Auth Token</label>
                  <input
                    id="meta-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Meta access token"
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={validateMeta}
                  disabled={busy || !dataset.trim() || !token.trim()}
                >
                  {busy ? 'Validating…' : 'Validate credentials'}
                </button>

                <div className="notice" style={{ marginTop: 16 }}>
                  Field mapping was configured in the HubSpot source step.
                </div>
              </>
            )}

            {/* FINAL STEP */}
            {isFinalStep && (
              <>
                <h2 className="card-title">
                  {isMeta ? '5. Test and finish' : '4. Test and finish'}
                </h2>

                <p className="card-copy">
                  Save your configuration. The integration remains a draft
                  until the required provider connections and destination
                  checks pass.
                </p>

                <div className="notice">
                  Review the instance name and field mapping before saving.
                  Activation depends on connected provider accounts and valid
                  destination credentials.
                </div>

                {!savedId ? (
                  <button
                    type="button"
                    className="btn primary"
                    style={{ marginTop: 18 }}
                    disabled={busy}
                    onClick={save}
                  >
                    {busy ? 'Saving…' : 'Save integration'} <Check size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    style={{ marginTop: 18 }}
                    disabled={busy}
                    onClick={activate}
                  >
                    {busy ? 'Checking…' : 'Activate integration'}{' '}
                    <Check size={14} />
                  </button>
                )}

                <div style={{ marginTop: 12 }}>
                  <Link className="btn" href="/">
                    Return to integrations
                  </Link>
                </div>
              </>
            )}

            {/* STATUS MESSAGE */}
            {message && (
              <div
                role="status"
                className={
                  /error|failed|not connected|could not/i.test(message)
                    ? 'error'
                    : 'notice'
                }
                style={{ marginTop: 16 }}
              >
                {message}
              </div>
            )}

            {/* NAVIGATION */}
            {!isFinalStep && (
              <div className="card-bottom">
                <button
                  type="button"
                  className="btn"
                  disabled={step === 0 || busy || testingMeta}
                  onClick={() =>
                    setStep((current) => Math.max(0, current - 1))
                  }
                >
                  <ArrowLeft size={14} /> Back
                </button>

                <button
                  type="button"
                  className="btn primary"
                  disabled={!canContinue()}
                  onClick={() => {
                    if (!canContinue()) return;
                    setStep((current) => Math.min(lastStep, current + 1));
                  }}
                >
                  {checkingConnections
                    ? 'Checking connection…'
                    : 'Continue'}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

const tableHeader: React.CSSProperties = {
  textAlign: 'left',
  padding: 9,
  borderBottom: '1px solid #dbe3ec',
};

const tableCell: React.CSSProperties = {
  padding: 9,
  borderBottom: '1px solid #e8edf3',
  verticalAlign: 'top',
};

export default function NewIntegrationPage() {
  return (
    <Suspense fallback={<div className="main">Loading setup…</div>}>
      <Wizard />
    </Suspense>
  );
}