// GET    /api/admin/products       — list ALL products for moderation/master view
//                                      ?status=pending|approved|unlisted, ?search=, ?vendor=
// POST   /api/admin/products        — admin creates product on behalf of a vendor:
//                                      { vendorId, name, category, price, originalPrice?, sizes[], stock{}, tags[],
//                                        description?, imageUrl?, grad?, isNew?, isExclusive?, listed? }
// PATCH  /api/admin/products        — moderate: { productId, action: 'approve'|'unlist'|'relist' }
// DELETE /api/admin/products?id=p-XXX — superadmin deletes any product
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
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;
  const auth = await requireTeam(env, request, 'view.products');
  if (auth.err) return auth.err;

  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 20);
  const search = clean(url.searchParams.get('search'), 80);
  const vendor = clean(url.searchParams.get('vendor'), 50);

  let sql = `SELECT p.id, p.vendor_id, p.name, p.description, p.category, p.price, p.original_price,
                    p.tags, p.sizes, p.stock, p.image_url, p.grad,
                    p.listed, p.approved, p.is_new, p.is_exclusive,
                    p.rating, p.review_count, p.created_at, p.updated_at,
                    v.business_name AS vendor_name
             FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id`;
  const binds = [];
  const where = [];
  if (status === 'pending')        where.push('p.approved = 0');
  else if (status === 'approved')  where.push('p.approved = 1');
  else if (status === 'unlisted')  where.push('p.listed = 0');
  else if (status === 'live')      where.push('p.listed = 1 AND p.approved = 1');
  if (vendor) { where.push('p.vendor_id = ?'); binds.push(vendor); }
  if (search) {
    where.push('(LOWER(p.name) LIKE ? OR LOWER(p.category) LIKE ?)');
    const like = `%${search.toLowerCase()}%`;
    binds.push(like, like);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.created_at DESC LIMIT 500';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ products: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.products.unlist');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const vendorId = clean(body?.vendorId, 50);
  const name = clean(body?.name, 200);
  const description = clean(body?.description, 2000);
  const category = clean(body?.category, 50);
  const price = parseInt(body?.price, 10) || 0;
  const originalPrice = body?.originalPrice ? parseInt(body.originalPrice, 10) : null;
  const sizes = Array.isArray(body?.sizes) ? body.sizes.slice(0, 20) : [];
  const stock = body?.stock && typeof body.stock === 'object' ? body.stock : {};
  const tags = Array.isArray(body?.tags) ? body.tags.slice(0, 20) : [];
  const imageUrl = clean(body?.imageUrl, 500);
  const grad = clean(body?.grad || 'grad-1', 20);
  const isNew = body?.isNew ? 1 : 0;
  const isExclusive = body?.isExclusive ? 1 : 0;
  const listed = body?.listed === false ? 0 : 1;

  if (!vendorId) return error('vendorId required (which vendor owns this product?)', 400);
  if (!name || name.length < 2) return error('Product name required', 400);
  if (!category) return error('Category required', 400);
  if (price <= 0) return error('Price must be greater than 0 (in paise — e.g. 1599 means ₹15.99)', 400);
  if (sizes.length === 0) return error('At least one size required', 400);

  // Verify vendor exists
  const v = await context.env.DB.prepare('SELECT id FROM vendors WHERE id = ?').bind(vendorId).first();
  if (!v) return error('Vendor not found', 404);

  const id = genId('p');
  const created = now();

  try {
    await context.env.DB.prepare(
      `INSERT INTO products
        (id, vendor_id, name, description, category, price, original_price, tags, sizes, stock,
         image_url, grad, listed, approved, is_new, is_exclusive, rating, review_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, ?)`
    ).bind(
      id, vendorId, name, description, category, price, originalPrice,
      JSON.stringify(tags), JSON.stringify(sizes), JSON.stringify(stock),
      imageUrl, grad, listed, isNew, isExclusive, created
    ).run();

    // Audit
    await context.env.DB.prepare(
      `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, 'product.create', 'product', ?, ?, ?)`
    ).bind('al-' + crypto.randomUUID().slice(0, 8), auth.session.userId, id, JSON.stringify({ vendorId, name }), created).run();

    return json({ success: true, id });
  } catch (err) {
    return error('Server error', 500, err?.message);
  }
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

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.products.delete');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);

  const r = await context.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();

  await context.env.DB.prepare(
    `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, created_at)
     VALUES (?, ?, 'product.delete', 'product', ?, ?)`
  ).bind('al-' + crypto.randomUUID().slice(0, 8), auth.session.userId, id, now()).run();

  return json({ success: true, deleted: r?.meta?.changes || 0 });
}
