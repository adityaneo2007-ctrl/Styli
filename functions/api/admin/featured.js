// Admin featured-products curation — D1 backed.
// GET  /api/admin/featured                  — list featured product IDs (with details)
// POST /api/admin/featured                  — { productId } toggles feature/unfeature

import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
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
  const auth = await requireTeam(context.env, context.request, 'view.products');
  if (auth.err) return auth.err;
  const { results } = await context.env.DB.prepare(
    `SELECT f.product_id AS id, f.sort_order AS sortOrder, f.featured_at AS featuredAt,
            p.name, p.image_url AS imageUrl, p.price, v.business_name AS vendorName
     FROM featured_products f
     JOIN products p ON p.id = f.product_id
     LEFT JOIN vendors v ON v.id = p.vendor_id
     ORDER BY f.sort_order ASC, f.featured_at DESC`
  ).all();
  return json({ featured: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const productId = clean(body?.productId, 50);
  if (!productId) return error('productId required', 400);

  // Toggle: if already featured, remove; else add
  const existing = await context.env.DB.prepare(
    'SELECT product_id FROM featured_products WHERE product_id = ?'
  ).bind(productId).first();

  if (existing) {
    await context.env.DB.prepare('DELETE FROM featured_products WHERE product_id = ?').bind(productId).run();
    return json({ success: true, action: 'removed' });
  }

  // Insert with next sort_order
  const c = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM featured_products').first();
  const sortOrder = (c?.n || 0) + 1;
  try {
    await context.env.DB.prepare(
      'INSERT INTO featured_products (product_id, sort_order, featured_at, featured_by) VALUES (?, ?, ?, ?)'
    ).bind(productId, sortOrder, now(), auth.session.userId).run();
    return json({ success: true, action: 'added' });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('foreign key')) return error('Product not found', 404);
    return error('Server error', 500, err?.message);
  }
}
