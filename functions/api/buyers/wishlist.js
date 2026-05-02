// GET    /api/buyers/wishlist            — list current buyer's wishlist
// POST   /api/buyers/wishlist             — toggle item: { productId } adds if absent, removes if present
// DELETE /api/buyers/wishlist?productId=X — remove specific item
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const { results } = await env.DB.prepare(
    `SELECT w.product_id, w.added_at,
            p.name, p.price, p.original_price, p.image_url, p.grad, p.category,
            v.business_name AS vendor_name
     FROM wishlists w
     JOIN products p ON p.id = w.product_id
     LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE w.buyer_id = ? AND p.listed = 1
     ORDER BY w.added_at DESC`
  ).bind(session.userId).all();

  return json({ items: results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;
  const productId = clean(body?.productId, 50);
  if (!productId) return error('productId required', 400);

  // Toggle: check current state
  const existing = await env.DB.prepare(
    'SELECT product_id FROM wishlists WHERE buyer_id = ? AND product_id = ?'
  ).bind(session.userId, productId).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM wishlists WHERE buyer_id = ? AND product_id = ?')
      .bind(session.userId, productId).run();
    return json({ success: true, action: 'removed' });
  }

  await env.DB.prepare(
    'INSERT INTO wishlists (buyer_id, product_id, added_at) VALUES (?, ?, ?)'
  ).bind(session.userId, productId, now()).run();
  return json({ success: true, action: 'added' });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const url = new URL(request.url);
  const productId = clean(url.searchParams.get('productId'), 50);
  if (!productId) return error('productId required', 400);

  await env.DB.prepare('DELETE FROM wishlists WHERE buyer_id = ? AND product_id = ?')
    .bind(session.userId, productId).run();
  return json({ success: true });
}
