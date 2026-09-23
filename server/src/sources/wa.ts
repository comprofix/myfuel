import { titleCase } from '../geo.ts';
import type { Snapshot, SnapshotPrice, SnapshotStation, SourceAdapter } from './types.ts';

// FuelWatch's official RSS feed. With no Suburb/Region it returns every WA site
// for one product, so a poll is one request per fuel type.
const FEED_URL = 'https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS';

// FuelWatch product id -> our fuel_types code
export const WA_PRODUCTS: Record<number, string> = {
  1: 'U91',  // Unleaded Petrol
  2: 'P95',  // Premium Unleaded
  4: 'DL',   // Diesel
  5: 'LPG',
  6: 'P98',  // 98 RON
  10: 'E85',
  11: 'PDL', // Brand diesel
};

export interface WaItem {
  tradingName: string;
  brand: string | null;
  address: string;
  location: string;
  date: string;
  price: number;
  lat: number;
  lng: number;
}

const decodeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').trim();

function tag(item: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
  return m ? decodeXml(m[1]) : '';
}

export function parseFeed(xml: string): WaItem[] {
  if (!xml.includes('<rss')) throw new Error('FuelWatch returned something other than an RSS feed');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    tradingName: tag(item, 'trading-name'),
    brand: tag(item, 'brand') || null,
    address: tag(item, 'address'),
    location: tag(item, 'location'),
    date: tag(item, 'date'),
    price: Number(tag(item, 'price')),
    lat: Number(tag(item, 'latitude')),
    lng: Number(tag(item, 'longitude')),
  }));
}

/** The feed has no site id; address + coordinates stays stable when a site rebrands */
export function siteCode(i: WaItem): string {
  return `${i.address.toUpperCase().replace(/\s+/g, ' ')}|${i.location.toUpperCase()}|${i.lat.toFixed(4)},${i.lng.toFixed(4)}`;
}

/** WA prices are fixed for the day from 6am Perth time (UTC+8, no daylight saving) */
function priceDate(date: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T06:00:00+08:00`) : null;
}

export function buildSnapshot(feeds: { fuelType: string; items: WaItem[] }[]): Snapshot {
  const stations = new Map<string, SnapshotStation>();
  const prices = new Map<string, SnapshotPrice>();
  for (const { fuelType, items } of feeds) {
    for (const i of items) {
      if (!i.lat || !i.lng || !(i.price > 0)) continue;
      const code = siteCode(i);
      const suburb = titleCase(i.location);
      stations.set(code, {
        code, state: 'WA', postcode: null, suburb,
        name: i.tradingName, brand: i.brand,
        address: `${i.address}, ${suburb} WA`,
        lat: i.lat, lng: i.lng,
      });
      // Keyed so exact duplicate rows in the feed collapse
      prices.set(`${code}:${fuelType}`, { stationCode: code, fuelType, price: i.price, updatedAt: priceDate(i.date) });
    }
  }
  return { stations: [...stations.values()], prices: [...prices.values()] };
}

export const waAdapter: SourceAdapter = {
  id: 'wa',
  name: 'FuelWatch WA',
  description: 'Official WA Government FuelWatch prices. Prices are fixed for the day from 6am. No API key required.',
  signupUrl: 'https://www.fuelwatch.wa.gov.au/',
  attribution: { text: 'FuelWatch', url: 'https://www.fuelwatch.wa.gov.au/' },
  hasQuota: false,
  regions: ['WA'],
  credentialFields: [],
  defaultSettings: {
    regions: { WA: { enabled: true, intervalMinutes: 120 } },
    quietHours: { enabled: true, start: '22:00', end: '05:00' },
    monthlyLimit: 0,
    reserve: 0,
  },
  callsPerPoll: Object.keys(WA_PRODUCTS).length,
  tokenCallsPerDay: 0,

  async testConnection(ctx) {
    const res = await ctx.call('test', 'WA', `${FEED_URL}?Product=1`, {});
    if (!res.ok) throw new Error(`FuelWatch returned HTTP ${res.status}`);
    return `Reachable: ${parseFeed(await res.text()).length} unleaded prices`;
  },

  async fetchRegion(ctx) {
    const feeds = [];
    for (const [product, fuelType] of Object.entries(WA_PRODUCTS)) {
      const res = await ctx.call('prices', 'WA', `${FEED_URL}?Product=${product}`, {});
      if (!res.ok) throw new Error(`FuelWatch returned HTTP ${res.status} for ${fuelType}`);
      feeds.push({ fuelType, items: parseFeed(await res.text()) });
    }
    return buildSnapshot(feeds);
  },
};
