export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface User { id: number; username: string }
export interface FuelType { code: string; name: string }
export interface Locality { id: number; postcode: string; name: string; state: string; lat: number; lng: number; stationCount: number }
export interface StationSummary {
  id: number; name: string; brand: string | null; address: string | null; state: string;
  lat: number; lng: number; price: number; sourceUpdatedAt: string | null;
}
export interface StationDetail {
  id: number; name: string; brand: string | null; address: string | null; suburb: string | null;
  state: string; postcode: string | null; lat: number; lng: number;
  prices: { fuelType: string; fuelName: string; price: number; sourceUpdatedAt: string | null }[];
  attribution: { text: string; url: string } | null;
}

export interface RegionSettings { enabled: boolean; intervalMinutes: number }
export interface SourceSettings {
  regions: Record<string, RegionSettings>;
  quietHours: { enabled: boolean; start: string; end: string };
  monthlyLimit: number;
  reserve: number;
}
export interface PollRun {
  id?: number; sourceId?: string; region: string; trigger?: string; startedAt: string; finishedAt: string | null;
  ok: boolean | null; stations: number | null; prices: number | null; changed: number | null; error: string | null;
}
export interface SourceInfo {
  id: string; name: string; description: string; signupUrl: string; regions: string[];
  attribution: { text: string; url: string }; hasQuota: boolean;
  regionNotes: Record<string, string>; configured: boolean; settings: SourceSettings;
  credentialFields: { key: string; label: string; secret: boolean }[];
  credentials: Record<string, { set: boolean; value: string | null }>;
  usage: { callsThisMonth: number; projectedMonthly: number };
  lastRuns: PollRun[];
  stationCounts: { region: string; count: number }[];
}
