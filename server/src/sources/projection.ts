import { inWindow, parseHhMm } from '../time.ts';
import type { SourceAdapter, SourceSettings } from './types.ts';

/** Estimated API calls per 31-day month for the given settings */
export function projectMonthlyCalls(adapter: SourceAdapter, settings: SourceSettings): number {
  const q = settings.quietHours;
  let activeMinutes = 24 * 60;
  if (q.enabled) {
    const start = parseHhMm(q.start), end = parseHhMm(q.end);
    for (let m = 0; m < 1440; m++) if (inWindow(m, start, end)) activeMinutes--;
  }
  let perDay = 0;
  for (const r of Object.values(settings.regions)) {
    if (r.enabled) perDay += Math.ceil(activeMinutes / r.intervalMinutes) * adapter.callsPerPoll;
  }
  if (perDay > 0) perDay += adapter.tokenCallsPerDay;
  return Math.ceil(perDay * 31);
}
