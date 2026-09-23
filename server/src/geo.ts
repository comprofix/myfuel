const STATE_NAMES: Record<string, string> = {
  'NEW SOUTH WALES': 'NSW', 'AUSTRALIAN CAPITAL TERRITORY': 'ACT', VICTORIA: 'VIC', QUEENSLAND: 'QLD',
  'SOUTH AUSTRALIA': 'SA', 'WESTERN AUSTRALIA': 'WA', TASMANIA: 'TAS', 'NORTHERN TERRITORY': 'NT',
};

// A state (abbreviation or full name) followed by a postcode, e.g. "NICHOLLS ACT 2913" or "NSW  2358, AU"
const STATE_POSTCODE = new RegExp(
  `\\b(NSW|ACT|VIC|QLD|SA|WA|TAS|NT|${Object.keys(STATE_NAMES).join('|')})[\\s,]+(\\d{4})\\b`, 'gi');

const POSTCODE_RANGES: [number, number, string][] = [
  [200, 299, 'ACT'], [2600, 2618, 'ACT'], [2900, 2920, 'ACT'],
  [800, 999, 'NT'],
  [1000, 2999, 'NSW'],
  [3000, 3999, 'VIC'], [8000, 8999, 'VIC'],
  [4000, 4999, 'QLD'], [9000, 9999, 'QLD'],
  [5000, 5999, 'SA'],
  [6000, 6999, 'WA'],
  [7000, 7999, 'TAS'],
];

/** Australia Post postcode ranges; first match wins, so ACT carve-outs precede NSW */
export function stateForPostcode(postcode: string | null): string | null {
  if (!postcode || !/^\d{4}$/.test(postcode)) return null;
  const n = Number(postcode);
  return POSTCODE_RANGES.find(([lo, hi]) => n >= lo && n <= hi)?.[2] ?? null;
}

/** Pull the state and postcode out of a free-text Australian address */
export function parseAuAddress(address: string | null): { state: string | null; postcode: string | null } {
  if (!address) return { state: null, postcode: null };
  const matches = [...address.matchAll(STATE_POSTCODE)];
  const last = matches.at(-1);
  if (last) {
    const token = last[1].toUpperCase();
    return { state: STATE_NAMES[token] ?? token, postcode: last[2] };
  }
  const postcode = address.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)?.[1] ?? null;
  return { state: stateForPostcode(postcode), postcode };
}

/** "BRABHAM" / "tennant creek  " -> "Brabham" / "Tennant Creek" */
export function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
