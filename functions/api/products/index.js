// GET  /api/products             — public list (filters: ?category=Kurtas, ?q=search, ?vendor=v-id, ?limit=20)
// POST /api/products             — vendor creates a new product (auth required, vendor only)
import { json, error, preflight, requireDB, parseJSON, clean, genId, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const url = new URL(request.url);
  const category = clean(url.searchParams.get('category'), 50);
  const q = clean(url.searchParams.get('q'), 100).toLowerCase();
  const vendor = clean(url.searchParams.get('vendor'), 50);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const onlyNew = url.searchParams.get('new') === '1';
  const onlyTrending = url.searchParams.get('trending') === '1';

  let sql = `
    SELECT p.id, p.vendor_id, v.business_name AS vendor_name,
           p.name, p.description, p.category, p.price, p.original_price,
           p.tags, p.sizes, p.stock, p.image_url, p.grad,
           p.rating, p.review_count, p.is_new, p.is_exclusive,
           p.recommended_count, p.created_at
    FROM products p
    LEFT JOIN vendors v ON v.id = p.vendor_id
    WHERE p.listed = 1 AND p.approved = 1
  `;
  const binds = [];

  if (category && category !== 'all') { sql += ' AND p.category = ?'; binds.push(category); }
  if (vendor) { sql += ' AND p.vendor_id = ?'; binds.push(vendor); }
  if (q) {
    sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(p.tags) LIKE ?)';
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  if (onlyNew) sql += ' AND p.is_new = 1';
  if (onlyTrending) sql += ' ORDER BY p.recommended_count DESC';
  else sql += ' ORDER BY p.created_at DESC';
  sql += ' LIMIT ?';
  binds.push(limit);

  try {
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    // Parse JSON fields for clients
    const products = (results || []).map(p => ({
      ...p,
      tags: safeParseArr(p.tags),
      sizes: safeParseArr(p.sizes),
      stock: safeParseObj(p.stock),
      isNew: !!p.is_new,
      isExclusive: !!p.is_exclusive,
    }));
    return json({ products, count: products.length });
  } catch (err) {
    return error('Server error', 500, err.message);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'vendor') return error('Vendor login required', 401);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  const name = clean(body?.name, 200);
  const description = clean(body?.description, 2000);
  const category = clean(body?.category, 50);
  const price = parseInt(body?.price, 10) || 0;
  const originalPrice = body?.originalPrice ? parseInt(body.originalPrice, 10) : null;
  const sizes = Array.isArray(body?.sizes) ? body.sizes : [];
  const stock = body?.stock && typeof body.stock === 'object' ? body.stock : {};
  const tags = Array.isArray(body?.tags) ? body.tags : [];
  const imageUrl = clean(body?.imageUrl, 500);
  const grad = clean(body?.grad || 'grad-1', 20);

  if (!name || name.length < 2) return error('Product name required', 400);
  if (!category) return error('Category required', 400);
  if (price <= 0) return error('Price must be greater than 0', 400);
  if (sizes.length === 0) return error('At least one size required', 400);

  const id = genId('p');
  const created = now();

  await env.DB.prepare(
    `INSERT INTO products
      (id, vendor_id, name, description, category, price, original_price, tags, sizes, stock,
       image_url, grad, listed, approved, rating, review_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?)`
  ).bind(
    id, session.userId, name, description, category, price, originalPrice,
    JSON.stringify(tags), JSON.stringify(sizes), JSON.stringify(stock),
    imageUrl, grad, created
  ).run();

  return json({ success: true, id, message: 'Product created — pending admin approval' });
}

function safeParseArr(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } }
function safeParseObj(s) { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
