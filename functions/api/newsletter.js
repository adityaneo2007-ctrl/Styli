// Cloudflare Pages Function — writes newsletter signups to D1
//
// Path: POST /api/newsletter
// Expects JSON body: { "email": "user@example.com" }
//
// REQUIRED SETUP (one-time, done in Cloudflare dashboard):
// 1. Create a D1 database named `styli`
// 2. Create the table:
//    CREATE TABLE newsletter_signups (
//      id TEXT PRIMARY KEY,
//      email TEXT NOT NULL UNIQUE,
//      signed_up_at TEXT NOT NULL,
//      source TEXT
//    );
// 3. In Pages → styli project → Settings → Functions → Bindings:
//    Add D1 database binding: variable name `DB`, database `styli`

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS — allow same-origin AND localhost preview
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Confirm DB is bound — if not, return a clear error
  if (!env.DB) {
    return new Response(
      JSON.stringify({
        error: 'D1 database not bound',
        hint: 'Add a D1 binding named DB in Pages → Settings → Functions',
      }),
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const email = (body?.email || '').toString().trim().toLowerCase();
  const source = (body?.source || 'homepage').toString().slice(0, 64);

  // Basic email validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Invalid email address' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      'INSERT INTO newsletter_signups (id, email, signed_up_at, source) VALUES (?, ?, ?, ?)'
    )
      .bind(id, email, now, source)
      .run();

    return new Response(
      JSON.stringify({ success: true, id }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    // Duplicate email — treat as success (idempotent)
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('constraint')) {
      return new Response(
        JSON.stringify({ success: true, alreadySubscribed: true }),
        { status: 200, headers: corsHeaders }
      );
    }
    // Real error
    return new Response(
      JSON.stringify({ error: 'Server error', detail: err?.message || 'unknown' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// GET on this endpoint returns count + last 5 (no PII) — useful for debugging
export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'No DB binding' }), { status: 500 });
  }
  try {
    const { results: countRows } = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM newsletter_signups'
    ).all();
    return new Response(
      JSON.stringify({ total: countRows[0]?.total || 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
