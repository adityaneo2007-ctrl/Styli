// GET   /api/admin/products       — list all products for moderation (?status=pending|approved|rejected)
// PATCH /api/admin/products        — moderate: { productId, action: 'approve'|'unlist'|'relist' }
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession, teamCan } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'team') return error('Team login required', 401);
  if (!await teamCan(env, 'view.products', session.userRole)) return error('Forbidden', 403);

  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 20);

  let sql = `SELECT p.id, p.name, p.category, p.price, p.listed, p.approved,
                    p.image_url, p.rating, p.review_count, p.created_at,
                    v.business_name AS vendor_name
             FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id`;
  const binds = [];
  if (status === 'pending')   { sql += ' WHERE p.approved = 0'; }
  else if (status === 'approved') { sql += ' WHERE p.approved = 1'; }
  else if (status === 'unlisted') { sql += ' WHERE p.listed = 0'; }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ products: results || [] });
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'team') return error('Team login required', 401);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;
  const productId = clean(body?.productId, 50);
  const action = clean(body?.action, 20);

  if (!productId) return error('productId required', 400);

  const product = await env.DB.prepare('SELECT id, listed, approved FROM products WHERE id = ?')
    .bind(productId).first();
  if (!product) return error('Product not found', 404);

  if (action === 'approve') {
    if (!await teamCan(env, 'edit.products.unlist', session.userRole)) return error('Forbidden', 403);
    await env.DB.prepare('UPDATE products SET approved = 1, updated_at = ? WHERE id = ?')
      .bind(now(), productId).run();
  } else if (action === 'unlist') {
    if (!await teamCan(env, 'edit.products.unlist', session.userRole)) return error('Forbidden', 403);
    await env.DB.prepare('UPDATE products SET listed = 0, updated_at = ? WHERE id = ?')
      .bind(now(), productId).run();
  } else if (action === 'relist') {
    if (!await teamCan(env, 'edit.products.unlist', session.userRole)) return error('Forbidden', 403);
    await env.DB.prepare('UPDATE products SET listed = 1, updated_at = ? WHERE id = ?')
      .bind(now(), productId).run();
  } else {
    return error('Invalid action — use approve / unlist / relist', 400);
  }

  // Audit log
  await env.DB.prepare(
    `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, created_at)
     VALUES (?, ?, ?, 'product', ?, ?)`
  ).bind(
    'al-' + crypto.randomUUID().slice(0, 8),
    session.userId,
    `product.${action}`,
    productId,
    now()
  ).run();

  return json({ success: true });
}
