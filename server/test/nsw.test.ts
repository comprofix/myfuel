import { describe, expect, it } from 'vitest';
import { nswAdapter, parseSnapshot } from '../src/sources/nsw.ts';
import { projectMonthlyCalls } from '../src/sources/projection.ts';

describe('parseSnapshot', () => {
  const body = {
    stations: [
      { code: '20179', state: 'NSW', brand: 'Pearl Energy', name: 'PEARL ENERGY WAUCHOPE ',
        address: '232 HIGH ST, WAUCHOPE NSW 2446', location: { latitude: -31.46, longitude: 152.71 } },
      { code: '245', state: 'TAS', brand: 'Independent', name: 'Great Lake', address: 'MIENA TAS 7030',
        location: { latitude: -41.98, longitude: 146.67 } },
      { code: '1', state: 'NSW', name: 'No location', location: {} },
      { code: '555', state: 'NSW', brand: 'Ampol', name: 'Ampol Nicholls',
        address: '6 GOLD CREEK RD, NICHOLLS ACT 2913', location: { latitude: -35.18, longitude: 149.09 } },
    ],
    prices: [
      { stationcode: 20179, state: 'NSW', fueltype: 'E10', price: 227.5, lastupdated: '18/09/2026 00:07:11' },
      { stationcode: 245, state: 'TAS', fueltype: 'P95', price: 268.9, lastupdated: '22/09/2026 00:56:03' },
      { stationcode: 20179, state: 'NSW', fueltype: 'EV', price: 0, lastupdated: '22/09/2026 00:56:03' },
    ],
  };

  it('keeps only the requested region, stations with coordinates, and real fuel prices', () => {
    const snap = parseSnapshot(body, 'NSW');
    expect(snap.stations.map((s) => [s.code, s.state, s.postcode])).toEqual([
      ['20179', 'NSW', '2446'],
      ['555', 'ACT', '2913'], // ACT stations arrive in the NSW feed
    ]);
    expect(snap.stations[0].name).toBe('PEARL ENERGY WAUCHOPE');
    expect(snap.prices).toEqual([
      { stationCode: '20179', fuelType: 'E10', price: 227.5, updatedAt: new Date('2026-09-17T14:07:11Z') },
    ]);
  });
});

describe('projectMonthlyCalls', () => {
  it('fits the free plan with default settings plus TAS', () => {
    const settings = structuredClone(nswAdapter.defaultSettings);
    settings.regions.TAS.enabled = true;
    // NSW every 30 min + TAS every 2 h across 17 active hours, plus tokens
    expect(projectMonthlyCalls(nswAdapter, settings)).toBe((34 + 9 + 2) * 31);
    expect(projectMonthlyCalls(nswAdapter, settings)).toBeLessThan(2500 - 150);
  });
});
