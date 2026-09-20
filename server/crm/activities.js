// CRM — atividades e follow-ups (Fase 3, 2026-09-20, PROJECT_CONTEXT.md §56).
// Mesma regra das fases anteriores: toda escrita = dado + auditoria + timeline
// (+ notificação ao responsável) na MESMA transação. A atividade sempre pertence a
// uma empresa; negócio e contato são opcionais e precisam ser DA MESMA empresa.
// Concluir uma ligação/e-mail/reunião/WhatsApp/visita conta como "última
// interação" da empresa; tarefa e follow-up não (são trabalho interno).
import { randomUUID } from 'node:crypto';
import { CrmError } from './errors.js';
import { createNotification } from '../notifications.js';
import {
  sanitize, tx, addAudit, addTimeline, diffApi, mapBySpec, loadCompany, requireUuid, assertUserInOrg, changeSummary, todayBR,
} from './service.js';

export const ACTIVITY_TYPES = { task: 'Tarefa', call: 'Ligação', email: 'E-mail', meeting: 'Reunião', whatsapp: 'WhatsApp', visit: 'Visita', followup: 'Follow-up' };
export const INTERACTION_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'visit'];
export const PRIORITIES = { low: 'Baixa', normal: 'Normal', high: 'Alta' };

export const ACTIVITY_SPEC = [
  { key: 'title', col: 'title', label: 'Título', type: 'text' },
  { key: 'activityType', col: 'activity_type', label: 'Tipo', type: 'enum', values: Object.keys(ACTIVITY_TYPES) },
  { key: 'description', col: 'description', label: 'Descrição', type: 'longtext' },
  { key: 'dueDate', col: 'due_date', label: 'Data', type: 'date' },
  { key: 'dueTime', col: 'due_time', label: 'Horário', type: 'time' },
  { key: 'priority', col: 'priority', label: 'Prioridade', type: 'enum', values: Object.keys(PRIORITIES) },
  { key: 'ownerId', col: 'owner_id', label: 'Responsável', type: 'user' },
  { key: 'contactId', col: 'contact_id', label: 'Contato', type: 'user' },
  { key: 'dealId', col: 'deal_id', label: 'Negócio', type: 'user' },
];

export const ACTIVITY_SELECT = `a.id, a.org_id, a.company_id, a.deal_id, a.contact_id, a.activity_type, a.title, a.description,
  to_char(a.due_date,'YYYY-MM-DD') AS due_date, a.due_time, a.priority, a.status, a.owner_id, a.completed_at, a.completed_by, a.outcome,
  a.created_at, a.updated_at, a.deleted_at,
  c.legal_name AS company_name, d.title AS deal_title, trim(k.first_name || ' ' || k.last_name) AS contact_name,
  u.name AS owner_name, cu.name AS completed_by_name`;
export const ACTIVITY_FROM = `crm_activities a JOIN crm_companies c ON c.id = a.company_id
  LEFT JOIN crm_deals d ON d.id = a.deal_id AND d.deleted_at IS NULL LEFT JOIN crm_contacts k ON k.id = a.contact_id
  LEFT JOIN users u ON u.id = a.owner_id LEFT JOIN users cu ON cu.id = a.completed_by`;

function addDaysISO(dateStr, n) { return new Date(new Date(`${dateStr}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10); }
const brDate = (d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}`;

// overdue = atrasada · today = hoje · week = próximos 7 dias · later = depois.
export function dueBucket(status, dueDate, today = todayBR()) {
  if (status !== 'open') return status;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return dueDate <= addDaysISO(today, 7) ? 'week' : 'later';
}

export function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id, ...mapBySpec(ACTIVITY_SPEC, row), companyId: row.company_id, companyName: row.company_name || '', dealTitle: row.deal_title || '',
    contactName: row.contact_name || '', ownerName: row.owner_name || '', status: row.status, bucket: dueBucket(row.status, row.due_date),
    completedAt: row.completed_at || null, completedByName: row.completed_by_name || '', outcome: row.outcome || '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function loadActivity(db, orgId, id, { lock = false } = {}) {
  const { rows } = await db.query(`SELECT ${ACTIVITY_SELECT} FROM ${ACTIVITY_FROM} WHERE a.id=$1 AND a.org_id=$2 AND a.deleted_at IS NULL ${lock ? 'FOR UPDATE OF a' : ''}`, [id, orgId]);
  return rows[0] || null;
}

async function assertDealOfCompany(c, orgId, dealId, companyId) {
  if (!dealId) return;
  const { rows } = await c.query('SELECT 1 FROM crm_deals WHERE id=$1 AND org_id=$2 AND company_id=$3 AND deleted_at IS NULL', [dealId, orgId, companyId]);
  if (!rows[0]) throw new CrmError(400, 'O negócio precisa ser da mesma empresa da atividade.');
}
async function assertContactOfCompany(c, orgId, contactId, companyId) {
  if (!contactId) return;
  const { rows } = await c.query('SELECT 1 FROM crm_contacts WHERE id=$1 AND org_id=$2 AND company_id=$3 AND deleted_at IS NULL', [contactId, orgId, companyId]);
  if (!rows[0]) throw new CrmError(400, 'O contato precisa ser da mesma empresa da atividade.');
}

async function actorInOrg(c, orgId, actor) {
  if (!actor.id) return null;
  const { rows } = await c.query('SELECT 1 FROM users WHERE id=$1 AND org_id=$2', [actor.id, orgId]);
  return rows[0] ? actor.id : null;
}

// Quem recebe uma atividade de outra pessoa precisa ficar sabendo (Central de
// Notificações existente). Quem atribui a si mesmo não é avisado.
async function notifyAssigned(c, orgId, actor, api, ownerId) {
  if (!ownerId || ownerId === actor.id) return;
  await createNotification(c, {
    orgId, userId: ownerId, type: 'crm_activity_assigned', actorName: actor.name,
    title: 'Nova atividade no CRM',
    body: `${actor.name} atribuiu a você: "${api.title}" — ${api.companyName}, ${api.dueDate === todayBR() ? 'para hoje' : `para ${brDate(api.dueDate)}`}.`,
    target: { kind: 'crm_activity', companyId: api.companyId, dealId: api.dealId || null, activityId: api.id },
  });
}

const lc = (s) => String(s).toLowerCase();

export async function createActivity(orgId, actor, input, { alreadyDone = false } = {}) {
  const src = input || {};
  const { values, errors } = sanitize(ACTIVITY_SPEC, src);
  if (!values.title) errors.push('Informe o título da atividade.');
  if (!values.due_date) errors.push('Informe a data.');
  requireUuid(src.companyId, 'Empresa');
  const today = todayBR();
  if (alreadyDone && values.due_date && values.due_date > today) errors.push('Uma atividade já realizada não pode ter data no futuro.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  const id = randomUUID();
  return tx(async (c) => {
    const company = await loadCompany(c, orgId, src.companyId);
    if (!company) throw new CrmError(404, 'Empresa não encontrada.');
    await assertDealOfCompany(c, orgId, values.deal_id, company.id);
    await assertContactOfCompany(c, orgId, values.contact_id, company.id);
    if (src.ownerId === undefined) values.owner_id = await actorInOrg(c, orgId, actor); else await assertUserInOrg(c, orgId, values.owner_id);
    const outcome = alreadyDone ? String(src.outcome || '').trim().slice(0, 3000) : '';
    // Já vencida/de hoje na criação: quem criou sabe — não precisa do lembrete do agendador.
    const notified = alreadyDone || values.due_date <= today;
    const names = Object.keys(values);
    const n = names.length;
    const [st, du, ac, oc] = [n + 4, n + 5, n + 6, n + 7];
    await c.query(
      `INSERT INTO crm_activities (id, org_id, company_id, ${names.join(', ')}, status, completed_at, completed_by, outcome, due_notified_at, created_by, updated_by)
       VALUES ($1,$2,$3, ${names.map((_, i) => `$${i + 4}`).join(', ')}, $${st}::text,
               CASE WHEN $${st}::text = 'done' THEN ($${du}::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo' END,
               CASE WHEN $${st}::text = 'done' THEN $${ac}::text END, $${oc}::text, ${notified ? 'now()' : 'NULL'}, $${ac}::text, $${ac}::text)`,
      [id, orgId, company.id, ...names.map((k) => values[k]), alreadyDone ? 'done' : 'open', values.due_date, actor.id || null, outcome]);
    const api = mapActivity(await loadActivity(c, orgId, id));
    await addAudit(c, { orgId, entityType: 'activity', entityId: id, action: 'create', actor,
      changes: [...ACTIVITY_SPEC.filter((f) => api[f.key] != null && api[f.key] !== '').map((f) => ({ field: f.key, label: f.label, from: null, to: api[f.key] })), ...(alreadyDone ? [{ field: 'status', label: 'Situação', from: null, to: 'done' }] : [])] });
    const type = lc(ACTIVITY_TYPES[api.activityType]);
    const summary = alreadyDone
      ? `${actor.name} registrou ${type} realizada: "${api.title}" (${brDate(api.dueDate)})${outcome ? ` — ${outcome.length > 140 ? `${outcome.slice(0, 140)}…` : outcome}` : ''}.`
      : `${actor.name} agendou ${type} "${api.title}" para ${brDate(api.dueDate)}${api.ownerId && api.ownerId !== actor.id ? ` (responsável: ${api.ownerName})` : ''}.`;
    await addTimeline(c, { orgId, companyId: company.id, entityType: 'activity', entityId: id, eventType: alreadyDone ? 'activity_completed' : 'activity_created', actor, summary,
      data: { activityId: id, dealId: api.dealId, activityType: api.activityType } });
    if (!alreadyDone) await notifyAssigned(c, orgId, actor, api, api.ownerId);
    return api;
  });
}

export async function updateActivity(orgId, actor, id, input) {
  requireUuid(id, 'Atividade');
  const src = input || {};
  const { values, errors } = sanitize(ACTIVITY_SPEC, src, { partial: true });
  if ('title' in values && !values.title) errors.push('O título não pode ficar vazio.');
  if ('due_date' in values && !values.due_date) errors.push('A data não pode ficar vazia.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  return tx(async (c) => {
    const row = await loadActivity(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Atividade não encontrada.');
    if (row.status !== 'open') throw new CrmError(409, 'Só dá para editar atividade em aberto. Reabra-a antes.');
    const before = mapActivity(row);
    const after = { ...before };
    ACTIVITY_SPEC.forEach((f) => { if (f.col in values) after[f.key] = values[f.col]; });
    if ('owner_id' in values) await assertUserInOrg(c, orgId, values.owner_id);
    if ('deal_id' in values) await assertDealOfCompany(c, orgId, values.deal_id, row.company_id);
    if ('contact_id' in values) await assertContactOfCompany(c, orgId, values.contact_id, row.company_id);
    const changes = diffApi(ACTIVITY_SPEC, before, after);
    if (!changes.length) return before;
    const sets = [];
    const params = [];
    changes.forEach((ch) => {
      const f = ACTIVITY_SPEC.find((x) => x.key === ch.field);
      params.push(after[ch.field] === '' && ['date', 'user'].includes(f.type) ? null : after[ch.field]);
      sets.push(`${f.col}=$${params.length}`);
    });
    const dueChanged = changes.some((ch) => ch.field === 'dueDate');
    if (dueChanged) sets.push(after.dueDate <= todayBR() ? 'due_notified_at=now()' : 'due_notified_at=NULL');
    params.push(actor.id || null); sets.push(`updated_by=$${params.length}`);
    params.push(id);
    await c.query(`UPDATE crm_activities SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await addAudit(c, { orgId, entityType: 'activity', entityId: id, action: 'update', changes, actor });
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'activity', entityId: id, eventType: 'activity_updated', actor,
      summary: `${actor.name} alterou a atividade "${after.title}": ${changeSummary(ACTIVITY_SPEC, changes)}.`, data: { activityId: id, changes } });
    const api = mapActivity(await loadActivity(c, orgId, id));
    if (changes.some((ch) => ch.field === 'ownerId')) await notifyAssigned(c, orgId, actor, api, api.ownerId);
    return api;
  });
}

async function transition(orgId, actor, id, { from, to, fn }) {
  requireUuid(id, 'Atividade');
  return tx(async (c) => {
    const row = await loadActivity(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Atividade não encontrada.');
    if (!from.includes(row.status)) throw new CrmError(409, fn.conflict);
    await fn.apply(c, row);
    await addAudit(c, { orgId, entityType: 'activity', entityId: id, action: to, changes: [{ field: 'status', label: 'Situação', from: row.status, to }, ...(fn.extraChanges || [])], actor });
    const api = mapActivity(await loadActivity(c, orgId, id));
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'activity', entityId: id, eventType: fn.event, actor, summary: fn.summary(api), data: { activityId: id, dealId: api.dealId, activityType: api.activityType } });
    return api;
  });
}

// Concluir uma ligação/reunião/e-mail/etc. registra o resultado — é o "pós-reunião" da Fase 3.
export async function completeActivity(orgId, actor, id, { outcome = '' } = {}) {
  const text = String(outcome || '').trim().slice(0, 3000);
  return transition(orgId, actor, id, {
    from: ['open'], to: 'done',
    fn: {
      conflict: 'Esta atividade não está em aberto.', event: 'activity_completed',
      extraChanges: text ? [{ field: 'outcome', label: 'Resultado', from: null, to: text }] : [],
      apply: (c, row) => c.query(`UPDATE crm_activities SET status='done', completed_at=now(), completed_by=$1, outcome=$2, updated_at=now(), updated_by=$1 WHERE id=$3`, [actor.id || null, text, row.id]),
      summary: (a) => `${actor.name} concluiu ${lc(ACTIVITY_TYPES[a.activityType])} "${a.title}"${text ? ` — ${text.length > 140 ? `${text.slice(0, 140)}…` : text}` : ''}.`,
    },
  });
}

export async function cancelActivity(orgId, actor, id) {
  return transition(orgId, actor, id, {
    from: ['open'], to: 'cancelled',
    fn: {
      conflict: 'Esta atividade não está em aberto.', event: 'activity_cancelled',
      apply: (c, row) => c.query(`UPDATE crm_activities SET status='cancelled', updated_at=now(), updated_by=$1 WHERE id=$2`, [actor.id || null, row.id]),
      summary: (a) => `${actor.name} cancelou a atividade "${a.title}".`,
    },
  });
}

export async function reopenActivity(orgId, actor, id) {
  return transition(orgId, actor, id, {
    from: ['done', 'cancelled'], to: 'open',
    fn: {
      conflict: 'Esta atividade já está em aberto.', event: 'activity_reopened',
      apply: (c, row) => c.query(
        `UPDATE crm_activities SET status='open', completed_at=NULL, completed_by=NULL, outcome='', due_notified_at=CASE WHEN due_date <= $3::date THEN now() ELSE NULL END, updated_at=now(), updated_by=$1 WHERE id=$2`,
        [actor.id || null, row.id, todayBR()]),
      summary: (a) => `${actor.name} reabriu a atividade "${a.title}".`,
    },
  });
}

export async function deleteActivity(orgId, actor, id) {
  requireUuid(id, 'Atividade');
  return tx(async (c) => {
    const row = await loadActivity(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Atividade não encontrada.');
    await c.query('UPDATE crm_activities SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'activity', entityId: id, action: 'delete', actor });
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'activity', entityId: id, eventType: 'activity_deleted', actor, summary: `${actor.name} excluiu a atividade "${row.title}".`, data: { activityId: id } });
    return { ok: true };
  });
}
