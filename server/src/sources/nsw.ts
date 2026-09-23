import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAuAddress } from '../geo.ts';
import { parseSydneyDateTime } from '../time.ts';
import type { AdapterContext, Snapshot, SourceAdapter } from './types.ts';

const BASE = 'https://api.onegov.nsw.gov.au';

interface NswStation {
  code: string | number;
  state?: string;
  brand?: string;
  name: string;
  address?: string;
  location?: { latitude?: number; longitude?: number };
}

interface NswPrice {
  stationcode: string | number;
  state?: string;
  fueltype: string;
  price: number;
  lastupdated?: string;
}

interface NswPricesResponse {
  stations?: NswStation[];
  prices?: NswPrice[];
}

function basicAuth(creds: Record<string, string>): string {
  if (!creds.apiKey || !creds.apiSecret) throw new Error('API key and secret are required');
  return Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
}

/** Returns a cached access token, or fetches a new one (≈12 h lifetime) */
async function accessToken(ctx: AdapterContext): Promise<string> {
  const cached = ctx.cachedToken();
  if (cached) return cached;
  const res = await ctx.call('token', null, `${BASE}/oauth/client_credential/accesstoken?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basicAuth(ctx.credentials)}` },
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number };
  if (!res.ok || !body.access_token) throw new Error(`Token request failed (HTTP ${res.status}): check API key and secret`);
  const expiresIn = Number(body.expires_in ?? 3600);
  await ctx.saveToken(body.access_token, new Date(Date.now() + expiresIn * 1000));
  return body.access_token;
}

function requestTimestamp(now = new Date()): string {
  // dd/MM/yyyy hh:mm:ss AM/PM in UTC, as the API expects
  const p = (n: number) => String(n).padStart(2, '0');
  const h = now.getUTCHours();
  return `${p(now.getUTCDate())}/${p(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} ` +
    `${p(h % 12 || 12)}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

async function apiGet(ctx: AdapterContext, region: string, url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(ctx);
    const res = await ctx.call('prices', region, url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ctx.credentials.apiKey,
        'Content-Type': 'application/json; charset=utf-8',
        transactionid: randomUUID(),
        requesttimestamp: requestTimestamp(),
      },
    });
    if (res.status === 401 && attempt === 0) {
      await ctx.clearToken(); // token revoked or expired early: fetch a new one and retry once
      continue;
    }
    if (!res.ok) throw new Error(`NSW API returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('NSW API rejected a fresh access token');
}

export function parseSnapshot(body: NswPricesResponse, region: string): Snapshot {
  const stations = (body.stations ?? [])
    .filter((s) => (s.state ?? region) === region)
    .filter((s) => s.location?.latitude && s.location?.longitude)
    .map((s) => {
      const address = s.address?.trim() || null;
      const { state, postcode } = parseAuAddress(address);
      return {
        code: String(s.code),
        state: state ?? region,
        postcode,
        name: s.name.trim(),
        brand: s.brand?.trim() || null,
        address,
        lat: s.location!.latitude!,
        lng: s.location!.longitude!,
      };
    });
  const prices = (body.prices ?? [])
    .filter((p) => (p.state ?? region) === region)
    // EV entries are almost all 0 and aren't priced per litre
    .filter((p) => p.fueltype !== 'EV' && typeof p.price === 'number' && p.price > 0)
    .map((p) => ({
      stationCode: String(p.stationcode),
      fuelType: p.fueltype,
      price: p.price,
      updatedAt: p.lastupdated ? parseSydneyDateTime(p.lastupdated) : null,
    }));
  return { stations, prices };
}

export const nswAdapter: SourceAdapter = {
  id: 'nsw',
  name: 'NSW Fuel API',
  description: 'NSW Government Fuel API. The NSW feed includes ACT stations; Tasmania is a separate feed.',
  signupUrl: 'https://api.nsw.gov.au/Product/Index/22',
  attribution: { text: 'NSW Government FuelCheck', url: 'https://www.fuelcheck.nsw.gov.au/' },
  hasQuota: true,
  regions: ['NSW', 'TAS'],
  regionNotes: { NSW: 'Includes ACT' },
  credentialFields: [
    { key: 'apiKey', label: 'API key', secret: false },
    { key: 'apiSecret', label: 'API secret', secret: true },
  ],
  defaultSettings: {
    regions: {
      NSW: { enabled: true, intervalMinutes: 30 },
      TAS: { enabled: false, intervalMinutes: 120 },
    },
    quietHours: { enabled: true, start: '22:00', end: '05:00' },
    monthlyLimit: 2500,
    reserve: 150,
  },
  callsPerPoll: 1,
  tokenCallsPerDay: 2,

  async testConnection(ctx) {
    await ctx.clearToken();
    await accessToken(ctx);
    return 'Credentials accepted: access token issued';
  },

  async fetchRegion(ctx, region) {
    if (ctx.fixtureDir) {
      const file = path.join(ctx.fixtureDir, `prices-${region}.json`);
      return parseSnapshot(JSON.parse(await readFile(file, 'utf8')), region);
    }
    // Verified: no `states` param returns NSW only; TAS needs ?states=TAS
    const query = region === 'NSW' ? '' : `?states=${region}`;
    const body = await apiGet(ctx, region, `${BASE}/FuelPriceCheck/v2/fuel/prices${query}`);
    return parseSnapshot(body as NswPricesResponse, region);
  },
};
