import { pool } from './db.js';
import { deviceLabel } from './accessLog.js';
import { isTracked } from './usageLog.js';

// "Dia da equipe" (2026-10-29, pedido do Rafael): para cada pessoa da equipe (master e pricetax, as únicas medidas), num dia de Brasília:
// quando entrou e quando saiu, por quais telas passou e o que fez/editou/incluiu. Não coleta nada novo além do evento de "saída" (logout):
// monta, a partir do que já era guardado (acessos, fatias de uso, log das empresas, auditoria e linha do tempo do CRM, cartões, XFlow, reuniões).
// Nunca devolve texto digitado, conteúdo de comentário ou pergunta à RENATA.

const OFFSET = '-03:00';
const SESSION_GAP_MS = 30 * 60 * 1000;
const SEGMENT_GAP_MS = 3 * 60 * 1000;
const LIVE_MS = 5 * 60 * 1000;
const PRESENCE_IN = new Set(['login', 'visit', 'first_use']);

export const MODULE_LABEL = {
  company: 'Empresas', personal: 'Gestão de Atividades', xflow: 'XFlow', agenda: 'Agenda', macro: 'Visão Geral', knowledge: 'Conhecimento',
  pareceres: 'Pareceres', modelos: 'Modelos', crm: 'CRM', users: 'Usuários', ops: 'Inteligência Operacional',
};

export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00${OFFSET}`));
export function dayWindow(date) {
  const fromMs = Date.parse(`${date}T00:00:00${OFFSET}`);
  return { fromMs, toMs: fromMs + 86400000 };
}
const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
export { hhmm };

// Sessões: uma nova começa em novo login, depois de um logout ou após 30 min sem nenhum sinal. O fim é o logout, se houve;
// senão a última atividade registrada (o navegador fechado não avisa o servidor) — e isso vai marcado como tal, nunca como saída exata.
export function buildSessions(points, nowMs) {
  const sorted = points.slice().sort((a, b) => a.at - b.at);
  const sessions = [];
  let cur = null;
  for (const p of sorted) {
    const endAt = p.at + (p.kind === 'slice' ? p.connectedS * 1000 : 0);
    if (!cur || cur.closed || p.kind === 'login' || (p.kind !== 'logout' && p.at - cur.endMs > SESSION_GAP_MS)) {
      cur = { startMs: p.at, endMs: endAt, entry: null, endKind: 'ultima-atividade', closed: false, connectedS: 0, activeS: 0 };
      sessions.push(cur);
    }
    if (!cur.entry && PRESENCE_IN.has(p.kind)) cur.entry = { kind: p.kind, city: p.city || '', region: p.region || '', device: p.device || '' };
    cur.endMs = Math.max(cur.endMs, endAt);
    if (p.kind === 'slice') { cur.connectedS += p.connectedS; cur.activeS += p.activeS; }
    if (p.kind === 'logout') { cur.endKind = 'logout'; cur.closed = true; }
  }
  for (const s of sessions) {
    if (s.endKind !== 'logout' && nowMs != null && nowMs - s.endMs < LIVE_MS) s.endKind = 'em-andamento';
    s.durationS = Math.max(0, Math.round((s.endMs - s.startMs) / 1000));
  }
  return sessions;
}

// Telas: fatias seguidas na mesma tela viram um trecho único (com folga de 3 min entre uma e outra).
export function buildScreens(slices, projectNames = {}) {
  const sorted = slices.slice().sort((a, b) => a.at - b.at);
  const out = [];
  for (const s of sorted) {
    const toMs = s.at + s.connectedS * 1000;
    const last = out[out.length - 1];
    if (last && last.module === s.module && last.view === s.view && last.projectId === s.projectId && s.at - last.toMs <= SEGMENT_GAP_MS) {
      last.toMs = Math.max(last.toMs, toMs); last.connectedS += s.connectedS; last.activeS += s.activeS;
    } else {
      out.push({ module: s.module, moduleLabel: MODULE_LABEL[s.module] || s.module || 'Outros', view: s.view, projectId: s.projectId, projectName: projectNames[s.projectId] || '', fromMs: s.at, toMs, connectedS: s.connectedS, activeS: s.activeS });
    }
  }
  return out;
}

const ACTION = { export_pdf: 'Exportou PDF', export_excel: 'Exportou Excel', upload_transcript: 'Enviou uma transcrição', upload_file: 'Enviou um arquivo', share_link_create: 'Criou um link de compartilhamento', meeting_submit: 'Enviou uma reunião', search: 'Fez uma busca' };
const CARD = { step_done: 'Concluiu uma etapa de cartão', done: 'Concluiu um cartão', created: 'Criou um cartão', opened: 'Abriu um cartão' };
const CRM_ACTION = { create: 'Criou', update: 'Alterou', delete: 'Excluiu', move: 'Moveu', restore: 'Restaurou' };
const CRM_ENTITY = { company: 'empresa', deal: 'negócio', contact: 'contato', activity: 'atividade', note: 'nota', pipeline: 'funil', cadence: 'cadência', product: 'produto', tag: 'tag', view: 'visão' };

// O que mudou num registro do CRM, em uma linha: "Responsável: A → B". Só campos e valores curtos; texto longo é cortado.
export function summarizeChanges(changes) {
  if (!Array.isArray(changes)) return '';
  const v = (x) => (x == null || x === '' ? '—' : String(typeof x === 'object' ? JSON.stringify(x) : x).slice(0, 60));
  return changes.slice(0, 6).map((c) => (c && c.label ? `${c.label}: ${v(c.from)} → ${v(c.to)}` : '')).filter(Boolean).join(' · ');
}

export function buildPersonDay(user, data, nowMs) {
  const access = data.access.filter((a) => a.userId === user.id);
  const slices = data.usage.filter((u) => u.userId === user.id && u.kind === 'slice');
  const actions = data.usage.filter((u) => u.userId === user.id && u.kind === 'action');
  const events = data.events.filter((e) => e.userId === user.id);
  const points = [
    ...access.filter((a) => PRESENCE_IN.has(a.kind) || a.kind === 'logout').map((a) => ({ at: a.at, kind: a.kind, city: a.city, region: a.region, device: a.device })),
    ...slices.map((s) => ({ at: s.at, kind: 'slice', connectedS: s.connectedS, activeS: s.activeS })),
    ...actions.map((a) => ({ at: a.at, kind: 'act' })),
    ...events.map((e) => ({ at: e.at, kind: 'act' })),
  ];
  const sessions = buildSessions(points, nowMs);
  const screens = buildScreens(slices, data.projectNames);
  const operations = [
    ...actions.map((a) => ({ at: a.at, source: 'acao', label: ACTION[a.action] || a.action, detail: data.projectNames[a.projectId] || '' })),
    ...events.map((e) => ({ at: e.at, source: e.source, label: e.label, detail: e.detail || '' })),
  ].sort((a, b) => a.at - b.at);
  const failed = access.filter((a) => a.kind === 'login_failed').length;
  return {
    userId: user.id, name: user.name, username: user.username, role: user.role,
    firstMs: sessions.length ? sessions[0].startMs : null,
    lastMs: sessions.length ? sessions[sessions.length - 1].endMs : null,
    lastEndKind: sessions.length ? sessions[sessions.length - 1].endKind : null,
    totals: { sessions: sessions.length, connectedS: sessions.reduce((n, s) => n + s.connectedS, 0), activeS: sessions.reduce((n, s) => n + s.activeS, 0), operations: operations.length, failedLogins: failed },
    sessions, screens, operations,
  };
}

// ---------------------------------------------------------------- leitura do banco
async function loadData(users, orgId, fromMs, toMs) {
  const ids = users.map((u) => u.id); const from = new Date(fromMs); const to = new Date(toMs);
  const [access, usage, projects, cards, boards, xflow, audit, timeline, renata, meetings] = await Promise.all([
    pool.query(`SELECT user_id, kind, at, city, region, user_agent FROM user_access_events WHERE user_id = ANY($1::text[]) AND at >= $2 AND at < $3 ORDER BY at ASC`, [ids, from, to]),
    pool.query(`SELECT user_id, kind, module, view, project_id, connected_s, active_s, action, at FROM user_usage_events WHERE user_id = ANY($1::text[]) AND at >= $2 AND at < $3 ORDER BY at ASC`, [ids, from, to]),
    pool.query(`SELECT id, data->'company'->>'name' AS name, data->'log' AS log FROM projects ${orgId ? 'WHERE org_id=$1' : ''}`, orgId ? [orgId] : []),
    pool.query(`SELECT user_id, card_id, kind, occurred_at AS at FROM personal_card_events WHERE user_id = ANY($1::text[]) AND occurred_at >= $2 AND occurred_at < $3 AND kind <> 'opened'`, [ids, from, to]),
    pool.query(`SELECT user_id, data FROM personal_boards WHERE user_id = ANY($1::text[])`, [ids]),
    pool.query(`SELECT e.user_id, e.type, e.field, e.created_at AS at, t.title FROM xflow_events e JOIN xflow_tickets t ON t.id = e.ticket_id WHERE e.user_id = ANY($1::text[]) AND e.created_at >= $2 AND e.created_at < $3`, [ids, from, to]),
    pool.query(`SELECT actor_id AS user_id, action, entity_type, changes, created_at AS at FROM crm_audit_logs WHERE actor_id = ANY($1::text[]) AND created_at >= $2 AND created_at < $3`, [ids, from, to]),
    pool.query(`SELECT actor_id AS user_id, summary, event_type, occurred_at AS at FROM crm_timeline_events WHERE actor_id = ANY($1::text[]) AND occurred_at >= $2 AND occurred_at < $3`, [ids, from, to]),
    pool.query(`SELECT c.user_id, m.created_at AS at FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id WHERE m.role='user' AND c.user_id = ANY($1::text[]) AND m.created_at >= $2 AND m.created_at < $3`, [ids, from, to]),
    pool.query(`SELECT submitted_by AS user_id, created_at AS at FROM meeting_submissions WHERE submitted_by = ANY($1::text[]) AND created_at >= $2 AND created_at < $3`, [ids, from, to]),
  ]);
  const byName = new Map();
  for (const u of users) { const k = String(u.name || '').trim().toLowerCase(); byName.set(k, byName.has(k) ? null : u.id); }
  const events = [];
  for (const p of projects.rows) {
    for (const l of (Array.isArray(p.log) ? p.log : [])) {
      const at = Date.parse(l.ts); if (!(at >= fromMs && at < toMs)) continue;
      const uid = byName.get(String(l.user || '').trim().toLowerCase()); if (!uid) continue;
      events.push({ userId: uid, at, source: 'empresas', label: String(l.action || '').slice(0, 200), detail: p.name || '' });
    }
  }
  const cardTitle = new Map();
  for (const b of boards.rows) for (const pg of (b.data && b.data.boards) || []) for (const col of pg.columns || []) for (const c of col.cards || []) cardTitle.set(`${b.user_id}:${c.id}`, String(c.title || '').slice(0, 120));
  for (const r of cards.rows) events.push({ userId: r.user_id, at: r.at.getTime(), source: 'quadro', label: CARD[r.kind] || `Cartão: ${r.kind}`, detail: cardTitle.get(`${r.user_id}:${r.card_id}`) || '' });
  for (const r of xflow.rows) events.push({ userId: r.user_id, at: r.at.getTime(), source: 'xflow', label: `XFlow: ${r.type}${r.field ? ` (${r.field})` : ''}`, detail: String(r.title || '').slice(0, 120) });
  const tl = timeline.rows.map((r) => ({ userId: r.user_id, at: r.at.getTime() }));
  for (const r of timeline.rows) events.push({ userId: r.user_id, at: r.at.getTime(), source: 'crm', label: String(r.summary || 'Alterou algo no CRM').slice(0, 240), detail: '' });
  for (const r of audit.rows) {
    const at = r.at.getTime();
    const change = summarizeChanges(r.changes);
    // A linha do tempo já conta a mudança em frase; só entra a auditoria que ela não cobriu (mesmo autor, até 3 s de diferença).
    if (tl.some((t) => t.userId === r.user_id && Math.abs(t.at - at) <= 3000)) continue;
    events.push({ userId: r.user_id, at, source: 'crm', label: `CRM: ${CRM_ACTION[r.action] || r.action} ${CRM_ENTITY[r.entity_type] || r.entity_type}`, detail: change });
  }
  for (const r of renata.rows) events.push({ userId: r.user_id, at: r.at.getTime(), source: 'renata', label: 'Perguntou à RENATA', detail: '' });
  for (const r of meetings.rows) events.push({ userId: r.user_id, at: r.at.getTime(), source: 'reunioes', label: 'Enviou uma transcrição de reunião', detail: '' });
  return {
    access: access.rows.map((r) => ({ userId: r.user_id, kind: r.kind, at: r.at.getTime(), city: r.city, region: r.region, device: deviceLabel(r.user_agent) })),
    usage: usage.rows.map((r) => ({ userId: r.user_id, kind: r.kind, module: r.module, view: r.view, projectId: r.project_id, connectedS: r.connected_s, activeS: r.active_s, action: r.action, at: r.at.getTime() })),
    events, projectNames: Object.fromEntries(projects.rows.map((p) => [p.id, p.name || p.id])),
  };
}

// `scope`: { orgId, all } — all=true só para o super administrador sem organização escolhida. `userId` opcional.
export async function teamDay({ orgId, all = false }, date, { userId = '' } = {}, nowMs = Date.now()) {
  if (!isDay(date)) { const e = new Error('Informe a data no formato AAAA-MM-DD.'); e.status = 400; throw e; }
  const { fromMs, toMs } = dayWindow(date);
  const params = []; const where = [`role IN ('master','pricetax')`];
  if (!all) { params.push(orgId); where.push(`org_id=$${params.length}`); }
  if (userId) { params.push(userId); where.push(`id=$${params.length}`); }
  const { rows } = await pool.query(`SELECT id, name, username, role FROM users WHERE ${where.join(' AND ')} ORDER BY name ASC`, params);
  const users = rows.filter((u) => isTracked(u));
  const data = users.length ? await loadData(users, all ? null : orgId, fromMs, toMs) : { access: [], usage: [], events: [], projectNames: {} };
  const live = nowMs >= fromMs && nowMs < toMs ? nowMs : null;
  return {
    date, timezone: 'America/Sao_Paulo', generatedAt: new Date(nowMs).toISOString(),
    people: users.map((u) => buildPersonDay(u, data, live)),
    notes: [
      'Saída: se a pessoa clicou em Sair, é a hora exata; se fechou a aba ou o navegador, é a última atividade registrada (marcada como tal).',
      'Só equipe (master e PRICETAX) é medida. Não há texto digitado, conteúdo de comentário, pergunta à RENATA nem mouse.',
      'Edições feitas no quadro pessoal aparecem como cartão criado/concluído; mudanças no CRM, nas empresas e no XFlow trazem o que mudou.',
    ],
  };
}
