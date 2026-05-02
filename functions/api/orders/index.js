// POST /api/orders   — place order: convert current cart to order rows, clear cart
// GET  /api/orders   — list own orders (buyer sees own; vendor sees orders for own products; team sees all)
import { json, error, preflight, requireDB, parseJSON, clean, genOrderId, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;
  const city = clean(body?.city, 100);
  const pin = clean(body?.pin, 10);
  if (!city || !pin) return error('Shipping city and PIN are required', 400);

  // Get buyer's name + cart items
  const buyer = await env.DB.prepare('SELECT name FROM buyers WHERE id = ?').bind(session.userId).first();
  if (!buyer) return error('Buyer record missing', 500);

  const { results: cartItems } = await env.DB.prepare(
    `SELECT c.product_id, c.size, c.qty, p.vendor_id, p.price, p.name
     FROM carts c JOIN products p ON p.id = c.product_id
     WHERE c.buyer_id = ?`
  ).bind(session.userId).all();

  if (!cartItems || cartItems.length === 0) return error('Cart is empty', 400);

  const placedAt = now();
  const orderIds = [];

  // Each cart item becomes its own order row (one order per (buyer, vendor, product) line)
  for (const item of cartItems) {
    const orderId = genOrderId();
    orderIds.push(orderId);
    await env.DB.prepare(
      `INSERT INTO orders
        (id, buyer_id, vendor_id, product_id, size, qty, price, status,
         city, pin, buyer_name, placed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'to-ship', ?, ?, ?, ?)`
    ).bind(
      orderId, session.userId, item.vendor_id, item.product_id,
      item.size, item.qty, item.price, city, pin, buyer.name, placedAt
    ).run();
  }

  // Clear cart
  await env.DB.prepare('DELETE FROM carts WHERE buyer_id = ?').bind(session.userId).run();

  return json({
    success: true,
    orderIds,
    orderCount: orderIds.length,
    message: `${orderIds.length} order${orderIds.length !== 1 ? 's' : ''} placed`,
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session) return error('Authentication required', 401);

  let sql, binds;

  if (session.userType === 'buyer') {
    sql = `SELECT o.*, p.name AS product_name, p.image_url, v.business_name AS vendor_name
           FROM orders o
           JOIN products p ON p.id = o.product_id
           LEFT JOIN vendors v ON v.id = o.vendor_id
           WHERE o.buyer_id = ?
           ORDER BY o.placed_at DESC`;
    binds = [session.userId];
  } else if (session.userType === 'vendor') {
    sql = `SELECT o.*, p.name AS product_name, p.image_url
           FROM orders o JOIN products p ON p.id = o.product_id
           WHERE o.vendor_id = ?
           ORDER BY o.placed_at DESC`;
    binds = [session.userId];
  } else if (session.userType === 'team') {
    sql = `SELECT o.*, p.name AS product_name, p.image_url, v.business_name AS vendor_name
           FROM orders o
           JOIN products p ON p.id = o.product_id
           LEFT JOIN vendors v ON v.id = o.vendor_id
           ORDER BY o.placed_at DESC LIMIT 200`;
    binds = [];
  } else {
    return error('Unknown user type', 400);
  }

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ orders: results || [] });
}
