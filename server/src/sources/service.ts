import { config } from '../config.ts';
import { sql } from '../db.ts';
import { decrypt, deriveKey, encrypt } from '../crypto.ts';
import { adapters, getAdapter } from './registry.ts';
import type { AdapterContext, SourceAdapter, SourceSettings } from './types.ts';

const key = deriveKey(config.appSecret);

export class BudgetExceededError extends Error {}

interface SourceRow {
  id: string;
  credentials: string | null;
  token: string | null;
  tokenExpiresAt: Date | null;
  settings: Partial<SourceSettings>;
}

export interface LoadedSource {
  adapter: SourceAdapter;
  settings: SourceSettings;
  credentials: Record<string, string> | null;
}

/** Insert a row for every known adapter so settings can be edited */
export async function ensureSourceRows(): Promise<void> {
  for (const a of adapters) {
    await sql`insert into data_sources (id, settings) values (${a.id}, ${sql.json(a.defaultSettings as never)})
              on conflict (id) do nothing`;
  }
}

function mergeSettings(adapter: SourceAdapter, stored: Partial<SourceSettings>): SourceSettings {
  const d = adapter.defaultSettings;
  const regions: SourceSettings['regions'] = {};
  for (const r of adapter.regions) regions[r] = { ...d.regions[r], ...stored.regions?.[r] };
  return { ...d, ...stored, regions, quietHours: { ...d.quietHours, ...stored.quietHours } };
}

export async function loadSource(id: string): Promise<LoadedSource> {
  const adapter = getAdapter(id);
  if (!adapter) throw new Error(`Unknown data source ${id}`);
  const [row] = await sql<SourceRow[]>`select * from data_sources where id = ${id}`;
  return {
    adapter,
    settings: mergeSettings(adapter, row?.settings ?? {}),
    credentials: row?.credentials ? JSON.parse(decrypt(key, row.credentials)) : null,
  };
}

export async function saveSource(
  id: string,
  update: { settings?: SourceSettings; credentials?: Record<string, string> },
): Promise<void> {
  if (update.settings) await sql`update data_sources set settings = ${sql.json(update.settings as never)} where id = ${id}`;
  if (update.credentials) {
    // New credentials invalidate any cached token
    await sql`update data_sources set credentials = ${encrypt(key, JSON.stringify(update.credentials))},
              token = null, token_expires_at = null where id = ${id}`;
  }
  await sql`update data_sources set updated_at = now() where id = ${id}`;
}

/** Calls made this calendar month (Sydney time) */
export async function callsThisMonth(sourceId: string): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from api_calls
    where source_id = ${sourceId}
      and at >= date_trunc('month', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney'`;
  return count;
}

/** A source can poll once its credentials are saved (or fixtures stand in for the API in dev) */
export function isConfigured(source: LoadedSource): boolean {
  return Boolean(config.fixtureDir) ||
    source.adapter.credentialFields.every((f) => Boolean(source.credentials?.[f.key]));
}

export async function buildContext(source: LoadedSource): Promise<AdapterContext> {
  const id = source.adapter.id;
  if (!isConfigured(source)) throw new Error('No API credentials saved for this source');
  const [row] = await sql<SourceRow[]>`select token, token_expires_at from data_sources where id = ${id}`;
  // Treat tokens as expired 10 minutes early
  let token = row?.token && row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() > 10 * 60000
    ? decrypt(key, row.token)
    : null;

  return {
    credentials: source.credentials ?? {},
    fixtureDir: config.fixtureDir,
    cachedToken: () => token,
    async saveToken(value, expiresAt) {
      token = value;
      await sql`update data_sources set token = ${encrypt(key, value)}, token_expires_at = ${expiresAt} where id = ${id}`;
    },
    async clearToken() {
      token = null;
      await sql`update data_sources set token = null, token_expires_at = null where id = ${id}`;
    },
    async call(kind, region, url, init) {
      if (source.adapter.hasQuota) {
        const used = await callsThisMonth(id);
        if (used >= source.settings.monthlyLimit) {
          throw new BudgetExceededError(`Monthly API limit reached (${used}/${source.settings.monthlyLimit})`);
        }
      }
      let status: number | null = null;
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
        status = res.status;
        return res;
      } finally {
        await sql`insert into api_calls (source_id, kind, region, status) values (${id}, ${kind}, ${region}, ${status})`;
      }
    },
  };
}
