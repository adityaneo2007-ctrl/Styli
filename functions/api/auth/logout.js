// POST /api/auth/logout — invalidate the current session
import { json, error, preflight, requireDB } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (session) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(session.token).run();
  }
  return json({ success: true });
}
