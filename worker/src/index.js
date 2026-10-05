/*
 * Nozima TURN credential minter (Cloudflare Worker).
 *
 * Keeps the Cloudflare TURN key id + API token server-side (Worker secrets),
 * mints SHORT-LIVED ICE credentials and returns only { iceServers, ttl,
 * expiresAt } to browsers served from an allowed origin. The long-lived key
 * and token are never part of any response.
 */

const TURN_ROUTE = '/api/turn-credentials';
const DEFAULT_TTL_S = 4 * 60 * 60;
const RATE_LIMIT = 30; // requests per IP per minute (per isolate fallback)
const RATE_WINDOW_MS = 60 * 1000;

const hits = new Map();

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function rateLimited(env, ip) {
  // Preferred: Cloudflare Rate Limiting binding when configured.
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return !success;
  }

  // Fallback: per-isolate sliding window (best effort).
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);

  list.push(now);
  hits.set(ip, list);

  if (hits.size > 5000) hits.clear();

  return list.length > RATE_LIMIT;
}

// Keep only stun/turn/turns URLs; drop :53 (browsers block it); strip
// credentials from STUN entries.
export function sanitizeIceServers(list) {
  if (!Array.isArray(list)) return [];

  return list
    .map((server) => {
      const urls = (Array.isArray(server?.urls) ? server.urls : [server?.urls]).filter(
        (u) =>
          typeof u === 'string' &&
          /^(stun|turn|turns):/i.test(u) &&
          !/^(stun|turn|turns):[^?]*:53(\?|$)/i.test(u)
      );

      if (!urls.length) return null;

      const isTurn = urls.some((u) => /^turns?:/i.test(u));
      const out = { urls };

      if (isTurn && typeof server.username === 'string' && typeof server.credential === 'string') {
        out.username = server.username;
        out.credential = server.credential;
      } else if (isTurn) {
        return null;
      }

      return out;
    })
    .filter(Boolean);
}

async function mint(env) {
  const base = env.CF_API_BASE || 'https://rtc.live.cloudflare.com';
  const ttl = Math.min(Math.max(Number(env.TURN_TTL_SECONDS) || DEFAULT_TTL_S, 600), 86400);

  const res = await fetch(
    `${base}/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
    }
  );

  if (!res.ok) return { error: 'turn provider rejected the request', status: res.status };

  const data = await res.json();
  const iceServers = sanitizeIceServers(data?.iceServers);
  const hasTurn = iceServers.some((s) => s.urls.some((u) => /^turns?:/i.test(u)));

  if (!hasTurn) return { error: 'turn provider returned no usable TURN servers', status: 502 };

  return { iceServers, ttl };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const allowed = parseOrigins(env.ALLOWED_ORIGINS);
    const originOk = Boolean(origin) && allowed.includes(origin);

    if (request.method === 'OPTIONS') {
      return originOk
        ? new Response(null, { status: 204, headers: cors(origin) })
        : json({ error: 'origin not allowed' }, 403);
    }

    if (url.pathname === '/health') {
      return json({ ok: true, configured: Boolean(env.TURN_KEY_ID && env.TURN_API_TOKEN) }, 200);
    }

    if (url.pathname !== TURN_ROUTE || request.method !== 'GET') {
      return json({ error: 'not found' }, 404);
    }

    if (!originOk) return json({ error: 'origin not allowed' }, 403);

    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
      return json({ error: 'turn is not configured' }, 503, cors(origin));
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (await rateLimited(env, ip)) {
      return json({ error: 'rate limited' }, 429, { ...cors(origin), 'Retry-After': '60' });
    }

    try {
      const minted = await mint(env);

      if (minted.error) {
        return json({ error: minted.error }, 502, cors(origin));
      }

      return json(
        {
          iceServers: minted.iceServers,
          ttl: minted.ttl,
          expiresAt: Date.now() + minted.ttl * 1000,
        },
        200,
        cors(origin)
      );
    } catch {
      return json({ error: 'turn provider unreachable' }, 502, cors(origin));
    }
  },
};
