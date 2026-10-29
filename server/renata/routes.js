// Rotas da RENATA operacional (/api/renata) — §101. Conversa (uma por pessoa, continua entre telas), confirmação/cancelamento de ações pendentes, histórico de
// auditoria, desfazer e catálogo de ferramentas. Toda gravação feita pela RENATA passa pelo executor (server/renata/executor.js).
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { registry, executor, agent, aiConfigured, getClient } from './index.js';
import { todayInSp } from '../widgetSummary.js';
import { routeIndex, curatedSet, classify } from './policy.js';

export const router = Router();
router.use(requireAuth);

// 40 pedidos a cada 10 minutos por pessoa (um pedido pode encadear várias ferramentas; o custo é de IA).
const hits = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > 600000) hits.delete(k); }, 60000).unref();
function limited(userId) {
  const now = Date.now(); const rec = hits.get(userId);
  if (!rec || now - rec.start > 600000) { hits.set(userId, { start: now, n: 1 }); return false; }
  rec.n += 1; return rec.n > 40;
}
const cleanContext = (c) => (c && typeof c === 'object' ? {
  module: String(c.module || '').slice(0, 40), view: String(c.view || '').slice(0, 60),
  entity: c.entity && c.entity.id ? { type: String(c.entity.type || '').slice(0, 30), id: String(c.entity.id).slice(0, 80), title: String(c.entity.title || '').slice(0, 120) } : null,
} : null);

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e && e.status && e.status < 500) return res.status(e.status).json({ message: e.message });
    console.error('RENATA:', e && e.stack ? e.stack : e);
    return res.status(502).json({ message: 'A RENATA não conseguiu concluir agora (a IA ou o sistema falhou). Tente de novo; nada foi gravado sem aparecer no registro de ações.' });
  }
};

router.get('/status', wrap(async (req, res) => {
  res.json({ available: await aiConfigured(), tools: registry.forUser(req.user).length });
}));

router.post('/chat', wrap(async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ message: 'Escreva o que você quer que eu faça.' });
  if (message.length > 4000) return res.status(400).json({ message: 'Mensagem muito longa (máximo 4.000 caracteres).' });
  if (req.user.role === 'cliente') return res.status(403).json({ message: 'A RENATA operacional é da equipe PRICETAX.' });
  if (!(await aiConfigured())) return res.status(503).json({ message: 'A RENATA ainda não está configurada neste ambiente (falta a chave da IA).' });
  if (limited(req.user.id)) return res.status(429).json({ message: 'Muitos pedidos seguidos. Espere alguns minutos.' });
  const out = await agent.chat({ user: req.user, message, conversationId: (req.body || {}).conversationId || null, context: cleanContext((req.body || {}).context), today: todayInSp() });
  res.json(out);
}));

// Confirma ou cancela ações pendentes: [{actionId, decision: 'confirm'|'cancel'}]
router.post('/conversations/:id/decide', wrap(async (req, res) => {
  const decisions = Array.isArray((req.body || {}).decisions) ? req.body.decisions.filter((d) => d && d.actionId && ['confirm', 'cancel'].includes(d.decision)).slice(0, 30) : [];
  if (!decisions.length) return res.status(400).json({ message: 'Informe as decisões (confirmar ou cancelar).' });
  if (!(await aiConfigured())) return res.status(503).json({ message: 'A RENATA ainda não está configurada neste ambiente (falta a chave da IA).' });
  res.json(await agent.decide({ user: req.user, conversationId: req.params.id, decisions, today: todayInSp() }));
}));

// Conversa em formato de tela: mensagens (texto), passos executados com status, e cartões pendentes.
router.get('/conversations/:id', wrap(async (req, res) => {
  const conv = await agent.loadConversation(req.user, req.params.id);
  if (!conv) return res.status(404).json({ message: 'Conversa não encontrada.' });
  const { rows: acts } = await pool.query('SELECT id, tool_use_id, tool, risk, status, summary, undo IS NOT NULL AS undoable, undone_at, autorizacao FROM renata_actions WHERE conversation_id=$1 AND requester_id=$2', [conv.id, req.user.id]);
  const byUse = new Map(acts.map((a) => [a.tool_use_id, a]));
  const messages = [];
  for (const m of conv.messages || []) {
    if (m.role === 'user' && typeof m.content === 'string') messages.push({ role: 'user', text: m.content, at: m._at || null });
    else if (m.role === 'assistant' && Array.isArray(m.content)) {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const steps = m.content.filter((b) => b.type === 'tool_use').map((b) => { const a = byUse.get(b.id); return a ? { actionId: a.id, tool: a.tool, risk: a.risk, status: a.status, summary: a.summary, undoable: a.undoable && !a.undone_at, undone: !!a.undone_at } : { tool: b.name, status: 'unknown' }; });
      if (text && text !== '…') messages.push({ role: 'assistant', text, steps, at: m._at || null });
      else if (steps.length) messages.push({ role: 'assistant', text: '', steps, at: m._at || null });
    }
  }
  const pt = conv.context && conv.context.pendingTurn;
  const pending = [];
  if (pt) for (const r of pt.results) if (r.deferred) { const a = acts.find((x) => x.id === r.actionId); const full = await executor.loadAction(r.actionId, req.user); if (a && full && full.status === 'pending') pending.push({ actionId: r.actionId, tool: full.tool, risk: full.risk, preview: full.summary, before: full.before, input: full.input }); }
  res.json({ conversationId: conv.id, title: conv.title, messages, pending });
}));

router.get('/conversations', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, title, updated_at FROM renata_conversations WHERE user_id=$1 AND org_id=$2 ORDER BY updated_at DESC LIMIT 20', [req.user.id, req.user.orgId]);
  res.json({ conversations: rows });
}));

// Registro de auditoria: o seu; o administrador vê o da organização inteira (?scope=org).
router.get('/actions', wrap(async (req, res) => {
  const isAdmin = req.user.isSuperAdmin || req.user.role === 'master';
  const org = req.query.scope === 'org' && isAdmin;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, conversation_id, executor, requester_id, requester_name, command, requested_at, executed_at, module, tool, risk, summary, input, before, after, autorizacao AS authorization, status, error, undo IS NOT NULL AS undoable, undone_at
     FROM renata_actions WHERE org_id=$1 ${org ? '' : 'AND requester_id=$3'} AND ($2::text = '' OR status=$2) ORDER BY requested_at DESC LIMIT ${limit}`,
    org ? [req.user.orgId, String(req.query.status || '')] : [req.user.orgId, String(req.query.status || ''), req.user.id]);
  res.json({ actions: rows });
}));

router.post('/actions/:id/undo', wrap(async (req, res) => {
  const out = await executor.undoAction(req.user, req.params.id);
  res.status(out.ok ? 200 : (out.status === 'denied' ? 403 : 400)).json(out.ok ? { ok: true, summary: out.summary, actionId: out.actionId } : { ok: false, message: out.error });
}));

// Transparência: o que a RENATA consegue fazer por este usuário e como cada rota da plataforma é coberta.
router.get('/catalog', wrap(async (req, res) => {
  const tools = registry.forUser(req.user).map((t) => ({ name: t.name, module: t.module, risk: t.risk, summary: t.summary }));
  const cur = curatedSet(registry);
  const cover = { curated: 0, generic: 0, excluded: 0 };
  for (const r of routeIndex()) cover[classify(r, cur).kind] += 1;
  res.json({ tools, coverage: { routes: routeIndex().length, ...cover } });
}));

export { getClient };
