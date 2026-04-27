# Styli → Cloudflare full-stack migration plan

Written for Aditya Bhardwaj. Treat this as a living document — update it as you make decisions.

**Status**: Prototype on localStorage is deployed at styli-three.vercel.app. This doc plans the move to a real backend on Cloudflare.

---

## Table of contents

1. [Executive summary](#executive-summary)
2. [What "fully on Cloudflare" actually means](#architecture)
3. [The auth decision — must be made before Phase 2](#auth-decision)
4. [Tech stack specifics](#tech-stack)
5. [Data model](#data-model)
6. [Phased implementation plan](#phases)
7. [What to DIY vs. what to hire](#diy-vs-hire)
8. [Cost breakdown](#cost)
9. [Risks and pitfalls](#risks)
10. [Hiring brief — copy-paste for job posts](#hiring-brief)
11. [Glossary of terms](#glossary)
12. [Open decisions](#open-decisions)

---

## Executive summary <a id="executive-summary"></a>

**Goal**: Move Styli from a single-file React prototype with browser-only storage to a production-ready marketplace where real buyers, vendors, and admins interact with shared live data — all hosted on Cloudflare.

**Duration**: 6–10 weeks of focused development. Can be done incrementally (site stays online throughout).

**Cost through launch**: ~₹1–3 lakh one-time for development + ~₹2–4k/month in service fees at small scale. Free tier covers first few thousand users.

**Architecture at a glance**:

```
       ┌──────────────────────────────────────────────────┐
       │                 USER'S BROWSER                   │
       │    (your React app, served from Cloudflare)      │
       └────────────────────┬─────────────────────────────┘
                            │
                            ▼
       ┌──────────────────────────────────────────────────┐
       │            CLOUDFLARE PAGES                      │
       │         (hosts your static React site)           │
       └────────────────────┬─────────────────────────────┘
                            │ fetch()
                            ▼
       ┌──────────────────────────────────────────────────┐
       │            CLOUDFLARE WORKERS                    │
       │    (API endpoints: /api/products, /api/auth, …)  │
       └──────┬───────────────────────────────┬───────────┘
              │                               │
              ▼                               ▼
       ┌─────────────┐                 ┌─────────────┐
       │ CLOUDFLARE  │                 │ CLOUDFLARE  │
       │     D1      │                 │     R2      │
       │ (database)  │                 │  (images)   │
       └─────────────┘                 └─────────────┘
```

**One key caveat**: Cloudflare doesn't have a built-in auth product for consumer apps. We'll either use **Clerk** (a third-party auth service — easiest) or build custom auth on Workers. This decision is **open** and must be made before Phase 2.

---

## What "fully on Cloudflare" actually means <a id="architecture"></a>

Right now you have:

- Code on **GitHub** (repo: `adityaneo2007-ctrl/Styli`)
- Site hosted on **Vercel** (`styli-three.vercel.app`)
- "Database" is the user's browser localStorage (no real data sharing)

The end state is:

- Code still on **GitHub** (no change)
- Site hosted on **Cloudflare Pages** (replaces Vercel)
- API backend on **Cloudflare Workers** (new — didn't exist before)
- Real database on **Cloudflare D1** (new — replaces localStorage)
- Product images on **Cloudflare R2** (new — replaces CSS gradients)
- Auth via **Clerk** or custom Workers (new — replaces fake localStorage "accounts")
- Payments via **Razorpay** webhooks to Workers
- Transactional email via **Resend**

Deployment flow stays GitHub-centric:

```
  You push to GitHub main  →  Cloudflare Pages auto-builds & deploys
                           →  Workers also auto-deploy from the repo
                           →  Live in ~60 seconds
```

This is the same "push to deploy" pattern you already have — just wired to Cloudflare instead of Vercel.

---

## The auth decision <a id="auth-decision"></a>

This is the single most important decision in this plan. Choose carefully.

### Option A — Clerk (third-party auth)

**What it is**: A dedicated authentication service. You sign up at clerk.com, add a `<ClerkProvider>` to your React app, and sign-in pages, user management, email verification, password reset, and "Sign in with Google" all work out of the box.

**Pros**:
- 1–2 days of integration work (vs. 1–2 weeks for custom)
- Professional security — encryption, password hashing, session management all handled correctly
- Admin dashboard to manage users (useful even for you as the admin)
- "Sign in with Google/Apple" included for free
- Good support and documentation
- Works perfectly with Cloudflare Workers

**Cons**:
- Another vendor in your stack (but a small, stable one)
- Free tier ends at 10,000 monthly active users
- Priced at $25/month after that (~₹2,100/mo)

**Recommended for**: Non-technical founders, teams without a security-experienced developer, anyone who wants to launch fast.

### Option B — Custom auth on Workers

**What it is**: Build your own authentication using Cloudflare Workers + D1. Store users in a `users` table with hashed passwords. Use JWT tokens or session cookies.

**Pros**:
- Zero external dependencies
- 100% Cloudflare, one vendor
- Full control over user flows
- No per-user cost — free forever

**Cons**:
- 1–2 weeks of careful work even for experienced developers
- Lots of places to make subtle security mistakes (timing attacks, weak hashing, session leakage, password reset token handling)
- You'd still need a separate email service (Resend) for verification and password resets
- You have to maintain it forever — including responding to security advisories

**Recommended for**: Teams with a dedicated backend developer experienced in auth. Not the first thing a non-technical founder should tackle.

### Recommendation

**Start with Clerk.** You can always migrate to custom auth later if you outgrow it (unlikely for a long time). The time and risk savings are worth the ~₹2,100/month you'd pay once you cross 10K users (and by then you'd have revenue).

**Decision gate**: this doc assumes Clerk from here on. If you decide custom auth instead, the auth-related steps in the phase plan change but the rest of the plan is the same.

---

## Tech stack specifics <a id="tech-stack"></a>

| Layer | Tool | Why |
|---|---|---|
| Frontend framework | **Vite + React + TypeScript** | Fast, simple, no SSR complexity needed for a marketplace |
| CSS | **Tailwind CSS** | Ship the same design without maintaining a 700-line CSS block |
| Hosting | **Cloudflare Pages** | Replaces Vercel, same push-to-deploy flow |
| API backend | **Cloudflare Workers** via **Hono** framework | Hono is tiny, fast, feels like Express if you've used Node.js |
| Database | **Cloudflare D1** (SQLite) | Free tier fits your scale, works natively with Workers |
| ORM / query tool | **Drizzle ORM** | Type-safe queries, works with D1 |
| File storage | **Cloudflare R2** | 10 GB free + unlimited bandwidth |
| Image transformations | **Cloudflare Images** | Resize, crop, WebP conversion — 5K free images |
| Auth | **Clerk** (recommended) | Drop-in, professional |
| Payments | **Razorpay** | India-focused, integrates via webhooks to Workers |
| Email | **Resend** | 100/day free; easy DX |
| Monitoring | **Sentry** | Free tier catches errors in production |
| Analytics | **Cloudflare Web Analytics** | Free, privacy-friendly, no cookies |

This is a battle-tested stack. Every piece has strong documentation and community support.

---

## Data model <a id="data-model"></a>

This is the SQL schema your developer will create in D1. It mirrors your current state shape so the data model doesn't need to change — just where it lives.

### Tables

**`users`** — all account types (buyers, vendors, admins). Managed by Clerk if you go that route; custom if not.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Clerk user ID or UUID if custom |
| email | TEXT UNIQUE | |
| name | TEXT | |
| role | TEXT | `buyer` / `vendor` / `admin` |
| phone | TEXT | |
| created_at | TIMESTAMP | |

**`vendors`** — vendor-specific details (joined to users via user_id)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| user_id | TEXT FK → users.id | |
| business_name | TEXT | |
| gst | TEXT | |
| city | TEXT | |
| type | TEXT | `small` or `medium` |
| status | TEXT | `pending` / `approved` / `rejected` |
| score | INTEGER | 0–100 admin-assigned score |
| applied_at | TIMESTAMP | |
| approved_at | TIMESTAMP | |

**`buyer_profiles`** — style preferences

| Column | Type | Notes |
|---|---|---|
| user_id | TEXT PK FK → users.id | |
| gender | TEXT | |
| height | INTEGER | cm |
| weight | INTEGER | kg |
| chest | INTEGER | cm |
| waist | INTEGER | cm |
| hip | INTEGER | cm |
| fit | TEXT | `slim`/`regular`/`relaxed` |
| style | TEXT | `boho`/`classic`/`minimal`/`casual`/`ethnic`/etc. |
| face_scan_completed | BOOLEAN | |

**`products`**

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| vendor_id | TEXT FK → vendors.id | |
| name | TEXT | |
| description | TEXT | |
| price | INTEGER | paise (avoid floats for money) |
| category | TEXT | |
| tags | TEXT | JSON array serialized |
| sizes | TEXT | JSON array, e.g. `["S","M","L"]` |
| stock | TEXT | JSON object `{"S": 3, "M": 5, "L": 0}` |
| image_url | TEXT | R2 URL of primary image |
| additional_images | TEXT | JSON array of R2 URLs |
| listed | BOOLEAN | Vendor toggles this |
| approved | BOOLEAN | Admin moderates |
| recommended | INTEGER | Count of times shown |
| clicks | INTEGER | Count of clicks |
| created_at | TIMESTAMP | |

**`orders`**

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `SY-XXXX` format |
| buyer_id | TEXT FK → users.id | |
| vendor_id | TEXT FK → vendors.id | |
| product_id | TEXT FK → products.id | |
| size | TEXT | |
| qty | INTEGER | |
| price | INTEGER | Paise, snapshotted at order time |
| city | TEXT | Shipping |
| pin | TEXT | Shipping |
| status | TEXT | `to-ship` / `in-transit` / `delivered` / `cancelled` |
| razorpay_order_id | TEXT | For payment reconciliation |
| razorpay_payment_id | TEXT | |
| placed_at | TIMESTAMP | |
| shipped_at | TIMESTAMP | |
| delivered_at | TIMESTAMP | |

**`returns`**

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `RT-XXXX` |
| order_id | TEXT FK → orders.id | |
| reason | TEXT | |
| note | TEXT | |
| status | TEXT | `pending` / `approved` / `rejected` |
| created_at | TIMESTAMP | |
| resolved_at | TIMESTAMP | |

**`team_members`** — internal team accounts for the Team Console (Superadmin / Admin / User roles)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Clerk user ID or UUID |
| user_id | TEXT FK → users.id | |
| name | TEXT | |
| email | TEXT UNIQUE | |
| role | TEXT | `team-super` / `team-admin` / `team-user` |
| invited_by | TEXT FK → team_members.id | Audit trail |
| joined_at | TIMESTAMP | |
| last_active_at | TIMESTAMP | |
| status | TEXT | `active` / `disabled` |

**`team_audit_log`** — every action a team member takes (for compliance + debugging)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| actor_id | TEXT FK → team_members.id | Who did it |
| action | TEXT | e.g. `vendor.approve`, `product.unlist`, `team.add` |
| target_type | TEXT | `vendor` / `product` / `order` / `team_member` |
| target_id | TEXT | |
| metadata | TEXT | JSON — before/after snapshots if applicable |
| created_at | TIMESTAMP | |

**`carts`** — kept in DB so carts persist across devices

| Column | Type | Notes |
|---|---|---|
| buyer_id | TEXT | |
| product_id | TEXT FK | |
| size | TEXT | |
| qty | INTEGER | |
| added_at | TIMESTAMP | |
| PRIMARY KEY | (buyer_id, product_id, size) | |

**`wishlists`**

| Column | Type | Notes |
|---|---|---|
| buyer_id | TEXT | |
| product_id | TEXT FK | |
| added_at | TIMESTAMP | |
| PRIMARY KEY | (buyer_id, product_id) | |

### API surface (Workers routes)

```
# Auth (handled by Clerk or custom)
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout

# Vendors
POST   /api/vendors/apply          (vendor submits application)
GET    /api/vendors/me             (vendor views own status)
GET    /api/vendors/:id            (public)

# Products
GET    /api/products               (buyer shop — list + filters)
GET    /api/products/:id
POST   /api/products                (vendor creates, own only)
PATCH  /api/products/:id            (vendor edits own)
DELETE /api/products/:id
POST   /api/products/:id/images    (vendor uploads to R2)

# Cart + wishlist
GET    /api/cart
POST   /api/cart
DELETE /api/cart/:productId/:size
PATCH  /api/cart/:productId/:size
GET    /api/wishlist
POST   /api/wishlist/:productId
DELETE /api/wishlist/:productId

# Orders
POST   /api/orders                  (checkout creates Razorpay order)
POST   /api/orders/webhook          (Razorpay confirms payment)
GET    /api/orders                  (buyer: own; vendor: for own products)
PATCH  /api/orders/:id/ship        (vendor marks shipped)
PATCH  /api/orders/:id/deliver
PATCH  /api/orders/:id/cancel

# Admin
GET    /api/admin/vendors           (list applications)
POST   /api/admin/vendors/:id/approve
POST   /api/admin/vendors/:id/reject
GET    /api/admin/kpis              (platform health numbers)

# Team Console (internal team — Superadmin/Admin/User roles)
POST   /api/team/login                    (Clerk-backed; returns role claim)
GET    /api/team/me                       (current team member's role + perms)
GET    /api/team/dashboard                (role-aware KPIs)
GET    /api/team/vendors                  (read — all roles)
PATCH  /api/team/vendors/:id              (perm: edit.vendors.approve)
DELETE /api/team/vendors/:id              (perm: edit.vendors.delete — Superadmin)
GET    /api/team/products
PATCH  /api/team/products/:id             (perm: edit.products.unlist)
DELETE /api/team/products/:id             (perm: edit.products.delete — Superadmin)
GET    /api/team/orders
POST   /api/team/orders/:id/refund        (perm: edit.orders.refund)
GET    /api/team/customers                (read-only for all roles)
GET    /api/team/members                  (perm: view.team — Superadmin)
POST   /api/team/members                  (perm: edit.team — Superadmin)
PATCH  /api/team/members/:id              (perm: edit.team — change role)
DELETE /api/team/members/:id              (perm: edit.team)
GET    /api/team/settings                 (perm: view.settings)
PATCH  /api/team/settings                 (perm: edit.settings — Superadmin)
GET    /api/team/audit-log                (perm: view.team — Superadmin)
```

### Team Console — Roles & Permissions Matrix

This must be enforced **server-side** (in Workers) — never trust the client. Each Worker route checks the `role` claim from the Clerk JWT against the permission required for that route.

| Permission | Superadmin | Admin | User |
|---|---|---|---|
| `view.dashboard` | ✓ | ✓ | ✓ |
| `view.vendors` / `view.products` / `view.orders` / `view.customers` | ✓ | ✓ | ✓ |
| `edit.vendors.approve` | ✓ | ✓ | ✗ |
| `edit.products.unlist` | ✓ | ✓ | ✗ |
| `edit.orders.refund` | ✓ | ✓ | ✗ |
| `edit.vendors.delete` / `edit.products.delete` | ✓ | ✗ | ✗ |
| `view.team` / `edit.team` | ✓ | ✗ | ✗ |
| `view.settings` / `edit.settings` | ✓ | ✗ | ✗ |

**Implementation pattern in Workers (Hono):**

```ts
// middleware/permissions.ts
export const requirePerm = (perm: string) => async (c, next) => {
  const role = c.get('user').role;  // from Clerk JWT
  if (!hasPermission(perm, role)) {
    return c.json({ error: 'forbidden', perm }, 403);
  }
  await next();
};

// usage
app.delete('/api/team/vendors/:id',
  requireAuth(),
  requirePerm('edit.vendors.delete'),
  async (c) => { /* ... */ });
```

**Clerk role assignment**: use Clerk's `publicMetadata.role` field to store team-super / team-admin / team-user. Superadmin can change others' roles via Clerk's admin API, called from a Worker route protected by `requirePerm('edit.team')`.

**Audit trail**: every mutation in `/api/team/*` writes a row to `team_audit_log` with the actor, action, target, and a before/after snapshot. This protects you legally and helps debug issues like "who unlisted this product."

**Prototype parity**: the localStorage prototype already implements this exact structure (sidebar items conditional on role, action buttons disabled visually for users without permission, three demo accounts) — so the migration is a 1:1 port of UX with real auth and DB persistence behind it.

All routes enforce auth + role checks. Buyers can only see their own cart; vendors only their own products; admins see everything.

---

## Phased implementation plan <a id="phases"></a>

Eight phases. Each phase ships something usable. The prototype stays live the whole time.

### Phase 0 — Cloudflare account setup (1 hour) — **do this today**

Zero code. Just:

1. Sign up at cloudflare.com (free)
2. Create an R2 bucket called `styli-images` (for product photos later)
3. Generate an R2 access key; save it in a password manager
4. Install Wrangler CLI (`npm install -g wrangler`) on your dev machine

**Outcome**: You have a Cloudflare account and a place to store images when you're ready. Doesn't affect anything else.

### Phase 1 — Project scaffolding (3–5 days)

1. Create new Vite + React + TypeScript project
2. Install Tailwind; copy your existing design tokens (colors, fonts)
3. Create `apps/web` (frontend) and `apps/api` (Workers) folder structure
4. Deploy a "Hello world" Workers API to confirm plumbing works
5. Deploy frontend to Cloudflare Pages
6. Wire frontend ↔ API with a test endpoint

**Outcome**: New app skeleton deployed at `styli.pages.dev` with a working API call. Your current site still serves real traffic.

### Phase 2 — Database + auth (1 week)

1. Create D1 database with Wrangler
2. Write migrations for all tables above
3. Seed D1 with your current demo data (convert from the `defaultState()` in index.html)
4. **Integrate Clerk** (or custom auth — decision here)
5. Wire `<ClerkProvider>` into frontend; add sign-up/sign-in pages
6. Workers middleware verifies Clerk JWT on protected routes

**Outcome**: You can sign up as a buyer with a real email, and your account persists.

### Phase 3 — Read-only product listing (3–5 days)

1. Port buyer-shop UI to new codebase
2. `/api/products` returns from D1
3. Port product detail page
4. Port landing page
5. No writes yet — cart still uses localStorage temporarily

**Outcome**: Buyers can sign up, log in, and browse a real product catalog served from D1. No purchases yet.

### Phase 4 — Vendor flows (1 week)

1. Vendor application form → writes to D1
2. Vendor console — list own products
3. Add product form + image upload to R2
4. Edit/delete/toggle listed
5. Inventory management (stock per size)

**Outcome**: Real vendors can apply, be approved (by you in the admin console), and list real products with photos.

### Phase 5 — Buyer purchase flow (1 week)

1. Real cart in D1 (persists across devices)
2. Real wishlist in D1
3. Razorpay integration — checkout creates an order
4. Razorpay webhook → order status updates in D1
5. Order confirmation email via Resend

**Outcome**: Real buyers can place real orders. Real money. Real vendors fulfill them.

### Phase 6 — Order lifecycle (3–5 days)

1. Vendor marks shipped / delivered / cancelled
2. Buyer sees status updates
3. Returns flow
4. Settlements view (vendor earnings)
5. Status-change emails

**Outcome**: Full end-to-end order lifecycle.

### Phase 7 — Admin console (3–5 days)

1. Vendor approval queue
2. Product moderation
3. Platform KPIs from D1 aggregation queries
4. All-orders view

**Outcome**: You can manage the platform from a real admin console.

### Phase 8 — Production hardening (1 week)

1. Error monitoring (Sentry)
2. Rate limiting on public endpoints
3. Image optimization (Cloudflare Images)
4. Security audit (rate limits, CORS, authz checks)
5. Backups (D1 automated snapshots)
6. Custom domain (e.g. `trystyli.com`) with HTTPS
7. SEO meta tags
8. Performance audit (Lighthouse score)

**Outcome**: Production-ready. Ready to market.

---

## What to DIY vs. what to hire <a id="diy-vs-hire"></a>

You said "mix — I'll do parts, hire for parts." Here's a sensible split:

### You can DIY (no/low coding)
- Cloudflare account setup (Phase 0)
- Creating the R2 bucket and uploading test images
- Registering domain, pointing DNS
- Writing product copy, seed data for products
- Designing the vendor approval criteria, KYC requirements
- QA testing — clicking through the app, reporting bugs
- Writing marketing copy, landing page content

### Hire a developer for (the coding)
- Project scaffolding (Phase 1)
- Database schema + migrations
- Auth integration
- All the Workers API endpoints
- Image upload flows
- Razorpay integration
- Email templates
- Deployment config

### The ideal division
Hire someone for Phases 1–8 as a full project. Agree on:
- **Fixed scope**: This document
- **Fixed deliverables**: Phases, milestones, demo points
- **Fixed budget**: ~₹1.5–2.5 lakh (see cost section)
- **Timeline**: 8–10 weeks part-time or 4–6 weeks full-time

Don't hire per-hour unless you have strong technical judgment — it's hard to estimate and costs balloon.

---

## Cost breakdown <a id="cost"></a>

### One-time
| Item | Cost |
|---|---|
| Developer (full project, 4–6 weeks) | ₹1,00,000–₹3,00,000 depending on seniority |
| Domain (e.g. trystyli.com) | ~₹800/year |
| Design polish (optional) | ₹0–₹30,000 if you want UI tweaks |

### Monthly (at launch, 0–1,000 users)
| Service | Cost |
|---|---|
| Cloudflare (Pages + Workers + D1 + R2) | **₹0** — all free tier |
| Clerk auth | **₹0** — free up to 10K monthly active users |
| Razorpay | **₹0 fixed** — 2% per successful transaction only |
| Resend email | **₹0** — free up to 3K/month |
| Sentry monitoring | **₹0** — free tier |
| **Total monthly** | **₹0–500** |

### Monthly (10,000+ users)
| Service | Cost |
|---|---|
| Cloudflare (bumped tiers for D1 reads, Workers requests) | ~₹500–2,000 |
| Clerk | ~₹2,100 (flat $25/mo) |
| Razorpay | 2% per transaction (you're making money by now) |
| Resend | ~₹1,700 (50K emails) |
| Sentry | ~₹2,100 |
| **Total monthly** | **~₹7,000** |

**You pay nothing until you're making money.** That's the beauty of this stack.

---

## Risks and pitfalls <a id="risks"></a>

### Risk 1 — Scope creep during rebuild
A rebuild is a tempting moment to add "one more feature." Resist. Ship the prototype's features first, add new ones in a second phase.

**Mitigation**: This doc is the contract with your developer. Changes to scope = written amendment.

### Risk 2 — Security mistakes in custom auth
If you go custom (Option B), small mistakes can leak user passwords or session tokens. Happens regularly to inexperienced teams.

**Mitigation**: Use Clerk. Or hire a developer who can prove auth experience (ask for a past project with authentication they built and get it code-reviewed).

### Risk 3 — Data migration pain
Your current prototype's `defaultState()` has hardcoded vendors, products, orders. All of that needs to become SQL seed data. Easy to miss fields.

**Mitigation**: Write a migration script that reads the current state shape and outputs SQL. Commit it to the repo.

### Risk 4 — Razorpay + webhook complexity
Payment flows are fiddly. Webhooks can arrive out of order, duplicate, or never. Need idempotent handling.

**Mitigation**: Use Razorpay's official Node.js SDK in Workers. Log every webhook to D1. Idempotency keys on order creation.

### Risk 5 — Hiring the wrong developer
A developer who hasn't shipped Workers/D1 before may underprice but over-deliver in bugs.

**Mitigation**: Ask for a past Cloudflare Workers project as proof. Start with a small paid trial task (~₹10K, 2 days) before committing to the full project.

### Risk 6 — Launch without testing
"Works on my machine" is how marketplaces lose real orders.

**Mitigation**: Dedicate Phase 8 to testing. Get 5 real testers (friends, not the developer) to place real orders through the full flow before opening to the public.

---

## Hiring brief <a id="hiring-brief"></a>

Copy-paste this into job posts on Peerlist, Upwork, LinkedIn, etc.

---

> **Full-stack developer for fashion marketplace (Cloudflare + React)**
>
> We're migrating Styli — a working prototype of an AI-powered fashion marketplace for India — from a single-file React prototype to a production backend on Cloudflare.
>
> **Scope**: 8 phases, documented in a 20-page plan. Roughly 4–6 weeks of full-time work or 8–10 weeks part-time. Fixed scope, fixed deliverables.
>
> **Tech stack**: React + TypeScript + Vite frontend, Cloudflare Workers (Hono), Cloudflare D1 (SQLite), Cloudflare R2, Clerk auth, Razorpay payments, Resend email. Tailwind CSS.
>
> **Must have**:
> - Shipped at least one production project on Cloudflare Workers
> - Comfortable with TypeScript, React, SQL
> - Can integrate third-party APIs (Clerk, Razorpay, Resend)
> - Git/GitHub fluency
>
> **Nice to have**:
> - Past marketplace or e-commerce project
> - Experience with India-specific payments (UPI, Razorpay)
>
> **Compensation**: Fixed-price project. Range ₹1.5–3 lakh depending on experience. Happy to discuss.
>
> **To apply**: Send your portfolio, one Cloudflare Workers project we can review, and your ballpark quote.

---

## Glossary of terms <a id="glossary"></a>

- **Cloudflare Pages** — hosts your static site (HTML, CSS, JS). Like Vercel, but Cloudflare's version.
- **Cloudflare Workers** — serverless functions that run on Cloudflare's network. Think of them as mini backend servers that run close to your users.
- **Hono** — a lightweight JavaScript framework for writing Workers code. Similar to Express.js. Makes routing easy.
- **D1** — Cloudflare's SQL database (uses SQLite). Stores structured data like users, products, orders.
- **R2** — Cloudflare's file storage. Stores images, files, anything that isn't structured data.
- **Wrangler** — Cloudflare's command-line tool for deploying Workers, managing D1, etc.
- **Clerk** — A third-party authentication service. Handles sign-up, login, password reset, email verification, "Sign in with Google."
- **Drizzle ORM** — A TypeScript library that lets you write database queries in TypeScript instead of raw SQL.
- **Razorpay** — India-focused payment gateway. Handles credit cards, UPI, wallets.
- **Resend** — Service for sending emails programmatically (order confirmations, password resets, etc.).
- **Sentry** — Catches and reports errors from your live app so you can debug issues users hit.
- **JWT** — JSON Web Token. A kind of secure token used to verify a user is logged in across requests.
- **CORS** — Cross-Origin Resource Sharing. Browser security rule — needs to be configured so your frontend can talk to your Workers API.
- **Webhook** — An HTTP callback. When Razorpay confirms a payment, it "calls" your API to tell you about it.
- **SQL migration** — A versioned change to the database schema (adding a column, creating a table).

---

## Open decisions <a id="open-decisions"></a>

Things still to decide. Update this section as you make calls:

- [ ] **Auth**: Clerk vs. custom? — *pending (Option A recommended)*
- [ ] **Developer**: Hiring one, or splitting work? — *mix, TBD specifics*
- [ ] **Domain name**: trystyli.com? stylihq.com? — *TBD*
- [ ] **Launch target date**: when do real buyers get in? — *TBD*
- [ ] **Vendor onboarding**: self-serve or invite-only at launch? — *TBD*
- [ ] **Payment settlement**: weekly, bi-weekly? — *TBD*
- [ ] **Category taxonomy**: free-form or curated list? — *TBD*
- [ ] **Return policy**: 7 days? 14 days? Which items eligible? — *TBD*

---

## Next steps

**This week**:
1. Read this document twice. Ask questions.
2. Decide auth (Clerk vs. custom) → update "Open decisions"
3. Do Phase 0 — create the Cloudflare account and R2 bucket. Tiny, risk-free first step.

**Next 2 weeks**:
1. Post hiring brief, shortlist 2–3 developers, do paid trial tasks
2. Select one, sign a simple contract referencing this doc
3. Begin Phase 1

**Keep updating this doc** as decisions firm up. It's your source of truth.

---

*Last updated: 2026-04-24*
*Version: 1.0*
