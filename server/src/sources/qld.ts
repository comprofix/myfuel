import { titleCase } from '../geo.ts';
import type { AdapterContext, Snapshot, SnapshotStation, SourceAdapter } from './types.ts';

// Fuel Prices QLD Direct API (Informed Sources). Every call takes the subscriber
// token in the Authorization header. Reference data (sites, brands, fuel types,
// regions) should be fetched at most daily; prices no more than once a minute.
const BASE = 'https://fppdirectapi-prod.fuelpricesqld.com.au';
const QLD = 'countryId=21&geoRegionLevel=3&geoRegionId=1';
const REFERENCE_TTL = 24 * 60 * 60 * 1000;

/** Price value the API uses for "currently unavailable at this site" */
const UNAVAILABLE = 9999;

// QLD fuel names (lower-cased) -> our fuel_types code. Blends such as
// "e10/Unleaded" and names we have no code for are skipped.
const FUEL_NAMES: Record<string, string> = {
  'unleaded': 'U91',
  'e10': 'E10',
  'premium unleaded 95': 'P95',
  'premium unleaded 98': 'P98',
  'diesel': 'DL',
  'premium diesel': 'PDL',
  'bio-diesel 20': 'B20',
  'e85': 'E85',
  'lpg': 'LPG',
  'opal': 'LAF',
  'compressed natural gas': 'CNG',
  'liquefied natural gas': 'LNG',
};

export interface QldSite {
  S: number;
  N: string;
  A?: string;
  B?: number;
  P?: string;
  G1?: number;
  Lat: number;
  Lng: number;
}

export interface QldPrice {
  SiteId: number;
  FuelId: number;
  TransactionDateUtc?: string;
  Price: number;
}

export interface QldReference {
  sites: QldSite[];
  brands: Map<number, string>;
  /** FuelId -> our fuel code, for the fuels we map */
  fuels: Map<number, string>;
  /** Level-1 (suburb) region id -> name */
  suburbs: Map<number, string>;
}

/** Responses wrap their list in a single property (e.g. { "S": [...] }); take the first array */
export function listOf<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const list = Object.values(body).find(Array.isArray);
    if (list) return list as T[];
  }
  throw new Error('Fuel Prices QLD returned an unexpected response');
}

export function fuelCode(name: string): string | undefined {
  return FUEL_NAMES[name.trim().toLowerCase()];
}

/** Accepts the bare GUID or the whole "FPDAPI SubscriberToken=…" header value */
function authHeader(creds: Record<string, string>): string {
  const token = creds.token?.trim().replace(/^FPDAPI\s+/i, '').replace(/^SubscriberToken=/i, '');
  if (!token) throw new Error('Subscriber token is required');
  return `FPDAPI SubscriberToken=${token}`;
}

async function apiGet(ctx: AdapterContext, kind: string, path: string): Promise<unknown> {
  const res = await ctx.call(kind, 'QLD', `${BASE}${path}`, {
    headers: { Authorization: authHeader(ctx.credentials), 'Content-Type': 'application/json' },
  });
  if (res.status === 401) throw new Error('Fuel Prices QLD rejected the subscriber token (HTTP 401)');
  if (!res.ok) throw new Error(`Fuel Prices QLD returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchReference(ctx: AdapterContext): Promise<QldReference> {
  const sites = listOf<QldSite>(await apiGet(ctx, 'sites', `/Subscriber/GetFullSiteDetails?${QLD}`));
  const brands = listOf<{ BrandId: number; Name: string }>(await apiGet(ctx, 'brands', '/Subscriber/GetCountryBrands?countryId=21'));
  const fuels = listOf<{ FuelId: number; Name: string }>(await apiGet(ctx, 'fuels', '/Subscriber/GetCountryFuelTypes?countryId=21'));
  const regions = listOf<{ GeoRegionLevel: number; GeoRegionId: number; Name: string }>(
    await apiGet(ctx, 'regions', '/Subscriber/GetCountryGeographicRegions?countryId=21'));
  return {
    sites,
    brands: new Map(brands.map((b) => [b.BrandId, b.Name.trim()])),
    fuels: new Map(fuels.flatMap((f) => {
      const code = fuelCode(f.Name);
      return code ? [[f.FuelId, code] as const] : [];
    })),
    suburbs: new Map(regions.filter((r) => r.GeoRegionLevel === 1).map((r) => [r.GeoRegionId, titleCase(r.Name)])),
  };
}

// Reference data cached in memory for a day, per token
let cache: { token: string; at: number; ref: QldReference } | null = null;

async function reference(ctx: AdapterContext): Promise<QldReference> {
  const token = authHeader(ctx.credentials);
  if (cache && cache.token === token && Date.now() - cache.at < REFERENCE_TTL) return cache.ref;
  const ref = await fetchReference(ctx);
  cache = { token, at: Date.now(), ref };
  return ref;
}

/** "2018-10-25T22:55:00" is UTC but has no zone marker */
function parseUtc(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildSnapshot(ref: QldReference, prices: QldPrice[]): Snapshot {
  const stations: SnapshotStation[] = ref.sites
    .filter((s) => s.Lat && s.Lng)
    .map((s) => {
      const suburb = (s.G1 && ref.suburbs.get(s.G1)) || null;
      const postcode = s.P?.trim() || null;
      const street = s.A?.trim().replace(/\s+/g, ' ');
      return {
        code: String(s.S),
        state: 'QLD',
        postcode,
        suburb,
        name: s.N.trim(),
        brand: (s.B && ref.brands.get(s.B)) || null,
        address: [street, [suburb, 'QLD', postcode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        lat: s.Lat,
        lng: s.Lng,
      };
    });

  return {
    stations,
    prices: prices.flatMap((p) => {
      const fuelType = ref.fuels.get(p.FuelId);
      if (!fuelType || !(p.Price > 0) || p.Price >= UNAVAILABLE) return [];
      return [{
        stationCode: String(p.SiteId),
        fuelType,
        price: p.Price / 10, // API gives tenths of a cent
        updatedAt: parseUtc(p.TransactionDateUtc),
      }];
    }),
  };
}

export const qldAdapter: SourceAdapter = {
  id: 'qld',
  name: 'Fuel Prices QLD',
  description: 'Queensland Government fuel price reporting, via the Fuel Prices QLD Direct API. Needs a subscriber token.',
  signupUrl: 'https://www.fuelpricesqld.com.au/',
  attribution: { text: 'Fuel Prices Queensland', url: 'https://www.fuelpricesqld.com.au/' },
  hasQuota: false,
  regions: ['QLD'],
  credentialFields: [
    { key: 'token', label: 'Subscriber token', secret: true },
  ],
  defaultSettings: {
    regions: { QLD: { enabled: true, intervalMinutes: 30 } },
    quietHours: { enabled: true, start: '22:00', end: '05:00' },
    monthlyLimit: 0,
    reserve: 0,
  },
  // Plus 4 reference calls once a day
  callsPerPoll: 1,
  tokenCallsPerDay: 0,

  async testConnection(ctx) {
    const fuels = listOf<{ FuelId: number; Name: string }>(await apiGet(ctx, 'test', '/Subscriber/GetCountryFuelTypes?countryId=21'));
    const skipped = fuels.filter((f) => !fuelCode(f.Name)).map((f) => f.Name.trim());
    return `Token accepted: ${fuels.length - skipped.length} of ${fuels.length} fuel types mapped` +
      (skipped.length ? ` (not shown: ${skipped.join(', ')})` : '');
  },

  async fetchRegion(ctx) {
    const ref = await reference(ctx);
    const prices = listOf<QldPrice>(await apiGet(ctx, 'prices', `/Price/GetSitesPrices?${QLD}`));
    return buildSnapshot(ref, prices);
  },
};
