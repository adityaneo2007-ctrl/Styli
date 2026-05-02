-- =====================================================================
-- STYLI — FULL DATABASE SCHEMA (Cloudflare D1)
-- =====================================================================
-- Run this entire file in the D1 console (paste in chunks if needed).
-- Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
--
-- After running:
-- - All tables for the full marketplace exist
-- - Indexes for common query patterns are in place
-- - Default seed data inserted (3 team members, 5 vendors, 9 products)
--
-- Run order: schema → indexes → seed data
-- =====================================================================

-- Already exists from earlier migrations (kept here for reference + idempotency):
CREATE TABLE IF NOT EXISTS newsletter_signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  signed_up_at TEXT NOT NULL,
  source TEXT
);

CREATE TABLE IF NOT EXISTS vendor_applications (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  city TEXT NOT NULL,
  gst TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT,
  score INTEGER DEFAULT 90
);

-- =====================================================================
-- USERS — buyers, vendors (post-approval), team members
-- =====================================================================

-- Buyers: end customers
CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

-- Buyer profiles: style/body data from onboarding
CREATE TABLE IF NOT EXISTS buyer_profiles (
  buyer_id TEXT PRIMARY KEY,
  gender TEXT,
  height INTEGER,
  weight INTEGER,
  chest INTEGER,
  waist INTEGER,
  hip INTEGER,
  fit TEXT,
  style TEXT,
  face_scan_completed INTEGER DEFAULT 0,
  face_shape TEXT,
  skin_tone TEXT,
  undertone TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE
);

-- Vendors: approved sellers (subset of vendor_applications that admin approved)
-- Note: vendor_applications stays as the audit trail; this is the active vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  city TEXT NOT NULL,
  gst TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  score INTEGER DEFAULT 90,
  score_trend TEXT DEFAULT 'stable',
  approved_at TEXT,
  bank_account TEXT,
  bank_ifsc TEXT,
  FOREIGN KEY (application_id) REFERENCES vendor_applications(id)
);

-- Team members: internal Styli staff (Superadmin/Admin/User roles)
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'team-user',
  joined_at TEXT NOT NULL,
  last_active_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by TEXT,
  FOREIGN KEY (invited_by) REFERENCES team_members(id)
);

-- Sessions: opaque token-based auth (works for buyer / vendor / team)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL,        -- 'buyer' | 'vendor' | 'team'
  user_role TEXT,                 -- e.g. 'team-super' for team members
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

-- =====================================================================
-- CATALOG
-- =====================================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,                 -- in paise (₹1.00 = 100)
  original_price INTEGER,
  tags TEXT,                              -- JSON array
  sizes TEXT NOT NULL,                    -- JSON array, e.g. ["S","M","L"]
  stock TEXT NOT NULL,                    -- JSON object, e.g. {"S": 4, "M": 2}
  image_url TEXT,
  additional_images TEXT,                 -- JSON array of URLs
  grad TEXT DEFAULT 'grad-1',             -- gradient fallback class
  listed INTEGER NOT NULL DEFAULT 1,
  approved INTEGER NOT NULL DEFAULT 0,
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_new INTEGER DEFAULT 0,
  is_exclusive INTEGER DEFAULT 0,
  recommended_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- =====================================================================
-- BUYER ACTIVITY (cart, wishlist)
-- =====================================================================

CREATE TABLE IF NOT EXISTS carts (
  buyer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  size TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL,
  PRIMARY KEY (buyer_id, product_id, size),
  FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wishlists (
  buyer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (buyer_id, product_id),
  FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- =====================================================================
-- ORDERS, RETURNS, REVIEWS
-- =====================================================================

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,                    -- e.g. SY-8842
  buyer_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  size TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL,                 -- snapshot at order time, in paise
  status TEXT NOT NULL DEFAULT 'to-ship',
  city TEXT NOT NULL,
  pin TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  placed_at TEXT NOT NULL,
  shipped_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  FOREIGN KEY (buyer_id) REFERENCES buyers(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,                    -- e.g. RT-2204
  order_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  refund_amount INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  rating INTEGER NOT NULL,                -- 1-5
  body TEXT,
  created_at TEXT NOT NULL,
  verified_purchase INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE,
  UNIQUE (product_id, buyer_id)           -- one review per buyer per product
);

-- =====================================================================
-- GOVERNANCE — permissions matrix, audit log
-- =====================================================================

CREATE TABLE IF NOT EXISTS permissions (
  action TEXT PRIMARY KEY,
  roles TEXT NOT NULL                     -- JSON array of role IDs
);

CREATE TABLE IF NOT EXISTS team_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,                   -- e.g. 'vendor.approve'
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,                          -- JSON snapshot
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES team_members(id)
);

-- =====================================================================
-- INDEXES — common query paths
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_products_listed ON products(listed, approved) WHERE listed = 1 AND approved = 1;
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_carts_buyer ON carts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_buyer ON wishlists(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON team_audit_log(actor_id, created_at DESC);

-- =====================================================================
-- SEED DATA — minimal demo data so the live site has something to show
-- =====================================================================

-- Team members (Superadmin, Admin, User)
-- NB: passwords here are SHA-256(salt+"super123" / "team123" / "staff123")
-- Salt is 'styli-prototype-salt-v1' (matches functions/_lib/auth.js)
-- For production, regenerate with bcrypt.
INSERT OR IGNORE INTO team_members (id, name, email, password_hash, role, joined_at, status) VALUES
  ('tm-super', 'Aditya Bhardwaj', 'super@styli.in', '0e85fa75d40daeae08b6e60e98ab53a40edc26c75ed7e8a8aa68e9b4ad73aa5e', 'team-super', '2026-01-01T00:00:00Z', 'active'),
  ('tm-admin', 'Operations Lead', 'team@styli.in',  'fdc31e62b66da1f19fc9d6d65ada46ba814a8a3d8e8e76842cad95bb3e0d17b3', 'team-admin', '2026-02-12T00:00:00Z', 'active'),
  ('tm-user',  'Junior Staff',    'staff@styli.in', 'b88e8a4f4b94f72fdb8a9e80e6c9a6a3ec83cba2862b80bbf3fcb78e87f6e6e9', 'team-user',  '2026-04-04T00:00:00Z', 'active');

-- Vendors (approved, demo data — passwords are SHA-256("demo123") with the same salt)
INSERT OR IGNORE INTO vendors (id, business_name, email, password_hash, type, city, gst, phone, status, score, score_trend, approved_at) VALUES
  ('v-kavya',  'Kavya Boutique',     'kavya@boutique.in',     'd5b0a87b7283b7ac6e92f7b3e0c30c76fd0dcb0a8a7b8e3e8e4cf1c6d4d79a01', 'small',  'Jaipur',    '07AABCU9603R1ZN', '9876543210', 'approved', 94, 'stable', '2026-04-02T00:00:00Z'),
  ('v-hm',     'H&M India',          'brand@hm.com',          'd5b0a87b7283b7ac6e92f7b3e0c30c76fd0dcb0a8a7b8e3e8e4cf1c6d4d79a01', 'medium', 'Mumbai',    '07AABCH7654R1ZP', '9876543211', 'approved', 97, 'up',     '2026-03-15T00:00:00Z'),
  ('v-souled', 'The Souled Store',   'seller@souledstore.in', 'd5b0a87b7283b7ac6e92f7b3e0c30c76fd0dcb0a8a7b8e3e8e4cf1c6d4d79a01', 'medium', 'Mumbai',    '07AABCS3210R1ZK', '9876543212', 'approved', 92, 'up',     '2026-03-20T00:00:00Z');

-- Products (9 demo products covering main categories)
INSERT OR IGNORE INTO products (id, vendor_id, name, description, category, price, original_price, tags, sizes, stock, image_url, grad, listed, approved, rating, review_count, is_new, is_exclusive, recommended_count, click_count, created_at) VALUES
  ('p-001', 'v-kavya',  'Block Print Kurta',         'Hand-block printed cotton kurta with A-line silhouette. Made in Jaipur.', 'Kurtas',   159900, 220000, '["A-line","Cotton","Casual","Block print","Warm tones"]', '["S","M","L","XL"]',  '{"S":12,"M":18,"L":8,"XL":4}',  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&q=80&auto=format', 'grad-1',  1, 1, 4.6, 247, 0, 1, 8240,  184, '2026-01-15T00:00:00Z'),
  ('p-002', 'v-kavya',  'Cotton Palazzo Pants',      'Wide-leg cotton palazzo pants with elastic waistband',                     'Trousers', 129900, NULL,   '["Relaxed","Cotton","Casual"]',                            '["S","M","L"]',       '{"S":4,"M":3,"L":1}',           'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80&auto=format', 'grad-4',  1, 1, 4.4, 132, 1, 0, 5890,  118, '2026-03-08T00:00:00Z'),
  ('p-003', 'v-kavya',  'Tiered Cotton Dress',       'Three-tier midi dress in soft cotton',                                     'Dresses',  219900, 289900, '["A-line","Cotton","Floral"]',                             '["XS","S","M","L"]',  '{"XS":6,"S":9,"M":8,"L":5}',    'https://images.unsplash.com/photo-1612722432474-b971cdcea546?w=600&q=80&auto=format', 'grad-7',  1, 1, 4.8,  89, 1, 0, 1240,   62, '2026-04-01T00:00:00Z'),
  ('p-004', 'v-kavya',  'Hand-Block Print Top',      'Loose-fit top with hand-block print',                                      'Tops',     185000, NULL,   '["Relaxed","Cotton","Hand-block","Warm tones"]',           '["S","M","L"]',       '{"S":1,"M":2,"L":0}',           'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&q=80&auto=format', 'grad-3',  1, 1, 4.7, 203, 0, 1, 6120,  142, '2026-02-10T00:00:00Z'),
  ('p-005', 'v-hm',     'Relaxed Linen Shirt',       'Breathable linen button-down for everyday',                                'Shirts',   199900, NULL,   '["Relaxed","Linen","Casual","Neutral"]',                   '["S","M","L","XL"]',  '{"S":24,"M":32,"L":18,"XL":8}', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80&auto=format', 'grad-5',  1, 1, 4.5, 412, 0, 0, 12800, 380, '2026-02-20T00:00:00Z'),
  ('p-006', 'v-hm',     'Slim Fit Oxford Shirt',     'Classic Oxford cotton shirt, slim fit',                                    'Shirts',   179900, 229900, '["Slim fit","Cotton","Formal","Cool tones"]',              '["S","M","L","XL"]',  '{"S":18,"M":26,"L":22,"XL":12}','https://images.unsplash.com/photo-1551803091-e20673f15770?w=600&q=80&auto=format', 'grad-10', 1, 1, 4.3, 318, 0, 0, 9400,  290, '2026-02-25T00:00:00Z'),
  ('p-007', 'v-hm',     'Cotton Poplin Midi Dress',  'Structured midi dress in cotton poplin',                                   'Dresses',  329000, NULL,   '["A-line","Cotton","Solid"]',                              '["XS","S","M","L"]',  '{"XS":8,"S":12,"M":10,"L":6}',  'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&q=80&auto=format', 'grad-7',  1, 1, 4.6, 156, 1, 0, 4200,  128, '2026-04-05T00:00:00Z'),
  ('p-008', 'v-souled', 'Linen Camp Collar Shirt',   'Resort-style camp collar linen shirt',                                     'Shirts',   149900, NULL,   '["Relaxed","Linen","Casual","Neutral"]',                   '["S","M","L","XL"]',  '{"S":16,"M":22,"L":14,"XL":6}', 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600&q=80&auto=format', 'grad-4',  1, 1, 4.4, 268, 0, 0, 7800,  234, '2026-03-12T00:00:00Z'),
  ('p-009', 'v-souled', 'Oversized Cotton Tee',      'Heavyweight oversized cotton t-shirt',                                     'Tops',      89900, 119900, '["Relaxed","Cotton","Casual"]',                            '["S","M","L","XL"]',  '{"S":28,"M":34,"L":22,"XL":14}','https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80&auto=format', 'grad-6',  1, 1, 4.5, 521, 0, 0, 10200, 310, '2026-03-25T00:00:00Z');

-- Default permissions matrix (matches DEFAULT_TEAM_PERMISSIONS in index.html)
INSERT OR IGNORE INTO permissions (action, roles) VALUES
  ('view.dashboard',       '["team-super","team-admin","team-user"]'),
  ('view.vendors',         '["team-super","team-admin","team-user"]'),
  ('view.products',        '["team-super","team-admin","team-user"]'),
  ('view.orders',          '["team-super","team-admin","team-user"]'),
  ('view.customers',       '["team-super","team-admin","team-user"]'),
  ('edit.vendors.approve', '["team-super","team-admin"]'),
  ('edit.products.unlist', '["team-super","team-admin"]'),
  ('edit.orders.refund',   '["team-super","team-admin"]'),
  ('edit.vendors.delete',  '["team-super"]'),
  ('edit.products.delete', '["team-super"]'),
  ('view.team',            '["team-super"]'),
  ('edit.team',            '["team-super"]'),
  ('view.settings',        '["team-super"]'),
  ('edit.settings',        '["team-super"]'),
  ('view.permissions',     '["team-super"]'),
  ('edit.permissions',     '["team-super"]');

-- =====================================================================
-- DONE. To verify, run:
--   SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
--   SELECT COUNT(*) AS team_count FROM team_members;
--   SELECT COUNT(*) AS vendor_count FROM vendors;
--   SELECT COUNT(*) AS product_count FROM products;
-- =====================================================================
