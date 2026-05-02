// PATCH /api/orders/:id   — vendor updates order status (ship / deliver / cancel)
// Body: { action: 'ship' | 'deliver' | 'cancel', cancelReason? }
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestPatch(context) {
  const { params, request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session) return error('Authentication required', 401);

  const id = clean(params.id, 50);
  const order = await env.DB.prepare(
    'SELECT id, vendor_id, buyer_id, status FROM orders WHERE id = ?'
  ).bind(id).first();
  if (!order) return error('Order not found', 404);

  // Vendor can update own orders; team-admin or team-super can update any
  const isVendor = session.userType === 'vendor' && order.vendor_id === session.userId;
  const isTeam = session.userType === 'team' && ['team-super', 'team-admin'].includes(session.userRole);
  if (!isVendor && !isTeam) return error('Forbidden', 403);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;
  const action = clean(body?.action, 20);

  const t = now();
  if (action === 'ship') {
    if (order.status !== 'to-ship') return error(`Cannot ship — order is ${order.status}`, 400);
    await env.DB.prepare(
      `UPDATE orders SET status = 'in-transit', shipped_at = ? WHERE id = ?`
    ).bind(t, id).run();
  } else if (action === 'deliver') {
    if (!['in-transit', 'to-ship'].includes(order.status)) return error(`Cannot deliver — order is ${order.status}`, 400);
    await env.DB.prepare(
      `UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?`
    ).bind(t, id).run();
  } else if (action === 'cancel') {
    if (order.status === 'delivered' || order.status === 'cancelled') return error(`Cannot cancel — order is ${order.status}`, 400);
    await env.DB.prepare(
      `UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`
    ).bind(t, clean(body?.cancelReason, 200), id).run();
  } else {
    return error('Invalid action — use ship / deliver / cancel', 400);
  }

  return json({ success: true });
}
