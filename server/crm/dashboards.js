// CRM — painéis da Visão geral por função (§98): Meu dia, Time, Receita. "Contas" reaproveita Q.overview.
// Somente leitura. O que é "meu" vem sempre do usuário da sessão, nunca de parâmetro.
import { pool } from '../db.js';
import { todayBR } from './service.js';
import { DEAL_SELECT, DEAL_FROM, mapDeal } from './deals.js';
import { LOST_REASONS } from './pipeline.js';
import { activitiesOverview } from './activityQueries.js';

const MONTH_BR = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const sum = (list, k) => r2(list.reduce((n, d) => n + (d[k] || 0), 0));
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function openDeals(orgId, ownerId = null) {
  const params = [orgId]; let own = '';
  if (ownerId) { params.push(ownerId); own = ' AND d.owner_id=$2'; }
  const { rows } = await pool.query(`SELECT ${DEAL_SELECT} FROM ${DEAL_FROM} WHERE d.org_id=$1 AND d.status='open' AND d.deleted_at IS NULL AND c.deleted_at IS NULL${own}`, params);
  return rows.map(mapDeal);
}

async function closedTotals(orgId, ownerId = null) {
  const params = [orgId]; let own = '';
  if (ownerId) { params.push(ownerId); own = ' AND d.owner_id=$2'; }
  const { rows } = await pool.query(
    `SELECT d.status, count(*)::int AS n, COALESCE(sum(d.value),0) AS v,
            count(*) FILTER (WHERE (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', ${MONTH_BR})::date)::int AS n_month,
            COALESCE(sum(d.value) FILTER (WHERE (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', ${MONTH_BR})::date),0) AS v_month
     FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
     WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status IN ('won','lost') AND d.closed_at >= now() - interval '90 days'${own} GROUP BY d.status`, params);
  const w = rows.find((r) => r.status === 'won') || { n: 0, v: 0, n_month: 0, v_month: 0 };
  const l = rows.find((r) => r.status === 'lost') || { n: 0, v: 0, n_month: 0, v_month: 0 };
  return {
    won90Count: w.n, won90Value: r2(w.v), wonMonthCount: w.n_month, wonMonthValue: r2(w.v_month), lostMonthCount: l.n_month, lost90Count: l.n,
    conversion90: w.n + l.n ? Math.round((w.n / (w.n + l.n)) * 100) : null, closed90: w.n + l.n,
  };
}

const brief = (d) => ({ id: d.id, title: d.title, companyId: d.companyId, companyName: d.companyName, stageName: d.stageName, value: d.value, expectedCloseDate: d.expectedCloseDate, daysInStage: d.daysInStage, overdue: d.overdue, slaDays: d.slaDays, nextActivityDate: d.nextActivityDate, nextActivityOverdue: d.nextActivityOverdue });
const plus30 = (today) => new Date(new Date(`${today}T12:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10);

// Meu dia: o que a pessoa precisa fazer agora e como estão os negócios dela.
export async function mineOverview(orgId, userId) {
  const today = todayBR();
  const [mine, closed, act, stagesQ] = await Promise.all([
    openDeals(orgId, userId), closedTotals(orgId, userId), activitiesOverview(orgId, userId),
    pool.query(
      `SELECT p.name AS pipeline, s.name AS stage, s.position, count(*)::int AS n, COALESCE(sum(d.value),0) AS v
       FROM crm_deals d JOIN crm_pipeline_stages s ON s.id = d.stage_id JOIN crm_pipelines p ON p.id = d.pipeline_id JOIN crm_companies c ON c.id = d.company_id
       WHERE d.org_id=$1 AND d.owner_id=$2 AND d.status='open' AND d.deleted_at IS NULL AND c.deleted_at IS NULL GROUP BY p.name, s.name, s.position ORDER BY p.name, s.position`, [orgId, userId]),
  ]);
  const noStep = mine.filter((d) => d.noNextStep).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const late = mine.filter((d) => d.nextActivityOverdue);
  const stalled = mine.filter((d) => (d.daysInStage || 0) > 14).sort((a, b) => b.daysInStage - a.daysInStage);
  const sla = mine.filter((d) => d.slaExceeded).sort((a, b) => (b.daysInStage - b.slaDays) - (a.daysInStage - a.slaDays));
  const closing = mine.filter((d) => d.expectedCloseDate && d.expectedCloseDate <= plus30(today)).sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate));
  return {
    lens: 'mine',
    activities: { mineToday: act.mineToday, mineOverdue: act.mineOverdue, myDue: act.myDue },
    deals: {
      openCount: mine.length, openValue: sum(mine, 'value'), weightedValue: sum(mine, 'weightedValue'), openMrr: sum(mine, 'mrr'),
      noNextStepCount: noStep.length, lateStepCount: late.length, stalledCount: stalled.length, slaCount: sla.length, overdueCount: mine.filter((d) => d.overdue).length,
      wonMonthCount: closed.wonMonthCount, wonMonthValue: closed.wonMonthValue, lostMonthCount: closed.lostMonthCount, conversion90: closed.conversion90, closed90: closed.closed90,
      noNextStep: noStep.slice(0, 8).map(brief), late: late.slice(0, 8).map(brief), stalled: stalled.slice(0, 6).map(brief), sla: sla.slice(0, 6).map(brief), closingSoon: closing.slice(0, 8).map(brief),
      byStage: stagesQ.rows.map((r) => ({ pipeline: r.pipeline, stage: r.stage, count: r.n, value: r2(r.v) })),
    },
  };
}

// Time: o funil inteiro e uma linha por responsável, para o gestor ver onde agir.
export async function teamOverview(orgId, userId) {
  const today = todayBR();
  const [open, closed, act, byOwnerClosed, byOwnerAct, lostQ] = await Promise.all([
    openDeals(orgId), closedTotals(orgId), activitiesOverview(orgId, userId),
    pool.query(
      `SELECT COALESCE(d.owner_id,'') AS owner_id,
              count(*) FILTER (WHERE d.status='won')::int AS won_n, COALESCE(sum(d.value) FILTER (WHERE d.status='won'),0) AS won_v,
              count(*) FILTER (WHERE d.status='lost')::int AS lost_n
       FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
       WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status IN ('won','lost')
         AND (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', ${MONTH_BR})::date GROUP BY COALESCE(d.owner_id,'')`, [orgId]),
    pool.query(
      `SELECT COALESCE(a.owner_id,'') AS owner_id, count(*) FILTER (WHERE a.due_date < $2)::int AS overdue, count(*) FILTER (WHERE a.due_date = $2)::int AS today
       FROM crm_activities a JOIN crm_companies co ON co.id = a.company_id
       WHERE a.org_id=$1 AND a.status='open' AND a.deleted_at IS NULL AND co.deleted_at IS NULL GROUP BY COALESCE(a.owner_id,'')`, [orgId, today]),
    pool.query(
      `SELECT d.lost_reason AS reason, count(*)::int AS n, COALESCE(sum(d.value),0) AS v FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
       WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status='lost' AND d.closed_at >= now() - interval '90 days' GROUP BY d.lost_reason ORDER BY count(*) DESC LIMIT 6`, [orgId]),
  ]);
  const { rows: names } = await pool.query(`SELECT id, name FROM users WHERE org_id=$1`, [orgId]);
  const nameOf = new Map(names.map((u) => [u.id, u.name]));
  const rows = new Map();
  const row = (id) => { if (!rows.has(id)) rows.set(id, { ownerId: id, name: id ? (nameOf.get(id) || 'Usuário removido') : 'Sem responsável', openCount: 0, openValue: 0, weightedValue: 0, noNextStep: 0, lateStep: 0, stalled: 0, slaExceeded: 0, activitiesOverdue: 0, activitiesToday: 0, wonMonthCount: 0, wonMonthValue: 0, lostMonthCount: 0 }); return rows.get(id); };
  open.forEach((d) => {
    const r = row(d.ownerId || '');
    r.openCount += 1; r.openValue += d.value; r.weightedValue += d.weightedValue;
    if (d.noNextStep) r.noNextStep += 1; if (d.nextActivityOverdue) r.lateStep += 1; if ((d.daysInStage || 0) > 14) r.stalled += 1; if (d.slaExceeded) r.slaExceeded += 1;
  });
  byOwnerClosed.rows.forEach((x) => { const r = row(x.owner_id); r.wonMonthCount = x.won_n; r.wonMonthValue = r2(x.won_v); r.lostMonthCount = x.lost_n; });
  byOwnerAct.rows.forEach((x) => { const r = row(x.owner_id); r.activitiesOverdue = x.overdue; r.activitiesToday = x.today; });
  const owners = [...rows.values()].map((r) => ({ ...r, openValue: r2(r.openValue), weightedValue: r2(r.weightedValue) }))
    .filter((r) => r.openCount || r.wonMonthCount || r.lostMonthCount || r.activitiesOverdue || r.activitiesToday)
    .sort((a, b) => (b.openValue - a.openValue) || a.name.localeCompare(b.name, 'pt-BR'));
  const stalled = open.filter((d) => (d.daysInStage || 0) > 14).sort((a, b) => b.daysInStage - a.daysInStage);
  const sla = open.filter((d) => d.slaExceeded).sort((a, b) => (b.daysInStage - b.slaDays) - (a.daysInStage - a.slaDays));
  const unowned = open.filter((d) => !d.ownerId);
  return {
    lens: 'team',
    activities: { openCount: act.openCount, overdueCount: act.overdueCount, todayCount: act.todayCount, dealsNoNextStep: act.dealsNoNextStep },
    deals: {
      openCount: open.length, openValue: sum(open, 'value'), weightedValue: sum(open, 'weightedValue'), openMrr: sum(open, 'mrr'),
      wonMonthCount: closed.wonMonthCount, wonMonthValue: closed.wonMonthValue, lostMonthCount: closed.lostMonthCount, conversion90: closed.conversion90, closed90: closed.closed90,
      overdueCount: open.filter((d) => d.overdue).length, stalledCount: stalled.length, slaCount: sla.length, unownedCount: unowned.length, unownedValue: sum(unowned, 'value'),
      stalledDeals: stalled.slice(0, 6).map(brief), slaDeals: sla.slice(0, 6).map(brief),
    },
    owners,
    lostReasons: lostQ.rows.map((x) => ({ reason: x.reason, label: LOST_REASONS[x.reason] || 'Não informado', count: x.n, value: r2(x.v) })),
  };
}

// Receita: MRR, previsão por mês e o que mais pesa no funil. Mostra valor do negócio, não do cliente.
export async function revenueOverview(orgId) {
  const today = todayBR();
  const [open, closed, mrrQ, srcQ] = await Promise.all([
    openDeals(orgId), closedTotals(orgId),
    pool.query(
      `SELECT count(*)::int AS n, COALESCE(sum(d.mrr),0) AS mrr,
              COALESCE(sum(d.mrr) FILTER (WHERE (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', ${MONTH_BR})::date),0) AS mrr_month
       FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status='won' AND d.mrr > 0`, [orgId]),
    pool.query(
      `SELECT COALESCE(NULLIF(d.source,''),'Sem origem') AS source, count(*)::int AS n, COALESCE(sum(d.value),0) AS v FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
       WHERE d.org_id=$1 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.status='won' AND d.closed_at >= now() - interval '90 days' GROUP BY 1 ORDER BY sum(d.value) DESC LIMIT 6`, [orgId]),
  ]);
  const [y, m] = today.split('-').map(Number);
  const buckets = [{ key: 'overdue', label: 'Previsão vencida', tone: 'late' }];
  for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(y, m - 1 + i, 1)); buckets.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` }); }
  buckets.push({ key: 'later', label: 'Depois' }, { key: 'none', label: 'Sem previsão', tone: 'warn' });
  const keys = new Set(buckets.map((b) => b.key));
  const forecast = buckets.map((b) => ({ ...b, count: 0, value: 0, weighted: 0, mrr: 0 }));
  const by = new Map(forecast.map((b) => [b.key, b]));
  open.forEach((d) => {
    const e = d.expectedCloseDate;
    const k = !e ? 'none' : e < today ? 'overdue' : (keys.has(e.slice(0, 7)) ? e.slice(0, 7) : 'later');
    const b = by.get(k); b.count += 1; b.value += d.value; b.weighted += d.weightedValue; b.mrr += d.mrr;
  });
  forecast.forEach((b) => { b.value = r2(b.value); b.weighted = r2(b.weighted); b.mrr = r2(b.mrr); });
  const top = open.slice().sort((a, b) => b.weightedValue - a.weightedValue).slice(0, 8).map((d) => ({ ...brief(d), weightedValue: d.weightedValue, probability: d.probability, ownerName: d.ownerName }));
  return {
    lens: 'revenue',
    mrr: { wonCount: mrrQ.rows[0].n, wonMrr: r2(mrrQ.rows[0].mrr), wonMonthMrr: r2(mrrQ.rows[0].mrr_month), openMrr: sum(open, 'mrr') },
    deals: {
      openCount: open.length, openValue: sum(open, 'value'), weightedValue: sum(open, 'weightedValue'), noValueCount: open.filter((d) => !d.value).length,
      wonMonthCount: closed.wonMonthCount, wonMonthValue: closed.wonMonthValue, won90Value: closed.won90Value, won90Count: closed.won90Count, conversion90: closed.conversion90,
    },
    forecast, topWeighted: top,
    wonBySource: srcQ.rows.map((x) => ({ source: x.source, count: x.n, value: r2(x.v) })),
  };
}

export async function lensOverview(orgId, userId, lens) {
  if (lens === 'mine') return mineOverview(orgId, userId);
  if (lens === 'team') return teamOverview(orgId, userId);
  if (lens === 'revenue') return revenueOverview(orgId);
  return null;
}
