// Admin category taxonomy — D1 backed.
// GET    /api/admin/categories
// POST   /api/admin/categories  — { name, displayName? }
// PATCH  /api/admin/categories  — { id, name?, displayName?, hidden?, sortOrder? }
// DELETE /api/admin/categories?id=cat-XXX  (refuses if products use it)

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
  // Categories are public (any authenticated user can read), but we still require login here for admin context
  const auth = await requireTeam(context.env, context.request, 'view.products');
  if (auth.err) return auth.err;
  const { results } = await context.env.DB.prepare(
    `SELECT id, name, display_name AS displayName, sort_order AS sortOrder, hidden, created_at
     FROM site_categories ORDER BY sort_order, name`
  ).all();
  return json({ categories: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const name = clean(body?.name, 50);
  const displayName = clean(body?.displayName, 80) || name;
  if (!name) return error('Category name required', 400);

  const id = genId('cat');
  const created = now();
  try {
    // Use COUNT to determine sort_order
    const c = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM site_categories').first();
    const sortOrder = (c?.n || 0) + 1;
    await context.env.DB.prepare(
      `INSERT INTO site_categories (id, name, display_name, sort_order, hidden, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).bind(id, name, displayName, sortOrder, created).run();
    return json({ success: true, id, name });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('Category already exists', 409);
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
  if ('name' in body)        { fields.push('name = ?');         binds.push(clean(body.name, 50)); }
  if ('displayName' in body) { fields.push('display_name = ?'); binds.push(clean(body.displayName, 80)); }
  if ('hidden' in body)      { fields.push('hidden = ?');       binds.push(body.hidden ? 1 : 0); }
  if ('sortOrder' in body)   { fields.push('sort_order = ?');   binds.push(parseInt(body.sortOrder, 10) || 99); }

  if (fields.length === 0) return error('No fields to update', 400);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE site_categories SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
  return json({ success: true });
}

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);

  // Look up category to check products
  const cat = await context.env.DB.prepare('SELECT name FROM site_categories WHERE id = ?').bind(id).first();
  if (!cat) return error('Category not found', 404);

  const usage = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE category = ?').bind(cat.name).first();
  if (usage?.n > 0) return error(`Cannot delete — ${usage.n} product${usage.n !== 1 ? 's' : ''} use this category`, 409);

  await context.env.DB.prepare('DELETE FROM site_categories WHERE id = ?').bind(id).run();
  return json({ success: true });
}
