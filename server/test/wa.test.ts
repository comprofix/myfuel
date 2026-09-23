import { describe, expect, it } from 'vitest';
import { buildSnapshot, parseFeed } from '../src/sources/wa.ts';

const item = (name: string, address: string, location: string, price: string, lat = '-31.83294400') => `
  <item>
    <title>${price}: ${name}</title>
    <brand>EG Ampol</brand>
    <date>2026-09-23</date>
    <price>${price}</price>
    <trading-name>${name}</trading-name>
    <location>${location}</location>
    <address>${address}</address>
    <latitude>${lat}</latitude>
    <longitude>115.96691600</longitude>
  </item>`;

const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;

describe('parseFeed', () => {
  it('reads items and decodes entities', () => {
    const [i] = parseFeed(rss(item('Smith &amp; Sons', '3 MARVEL ENT', 'BRABHAM', '245.9')));
    expect(i).toMatchObject({ tradingName: 'Smith & Sons', address: '3 MARVEL ENT', location: 'BRABHAM', price: 245.9, date: '2026-09-23' });
  });

  it('rejects non-RSS responses', () => {
    expect(() => parseFeed('<html>error</html>')).toThrow(/RSS/);
  });
});

describe('buildSnapshot', () => {
  const ulp = parseFeed(rss(
    item('EG Ampol Brabham', '3 MARVEL ENT', 'BRABHAM', '245.9') +
    item('7-Eleven Brabham', '3 MARVEL ENT', 'BRABHAM', '249.9', '-31.83263000') +
    // exact duplicate row, as seen in the live feed
    item('7-Eleven Brabham', '3 MARVEL ENT', 'BRABHAM', '249.9', '-31.83263000')));
  const diesel = parseFeed(rss(item('EG Ampol Brabham', '3 MARVEL ENT', 'BRABHAM', '255.9')));
  const snap = buildSnapshot([{ fuelType: 'U91', items: ulp }, { fuelType: 'DL', items: diesel }]);

  it('merges products per site and keeps same-address sites apart', () => {
    expect(snap.stations.map((s) => s.name)).toEqual(['EG Ampol Brabham', '7-Eleven Brabham']);
    expect(snap.stations[0]).toMatchObject({ state: 'WA', suburb: 'Brabham', address: '3 MARVEL ENT, Brabham WA', postcode: null });
    expect(snap.prices.map((p) => `${p.fuelType} ${p.price}`)).toEqual(['U91 245.9', 'U91 249.9', 'DL 255.9']);
  });

  it('dates prices from 6am Perth time', () => {
    expect(snap.prices[0].updatedAt?.toISOString()).toBe('2026-09-22T22:00:00.000Z');
  });
});
