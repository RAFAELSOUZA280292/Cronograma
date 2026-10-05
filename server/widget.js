// Widget do iPhone (Scriptable) — 2026-10-05, §76. O widget não faz login: usa um token secreto, só de leitura,
// que o usuário gera em "Meu perfil". Guardamos apenas o hash (sha256); o token vai no cabeçalho Authorization
// (não na URL, para não cair em log) e pode ser revogado a qualquer momento. O resumo traz só títulos e horários.
import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { clientIp } from './accessLog.js';
import { getConnectionStatus, listEvents } from './googleCalendar.js';
import { buildSummary, sanitizeViews, DEFAULT_VIEWS, BLOCKS } from './widgetSummary.js';

export const router = Router();

const PREFIX = 'pxw_';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => PREFIX + crypto.randomBytes(32).toString('base64url');

// O token fica recuperável (AES-256-GCM, chave derivada do JWT_SECRET) para o painel poder mostrar o script de cada visão a qualquer
// momento, sem gerar código novo. Sem JWT_SECRET o servidor nem sobe; trocar o segredo invalida os tokens guardados (gera-se outro).
const encKey = () => crypto.createHash('sha256').update(`widget-token|${process.env.JWT_SECRET || ''}`).digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  try {
    const [iv, tag, data] = String(blob || '').split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_PER_WINDOW;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now - rec.start > WINDOW_MS) hits.delete(ip);
}, WINDOW_MS).unref();

const eventCache = new Map();
const EVENT_TTL_MS = 5 * 60 * 1000;
async function upcomingEvents(userId, now) {
  const hit = eventCache.get(userId);
  if (hit && now - hit.at < EVENT_TTL_MS) return hit.events;
  const events = await listEvents(userId, new Date(now - 6 * 3600 * 1000).toISOString(), new Date(now + 3 * 86400000).toISOString());
  eventCache.set(userId, { at: now, events });
  return events;
}

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT widget_token_created_at, widget_last_used_at, widget_token_enc FROM users WHERE id=$1', [req.user.id]);
    const r = rows[0] || {};
    res.json({ active: !!r.widget_token_created_at, recoverable: !!(r.widget_token_enc && decrypt(r.widget_token_enc)), createdAt: r.widget_token_created_at || null, lastUsedAt: r.widget_last_used_at || null });
  } catch (e) { next(e); }
});

router.get('/views', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT widget_views FROM users WHERE id=$1', [req.user.id]);
    res.json({ views: (rows[0] && rows[0].widget_views) || DEFAULT_VIEWS, blocks: BLOCKS });
  } catch (e) { next(e); }
});

router.put('/views', requireAuth, async (req, res, next) => {
  try {
    const out = sanitizeViews(req.body && req.body.views);
    if (out.error) return res.status(400).json({ message: out.error });
    await pool.query('UPDATE users SET widget_views=$1 WHERE id=$2', [JSON.stringify(out.views), req.user.id]);
    res.json({ views: out.views });
  } catch (e) { next(e); }
});

router.get('/token', requireAuth, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { rows } = await pool.query('SELECT widget_token_enc FROM users WHERE id=$1', [req.user.id]);
    const token = rows[0] && rows[0].widget_token_enc ? decrypt(rows[0].widget_token_enc) : null;
    if (!token) return res.status(404).json({ message: 'Gere um código do widget.' });
    res.json({ token });
  } catch (e) { next(e); }
});

router.post('/token', requireAuth, async (req, res, next) => {
  try {
    const token = newToken();
    await pool.query('UPDATE users SET widget_token_hash=$1, widget_token_enc=$2, widget_token_created_at=now(), widget_last_used_at=NULL WHERE id=$3', [sha256(token), encrypt(token), req.user.id]);
    res.set('Cache-Control', 'no-store');
    res.json({ token });
  } catch (e) { next(e); }
});

router.delete('/token', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET widget_token_hash=NULL, widget_token_enc=NULL, widget_token_created_at=NULL, widget_last_used_at=NULL WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (limited(clientIp(req))) return res.status(429).json({ message: 'Muitas consultas. Tente de novo em instantes.' });
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token.startsWith(PREFIX) || token.length > 200) return res.status(401).json({ message: 'Token inválido.' });
    const { rows } = await pool.query('SELECT * FROM users WHERE widget_token_hash=$1', [sha256(token)]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Token inválido ou revogado.' });
    if (user.blocked || (user.expires_at && new Date(user.expires_at) < new Date())) return res.status(403).json({ message: 'Acesso indisponível.' });

    const { rows: boardRows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [user.id]);
    const calendar = await getConnectionStatus(user.id);
    const now = Date.now();
    let events = [];
    if (calendar.connected) {
      try { events = await upcomingEvents(user.id, now); } catch (e) { console.error('Widget: falha ao ler agenda', e.message); }
    }
    pool.query('UPDATE users SET widget_last_used_at=now() WHERE id=$1', [user.id]).catch(() => {});
    res.json(buildSummary({ board: boardRows[0] ? boardRows[0].data : null, events, calendarConnected: calendar.connected, now: new Date(now), userName: user.name, views: user.widget_views, viewName: req.query.view }));
  } catch (e) { next(e); }
});
