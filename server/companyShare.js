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
const KINDS = ['page', 'data']; // 'page' = link do cliente (tela), 'data' = link de dados (CSV/JSON para Power BI e afins); revogar um não derruba o outro
const kindOf = (v) => (KINDS.includes(v) ? v : 'page');
const newToken = () => crypto.randomBytes(9).toString('base64url'); // 12 caracteres (72 bits); os links antigos de 43 continuam valendo
const TOKEN_RE = /^[A-Za-z0-9_-]{10,80}$/;
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

async function activeLink(client, projectId, kind) {
  const { rows } = await client.query('SELECT * FROM company_share_links WHERE project_id=$1 AND kind=$2 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [projectId, kind]);
  return rows[0] || null;
}

router.get('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    res.set('Cache-Control', 'no-store');
    res.json({ link: linkMeta(await activeLink(pool, p.id, kindOf(req.query.kind))) });
  } catch (e) { next(e); }
});

// Gera um link novo; o anterior (se houver) para de funcionar.
router.post('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const p = await loadProject(req, res); if (!p) return;
    const kind = kindOf(req.body && req.body.kind);
    const days = VALID_DAYS.includes(Number(req.body && req.body.days)) ? Number(req.body.days) : 180;
    await client.query('BEGIN');
    await client.query('UPDATE company_share_links SET revoked_at=now() WHERE project_id=$1 AND kind=$2 AND revoked_at IS NULL', [p.id, kind]);
    const token = newToken();
    const { rows } = await client.query(
      `INSERT INTO company_share_links (id, org_id, project_id, token, created_by, created_by_name, expires_at, kind)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::int > 0 THEN now() + ($7::int || ' days')::interval ELSE NULL END, $8) RETURNING *`,
      [uid('shl'), p.org_id, p.id, token, req.user.id, clip(req.user.name, 80), days, kind]);
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ link: linkMeta(rows[0]) });
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ } next(e); } finally { client.release(); }
});

router.delete('/:projectId', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const p = await loadProject(req, res); if (!p) return;
    const r = await pool.query('UPDATE company_share_links SET revoked_at=now() WHERE project_id=$1 AND kind=$2 AND revoked_at IS NULL', [p.id, kindOf(req.query.kind)]);
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
    if (!TOKEN_RE.test(token)) return res.status(404).json({ message: NOT_FOUND });
    const { rows } = await pool.query(
      `SELECT l.id, p.data FROM company_share_links l JOIN projects p ON p.id = l.project_id
       WHERE l.token=$1 AND l.kind='page' AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now())`, [token]);
    if (!rows[0]) return res.status(404).json({ message: NOT_FOUND });
    pool.query('UPDATE company_share_links SET views = views + 1, last_viewed_at = now() WHERE id=$1', [rows[0].id]).catch(() => {});
    res.json(buildPublicPayload(rows[0].data, todayInSp()));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- link de dados (Power BI, Excel, Make/Zapier, scripts): só leitura, mesmos campos da página pública, sem login
const STATUS_ROTULO = { 'nao-iniciado': 'Não iniciado', pendente: 'Pendente', 'em-andamento': 'Em andamento', pausado: 'Pausado', concluido: 'Concluído', atrasada: 'Atrasada' };

// Tabelas planas (uma linha por atividade / por subatividade), no mesmo cálculo de "atrasada" da página. Função pura: testada em Node.
export function buildDataTables(data, today) {
  const pub = buildPublicPayload(data, today);
  const phaseName = new Map(pub.phases.map((p) => [p.id, p.name]));
  const late = (end) => !!end && end < today;
  const atividades = [];
  const subatividades = [];
  for (const a of pub.activities) {
    const fim = a.endDate || a.date || '';
    const situacao = a.status !== 'concluido' && late(fim) ? 'atrasada' : a.status;
    const fase = phaseName.get(a.phase) || 'Outras';
    atividades.push({
      atividade_id: a.id, fase, atividade: a.title, status: a.status, situacao: STATUS_ROTULO[situacao] || situacao, inicio: a.date, fim, responsavel: a.responsible,
      subatividades_total: a.subs.length, subatividades_concluidas: a.subs.filter((x) => x.done).length,
    });
    for (const x of a.subs) {
      const sit = x.done ? 'concluido' : late(x.date) ? 'atrasada' : 'pendente';
      subatividades.push({ subatividade_id: x.id, atividade_id: a.id, fase, atividade: a.title, subatividade: x.title, concluida: x.done ? 'Sim' : 'Não', situacao: STATUS_ROTULO[sit], data: x.date, responsavel: x.responsible });
    }
  }
  return { empresa: pub.company.name, gerado_em: today, fases: pub.phases.map((p) => p.name), atividades, subatividades };
}

// CSV UTF-8 com BOM (Excel e Power BI abrem o português certo). Célula que começa com = + @ vira texto, para não rodar como fórmula no Excel.
export function toCsv(rows, columns) {
  const cell = (v) => {
    let t = String(v == null ? '' : v);
    if (/^[=+@\t\r]/.test(t)) t = `'${t}`;
    return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `\uFEFF${[columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n')}\r\n`;
}

export const dataRouter = Router();
const ATIV_COLS = ['atividade_id', 'fase', 'atividade', 'status', 'situacao', 'inicio', 'fim', 'responsavel', 'subatividades_total', 'subatividades_concluidas'];
const SUB_COLS = ['subatividade_id', 'atividade_id', 'fase', 'atividade', 'subatividade', 'concluida', 'situacao', 'data', 'responsavel'];
const DATA_FILES = { 'atividades.csv': 'atividades', 'subatividades.csv': 'subatividades' };
dataRouter.get('/:token/:file', async (req, res, next) => {
  try {
    if (limited(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip)) return res.status(429).json({ message: 'Muitas consultas seguidas. Tente de novo em um minuto.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const token = String(req.params.token || '');
    const file = String(req.params.file || '');
    if (!TOKEN_RE.test(token) || !(file === 'dados.json' || DATA_FILES[file])) return res.status(404).json({ message: NOT_FOUND });
    const { rows } = await pool.query(
      `SELECT l.id, p.data FROM company_share_links l JOIN projects p ON p.id = l.project_id
       WHERE l.token=$1 AND l.kind='data' AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now())`, [token]);
    if (!rows[0]) return res.status(404).json({ message: NOT_FOUND });
    pool.query('UPDATE company_share_links SET views = views + 1, last_viewed_at = now() WHERE id=$1', [rows[0].id]).catch(() => {});
    const t = buildDataTables(rows[0].data, todayInSp());
    if (file === 'dados.json') return res.json(t);
    const key = DATA_FILES[file];
    const cols = key === 'atividades' ? ATIV_COLS : SUB_COLS;
    res.type('text/csv; charset=utf-8').send(toCsv(t[key], cols));
  } catch (e) { next(e); }
});
