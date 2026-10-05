// API de conectividade (2026-10-05, §80): permite que OUTRA janela do Claude Code (ou qualquer script) leia o painel e crie atividades
// no quadro pessoal do dono do token. Desenho:
//  - token por janela (`pxk_…`), com escopo `read` (só GET) ou `read_create` (lê e cria atividades), validade e revogação; só o hash fica no banco;
//  - credencial só no cabeçalho Authorization (nunca na URL); limite por token; usuário bloqueado/expirado = 403;
//  - API propositalmente ESTREITA e estável (não é a API interna do app): o token nunca vale como a sessão inteira do usuário;
//  - tudo respeita o que o usuário já pode ver (mesmo canAccessProject das telas) e a organização dele.
import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, blankPersonalBoard } from './db.js';
import { requireAuth, rowToUser } from './auth.js';
import { canAccessProject } from './routes.js';
import { syncCardEvents } from './personalActivity.js';
import { getConnectionStatus, listEvents } from './googleCalendar.js';
import { todayInSp } from './widgetSummary.js';

export const router = Router();

const PREFIX = 'pxk_';
export const SCOPES = { read: 'Só leitura', read_create: 'Ler e criar atividades' };
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
    res.json({ tokens: rows.map((r) => ({ ...r, expired: new Date(r.expires_at) < new Date() })), scopes: SCOPES });
  } catch (e) { next(e); }
});

router.post('/tokens', requireAuth, async (req, res, next) => {
  try {
    const name = clip((req.body || {}).name, 60).trim();
    const scope = Object.prototype.hasOwnProperty.call(SCOPES, (req.body || {}).scope) ? req.body.scope : null;
    const days = VALID_DAYS.includes(Number((req.body || {}).days)) ? Number(req.body.days) : 180;
    if (!name) return res.status(400).json({ message: 'Dê um nome ao token (ex.: "Claude Code do XPED").' });
    if (!scope) return res.status(400).json({ message: 'Escolha o que o token pode fazer.' });
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
    next();
  } catch (e) { next(e); }
}

function needScope(scope) {
  return (req, res, next) => {
    if (scope === 'read_create' && req.apiToken.scope !== 'read_create') return res.status(403).json({ message: 'Este token é só de leitura. Gere um token com "Ler e criar atividades".' });
    next();
  };
}

router.use(bearer);

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
          id: c.id, title: clip(c.title, 200), desc: clip(c.desc, 600), board: b.name || '', column: col.name || '',
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
        status: (r.data.company && r.data.company.status) || '', activities: acts.length, activitiesDone: acts.filter((a) => a.status === 'concluida').length, meetings: alive(r.data.meetings).length,
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
      activities: alive(d.activities).slice(0, 500).map((a) => ({ id: a.id, title: clip(a.title, 200), phase: phaseName(a.phase), status: a.status || '', date: a.date || '', endDate: a.endDate || '', responsible: a.responsible || '', priority: a.priority || '' })),
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
