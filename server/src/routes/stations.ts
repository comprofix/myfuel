import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.ts';
import { adapters, getAdapter } from '../sources/registry.ts';

const bboxQuery = z.object({
  bbox: z.string().transform((v, ctx) => {
    const n = v.split(',').map(Number);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) {
      ctx.addIssue({ code: 'custom', message: 'bbox must be minLng,minLat,maxLng,maxLat' });
      return z.NEVER;
    }
    return { minLng: n[0], minLat: n[1], maxLng: n[2], maxLat: n[3] };
  }),
  fuel: z.string().min(1).max(10),
});

const searchQuery = z.object({ q: z.string().trim().min(2).max(60) });
const idParams = z.object({ id: z.coerce.number().int() });
const historyQuery = z.object({ fuel: z.string().min(1).max(10), days: z.coerce.number().int().min(1).max(365).default(30) });

export async function stationRoutes(app: FastifyInstance) {
  // Credits for the map, one per provider with data
  app.get('/api/attributions', async () => {
    const ids = new Set((await sql<{ sourceId: string }[]>`select distinct source_id from stations`).map((r) => r.sourceId));
    return adapters.filter((a) => ids.has(a.id)).map((a) => a.attribution);
  });

  // Fuel types that currently have at least one price
  app.get('/api/fuel-types', async () => sql`
    select f.code, f.name from fuel_types f
    where exists (select 1 from current_prices p where p.fuel_type = f.code)
    order by f.sort`);

  // Postcode or suburb search, limited to states we have stations for.
  // Towns with a fuel station of the same name/postcode rank first, so
  // "2446" lists Wauchope before the small localities sharing its postcode.
  app.get('/api/localities', async (req) => {
    const { q } = searchQuery.parse(req.query);
    const match = /^\d+$/.test(q) ? sql`l.postcode like ${q + '%'}` : sql`lower(l.name) like ${q.toLowerCase() + '%'}`;
    return sql`
      select l.id, l.postcode, l.name, l.state, l.lat, l.lng,
             (select count(*)::int from stations s
              where s.postcode = l.postcode
                and (lower(s.suburb) = lower(l.name) or upper(s.address) like '%' || upper(l.name) || '%')) as station_count
      from localities l
      where l.state in (select distinct state from stations) and ${match}
      order by station_count desc, length(l.name), l.name
      limit 20`;
  });

  // Stations inside the map viewport selling the chosen fuel, cheapest first
  app.get('/api/stations', async (req) => {
    const { bbox: b, fuel } = bboxQuery.parse(req.query);
    return sql`
      select s.id, s.name, s.brand, s.address, s.state, s.lat, s.lng,
             p.price, p.source_updated_at
      from stations s
      join current_prices p on p.station_id = s.id and p.fuel_type = ${fuel}
      where s.lat between ${b.minLat} and ${b.maxLat}
        and s.lng between ${b.minLng} and ${b.maxLng}
      order by p.price, s.name
      limit 400`;
  });

  app.get('/api/stations/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const [station] = await sql<{ sourceId: string }[]>`
      select id, source_id, name, brand, address, suburb, state, postcode, lat, lng from stations where id = ${id}`;
    if (!station) return reply.code(404).send({ error: 'Station not found' });
    const prices = await sql`
      select p.fuel_type, coalesce(f.name, p.fuel_type) as fuel_name, p.price, p.source_updated_at
      from current_prices p left join fuel_types f on f.code = p.fuel_type
      where p.station_id = ${id}
      order by coalesce(f.sort, 999)`;
    return { ...station, prices, attribution: getAdapter(station.sourceId)?.attribution ?? null };
  });

  app.get('/api/stations/:id/history', async (req) => {
    const { id } = idParams.parse(req.params);
    const { fuel, days } = historyQuery.parse(req.query);
    return sql`
      select price, source_updated_at, recorded_at from price_history
      where station_id = ${id} and fuel_type = ${fuel}
        and recorded_at > now() - ${days + ' days'}::interval
      order by recorded_at`;
  });
}
