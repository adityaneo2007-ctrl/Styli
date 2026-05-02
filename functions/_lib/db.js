// Shared database helpers used by all Pages Functions
// Imports as: import { json, error, requireDB, ... } from '../_lib/db.js'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

export function error(message, status = 400, detail) {
  return json({ error: message, ...(detail ? { detail } : {}) }, status);
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Verify D1 binding exists; return null if good, or an error Response
export function requireDB(env) {
  if (!env.DB) return error('D1 binding "DB" missing — check Pages → Settings → Bindings', 500);
  return null;
}

// Parse JSON body safely
export async function parseJSON(request) {
  try {
    return [await request.json(), null];
  } catch {
    return [null, error('Invalid JSON body', 400)];
  }
}

// Generate a unique ID with a prefix
export function genId(prefix) {
  return prefix + '-' + crypto.randomUUID().slice(0, 8);
}

// Friendly order ID like "SY-XXXX"
export function genOrderId() {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `SY-${n}`;
}

// Current ISO timestamp
export function now() {
  return new Date().toISOString();
}

// Validate email format
export function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Sanitize string input — trim and limit length
export function clean(s, maxLen = 200) {
  return String(s || '').trim().slice(0, maxLen);
}
