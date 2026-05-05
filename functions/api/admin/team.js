// Admin team-member management — D1 backed.
// GET    /api/admin/team                   — list all team members
// POST   /api/admin/team                   — invite new member { name, email, password, role }
// PATCH  /api/admin/team                   — edit member { id, name?, email?, role?, status?, password? }
// DELETE /api/admin/team?id=tm-XXX         — remove member (refuses if it's the last super)
//
// Auth: 'view.team' for GET, 'edit.team' for mutations (super-only by default).
//
// TODO REMOVE BEFORE PRODUCTION — temporary plaintext password storage:
// We mirror the password into team_members.plain_password (column added 2026-05-05)
// to make demo/testing easier. This is a deliberate security antipattern and
// MUST be reverted before going live to real users:
//   1) ALTER TABLE team_members DROP COLUMN plain_password;
//   2) Remove the `plain_password` lines marked TODO_PLAINTEXT below.
//   3) Stop returning the column from GET.

import { json, error, preflight, requireDB, parseJSON, isEmail, clean, genId, now } from '../../_lib/db.js';
import { getSession, teamCan, hashPassword } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

const VALID_ROLES = ['team-super', 'team-admin', 'team-user'];
const VALID_STATUSES = ['active', 'invited', 'disabled'];

async function requireTeam(env, request, perm) {
  const s = await getSession(env, request);
  if (!s || s.userType !== 'team') return { err: error('Team login required', 401) };
  if (!await teamCan(env, perm, s.userRole)) return { err: error('Forbidden', 403) };
  return { session: s };
}

export async function onRequestGet(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'view.team');
  if (auth.err) return auth.err;
  const { results } = await context.env.DB.prepare(
    // TODO_PLAINTEXT: remove plain_password from this SELECT before production
    `SELECT id, name, email, role, status, joined_at, last_active_at, invited_by, plain_password
     FROM team_members ORDER BY joined_at DESC`
  ).all();
  return json({ members: results || [] });
}

export async function onRequestPost(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const name = clean(body?.name, 80);
  const email = clean(body?.email, 120).toLowerCase();
  const password = String(body?.password || '');
  const role = VALID_ROLES.includes(body?.role) ? body.role : 'team-user';

  if (!name || name.length < 2) return error('Name is required', 400);
  if (!isEmail(email)) return error('Valid email required', 400);
  if (!password || password.length < 6) return error('Password must be at least 6 characters', 400);

  const id = genId('tm');
  const passwordHash = await hashPassword(password);
  const t = now();

  try {
    await context.env.DB.prepare(
      // TODO_PLAINTEXT: remove plain_password from this INSERT before production
      `INSERT INTO team_members (id, name, email, password_hash, role, status, joined_at, invited_by, plain_password)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).bind(id, name, email, passwordHash, role, t, auth.session.userId, password).run();

    // Audit
    await context.env.DB.prepare(
      `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, 'team.invite', 'team_member', ?, ?, ?)`
    ).bind('al-' + crypto.randomUUID().slice(0, 8), auth.session.userId, id, JSON.stringify({ role }), t).run();

    return json({ success: true, id, email, name, role });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('A team member with this email already exists', 409);
    return error('Server error', 500, err?.message);
  }
}

export async function onRequestPatch(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const [body, perr] = await parseJSON(context.request); if (perr) return perr;

  const id = clean(body?.id, 50);
  if (!id) return error('id required', 400);

  // Look up current state — needed for "last super" guard on role downgrade
  const current = await context.env.DB.prepare(
    'SELECT role, status FROM team_members WHERE id = ?'
  ).bind(id).first();
  if (!current) return error('Team member not found', 404);

  const fields = [];
  const binds = [];
  if ('name' in body)  { fields.push('name = ?');  binds.push(clean(body.name, 80)); }
  if ('email' in body) {
    const e = clean(body.email, 120).toLowerCase();
    if (!isEmail(e)) return error('Valid email required', 400);
    fields.push('email = ?'); binds.push(e);
  }
  if ('role' in body && VALID_ROLES.includes(body.role)) {
    // Don't let the last super lose their super-ness
    if (current.role === 'team-super' && body.role !== 'team-super') {
      const otherSupers = await context.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM team_members WHERE role = 'team-super' AND status = 'active' AND id != ?`
      ).bind(id).first();
      if ((otherSupers?.n || 0) === 0) return error('Cannot demote — at least one Superadmin must remain', 409);
    }
    fields.push('role = ?'); binds.push(body.role);
  }
  if ('status' in body && VALID_STATUSES.includes(body.status)) {
    if (current.role === 'team-super' && body.status !== 'active') {
      const otherSupers = await context.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM team_members WHERE role = 'team-super' AND status = 'active' AND id != ?`
      ).bind(id).first();
      if ((otherSupers?.n || 0) === 0) return error('Cannot disable — at least one active Superadmin must remain', 409);
    }
    fields.push('status = ?'); binds.push(body.status);
  }
  if ('password' in body && body.password) {
    if (String(body.password).length < 6) return error('Password must be at least 6 characters', 400);
    fields.push('password_hash = ?');
    binds.push(await hashPassword(String(body.password)));
    // TODO_PLAINTEXT: remove plain_password mirror before production
    fields.push('plain_password = ?');
    binds.push(String(body.password));
  }

  if (fields.length === 0) return error('No fields to update', 400);
  binds.push(id);
  try {
    await context.env.DB.prepare(`UPDATE team_members SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();

    // Audit
    await context.env.DB.prepare(
      `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, 'team.update', 'team_member', ?, ?, ?)`
    ).bind('al-' + crypto.randomUUID().slice(0, 8), auth.session.userId, id, JSON.stringify(Object.keys(body).filter(k => k !== 'id' && k !== 'password')), now()).run();

    return json({ success: true });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('unique')) return error('Another team member is already using that email', 409);
    return error('Server error', 500, err?.message);
  }
}

export async function onRequestDelete(context) {
  const dbErr = requireDB(context.env); if (dbErr) return dbErr;
  const auth = await requireTeam(context.env, context.request, 'edit.team');
  if (auth.err) return auth.err;
  const url = new URL(context.request.url);
  const id = clean(url.searchParams.get('id'), 50);
  if (!id) return error('id required', 400);
  if (id === auth.session.userId) return error('You cannot delete your own account', 409);

  // Prevent deleting the last super
  const target = await context.env.DB.prepare('SELECT role FROM team_members WHERE id = ?').bind(id).first();
  if (!target) return error('Team member not found', 404);
  if (target.role === 'team-super') {
    const otherSupers = await context.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM team_members WHERE role = 'team-super' AND status = 'active' AND id != ?`
    ).bind(id).first();
    if ((otherSupers?.n || 0) === 0) return error('Cannot delete — at least one Superadmin must remain', 409);
  }

  await context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND user_type = ?').bind(id, 'team').run();
  const r = await context.env.DB.prepare('DELETE FROM team_members WHERE id = ?').bind(id).run();

  // Audit
  await context.env.DB.prepare(
    `INSERT INTO team_audit_log (id, actor_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, 'team.remove', 'team_member', ?, ?, ?)`
  ).bind('al-' + crypto.randomUUID().slice(0, 8), auth.session.userId, id, JSON.stringify({ role: target.role }), now()).run();

  return json({ success: true, deleted: r?.meta?.changes || 0 });
}
