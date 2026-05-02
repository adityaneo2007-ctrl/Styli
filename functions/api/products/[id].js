// GET    /api/products/:id  — public product detail
// PATCH  /api/products/:id  — vendor edit (own products only)
// DELETE /api/products/:id  — vendor delete (own); team-super can also delete
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession, teamCan } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { params, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const id = clean(params.id, 50);
  const row = await env.DB.prepare(
    `SELECT p.*, v.business_name AS vendor_name
     FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE p.id = ?`
  ).bind(id).first();

  if (!row) return error('Product not found', 404);

  // Increment click count (fire-and-forget; failure not critical)
  env.DB.prepare('UPDATE products SET click_count = click_count + 1 WHERE id = ?')
    .bind(id).run().catch(() => {});

  return json({
    product: {
      ...row,
      tags: safeArr(row.tags),
      sizes: safeArr(row.sizes),
      stock: safeObj(row.stock),
      isNew: !!row.is_new,
      isExclusive: !!row.is_exclusive,
    },
  });
}

export async function onRequestPatch(context) {
  const { params, request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'vendor') return error('Vendor login required', 401);

  const id = clean(params.id, 50);
  const product = await env.DB.prepare('SELECT vendor_id FROM products WHERE id = ?').bind(id).first();
  if (!product) return error('Product not found', 404);
  if (product.vendor_id !== session.userId) return error('Forbidden — not your product', 403);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  // Build dynamic update — only update fields that were provided
  const fields = [];
  const binds = [];
  if ('name' in body)        { fields.push('name = ?');         binds.push(clean(body.name, 200)); }
  if ('description' in body) { fields.push('description = ?');  binds.push(clean(body.description, 2000)); }
  if ('price' in body)       { fields.push('price = ?');        binds.push(parseInt(body.price, 10)); }
  if ('originalPrice' in body) { fields.push('original_price = ?'); binds.push(body.originalPrice ? parseInt(body.originalPrice, 10) : null); }
  if ('listed' in body)      { fields.push('listed = ?');       binds.push(body.listed ? 1 : 0); }
  if ('stock' in body)       { fields.push('stock = ?');        binds.push(JSON.stringify(body.stock || {})); }
  if ('tags' in body)        { fields.push('tags = ?');         binds.push(JSON.stringify(body.tags || [])); }
  if ('sizes' in body)       { fields.push('sizes = ?');        binds.push(JSON.stringify(body.sizes || [])); }
  if ('imageUrl' in body)    { fields.push('image_url = ?');    binds.push(clean(body.imageUrl, 500)); }

  if (fields.length === 0) return error('No fields to update', 400);
  fields.push('updated_at = ?'); binds.push(now());
  binds.push(id);

  await env.DB.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
  return json({ success: true });
}

export async function onRequestDelete(context) {
  const { params, request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session) return error('Authentication required', 401);

  const id = clean(params.id, 50);
  const product = await env.DB.prepare('SELECT vendor_id FROM products WHERE id = ?').bind(id).first();
  if (!product) return error('Product not found', 404);

  // Vendor can delete own; team-super can delete anyone's
  const isOwner = session.userType === 'vendor' && product.vendor_id === session.userId;
  const isSuperadmin = session.userType === 'team' &&
    await teamCan(env, 'edit.products.delete', session.userRole);

  if (!isOwner && !isSuperadmin) return error('Forbidden', 403);

  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return json({ success: true });
}

function safeArr(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } }
function safeObj(s) { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
