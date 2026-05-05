// Admin discount-code management — D1 backed.
// GET    /api/admin/promotions  — list all codes
// POST   /api/admin/promotions  — create new code
// PATCH  /api/admin/promotions  — update or toggle active: { id, ...patch }
// DELETE /api/admin/promotions?id=dc-XXX

import { json, error, preflight, requireDB, parseJSON, clean, genId, now } from '../../_lib/db.js';
import { getSession, teamCan } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

async function requireTeam(env, request, perm) {
  const s = await getSession(env, request);
  if (!s || s.userType !== 'team') return { err: error('Team login required', 401) };
  if (!await teamCan(env, perm, s.userRole)) return { err: error('Forbidden', 403) };
  return { session: s };
}

export async function onRequestGet(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'view.dashboard');
  if (auth.err) return auth.err;
  const { results } = await context.env.DB.prepare(
    `SELECT id, code, type, value, min_cart, max_uses, used_count, expires_at, active, notes, created_at
     FROM discount_codes ORDER BY created_at DESC`
  ).all();
  return json({ codes: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team'); // creating discounts needs Superadmin (use edit.team as proxy)
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const code = clean(body?.code, 32).toUpperCase();
  const type = ['percent', 'flat'].includes(body?.type) ? body.type : 'percent';
  const value = parseInt(body?.value, 10) || 0;
  const minCart = parseInt(body?.minCart, 10) || 0;
  const maxUses = parseInt(body?.maxUses, 10) || 0;
  const expiresAt = clean(body?.expiresAt, 20) || null;
  const notes = clean(body?.notes, 200);

  if (!code) return error('Code required', 400);
  if (value <= 0) return error('Value must be greater than 0', 400);
  if (type === 'percent' && value > 100) return error('Percent cannot exceed 100', 400);

  const id = genId('dc');
  const created = now();
  try {
    await context.env.DB.prepare(
      `INSERT INTO discount_codes (id, code, type, value, min_cart, max_uses, used_count, expires_at, active, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?)`
    ).bind(id, code, type, value, minCart, maxUses, expiresAt, notes, created, auth.session.userId).run();
    return json({ success: true, id, code });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('Code already exists', 409);
    return error('Server error', 500, err?.message);
  }
}

export async function onRequestPatch(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const id = clean(body?.id, 50);
  if (!id) return error('id required', 400);

  const fields = [];
  const binds = [];
  if ('active' in body)     { fields.push('active = ?');     binds.push(body.active ? 1 : 0); }
  if ('value' in body)      { fields.push('value = ?');      binds.push(parseInt(body.value, 10) || 0); }
  if ('minCart' in body)    { fields.push('min_cart = ?');   binds.push(parseInt(body.minCart, 10) || 0); }
  if ('maxUses' in body)    { fields.push('max_uses = ?');   binds.push(parseInt(body.maxUses, 10) || 0); }
  if ('expiresAt' in body)  { fields.push('expires_at = ?'); binds.push(clean(body.expiresAt, 20) || null); }
  if ('notes' in body)      { fields.push('notes = ?');      binds.push(clean(body.notes, 200)); }

  if (fields.length === 0) return error('No fields to update', 400);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE discount_codes SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
  return json({ success: true });
}

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);
  await context.env.DB.prepare('DELETE FROM discount_codes WHERE id = ?').bind(id).run();
  return json({ success: true });
}
