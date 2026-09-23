import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, type SourceInfo, type SourceSettings } from '../../api';
import { RunsTable, saveSource, sourceStatus, StatusBadge, UsageMeter, usePollRuns, type Msg } from './shared';

export function SourceDetailPage() {
  const { id = '' } = useParams();
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setSource(null);
    api<SourceInfo>(`/api/admin/sources/${id}`).then(setSource, (e) => setNotFound(e instanceof ApiError && e.status === 404));
  }, [id]);

  if (notFound) return <p>Unknown data source. <Link to="/settings/sources">Back to data sources</Link></p>;
  if (!source) return <p className="muted">Loading…</p>;
  return <SourceDetail key={source.id} source={source} onChanged={setSource} />;
}

function SourceDetail({ source, onChanged }: { source: SourceInfo; onChanged: (s: SourceInfo) => void }) {
  const { credsSet } = sourceStatus(source);
  const needsKey = source.credentialFields.length > 0;
  const [creds, setCreds] = useState<Record<string, string>>(() =>
    Object.fromEntries(source.credentialFields.map((f) => [f.key, f.secret ? '' : (source.credentials[f.key]?.value ?? '')])));
  const [settings, setSettings] = useState<SourceSettings>(source.settings);
  const [busy, setBusy] = useState<string | null>(null);
  const [credMsg, setCredMsg] = useState<Msg>(null);
  const [settingsMsg, setSettingsMsg] = useState<Msg>(null);
  const { runs, reload: reloadRuns } = usePollRuns(source.id, 20);

  const dirty = JSON.stringify(settings) !== JSON.stringify(source.settings);

  async function run(label: string, setMsg: (m: Msg) => void, fn: () => Promise<Msg>) {
    setBusy(label);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const saveCredentials = () => run('creds', setCredMsg, async () => {
    onChanged(await saveSource(source.id, { credentials: creds }));
    setCreds((c) => Object.fromEntries(source.credentialFields.map((f) => [f.key, f.secret ? '' : c[f.key]])));
    return { ok: true, text: 'Credentials saved' };
  });

  const test = () => run('test', setCredMsg, async () => {
    const r = await api<{ ok: boolean; message: string }>(`/api/admin/sources/${source.id}/test`, { method: 'POST' });
    onChanged(await api<SourceInfo>(`/api/admin/sources/${source.id}`));
    reloadRuns();
    return { ok: r.ok, text: r.message };
  });

  const saveSettings = () => run('settings', setSettingsMsg, async () => {
    onChanged(await saveSource(source.id, { settings }));
    return { ok: true, text: 'Settings saved' };
  });

  const setQuiet = (patch: Partial<SourceSettings['quietHours']>) =>
    setSettings((s) => ({ ...s, quietHours: { ...s.quietHours, ...patch } }));

  return (
    <>
      <nav className="crumbs"><Link to="/settings/sources">Data sources</Link> › {source.name}</nav>
      <div className="source-head">
        <div>
          <h1>{source.name}</h1>
          <p className="muted">
            {source.description}{' '}
            <a href={source.signupUrl} target="_blank" rel="noreferrer">
              {needsKey ? 'Get an API key ↗' : 'Visit website ↗'}
            </a>
          </p>
        </div>
        <StatusBadge source={source} />
      </div>
      <p className="covers">
        Supplies{' '}
        {source.regions.map((r, i) => (
          <span key={r}>
            {i > 0 && ', '}
            <strong>{r}</strong>
            {source.regionNotes[r] ? ` (${source.regionNotes[r].toLowerCase()})` : ''}
          </span>
        ))}
        . Turn regions on or off on the <Link to="/settings/sources">Data sources</Link> page.
      </p>

      {!needsKey && (
        <section className="card">
          <h2>Connection</h2>
          <p className="muted small">
            No API key required. Data is credited to{' '}
            <a href={source.attribution.url} target="_blank" rel="noreferrer">{source.attribution.text}</a> on the map.
          </p>
          <div className="actions">
            <button onClick={test} disabled={busy !== null}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
          </div>
          {credMsg && <p className={credMsg.ok ? 'success' : 'error'}>{credMsg.text}</p>}
        </section>
      )}

      {needsKey && <section className="card">
        <h2>API credentials</h2>
        <p className="muted small">Encrypted before they are stored. Secret values are never shown again.</p>
        <div className="form-grid">
          {source.credentialFields.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={f.secret && source.credentials[f.key]?.set ? '•••••••• saved; leave blank to keep' : ''}
                value={creds[f.key] ?? ''}
                onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="actions">
            <button className="primary" onClick={saveCredentials} disabled={busy !== null}>{busy === 'creds' ? 'Saving…' : 'Save credentials'}</button>
            <button onClick={test} disabled={busy !== null || !credsSet}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
            <span className="muted small">Testing uses 1 API call</span>
          </div>
          {credMsg && <p className={credMsg.ok ? 'success' : 'error'}>{credMsg.text}</p>}
        </div>
      </section>}

      <section className="card">
        <h2>{source.hasQuota ? <>Schedule &amp; API budget</> : 'Schedule'}</h2>
        <div className="form-grid">
          <label className="inline">
            <input type="checkbox" checked={settings.quietHours.enabled} onChange={(e) => setQuiet({ enabled: e.target.checked })} />
            Pause overnight (Sydney time)
          </label>
          <div className="row">
            <label>From<input type="time" value={settings.quietHours.start} disabled={!settings.quietHours.enabled}
                              onChange={(e) => setQuiet({ start: e.target.value })} /></label>
            <label>To<input type="time" value={settings.quietHours.end} disabled={!settings.quietHours.enabled}
                            onChange={(e) => setQuiet({ end: e.target.value })} /></label>
          </div>
          {source.hasQuota && (
            <div className="row">
              <label>Monthly call limit<input type="number" min={1} value={settings.monthlyLimit}
                     onChange={(e) => setSettings((s) => ({ ...s, monthlyLimit: Number(e.target.value) }))} /></label>
              <label>Keep in reserve<input type="number" min={0} value={settings.reserve}
                     onChange={(e) => setSettings((s) => ({ ...s, reserve: Number(e.target.value) }))} /></label>
            </div>
          )}
        </div>
        {source.hasQuota ? (
          <>
            <UsageMeter source={source} settings={settings} />
            <p className="muted small">
              Background polling stops at the limit minus the reserve; manual refreshes and tests can use the reserve.
              {dirty && ' Save to update the estimate.'}
            </p>
          </>
        ) : (
          <p className="muted small">
            No usage limit. {source.usage.callsThisMonth.toLocaleString()} requests this month; the schedule makes
            about {source.usage.projectedMonthly.toLocaleString()} a month.
          </p>
        )}
        <div className="actions">
          <button className="primary" onClick={saveSettings} disabled={!dirty || busy !== null}>
            {busy === 'settings' ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && <button onClick={() => setSettings(source.settings)} disabled={busy !== null}>Discard</button>}
          {settingsMsg && <span className={settingsMsg.ok ? 'success' : 'error'}>{settingsMsg.text}</span>}
        </div>
      </section>

      <section>
        <h2>Recent activity</h2>
        <RunsTable runs={runs} />
      </section>
    </>
  );
}
