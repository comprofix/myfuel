import { useCallback, useEffect, useState } from 'react';
import { api, type PollRun, type SourceInfo, type SourceSettings } from '../../api';
import { formatDateTime, timeAgo } from '../../format';

export type Msg = { ok: boolean; text: string } | null;

export const INTERVALS = [15, 20, 30, 45, 60, 90, 120, 180, 360, 720];

export function intervalLabel(m: number) {
  return m < 60 ? `${m} min` : `${m / 60} h`;
}

export function saveSource(id: string, body: { settings?: SourceSettings; credentials?: Record<string, string> }) {
  return api<SourceInfo>(`/api/admin/sources/${id}`, { method: 'PUT', body });
}

export async function pollRegion(id: string, region: string): Promise<Msg> {
  const r = await api<{ ok: boolean; message?: string; stations?: number; prices?: number; changed?: number }>(
    `/api/admin/sources/${id}/poll`, { method: 'POST', body: { region } });
  return r.ok
    ? { ok: true, text: `${region}: ${r.stations} stations, ${r.prices} prices, ${r.changed} changed` }
    : { ok: false, text: `${region}: ${r.message ?? 'refresh failed'}` };
}

export function sourceStatus(source: SourceInfo) {
  const credsSet = source.credentialFields.every((f) => source.credentials[f.key]?.set);
  const anyRegion = Object.values(source.settings.regions).some((r) => r.enabled);
  const status = !source.configured ? 'Not configured' : anyRegion ? 'Polling' : 'Paused';
  const tone = !source.configured ? 'muted' : anyRegion ? 'success' : 'warn';
  return { credsSet, status, tone };
}

export function StatusBadge({ source }: { source: SourceInfo }) {
  const { status, tone } = sourceStatus(source);
  return <span className={`badge ${tone}`}>{status}</span>;
}

export function UsageMeter({ source, settings }: { source: SourceInfo; settings?: SourceSettings }) {
  const s = settings ?? source.settings;
  const used = source.usage.callsThisMonth;
  const budget = s.monthlyLimit - s.reserve;
  const over = source.usage.projectedMonthly > budget;
  return (
    <div className="usage">
      <div className="usage-bar" role="meter" aria-valuemin={0} aria-valuemax={s.monthlyLimit} aria-valuenow={used}
           aria-label="API calls used this month">
        <div className="usage-fill" style={{ width: `${Math.min(100, (used / s.monthlyLimit) * 100)}%` }} />
        <div className="usage-reserve" style={{ left: `${(budget / s.monthlyLimit) * 100}%` }} />
      </div>
      <p className="small">
        <strong>{used.toLocaleString()}</strong> of {s.monthlyLimit.toLocaleString()} calls used this month ·
        schedule uses about <strong>{source.usage.projectedMonthly.toLocaleString()}</strong>/month
        {over
          ? <span className="error"> — over the {budget.toLocaleString()} available to the poller</span>
          : <span className="muted"> of {budget.toLocaleString()} available</span>}
      </p>
    </div>
  );
}

export function usePollRuns(sourceId?: string, limit = 50) {
  const [runs, setRuns] = useState<PollRun[] | null>(null);
  const reload = useCallback(() => {
    const q = new URLSearchParams({ limit: String(limit), ...(sourceId ? { source: sourceId } : {}) });
    api<PollRun[]>(`/api/admin/poll-runs?${q}`).then(setRuns, () => {});
  }, [sourceId, limit]);
  useEffect(reload, [reload]);
  return { runs, reload };
}

export function RunsTable({ runs, showSource }: { runs: PollRun[] | null; showSource?: boolean }) {
  const cols = showSource ? 5 : 4;
  return (
    <div className="table-wrap">
      <table className="runs">
        <thead>
          <tr><th>Started</th>{showSource && <th>Source</th>}<th>Region</th><th>Trigger</th><th>Result</th></tr>
        </thead>
        <tbody>
          {runs === null && <tr><td colSpan={cols} className="muted">Loading…</td></tr>}
          {runs?.length === 0 && <tr><td colSpan={cols} className="muted">No refreshes yet</td></tr>}
          {runs?.map((r) => (
            <tr key={r.id}>
              <td title={formatDateTime(r.startedAt)}>{timeAgo(r.startedAt)}</td>
              {showSource && <td>{r.sourceId}</td>}
              <td>{r.region}</td>
              <td>{r.trigger}</td>
              <td className={r.ok === false ? 'error' : ''}>
                {r.ok === null ? 'running…' : r.ok ? `${r.stations} stations, ${r.prices} prices, ${r.changed} changed` : r.error}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
