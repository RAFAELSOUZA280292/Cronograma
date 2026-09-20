// CRM — consultas de atividades (Fase 3). Somente leitura.
import { pool } from '../db.js';
import { companyNameKey } from './text.js';
import { isUuid, todayBR } from './service.js';
import { ACTIVITY_SELECT, ACTIVITY_FROM, mapActivity, ACTIVITY_TYPES } from './activities.js';

const PRIORITY_ORDER = `CASE a.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;

function addDaysISO(dateStr, n) { return new Date(new Date(`${dateStr}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10); }

// Filtros que valem para lista E contadores (situação e faixa ficam de fora
// porque os contadores mostram as faixas todas de uma vez).
function baseFilters(orgId, f, params) {
  const where = ['a.org_id=$1', 'a.deleted_at IS NULL', 'c.deleted_at IS NULL'];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (f.ownerId === 'none') where.push('a.owner_id IS NULL'); else if (f.ownerId) where.push(`a.owner_id=${add(f.ownerId)}`);
  if (f.companyId) where.push(`a.company_id=${add(isUuid(f.companyId) ? f.companyId : '00000000-0000-0000-0000-000000000000')}`);
  if (f.dealId) where.push(`a.deal_id=${add(isUuid(f.dealId) ? f.dealId : '00000000-0000-0000-0000-000000000000')}`);
  if (Object.keys(ACTIVITY_TYPES).includes(f.type)) where.push(`a.activity_type=${add(f.type)}`);
  const q = String(f.q || '').trim();
  if (q) {
    const key = companyNameKey(q);
    const ors = [`lower(a.title) LIKE ${add(`%${q.toLowerCase()}%`)}`];
    if (key) ors.push(`c.name_norm LIKE ${add(`%${key}%`)}`);
    where.push(`(${ors.join(' OR ')})`);
  }
  return where;
}

export async function listActivities(orgId, f = {}) {
  const today = todayBR();
  const week = addDaysISO(today, 7);
  const cParams = [orgId];
  const cWhere = baseFilters(orgId, f, cParams);
  cParams.push(today, week);
  const t = cParams.length - 1;
  const { rows: cnt } = await pool.query(
    `SELECT count(*) FILTER (WHERE a.status='open' AND a.due_date < $${t})::int AS overdue,
            count(*) FILTER (WHERE a.status='open' AND a.due_date = $${t})::int AS today,
            count(*) FILTER (WHERE a.status='open' AND a.due_date > $${t} AND a.due_date <= $${t + 1})::int AS week,
            count(*) FILTER (WHERE a.status='open' AND a.due_date > $${t + 1})::int AS later,
            count(*) FILTER (WHERE a.status='done')::int AS done
     FROM crm_activities a JOIN crm_companies c ON c.id = a.company_id WHERE ${cWhere.join(' AND ')}`, cParams);

  const params = [orgId];
  const where = baseFilters(orgId, f, params);
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const status = ['open', 'done', 'cancelled'].includes(f.status) ? f.status : (f.status === 'all' ? '' : 'open');
  if (status) where.push(`a.status=${add(status)}`);
  const bucket = f.bucket;
  if (bucket === 'overdue') where.push(`a.status='open' AND a.due_date < ${add(today)}`);
  else if (bucket === 'today') where.push(`a.status='open' AND a.due_date = ${add(today)}`);
  else if (bucket === 'week') where.push(`a.status='open' AND a.due_date > ${add(today)} AND a.due_date <= ${add(week)}`);
  else if (bucket === 'later') where.push(`a.status='open' AND a.due_date > ${add(week)}`);
  const order = status === 'open' || !status ? `a.due_date ASC, (a.due_time = '') ASC, a.due_time ASC, ${PRIORITY_ORDER} ASC` : 'COALESCE(a.completed_at, a.updated_at) DESC';
  const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 300);
  const { rows } = await pool.query(
    `SELECT ${ACTIVITY_SELECT}, count(*) OVER() AS total FROM ${ACTIVITY_FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`, params);
  return { total: rows[0] ? Number(rows[0].total) : 0, counts: cnt[0], items: rows.map(mapActivity) };
}

// Abertas primeiro (por data), depois as últimas encerradas — o que a ficha de
// uma empresa ou negócio precisa mostrar sem virar lista infinita.
async function scoped(orgId, column, id, closedLimit = 15) {
  const sel = `SELECT ${ACTIVITY_SELECT} FROM ${ACTIVITY_FROM} WHERE a.org_id=$1 AND a.${column}=$2 AND a.deleted_at IS NULL`;
  const [open, closed] = await Promise.all([
    pool.query(`${sel} AND a.status='open' ORDER BY a.due_date ASC, a.due_time ASC`, [orgId, id]),
    pool.query(`${sel} AND a.status <> 'open' ORDER BY COALESCE(a.completed_at, a.updated_at) DESC LIMIT ${closedLimit}`, [orgId, id]),
  ]);
  return [...open.rows, ...closed.rows].map(mapActivity);
}
export const activitiesForCompany = (orgId, companyId) => scoped(orgId, 'company_id', companyId);
export const activitiesForDeal = (orgId, dealId) => scoped(orgId, 'deal_id', dealId);

// Bloco de atividades da Visão Geral. "Sem próximo passo" = negócio em aberto
// sem nenhuma atividade em aberto — o alerta mais valioso da Fase 3.
export async function activitiesOverview(orgId, userId) {
  const today = todayBR();
  const { rows: c } = await pool.query(
    `SELECT count(*) FILTER (WHERE a.due_date < $2)::int AS overdue, count(*) FILTER (WHERE a.due_date = $2)::int AS today,
            count(*) FILTER (WHERE a.owner_id = $3 AND a.due_date < $2)::int AS mine_overdue, count(*) FILTER (WHERE a.owner_id = $3 AND a.due_date = $2)::int AS mine_today,
            count(*)::int AS open
     FROM crm_activities a JOIN crm_companies co ON co.id = a.company_id
     WHERE a.org_id=$1 AND a.status='open' AND a.deleted_at IS NULL AND co.deleted_at IS NULL`, [orgId, today, userId || '']);
  const { rows: noStep } = await pool.query(
    `SELECT d.id, d.title, d.company_id, co.legal_name AS company_name, s.name AS stage_name, d.value,
            (now() AT TIME ZONE 'America/Sao_Paulo')::date - (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS days_open,
            count(*) OVER() AS total
     FROM crm_deals d JOIN crm_companies co ON co.id = d.company_id JOIN crm_pipeline_stages s ON s.id = d.stage_id
     WHERE d.org_id=$1 AND d.status='open' AND d.deleted_at IS NULL AND co.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM crm_activities a WHERE a.deal_id = d.id AND a.status='open' AND a.deleted_at IS NULL)
     ORDER BY d.created_at ASC LIMIT 6`, [orgId]);
  const { rows: mine } = await pool.query(
    `SELECT ${ACTIVITY_SELECT} FROM ${ACTIVITY_FROM} WHERE a.org_id=$1 AND a.owner_id=$2 AND a.status='open' AND a.deleted_at IS NULL AND c.deleted_at IS NULL AND a.due_date <= $3
     ORDER BY a.due_date ASC, a.due_time ASC LIMIT 6`, [orgId, userId || '', today]);
  return {
    openCount: c[0].open, overdueCount: c[0].overdue, todayCount: c[0].today, mineOverdue: c[0].mine_overdue, mineToday: c[0].mine_today,
    dealsNoNextStep: noStep[0] ? Number(noStep[0].total) : 0,
    dealsNoNextStepList: noStep.map((r) => ({ id: r.id, title: r.title, companyId: r.company_id, companyName: r.company_name, stageName: r.stage_name, value: Number(r.value), daysOpen: Number(r.days_open) })),
    myDue: mine.map(mapActivity),
  };
}
