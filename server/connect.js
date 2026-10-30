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
import { syncProjectMemoryFromDiff, reindexMeetingMemory } from './memoryIngest.js';
import { originOf, setActor } from './projectAudit.js';
import { createCrmRouter } from './crm/routes.js';
import { crmCan } from './crm/permissions.js';
import { InboxError, createSubmission, listSubmissions, reprocessSubmission } from './meetingInbox.js';
import { applyMeetingEdit, isISODay as isMeetingDay } from './meetingEdit.js';
import { teamDay } from './teamDay.js';

export const router = Router();

const PREFIX = 'pxk_';
export const SCOPES = { read_all: 'Ler tudo (empresas, reuniões, atividades, agenda e CRM); não altera nada', write_all: 'Ler e editar tudo (cronograma das empresas, reuniões, transcrições, atividades e CRM), com as permissões do dono da chave', read: 'Só leitura', read_create: 'Ler e criar atividades', read_write: 'Ler, criar atividades e ajustar o cronograma de empresas', crm_operate: 'Operar o CRM como Claude Code (criar, editar, mover, excluir e registrar), além de ler', transcripts: 'Ler e enviar transcrições de reunião para a RENATA do painel processar (não cria atividade solta nem ajusta cronograma)', meetings_edit: 'Ler, enviar transcrições e corrigir reuniões já registradas (título, resumo, decisões, participantes e tarefas; não ajusta cronograma nem opera o CRM)' };
// crm_operate só abre /api/connect/crm; nas demais rotas vale como leitura (rank 0) — nunca herda criar atividade nem ajustar cronograma.
// read_all / write_all (2026-10-29) são as duas chaves oferecidas na tela; as demais continuam valendo (chaves já emitidas) e ficam em "Avançado".
// read_all lê tudo, inclusive o CRM (só GET); write_all faz tudo que as chaves específicas fazem, sempre limitado ao que o dono pode (cada rota confere o acesso dele).
const SCOPE_RANK = { read_all: 0, write_all: 2, read: 0, read_create: 1, read_write: 2, crm_operate: 0, transcripts: 0, meetings_edit: 0 };
export const LEGACY_SCOPES = ['read', 'read_create', 'read_write', 'crm_operate', 'transcripts', 'meetings_edit'];
const WRITE_ALL_MAX_DAYS = 180;
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
    res.json({ tokens: rows.map((r) => ({ ...r, expired: new Date(r.expires_at) < new Date() })), scopes: SCOPES, legacyScopes: LEGACY_SCOPES, canAdmin: !!(req.user.isSuperAdmin || req.user.role === 'master'), canCrm: crmCan(req.user, 'admin'), canTranscripts: !!req.user.companiesAccess });
  } catch (e) { next(e); }
});

router.post('/tokens', requireAuth, async (req, res, next) => {
  try {
    const name = clip((req.body || {}).name, 60).trim();
    const scope = Object.prototype.hasOwnProperty.call(SCOPES, (req.body || {}).scope) ? req.body.scope : null;
    let days = VALID_DAYS.includes(Number((req.body || {}).days)) ? Number(req.body.days) : (scope === 'write_all' ? 90 : 180);
    if (scope === 'write_all') days = Math.min(days, WRITE_ALL_MAX_DAYS);
    if (!name) return res.status(400).json({ message: 'Dê um nome ao token (ex.: "Claude Code do XPED").' });
    if (!scope) return res.status(400).json({ message: 'Escolha o que o token pode fazer.' });
    if (scope === 'write_all' && !(req.user.isSuperAdmin || req.user.role === 'master')) return res.status(403).json({ message: 'Só administradores geram uma chave que edita tudo.' });
    if (scope === 'read_write' && !(req.user.isSuperAdmin || req.user.role === 'master')) return res.status(403).json({ message: 'Só administradores geram uma chave que ajusta o cronograma de empresas.' });
    if (scope === 'transcripts' && !req.user.companiesAccess) return res.status(403).json({ message: 'Só quem tem acesso a Empresas gera uma chave que envia transcrições.' });
    if (scope === 'meetings_edit' && !req.user.companiesAccess) return res.status(403).json({ message: 'Só quem tem acesso a Empresas gera uma chave que corrige reuniões.' });
    if (scope === 'crm_operate' && !crmCan(req.user, 'admin')) return res.status(403).json({ message: 'Só administrador do CRM gera uma chave que opera o CRM.' });
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
    // Administrador do CRM vê as gravações de todas as chaves da organização (inclusive de um usuário dedicado "Claude Code"); os demais, só as próprias.
    const all = crmCan(req.user, 'admin') && req.user.orgId;
    const { rows } = await pool.query(
      `SELECT a.at, a.method, a.path, a.status, t.name AS token_name, u.name AS owner_name FROM api_token_actions a JOIN api_tokens t ON t.id = a.token_id LEFT JOIN users u ON u.id = a.user_id
       WHERE ${all ? 'a.org_id=$1' : 'a.user_id=$1'} ORDER BY a.at DESC LIMIT 100`, [all ? req.user.orgId : req.user.id]);
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
  { method: 'GET', path: '/api/connect/companies/:id/meetings/:meetingId', scope: 'read', what: 'Uma reunião: resumo, decisões, itens de ação (com id, vínculo sugerido/confirmado com o cronograma em activityLink), participantes. Query: transcript=1 inclui a transcrição (até 60.000 caracteres).' },
  { method: 'POST', path: '/api/connect/companies/:id/plan', scope: 'read_write', what: 'Ajusta o cronograma de uma empresa (só administrador). Corpo: ops (até 200: activity.set, sub.set, sub.add (position top|end, kind, guide, pautaDe), sub.move, activity.add, pauta.link, activity.delete e sub.delete (exclusão com volta pela lixeira; activity.restore e sub.restore desfazem)), dryRun (padrão true: só mostra), note. Tudo ou nada, nada some de verdade, grava no Log da empresa.' },
  { method: 'POST', path: '/api/connect/companies/:id/transcripts', scope: 'transcripts', what: 'Envia a transcrição de uma reunião para a RENATA do painel processar (igual ao botão "Enviar transcrição" da aba Reuniões). Corpo: transcript (obrigatório, texto bruto completo), date (AAAA-MM-DD), time (HH:MM). Responde 202 com submissionId; o MESMO texto não é processado duas vezes (duplicate:true). Limite: 30 envios por hora por chave.' },
  { method: 'GET', path: '/api/connect/companies/:id/transcripts[/:submissionId]', scope: 'transcripts', what: 'Situação dos envios da empresa (pending, processing, done, failed). Quando done, traz meetingId e um resumo da reunião criada. Consulte a cada ~5 s.' },
  { method: 'POST', path: '/api/connect/companies/:id/transcripts/:submissionId/retry', scope: 'transcripts', what: 'Reprocessa um envio que falhou.' },
  { method: 'PATCH', path: '/api/connect/companies/:id/meetings/:meetingId', scope: 'meetings_edit', what: 'Corrige uma reunião já registrada. Corpo (só estes campos; qualquer outro dá 400): title, date, time, summary, decisions, participants (lista inteira ou {add,remove,rename}), actionItems (operações: {op:"set",id,set:{title,responsible,kind,dueDate,area,owner}}, {op:"add",title,…}, {op:"delete",id}, {op:"restore",id}), dryRun (true = mostra antes e depois sem gravar), note. Tudo ou nada; não mexe no vínculo tarefa→atividade; grava no Log da empresa e no histórico de correções; responde com editId e `undo` (corpo que desfaz).' },
  { method: 'GET', path: '/api/connect/companies/:id/meetings/:meetingId/edits', scope: 'meetings_edit', what: 'Histórico das correções da reunião (quem, quando, antes e depois, se já foi desfeita).' },
  { method: 'POST', path: '/api/connect/companies/:id/meetings/:meetingId/edits/:editId/undo', scope: 'meetings_edit', what: 'Desfaz uma correção (corpo opcional: dryRun, note). Dá 409 se já foi desfeita ou se a reunião mudou de forma que não dá para voltar.' },
  { method: '*', path: '/api/connect/crm/…', scope: 'crm_operate', what: 'O CRM inteiro (mesmas rotas e regras de /api/crm: empresas, contatos, negócios, atividades, notas, produtos, funis, cadências), pelo perfil de administrador do dono da chave (com read_all, só GET, pelo acesso de leitura dele). Toda gravação fica registrada como "Claude Code (por <dono>)". Fora: escrita da migração do PipeRun.' },
  { method: 'GET', path: '/api/connect/agenda', scope: 'read', what: 'Compromissos do Google Calendar do dono. Query: days=1..14 (padrão 7). Só os aceitos ou próprios.' },
];

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    name: 'PRICETAX — API de conectividade',
    auth: 'Authorization: Bearer <token pxk_…> (gere em Meu perfil > Conectar). Nunca coloque o token na URL.',
    scopes: SCOPES,
    presets: 'Duas chaves cobrem tudo: read_all (lê tudo, inclusive o CRM; não altera nada) e write_all (lê e edita tudo o que o dono da chave pode; só administrador gera; validade padrão de 90 dias, máximo 180). Os escopos antigos (read, read_create, read_write, crm_operate, transcripts, meetings_edit) continuam valendo nas chaves já emitidas. Em `endpoints[].scope`, write_all vale para todo escopo que não seja de leitura e read_all para todo GET.',
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
    if (scope === 'read_write') return res.status(403).json({ message: 'Este token não ajusta cronograma de empresa. Gere uma chave "Ler e editar tudo" em Meu perfil > Integrações (só administrador).' });
    res.status(403).json({ message: 'Este token é só de leitura. Gere uma chave "Ler e editar tudo" em Meu perfil > Integrações.' });
  };
}

router.use(bearer);

// ------------------------------------------------------------------ dia da equipe por chave (2026-10-29)
// Só leitura, só chave "Ler tudo"/"Ler e editar tudo" de um administrador (a chave só do CRM não alcança). Dado de pessoa: cada leitura entra em api_token_actions.
router.get('/team-day', async (req, res, next) => {
  try {
    if (!['read_all', 'write_all'].includes(req.apiToken.scope)) return res.status(403).json({ message: 'Esta chave não lê a atividade da equipe. Gere uma chave "Ler tudo" em Meu perfil > Integrações (só administrador).' });
    if (!(req.apiUser.isSuperAdmin || req.apiUser.role === 'master')) return res.status(403).json({ message: 'Só o administrador lê a atividade da equipe.' });
    const orgId = req.apiUser.orgId || null;
    const date = String(req.query.date || '').trim() || todayInSp();
    const out = await teamDay({ orgId, all: !!(req.apiUser.isSuperAdmin && !orgId) }, date, { userId: clip(req.query.userId, 60) });
    pool.query('INSERT INTO api_token_actions (id, org_id, token_id, user_id, method, path, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid('act'), orgId, req.apiToken.id, req.apiUser.id, 'GET', clip(String(req.originalUrl || '').split('?')[0] + `?date=${date}`, 200), 200]).catch(() => {});
    res.json(out);
  } catch (e) { if (e && e.status === 400) return res.status(400).json({ message: e.message }); next(e); }
});

// ------------------------------------------------------------------ CRM por chave (§99)
// O Claude Code opera o CRM com as MESMAS regras e rotas da tela (/api/crm), pelo perfil do dono da chave, mas toda gravação fica
// registrada como "Claude Code (por <dono>)" na auditoria e na linha do tempo, e cada chamada que altera algo entra em api_token_actions.
// Nunca vale para a migração do PipeRun (escrita) nem para token sem o escopo crm_operate.
const CRM_BLOCKED = /^\/migration(\/|$)/;
function crmViaToken(req, res, next) {
  const scope = req.apiToken.scope;
  if (scope === 'read_all') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(403).json({ message: 'Esta chave só lê. Para alterar o CRM gere uma chave "Ler e editar tudo" em Meu perfil > Integrações (só administrador).' });
    if (CRM_BLOCKED.test(req.path)) return res.status(403).json({ message: 'A migração do PipeRun só é aberta pela tela, por um administrador.' });
    if (!crmCan(req.apiUser, 'read')) return res.status(403).json({ message: 'O dono da chave não tem acesso ao CRM.' });
    req.user = req.apiUser;
    return next();
  }
  if (scope !== 'crm_operate' && scope !== 'write_all') return res.status(403).json({ message: 'Esta chave não acessa o CRM. Gere uma chave "Ler tudo" ou "Ler e editar tudo" em Meu perfil > Integrações.' });
  if (!crmCan(req.apiUser, 'admin')) return res.status(403).json({ message: 'O dono da chave deixou de ser administrador do CRM.' });
  if (req.method !== 'GET') {
    const path = clip(String(req.originalUrl || '').split('?')[0], 200);
    res.on('finish', () => {
      pool.query('INSERT INTO api_token_actions (id, org_id, token_id, user_id, method, path, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [uid('act'), req.apiUser.orgId || null, req.apiToken.id, req.apiUser.id, req.method, path, res.statusCode]).catch(() => {});
    });
  }
  if (req.method !== 'GET' && CRM_BLOCKED.test(req.path)) return res.status(403).json({ message: 'A migração do PipeRun só é operada pela tela, por um administrador.' });
  req.user = req.apiUser;
  // Usuário dedicado chamado "Claude Code": o registro sai só "Claude Code". Chave de uma pessoa: "Claude Code (por <pessoa>)".
  const owner = req.apiUser.name || req.apiUser.username;
  req.crmActor = { id: req.apiUser.id, name: /^claude code$/i.test(String(owner).trim()) ? 'Claude Code' : `Claude Code (por ${owner})`, viaApi: true };
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

export function filterCards(list, status, q) {
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

// Item de ação como a API devolve: com o `id` (para apontar na correção) e o vínculo com o cronograma (`activityLink`: situação, atividade sugerida/confirmada, confiança e motivo).
function itemOut(data, a) {
  const acts = alive(data.activities);
  const title = (id) => (acts.find((x) => x.id === id) || {}).title || '';
  const l = a.activityLink && typeof a.activityLink === 'object' ? a.activityLink : null;
  return {
    id: a.id, title: clip(a.title, 300), status: a.status || '', dueDate: a.dueDate || '', responsible: a.responsible || '', responsibleStatus: a.responsibleStatus || '', owner: a.owner || '', kind: a.kind || 'tarefa', area: a.area || '',
    activityId: a.activityId || '', activityTitle: a.activityId ? title(a.activityId) : '',
    activityLink: l ? { status: l.status || '', suggestedId: l.suggestedId || '', suggestedTitle: l.suggestedId ? title(l.suggestedId) : '', confidence: typeof l.confidence === 'number' ? l.confidence : null, reason: clip(l.reason, 300) } : null,
  };
}

router.get('/companies/:id/meetings/:meetingId', async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const m = alive(r.data.meetings).find((x) => x.id === req.params.meetingId);
    if (!m) return res.status(404).json({ message: 'Reunião não encontrada.' });
    const out = {
      id: m.id, date: m.date || '', title: m.title || '', company: companyName(r.data), participants: Array.isArray(m.participants) ? m.participants : [],
      summary: clip(m.summary, 20000), decisions: clip(m.decisions, 20000),
      time: m.time || '', actionItems: alive(m.actionItems).map((a) => itemOut(r.data, a)),
    };
    if (req.query.transcript === '1') {
      const t = typeof m.transcript === 'string' ? m.transcript : '';
      out.transcript = t.slice(0, 60000);
      out.transcriptTruncated = t.length > 60000;
    }
    res.json(out);
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------ transcrições de reunião (§116d)
// Uma IA externa (que tem as reuniões gravadas) envia a transcrição pelo MESMO caminho da tela: cria o envio, a RENATA do painel extrai
// título/participantes/resumo/decisões/atividades e registra a reunião na empresa. A IA externa NÃO faz o trabalho da RENATA, só entrega o texto
// e acompanha a situação. Escopo `transcripts` (ou `read_write`); a chave age como o dono: só empresas que ele pode ver.
const transcriptsLimit = new Map();
function needTranscripts(req, res, next) {
  if (['transcripts', 'meetings_edit', 'read_write', 'write_all'].includes(req.apiToken.scope)) return next();
  if (req.apiToken.scope === 'read_all' && req.method === 'GET') return next();
  return res.status(403).json({ message: 'Esta chave não envia transcrições. Gere uma chave "Ler e editar tudo" em Meu perfil > Integrações.' });
}
const inboxErr = (res, next, e) => (e instanceof InboxError ? res.status(e.status).json({ message: e.message }) : next(e));
const MAX_TRANSCRIPT_CHARS = 400000;

function meetingOut(r, meetingId) {
  const m = alive(r.data.meetings).find((x) => x.id === meetingId);
  if (!m) return null;
  return {
    id: m.id, title: m.title || '', date: m.date || '', time: m.time || '', participants: Array.isArray(m.participants) ? m.participants : [],
    summary: clip(m.summary, 20000), decisions: clip(m.decisions, 20000),
    actionItems: alive(m.actionItems).map((a) => itemOut(r.data, a)),
  };
}

router.post('/companies/:id/transcripts', needTranscripts, async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const b = req.body || {};
    const transcript = typeof b.transcript === 'string' ? b.transcript.trim() : '';
    if (!transcript) return res.status(400).json({ message: 'Informe transcript (o texto bruto completo da reunião).' });
    if (transcript.length < 200) return res.status(400).json({ message: 'A transcrição está curta demais (mínimo de 200 caracteres). Envie o texto completo da reunião.' });
    if (transcript.length > MAX_TRANSCRIPT_CHARS) return res.status(413).json({ message: `A transcrição passa de ${MAX_TRANSCRIPT_CHARS.toLocaleString('pt-BR')} caracteres. Envie em partes por reunião (uma reunião por envio).` });
    const date = b.date == null || b.date === '' ? '' : String(b.date);
    const time = b.time == null || b.time === '' ? '' : String(b.time);
    if (date && !isMeetingDay(date)) return res.status(400).json({ message: 'date deve ser AAAA-MM-DD (ex.: 2026-10-28).' });
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return res.status(400).json({ message: 'time deve ser HH:MM em 24 h (ex.: 14:30).' });
    // cada envio é uma chamada de IA paga: limite por chave (duplicado devolvido não conta)
    const existing = await pool.query(`SELECT 1 FROM meeting_submissions WHERE project_id=$1 AND md5(transcript)=md5($2) AND status IN ('pending','processing','done') LIMIT 1`, [r.id, transcript]);
    if (!existing.rows[0] && bump(transcriptsLimit, req.apiHash, 3600 * 1000, 30)) return res.status(429).json({ message: 'Limite de 30 transcrições por hora nesta chave. Espere um pouco.' });
    const out = await createSubmission({ user: req.apiUser, projectId: r.id, transcript, date, time, dedupe: true, via: `via chave de API "${clip(req.apiToken.name, 40)}"` });
    res.status(out.duplicate ? 200 : 202).json({
      submissionId: out.submissionId, status: out.status, duplicate: out.duplicate, meetingId: out.meetingId,
      next: `Consulte GET /api/connect/companies/${r.id}/transcripts/${out.submissionId} a cada ~5 s até status done (ou failed).`,
    });
  } catch (e) { inboxErr(res, next, e); }
});

router.get('/companies/:id/transcripts', needTranscripts, async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    res.json({ submissions: await listSubmissions(req.apiUser, r.id) });
  } catch (e) { inboxErr(res, next, e); }
});

router.get('/companies/:id/transcripts/:submissionId', needTranscripts, async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const sub = (await listSubmissions(req.apiUser, r.id)).find((x) => x.id === req.params.submissionId);
    if (!sub) return res.status(404).json({ message: 'Envio não encontrado.' });
    const out = { submissionId: sub.id, status: sub.status, errorMessage: sub.errorMessage || '', createdAt: sub.createdAt, processedAt: sub.processedAt, meetingId: sub.meetingId || null };
    if (sub.status === 'done' && sub.meetingId) {
      const fresh = (await pool.query('SELECT id, data FROM projects WHERE id=$1', [r.id])).rows[0];
      out.meeting = fresh ? meetingOut(fresh, sub.meetingId) : null;
      if (!out.meeting) out.note = 'A reunião criada foi apagada depois na tela.';
    }
    res.json(out);
  } catch (e) { inboxErr(res, next, e); }
});

router.post('/companies/:id/transcripts/:submissionId/retry', needTranscripts, async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const sub = (await listSubmissions(req.apiUser, r.id)).find((x) => x.id === req.params.submissionId);
    if (!sub) return res.status(404).json({ message: 'Envio não encontrado.' });
    if (sub.status !== 'failed') return res.status(409).json({ message: `Só envio que falhou pode ser reprocessado (este está "${sub.status}").` });
    await reprocessSubmission({ user: req.apiUser, submissionId: sub.id, projectId: r.id });
    res.status(202).json({ submissionId: sub.id, status: 'pending' });
  } catch (e) { inboxErr(res, next, e); }
});

// ------------------------------------------------------------------ correção de reunião registrada (§116e, escopo meetings_edit)
// A IA externa corrige o que a RENATA registrou (responsável errado, título impreciso, decisão mal formulada) com o mesmo cuidado das outras escritas: só campos da lista,
// tudo-ou-nada numa transação com FOR UPDATE, `dryRun` mostra antes e depois sem gravar, Log da empresa + api_token_actions + `meeting_edits` (antes/depois e corpo que desfaz;
// o `project_versions` só versiona cronograma, não reunião) e a memória da RENATA daquela reunião é reindexada. O vínculo tarefa→atividade nunca é alterado por aqui.
const MAX_EDIT_PER_HOUR = 200;
const editLimit = new Map();
function needMeetingsEdit(req, res, next) {
  const sc = req.apiToken.scope;
  if (!(sc === 'meetings_edit' || sc === 'write_all' || (sc === 'read_all' && req.method === 'GET'))) return res.status(403).json({ message: 'Esta chave não corrige reuniões. Gere uma chave "Ler e editar tudo" em Meu perfil > Integrações.' });
  if (!req.apiUser.companiesAccess) return res.status(403).json({ message: 'O dono do token não tem acesso a Empresas.' });
  next();
}
const claudeName = (u) => { const owner = u.name || u.username || ''; return /^claude code$/i.test(String(owner).trim()) ? 'Claude Code' : `Claude Code (por ${owner})`; };

// `undoOf` = linha de meeting_edits que esta chamada desfaz (a correção original fica marcada como desfeita na mesma transação).
async function runMeetingEdit(req, res, next, body, undoOf) {
  const dryRun = body.dryRun === true;
  const note = clip(body.note, 300);
  if (!dryRun && bump(editLimit, req.apiHash, 3600 * 1000, MAX_EDIT_PER_HOUR)) return res.status(429).json({ message: `Limite de ${MAX_EDIT_PER_HOUR} correções por hora nesta chave.` });
  const client = await pool.connect();
  let committed = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [req.params.id]);
    const r = rows[0];
    if (!r || r.org_id !== req.apiUser.orgId || !canAccessProject(req.apiUser, r.data, r.org_id)) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Empresa não encontrada.' }); }
    let toApply = body;
    if (undoOf) {
      const e = (await client.query('SELECT * FROM meeting_edits WHERE id=$1 AND project_id=$2 AND meeting_id=$3 FOR UPDATE', [undoOf, r.id, req.params.meetingId])).rows[0];
      if (!e) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Correção não encontrada.' }); }
      if (e.undone_at) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Esta correção já foi desfeita.' }); }
      toApply = { ...(e.undo || {}), ...(dryRun ? { dryRun: true } : {}), note: note || `Desfaz a correção ${e.id}` };
    }
    const who = claudeName(req.apiUser);
    const out = applyMeetingEdit(r.data, req.params.meetingId, toApply, who, { fromUndo: !!undoOf });
    if (out.notFound) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Reunião não encontrada.' }); }
    if (out.errors) { await client.query('ROLLBACK'); return res.status(undoOf ? 409 : 400).json({ message: undoOf ? 'Não deu para desfazer: a reunião mudou desde a correção. Nada foi gravado.' : 'Nada foi gravado: há campos inválidos.', errors: out.errors }); }
    const touched = [...new Set(out.changes.map((c) => (c.target === 'meeting' ? c.field : 'actionItems')))];
    if (dryRun) {
      await client.query('ROLLBACK');
      return res.json({ dryRun: true, applied: 0, wouldChange: out.changes.length, changes: out.changes });
    }
    const editId = uid('medit');
    const text = undoOf ? `desfez a correção ${undoOf}` : 'corrigida pela API';
    const entry = { ts: new Date().toISOString(), action: `Reunião "${clip(out.meeting.title, 80)}" ${text} (chave "${clip(req.apiToken.name, 40)}"): ${touched.join(', ')} — ${out.changes.length} alteração(ões). ${toApply.note || ''}`.trim(), user: who, activityId: null };
    out.next.log = [entry, ...(Array.isArray(out.next.log) ? out.next.log : [])].slice(0, 300);
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(out.next), r.id]);
    await client.query('INSERT INTO meeting_edits (id, org_id, project_id, meeting_id, token_id, actor_name, note, changes, undo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [editId, r.org_id, r.id, req.params.meetingId, req.apiToken.id, who, clip(toApply.note, 300), JSON.stringify(out.changes), JSON.stringify(out.undo)]);
    if (undoOf) await client.query('UPDATE meeting_edits SET undone_at=now() WHERE id=$1', [undoOf]);
    await client.query('COMMIT');
    committed = { r, out };
    res.json({ dryRun: false, editId, applied: out.changes.length, changes: out.changes, undoWith: `POST /api/connect/companies/${r.id}/meetings/${req.params.meetingId}/edits/${editId}/undo`, meeting: meetingOut({ data: out.next }, req.params.meetingId), memory: 'reindexando' });
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ } next(e); } finally { client.release(); }
  if (committed) {
    const { r, out } = committed;
    pool.query('INSERT INTO api_token_actions (id, org_id, token_id, user_id, method, path, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid('act'), r.org_id || null, req.apiToken.id, req.apiUser.id, req.method, clip(String(req.originalUrl || '').split('?')[0], 200), 200]).catch(() => {});
    reindexMeetingMemory(pool, r.org_id, r.id, out.meeting).catch((e) => console.error('Falha ao reindexar memória após correção de reunião por API', e.message));
  }
}

const jsonBody = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null);
const badControl = (b) => (b.dryRun !== undefined && typeof b.dryRun !== 'boolean' ? 'dryRun deve ser true ou false.' : b.note !== undefined && typeof b.note !== 'string' ? 'note deve ser texto.' : '');

router.patch('/companies/:id/meetings/:meetingId', needMeetingsEdit, async (req, res, next) => {
  const body = jsonBody(req);
  if (!body) return res.status(400).json({ message: 'Envie um objeto JSON com os campos a corrigir.' });
  const bad = badControl(body); if (bad) return res.status(400).json({ message: bad });
  runMeetingEdit(req, res, next, body, null);
});

router.get('/companies/:id/meetings/:meetingId/edits', needMeetingsEdit, async (req, res, next) => {
  try {
    const r = await loadOne(req, res);
    if (!r) return;
    const { rows } = await pool.query('SELECT id, created_at, actor_name, note, changes, undone_at FROM meeting_edits WHERE project_id=$1 AND meeting_id=$2 ORDER BY created_at DESC LIMIT 50', [r.id, req.params.meetingId]);
    res.json({ edits: rows.map((e) => ({ id: e.id, at: e.created_at, by: e.actor_name, note: e.note, changes: e.changes, undone: !!e.undone_at })) });
  } catch (e) { next(e); }
});

router.post('/companies/:id/meetings/:meetingId/edits/:editId/undo', needMeetingsEdit, async (req, res, next) => {
  const body = jsonBody(req) || {};
  const bad = badControl(body); if (bad) return res.status(400).json({ message: bad });
  runMeetingEdit(req, res, next, { dryRun: body.dryRun, note: body.note }, req.params.editId);
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
const isISODay = isMeetingDay; // valida o dia de verdade (2026-02-31 não vale)
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
