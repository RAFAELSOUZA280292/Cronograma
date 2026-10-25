import { pool } from './db.js';

// Rastreador de uso (Central de Inteligência Operacional). Recebe fatias de tempo do app: quanto tempo a aba ficou visível
// (conectado) e quanto com interação (ativo), em qual módulo/tela/empresa. Nunca recebe conteúdo, texto digitado ou senha:
// só nomes técnicos de módulo/tela, o id da empresa aberta e segundos. Só equipe (master e pricetax) é medida.

const TRACKED_ROLES = new Set(['master', 'pricetax']);
const NAME_RE = /^[a-z0-9_:-]{0,40}$/;
const ID_RE = /^[A-Za-z0-9_-]{0,40}$/;
const MAX_SLICES = 40;
const MAX_SLICE_S = 120;
export const ACTIONS = new Set(['export_pdf', 'export_excel', 'upload_transcript', 'upload_file', 'share_link_create', 'meeting_submit', 'search']);
const recent = new Map();

export function isTracked(user) { return !!user && TRACKED_ROLES.has(user.role); }

export function sanitizeSlices(raw, nowMs = Date.now()) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw.slice(0, MAX_SLICES)) {
    if (!s || typeof s !== 'object') continue;
    const module = String(s.module == null ? '' : s.module); const view = String(s.view == null ? '' : s.view); const projectId = String(s.projectId == null ? '' : s.projectId);
    if (!NAME_RE.test(module) || !NAME_RE.test(view) || !ID_RE.test(projectId)) continue;
    const c = Number(s.connectedS); const a = Number(s.activeS);
    if (!Number.isFinite(c) || !Number.isFinite(a) || c < 0 || a < 0) continue;
    const connectedS = Math.min(MAX_SLICE_S, Math.round(c)); const activeS = Math.min(connectedS, Math.round(a));
    if (connectedS === 0) continue;
    let at = nowMs; const t = Date.parse(s.at);
    if (Number.isFinite(t) && t <= nowMs + 60000 && t >= nowMs - 15 * 60000) at = t;
    out.push({ module, view, projectId, connectedS, activeS, at });
  }
  return out;
}

export function sanitizeActions(raw, nowMs = Date.now()) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw.slice(0, 20)) {
    if (!a || typeof a !== 'object' || !ACTIONS.has(a.action)) continue;
    const module = String(a.module == null ? '' : a.module); const projectId = String(a.projectId == null ? '' : a.projectId);
    if (!NAME_RE.test(module) || !ID_RE.test(projectId)) continue;
    out.push({ action: a.action, module, projectId, at: nowMs });
  }
  return out;
}

// No máximo 20 envios por minuto por pessoa (um app saudável manda 1 por minuto).
function allow(userId, nowMs) {
  const win = (recent.get(userId) || []).filter((t) => nowMs - t < 60000);
  if (win.length >= 20) { recent.set(userId, win); return false; }
  win.push(nowMs); recent.set(userId, win); return true;
}

export async function recordUsage(user, body, nowMs = Date.now()) {
  if (!isTracked(user)) return { stored: 0, skipped: 'perfil não monitorado' };
  if (!allow(user.id, nowMs)) return { stored: 0, skipped: 'muitos envios' };
  const sessionId = typeof (body && body.sessionId) === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(body.sessionId) ? body.sessionId : '';
  const slices = sanitizeSlices(body && body.slices, nowMs); const actions = sanitizeActions(body && body.actions, nowMs);
  const rows = [
    ...slices.map((s) => [user.id, sessionId, 'slice', s.module, s.view, s.projectId, s.connectedS, s.activeS, '', new Date(s.at)]),
    ...actions.map((a) => [user.id, sessionId, 'action', a.module, '', a.projectId, 0, 0, a.action, new Date(a.at)]),
  ];
  if (!rows.length) return { stored: 0 };
  const params = []; const tuples = rows.map((r, i) => { params.push(...r); const b = i * 10; return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`; });
  await pool.query(`INSERT INTO user_usage_events (user_id, session_id, kind, module, view, project_id, connected_s, active_s, action, at) VALUES ${tuples.join(',')}`, params);
  return { stored: rows.length };
}

// Retenção: telemetria de uso 13 meses, acessos 24 meses (configuráveis). Roda na subida e a cada 24 h.
export const RETENTION = {
  usageDays: Math.max(30, Number(process.env.USAGE_RETENTION_DAYS) || 395),
  accessDays: Math.max(90, Number(process.env.ACCESS_RETENTION_DAYS) || 730),
};

export async function purgeTelemetry() {
  const a = await pool.query(`DELETE FROM user_usage_events WHERE at < now() - ($1 || ' days')::interval`, [String(RETENTION.usageDays)]);
  const b = await pool.query(`DELETE FROM user_access_events WHERE at < now() - ($1 || ' days')::interval`, [String(RETENTION.accessDays)]);
  await pool.query(`DELETE FROM product_events WHERE at < now() - ($1 || ' days')::interval`, [String(RETENTION.usageDays)]).catch(() => {});
  await pool.query(`DELETE FROM product_csat WHERE at < now() - ($1 || ' days')::interval`, [String(RETENTION.usageDays)]).catch(() => {});
  return { usage: a.rowCount, access: b.rowCount };
}

export function startRetentionJob() {
  const run = () => purgeTelemetry().then((r) => { if (r.usage || r.access) console.log(`Retenção: removidos ${r.usage} registros de uso e ${r.access} de acesso.`); }).catch((e) => console.error('Retenção: falha', e.message));
  setTimeout(run, 60000).unref();
  setInterval(run, 24 * 3600 * 1000).unref();
}
