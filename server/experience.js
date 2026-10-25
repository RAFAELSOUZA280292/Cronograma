import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { FLOWS, OUTCOMES, GOALS } from '../shared/experienceFlows.js';

// Experiência de uso (§97): eventos de FLUXO (nome, resultado, duração, rota de erro) e nota de satisfação de 1 clique. Só equipe é medida
// (mesma regra da Central de Inteligência). Não guarda texto digitado, conteúdo nem mouse; o comentário da nota é opcional e curto e as telas
// agregam por fluxo — nunca mostram "quem". `user_id` existe só para controlar a frequência do pedido de nota.
const TRACKED_ROLES = new Set(['master', 'pricetax']);
const isTracked = (u) => !!u && TRACKED_ROLES.has(u.role);
const ROUTE_RE = /^[a-z0-9_:/.-]{1,60}$/;
const recent = new Map();
const CSAT_COOLDOWN_DAYS = 14; // no máximo um pedido de nota a cada 14 dias por pessoa (respondido ou dispensado)
const CSAT_FLOW_DAYS = 45; // e o mesmo fluxo só volta a perguntar 45 dias depois de respondido

export async function ensureExperienceSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_events (
      id          BIGSERIAL PRIMARY KEY,
      org_id      TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      flow        TEXT NOT NULL,
      outcome     TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      route       TEXT NOT NULL DEFAULT '',
      status      INTEGER NOT NULL DEFAULT 0
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS product_events_org_idx ON product_events(org_id, at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS product_events_user_flow_idx ON product_events(user_id, flow, outcome)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_csat (
      id      BIGSERIAL PRIMARY KEY,
      org_id  TEXT NOT NULL,
      user_id TEXT NOT NULL,
      at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      flow    TEXT NOT NULL,
      score   INTEGER,
      comment TEXT NOT NULL DEFAULT ''
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS product_csat_user_idx ON product_csat(user_id, at DESC)`);
}

export function sanitizeEvents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(0, 30)) {
    if (!e || typeof e !== 'object') continue;
    const flow = String(e.flow || '');
    if (!(flow in FLOWS) && flow !== 'erro_api') continue;
    const outcome = String(e.outcome || '');
    if (!OUTCOMES.includes(outcome)) continue;
    const durationMs = Math.max(0, Math.min(600000, Math.round(Number(e.durationMs) || 0)));
    let route = ''; let status = 0;
    if (flow === 'erro_api') {
      route = String(e.route || ''); if (!ROUTE_RE.test(route)) continue;
      status = Math.round(Number(e.status) || 0); if (status !== 0 && (status < 400 || status > 599)) continue;
    }
    out.push({ flow, outcome, durationMs, route, status });
  }
  return out;
}

export async function recordEvents(user, body) {
  if (!isTracked(user)) return { stored: 0, skipped: 'perfil não monitorado' };
  const now = Date.now();
  const win = (recent.get(user.id) || []).filter((t) => now - t < 60000);
  if (win.length >= 20) { recent.set(user.id, win); return { stored: 0, skipped: 'muitos envios' }; }
  win.push(now); recent.set(user.id, win);
  const ev = sanitizeEvents(body && body.events);
  if (!ev.length) return { stored: 0 };
  const params = []; const tuples = ev.map((e, i) => { params.push(user.orgId, user.id, e.flow, e.outcome, e.durationMs, e.route, e.status); const b = i * 7; return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`; });
  await pool.query(`INSERT INTO product_events (org_id, user_id, flow, outcome, duration_ms, route, status) VALUES ${tuples.join(',')}`, params);
  return { stored: ev.length };
}

// Vale pedir a nota agora? Só equipe, só fluxos conhecidos, depois de `askAfter` execuções bem-sucedidas dela e respeitando a frequência.
export async function csatEligible(user, flow) {
  if (!isTracked(user) || !(flow in FLOWS)) return { ask: false };
  const { rows: last } = await pool.query(`SELECT max(at) AS at FROM product_csat WHERE user_id=$1`, [user.id]);
  if (last[0].at && Date.now() - new Date(last[0].at).getTime() < CSAT_COOLDOWN_DAYS * 86400000) return { ask: false, why: 'cooldown' };
  const { rows: same } = await pool.query(`SELECT max(at) AS at FROM product_csat WHERE user_id=$1 AND flow=$2 AND score IS NOT NULL`, [user.id, flow]);
  if (same[0].at && Date.now() - new Date(same[0].at).getTime() < CSAT_FLOW_DAYS * 86400000) return { ask: false, why: 'respondido' };
  const { rows: n } = await pool.query(`SELECT count(*)::int AS n FROM product_events WHERE user_id=$1 AND flow=$2 AND outcome='ok'`, [user.id, flow]);
  return { ask: n[0].n >= FLOWS[flow].askAfter, label: FLOWS[flow].label };
}

export async function recordCsat(user, body) {
  if (!isTracked(user)) return { stored: false };
  const flow = String((body && body.flow) || '');
  if (!(flow in FLOWS)) return { stored: false, error: 'fluxo desconhecido' };
  const score = body && body.score == null ? null : Math.round(Number(body && body.score));
  if (score !== null && !(score >= 1 && score <= 5)) return { stored: false, error: 'nota inválida' };
  const comment = score !== null && score <= 3 ? String((body && body.comment) || '').trim().replace(/\s+/g, ' ').slice(0, 240) : '';
  await pool.query(`INSERT INTO product_csat (org_id, user_id, flow, score, comment) VALUES ($1,$2,$3,$4,$5)`, [user.orgId, user.id, flow, score, comment]);
  return { stored: true };
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
// Resumo por FLUXO (nunca por pessoa) no período.
export async function summary(orgId, fromIso, toIso) {
  const { rows: ev } = await pool.query(
    `SELECT flow, count(*)::int AS runs, count(*) FILTER (WHERE outcome='ok')::int AS ok, count(*) FILTER (WHERE outcome='error')::int AS errors,
            count(*) FILTER (WHERE outcome='rejected')::int AS rejected, count(*) FILTER (WHERE outcome='undo')::int AS undo,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok' AND duration_ms > 0) AS p50,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok' AND duration_ms > 0) AS p90,
            count(DISTINCT user_id)::int AS people
     FROM product_events WHERE org_id=$1 AND at >= $2 AND at < $3 AND flow <> 'erro_api' GROUP BY flow`, [orgId, fromIso, toIso]);
  const { rows: cs } = await pool.query(
    `SELECT flow, count(score)::int AS n, avg(score)::float AS avg, count(*) FILTER (WHERE score IS NULL)::int AS dismissed,
            count(*) FILTER (WHERE score = 5)::int AS s5, count(*) FILTER (WHERE score = 4)::int AS s4, count(*) FILTER (WHERE score = 3)::int AS s3,
            count(*) FILTER (WHERE score = 2)::int AS s2, count(*) FILTER (WHERE score = 1)::int AS s1
     FROM product_csat WHERE org_id=$1 AND at >= $2 AND at < $3 GROUP BY flow`, [orgId, fromIso, toIso]);
  const { rows: er } = await pool.query(
    `SELECT route, status, count(*)::int AS n FROM product_events WHERE org_id=$1 AND at >= $2 AND at < $3 AND flow='erro_api' GROUP BY route, status ORDER BY n DESC LIMIT 12`, [orgId, fromIso, toIso]);
  const { rows: cm } = await pool.query(
    `SELECT flow, score, comment, at FROM product_csat WHERE org_id=$1 AND at >= $2 AND at < $3 AND comment <> '' ORDER BY at DESC LIMIT 20`, [orgId, fromIso, toIso]);
  const csBy = new Map(cs.map((r) => [r.flow, r]));
  const flows = Object.entries(FLOWS).map(([flow, meta]) => {
    const e = ev.find((r) => r.flow === flow) || { runs: 0, ok: 0, errors: 0, rejected: 0, undo: 0, p50: null, p90: null, people: 0 };
    const c = csBy.get(flow) || { n: 0, avg: null, dismissed: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    return {
      flow, label: meta.label, runs: e.runs, ok: e.ok, errors: e.errors, rejected: e.rejected, undo: e.undo, people: e.people,
      successRate: pct(e.ok, e.runs - e.undo), undoRate: pct(e.undo, e.runs), p50Ms: e.p50 == null ? null : Math.round(e.p50), p90Ms: e.p90 == null ? null : Math.round(e.p90),
      csat: { n: c.n, avg: c.avg == null ? null : Math.round(c.avg * 100) / 100, dismissed: c.dismissed, dist: [c.s1, c.s2, c.s3, c.s4, c.s5] },
    };
  });
  return { goals: GOALS, flows, errorRoutes: er.map((r) => ({ route: r.route, status: r.status, n: r.n })), comments: cm.map((r) => ({ flow: r.flow, label: (FLOWS[r.flow] || {}).label || r.flow, score: r.score, comment: r.comment, at: r.at })) };
}

export const router = Router();
router.use(requireAuth);
router.post('/events', async (req, res, next) => { try { res.json(await recordEvents({ ...req.user, orgId: effectiveOrgId(req) }, req.body)); } catch (e) { next(e); } });
router.get('/csat/eligible', async (req, res, next) => { try { res.json(await csatEligible(req.user, String(req.query.flow || ''))); } catch (e) { next(e); } });
router.post('/csat', async (req, res, next) => { try { res.json(await recordCsat({ ...req.user, orgId: effectiveOrgId(req) }, req.body)); } catch (e) { next(e); } });
