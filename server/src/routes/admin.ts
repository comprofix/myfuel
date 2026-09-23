import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.ts';
import { pollRegion } from '../poller.ts';
import { adapters, getAdapter } from '../sources/registry.ts';
import { projectMonthlyCalls } from '../sources/projection.ts';
import { buildContext, callsThisMonth, isConfigured, loadSource, saveSource } from '../sources/service.ts';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const settingsSchema = z.object({
  regions: z.record(z.string(), z.object({ enabled: z.boolean(), intervalMinutes: z.number().int().min(5).max(1440) })),
  quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
  monthlyLimit: z.number().int().min(0),
  reserve: z.number().int().min(0),
});

const updateBody = z.object({
  settings: settingsSchema.optional(),
  // Blank/omitted secret fields keep the stored value
  credentials: z.record(z.string(), z.string()).optional(),
});

const sourceParams = z.object({ id: z.string() });
const pollBody = z.object({ region: z.string() });
const runsQuery = z.object({ source: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

async function describeSource(id: string) {
  const s = await loadSource(id);
  const a = s.adapter;
  const [lastRuns, callsUsed, stationCounts] = await Promise.all([
    sql`select distinct on (region) region, started_at, finished_at, ok, stations, prices, changed, error
        from poll_runs where source_id = ${id} order by region, started_at desc`,
    callsThisMonth(id),
    sql`select region, count(*)::int as count from stations where source_id = ${id} group by region`,
  ]);
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    signupUrl: a.signupUrl,
    attribution: a.attribution,
    hasQuota: a.hasQuota,
    regions: a.regions,
    regionNotes: a.regionNotes ?? {},
    configured: isConfigured(s),
    settings: s.settings,
    credentialFields: a.credentialFields,
    // Never return secrets; show which fields are set and non-secret values
    credentials: Object.fromEntries(a.credentialFields.map((f) => [
      f.key,
      { set: Boolean(s.credentials?.[f.key]), value: f.secret ? null : (s.credentials?.[f.key] ?? null) },
    ])),
    usage: { callsThisMonth: callsUsed, projectedMonthly: projectMonthlyCalls(a, s.settings) },
    lastRuns,
    stationCounts,
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/sources', async () => Promise.all(adapters.map((a) => describeSource(a.id))));

  app.get('/api/admin/sources/:id', async (req, reply) => {
    const { id } = sourceParams.parse(req.params);
    if (!getAdapter(id)) return reply.code(404).send({ error: 'Unknown source' });
    return describeSource(id);
  });

  app.put('/api/admin/sources/:id', async (req, reply) => {
    const { id } = sourceParams.parse(req.params);
    const adapter = getAdapter(id);
    if (!adapter) return reply.code(404).send({ error: 'Unknown source' });
    const body = updateBody.parse(req.body);

    let credentials: Record<string, string> | undefined;
    if (body.credentials) {
      const current = (await loadSource(id)).credentials ?? {};
      credentials = {};
      for (const f of adapter.credentialFields) {
        const v = body.credentials[f.key]?.trim();
        credentials[f.key] = v ? v : (current[f.key] ?? '');
      }
    }
    await saveSource(id, { settings: body.settings, credentials });
    return describeSource(id);
  });

  app.post('/api/admin/sources/:id/test', async (req) => {
    const { id } = sourceParams.parse(req.params);
    const source = await loadSource(id);
    try {
      return { ok: true, message: await source.adapter.testConnection(await buildContext(source)) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/api/admin/sources/:id/poll', async (req) => {
    const { id } = sourceParams.parse(req.params);
    const { region } = pollBody.parse(req.body);
    try {
      return { ok: true, ...(await pollRegion(id, region, 'manual')) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get('/api/admin/poll-runs', async (req) => {
    const { source, limit } = runsQuery.parse(req.query);
    return sql`
      select id, source_id, region, trigger, started_at, finished_at, ok, stations, prices, changed, error
      from poll_runs ${source ? sql`where source_id = ${source}` : sql``}
      order by started_at desc limit ${limit}`;
  });
}
