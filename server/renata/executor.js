// Executor de ferramentas da RENATA (§101). TODA operação passa por aqui: valida os parâmetros, checa permissão (as rotas do servidor decidem, em nome do
// usuário), exige confirmação explícita quando é crítica/destrutiva/em lote, evita duplicidade, executa, guarda o antes e o depois e grava o registro de
// auditoria (executor RENATA, solicitante, comando original, autorização e resultado — inclusive recusas e cancelamentos). A IA nunca grava nada por fora.
import crypto from 'node:crypto';
import { validate } from './validate.js';
import { callInternal } from './internalCall.js';

const uid = (p) => `${p}-${crypto.randomBytes(7).toString('base64url')}`;
const CONFIRM_TTL_MS = 30 * 60 * 1000;
const DEDUPE_MS = 10 * 60 * 1000;

export const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));

// Resultado para a IA e para o registro: listas e textos longos são encurtados (com aviso), nunca estouram o contexto.
export function compact(v, max = 9000) {
  const trim = (x, depth = 0) => {
    if (Array.isArray(x)) {
      const keep = x.slice(0, depth === 0 ? 40 : 15).map((y) => trim(y, depth + 1));
      return x.length > keep.length ? [...keep, { _omitidos: x.length - keep.length }] : keep;
    }
    if (x && typeof x === 'object') {
      const o = {};
      for (const [k, y] of Object.entries(x)) if (!['attachments', 'dataUrl', 'embedding'].includes(k)) o[k] = trim(y, depth + 1);
      return o;
    }
    if (typeof x === 'string' && x.length > 700) return `${x.slice(0, 700)}… [texto cortado]`;
    return x;
  };
  let out = trim(v);
  let s = JSON.stringify(out);
  if (s && s.length > max) { out = { _resultado_longo: true, inicio: s.slice(0, max) }; }
  return out;
}

const fill = (path, params) => {
  const used = new Set();
  const p = path.replace(/\{(\w+)\}/g, (m, k) => { used.add(k); return encodeURIComponent(String(params[k] ?? '')); });
  return { path: p, used };
};

function needsConfirmation(tool, input) {
  if (tool.risk === 'critical') return true;
  if (tool.confirm === 'always') return true;
  if (typeof tool.confirm === 'function' && tool.confirm(input)) return true;
  if (typeof tool.bulk === 'function' && tool.bulk(input) > 1) return true;
  return false;
}

export function createExecutor({ pool, registry, call = callInternal, now = () => new Date() }) {
  async function insertRow(ctx, tool, fields) {
    const id = uid('rta');
    await pool.query(
      `INSERT INTO renata_actions (id, org_id, conversation_id, tool_use_id, requester_id, requester_name, command, requested_at, module, tool, risk, summary, input, before, autorizacao, status, error, idem_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18)`,
      [id, ctx.orgId, ctx.conversationId || null, ctx.toolUseId || '', ctx.user.id, ctx.user.name || ctx.user.username || '', String(ctx.command || '').slice(0, 4000), now(), tool.module || '', tool.name, tool.risk,
        fields.summary || '', JSON.stringify(fields.status === 'pending' ? fields.input || {} : compact(fields.input || {}, 6000)), fields.before === undefined ? null : JSON.stringify(compact(fields.before, 6000)), JSON.stringify(fields.authorization || {}), fields.status, fields.error || '', fields.idemKey || '']);
    return id;
  }
  async function closeRow(id, fields) {
    await pool.query(
      `UPDATE renata_actions SET status=$2, executed_at=$3, after=$4::jsonb, error=$5, summary=COALESCE(NULLIF($6,''), summary), undo=$7::jsonb, autorizacao=COALESCE($8::jsonb, autorizacao), before=COALESCE($9::jsonb, before) WHERE id=$1`,
      [id, fields.status, now(), fields.after === undefined ? null : JSON.stringify(compact(fields.after, 8000)), fields.error || '', fields.summary || '', fields.undo ? JSON.stringify(fields.undo) : null,
        fields.authorization ? JSON.stringify(fields.authorization) : null, fields.before === undefined ? null : JSON.stringify(compact(fields.before, 6000))]);
  }

  async function fetchBefore(ctx, tool, input) {
    if (!tool.before) return undefined;
    try {
      if (typeof tool.before === 'function') return await tool.before(ctx, input);
      const { path } = fill(tool.before.path, input);
      const r = await call({ userId: ctx.user.id, method: 'GET', path });
      if (r.status !== 200) return undefined;
      return tool.before.pick ? tool.before.pick(r.json) : r.json;
    } catch { return undefined; }
  }

  async function perform(ctx, tool, input) {
    if (tool.run) return tool.run(ctx, input);
    const { path, used } = fill(tool.route.path, input);
    const rest = Object.fromEntries(Object.entries(tool.map ? tool.map(input) : input).filter(([k]) => !used.has(k)));
    const isRead = tool.route.method === 'GET';
    const r = await call({ userId: ctx.user.id, commandId: ctx.actionId, method: tool.route.method, path, query: isRead ? rest : undefined, body: isRead ? undefined : rest });
    return { status: r.status, json: r.json };
  }

  // Executa (ou pede confirmação). `confirm` = {by, at, mode} quando é a execução de uma ação pendente já autorizada pelo usuário.
  async function executeTool(ctx, name, rawInput, { confirm = null, pendingId = null } = {}) {
    const tool = registry.get(name);
    if (!tool) return { ok: false, status: 'failed', error: `Ferramenta desconhecida: ${name}.` };
    if (tool.visible && !tool.visible(ctx.user)) {
      const msg = 'O seu perfil não tem acesso a este módulo.';
      await insertRow(ctx, tool, { input: rawInput || {}, status: 'denied', error: msg, summary: tool.label || tool.name, authorization: { mode: 'negada' } }).catch(() => {});
      return { ok: false, status: 'denied', error: msg };
    }
    const v = validate(tool.params, rawInput || {});
    if (!v.ok) {
      if (tool.risk !== 'read') await insertRow(ctx, tool, { input: rawInput, status: 'failed', error: `Parâmetros inválidos: ${v.errors.join(' | ')}`, summary: tool.label || tool.name, authorization: { mode: 'não executada' } }).catch(() => {});
      return { ok: false, status: 'failed', error: `Parâmetros inválidos: ${v.errors.join(' | ')}` };
    }
    const input = v.value || {};
    if (tool.can && !(await tool.can(ctx.user, input, ctx))) {
      const msg = 'O seu perfil não tem permissão para isto.';
      await insertRow(ctx, tool, { input, status: 'denied', error: msg, summary: tool.label || tool.name, authorization: { mode: 'negada' } }).catch(() => {});
      return { ok: false, status: 'denied', error: msg };
    }
    const before = await fetchBefore(ctx, tool, input);
    const preview = tool.describe ? tool.describe(input, before) : (tool.label || tool.name);

    // Contenção de "lote disfarçado": mais de 5 escritas da MESMA ferramenta no mesmo pedido, uma a uma, passam a pedir confirmação.
    const turnN = ctx.turnWrites && tool.risk !== 'read' ? (ctx.turnWrites.get(tool.name) || 0) : 0;
    if (!confirm && (needsConfirmation(tool, input) || turnN >= 5)) {
      // O que o usuário confirma é executado DEPOIS a partir do que ficou guardado: aqui o pedido vai INTEIRO (sem `compact`, que cortava listas e textos — M16).
      if (JSON.stringify(input).length > 300000) return { ok: false, status: 'failed', error: 'O pedido é grande demais para confirmar de uma vez. Divida em partes menores.' };
      const id = await insertRow(ctx, tool, { input, before, status: 'pending', summary: preview, authorization: { mode: 'aguardando confirmação', pedidoEm: now().toISOString() } });
      return { ok: true, status: 'needs_confirmation', actionId: id, tool: tool.name, risk: tool.risk, preview: turnN >= 5 && !needsConfirmation(tool, input) ? `${preview} (já foram ${turnN} alterações iguais neste pedido: confirme o conjunto)` : preview, before: before === undefined ? undefined : compact(before, 2500), input };
    }

    const idemKey = tool.creates ? crypto.createHash('sha1').update(`${tool.name}|${stable(input)}`).digest('hex') : '';
    if (idemKey && !confirm) {
      const { rows } = await pool.query(`SELECT id, after, summary FROM renata_actions WHERE requester_id=$1 AND idem_key=$2 AND status='success' AND requested_at > $3 ORDER BY requested_at DESC LIMIT 1`,
        [ctx.user.id, idemKey, new Date(now().getTime() - DEDUPE_MS)]);
      if (rows[0]) return { ok: true, status: 'success', deduplicated: true, actionId: rows[0].id, summary: `Já criado há instantes (mesmos dados) — não dupliquei. ${rows[0].summary}`, data: rows[0].after };
    }

    const authorization = confirm
      ? { mode: confirm.mode || 'confirmada', confirmadaPor: confirm.by, confirmadaEm: confirm.at, acaoPendente: pendingId }
      : { mode: 'automática', motivo: 'ação de baixo risco e reversível, dentro do pedido do usuário', pedidoEm: now().toISOString() };
    let id = pendingId;
    if (!id) id = await insertRow(ctx, tool, { input, before, status: 'pending', summary: preview, authorization, idemKey });
    ctx.actionId = id;
    let out;
    try { out = await perform({ ...ctx, actionId: id }, tool, input); } catch (e) { out = { status: 599, json: { message: `Falha ao executar: ${e.message}` } }; }
    const ok = out.status >= 200 && out.status < 300;
    const errMsg = ok ? '' : String((out.json && (out.json.message || out.json.error)) || `HTTP ${out.status}`);
    const status = ok ? (out.partial ? 'partial' : 'success') : (out.status === 403 ? 'denied' : 'failed');
    const resultBody = out.json;
    const undo = ok && tool.undo ? (tool.undo(input, before, resultBody) || null) : null;
    const summary = ok && tool.summarize ? tool.summarize(input, resultBody, before) : (ok ? preview : `${preview} — ${errMsg}`);
    if (ok && ctx.turnWrites && tool.risk !== 'read') ctx.turnWrites.set(tool.name, (ctx.turnWrites.get(tool.name) || 0) + 1);
    await closeRow(id, { status, after: ok ? resultBody : { erro: errMsg, detalhes: out.json && out.json.duplicates ? { duplicates: out.json.duplicates } : undefined }, error: errMsg, summary, undo, authorization, before });
    if (!ok) return { ok: false, status, actionId: id, error: errMsg, details: out.json && (out.json.duplicates || out.json.errors) ? { duplicates: out.json.duplicates, errors: out.json.errors } : undefined };
    return { ok: true, status, actionId: id, summary, data: compact(resultBody, tool.risk === 'read' ? 12000 : 4000), undoable: !!undo };
  }

  async function loadAction(id, user) {
    const { rows } = await pool.query('SELECT * FROM renata_actions WHERE id=$1 AND org_id=$2', [id, user.orgId]);
    return rows[0] || null;
  }

  // Confirmar uma ação pendente (clique do usuário que fez o pedido).
  async function confirmAction(user, id, ctxExtra = {}) {
    const row = await loadAction(id, user);
    if (!row || row.requester_id !== user.id) return { ok: false, status: 'failed', error: 'Ação não encontrada.' };
    if (row.status !== 'pending') return { ok: false, status: 'failed', error: `Esta ação já foi ${row.status === 'cancelled' ? 'cancelada' : 'decidida'}.` };
    if (now().getTime() - new Date(row.requested_at).getTime() > CONFIRM_TTL_MS) {
      await closeRow(id, { status: 'cancelled', error: 'Expirou sem confirmação (30 minutos).', summary: row.summary, authorization: { ...row.autorizacao, mode: 'expirada' } });
      return { ok: false, status: 'cancelled', error: 'A confirmação expirou (30 minutos). Peça de novo.' };
    }
    const ctx = { user, orgId: user.orgId, command: row.command, conversationId: row.conversation_id, toolUseId: row.tool_use_id, ...ctxExtra };
    const r = await executeTool(ctx, row.tool, row.input, { confirm: { by: `${user.name || user.username} (${user.id})`, at: now().toISOString(), mode: 'confirmada pelo usuário' }, pendingId: id });
    return { ...r, actionId: id };
  }

  async function cancelAction(user, id, reason = 'cancelada pelo usuário') {
    const row = await loadAction(id, user);
    if (!row || row.requester_id !== user.id) return { ok: false, status: 'failed', error: 'Ação não encontrada.' };
    if (row.status !== 'pending') return { ok: false, status: 'failed', error: 'Esta ação já foi decidida.' };
    await closeRow(id, { status: 'cancelled', error: reason, summary: row.summary, authorization: { ...row.autorizacao, mode: 'cancelada', motivo: reason } });
    return { ok: true, status: 'cancelled', actionId: id };
  }

  // Desfaz uma ação já executada, quando a ferramenta sabe como (o próprio pedido de desfazer é a autorização; fica registrado como nova ação).
  async function undoAction(user, id) {
    const row = await loadAction(id, user);
    if (!row) return { ok: false, status: 'failed', error: 'Ação não encontrada.' };
    const isAdmin = user.isSuperAdmin || user.role === 'master';
    if (row.requester_id !== user.id && !isAdmin) return { ok: false, status: 'denied', error: 'Só quem pediu a ação (ou um administrador) pode desfazê-la.' };
    if (row.status !== 'success' || !row.undo) return { ok: false, status: 'failed', error: 'Esta ação não pode ser desfeita automaticamente.' };
    if (row.undone_at) return { ok: false, status: 'failed', error: 'Esta ação já foi desfeita.' };
    const ctx = { user, orgId: user.orgId, command: `Desfazer: ${row.summary}`, conversationId: row.conversation_id };
    const r = await executeTool(ctx, row.undo.tool, row.undo.input, { confirm: { by: `${user.name || user.username} (${user.id})`, at: now().toISOString(), mode: `desfazer ${id}` } });
    if (r.ok) await pool.query('UPDATE renata_actions SET undone_at=$2 WHERE id=$1', [id, now()]);
    return r;
  }

  return { executeTool, confirmAction, cancelAction, undoAction, loadAction };
}
