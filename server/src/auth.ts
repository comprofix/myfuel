import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql } from './db.ts';
import { config } from './config.ts';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto.ts';

export const SESSION_COOKIE = 'myfuel_session';
const SESSION_DAYS = 30;

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: number; username: string };
  }
}

/** Create the first admin from env when the users table is empty */
export async function ensureAdminUser(): Promise<void> {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from users`;
  if (count > 0) return;
  if (!config.adminPassword) throw new Error('No users exist yet: set ADMIN_PASSWORD to create the first admin');
  await sql`insert into users (username, password_hash)
            values (${config.adminUsername}, ${await hashPassword(config.adminPassword)})`;
  console.log(`created admin user "${config.adminUsername}"`);
}

async function loadUser(req: FastifyRequest) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return undefined;
  const [row] = await sql<{ id: number; username: string }[]>`
    select u.id, u.username from sessions s join users u on u.id = s.user_id
    where s.id = ${sha256(token)} and s.expires_at > now()`;
  return row;
}

/** Every /api route except login requires a session */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  req.user = await loadUser(req);
  if (!req.user) return reply.code(401).send({ error: 'Not signed in' });
}

const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });
const passwordBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = loginBody.parse(req.body);
    const [user] = await sql<{ id: number; username: string; passwordHash: string }[]>`
      select id, username, password_hash from users where username = ${body.username}`;
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    const token = newToken();
    await sql`delete from sessions where expires_at < now()`;
    await sql`insert into sessions (id, user_id, expires_at)
              values (${sha256(token)}, ${user.id}, now() + ${SESSION_DAYS + ' days'}::interval)`;
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: SESSION_DAYS * 86400,
    });
    return { id: user.id, username: user.username };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await sql`delete from sessions where id = ${sha256(token)}`;
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => req.user);

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const body = passwordBody.parse(req.body);
    const [user] = await sql<{ passwordHash: string }[]>`select password_hash from users where id = ${req.user!.id}`;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: 'Current password is incorrect' });
    }
    await sql`update users set password_hash = ${await hashPassword(body.newPassword)} where id = ${req.user!.id}`;
    // Sign out other sessions
    await sql`delete from sessions where user_id = ${req.user!.id} and id <> ${sha256(req.cookies[SESSION_COOKIE]!)}`;
    return { ok: true };
  });
}
