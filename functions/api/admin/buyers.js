// Admin buyer management — D1 backed.
// GET    /api/admin/buyers                        — list all buyers (?search= for filter)
// POST   /api/admin/buyers                        — create buyer { name, email, password, phone?, city? }
// PATCH  /api/admin/buyers                        — edit buyer { id, name?, email?, phone?, city?, password? }
// DELETE /api/admin/buyers?id=b-XXX               — delete buyer (cascades to carts/wishlists/orders via FK)
//
// Auth: team-super only for mutations (uses 'edit.team' permission as the most restrictive lock).
// Read uses 'view.customers'.

import { json, error, preflight, requireDB, parseJSON, isEmail, clean, genId, now } from '../../_lib/db.js';
import { getSession, teamCan, hashPassword } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

async function requireTeam(env, request, perm) {
  const s = await getSession(env, request);
  if (!s || s.userType !== 'team') return { err: error('Team login required', 401) };
  if (!await teamCan(env, perm, s.userRole)) return { err: error('Forbidden', 403) };
  return { session: s };
}

export async function onRequestGet(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'view.customers');
  if (auth.err) return auth.err;

  const url = new URL(context.request.url);
  const search = clean(url.searchParams.get('search'), 80);

  let sql = `SELECT b.id, b.email, b.name, b.phone, b.city, b.created_at, b.last_login_at,
                    (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = b.id) AS order_count,
                    (SELECT COALESCE(SUM(o.price * o.qty), 0) FROM orders o WHERE o.buyer_id = b.id AND o.status != 'cancelled') AS total_spent
             FROM buyers b`;
  const binds = [];
  if (search) {
    sql += ' WHERE LOWER(b.name) LIKE ? OR LOWER(b.email) LIKE ?';
    const like = `%${search.toLowerCase()}%`;
    binds.push(like, like);
  }
  sql += ' ORDER BY b.created_at DESC LIMIT 500';

  const { results } = await context.env.DB.prepare(sql).bind(...binds).all();
  return json({ buyers: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const email = clean(body?.email, 120).toLowerCase();
  const name = clean(body?.name, 80);
  const phone = clean(body?.phone, 20);
  const city = clean(body?.city, 60);
  const password = String(body?.password || '');

  if (!isEmail(email)) return error('Valid email required', 400);
  if (!name || name.length < 2) return error('Name is required', 400);
  if (!password || password.length < 6) return error('Password must be at least 6 characters', 400);

  const id = genId('b');
  const created = now();
  const passwordHash = await hashPassword(password);

  try {
    await context.env.DB.prepare(
      `INSERT INTO buyers (id, email, password_hash, name, phone, city, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, passwordHash, name, phone || null, city || null, created).run();
    return json({ success: true, id, email, name });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('A buyer with this email already exists', 409);
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
  if ('name' in body)  { fields.push('name = ?');  binds.push(clean(body.name, 80)); }
  if ('email' in body) {
    const e = clean(body.email, 120).toLowerCase();
    if (!isEmail(e)) return error('Valid email required', 400);
    fields.push('email = ?'); binds.push(e);
  }
  if ('phone' in body) { fields.push('phone = ?'); binds.push(clean(body.phone, 20) || null); }
  if ('city' in body)  { fields.push('city = ?');  binds.push(clean(body.city, 60) || null); }
  if ('password' in body && body.password) {
    if (String(body.password).length < 6) return error('Password must be at least 6 characters', 400);
    fields.push('password_hash = ?');
    binds.push(await hashPassword(String(body.password)));
  }

  if (fields.length === 0) return error('No fields to update', 400);
  binds.push(id);
  try {
    await context.env.DB.prepare(`UPDATE buyers SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
    return json({ success: true });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('Another buyer is already using that email', 409);
    return error('Server error', 500, err?.message);
  }
}

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);

  // Manual cascade — D1 doesn't enforce FK CASCADE for all tables
  await context.env.DB.prepare('DELETE FROM carts WHERE buyer_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM wishlists WHERE buyer_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND user_type = ?').bind(id, 'buyer').run();
  // Don't delete orders — keep historical record. Just orphan buyer_id.
  const r = await context.env.DB.prepare('DELETE FROM buyers WHERE id = ?').bind(id).run();
  return json({ success: true, deleted: r?.meta?.changes || 0 });
}
