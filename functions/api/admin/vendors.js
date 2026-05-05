// GET    /api/admin/vendors                       — list applications (?status=pending|approved|rejected)
// GET    /api/admin/vendors?list=active            — list ACTIVE vendors (master list with stats)
// POST   /api/admin/vendors                        — moderate: { applicationId, action: 'approve'|'reject', note? }
// POST   /api/admin/vendors  with create=1         — create vendor directly: { create:1, name, email, password, type, city, gst, phone }
// PATCH  /api/admin/vendors                        — edit vendor: { id, businessName?, email?, phone?, city?, gst?, status?, score?, type? }
// DELETE /api/admin/vendors?id=v-XXX                — remove a vendor (cascades products via FK)
import { json, error, preflight, requireDB, parseJSON, isEmail, clean, now } from '../../_lib/db.js';
import { getSession, teamCan, hashPassword } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

async function requireTeam(env, request, perm) {
  const s = await getSession(env, request);
  if (!s || s.userType !== 'team') return { err: error('Team login required', 401) };
  if (!await teamCan(env, perm, s.userRole)) return { err: error('Forbidden', 403) };
  return { session: s };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;
  const auth = await requireTeam(env, request, 'view.vendors');
  if (auth.err) return auth.err;

  const url = new URL(request.url);
  const list = clean(url.searchParams.get('list'), 20);

  // Master list of active vendors (with product + order stats)
  if (list === 'active') {
    const { results } = await env.DB.prepare(
      `SELECT v.id, v.business_name, v.email, v.type, v.city, v.gst, v.phone, v.status,
              v.score, v.score_trend, v.approved_at,
              (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id) AS product_count,
              (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.id) AS order_count,
              (SELECT COALESCE(SUM(o.price * o.qty), 0) FROM orders o WHERE o.vendor_id = v.id AND o.status != 'cancelled') AS revenue
         FROM vendors v
         ORDER BY v.business_name`
    ).all();
    return json({ vendors: results || [] });
  }

  // Default: applications list (back-compat)
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

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  // Branch: direct create (admin onboards a vendor without going through application flow)
  if (body?.create) {
    if (!await teamCan(env, 'edit.vendors.approve', session.userRole)) return error('Forbidden — needs approve permission', 403);
    const businessName = clean(body?.name || body?.businessName, 80);
    const email = clean(body?.email, 120).toLowerCase();
    const password = String(body?.password || '');
    const type = ['small', 'medium'].includes(body?.type) ? body.type : 'small';
    const city = clean(body?.city, 60);
    const gst = clean(body?.gst, 30).toUpperCase();
    const phone = clean(body?.phone, 20);

    if (!businessName || businessName.length < 2) return error('Business name is required', 400);
    if (!isEmail(email)) return error('Valid email required', 400);
    if (!password || password.length < 6) return error('Password must be at least 6 characters', 400);
    if (!city) return error('City is required', 400);
    if (!gst) return error('GST is required', 400);
    if (!phone) return error('Phone is required', 400);

    const id = 'v-' + crypto.randomUUID().slice(0, 8);
    const t = now();
    const passwordHash = await hashPassword(password);
    try {
      await env.DB.prepare(
        `INSERT INTO vendors (id, business_name, email, password_hash, type, city, gst, phone, status, score, score_trend, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 90, 'stable', ?)`
      ).bind(id, businessName, email, passwordHash, type, city, gst, phone, t).run();
      return json({ success: true, id });
    } catch (err) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('unique')) return error('A vendor with this email already exists', 409);
      return error('Server error', 500, err?.message);
    }
  }

  // Default: application moderation (approve/reject) — back-compat behavior
  if (!await teamCan(env, 'edit.vendors.approve', session.userRole)) return error('Forbidden — needs approve permission', 403);
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

export async function onRequestPatch(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.vendors.approve');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const id = clean(body?.id, 50);
  if (!id) return error('id required', 400);

  const fields = [];
  const binds = [];
  if ('businessName' in body || 'name' in body) { fields.push('business_name = ?'); binds.push(clean(body.businessName || body.name, 80)); }
  if ('email' in body) {
    const e = clean(body.email, 120).toLowerCase();
    if (!isEmail(e)) return error('Valid email required', 400);
    fields.push('email = ?'); binds.push(e);
  }
  if ('phone' in body) { fields.push('phone = ?'); binds.push(clean(body.phone, 20)); }
  if ('city' in body)  { fields.push('city = ?');  binds.push(clean(body.city, 60)); }
  if ('gst' in body)   { fields.push('gst = ?');   binds.push(clean(body.gst, 30).toUpperCase()); }
  if ('status' in body && ['approved', 'pending', 'rejected', 'suspended'].includes(body.status)) {
    fields.push('status = ?'); binds.push(body.status);
  }
  if ('score' in body) { fields.push('score = ?'); binds.push(Math.max(0, Math.min(100, parseInt(body.score, 10) || 0))); }
  if ('type' in body && ['small', 'medium'].includes(body.type)) { fields.push('type = ?'); binds.push(body.type); }
  if ('password' in body && body.password) {
    if (String(body.password).length < 6) return error('Password must be at least 6 characters', 400);
    fields.push('password_hash = ?');
    binds.push(await hashPassword(String(body.password)));
  }

  if (fields.length === 0) return error('No fields to update', 400);
  binds.push(id);
  try {
    await context.env.DB.prepare(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
    return json({ success: true });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('Another vendor is already using that email', 409);
    return error('Server error', 500, err?.message);
  }
}

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.vendors.delete');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);

  // Cascade — products FK has ON DELETE CASCADE, but be explicit for sessions
  await context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND user_type = ?').bind(id, 'vendor').run();
  const r = await context.env.DB.prepare('DELETE FROM vendors WHERE id = ?').bind(id).run();
  return json({ success: true, deleted: r?.meta?.changes || 0 });
}
