import { sql } from './db.ts';
import type { Snapshot } from './sources/types.ts';

const CHUNK = 2000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Apply a full snapshot of one region: upsert stations, record price changes in
 * history, replace current prices, and drop prices no longer reported.
 */
export async function ingestSnapshot(sourceId: string, region: string, snap: Snapshot) {
  return sql.begin(async (tx) => {
    const stationRows = snap.stations.map((s) => ({
      sourceId, region, state: s.state, code: s.code, name: s.name, brand: s.brand,
      address: s.address, postcode: s.postcode, suburb: s.suburb ?? null, lat: s.lat, lng: s.lng,
    }));
    for (const rows of chunks(stationRows)) {
      await tx`
        insert into stations ${tx(rows)}
        on conflict (source_id, region, code) do update set
          state = excluded.state, name = excluded.name, brand = excluded.brand, address = excluded.address,
          postcode = coalesce(excluded.postcode, stations.postcode), suburb = excluded.suburb,
          lat = excluded.lat, lng = excluded.lng, last_seen_at = now()`;
    }

    // Feeds without postcodes (WA): look them up from the suburb name
    await tx`
      update stations s set postcode = (
        select l.postcode from localities l
        where l.state = s.state and lower(l.name) = lower(s.suburb) order by l.postcode limit 1)
      where s.source_id = ${sourceId} and s.region = ${region} and s.postcode is null and s.suburb is not null`;

    const ids = new Map<string, number>();
    for (const r of await tx<{ id: number; code: string }[]>`
      select id, code from stations where source_id = ${sourceId} and region = ${region}`) ids.set(r.code, r.id);

    // Last value wins if the feed repeats a station/fuel pair
    const incoming = new Map<string, { stationId: number; fuelType: string; price: number; sourceUpdatedAt: Date | null }>();
    for (const p of snap.prices) {
      const stationId = ids.get(p.stationCode);
      if (stationId) incoming.set(`${stationId}:${p.fuelType}`, { stationId, fuelType: p.fuelType, price: p.price, sourceUpdatedAt: p.updatedAt });
    }

    await tx`create temp table incoming (
      station_id int, fuel_type text, price double precision, source_updated_at timestamptz
    ) on commit drop`;
    for (const rows of chunks([...incoming.values()])) await tx`insert into incoming ${tx(rows)}`;

    // Feeds without timestamps (NT): keep the time we first saw an unchanged price, else now
    await tx`
      update incoming i set source_updated_at = coalesce(
        (select c.source_updated_at from current_prices c
         where c.station_id = i.station_id and c.fuel_type = i.fuel_type and c.price = i.price),
        now())
      where i.source_updated_at is null`;

    const changed = await tx`
      insert into price_history (station_id, fuel_type, price, source_updated_at)
      select i.station_id, i.fuel_type, i.price, i.source_updated_at
      from incoming i left join current_prices c using (station_id, fuel_type)
      where c.price is distinct from i.price`;

    await tx`
      insert into current_prices (station_id, fuel_type, price, source_updated_at, fetched_at)
      select station_id, fuel_type, price, source_updated_at, now() from incoming
      on conflict (station_id, fuel_type) do update set
        price = excluded.price, source_updated_at = excluded.source_updated_at, fetched_at = excluded.fetched_at`;

    await tx`
      delete from current_prices c using stations s
      where c.station_id = s.id and s.source_id = ${sourceId} and s.region = ${region}
        and not exists (select 1 from incoming i where i.station_id = c.station_id and i.fuel_type = c.fuel_type)`;

    return { stations: stationRows.length, prices: incoming.size, changed: changed.count };
  });
}
