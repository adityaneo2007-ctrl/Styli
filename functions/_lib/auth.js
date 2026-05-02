// Auth helpers — password hashing, session tokens, current-user lookup.
// Note: SHA-256 + static salt is sufficient for prototype; production should use bcrypt/argon2.

import { json, error, now, genId } from './db.js';

const SALT = 'styli-prototype-salt-v1';
const SESSION_DAYS = 30;

// SHA-256 hash with static salt
export async function hashPassword(password) {
  const data = new TextEncoder().encode(SALT + (password || ''));
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password, expectedHash) {
  const candidate = await hashPassword(password);
  return candidate === expectedHash;
}

// Generate a random opaque session token
export function genSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create a new session row in D1 and return the token
export async function createSession(env, { userId, userType, userRole, ip, userAgent }) {
  const token = genSessionToken();
  const created = now();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, user_type, user_role, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(token, userId, userType, userRole || null, created, expires, ip || null, (userAgent || '').slice(0, 500))
    .run();
  return { token, expires };
}

// Look up the current user from the Authorization header (Bearer <token>)
// Returns { token, userId, userType, userRole } or null
export async function getSession(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+([a-f0-9]{32,})$/i);
  if (!m) return null;
  const token = m[1];

  const row = await env.DB.prepare(
    `SELECT token, user_id, user_type, user_role, expires_at
     FROM sessions WHERE token = ?`
  ).bind(token).first();

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Expired — delete it
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return {
    token: row.token,
    userId: row.user_id,
    userType: row.user_type,
    userRole: row.user_role,
  };
}

// Wrap a handler so it requires an authenticated session
// Usage: export const onRequestPost = requireAuth(async (ctx, session) => { ... });
export function requireAuth(handler, { types } = {}) {
  return async (context) => {
    const session = await getSession(context.env, context.request);
    if (!session) return error('Authentication required', 401);
    if (types && !types.includes(session.userType)) {
      return error('Forbidden — wrong user type', 403);
    }
    return handler(context, session);
  };
}

// Permission check for team users — reads from permissions table
export async function teamCan(env, action, role) {
  const row = await env.DB.prepare('SELECT roles FROM permissions WHERE action = ?')
    .bind(action).first();
  if (!row) return false;
  try {
    const roles = JSON.parse(row.roles);
    return Array.isArray(roles) && roles.includes(role);
  } catch {
    return false;
  }
}
