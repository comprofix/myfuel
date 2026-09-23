import { fileURLToPath } from 'node:url';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  databaseUrl:
    env.DATABASE_URL ??
    `postgres://${env.POSTGRES_USER ?? 'myfuel'}:${encodeURIComponent(required('POSTGRES_PASSWORD'))}` +
      `@${env.POSTGRES_HOST ?? 'localhost'}:${env.POSTGRES_PORT ?? 5432}/${env.POSTGRES_DB ?? 'myfuel'}`,
  appSecret: required('APP_SECRET'),
  adminUsername: env.ADMIN_USERNAME ?? 'admin',
  adminPassword: env.ADMIN_PASSWORD,
  // Secure by default in production (HTTPS behind Traefik); set COOKIE_SECURE=false only for local HTTP testing
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  // Dev only: read prices-<STATE>.json from here instead of calling the NSW API
  fixtureDir: env.FIXTURE_DIR,
  webDist: env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
  pollerEnabled: env.POLLER_ENABLED !== 'false',
};

if (config.appSecret.length < 16) throw new Error('APP_SECRET must be at least 16 characters');
