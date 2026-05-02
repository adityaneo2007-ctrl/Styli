// GET    /api/buyers/cart                       — list current buyer's cart
// POST   /api/buyers/cart                       — add item or update qty (idempotent on product+size)
// DELETE /api/buyers/cart?productId=X&size=M    — remove specific item
// DELETE /api/buyers/cart?clear=1                — clear entire cart
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const { results } = await env.DB.prepare(
    `SELECT c.product_id, c.size, c.qty, c.added_at,
            p.name, p.price, p.image_url, p.grad,
            v.business_name AS vendor_name
     FROM carts c
     JOIN products p ON p.id = c.product_id
     LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE c.buyer_id = ?
     ORDER BY c.added_at DESC`
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
  const size = clean(body?.size, 10);
  const qty = Math.max(1, Math.min(10, parseInt(body?.qty, 10) || 1));

  if (!productId || !size) return error('productId and size are required', 400);

  // Verify product exists
  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND listed = 1').bind(productId).first();
  if (!product) return error('Product not available', 404);

  // Upsert cart item
  await env.DB.prepare(
    `INSERT INTO carts (buyer_id, product_id, size, qty, added_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(buyer_id, product_id, size) DO UPDATE SET qty = excluded.qty, added_at = excluded.added_at`
  ).bind(session.userId, productId, size, qty, now()).run();

  return json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const url = new URL(request.url);
  if (url.searchParams.get('clear') === '1') {
    await env.DB.prepare('DELETE FROM carts WHERE buyer_id = ?').bind(session.userId).run();
    return json({ success: true, cleared: true });
  }

  const productId = clean(url.searchParams.get('productId'), 50);
  const size = clean(url.searchParams.get('size'), 10);
  if (!productId || !size) return error('productId and size required', 400);

  await env.DB.prepare(
    'DELETE FROM carts WHERE buyer_id = ? AND product_id = ? AND size = ?'
  ).bind(session.userId, productId, size).run();

  return json({ success: true });
}
