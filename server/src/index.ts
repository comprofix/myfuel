import { config } from './config.ts';
import { migrate, sql } from './db.ts';
import { buildApp } from './app.ts';
import { ensureAdminUser } from './auth.ts';
import { seedLocalities } from './localities.ts';
import { ensureSourceRows } from './sources/service.ts';
import { startPoller } from './poller.ts';

await migrate();
await ensureAdminUser();
await ensureSourceRows();
await seedLocalities();

const app = await buildApp();
await app.listen({ host: '0.0.0.0', port: config.port });
if (config.fixtureDir) app.log.warn(`FIXTURE_DIR set: reading prices from ${config.fixtureDir}, no API calls will be made`);
const stopPoller = config.pollerEnabled ? startPoller() : () => {};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    stopPoller();
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
