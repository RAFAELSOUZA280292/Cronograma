// API de conectividade (2026-10-05, §80): permite que OUTRA janela do Claude Code (ou qualquer script) leia o painel e crie atividades
// no quadro pessoal do dono do token. Desenho:
//  - token por janela (`pxk_…`), com escopo `read` (só GET) ou `read_create` (lê e cria atividades), validade e revogação; só o hash fica no banco;
//  - credencial só no cabeçalho Authorization (nunca na URL); limite por token; usuário bloqueado/expirado = 403;
//  - API propositalmente ESTREITA e estável (não é a API interna do app): o token nunca vale como a sessão inteira do usuário;
//  - tudo respeita o que o usuário já pode ver (mesmo canAccessProject das telas) e a organização dele.
import { fitPeriods } from '../shared/period.js';
import { findSub as findSubAny, linkPautaItems, reconcilePautaProject, revertPautaItems, unlinkPautaProject } from '../shared/pauta.js';
import { noteToText } from './richNote.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, blankPersonalBoard } from './db.js';
import { requireAuth, rowToUser } from './auth.js';
import { canAccessProject } from './routes.js';
import { syncCardEvents } from './personalActivity.js';
import { getConnectionStatus, listEvents } from './googleCalendar.js';
import { todayInSp } from './widgetSummary.js';
import { syncProjectMemoryFromDiff } from './memoryIngest.js';
import { originOf, setActor } from './projectAudit.js';
import { createCrmRouter } from './crm/routes.js';

export const router = Router();

const PREFIX = 'pxk_';
export const SCOPES = { read: 'Só leitura', read_create: 'Ler e criar atividades', read_write: 'Ler, criar atividades e ajustar o cronograma de empresas', crm_operate: 'Operar o CRM como Claude Code (criar, editar, mover, excluir e registrar), além de ler' };
// crm_operate só abre /api/connect/crm; nas demais rotas vale como leitura (rank 0) — nunca herda criar atividade nem ajustar cronograma.
const SCOPE_RANK = { read: 0, read_create: 1, read_write: 2, crm_operate: 0 };
const VALID_DAYS = [30, 90, 180, 365];
const MAX_ACTIVE_TOKENS = 10;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

// ------------------------------------------------------------------ gestão dos tokens (cookie, pelo painel)

router.get('/tokens', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, scope, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`, [req.user.id]);
    res.json({ tokens: rows.map((r) => ({ ...r, expired: new Date(r.expires_at) < new Date() })), scopes: SCOPES, canAdmin: !!(req.user.isSuperAdmin || req.user.role === 'master') });
  } catch (e) { next(e); }
});

router.post('/tokens', requireAuth, async (req, res, next) => {
  try {
    const name = clip((req.body || {}).name, 60).trim();
    const scope = Object.prototype.hasOwnProperty.call(SCOPES, (req.body || {}).scope) ? req.body.scope : null;
    const days = VALID_DAYS.includes(Number((req.body || {}).days)) ? Number(req.body.days) : 180;
    if (!name) return res.status(400).json({ message: 'Dê um nome ao token (ex.: "Claude Code do XPED").' });
    if (!scope) return res.status(400).json({ message: 'Escolha o que o token pode fazer.' });
    if ((scope === 'read_write' || scope === 'crm_operate') && !(req.user.isSuperAdmin || req.user.role === 'master')) return res.status(403).json({ message: 'Só administradores geram uma chave que altera cronograma de empresas ou opera o CRM.' });
    const { rows: active } = await pool.query(`SELECT count(*)::int n FROM api_tokens WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()`, [req.user.id]);
    if (active[0].n >= MAX_ACTIVE_TOKENS) return res.status(400).json({ message: `Você já tem ${MAX_ACTIVE_TOKENS} tokens ativos. Revogue algum antes de criar outro.` });
    const token = PREFIX + crypto.randomBytes(32).toString('base64url');
    const id = uid('tok');
    const { rows } = await pool.query(
      `INSERT INTO api_tokens (id, user_id, name, scope, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING created_at, expires_at`,
      [id, req.user.id, name, scope, sha256(token), String(days)]);
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ token, id, name, scope, ...rows[0] });
  } catch (e) { next(e); }
});

// O que o Claude Code alterou no CRM pelas chaves do próprio administrador (últimas 100 gravações).
router.get('/actions', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.at, a.method, a.path, a.status, t.name AS token_name FROM api_token_actions a JOIN api_tokens t ON t.id = a.token_id
       WHERE a.user_id=$1 ORDER BY a.at DESC LIMIT 100`, [req.user.id]);
    res.json({ actions: rows });
  } catch (e) { next(e); }
});

router.delete('/tokens/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`, [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ message: 'Token não encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------ índice público (sem segredo) — o Claude Code pode ler isto primeiro

export const ENDPOINTS = [
  { method: 'GET', path: '/api/connect/me', scope: 'read', what: 'Quem é o dono do token, escopo, validade e a data de hoje (America/Sao_Paulo).' },
  { method: 'GET', path: '/api/connect/activities', scope: 'read', what: 'Atividades do quadro pessoal. Query: status=open|overdue|today|urgent|done|all (padrão open), q=texto, limit (≤200, padrão 50).' },
  { method: 'POST', path: '/api/connect/activities', scope: 'read_create', what: 'Cria uma atividade no quadro pessoal. Corpo: title (obrigatório), desc, dueDate (AAAA-MM-DD), priority (urgente|alta|media|baixa), board, column (nome ou id), ref (chave de idempotência).' },
  { method: 'GET', path: '/api/connect/companies', scope: 'read', what: 'Empresas (cronogramas) que o dono do token pode ver. Query: q=texto.' },
  { method: 'GET', path: '/api/connect/companies/:id', scope: 'read', what: 'Uma empresa: equipe, fases, atividades e lista de reuniões (sem transcrição).' },
  { method: 'GET', path: '/api/connect/companies/:id/meetings/:meetingId', scope: 'read', what: 'Uma reunião: resumo, decisões, itens de ação, participantes. Query: transcript=1 inclui a transcrição (até 60.000 caracteres).' },
  { method: 'POST', path: '/api/connect/companies/:id/plan', scope: 'read_write', what: 'Ajusta o cronograma de uma empresa (só administrador). Corpo: ops (até 200: activity.set, sub.set, sub.add (position top|end, kind, guide, pautaDe), sub.move, activity.add, pauta.link, activity.delete e sub.delete (exclusão com volta pela lixeira; activity.restore e sub.restore desfazem)), dryRun (padrão true: só mostra), note. Tudo ou nada, nada some de verdade, grava no Log da empresa.' },
  { method: '*', path: '/api/connect/crm/…', scope: 'crm_operate', what: 'O CRM inteiro (mesmas rotas e regras de /api/crm: empresas, contatos, negócios, atividades, notas, produtos, funis, cadências), pelo perfil de administrador do dono da chave. Toda gravação fica registrada como "Claude Code (por <dono>)". Fora: escrita da migração do PipeRun.' },
  { method: 'GET', path: '/api/connect/agenda', scope: 'read', what: 'Compromissos do Google Calendar do dono. Query: days=1..14 (padrão 7). Só os aceitos ou próprios.' },
];

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    name: 'PRICETAX — API de conectividade',
    auth: 'Authorization: Bearer <token pxk_…> (gere em Meu perfil > Conectar). Nunca coloque o token na URL.',
    scopes: SCOPES,
    endpoints: ENDPOINTS,
    limits: '120 requisições por minuto por token; 60 atividades criadas por hora.',
    errors: '401 token ausente/inválido/revogado/expirado · 403 escopo insuficiente ou usuário bloqueado · 404 não encontrado · 429 limite · 400 dado inválido.',
  });
});

// ------------------------------------------------------------------ autenticação por token + limites

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;
const hits = new Map();
const creates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  for (const [k, v] of creates) if (now - v.start > 3600 * 1000) creates.delete(k);
}, WINDOW_MS).unref();
function bump(map, key, windowMs, max) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || now - rec.start > windowMs) { map.set(key, { start: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > max;
}

async function bearer(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token.startsWith(PREFIX) || token.length > 200) return res.status(401).json({ message: 'Token ausente ou inválido.' });
    const hash = sha256(token);
    if (bump(hits, hash, WINDOW_MS, MAX_PER_WINDOW)) return res.status(429).json({ message: 'Muitas requisições. Espere um minuto.' });
    const { rows } = await pool.query(`SELECT * FROM api_tokens WHERE token_hash=$1`, [hash]);
    const t = rows[0];
    if (!t || t.revoked_at || new Date(t.expires_at) < new Date()) return res.status(401).json({ message: 'Token inválido, revogado ou expirado. Gere outro em Meu perfil > Conectar.' });
    const u = await pool.query('SELECT * FROM users WHERE id=$1', [t.user_id]);
    const row = u.rows[0];
    if (!row) return res.status(401).json({ message: 'Token inválido.' });
    if (row.blocked || (row.expires_at && new Date(row.expires_at) < new Date())) return res.status(403).json({ message: 'Acesso do usuário indisponível.' });
    if (!t.last_used_at || Date.now() - new Date(t.last_used_at).getTime() > 60000) pool.query('UPDATE api_tokens SET last_used_at=now() WHERE id=$1', [t.id]).catch(() => {});
    req.apiToken = t;
    req.apiHash = hash;
    req.apiUserRow = row;
    req.apiUser = rowToUser(row);
    setActor({ id: req.apiUser.id, name: `${req.apiUser.name || req.apiUser.username} (API, chave "${clip(t.name, 40)}")`, origin: `API ${originOf(req)}` });
    next();
  } catch (e) { next(e); }
}

function needScope(scope) {
  return (req, res, next) => {
    if ((SCOPE_RANK[req.apiToken.scope] ?? -1) >= SCOPE_RANK[scope]) return next();
    if (scope === 'read_write') return res.status(403).json({ message: 'Este token não ajusta cronograma de empresa. Gere um token com "Ler, criar atividades e ajustar o cronograma de empresas".' });
    res.status(403).json({ message: 'Este token é só de leitura. Gere um token com "Ler e criar atividades".' });
  };
}

router.use(bearer);

// ------------------------------------------------------------------ CRM por chave (§99)
// O Claude Code opera o CRM com as MESMAS regras e rotas da tela (/api/crm), pelo perfil do dono da chave, mas toda gravação fica
// registrada como "Claude Code (por <dono>)" na auditoria e na linha do tempo, e cada chamada que altera algo entra em api_token_actions.
// Nunca vale para a migração do PipeRun (escrita) nem para token sem o escopo crm_operate.
const CRM_BLOCKED = /^\/migration(\/|$)/;
function crmViaToken(req, res, next) {
  if (req.apiToken.scope !== 'crm_operate') return res.status(403).json({ message: 'Esta chave não opera o CRM. Gere uma chave "Operar o CRM como Claude Code" em Meu perfil > Conectar (só administrador).' });
  if (!(req.apiUser.isSuperAdmin || req.apiUser.role === 'master')) return res.status(403).json({ message: 'O dono da chave deixou de ser administrador.' });
  if (req.method !== 'GET') {
    const path = clip(String(req.originalUrl || '').split('?')[0], 200);
    res.on('finish', () => {
      pool.query('INSERT INTO api_token_actions (id, org_id, token_id, user_id, method, path, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [uid('act'), req.apiUser.orgId || null, req.apiToken.id, req.apiUser.id, req.method, path, res.statusCode]).catch(() => {});
    });
  }
  if (req.method !== 'GET' && CRM_BLOCKED.test(req.path)) return res.status(403).json({ message: 'A migração do PipeRun só é operada pela tela, por um administrador.' });
  req.user = req.apiUser;
  req.crmActor = { id: req.apiUser.id, name: `Claude Code (por ${req.apiUser.name || req.apiUser.username})`, viaApi: true };
  next();
}
router.use('/crm', crmViaToken, createCrmRouter({ auth: [(req, res, next) => next()] }));

router.get('/me', (req, res) => {
  const u = req.apiUser;
  res.json({
    name: u.name, role: u.role, tokenName: req.apiToken.name, scope: req.apiToken.scope, scopeLabel: SCOPES[req.apiToken.scope],
    expiresAt: req.apiToken.expires_at, today: todayInSp(), modules: { personalBoard: !!u.personalAccess, companies: !!u.companiesAccess },
  });
});

// ------------------------------------------------------------------ atividades (quadro pessoal)

const PRIORITIES = ['urgente', 'alta', 'media', 'baixa'];

export function flattenCards(data, today) {
  const out = [];
  for (const b of (data && data.boards) || []) {
    for (const col of b.columns || []) {
      for (const c of col.cards || []) {
        if (!c || c.deleted || c.archived) continue;
        const open = !c.completed;
        out.push({
          id: c.id, title: clip(c.title, 200), desc: clip(noteToText(c.desc, c.descFormat), 600), board: b.name || '', column: col.name || '',
          priority: c.priority || '', status: c.status || (c.completed ? 'concluida' : 'nao-iniciada'), dueDate: c.dueDate || '',
          tags: Array.isArray(c.tags) ? c.tags.slice(0, 10) : [], completed: !!c.completed, completedAt: c.completedAt || '',
          createdAt: c.createdAt || '', updatedAt: c.updatedAt || '',
          overdue: open && !!c.dueDate && c.dueDate < today, dueToday: open && c.dueDate === today,
        });
      }
    }
  }
  return out;
}

function filterCards(list, status, q) {
  const s = String(q || '').trim().toLowerCase();
  let r = list;
  if (status === 'open') r = r.filter((c) => !c.completed);
  else if (status === 'overdue') r = r.filter((c) => c.overdue);
  else if (status === 'today') r = r.filter((c) => c.dueToday);
  else if (status === 'urgent') r = r.filter((c) => !c.completed && c.priority === 'urgente');
  else if (status === 'done') r = r.filter((c) => c.completed);
  if (s) r = r.filter((c) => `${c.title} ${c.desc} ${c.column} ${c.board}`.toLowerCase().includes(s));
  return r;
}

router.get('/activities', async (req, res, next) => {
  try {
    if (!req.apiUser.personalAccess) return res.status(403).json({ message: 'O dono do token não tem acesso à Gestão de Atividades.' });
    const status = ['open', 'overdue', 'today', 'urgent', 'done', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.apiUser.id]);
    const today = todayInSp();
    const list = filterCards(flattenCards(rows[0] ? rows[0].data : blankPersonalBoard(), today), status, req.query.q);
    list.sort((a, b) => (b.overdue - a.overdue) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
    res.json({ today, total: list.length, activities: list.slice(0, limit) });
  } catch (e) { next(e); }
});

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

router.post('/activities', needScope('read_create'), async (req, res, next) => {
  const body = req.body || {};
  const title = clip(body.title, 200).trim();
  if (!title) return res.status(400).json({ message: 'Informe o título (title).' });
  const desc = clip(body.desc, 4000).trim();
  const dueDate = body.dueDate ? String(body.dueDate) : '';
  if (dueDate && !(/^\d{4}-\d{2}-\d{2}$/.test(dueDate) && new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0, 10) === dueDate)) return res.status(400).json({ message: 'dueDate inválida. Use AAAA-MM-DD.' });
  const priority = body.priority ? String(body.priority) : '';
  if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ message: `priority inválida. Use: ${PRIORITIES.join(', ')}.` });
  const ref = clip(body.ref, 80).trim();
  if (!req.apiUser.personalAccess) return res.status(403).json({ message: 'O dono do token não tem acesso à Gestão de Atividades.' });
  if (bump(creates, req.apiHash, 3600 * 1000, 60)) return res.status(429).json({ message: 'Limite de 60 atividades por hora neste token.' });

  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM personal_boards WHERE user_id=$1 FOR UPDATE', [req.apiUser.id]);
    const data = cur.rows[0] ? cur.rows[0].data : blankPersonalBoard();
    const boards = (data.boards || []).map((b) => ({ ...b, columns: (b.columns || []).map((c) => ({ ...c, cards: [...(c.cards || [])] })) }));
    if (ref) {
      for (const b of boards) for (const c of b.columns) {
        const hit = c.cards.find((k) => k.apiRef === ref && !k.deleted);
        if (hit) { await client.query('ROLLBACK'); client.release(); return res.json({ created: false, activity: { id: hit.id, title: hit.title, board: b.name, column: c.name } }); }
      }
    }
    const board = body.board ? boards.find((b) => b.id === body.board || same(b.name, body.board)) : boards[0];
    if (!board) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ message: body.board ? `Página "${body.board}" não encontrada no quadro.` : 'O quadro pessoal ainda não tem nenhuma página. Abra a Gestão de Atividades uma vez.' }); }
    const column = body.column ? board.columns.find((c) => c.id === body.column || same(c.name, body.column)) : board.columns[0];
    if (!column) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ message: body.column ? `Coluna "${body.column}" não encontrada em "${board.name}". Colunas: ${board.columns.map((c) => c.name).join(', ')}.` : `A página "${board.name}" não tem colunas.` }); }
    const stamp = new Date();
    const now = stamp.toISOString();
    const author = `${req.apiUser.name} (via API)`;
    const card = {
      id: uid('card'), title, desc, status: 'nao-iniciada', priority, dueDate, tags: [], checklist: [],
      completed: false, completedAt: '', completedBy: '', comments: [],
      history: [{ ts: now, action: `Tarefa criada pela API de conectividade (token "${req.apiToken.name}")`, user: author }],
      deleted: false, deletedAt: '', deletedBy: '', deletedFromColumnId: '', deletedFromColumnName: '', deletedFromBoardId: '', deletedFromBoardName: '',
      archived: false, archivedAt: '', archivedFromColumnId: '', archivedFromColumnName: '', archivedFromBoardId: '', archivedFromBoardName: '',
      createdAt: now, createdBy: author, updatedAt: now, updatedBy: author, createdVia: 'api', ...(ref ? { apiRef: ref } : {}),
    };
    column.cards.push(card);
    const next = { ...data, boards };
    // updated_at = o mesmo instante gravado em card.createdAt: é o que permite ao PATCH do painel reconhecer cartões da API (mergeApiCards).
    await client.query(
      `INSERT INTO personal_boards (user_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=$3`,
      [req.apiUser.id, JSON.stringify(next), stamp]);
    await client.query('COMMIT');
    result = { next, activity: { id: card.id, title, desc, board: board.name, column: column.name, priority, dueDate, createdAt: now } };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* já encerrada */ }
    client.release();
    return next(e);
  }
  client.release();
  try {
    await syncCardEvents(pool, req.apiUser.id, result.next);
    res.status(201).json({ created: true, activity: result.activity });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------ empresas e reuniões (somente leitura)

async function loadProjects(user) {
  const { rows } = await pool.query(`SELECT id, org_id, data - 'log' AS data FROM projects WHERE org_id=$1`, [user.orgId]);
  return rows.filter((r) => canAccessProject(user, r.data, r.org_id));
}

const alive = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && !x.deleted) : []);
const companyName = (d) => (d.company && (d.company.nomeFantasia || d.company.name)) || 'Sem nome';

router.get('/companies', async (req, res, next) => {
  try {
    if (!req.apiUser.companiesAccess) return res.status(403).json({ message: 'O dono do token não tem acesso a Empresas.' });
    const q = String(req.query.q || '').trim().toLowerCase();
    const list = (await loadProjects(req.apiUser)).map((r) => {
      const acts = alive(r.data.activities);
      return {
        id: r.id, name: companyName(r.data), legalName: (r.data.company && r.data.company.name) || '', cnpj: (r.data.company && r.data.company.cnpj) || '',
        status: (r.data.company && r.data.company.status) || '', activities: acts.length, activitiesDone: acts.filter((a) => a.status === 'concluido').length, meetings: alive(r.data.meetings).length,
      };
    }).filter((c) => !q || `${c.name} ${c.legalName} ${c.cnpj}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ total: list.length, companies: list });
  } catch (e) { next(e); }
});

async function loadOne(req, res) {
  if (!req.apiUser.companiesAccess) { res.status(403).json({ message: 'O dono do token não tem acesso a Empresas.' }); return null; }
  const { rows } = await pool.query(`SELECT id, org_id, data FROM projects WHERE id=$1`, [req.params.id]);
  const r = rows[0];
  if (!r || !canAccessProject(req.apiUser, r.data, r.org_id) || r.org_id !== req.apiUser.orgId) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  return r;
}

router.get('/companies/:id', async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const d = r.data;
    const phases = Array.isArray(d.phases) ? d.phases : [];
    const phaseName = (id) => (phases.find((p) => p.id === id) || {}).name || '';
    res.json({
      id: r.id, name: companyName(d), company: { name: (d.company && d.company.name) || '', cnpj: (d.company && d.company.cnpj) || '', status: (d.company && d.company.status) || '', regimeTributario: (d.company && d.company.regimeTributario) || '' },
      team: alive(d.team).map((t) => ({ name: t.name, role: t.role || '' })),
      phases: phases.map((p) => ({ id: p.id, name: p.name })),
      activities: alive(d.activities).slice(0, 500).map((a) => ({ id: a.id, title: clip(a.title, 200), phase: phaseName(a.phase), status: a.status || '', date: a.date || '', endDate: a.endDate || '', responsible: a.responsible || '', priority: a.priority || '', kind: a.kind === 'reuniao' ? 'reuniao' : 'trabalho', subs: alive(a.subactivities).slice(0, 100).map((x) => ({ id: x.id, title: clip(x.title, 200), done: !!x.done, date: x.date || '', responsible: x.responsible || '', kind: x.kind === 'reuniao' ? 'reuniao' : 'trabalho', pautaDe: x.pautaDe || '', guide: clip(x.guide, 600) })) })),
      meetings: alive(d.meetings).map((m) => ({ id: m.id, date: m.date || '', title: clip(m.title, 200), hasSummary: !!m.summary, actionItems: alive(m.actionItems).length })).sort((a, b) => b.date.localeCompare(a.date)),
    });
  } catch (e) { next(e); }
});

router.get('/companies/:id/meetings/:meetingId', async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const m = alive(r.data.meetings).find((x) => x.id === req.params.meetingId);
    if (!m) return res.status(404).json({ message: 'Reunião não encontrada.' });
    const out = {
      id: m.id, date: m.date || '', title: m.title || '', company: companyName(r.data), participants: Array.isArray(m.participants) ? m.participants : [],
      summary: clip(m.summary, 20000), decisions: clip(m.decisions, 20000),
      actionItems: alive(m.actionItems).map((a) => ({ id: a.id, title: clip(a.title, 300), status: a.status || '', dueDate: a.dueDate || '', responsible: a.responsible || '', owner: a.owner || '' })),
    };
    if (req.query.transcript === '1') {
      const t = typeof m.transcript === 'string' ? m.transcript : '';
      out.transcript = t.slice(0, 60000);
      out.transcriptTruncated = t.length > 60000;
    }
    res.json(out);
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------ agenda (Google)

router.get('/agenda', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 14);
    const status = await getConnectionStatus(req.apiUser.id);
    if (!status.connected) return res.json({ connected: false, events: [] });
    const now = Date.now();
    const events = await listEvents(req.apiUser.id, new Date(now - 3600 * 1000).toISOString(), new Date(now + days * 86400000).toISOString());
    const keep = new Set(['accepted', 'organizer', 'unknown']);
    res.json({
      connected: true, days,
      events: events.filter((e) => e.status !== 'cancelled' && !e.transparent && keep.has(e.myResponse || 'accepted'))
        .map((e) => ({ title: clip(e.title, 200), start: e.start, end: e.end, allDay: !!e.allDay, location: clip(e.location, 200), guests: e.guests || 0 })),
    });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------ ajuste do cronograma de uma empresa (2026-10-19, escopo read_write)
// Pedido do Rafael na urgência da Alcast: o token precisa AJUSTAR o cronograma de uma empresa (status, datas, subatividades, atividades novas). API estreita e declarativa:
// uma lista de operações, tudo-ou-nada numa transação com FOR UPDATE, `dryRun` (padrão) mostra o que mudaria sem gravar; só exclui com activity.delete/sub.delete (soft delete, volta pela lixeira).
// Cada chamada que grava deixa uma linha no Log da empresa. `undo` devolve as operações que desfazem os ajustes de campos e as movimentações (atividades e subatividades criadas voltam em `created`).
const STATUSES = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
const PLAN_PRIORITIES = ['', 'urgente', 'alta', 'media', 'baixa'];
const MAX_OPS = 200;
const isISODay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const normText = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function findRef(list, ref, what) {
  const items = alive(list);
  const id = ref && typeof ref === 'object' ? ref.id : '';
  if (id) { const x = items.find((i) => i.id === id); if (!x) throw new Error(`${what} não encontrada (id ${id}).`); return x; }
  const t = normText(typeof ref === 'string' ? ref : ref && ref.title);
  if (!t) throw new Error(`Informe o id ou o título da ${what}.`);
  const hit = items.filter((i) => normText(i.title) === t);
  if (hit.length !== 1) throw new Error(hit.length ? `Há mais de uma ${what} com o título "${t}"; use o id.` : `${what} "${t}" não encontrada.`);
  return hit[0];
}

function phaseId(data, v) {
  const phases = Array.isArray(data.phases) ? data.phases : [];
  const hit = phases.find((p) => p.id === v || normText(p.name) === normText(v));
  if (!hit) throw new Error(`Fase "${v}" não existe nesta empresa.`);
  return hit.id;
}

function checkTeam(data, name) {
  if (name === '') return '';
  const team = alive(data.team).map((t) => t.name);
  if (!team.includes(name)) throw new Error(`Responsável "${name}" não está na equipe da empresa (${team.join(', ')}).`);
  return name;
}

const SET_ACT = {
  title: (d, v) => { const x = clip(v, 200).trim(); if (!x) throw new Error('título vazio'); if ((d.activities || []).some((a) => !a.deleted && normText(a.title) === normText(x))) throw new Error(`Já existe uma atividade "${x}".`); return x; },
  status: (d, v) => { if (!STATUSES.includes(v)) throw new Error(`status inválido: ${v}`); return v; },
  date: (d, v) => { if (v !== '' && !isISODay(v)) throw new Error(`data inválida: ${v}`); return v; },
  endDate: (d, v) => { if (v !== '' && !isISODay(v)) throw new Error(`data final inválida: ${v}`); return v; },
  responsible: (d, v) => checkTeam(d, String(v)),
  desc: (d, v) => clip(v, 2000),
  priority: (d, v) => { if (!PLAN_PRIORITIES.includes(v)) throw new Error(`prioridade inválida: ${v}`); return v; },
  required: (d, v) => !!v,
  phase: (d, v) => phaseId(d, v),
  kind: (d, v) => { if (!['reuniao', 'trabalho'].includes(v)) throw new Error(`tipo inválido: ${v} (use reuniao ou trabalho)`); return v; },
};
const SET_SUB = {
  title: (d, v) => { const t = clip(v, 300).trim(); if (!t) throw new Error('título vazio'); return t; },
  done: (d, v) => !!v,
  skipped: (d, v) => !!v,
  skipReason: (d, v) => clip(v, 300),
  date: (d, v) => { if (v !== '' && !isISODay(v)) throw new Error(`data inválida: ${v}`); return v; },
  responsible: (d, v) => checkTeam(d, String(v)),
  kind: (d, v) => { if (!['reuniao', 'trabalho'].includes(v)) throw new Error(`tipo inválido: ${v} (use reuniao ou trabalho)`); return v; },
  guide: (d, v) => clip(v, 4000),
  // `pautaDe`: id de uma subatividade do tipo Reunião (de qualquer atividade) em cuja pauta este item é tratado; '' desvincula. Para vincular E levar a data da reunião use `pauta.link`.
  pautaDe: (d, v) => { if (v === '' || v == null) return ''; const hit = findSubAny(d.activities, String(v)); if (!hit || hit.sub.kind !== 'reuniao') throw new Error(`pautaDe: "${v}" não é uma subatividade do tipo Reunião`); return String(v); },
};

export function applyPlanOps(data, ops, who) {
  const next = structuredClone(data);
  const results = []; const undo = []; const created = []; const errors = [];
  const stamp = new Date().toISOString();
  ops.forEach((op, index) => {
    try {
      if (!op || typeof op !== 'object') throw new Error('operação inválida');
      if (op.op === 'activity.set') {
        const a = findRef(next.activities, op.ref, 'atividade');
        const set = op.set && typeof op.set === 'object' ? op.set : null;
        if (!set || !Object.keys(set).length) throw new Error('set vazio');
        const prev = {};
        for (const [k, v] of Object.entries(set)) {
          if (!SET_ACT[k]) throw new Error(`campo não permitido em atividade: ${k}`);
          prev[k] = k === 'phase' ? a.phase : k === 'kind' ? (a.kind || 'trabalho') : (a[k] === undefined ? '' : a[k]);
          a[k] = SET_ACT[k](next, v);
        }
        undo.push({ op: 'activity.set', ref: { id: a.id }, set: prev });
        results.push({ index, ok: true, what: `Atividade "${a.title}": ${Object.keys(set).join(', ')}` });
      } else if (op.op === 'sub.set') {
        const a = findRef(next.activities, op.activity, 'atividade');
        const x = findRef(a.subactivities, op.sub, 'subatividade');
        const set = op.set && typeof op.set === 'object' ? op.set : null;
        if (!set || !Object.keys(set).length) throw new Error('set vazio');
        const prev = {};
        for (const [k, v] of Object.entries(set)) {
          if (!SET_SUB[k]) throw new Error(`campo não permitido em subatividade: ${k}`);
          prev[k] = x[k] === undefined ? (k === 'done' ? false : k === 'kind' ? 'trabalho' : '') : x[k];
          x[k] = SET_SUB[k](next, v);
          if (k === 'done') { if (x.done) { x.doneAt = stamp; x.doneBy = who; } else { delete x.doneAt; delete x.doneBy; } }
        }
        // Mudar `done` zera "pulada" e o motivo (igual ao painel), a menos que a mesma operação diga o contrário; o desfazer devolve o que havia.
        if ('done' in set && !('skipped' in set) && !('skipReason' in set)) {
          prev.skipped = !!x.skipped; prev.skipReason = x.skipReason || '';
          x.skipped = false; x.skipReason = '';
        }
        next.activities = reconcilePautaProject(next.activities, x.id, set);
        undo.push({ op: 'sub.set', activity: { id: a.id }, sub: { id: x.id }, set: prev });
        results.push({ index, ok: true, what: `Subatividade "${clip(x.title, 80)}" de "${a.title}": ${Object.keys(set).join(', ')}` });
      } else if (op.op === 'sub.add') {
        const a = findRef(next.activities, op.activity, 'atividade');
        const sub = op.sub && typeof op.sub === 'object' ? op.sub : {};
        const title = SET_SUB.title(next, sub.title);
        const x = { id: uid('s'), title, done: false, responsible: sub.responsible ? SET_SUB.responsible(next, sub.responsible) : '', date: sub.date ? SET_SUB.date(next, sub.date) : '', ...(sub.kind ? { kind: SET_SUB.kind(next, sub.kind) } : {}), ...(sub.guide ? { guide: SET_SUB.guide(next, sub.guide) } : {}), ...(sub.pautaDe ? { pautaDe: SET_SUB.pautaDe(next, sub.pautaDe) } : {}) };
        a.subactivities = op.position === 'top' ? [x, ...(a.subactivities || [])] : [...(a.subactivities || []), x];
        created.push({ type: 'sub', id: x.id, activity: a.id });
        results.push({ index, ok: true, what: `Nova subatividade "${clip(title, 80)}" em "${a.title}"` });
      } else if (op.op === 'pauta.link') {
        // Vincula itens de trabalho (de qualquer atividade) à pauta de uma reunião e leva a data dela. `undo` devolve (`pauta.restore`).
        const ma = findRef(next.activities, op.meeting && op.meeting.activity, 'atividade da reunião');
        const mt = findRef(ma.subactivities, op.meeting && op.meeting.sub, 'reunião');
        if (mt.kind !== 'reuniao') throw new Error(`"${clip(mt.title, 60)}" não é do tipo Reunião`);
        const items = (Array.isArray(op.items) ? op.items : []).slice(0, 80).map((it) => { const ia = findRef(next.activities, it.activity, 'atividade do item'); const is = findRef(ia.subactivities, it.sub, 'item'); return { actId: ia.id, subId: is.id }; });
        if (!items.length) throw new Error('items vazio');
        const r = linkPautaItems(next.activities, mt.id, items);
        next.activities = r.activities;
        undo.push({ op: 'pauta.restore', changed: r.changed });
        results.push({ index, ok: true, what: `Pauta de "${clip(mt.title, 80)}": ${r.changed.length} item(ns) vinculado(s)${mt.date ? ` para ${mt.date}` : ''}` });
      } else if (op.op === 'pauta.restore') {
        next.activities = revertPautaItems(next.activities, Array.isArray(op.changed) ? op.changed : []);
        results.push({ index, ok: true, what: `Pauta restaurada (${(op.changed || []).length} item(ns))` });
      } else if (op.op === 'sub.move') {
        // Move (não apaga): a subatividade sai de uma atividade e entra em outra, com o mesmo id, data e estado. `undo` devolve ao lugar.
        const from = findRef(next.activities, op.from, 'atividade de origem');
        const x = findRef(from.subactivities, op.sub, 'subatividade');
        const to = findRef(next.activities, op.to, 'atividade de destino');
        if (to.id === from.id) throw new Error('A origem e o destino são a mesma atividade.');
        from.subactivities = (from.subactivities || []).filter((y) => y.id !== x.id);
        to.subactivities = [...(to.subactivities || []), x];
        undo.push({ op: 'sub.move', from: { id: to.id }, sub: { id: x.id }, to: { id: from.id } });
        results.push({ index, ok: true, what: `Subatividade "${clip(x.title, 80)}" movida de "${from.title}" para "${to.title}"` });
      } else if (op.op === 'activity.add') {
        const title = clip(op.title, 200).trim();
        if (!title) throw new Error('título vazio');
        const acts = Array.isArray(next.activities) ? next.activities : [];
        if (acts.some((x) => !x.deleted && normText(x.title) === normText(title))) throw new Error(`Já existe uma atividade "${title}".`);
        const date = op.date ? SET_ACT.date(next, op.date) : ''; const endDate = op.endDate ? SET_ACT.endDate(next, op.endDate) : date;
        const a = {
          id: uid('act'), month: acts.length ? Math.max(...acts.map((x) => x.month || 1)) + 1 : 1, phase: phaseId(next, op.phase), title, desc: clip(op.desc, 2000),
          responsible: op.responsible ? checkTeam(next, String(op.responsible)) : '', priority: op.priority ? SET_ACT.priority(next, op.priority) : '', participants: [], date, endDate, durationDays: '',
          status: 'nao-iniciado', required: !!op.required, ...(op.kind ? { kind: SET_ACT.kind(next, op.kind) } : {}), notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
          subactivities: (Array.isArray(op.subs) ? op.subs : []).slice(0, 40).map((s) => ({ id: uid('s'), title: SET_SUB.title(next, s.title), done: false, responsible: s.responsible ? SET_SUB.responsible(next, s.responsible) : '', date: s.date ? SET_SUB.date(next, s.date) : '', ...(s.kind ? { kind: SET_SUB.kind(next, s.kind) } : {}) })),
        };
        next.activities = [...acts, a];
        created.push({ type: 'activity', id: a.id, title });
        results.push({ index, ok: true, what: `Nova atividade "${title}"${date ? ` (${date}${endDate && endDate !== date ? ` a ${endDate}` : ''})` : ''}` });
      } else if (op.op === 'activity.delete' || op.op === 'activity.restore') {
        // Exclui como o painel (soft delete, volta pela lixeira); `undo` restaura. Não apaga nada de verdade.
        const del = op.op === 'activity.delete';
        const id = op.ref && typeof op.ref === 'object' ? op.ref.id : '';
        const a = del ? findRef(next.activities, op.ref, 'atividade') : (next.activities || []).find((x) => x.id === id && x.deleted);
        if (!a) throw new Error('atividade não encontrada na lixeira');
        Object.assign(a, del ? { deleted: true, deletedAt: stamp, deletedBy: who } : { deleted: false, deletedAt: '', deletedBy: '' });
        undo.push({ op: del ? 'activity.restore' : 'activity.delete', ref: { id: a.id } });
        results.push({ index, ok: true, what: `Atividade "${a.title}" ${del ? 'excluída (fica na lixeira)' : 'restaurada'}` });
      } else if (op.op === 'sub.delete' || op.op === 'sub.restore') {
        const del = op.op === 'sub.delete';
        const a = (next.activities || []).find((x) => x.id === (op.activity && op.activity.id) && !x.deleted);
        if (!a) throw new Error('atividade não encontrada');
        const subId = op.sub && typeof op.sub === 'object' ? op.sub.id : '';
        const x = del ? findRef(a.subactivities, op.sub, 'subatividade') : (a.subactivities || []).find((y) => y.id === subId && y.deleted);
        if (!x) throw new Error('subatividade não encontrada');
        Object.assign(x, del ? { deleted: true, deletedAt: stamp, deletedBy: who } : { deleted: false, deletedAt: '', deletedBy: '' });
        if (del) next.activities = unlinkPautaProject(next.activities, x.id);
        undo.push({ op: del ? 'sub.restore' : 'sub.delete', activity: { id: a.id }, sub: { id: x.id } });
        results.push({ index, ok: true, what: `Subatividade "${clip(x.title, 80)}" de "${a.title}" ${del ? 'excluída (fica na lixeira)' : 'restaurada'}` });
      } else throw new Error(`operação desconhecida: ${op && op.op}`);
    } catch (e) { errors.push({ index, message: e.message }); }
  });
  // A atividade estica sozinha para cobrir as subatividades que mudaram (shared/period.js).
  if (!errors.length) {
    const fp = fitPeriods(data.activities, next.activities);
    if (fp.changed.length) {
      next.activities = fp.activities;
      for (const c of fp.changed) {
        undo.push({ op: 'activity.set', ref: { id: c.id }, set: { date: c.from.date, endDate: c.from.endDate } });
        results.push({ index: ops.length, ok: true, what: `Período de "${clip(c.title, 80)}" esticado para cobrir as subatividades: ${c.from.date} a ${c.from.endDate} → ${c.to.date} a ${c.to.endDate}` });
      }
    }
  }
  return { next, results, undo, created, errors };
}

router.post('/companies/:id/plan', needScope('read_write'), async (req, res, next) => {
  const ops = req.body && req.body.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS) return res.status(400).json({ message: `Envie de 1 a ${MAX_OPS} operações em "ops".` });
  if (!req.apiUser.companiesAccess) return res.status(403).json({ message: 'O dono do token não tem acesso a Empresas.' });
  if (!(req.apiUser.isSuperAdmin || req.apiUser.role === 'master')) return res.status(403).json({ message: 'Só administradores ajustam o cronograma das empresas.' });
  const dryRun = !(req.body && req.body.dryRun === false);
  const note = clip(req.body && req.body.note, 300);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [req.params.id]);
    const r = rows[0];
    if (!r || r.org_id !== req.apiUser.orgId || !canAccessProject(req.apiUser, r.data, r.org_id)) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Empresa não encontrada.' }); }
    const who = req.apiUser.name || req.apiUser.username || '';
    const out = applyPlanOps(r.data, ops, who);
    if (out.errors.length) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Nada foi gravado: há operações inválidas.', errors: out.errors }); }
    if (dryRun) { await client.query('ROLLBACK'); return res.json({ dryRun: true, applied: 0, wouldApply: out.results.length, results: out.results }); }
    const entry = { ts: new Date().toISOString(), action: `Cronograma ajustado pela API (chave "${req.apiToken.name}") a pedido de ${who}: ${out.results.length} alteração(ões). ${note}`.trim(), user: who, activityId: null };
    out.next.log = [entry, ...(Array.isArray(out.next.log) ? out.next.log : [])].slice(0, 300);
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(out.next), r.id]);
    await client.query('COMMIT');
    res.json({ dryRun: false, applied: out.results.length, results: out.results, created: out.created, undo: out.undo });
    syncProjectMemoryFromDiff(pool, r.org_id, r.id, r.data, out.next).catch((e) => console.error('Falha ao reindexar memória após ajuste por API', e.message));
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ } next(e); } finally { client.release(); }
});
