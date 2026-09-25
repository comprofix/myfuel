import { describe, expect, it } from 'vitest';
import { buildSnapshot, fuelCode, listOf, type QldReference } from '../src/sources/qld.ts';

const ref: QldReference = {
  sites: [
    { S: 61290151, N: 'Caltex Surat ', A: '61  Burrowes St', B: 2, P: '4417', G1: 100, Lat: -27.151797, Lng: 149.067802 },
    { S: 5, N: 'No location', Lat: 0, Lng: 0 },
  ],
  brands: new Map([[2, 'Caltex']]),
  fuels: new Map([[2, 'U91'], [5, 'P95']]),
  suburbs: new Map([[100, 'Surat']]),
};

describe('listOf', () => {
  it('unwraps the single list property', () => {
    expect(listOf({ SitePrices: [1, 2] })).toEqual([1, 2]);
    expect(() => listOf({ Message: 'error' })).toThrow(/unexpected/);
  });
});

describe('fuelCode', () => {
  it('maps QLD names and skips blends', () => {
    expect(fuelCode('Premium Unleaded 95 ')).toBe('P95');
    expect(fuelCode('OPAL')).toBe('LAF');
    expect(fuelCode('e10/Unleaded')).toBeUndefined();
  });
});

describe('buildSnapshot', () => {
  const snap = buildSnapshot(ref, [
    { SiteId: 61290151, FuelId: 2, TransactionDateUtc: '2018-10-25T22:55:00', Price: 1679 },
    { SiteId: 61290151, FuelId: 5, Price: 9999 },
    { SiteId: 61290151, FuelId: 99, Price: 1800 },
  ]);

  it('maps sites with brand, suburb and full address', () => {
    expect(snap.stations).toEqual([{
      code: '61290151', state: 'QLD', postcode: '4417', suburb: 'Surat', name: 'Caltex Surat', brand: 'Caltex',
      address: '61 Burrowes St, Surat QLD 4417', lat: -27.151797, lng: 149.067802,
    }]);
  });

  it('converts tenths of a cent, reads UTC times, and skips unavailable or unmapped fuels', () => {
    expect(snap.prices).toEqual([{
      stationCode: '61290151', fuelType: 'U91', price: 167.9, updatedAt: new Date('2018-10-25T22:55:00Z'),
    }]);
  });
});
