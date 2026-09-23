import { sql } from './db.ts';
import { ingestSnapshot } from './ingest.ts';
import { adapters } from './sources/registry.ts';
import { buildContext, callsThisMonth, isConfigured, loadSource } from './sources/service.ts';
import { inWindow, parseHhMm, sydneyMinuteOfDay } from './time.ts';
import type { Snapshot } from './sources/types.ts';

const running = new Set<string>();

/**
 * Ingesting replaces a region's prices, so a broken response (e.g. a website
 * layout change) would wipe the map. Refuse snapshots that look wrong and keep
 * the existing prices instead.
 */
async function checkSnapshot(sourceId: string, region: string, snapshot: Snapshot) {
  if (snapshot.stations.length === 0 || snapshot.prices.length === 0) {
    throw new Error('Source returned no stations or prices; kept existing prices');
  }
  const [lastGood] = await sql<{ stations: number }[]>`
    select stations from poll_runs where source_id = ${sourceId} and region = ${region} and ok
    order by started_at desc limit 1`;
  if (lastGood && snapshot.stations.length < lastGood.stations * 0.5) {
    throw new Error(`Source returned ${snapshot.stations.length} stations, down from ${lastGood.stations}; kept existing prices`);
  }
}

export async function pollRegion(sourceId: string, region: string, trigger: 'schedule' | 'manual') {
  const lockKey = `${sourceId}:${region}`;
  if (running.has(lockKey)) throw new Error(`${region} is already being refreshed`);
  running.add(lockKey);
  const [run] = await sql<{ id: number }[]>`
    insert into poll_runs (source_id, region, trigger) values (${sourceId}, ${region}, ${trigger}) returning id`;
  try {
    const source = await loadSource(sourceId);
    const snapshot = await source.adapter.fetchRegion(await buildContext(source), region);
    await checkSnapshot(sourceId, region, snapshot);
    const result = await ingestSnapshot(sourceId, region, snapshot);
    await sql`update poll_runs set finished_at = now(), ok = true, stations = ${result.stations},
              prices = ${result.prices}, changed = ${result.changed} where id = ${run.id}`;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`update poll_runs set finished_at = now(), ok = false, error = ${message} where id = ${run.id}`;
    throw err;
  } finally {
    running.delete(lockKey);
  }
}

async function tick() {
  for (const adapter of adapters) {
    const source = await loadSource(adapter.id);
    // Each region's own toggle decides whether it polls
    if (!isConfigured(source)) continue;
    const { quietHours, monthlyLimit, reserve } = source.settings;
    if (quietHours.enabled && inWindow(sydneyMinuteOfDay(), parseHhMm(quietHours.start), parseHhMm(quietHours.end))) continue;
    if (adapter.hasQuota && (await callsThisMonth(adapter.id)) >= monthlyLimit - reserve) continue;

    for (const [region, rs] of Object.entries(source.settings.regions)) {
      if (!rs.enabled) continue;
      // Measure from the last attempt (not success) so failures don't cause rapid retries
      const [last] = await sql<{ startedAt: Date }[]>`
        select started_at from poll_runs where source_id = ${adapter.id} and region = ${region}
        order by started_at desc limit 1`;
      if (last && Date.now() - last.startedAt.getTime() < rs.intervalMinutes * 60000) continue;
      try {
        const r = await pollRegion(adapter.id, region, 'schedule');
        console.log(`[poller] ${adapter.id}/${region}: ${r.stations} stations, ${r.prices} prices, ${r.changed} changed`);
      } catch (err) {
        console.error(`[poller] ${adapter.id}/${region} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
}

export function startPoller(): () => void {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await tick(); } catch (err) { console.error('[poller] tick failed:', err); } finally { busy = false; }
  };
  const first = setTimeout(run, 5_000);
  const timer = setInterval(run, 60_000);
  return () => { clearTimeout(first); clearInterval(timer); };
}
