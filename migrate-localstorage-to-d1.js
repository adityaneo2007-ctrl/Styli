// =====================================================================
// Styli — migrate localStorage state into D1
// =====================================================================
// HOW TO RUN:
//   1. Open https://www.styli.co.in in a normal browser tab
//   2. Sign in as Admin (admin@styli.in / admin123) — this is what mints
//      the team token; without it the migration cannot authenticate.
//   3. Open DevTools (Cmd+Opt+I) → Console tab
//   4. Paste the entire contents of this file and press Enter
//   5. Read the log — it tells you exactly what it pushed and what it skipped
//
// SAFE TO RE-RUN: it diffs against D1 first and only pushes missing items.
// Seed rows that already exist in D1 are skipped.
// =====================================================================

(async () => {
  const STATE_KEY = 'styli_platform_v1';
  const TOKEN_KEY = 'styli-admin-token';

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    console.error('%c[migrate] No styli-admin-token found in localStorage.', 'color:#c00;font-weight:bold');
    console.error('%c[migrate] Sign out, sign back in as Admin, then re-run this script.', 'color:#c00');
    return;
  }

  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) {
    console.error('%c[migrate] No styli_platform_v1 in localStorage — nothing to migrate.', 'color:#c00');
    return;
  }
  const state = JSON.parse(raw);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const log = (m, c = '#888') => console.log('%c[migrate] ' + m, `color:${c}`);
  const ok  = (m) => log(m, '#0a7');
  const warn = (m) => log(m, '#c80');

  // ── 1) Discount codes ────────────────────────────────────────────
  log('───── Discount codes ─────', '#88c');
  const r1 = await fetch('/api/admin/promotions', { headers });
  if (!r1.ok) { warn(`Cannot read /api/admin/promotions (${r1.status}) — check your login.`); return; }
  const d1Codes = (await r1.json()).codes || [];
  const d1CodeSet = new Set(d1Codes.map(c => c.code));
  const localCodes = state.discountCodes || [];
  const newCodes = localCodes.filter(c => !d1CodeSet.has(c.code));
  log(`local: ${localCodes.length}  ·  in D1: ${d1Codes.length}  ·  to push: ${newCodes.length}`);
  for (const c of newCodes) {
    const res = await fetch('/api/admin/promotions', {
      method: 'POST', headers,
      body: JSON.stringify({
        code: c.code, type: c.type, value: c.value,
        minCart: c.minCart || 0, maxUses: c.maxUses || 0,
        expiresAt: c.expiresAt || '', notes: c.notes || ''
      })
    });
    if (res.ok) ok(`  ✓ ${c.code}`);
    else warn(`  ✗ ${c.code} (${res.status})`);
  }

  // ── 2) Categories ────────────────────────────────────────────────
  log('───── Categories ─────', '#88c');
  const r2 = await fetch('/api/admin/categories', { headers });
  if (!r2.ok) { warn(`Cannot read /api/admin/categories (${r2.status}).`); return; }
  const d1Cats = (await r2.json()).categories || [];
  const d1CatSet = new Set(d1Cats.map(c => (c.name || '').toLowerCase()));
  const localCats = state.categories || [];
  const newCats = localCats.filter(c => !d1CatSet.has((c.name || '').toLowerCase()));
  log(`local: ${localCats.length}  ·  in D1: ${d1Cats.length}  ·  to push: ${newCats.length}`);
  for (const c of newCats) {
    const res = await fetch('/api/admin/categories', {
      method: 'POST', headers,
      body: JSON.stringify({ name: c.name, displayName: c.displayName || c.name })
    });
    if (res.ok) ok(`  ✓ ${c.name}`);
    else warn(`  ✗ ${c.name} (${res.status})`);
  }

  // ── 3) Featured products ─────────────────────────────────────────
  log('───── Featured products ─────', '#88c');
  const r3 = await fetch('/api/admin/featured', { headers });
  if (!r3.ok) { warn(`Cannot read /api/admin/featured (${r3.status}).`); return; }
  const d1Featured = ((await r3.json()).featured || []).map(f => f.id);
  const d1FeatSet = new Set(d1Featured);
  const localFeat = state.featuredProductIds || [];
  const newFeat = localFeat.filter(id => !d1FeatSet.has(id));
  log(`local: ${localFeat.length}  ·  in D1: ${d1Featured.length}  ·  to push: ${newFeat.length}`);
  for (const productId of newFeat) {
    const res = await fetch('/api/admin/featured', {
      method: 'POST', headers,
      body: JSON.stringify({ productId })
    });
    if (res.ok) {
      const data = await res.json();
      // featured POST is a toggle — so 'added' means we successfully featured;
      // 'removed' would mean it was already there (defensive against the diff being stale).
      if (data.action === 'added') ok(`  ✓ ${productId}`);
      else warn(`  ~ ${productId} (was already featured, now removed — re-run to re-add)`);
    } else if (res.status === 404) {
      warn(`  ✗ ${productId} — product not found in D1 (probably a local-only product)`);
    } else {
      warn(`  ✗ ${productId} (${res.status})`);
    }
  }

  log('───── Done. Refresh the admin views to see updates. ─────', '#0a7');
})();
