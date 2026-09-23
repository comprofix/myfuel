import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { authRoutes, requireAuth } from './auth.ts';
import { stationRoutes } from './routes/stations.ts';
import { adminRoutes } from './routes/admin.ts';

export async function buildApp() {
  // trustProxy: runs behind Traefik in production
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Internal server error' : (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);

  // Everything else under /api requires a signed-in user
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);
    await secured.register(stationRoutes);
    await secured.register(adminRoutes);
  });

  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    // Client-side routing: unknown non-API paths serve the SPA shell
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'));
  }

  return app;
}
