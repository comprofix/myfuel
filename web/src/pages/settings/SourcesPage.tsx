import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type SourceInfo, type SourceSettings } from '../../api';
import { timeAgo } from '../../format';
import { INTERVALS, intervalLabel, pollRegion, saveSource, type Msg } from './shared';

interface RegionRow {
  source: SourceInfo;
  region: string;
}

export function SourcesPage() {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const reload = () => { api<SourceInfo[]>('/api/admin/sources').then(setSources, () => {}); };
  useEffect(reload, []);

  const replace = (updated: SourceInfo) => setSources((all) => all!.map((s) => (s.id === updated.id ? updated : s)));

  async function run(label: string, fn: () => Promise<Msg | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const updateRegion = ({ source, region }: RegionRow, patch: Partial<SourceSettings['regions'][string]>) =>
    run(`region-${region}`, async () => {
      const settings: SourceSettings = {
        ...source.settings,
        regions: { ...source.settings.regions, [region]: { ...source.settings.regions[region], ...patch } },
      };
      replace(await saveSource(source.id, { settings }));
    });

  const refresh = ({ source, region }: RegionRow) => run(`poll-${region}`, async () => {
    const m = await pollRegion(source.id, region);
    reload();
    return m;
  });

  const rows: RegionRow[] = (sources ?? [])
    .flatMap((source) => source.regions.map((region) => ({ source, region })))
    .sort((a, b) => a.region.localeCompare(b.region));

  return (
    <>
      <h1>Data sources</h1>
      <p className="muted">
        Turn polling on or off for each region and choose how often it refreshes. Changes save immediately.
        Click a region to set up the API that supplies it.
      </p>

      <div className="table-wrap">
        <table className="regions">
          <thead>
            <tr>
              <th>Region</th><th>Poll</th><th>Every</th><th className="hide-sm">Stations</th><th>Last refresh</th><th />
            </tr>
          </thead>
          <tbody>
            {!sources && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {rows.map((row) => {
              const { source, region } = row;
              const rs = source.settings.regions[region];
              const last = source.lastRuns.find((r) => r.region === region);
              const count = source.stationCounts.find((c) => c.region === region)?.count ?? 0;
              const note = source.regionNotes[region];
              return (
                <tr key={`${source.id}-${region}`} className={rs.enabled && source.configured ? '' : 'off'}>
                  <td className="c-region">
                    <Link to={`/settings/sources/${source.id}`} className="region-link">
                      <strong>{region}</strong>
                      <span className="muted small">{source.name}{note ? ` · ${note}` : ''}</span>
                    </Link>
                  </td>
                  {source.configured ? (
                    <>
                      <td className="c-poll">
                        <input type="checkbox" aria-label={`Poll ${region}`} checked={rs.enabled} disabled={busy !== null}
                               onChange={(e) => updateRegion(row, { enabled: e.target.checked })} />
                      </td>
                      <td className="c-every">
                        <select value={rs.intervalMinutes} disabled={busy !== null} aria-label={`${region} interval`}
                                onChange={(e) => updateRegion(row, { intervalMinutes: Number(e.target.value) })}>
                          {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
                        </select>
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="c-setup">
                      <Link to={`/settings/sources/${source.id}`}>Set up API ›</Link>
                    </td>
                  )}
                  <td className="hide-sm">{count.toLocaleString()}</td>
                  <td className={`c-last ${last?.ok === false ? 'error' : 'muted'}`} title={last?.error ?? ''}>
                    {last ? `${timeAgo(last.startedAt)}${last.ok === false ? ' · failed' : ''}` : 'never'}
                  </td>
                  <td className="right c-action">
                    <button onClick={() => refresh(row)} disabled={busy !== null || !source.configured}>
                      {busy === `poll-${region}` ? 'Refreshing…' : 'Refresh now'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
    </>
  );
}
