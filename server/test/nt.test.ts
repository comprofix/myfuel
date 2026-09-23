import { describe, expect, it } from 'vitest';
import { extractServerJson, parseNtResults } from '../src/sources/nt.ts';

const data = {
  FuelBrandList: [{ Text: 'Shell Reddy Express', Value: 'C3' }],
  FuelOutlet: [
    {
      FuelOutletId: 42, FuelOutletIdentifier: '08300042', OutletName: 'SHELL REDDY EXPRESS PALMERSTON',
      OutletBrandIdentifier: 'C3', Address: '2 YARRAWONGA RD ', Suburb: 'PALMERSTON  ', Postcode: '0830',
      OutletState: 'NT', Latitude: -12.47, Longitude: 130.98, IsActive: true,
      AvailableFuels: [
        { FuelCode: 'DL', Price: 310.9, isAvailable: true },
        { FuelCode: 'PD', Price: 320.9, isAvailable: true },
        { FuelCode: 'U91', Price: 250, isAvailable: false },
        { FuelCode: 'LAF', Price: 0, isAvailable: true },
      ],
    },
    { FuelOutletId: 7, OutletName: 'Closed', Latitude: -12, Longitude: 131, IsActive: false, AvailableFuels: [] },
  ],
};

describe('extractServerJson', () => {
  it('decodes the HTML-encoded hidden input', () => {
    const encoded = JSON.stringify({ FuelOutlet: [{ OutletName: 'A & B "C"' }] })
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const html = `<html><input type="hidden" id="serverJson" value="${encoded}"></html>`;
    expect(extractServerJson(html).FuelOutlet?.[0].OutletName).toBe('A & B "C"');
  });

  it('fails loudly if the page layout changes', () => {
    expect(() => extractServerJson('<html>maintenance</html>')).toThrow(/layout changed/);
  });
});

describe('parseNtResults', () => {
  const snap = parseNtResults(data as never);

  it('maps active outlets with brand names and a full address', () => {
    expect(snap.stations).toEqual([{
      code: '08300042', state: 'NT', postcode: '0830', suburb: 'Palmerston',
      name: 'SHELL REDDY EXPRESS PALMERSTON', brand: 'Shell Reddy Express',
      address: '2 YARRAWONGA RD, Palmerston NT 0830', lat: -12.47, lng: 130.98,
    }]);
  });

  it('maps PD to PDL and skips unavailable or zero prices', () => {
    expect(snap.prices.map((p) => [p.fuelType, p.price, p.updatedAt])).toEqual([['DL', 310.9, null], ['PDL', 320.9, null]]);
  });
});
