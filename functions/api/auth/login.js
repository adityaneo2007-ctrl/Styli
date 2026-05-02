// POST /api/auth/login — universal login for buyer / vendor / team member
// Body: { email, password, type: 'buyer'|'vendor'|'team' }
import { json, error, preflight, requireDB, parseJSON, isEmail, clean, now } from '../../_lib/db.js';
import { verifyPassword, createSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;
  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  const email = clean(body?.email).toLowerCase();
  const password = String(body?.password || '');
  const type = ['buyer', 'vendor', 'team'].includes(body?.type) ? body.type : 'buyer';

  if (!isEmail(email)) return error('Valid email required', 400);
  if (!password) return error('Password required', 400);

  // Look up user in the appropriate table
  let user;
  if (type === 'buyer') {
    user = await env.DB.prepare('SELECT id, email, password_hash, name FROM buyers WHERE email = ?').bind(email).first();
  } else if (type === 'vendor') {
    user = await env.DB.prepare('SELECT id, email, password_hash, business_name AS name, status FROM vendors WHERE email = ?').bind(email).first();
    if (user && user.status !== 'approved') return error('Your vendor application is still pending approval', 403);
  } else {
    user = await env.DB.prepare('SELECT id, email, password_hash, name, role, status FROM team_members WHERE email = ?').bind(email).first();
    if (user && user.status !== 'active') return error('Account is disabled', 403);
  }

  if (!user) return error('Invalid email or password', 401);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return error('Invalid email or password', 401);

  // Update last_login_at / last_active_at
  if (type === 'buyer') {
    await env.DB.prepare('UPDATE buyers SET last_login_at = ? WHERE id = ?').bind(now(), user.id).run();
  } else if (type === 'team') {
    await env.DB.prepare('UPDATE team_members SET last_active_at = ? WHERE id = ?').bind(now(), user.id).run();
  }

  const session = await createSession(env, {
    userId: user.id,
    userType: type,
    userRole: type === 'team' ? user.role : null,
    ip: request.headers.get('CF-Connecting-IP'),
    userAgent: request.headers.get('User-Agent'),
  });

  return json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role || type },
    token: session.token,
    expiresAt: session.expires,
  });
}
