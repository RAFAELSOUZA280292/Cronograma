// Link público de acompanhamento da empresa (2026-10-19, pedido do Rafael): o cliente abre o link SEM login e vê Resumo, Cronograma (Gantt com subatividades) e Tabela, só leitura.
// "Editar" leva ao login normal. O token mora numa tabela própria (não no JSON do projeto, que o painel regrava inteiro e poderia ressuscitar um link revogado).
// Só sai o que está na lista abaixo (título, fase, status, datas, responsável, subatividades): nada de notas, comentários, anexos, log, reuniões, transcrições nem descrição.
import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { canAccessProject } from './routes.js';
import { todayInSp } from './widgetSummary.js';

export const router = Router();
export const publicRouter = Router();

const VALID_DAYS = [0, 30, 90, 180, 365];
const alive = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && !x.deleted) : []);
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const NOT_FOUND = 'Este link é inválido, venceu ou foi desativado. Peça um novo a quem o enviou.';

const linkMeta = (r) => r && ({
  token: r.token, createdAt: r.created_at, createdBy: r.created_by_name || '', expiresAt: r.expires_at, expired: !!r.expires_at && new Date(r.expires_at) < new Date(),
  views: r.views, lastViewedAt: r.last_viewed_at,
});

// ---------------------------------------------------------------- equipe (master/pricetax)
async function loadProject(req, res) {
  const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [req.params.projectId]);
  const r = rows[0];
  if (!r || !canAccessProject(req.user, r.data, r.org_id)) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  return r;
}

async function activeLink(client, projectId) {
  const { rows } = await client.query('SELECT * FROM company_share_links WHERE project_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [projectId]);
  return rows[0] || null;
}

router.get('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    res.set('Cache-Control', 'no-store');
    res.json({ link: linkMeta(await activeLink(pool, p.id)) });
  } catch (e) { next(e); }
});

// Gera um link novo; o anterior (se houver) para de funcionar.
router.post('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const p = await loadProject(req, res); if (!p) return;
    const days = VALID_DAYS.includes(Number(req.body && req.body.days)) ? Number(req.body.days) : 180;
    await client.query('BEGIN');
    await client.query('UPDATE company_share_links SET revoked_at=now() WHERE project_id=$1 AND revoked_at IS NULL', [p.id]);
    const token = crypto.randomBytes(32).toString('base64url');
    const { rows } = await client.query(
      `INSERT INTO company_share_links (id, org_id, project_id, token, created_by, created_by_name, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::int > 0 THEN now() + ($7::int || ' days')::interval ELSE NULL END) RETURNING *`,
      [uid('shl'), p.org_id, p.id, token, req.user.id, clip(req.user.name, 80), days]);
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ link: linkMeta(rows[0]) });
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ } next(e); } finally { client.release(); }
});

router.delete('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const r = await pool.query('UPDATE company_share_links SET revoked_at=now() WHERE project_id=$1 AND revoked_at IS NULL', [p.id]);
    res.json({ revoked: r.rowCount });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- público (sem login)
// Só o que o cliente pode ver. Função pura: testada em Node.
export function buildPublicPayload(data, today) {
  const c = (data && data.company) || {};
  return {
    today,
    company: {
      name: clip(c.nomeFantasia || c.name || 'Empresa', 120),
      logo: typeof c.logo === 'string' && c.logo.length < 400000 ? c.logo : '',
    },
    phases: alive(data && data.phases).map((p) => ({ id: p.id, name: clip(p.name, 80) })),
    activities: alive(data && data.activities).slice(0, 500).map((a) => ({
      id: a.id, title: clip(a.title, 200), phase: a.phase, status: a.status || 'nao-iniciado', date: a.date || '', endDate: a.endDate || '', responsible: clip(a.responsible, 80),
      subs: alive(a.subactivities).slice(0, 100).map((s) => ({ id: s.id, title: clip(s.title, 240), done: !!s.done, date: s.date || '', responsible: clip(s.responsible, 80) })),
    })),
  };
}

// Atrás do proxy do Railway o req.ip é sempre o do proxy; usa o primeiro IP do X-Forwarded-For (limite brando, anti-abuso, não segurança).
const hits = new Map();
function limited(ip) {
  const now = Date.now(); const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60000 }); if (hits.size > 5000) hits.clear(); return false; }
  h.n += 1; return h.n > 90;
}

publicRouter.get('/:token', async (req, res, next) => {
  try {
    if (limited(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip)) return res.status(429).json({ message: 'Muitas consultas seguidas. Tente de novo em um minuto.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return res.status(404).json({ message: NOT_FOUND });
    const { rows } = await pool.query(
      `SELECT l.id, p.data FROM company_share_links l JOIN projects p ON p.id = l.project_id
       WHERE l.token=$1 AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now())`, [token]);
    if (!rows[0]) return res.status(404).json({ message: NOT_FOUND });
    pool.query('UPDATE company_share_links SET views = views + 1, last_viewed_at = now() WHERE id=$1', [rows[0].id]).catch(() => {});
    res.json(buildPublicPayload(rows[0].data, todayInSp()));
  } catch (e) { next(e); }
});
