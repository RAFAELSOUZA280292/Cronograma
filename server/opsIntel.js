import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMaster } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { backfillCoords, deviceLabel } from './accessLog.js';
import { RETENTION } from './usageLog.js';
import { usagePolicy } from './usagePolicy.js';
import { summary as experienceSummary } from './experience.js';
import { BASIS, activityIndex, aggregateMap, combineDays, dayOf, detectAlerts, heatFromTimestamps, hourOf, maskIp, pctChange, sessionize, summarizeSlices } from '../shared/usageMetrics.js';

// Central de Inteligência Operacional (2026-10-25). Só master, mesma organização. Toda resposta separa o que foi MEDIDO
// (fatias do rastreador) do que é ESTIMADO (eventos que já existiam) e do que é INDISPONÍVEL. Ver PROJECT_CONTEXT.md.
export const router = Router();
router.use(requireAuth, requireMaster);

const DAY = 86400000;
const PRESENCE = new Set(['login', 'visit', 'first_use']);
const MAX_DAYS = 180;

function ymd(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : ''; }
const startMs = (d) => Date.parse(`${d}T00:00:00-03:00`);

export function parsePeriod(q, nowMs = Date.now()) {
  const to = ymd(q.to) || dayOf(nowMs); const toMs = startMs(to) + DAY;
  let from = ymd(q.from); let fromMs = from ? startMs(from) : toMs - 30 * DAY;
  if (toMs - fromMs > MAX_DAYS * DAY) fromMs = toMs - MAX_DAYS * DAY;
  if (fromMs >= toMs) fromMs = toMs - DAY;
  from = dayOf(fromMs);
  const span = toMs - fromMs;
  return { from, to, fromMs, toMs, prevFromMs: fromMs - span, prevToMs: fromMs };
}

async function orgUsers(req, { userId, profile }) {
  const orgId = effectiveOrgId(req);
  const params = []; const where = [];
  if (!(req.user.isSuperAdmin && !orgId)) { params.push(orgId); where.push(`org_id=$${params.length}`); }
  if (userId) { params.push(userId); where.push(`id=$${params.length}`); }
  if (profile && ['master', 'pricetax', 'cliente'].includes(profile)) { params.push(profile); where.push(`role=$${params.length}`); }
  const { rows } = await pool.query(`SELECT id, name, username, role, org_id FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name ASC`, params);
  return { users: rows, orgId };
}

// Evidências que já existiam antes do rastreador: viram eventos {userId, at(ms), source, projectId, label}.
async function loadEvidence(users, orgId, fromMs, toMs) {
  const ids = users.map((u) => u.id); const from = new Date(fromMs); const to = new Date(toMs);
  const byName = new Map();
  for (const u of users) { const k = String(u.name || '').trim().toLowerCase(); byName.set(k, byName.has(k) ? null : u.id); }
  const out = [];
  const [projects, cards, xflow, crm, renata, meetings] = await Promise.all([
    pool.query(`SELECT id, data->'company'->>'name' AS name, data->'log' AS log FROM projects ${orgId ? 'WHERE org_id=$1' : ''}`, orgId ? [orgId] : []),
    pool.query(`SELECT user_id, kind, occurred_at AS at FROM personal_card_events WHERE user_id = ANY($1::text[]) AND occurred_at >= $2 AND occurred_at < $3`, [ids, from, to]),
    pool.query(`SELECT user_id, type, created_at AS at FROM xflow_events WHERE user_id = ANY($1::text[]) AND created_at >= $2 AND created_at < $3`, [ids, from, to]),
    pool.query(`SELECT actor_id AS user_id, action, entity_type, created_at AS at FROM crm_audit_logs WHERE actor_id = ANY($1::text[]) AND created_at >= $2 AND created_at < $3`, [ids, from, to]),
    pool.query(`SELECT c.user_id, m.created_at AS at FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id WHERE m.role='user' AND c.user_id = ANY($1::text[]) AND m.created_at >= $2 AND m.created_at < $3`, [ids, from, to]),
    pool.query(`SELECT submitted_by AS user_id, created_at AS at FROM meeting_submissions WHERE submitted_by = ANY($1::text[]) AND created_at >= $2 AND created_at < $3`, [ids, from, to]),
  ]);
  let unmatchedLogs = 0;
  for (const p of projects.rows) {
    for (const l of (Array.isArray(p.log) ? p.log : [])) {
      const at = Date.parse(l.ts); if (!(at >= fromMs && at < toMs)) continue;
      const uid = byName.get(String(l.user || '').trim().toLowerCase());
      if (!uid) { unmatchedLogs += 1; continue; }
      out.push({ userId: uid, at, source: 'empresas', projectId: p.id, projectName: p.name || '', label: String(l.action || '').slice(0, 160) });
    }
  }
  const CARD = { step_done: 'Concluiu uma etapa de cartão', done: 'Concluiu um cartão', created: 'Criou um cartão', opened: 'Abriu um cartão' };
  for (const r of cards.rows) out.push({ userId: r.user_id, at: r.at.getTime(), source: 'cartoes', label: CARD[r.kind] || `Cartão: ${r.kind}` });
  for (const r of xflow.rows) out.push({ userId: r.user_id, at: r.at.getTime(), source: 'xflow', label: `XFlow: ${r.type}` });
  for (const r of crm.rows) out.push({ userId: r.user_id, at: r.at.getTime(), source: 'crm', label: `CRM: ${r.action} (${r.entity_type})` });
  for (const r of renata.rows) out.push({ userId: r.user_id, at: r.at.getTime(), source: 'renata', label: 'Pergunta à RENATA' });
  for (const r of meetings.rows) out.push({ userId: r.user_id, at: r.at.getTime(), source: 'reunioes', label: 'Enviou uma transcrição de reunião' });
  return { events: out, unmatchedLogs, projectNames: Object.fromEntries(projects.rows.map((p) => [p.id, p.name || p.id])) };
}

async function loadAccess(ids, fromMs, toMs) {
  const { rows } = await pool.query(
    `SELECT e.id, e.user_id, e.kind, e.at, e.ip, e.city, e.region, e.country, e.user_agent, g.latitude, g.longitude
     FROM user_access_events e LEFT JOIN ip_geo_cache g ON g.ip = e.ip
     WHERE e.user_id = ANY($1::text[]) AND e.at >= $2 AND e.at < $3 ORDER BY e.at ASC`, [ids, new Date(fromMs), new Date(toMs)]);
  return rows.map((r) => ({ id: String(r.id), userId: r.user_id, kind: r.kind, at: r.at.getTime(), ip: r.ip, city: r.city, region: r.region, country: r.country, device: deviceLabel(r.user_agent), lat: r.latitude, lng: r.longitude }));
}

async function loadUsage(ids, fromMs, toMs) {
  const { rows } = await pool.query(
    `SELECT user_id, kind, module, view, project_id, connected_s, active_s, action, at FROM user_usage_events
     WHERE user_id = ANY($1::text[]) AND at >= $2 AND at < $3 ORDER BY at ASC`, [ids, new Date(fromMs), new Date(toMs)]);
  return rows.map((r) => ({ userId: r.user_id, kind: r.kind, module: r.module, view: r.view, projectId: r.project_id, connectedS: r.connected_s, activeS: r.active_s, action: r.action, at: r.at.getTime() }));
}

async function firstSliceAt() {
  const { rows } = await pool.query(`SELECT min(at) AS at FROM user_usage_events WHERE kind='slice'`);
  return rows[0] && rows[0].at ? rows[0].at.getTime() : null;
}

const by = (list, key) => { const m = new Map(); for (const x of list) { const k = typeof key === 'function' ? key(x) : x[key]; const l = m.get(k) || []; l.push(x); m.set(k, l); } return m; };
const sumKeys = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// Cálculo por pessoa. filters.module/projectId valem para o que é medido (fatias); a estimativa não tem módulo.
function computeUser(user, data, filters) {
  const slices = data.usage.filter((u) => u.userId === user.id && u.kind === 'slice' && (!filters.module || u.module === filters.module) && (!filters.projectId || u.projectId === filters.projectId));
  const actions = data.usage.filter((u) => u.userId === user.id && u.kind === 'action' && (!filters.projectId || u.projectId === filters.projectId));
  const access = data.access.filter((a) => a.userId === user.id);
  const presence = access.filter((a) => PRESENCE.has(a.kind));
  const evidence = data.evidence.filter((e) => e.userId === user.id && (!filters.projectId || e.projectId === filters.projectId));
  const sum = summarizeSlices(slices.map((s) => ({ at: s.at, connectedS: s.connectedS, activeS: s.activeS, module: s.module, view: s.view, projectId: s.projectId })));
  const filteredSlices = !!(filters.module || filters.projectId);
  const evidenceTs = (filteredSlices ? [] : [...presence.map((a) => a.at), ...evidence.map((e) => e.at)]);
  const days = combineDays(sum.days, evidenceTs);
  const operations = actions.length + evidence.length;
  return { user, sum, days, presence, access, actions, evidence, operations, evidenceTs, hasSlices: slices.length > 0 };
}

function totals(per) {
  const t = { accesses: 0, realActiveS: 0, realConnectedS: 0, estimatedActiveS: 0, operations: 0, activeUsers: 0 };
  for (const p of per) {
    t.accesses += p.presence.length; t.realActiveS += p.days.realActiveS; t.realConnectedS += p.days.realConnectedS; t.estimatedActiveS += p.days.estimatedActiveS; t.operations += p.operations;
    if (p.presence.length || p.hasSlices || p.evidence.length) t.activeUsers += 1;
  }
  return t;
}

async function gather(req, q, period) {
  const { users, orgId } = await orgUsers(req, { userId: q.userId, profile: q.profile });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { users, orgId, access: [], usage: [], evidence: [], unmatchedLogs: 0, projectNames: {} };
  const [access, usage, ev] = await Promise.all([loadAccess(ids, period.fromMs, period.toMs), loadUsage(ids, period.fromMs, period.toMs), loadEvidence(users, orgId, period.fromMs, period.toMs)]);
  return { users, orgId, access, usage, evidence: ev.events, unmatchedLogs: ev.unmatchedLogs, projectNames: ev.projectNames };
}

router.get('/experience', async (req, res, next) => {
  try {
    const p = parsePeriod(req.query);
    res.json({ from: p.from, to: p.to, ...(await experienceSummary(effectiveOrgId(req), new Date(p.fromMs).toISOString(), new Date(p.toMs).toISOString())) });
  } catch (e) { next(e); }
});

router.get('/policy', (req, res) => res.json({ policy: usagePolicy(), retention: RETENTION }));

router.get('/overview', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    const filters = { module: String(req.query.module || ''), projectId: String(req.query.projectId || '') };
    const [cur, prev, firstSlice] = await Promise.all([
      gather(req, req.query, period),
      gather(req, req.query, { ...period, fromMs: period.prevFromMs, toMs: period.prevToMs }),
      firstSliceAt(),
    ]);
    const per = cur.users.map((u) => computeUser(u, cur, filters));
    const prevPer = prev.users.map((u) => computeUser(u, prev, filters));
    const t = totals(per); const tp = totals(prevPer);
    const ranking = per.map((p) => {
      const idx = activityIndex(p.days.realConnectedS, p.days.realActiveS);
      const last = p.presence.length ? p.presence[p.presence.length - 1].at : (p.evidence.length ? Math.max(...p.evidence.map((e) => e.at)) : null);
      return { userId: p.user.id, name: p.user.name, role: p.user.role, accesses: p.presence.length, activeDays: p.days.rows.filter((r) => r.basis !== BASIS.indisponivel).length, realActiveS: p.days.realActiveS, realConnectedS: p.days.realConnectedS, estimatedActiveS: p.days.estimatedActiveS, activityIndex: idx, operations: p.operations, lastAt: last, basis: p.days.realDays ? (p.days.estimatedDays ? 'misto' : BASIS.real) : (p.days.estimatedDays ? BASIS.estimado : BASIS.indisponivel) };
    }).sort((a, b) => (b.realActiveS + b.estimatedActiveS) - (a.realActiveS + a.estimatedActiveS) || b.operations - a.operations);
    // Série diária consolidada (soma de todas as pessoas filtradas).
    const daily = new Map();
    const dayRow = (d) => { const r = daily.get(d) || { date: d, realActiveS: 0, estimatedActiveS: 0, accesses: 0, operations: 0 }; daily.set(d, r); return r; };
    for (const p of per) {
      for (const r of p.days.rows) { const d = dayRow(r.date); if (r.basis === BASIS.real) d.realActiveS += r.activeS; else if (r.basis === BASIS.estimado) d.estimatedActiveS += r.activeS; }
      for (const a of p.presence) dayRow(dayOf(a.at)).accesses += 1;
      for (const x of [...p.actions, ...p.evidence]) dayRow(dayOf(x.at)).operations += 1;
    }
    const modules = {}; const projects = {}; const heatReal = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const p of per) {
      for (const [m, s] of Object.entries(p.sum.modules)) modules[m] = (modules[m] || 0) + s;
      for (const [id, s] of Object.entries(p.sum.projects)) projects[id] = (projects[id] || 0) + s;
      for (let d = 0; d < 7; d += 1) for (let h = 0; h < 24; h += 1) heatReal[d][h] += p.sum.hours[d][h];
    }
    const opsByProject = {}; for (const p of per) for (const e of p.evidence) if (e.projectId) opsByProject[e.projectId] = (opsByProject[e.projectId] || 0) + 1;
    const estTs = per.flatMap((p) => p.days.rows.filter((r) => r.basis === BASIS.estimado).flatMap((r) => p.evidenceTs.filter((t) => dayOf(t) === r.date)));
    const byProfile = {};
    for (const p of per) { const k = p.user.role; const r = byProfile[k] || { role: k, users: 0, accesses: 0, realActiveS: 0, estimatedActiveS: 0, operations: 0 }; r.users += 1; r.accesses += p.presence.length; r.realActiveS += p.days.realActiveS; r.estimatedActiveS += p.days.estimatedActiveS; r.operations += p.operations; byProfile[k] = r; }
    const allAccess = await loadAccess(cur.users.map((u) => u.id), period.toMs - MAX_DAYS * DAY, period.toMs);
    const alerts = detectAlerts(allAccess.map((a) => ({ ...a, userName: (cur.users.find((u) => u.id === a.userId) || {}).name || '' })), period.toMs).filter((a) => a.at >= period.fromMs);
    const names = cur.projectNames;
    res.json({
      period: { from: period.from, to: period.to },
      coverage: { firstSliceAt: firstSlice ? new Date(firstSlice).toISOString() : null, measuredUsers: per.filter((p) => p.hasSlices).length, totalUsers: per.length, note: firstSlice ? `A medição de tempo começou em ${dayOf(firstSlice)}. Antes disso, o tempo é uma estimativa feita com eventos que já existiam.` : 'A medição de tempo ainda não começou a receber dados. Por enquanto o tempo mostrado é estimativa.', unmatchedLogs: cur.unmatchedLogs },
      kpis: {
        activeUsers: { value: t.activeUsers, prev: tp.activeUsers, change: pctChange(t.activeUsers, tp.activeUsers), basis: BASIS.real },
        accesses: { value: t.accesses, prev: tp.accesses, change: pctChange(t.accesses, tp.accesses), basis: BASIS.real },
        realActiveS: { value: t.realActiveS, prev: tp.realActiveS, change: pctChange(t.realActiveS, tp.realActiveS), basis: t.realActiveS ? BASIS.real : BASIS.indisponivel },
        estimatedActiveS: { value: t.estimatedActiveS, prev: tp.estimatedActiveS, change: pctChange(t.estimatedActiveS, tp.estimatedActiveS), basis: BASIS.estimado },
        activityIndex: { value: activityIndex(t.realConnectedS, t.realActiveS), basis: t.realConnectedS ? BASIS.real : BASIS.indisponivel },
        operations: { value: t.operations, prev: tp.operations, change: pctChange(t.operations, tp.operations), basis: BASIS.real },
      },
      ranking,
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      modules: Object.entries(modules).map(([module, seconds]) => ({ module, seconds })).sort((a, b) => b.seconds - a.seconds),
      projects: [...new Set([...Object.keys(projects), ...Object.keys(opsByProject)])].map((id) => ({ projectId: id, name: names[id] || id, seconds: projects[id] || 0, operations: opsByProject[id] || 0 })).sort((a, b) => (b.seconds + b.operations) - (a.seconds + a.operations)).slice(0, 15),
      heat: { measured: heatReal, estimated: heatFromTimestamps(estTs), measuredTotalS: sumKeys(modules) },
      byProfile: Object.values(byProfile),
      alerts: { total: alerts.length, high: alerts.filter((a) => a.severity === 'alta').length, top: alerts.slice(0, 5).map(publicAlert) },
    });
  } catch (e) { next(e); }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    const q = { ...req.query, userId: req.params.id };
    const data = await gather(req, q, period);
    const user = data.users[0];
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const p = computeUser(user, data, { module: '', projectId: '' });
    const days = p.days.rows.map((r) => {
      const ts = [...p.presence.map((a) => a.at), ...p.evidence.map((e) => e.at)].filter((t) => dayOf(t) === r.date);
      return { date: r.date, basis: r.basis, connectedS: r.connectedS, activeS: r.activeS, activityIndex: r.basis === BASIS.real ? activityIndex(r.connectedS, r.activeS) : null, first: ts.length ? Math.min(...ts) : null, last: ts.length ? Math.max(...ts) : null, accesses: p.presence.filter((a) => dayOf(a.at) === r.date).length, sessions: sessionize(ts).length };
    }).reverse();
    const KIND = { login: 'Entrou no sistema', visit: 'Voltou à sessão', first_use: 'Primeiro uso do dia', login_failed: 'Tentativa de login com senha errada' };
    const ACTION = { export_pdf: 'Exportou PDF', export_excel: 'Exportou Excel', upload_transcript: 'Enviou uma transcrição', upload_file: 'Enviou um arquivo', share_link_create: 'Criou um link de compartilhamento', meeting_submit: 'Enviou uma reunião', search: 'Fez uma busca' };
    const timeline = [
      ...p.access.map((a) => ({ at: a.at, source: 'acesso', label: KIND[a.kind] || a.kind, detail: [a.city, a.region, a.country].filter(Boolean).join(', '), device: a.device })),
      ...p.actions.map((a) => ({ at: a.at, source: 'acao', label: ACTION[a.action] || a.action, detail: data.projectNames[a.projectId] || '' })),
      ...p.evidence.map((e) => ({ at: e.at, source: e.source, label: e.label, detail: e.projectName || '' })),
    ].sort((a, b) => b.at - a.at).slice(0, 300);
    const names = data.projectNames;
    res.json({
      period: { from: period.from, to: period.to },
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
      totals: { realActiveS: p.days.realActiveS, realConnectedS: p.days.realConnectedS, estimatedActiveS: p.days.estimatedActiveS, idleS: p.sum.idleS, activityIndex: activityIndex(p.days.realConnectedS, p.days.realActiveS), accesses: p.presence.length, operations: p.operations, realDays: p.days.realDays, estimatedDays: p.days.estimatedDays },
      days,
      modules: Object.entries(p.sum.modules).map(([module, seconds]) => ({ module, seconds })).sort((a, b) => b.seconds - a.seconds),
      views: Object.entries(p.sum.views).map(([key, seconds]) => ({ key, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 12),
      projects: Object.entries(p.sum.projects).map(([id, seconds]) => ({ projectId: id, name: names[id] || id, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, 12),
      heat: { measured: p.sum.hours, estimated: heatFromTimestamps(p.days.rows.filter((r) => r.basis === BASIS.estimado).flatMap((r) => p.evidenceTs.filter((t) => dayOf(t) === r.date))) },
      timeline,
      tracked: user.role === 'master' || user.role === 'pricetax',
    });
  } catch (e) { next(e); }
});

router.get('/map', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    const { users } = await orgUsers(req, { userId: req.query.userId, profile: req.query.profile });
    const ids = users.map((u) => u.id); const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    let access = await loadAccess(ids, period.fromMs, period.toMs);
    const ips = [...new Set(access.map((a) => a.ip).filter((ip) => ip))];
    if (await backfillCoords(ips)) access = await loadAccess(ids, period.fromMs, period.toMs);
    const withNames = access.map((a) => ({ ...a, userName: names[a.userId] || '' }));
    const presence = withNames.filter((a) => PRESENCE.has(a.kind) || a.kind === 'login_failed');
    const agg = aggregateMap(presence);
    const all = await loadAccess(ids, period.toMs - MAX_DAYS * DAY, period.toMs);
    const alerts = detectAlerts(all.map((a) => ({ ...a, userName: names[a.userId] || '' })), period.toMs).filter((a) => a.at >= period.fromMs && (!req.query.userId || a.userId === req.query.userId));
    const flagged = new Set(); for (const a of alerts) for (const e of a.evidence) if (Number.isFinite(e.lat)) flagged.add(`${e.lat.toFixed(2)},${e.lng.toFixed(2)}`);
    res.json({
      period: { from: period.from, to: period.to },
      accuracy: 'Localização aproximada pelo IP: o ponto marca o centro da cidade informado pelo serviço de geolocalização, com margem de dezenas de quilômetros. Redes móveis, VPN e provedores podem apontar para outra cidade. Não é coordenada exata.',
      points: agg.points.map((p) => ({ ...p, flagged: flagged.has(`${p.lat.toFixed(2)},${p.lng.toFixed(2)}`) })),
      withoutCoords: agg.withoutCoords,
      events: withNames.slice(-200).reverse().map((a) => ({ id: a.id, at: a.at, userId: a.userId, userName: a.userName, kind: a.kind, ip: maskIp(a.ip), city: a.city, region: a.region, country: a.country, device: a.device, hasCoords: Number.isFinite(a.lat) })),
      alerts: alerts.slice(0, 30).map(publicAlert),
    });
  } catch (e) { next(e); }
});

router.get('/alerts', async (req, res, next) => {
  try {
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 30));
    const now = Date.now();
    const { users } = await orgUsers(req, { userId: req.query.userId, profile: req.query.profile });
    const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const all = await loadAccess(users.map((u) => u.id), now - MAX_DAYS * DAY, now + DAY);
    const alerts = detectAlerts(all.map((a) => ({ ...a, userName: names[a.userId] || '' })), now, { recentDays: days });
    res.json({ days, alerts: alerts.slice(0, 100).map(publicAlert), note: 'Alertas são sinais para conferir, não acusações: VPN, viagem, troca de rede e computador novo geram falsos positivos. Cada alerta mostra a regra e a evidência.' });
  } catch (e) { next(e); }
});

function publicAlert(a) {
  return { id: a.id, rule: a.rule, severity: a.severity, at: a.at, userId: a.userId, userName: a.userName, title: a.title, detail: a.detail, evidence: (a.evidence || []).slice(0, 6).map((e) => ({ at: e.at, kind: e.kind, ip: maskIp(e.ip), city: e.city, region: e.region, country: e.country, device: e.device })) };
}
