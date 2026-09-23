import { readFile } from 'node:fs/promises';
import { sql } from './db.ts';

/** Load the bundled GeoNames postcode list on first start */
export async function seedLocalities(): Promise<void> {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from localities`;
  if (count > 0) return;
  const text = await readFile(new URL('../data/localities.tsv', import.meta.url), 'utf8');
  const rows = text.trim().split('\n').map((line) => {
    const [postcode, name, state, lat, lng] = line.split('\t');
    return { postcode, name, state, lat: Number(lat), lng: Number(lng) };
  });
  for (let i = 0; i < rows.length; i += 2000) await sql`insert into localities ${sql(rows.slice(i, i + 2000))}`;
  console.log(`seeded ${rows.length} localities`);
}
