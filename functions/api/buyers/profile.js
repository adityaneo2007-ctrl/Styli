// GET   /api/buyers/profile  — get current buyer's profile
// PATCH /api/buyers/profile  — update profile (gender, measurements, style preferences)
import { json, error, preflight, requireDB, parseJSON, clean, now } from '../../_lib/db.js';
import { getSession } from '../../_lib/auth.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const profile = await env.DB.prepare(
    `SELECT * FROM buyer_profiles WHERE buyer_id = ?`
  ).bind(session.userId).first();

  return json({ profile: profile || null });
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const dbErr = requireDB(env); if (dbErr) return dbErr;

  const session = await getSession(env, request);
  if (!session || session.userType !== 'buyer') return error('Buyer login required', 401);

  const [body, parseErr] = await parseJSON(request); if (parseErr) return parseErr;

  // Whitelist fields
  const fields = {
    gender: clean(body?.gender, 20),
    height: parseInt(body?.height, 10) || null,
    weight: parseInt(body?.weight, 10) || null,
    chest: parseInt(body?.chest, 10) || null,
    waist: parseInt(body?.waist, 10) || null,
    hip: parseInt(body?.hip, 10) || null,
    fit: clean(body?.fit, 20),
    style: clean(body?.style, 20),
    face_scan_completed: body?.faceScanCompleted ? 1 : 0,
    face_shape: clean(body?.faceShape, 30),
    skin_tone: clean(body?.skinTone, 30),
    undertone: clean(body?.undertone, 30),
    updated_at: now(),
  };

  // Upsert
  await env.DB.prepare(
    `INSERT INTO buyer_profiles
       (buyer_id, gender, height, weight, chest, waist, hip, fit, style,
        face_scan_completed, face_shape, skin_tone, undertone, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(buyer_id) DO UPDATE SET
       gender = excluded.gender,
       height = excluded.height,
       weight = excluded.weight,
       chest = excluded.chest,
       waist = excluded.waist,
       hip = excluded.hip,
       fit = excluded.fit,
       style = excluded.style,
       face_scan_completed = excluded.face_scan_completed,
       face_shape = excluded.face_shape,
       skin_tone = excluded.skin_tone,
       undertone = excluded.undertone,
       updated_at = excluded.updated_at`
  ).bind(
    session.userId,
    fields.gender, fields.height, fields.weight, fields.chest, fields.waist, fields.hip,
    fields.fit, fields.style, fields.face_scan_completed,
    fields.face_shape, fields.skin_tone, fields.undertone, fields.updated_at
  ).run();

  return json({ success: true, profile: fields });
}
