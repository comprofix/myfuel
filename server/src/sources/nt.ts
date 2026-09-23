import { titleCase } from '../geo.ts';
import type { Snapshot, SourceAdapter } from './types.ts';

// MyFuel NT is the NT Government's official price site. It has no published API,
// so we read the JSON its own results page embeds (see docs in fuelsmart-au:
// docs/myfuelnt-api-documentation.md). Region search with SuburbId=0 returns every outlet.
const RESULTS_URL = 'https://myfuelnt.nt.gov.au/Home/Results?' + new URLSearchParams({
  searchOptions: 'region', SuburbId: '0', RegionId: '3', FuelCode: '', BrandIdentifier: '',
});

// MyFuel NT code -> our fuel_types code
const FUEL_CODES: Record<string, string> = { PD: 'PDL' };

interface NtFuel {
  FuelCode: string;
  Price: number;
  isAvailable: boolean;
}

interface NtOutlet {
  FuelOutletId: number;
  FuelOutletIdentifier?: string;
  OutletName: string;
  OutletBrandIdentifier?: string;
  Address?: string;
  Suburb?: string;
  Postcode?: string;
  OutletState?: string;
  Latitude: number;
  Longitude: number;
  IsActive: boolean;
  AvailableFuels?: NtFuel[];
}

interface NtResults {
  FuelOutlet?: NtOutlet[];
  FuelBrandList?: { Text: string; Value: string }[];
}

const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Pull the embedded `serverJson` hidden input out of the results page */
export function extractServerJson(html: string): NtResults {
  const m = /<input[^>]*id="serverJson"[^>]*value="([^"]*)"/.exec(html)
    ?? /<input[^>]*value="([^"]*)"[^>]*id="serverJson"/.exec(html);
  if (!m) throw new Error('MyFuel NT page layout changed: serverJson not found');
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch {
    throw new Error('MyFuel NT page layout changed: serverJson is not valid JSON');
  }
}

export function parseNtResults(data: NtResults): Snapshot {
  const brands = new Map((data.FuelBrandList ?? []).map((b) => [b.Value, b.Text]));
  const outlets = (data.FuelOutlet ?? []).filter((o) => o.IsActive && o.Latitude && o.Longitude);

  const stations = outlets.map((o) => {
    const suburb = o.Suburb ? titleCase(o.Suburb) : null;
    const postcode = o.Postcode?.trim() || null;
    const street = o.Address?.trim().replace(/\s+/g, ' ');
    return {
      code: String(o.FuelOutletIdentifier ?? o.FuelOutletId),
      state: o.OutletState?.trim() || 'NT',
      postcode,
      suburb,
      name: o.OutletName.trim(),
      brand: (o.OutletBrandIdentifier && brands.get(o.OutletBrandIdentifier)) || null,
      address: [street, [suburb, 'NT', postcode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      lat: o.Latitude,
      lng: o.Longitude,
    };
  });

  const prices = outlets.flatMap((o) =>
    (o.AvailableFuels ?? [])
      // Out-of-stock fuels are listed with isAvailable=false
      .filter((f) => f.isAvailable && f.Price > 0)
      .map((f) => ({
        stationCode: String(o.FuelOutletIdentifier ?? o.FuelOutletId),
        fuelType: FUEL_CODES[f.FuelCode] ?? f.FuelCode,
        price: f.Price,
        updatedAt: null, // MyFuel NT doesn't publish when a price was set
      })));

  return { stations, prices };
}

export const ntAdapter: SourceAdapter = {
  id: 'nt',
  name: 'MyFuel NT',
  description: 'Official NT Government fuel price data from myfuelnt.nt.gov.au. No API key required.',
  signupUrl: 'https://myfuelnt.nt.gov.au/',
  attribution: { text: 'MyFuel NT', url: 'https://myfuelnt.nt.gov.au/' },
  hasQuota: false,
  regions: ['NT'],
  credentialFields: [],
  defaultSettings: {
    regions: { NT: { enabled: true, intervalMinutes: 60 } },
    quietHours: { enabled: true, start: '22:00', end: '05:00' },
    monthlyLimit: 0,
    reserve: 0,
  },
  callsPerPoll: 1,
  tokenCallsPerDay: 0,

  async testConnection(ctx) {
    const snap = await this.fetchRegion(ctx, 'NT');
    return `Reachable: ${snap.stations.length} stations, ${snap.prices.length} prices`;
  },

  async fetchRegion(ctx) {
    const res = await ctx.call('prices', 'NT', RESULTS_URL, { headers: { 'User-Agent': 'MyFuel/1.0 (personal fuel price map)' } });
    if (!res.ok) throw new Error(`MyFuel NT returned HTTP ${res.status}`);
    return parseNtResults(extractServerJson(await res.text()));
  },
};
