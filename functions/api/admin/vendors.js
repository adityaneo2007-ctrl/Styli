// GET   /api/admin/vendors            — list applications (?status=pending|approved|rejected)
// POST  /api/admin/vendors             — admin action: { applicationId, action: 'approve'|'reject', note? }
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession, teamCan } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'team') return error('Team login required', 401);
  if (!await teamCan(env, 'view.vendors', session.userRole)) return error('Forbidden', 403);

  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 20);
  let sql = `SELECT id, business_name, email, type, city, gst, phone, status, applied_at, reviewed_at, score
             FROM vendor_applications`;
  const binds = [];
  if (status) { sql += ' WHERE status = ?'; binds.push(status); }
  sql += ' ORDER BY applied_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ applications: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'team') return error('Team login required', 401);
  if (!await teamCan(env, 'edit.vendors.approve', session.userRole)) return error('Forbidden — needs approve permission', 403);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;
  const applicationId = clean(body?.applicationId, 50);
  const action = clean(body?.action, 20);
  const note = clean(body?.note, 500);

  const app = await env.DB.prepare(
    'SELECT * FROM vendor_applications WHERE id = ?'
  ).bind(applicationId).first();
  if (!app) return error('Application not found', 404);

  const t = now();

  if (action === 'approve') {
    // Mark application approved
    await env.DB.prepare(
      `UPDATE vendor_applications SET status = 'approved', reviewed_at = ?, review_note = ? WHERE id = ?`
    ).bind(t, note || null, applicationId).run();

    // Promote to active vendor
    await env.DB.prepare(
      `INSERT OR IGNORE INTO vendors
        (id, application_id, business_name, email, password_hash, type, city, gst, phone, status, score, score_trend, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 90, 'stable', ?)`
    ).bind(
      app.id, app.id, app.business_name, app.email, app.password_hash,
      app.type, app.city, app.gst, app.phone, t
    ).run();
  } else if (action === 'reject') {
    await env.DB.prepare(
      `UPDATE vendor_applications SET status = 'rejected', reviewed_at = ?, review_note = ? WHERE id = ?`
    ).bind(t, note || null, applicationId).run();
  } else {
    return error('Invalid action — use approve / reject', 400);
  }

  // Audit log
  await env.DB.prepare(
    `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, ?, 'vendor_application', ?, ?, ?)`
  ).bind(
    'al-' + crypto.randomUUID().slice(0, 8),
    session.userId,
    `vendor.${action}`,
    applicationId,
    JSON.stringify({ note: note || null }),
    t
  ).run();

  return json({ success: true });
}
