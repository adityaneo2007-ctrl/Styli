// GET /api/admin/kpis  — platform-wide KPIs for the team dashboard
import { json, error, preflight, requireDB } from '../../_lib/db.js';
import { getSession, teamCan } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'team') return error('Team login required', 401);
  if (!await teamCan(env, 'view.dashboard', session.userRole)) return error('Forbidden', 403);

  // Parallel queries
  const [
    pendingVendors,
    approvedVendors,
    totalProducts,
    liveProducts,
    totalOrders,
    deliveredOrders,
    gmvRow,
    buyerCount,
    newsletterCount,
  ] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM vendor_applications WHERE status = 'pending'`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM vendors WHERE status = 'approved'`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE listed = 1 AND approved = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM orders`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered'`).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(price * qty), 0) AS gmv FROM orders WHERE status != 'cancelled'`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM buyers`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM newsletter_signups`).first(),
  ]);

  return json({
    kpis: {
      pendingVendors: pendingVendors?.n || 0,
      approvedVendors: approvedVendors?.n || 0,
      totalProducts: totalProducts?.n || 0,
      liveProducts: liveProducts?.n || 0,
      totalOrders: totalOrders?.n || 0,
      deliveredOrders: deliveredOrders?.n || 0,
      gmv: gmvRow?.gmv || 0,
      buyers: buyerCount?.n || 0,
      newsletterSubscribers: newsletterCount?.n || 0,
    },
  });
}
