import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import { config } from './config.ts';

export const sql = postgres(config.databaseUrl, {
  transform: postgres.camel,
  onnotice: () => {},
});

export type Sql = typeof sql;

const migrationsDir = new URL('../migrations/', import.meta.url);

export async function migrate(): Promise<void> {
  await sql`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  await sql.begin(async (tx) => {
    // Serialise migrations if two app instances start at once
    await tx`select pg_advisory_xact_lock(7243901)`;
    const applied = new Set((await tx<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version));
    for (const file of files) {
      if (applied.has(file)) continue;
      await tx.unsafe(await readFile(new URL(file, migrationsDir), 'utf8'));
      await tx`insert into schema_migrations (version) values (${file})`;
      console.log(`applied migration ${file}`);
    }
  });
}
