// GET /api/auth/me — return the currently logged-in user
import { json, error, preflight, requireDB } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session) return error('Not authenticated', 401);

  let user;
  if (session.userType === 'buyer') {
    user = await env.DB.prepare(
      `SELECT id, email, name, phone, city, created_at FROM buyers WHERE id = ?`
    ).bind(session.userId).first();
    // Also load profile if exists
    if (user) {
      const profile = await env.DB.prepare(
        `SELECT * FROM buyer_profiles WHERE buyer_id = ?`
      ).bind(session.userId).first();
      user.profile = profile || null;
    }
  } else if (session.userType === 'vendor') {
    user = await env.DB.prepare(
      `SELECT id, email, business_name AS name, type, city, gst, phone, status, score FROM vendors WHERE id = ?`
    ).bind(session.userId).first();
  } else if (session.userType === 'team') {
    user = await env.DB.prepare(
      `SELECT id, email, name, role, joined_at, status FROM team_members WHERE id = ?`
    ).bind(session.userId).first();
  }

  if (!user) return error('User not found', 404);

  return json({
    user: { ...user, role: session.userRole || session.userType },
    type: session.userType,
  });
}
