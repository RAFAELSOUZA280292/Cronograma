// CRM — consultas de negócios/pipeline (Fase 2). Somente leitura.
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { companyNameKey } from './text.js';
import { isUuid, todayBR } from './service.js';
import { ensureDefaultPipeline, LOST_REASONS } from './pipeline.js';
import { DEAL_SELECT, DEAL_FROM, mapDeal, fetchDeal } from './deals.js';

const PROB = `(CASE d.status WHEN 'won' THEN 100 WHEN 'lost' THEN 0 ELSE COALESCE(d.probability_override, s.probability) END)`;
const WEIGHTED = `(d.value * ${PROB} / 100.0)`;
const BOARD_CLOSED_DAYS = 60;

function dealFilters(orgId, f, params) {
  const where = ['d.org_id=$1', 'd.deleted_at IS NULL', 'c.deleted_at IS NULL'];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (['new', 'upsell'].includes(f.type)) where.push(`d.deal_type=${add(f.type)}`);
  if (f.ownerId === 'none') where.push('d.owner_id IS NULL'); else if (f.ownerId) where.push(`d.owner_id=${add(f.ownerId)}`);
  if (f.companyId) where.push(`d.company_id=${add(isUuid(f.companyId) ? f.companyId : '00000000-0000-0000-0000-000000000000')}`);
  const q = String(f.q || '').trim();
  if (q) {
    const key = companyNameKey(q);
    const ors = [`lower(d.title) LIKE ${add(`%${q.toLowerCase()}%`)}`];
    if (key) ors.push(`c.name_norm LIKE ${add(`%${key}%`)}`);
    where.push(`(${ors.join(' OR ')})`);
  }
  return where;
}

export async function listDeals(orgId, f = {}) {
  const params = [orgId];
  const where = dealFilters(orgId, f, params);
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const status = ['open', 'won', 'lost'].includes(f.status) ? f.status : (f.status === 'all' ? '' : 'open');
  if (status) where.push(`d.status=${add(status)}`);
  if (f.stageId && isUuid(f.stageId)) where.push(`d.stage_id=${add(f.stageId)}`);
  const order = { value: 'd.value DESC', close: 'd.expected_close_date ASC NULLS LAST', stage: 's.position ASC, d.board_order ASC' }[f.sort] || 'd.updated_at DESC';
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT ${DEAL_SELECT}, count(*) OVER() AS total, sum(d.value) OVER() AS total_value, sum(${WEIGHTED}) OVER() AS total_weighted
     FROM ${DEAL_FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  return {
    total: rows[0] ? Number(rows[0].total) : 0, totalValue: rows[0] ? Number(rows[0].total_value) : 0, totalWeighted: rows[0] ? Math.round(Number(rows[0].total_weighted) * 100) / 100 : 0,
    items: rows.map(mapDeal),
  };
}

// Quadro: negócios em aberto + os fechados nos últimos 60 dias (senão as colunas
// Ganho/Perdido cresceriam pra sempre). A lista mostra tudo.
export async function getBoard(orgId, f = {}) {
  const pipeline = await ensureDefaultPipeline(orgId);
  const params = [orgId];
  const where = dealFilters(orgId, f, params);
  where.push(`(d.status='open' OR d.closed_at >= now() - interval '${BOARD_CLOSED_DAYS} days')`);
  const { rows } = await pool.query(`SELECT ${DEAL_SELECT} FROM ${DEAL_FROM} WHERE ${where.join(' AND ')} ORDER BY d.board_order ASC, d.created_at ASC`, params);
  const deals = rows.map(mapDeal);
  return {
    pipeline: { id: pipeline.id, name: pipeline.name }, closedWindowDays: BOARD_CLOSED_DAYS,
    stages: pipeline.stages.map((s) => {
      const list = deals.filter((d) => d.stageId === s.id);
      return { ...s, count: list.length, value: list.reduce((n, d) => n + d.value, 0), weighted: Math.round(list.reduce((n, d) => n + d.weightedValue, 0) * 100) / 100, deals: list };
    }),
  };
}

export async function getPipeline(orgId) {
  const p = await ensureDefaultPipeline(orgId);
  return { pipeline: { id: p.id, name: p.name }, stages: p.stages, lostReasons: Object.entries(LOST_REASONS).map(([value, label]) => ({ value, label })) };
}

export async function getDealDetail(orgId, id) {
  if (!isUuid(id)) throw new CrmError(404, 'Negócio não encontrado.');
  const deal = await fetchDeal(pool, orgId, id);
  if (!deal) throw new CrmError(404, 'Negócio não encontrado.');
  const [hist, tl, notes, pipe] = await Promise.all([
    pool.query('SELECT id, from_stage_name, to_stage_name, days_in_from, actor_name, moved_at FROM crm_deal_stage_history WHERE deal_id=$1 ORDER BY moved_at, id', [id]),
    pool.query(`SELECT id, event_type, summary, actor_name, occurred_at FROM crm_timeline_events WHERE org_id=$1 AND entity_type='deal' AND entity_id=$2 ORDER BY occurred_at DESC, created_at DESC LIMIT 60`, [orgId, id]),
    pool.query(`SELECT n.id, n.body, n.created_at, n.created_by, u.name AS created_by_name FROM crm_notes n LEFT JOIN users u ON u.id = n.created_by
                WHERE n.org_id=$1 AND n.entity_type='deal' AND n.entity_id=$2 AND n.deleted_at IS NULL ORDER BY n.created_at DESC`, [orgId, id]),
    getPipeline(orgId),
  ]);
  return {
    deal,
    stageHistory: hist.rows.map((r) => ({ id: r.id, from: r.from_stage_name, to: r.to_stage_name, daysInFrom: r.days_in_from == null ? null : Number(r.days_in_from), actorName: r.actor_name, movedAt: r.moved_at })),
    timeline: tl.rows.map((r) => ({ id: r.id, eventType: r.event_type, summary: r.summary, actorName: r.actor_name, occurredAt: r.occurred_at })),
    notes: notes.rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, createdBy: r.created_by, createdByName: r.created_by_name || '' })),
    stages: pipe.stages, lostReasons: pipe.lostReasons,
  };
}

export async function dealsForCompany(orgId, companyId) {
  const { rows } = await pool.query(
    `SELECT ${DEAL_SELECT} FROM ${DEAL_FROM} WHERE d.org_id=$1 AND d.company_id=$2 AND d.deleted_at IS NULL
     ORDER BY (d.status='open') DESC, d.updated_at DESC`, [orgId, companyId]);
  return rows.map(mapDeal);
}

// Bloco de negócios da Visão Geral. "Parado" = em aberto e sem mudar de etapa há
// mais de 14 dias; "vencido" = previsão de fechamento no passado.
export async function dealsOverview(orgId) {
  const today = todayBR();
  const { rows: open } = await pool.query(`SELECT ${DEAL_SELECT} FROM ${DEAL_FROM} WHERE d.org_id=$1 AND d.status='open' AND d.deleted_at IS NULL AND c.deleted_at IS NULL`, [orgId]);
  const deals = open.map(mapDeal);
  const sum = (list, k) => Math.round(list.reduce((n, d) => n + d[k], 0) * 100) / 100;
  const upsell = deals.filter((d) => d.dealType === 'upsell');
  const { rows: closed } = await pool.query(
    `SELECT d.status, count(*)::int AS n, COALESCE(sum(d.value),0) AS v,
            count(*) FILTER (WHERE (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date)::int AS n_month,
            COALESCE(sum(d.value) FILTER (WHERE (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date),0) AS v_month
     FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
     WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status IN ('won','lost') AND d.closed_at >= now() - interval '90 days' GROUP BY d.status`, [orgId]);
  const won = closed.find((r) => r.status === 'won') || { n: 0, v: 0, n_month: 0, v_month: 0 };
  const lost = closed.find((r) => r.status === 'lost') || { n: 0, v: 0, n_month: 0, v_month: 0 };
  const brief = (d) => ({ id: d.id, title: d.title, companyId: d.companyId, companyName: d.companyName, stageName: d.stageName, value: d.value, expectedCloseDate: d.expectedCloseDate, daysInStage: d.daysInStage, dealType: d.dealType, overdue: d.overdue });
  const closing = deals.filter((d) => d.expectedCloseDate && d.expectedCloseDate <= new Date(new Date(`${today}T12:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10))
    .sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate));
  const stalled = deals.filter((d) => (d.daysInStage || 0) > 14).sort((a, b) => b.daysInStage - a.daysInStage);
  return {
    openCount: deals.length, openValue: sum(deals, 'value'), weightedValue: sum(deals, 'weightedValue'),
    upsellCount: upsell.length, upsellValue: sum(upsell, 'value'),
    wonMonthCount: won.n_month, wonMonthValue: Number(won.v_month), lostMonthCount: lost.n_month,
    conversion90: won.n + lost.n ? Math.round((won.n / (won.n + lost.n)) * 100) : null, closed90: won.n + lost.n,
    overdueCount: deals.filter((d) => d.overdue).length, stalledCount: stalled.length, noValueCount: deals.filter((d) => !d.value).length,
    closingSoon: closing.slice(0, 6).map(brief), stalledDeals: stalled.slice(0, 6).map(brief),
  };
}

export async function searchDeals(orgId, qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  const key = companyNameKey(q);
  const params = [orgId, `%${q}%`];
  let clause = 'lower(d.title) LIKE $2';
  if (key) { params.push(`%${key}%`); clause += ` OR c.name_norm LIKE $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.status, d.value, s.name AS stage_name, c.legal_name AS company_name FROM ${DEAL_FROM}
     WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND (${clause}) ORDER BY d.updated_at DESC LIMIT 8`, params);
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, value: Number(r.value), stageName: r.stage_name, companyName: r.company_name }));
}
