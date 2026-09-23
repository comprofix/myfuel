export const TZ = 'Australia/Sydney';

const partsFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function zonedParts(date: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Offset of Australia/Sydney from UTC at the given instant, in minutes */
function offsetMinutes(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Parse "dd/MM/yyyy HH:mm:ss" as Sydney local time (the format FuelCheck returns) */
export function parseSydneyDateTime(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value?.trim() ?? '');
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m.map(Number);
  const guess = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss);
  // Two passes handle instants near a DST boundary
  let ts = guess - offsetMinutes(new Date(guess)) * 60000;
  ts = guess - offsetMinutes(new Date(ts)) * 60000;
  return new Date(ts);
}

/** Minutes since midnight, Sydney time */
export function sydneyMinuteOfDay(date = new Date()): number {
  const p = zonedParts(date);
  return p.hour * 60 + p.minute;
}

/** "HH:mm" -> minutes since midnight */
export function parseHhMm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** True when `minute` falls in [start, end), wrapping past midnight when start > end */
export function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
