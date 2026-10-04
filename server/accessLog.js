import { pool } from './db.js';

const TZ = 'America/Sao_Paulo';
const SESSION_GAP_MS = 30 * 60 * 1000;
const GEO_RETRY_MS = 10 * 60 * 1000;
const lastRecorded = new Map();
const firstUseDay = new Map();
const geoMiss = new Map();
const PRESENCE = "('login','visit','first_use')";

function todayInSp() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function clientIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = real || fwd || (req.socket && req.socket.remoteAddress) || '';
  return raw.replace(/^::ffff:/, '').slice(0, 64);
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80)/i.test(ip)) return true;
  return false;
}

export function deviceLabel(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\/|CriOS\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Navegador';
  const os = /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

async function lookupGeo(ip) {
  if (isPrivateIp(ip)) return null;
  const { rows } = await pool.query('SELECT city, region, country FROM ip_geo_cache WHERE ip=$1', [ip]);
  if (rows[0]) return rows[0];
  const missAt = geoMiss.get(ip);
  if (missAt && Date.now() - missAt < GEO_RETRY_MS) return null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region_code,country`, { signal: AbortSignal.timeout(3000) });
    const j = await res.json();
    if (!j || !j.success) throw new Error('sem resultado');
    const geo = { city: j.city || '', region: j.region_code || '', country: j.country || '' };
    await pool.query(
      `INSERT INTO ip_geo_cache (ip, city, region, country) VALUES ($1,$2,$3,$4) ON CONFLICT (ip) DO NOTHING`,
      [ip, geo.city, geo.region, geo.country],
    );
    return geo;
  } catch (e) {
    geoMiss.set(ip, Date.now());
    return null;
  }
}

export function recordAccess(userId, kind, req) {
  if (kind !== 'login_failed') {
    lastRecorded.set(userId, Date.now());
    firstUseDay.set(userId, todayInSp());
  }
  (async () => {
    const ip = clientIp(req);
    const { rows } = await pool.query(
      `INSERT INTO user_access_events (user_id, kind, ip, forwarded_for, user_agent) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, kind, ip, String(req.headers['x-forwarded-for'] || '').slice(0, 200), String(req.headers['user-agent'] || '').slice(0, 300)],
    );
    const geo = await lookupGeo(ip);
    if (geo) await pool.query('UPDATE user_access_events SET city=$2, region=$3, country=$4 WHERE id=$1', [rows[0].id, geo.city, geo.region, geo.country]);
  })().catch((e) => console.error('Acessos: falha ao registrar', e.message));
}

export function noteVisit(userId, req) {
  const now = Date.now();
  const last = lastRecorded.get(userId);
  if (last && now - last < SESSION_GAP_MS) return;
  lastRecorded.set(userId, now);
  pool.query(`SELECT max(at) AS at FROM user_access_events WHERE user_id=$1 AND kind IN ${PRESENCE}`, [userId])
    .then(({ rows }) => {
      const at = rows[0] && rows[0].at;
      if (at && now - at.getTime() < SESSION_GAP_MS) { lastRecorded.set(userId, at.getTime()); return; }
      recordAccess(userId, 'visit', req);
    })
    .catch((e) => console.error('Acessos: falha ao checar visita', e.message));
}

export function noteFirstUse(userId, req) {
  const today = todayInSp();
  if (firstUseDay.get(userId) === today) return;
  firstUseDay.set(userId, today);
  pool.query(
    `SELECT 1 FROM user_access_events
     WHERE user_id=$1 AND kind IN ${PRESENCE}
       AND (at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
     LIMIT 1`,
    [userId, TZ],
  )
    .then(({ rows }) => { if (!rows.length) recordAccess(userId, 'first_use', req); })
    .catch((e) => {
      firstUseDay.delete(userId);
      console.error('Acessos: falha ao checar primeiro uso do dia', e.message);
    });
}

function rowToEvent(r) {
  return { id: String(r.id), kind: r.kind, at: r.at.toISOString(), ip: r.ip, city: r.city, region: r.region, country: r.country, device: deviceLabel(r.user_agent) };
}

export async function accessSummary(userIds) {
  if (!userIds.length) return {};
  const [{ rows: counts }, { rows: lasts }] = await Promise.all([
    pool.query(
      `SELECT user_id,
              count(*) FILTER (WHERE kind IN ${PRESENCE})::int AS access_count,
              count(DISTINCT (at AT TIME ZONE '${TZ}')::date) FILTER (WHERE kind IN ${PRESENCE})::int AS active_days,
              count(*) FILTER (WHERE kind='login_failed' AND at > now() - interval '30 days')::int AS failed_30d
       FROM user_access_events WHERE user_id = ANY($1) GROUP BY user_id`,
      [userIds],
    ),
    pool.query(
      `SELECT DISTINCT ON (user_id) id, user_id, kind, at, ip, city, region, country, user_agent
       FROM user_access_events WHERE user_id = ANY($1) AND kind IN ${PRESENCE}
       ORDER BY user_id, at DESC`,
      [userIds],
    ),
  ]);
  const out = {};
  for (const c of counts) out[c.user_id] = { count: c.access_count, activeDays: c.active_days, failed30d: c.failed_30d, last: null };
  for (const l of lasts) { if (!out[l.user_id]) out[l.user_id] = { count: 0, activeDays: 0, failed30d: 0, last: null }; out[l.user_id].last = rowToEvent(l); }
  return out;
}

export async function recentAccess(userId, limit = 25) {
  const { rows } = await pool.query(
    'SELECT id, kind, at, ip, city, region, country, user_agent FROM user_access_events WHERE user_id=$1 ORDER BY at DESC LIMIT $2',
    [userId, limit],
  );
  return rows.map(rowToEvent);
}
