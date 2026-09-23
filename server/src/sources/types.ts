export interface SnapshotStation {
  code: string;
  /** State the station is physically in, which may differ from the feed region (ACT stations in the NSW feed) */
  state: string;
  postcode: string | null;
  suburb?: string | null;
  name: string;
  brand: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

export interface SnapshotPrice {
  stationCode: string;
  fuelType: string;
  price: number; // cents per litre
  /** When the provider says the price was set; null if it doesn't say (we then use when we first saw it) */
  updatedAt: Date | null;
}

/** A full picture of one region's stations and prices at a point in time */
export interface Snapshot {
  stations: SnapshotStation[];
  prices: SnapshotPrice[];
}

export interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
  help?: string;
}

export interface RegionSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export interface SourceSettings {
  regions: Record<string, RegionSettings>;
  quietHours: { enabled: boolean; start: string; end: string };
  /** Calls allowed per calendar month on the provider's plan (ignored when the adapter has no quota) */
  monthlyLimit: number;
  /** Calls the poller leaves unused each month, for manual testing */
  reserve: number;
}

export interface AdapterContext {
  credentials: Record<string, string>;
  /** Makes an HTTP request that counts against the monthly quota */
  call(kind: string, region: string | null, url: string, init: RequestInit): Promise<Response>;
  cachedToken(): string | null;
  saveToken(token: string, expiresAt: Date): Promise<void>;
  clearToken(): Promise<void>;
  fixtureDir?: string;
}

export interface SourceAdapter {
  id: string;
  name: string;
  description: string;
  signupUrl: string;
  /** Credit shown on the map, required by most providers' terms */
  attribution: { text: string; url: string };
  /** Whether the provider enforces a monthly call quota */
  hasQuota: boolean;
  regions: string[];
  /** Short notes shown next to a region, e.g. which other states its feed includes */
  regionNotes?: Record<string, string>;
  credentialFields: CredentialField[];
  defaultSettings: SourceSettings;
  /** Estimated calls per poll of a region, excluding token refreshes */
  callsPerPoll: number;
  /** Estimated token requests per day */
  tokenCallsPerDay: number;
  testConnection(ctx: AdapterContext): Promise<string>;
  fetchRegion(ctx: AdapterContext, region: string): Promise<Snapshot>;
}
