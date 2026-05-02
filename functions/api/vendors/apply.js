// Cloudflare Pages Function — receives vendor applications and writes to D1
//
// Path: POST /api/vendors/apply
// Path: GET  /api/vendors/apply  (returns count + recent — useful for testing)
//
// REQUIRED SETUP (one-time):
// 1. Run this SQL in your D1 console:
//    CREATE TABLE vendor_applications (
//      id TEXT PRIMARY KEY,
//      business_name TEXT NOT NULL,
//      email TEXT NOT NULL UNIQUE,
//      password_hash TEXT NOT NULL,
//      type TEXT NOT NULL,
//      city TEXT NOT NULL,
//      gst TEXT NOT NULL,
//      phone TEXT NOT NULL,
//      status TEXT NOT NULL DEFAULT 'pending',
//      applied_at TEXT NOT NULL,
//      reviewed_at TEXT,
//      review_note TEXT
//    );
// 2. D1 binding (variable name `DB`) is already set up from the newsletter migration.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Lightweight password hash using Web Crypto (SHA-256 + salt)
// NOTE: This is a placeholder. Real production should use bcrypt or argon2.
// For prototype-tier, salted SHA-256 prevents trivial password leakage.
async function hashPassword(password) {
  const salt = 'styli-prototype-salt-v1'; // TODO: per-user salt in production
  const data = new TextEncoder().encode(salt + password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: 'D1 binding missing — check Pages Settings → Bindings' }),
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); }

  const businessName = String(body?.name || '').trim();
  const email        = String(body?.email || '').trim().toLowerCase();
  const password     = String(body?.password || '');
  const type         = String(body?.type || 'small').trim();
  const city         = String(body?.city || '').trim();
  const gst          = String(body?.gst || '').trim().toUpperCase();
  const phone        = String(body?.phone || '').trim();

  // Validation
  const errors = [];
  if (!businessName || businessName.length < 2) errors.push('Business name is required');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
  if (!['small', 'medium'].includes(type)) errors.push('Invalid business type');
  if (!city || city.length < 2) errors.push('City is required');
  if (!gst || gst.length < 5) errors.push('GST number is required');
  if (!phone || phone.length < 6) errors.push('Phone is required');

  if (errors.length) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', errors }),
      { status: 400, headers: corsHeaders }
    );
  }

  const id = 'v-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      `INSERT INTO vendor_applications
       (id, business_name, email, password_hash, type, city, gst, phone, status, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, businessName, email, passwordHash, type, city, gst, phone, 'pending', now)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        id,
        message: 'Application submitted. Admin will review within 48 hours.',
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('constraint')) {
      return new Response(
        JSON.stringify({
          error: 'An application with this email already exists',
          alreadyApplied: true,
        }),
        { status: 409, headers: corsHeaders }
      );
    }
    return new Response(
      JSON.stringify({ error: 'Server error', detail: err?.message || 'unknown' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// GET — admin/debug endpoint: returns count + last 10 applications (no password hash)
export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'No DB binding' }), { status: 500, headers: corsHeaders });
  }
  try {
    const { results: countRows } = await env.DB.prepare(
      'SELECT COUNT(*) AS total, status FROM vendor_applications GROUP BY status'
    ).all();
    const { results: recent } = await env.DB.prepare(
      `SELECT id, business_name, email, type, city, gst, phone, status, applied_at
       FROM vendor_applications ORDER BY applied_at DESC LIMIT 10`
    ).all();
    return new Response(
      JSON.stringify({ counts: countRows, recent }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
