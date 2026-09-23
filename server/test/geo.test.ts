import { describe, expect, it } from 'vitest';
import { parseAuAddress, stateForPostcode } from '../src/geo.ts';

describe('parseAuAddress', () => {
  it.each([
    ['6 GOLD CREEK RD, NICHOLLS ACT 2913', 'ACT', '2913'],
    ['232 HIGH ST, WAUCHOPE NSW 2446', 'NSW', '2446'],
    ['3096 MARLBOROUGH RD, MIENA TAS 7030', 'TAS', '7030'],
    ['456, Metford Road, Metford NEW SOUTH WALES 2323', 'NSW', '2323'],
    ['52 Hill Street, Uralla, NSW  2358, AU', 'NSW', '2358'],
    // Queanbeyan is NSW even though it borders Canberra
    ['1 Uriarra Rd, Queanbeyan NSW 2620', 'NSW', '2620'],
    // House number isn't mistaken for a postcode
    ['1234 Pacific Hwy, Somewhere 2600', 'ACT', '2600'],
  ])('%s -> %s %s', (address, state, postcode) => {
    expect(parseAuAddress(address)).toEqual({ state, postcode });
  });

  it('handles missing input', () => {
    expect(parseAuAddress(null)).toEqual({ state: null, postcode: null });
    expect(parseAuAddress('Corner of Main St and High St')).toEqual({ state: null, postcode: null });
  });
});

describe('stateForPostcode', () => {
  it.each([
    ['2600', 'ACT'], ['2618', 'ACT'], ['2619', 'NSW'], ['2900', 'ACT'], ['2920', 'ACT'], ['2921', 'NSW'],
    ['0200', 'ACT'], ['0800', 'NT'], ['2000', 'NSW'], ['3000', 'VIC'], ['4000', 'QLD'],
    ['5000', 'SA'], ['6000', 'WA'], ['7000', 'TAS'],
  ])('%s -> %s', (pc, state) => expect(stateForPostcode(pc)).toBe(state));

  it('rejects non-postcodes', () => expect(stateForPostcode('12')).toBeNull());
});
