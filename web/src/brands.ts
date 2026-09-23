/**
 * Brand styling for map pins: each feed spells brands its own way
 * ("EG Ampol", "Ampol Foodary", "AMPOL"...), so names are grouped by pattern
 * into one style. Colours approximate each chain's livery; no logo files.
 */
export interface BrandStyle {
  key: string;
  label: string;
  /** Teardrop body */
  bg: string;
  /** Inner circle */
  inner: string;
  /** Mark colour */
  fg: string;
  /** 1–3 characters drawn in the circle */
  mark: string;
}

const BRANDS: (BrandStyle & { match: RegExp })[] = [
  { key: 'shell', label: 'Shell', match: /shell|reddy express|coles express|viva energy/, bg: '#dd1d21', inner: '#fbce07', fg: '#dd1d21', mark: 'S' },
  { key: 'bp', label: 'BP', match: /\bbp\b/, bg: '#007f3b', inner: '#ffe600', fg: '#007f3b', mark: 'bp' },
  { key: 'ampol', label: 'Ampol', match: /ampol/, bg: '#0a2d8f', inner: '#e4002b', fg: '#ffffff', mark: 'A' },
  { key: 'caltex', label: 'Caltex', match: /caltex|star mart/, bg: '#e2231a', inner: '#ffffff', fg: '#e2231a', mark: '★' },
  { key: '7eleven', label: '7-Eleven', match: /7[\s-]?eleven/, bg: '#008163', inner: '#ffffff', fg: '#ee2a24', mark: '7' },
  { key: 'united', label: 'United', match: /united/, bg: '#0033a0', inner: '#ffd200', fg: '#0033a0', mark: 'U' },
  { key: 'metro', label: 'Metro', match: /metro/, bg: '#003da5', inner: '#ffffff', fg: '#e30613', mark: 'M' },
  { key: 'mobil', label: 'Mobil', match: /mobil/, bg: '#1e3a8a', inner: '#ffffff', fg: '#ed1c24', mark: 'M' },
  { key: 'liberty', label: 'Liberty', match: /liberty/, bg: '#002f6c', inner: '#e31837', fg: '#ffffff', mark: 'L' },
  { key: 'puma', label: 'Puma', match: /puma/, bg: '#d7182a', inner: '#ffffff', fg: '#d7182a', mark: 'P' },
  { key: 'speedway', label: 'Speedway', match: /speedway/, bg: '#1d1d1b', inner: '#f5a800', fg: '#1d1d1b', mark: 'Sw' },
  { key: 'vibe', label: 'Vibe', match: /vibe/, bg: '#6d2077', inner: '#ffffff', fg: '#6d2077', mark: 'V' },
  { key: 'pearl', label: 'Pearl Energy', match: /pearl/, bg: '#00818f', inner: '#ffffff', fg: '#00818f', mark: 'P' },
  { key: 'costco', label: 'Costco', match: /costco/, bg: '#005daa', inner: '#e31837', fg: '#ffffff', mark: 'C' },
  { key: 'budget', label: 'Budget', match: /budget/, bg: '#f7941d', inner: '#ffffff', fg: '#c2410c', mark: 'B' },
  { key: 'otr', label: 'On The Run', match: /on the run|\botr\b/, bg: '#2b2b2b', inner: '#fdb913', fg: '#2b2b2b', mark: 'OTR' },
  { key: 'atlas', label: 'Atlas', match: /atlas/, bg: '#b91c1c', inner: '#ffffff', fg: '#b91c1c', mark: 'A' },
  { key: 'enhance', label: 'Enhance', match: /enhance/, bg: '#00539f', inner: '#ffffff', fg: '#00539f', mark: 'E' },
  { key: 'astron', label: 'Astron', match: /astron/, bg: '#111827', inner: '#ffffff', fg: '#111827', mark: 'A' },
  { key: 'gull', label: 'Gull', match: /gull/, bg: '#0055a5', inner: '#ffcc00', fg: '#0055a5', mark: 'G' },
  { key: 'betterchoice', label: 'Better Choice', match: /better choice/, bg: '#00843d', inner: '#ffffff', fg: '#00843d', mark: 'BC' },
  { key: 'nrma', label: 'NRMA', match: /nrma/, bg: '#0072ce', inner: '#ffffff', fg: '#0072ce', mark: 'N' },
  { key: 'lowes', label: 'Lowes', match: /lowes/, bg: '#1f4e9c', inner: '#ffffff', fg: '#1f4e9c', mark: 'Lo' },
];

const INDEPENDENT: BrandStyle = { key: 'independent', label: 'Independent', bg: '#6b7280', inner: '#ffffff', fg: '#4b5563', mark: '⛽' };

const cache = new Map<string, BrandStyle>();

export function brandStyle(brand: string | null): BrandStyle {
  const name = (brand ?? '').toLowerCase();
  let style = cache.get(name);
  if (!style) {
    style = BRANDS.find((b) => b.match.test(name)) ?? INDEPENDENT;
    cache.set(name, style);
  }
  return style;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Teardrop pin as inline SVG (26×34, tip at bottom centre) */
export function teardropSvg(b: BrandStyle): string {
  const size = b.mark.length >= 3 ? 6.5 : b.mark.length === 2 ? 8.5 : 11;
  return `<svg class="drop" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">
    <path d="M13 33C13 33 1.5 20 1.5 12.5a11.5 11.5 0 1 1 23 0C24.5 20 13 33 13 33Z" fill="${b.bg}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="13" cy="12.5" r="8" fill="${b.inner}"/>
    <text x="13" y="12.5" dy="0.36em" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800"
          font-size="${size}" fill="${b.fg}">${esc(b.mark)}</text>
  </svg>`;
}
