// POST /api/auth/signup-buyer — create a new buyer account, return session token
import { json, error, preflight, requireDB, parseJSON, isEmail, clean, genId, now } from '../../_lib/db.js';
import { hashPassword, createSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;
  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  const email = clean(body?.email).toLowerCase();
  const password = String(body?.password || '');
  const name = clean(body?.name);
  const phone = clean(body?.phone);

  if (!isEmail(email)) return error('Valid email required', 400);
  if (!password || password.length < 6) return error('Password must be at least 6 characters', 400);
  if (!name || name.length < 2) return error('Name is required', 400);

  // Check if buyer already exists
  const existing = await env.DB.prepare('SELECT id FROM buyers WHERE email = ?').bind(email).first();
  if (existing) return error('An account with this email already exists', 409);

  const id = genId('b');
  const passwordHash = await hashPassword(password);
  const created = now();

  await env.DB.prepare(
    `INSERT INTO buyers (id, email, password_hash, name, phone, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, email, passwordHash, name, phone || null, created).run();

  const session = await createSession(env, {
    userId: id,
    userType: 'buyer',
    ip: request.headers.get('CF-Connecting-IP'),
    userAgent: request.headers.get('User-Agent'),
  });

  return json({
    success: true,
    user: { id, email, name, role: 'buyer' },
    token: session.token,
    expiresAt: session.expires,
  });
}
