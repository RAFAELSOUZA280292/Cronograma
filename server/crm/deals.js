// CRM — negócios (Fase 2, 2026-09-20, PROJECT_CONTEXT.md §55). Mesma regra da
// Fase 1: toda escrita = dado + auditoria + timeline (+ histórico de etapa) na
// MESMA transação. O negócio sempre pertence a uma empresa; "Lead" é a 1ª etapa
// dele, então uma empresa pode ter vários negócios (e um cliente pode ter um
// negócio de upsell) sem mudar o cadastro da empresa.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { ensureDefaultPipeline, DEAL_TYPES, DEAL_TYPE_LABELS, LOST_REASONS } from './pipeline.js';
import {
  sanitize, tx, addAudit, addTimeline, diffApi, mapBySpec, loadCompany, requireUuid, assertUserInOrg, changeSummary, todayBR, RELATIONSHIP_LABELS,
} from './service.js';

export const DEAL_SPEC = [
  { key: 'title', col: 'title', label: 'Título', type: 'text' },
  { key: 'dealType', col: 'deal_type', label: 'Tipo', type: 'enum', values: DEAL_TYPES },
  { key: 'value', col: 'value', label: 'Valor', type: 'number' },
  { key: 'expectedCloseDate', col: 'expected_close_date', label: 'Previsão de fechamento', type: 'date' },
  { key: 'probabilityOverride', col: 'probability_override', label: 'Probabilidade manual (%)', type: 'int' },
  { key: 'ownerId', col: 'owner_id', label: 'Responsável', type: 'user' },
  { key: 'primaryContactId', col: 'primary_contact_id', label: 'Contato principal', type: 'user' },
  { key: 'source', col: 'source', label: 'Origem', type: 'text' },
  { key: 'description', col: 'description', label: 'Descrição', type: 'longtext' },
];

export const DEAL_SELECT = `d.id, d.org_id, d.company_id, d.pipeline_id, d.stage_id, d.title, d.deal_type, d.value,
  to_char(d.expected_close_date,'YYYY-MM-DD') AS expected_close_date, d.probability_override, d.owner_id, d.primary_contact_id, d.source, d.description,
  d.status, d.lost_reason, d.lost_detail, d.closed_at, d.stage_entered_at, d.board_order, d.created_at, d.updated_at, d.deleted_at,
  to_char(d.stage_entered_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS stage_entered_date,
  s.name AS stage_name, s.probability AS stage_probability, s.kind AS stage_kind, s.color AS stage_color, s.position AS stage_position,
  c.legal_name AS company_name, c.trade_name AS company_trade_name, c.relationship AS company_relationship,
  (SELECT count(*)::int FROM crm_activities ax WHERE ax.deal_id = d.id AND ax.status = 'open' AND ax.deleted_at IS NULL) AS open_activities,
  (SELECT to_char(min(ax.due_date),'YYYY-MM-DD') FROM crm_activities ax WHERE ax.deal_id = d.id AND ax.status = 'open' AND ax.deleted_at IS NULL) AS next_activity_date,
  (SELECT name FROM users u WHERE u.id = d.owner_id) AS owner_name,
  (SELECT trim(k.first_name || ' ' || k.last_name) FROM crm_contacts k WHERE k.id = d.primary_contact_id) AS contact_name`;
export const DEAL_FROM = `crm_deals d JOIN crm_pipeline_stages s ON s.id = d.stage_id JOIN crm_companies c ON c.id = d.company_id`;

function daysBetween(fromDate, toDate) {
  if (!fromDate) return null;
  const a = new Date(`${toDate}T12:00:00Z`).getTime();
  const b = new Date(`${String(fromDate).slice(0, 10)}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((a - b) / 86400000));
}

export function brl(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export function mapDeal(row) {
  if (!row) return null;
  const today = todayBR();
  const spec = mapBySpec(DEAL_SPEC, row);
  const open = row.status === 'open';
  const probability = row.status === 'won' ? 100 : row.status === 'lost' ? 0 : (row.probability_override != null ? row.probability_override : row.stage_probability);
  return {
    id: row.id, ...spec, value: Number(row.value || 0),
    companyId: row.company_id, companyName: row.company_name || '', companyTradeName: row.company_trade_name || '', companyRelationship: row.company_relationship || '',
    pipelineId: row.pipeline_id, stageId: row.stage_id, stageName: row.stage_name, stageKind: row.stage_kind, stageColor: row.stage_color, stagePosition: row.stage_position,
    status: row.status, probability, weightedValue: Math.round(Number(row.value || 0) * probability) / 100,
    ownerName: row.owner_name || '', contactName: row.contact_name || '',
    lostReason: row.lost_reason || '', lostReasonLabel: LOST_REASONS[row.lost_reason] || '', lostDetail: row.lost_detail || '',
    closedAt: row.closed_at || null, stageEnteredAt: row.stage_entered_at, daysInStage: daysBetween(row.stage_entered_date, today),
    overdue: open && !!row.expected_close_date && row.expected_close_date < today,
    openActivities: row.open_activities || 0, nextActivityDate: row.next_activity_date || null, nextActivityOverdue: !!row.next_activity_date && row.next_activity_date < today,
    noNextStep: open && !row.open_activities,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at || null,
  };
}

export async function loadDeal(db, orgId, id, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${DEAL_SELECT} FROM ${DEAL_FROM} WHERE d.id=$1 AND d.org_id=$2 AND d.deleted_at IS NULL ${lock ? 'FOR UPDATE OF d' : ''}`, [id, orgId]);
  return rows[0] || null;
}

export async function loadItems(db, dealId) {
  const { rows } = await db.query('SELECT id, product_id, name, quantity, unit_price FROM crm_deal_items WHERE deal_id=$1 ORDER BY position', [dealId]);
  return rows.map((r) => ({ id: r.id, productId: r.product_id, name: r.name, quantity: Number(r.quantity), unitPrice: Number(r.unit_price), total: Math.round(Number(r.quantity) * Number(r.unit_price) * 100) / 100 }));
}

export const itemsSummary = (items) => items.map((i) => `${i.name} ×${i.quantity} (${brl(i.unitPrice)})`).join('; ');
const round2 = (n) => Math.round(n * 100) / 100;
const sumItems = (items) => round2(items.reduce((n, i) => n + i.quantity * i.unitPrice, 0));

// Valida e resolve os itens contra o catálogo da org. Produto inativo só entra
// se já estava no negócio (`keep`); o nome do item é um retrato do momento.
async function resolveItems(c, orgId, raw, keep = new Set()) {
  if (!Array.isArray(raw)) throw new CrmError(400, 'Lista de produtos inválida.');
  if (raw.length > 30) throw new CrmError(400, 'Máximo de 30 produtos por negócio.');
  const ids = raw.map((i) => i && i.productId).filter(Boolean);
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(String(id)))) throw new CrmError(400, 'Produto inválido.');
  const { rows } = ids.length ? await c.query('SELECT id, name, list_price, active FROM crm_products WHERE org_id=$1 AND deleted_at IS NULL AND id = ANY($2::uuid[])', [orgId, ids]) : { rows: [] };
  const byId = new Map(rows.map((r) => [r.id, r]));
  return raw.map((i) => {
    const p = i.productId ? byId.get(i.productId) : null;
    if (i.productId && !p) throw new CrmError(400, 'Produto não encontrado no catálogo.');
    if (p && !p.active && !keep.has(p.id)) throw new CrmError(400, `O produto "${p.name}" está inativo.`);
    const name = String(i.name || (p && p.name) || '').trim().slice(0, 200);
    if (!name) throw new CrmError(400, 'Todo item precisa de um nome ou de um produto do catálogo.');
    const quantity = i.quantity == null || i.quantity === '' ? 1 : Number(i.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new CrmError(400, `Quantidade inválida em "${name}".`);
    const price = i.unitPrice == null || i.unitPrice === '' ? (p && p.list_price != null ? Number(p.list_price) : 0) : Number(String(i.unitPrice).includes(',') ? String(i.unitPrice).replace(/\./g, '').replace(',', '.') : i.unitPrice);
    if (!Number.isFinite(price) || price < 0) throw new CrmError(400, `Preço inválido em "${name}".`);
    return { productId: p ? p.id : null, name, quantity: round2(quantity), unitPrice: round2(price) };
  });
}

async function writeItems(c, orgId, dealId, items) {
  await c.query('DELETE FROM crm_deal_items WHERE deal_id=$1', [dealId]);
  for (let i = 0; i < items.length; i += 1) {
    await c.query('INSERT INTO crm_deal_items (id, org_id, deal_id, product_id, name, quantity, unit_price, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), orgId, dealId, items[i].productId, items[i].name, items[i].quantity, items[i].unitPrice, i]);
  }
}

async function assertContactOfCompany(c, orgId, contactId, companyId) {
  if (!contactId) return;
  const { rows } = await c.query('SELECT 1 FROM crm_contacts WHERE id=$1 AND org_id=$2 AND company_id=$3 AND deleted_at IS NULL', [contactId, orgId, companyId]);
  if (!rows[0]) throw new CrmError(400, 'O contato precisa ser da mesma empresa do negócio.');
}

function checkProbability(values, errors) {
  const p = values.probability_override;
  if (p != null && (p < 0 || p > 100)) errors.push('Probabilidade deve ficar entre 0 e 100.');
}

async function nextOrder(c, stageId) {
  const { rows } = await c.query('SELECT COALESCE(max(board_order),0)+1 AS n FROM crm_deals WHERE stage_id=$1 AND deleted_at IS NULL', [stageId]);
  return Number(rows[0].n);
}

async function actorInOrg(c, orgId, actor) {
  if (!actor.id) return null;
  const { rows } = await c.query('SELECT 1 FROM users WHERE id=$1 AND org_id=$2', [actor.id, orgId]);
  return rows[0] ? actor.id : null;
}

export async function fetchDeal(db, orgId, id) {
  const row = await loadDeal(db, orgId, id);
  if (!row) return null;
  return { ...mapDeal(row), items: await loadItems(db, id) };
}

export async function createDeal(orgId, actor, input) {
  const src = input || {};
  const { values, errors } = sanitize(DEAL_SPEC, src);
  if (!values.title) errors.push('Informe o título do negócio.');
  checkProbability(values, errors);
  requireUuid(src.companyId, 'Empresa');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  const id = randomUUID();
  return tx(async (c) => {
    const company = await loadCompany(c, orgId, src.companyId, { lock: true });
    if (!company) throw new CrmError(404, 'Empresa não encontrada.');
    if (values.deal_type === 'upsell' && company.relationship !== 'client') throw new CrmError(400, 'Upsell só existe para empresas que já são clientes.');
    const pipeline = await ensureDefaultPipeline(orgId, c);
    const stage = src.stageId ? pipeline.stages.find((s) => s.id === src.stageId) : pipeline.stages.find((s) => s.kind === 'open');
    if (!stage || stage.kind !== 'open') throw new CrmError(400, 'Um negócio novo precisa começar numa etapa em aberto.');
    if (src.ownerId === undefined) values.owner_id = await actorInOrg(c, orgId, actor); else await assertUserInOrg(c, orgId, values.owner_id);
    await assertContactOfCompany(c, orgId, values.primary_contact_id, company.id);
    const items = 'items' in src ? await resolveItems(c, orgId, src.items) : [];
    values.value = items.length ? sumItems(items) : (values.value || 0);
    const cols = { ...values, expected_close_date: values.expected_close_date || null };
    const names = Object.keys(cols);
    await c.query(
      `INSERT INTO crm_deals (id, org_id, company_id, pipeline_id, stage_id, board_order, ${names.join(', ')}, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6, ${names.map((_, i) => `$${i + 7}`).join(', ')}, $${names.length + 7}, $${names.length + 7})`,
      [id, orgId, company.id, pipeline.id, stage.id, await nextOrder(c, stage.id), ...names.map((n) => cols[n]), actor.id || null]);
    if (items.length) await writeItems(c, orgId, id, items);
    await c.query(
      `INSERT INTO crm_deal_stage_history (id, org_id, deal_id, company_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, days_in_from, actor_id, actor_name)
       VALUES ($1,$2,$3,$4,NULL,$5,'',$6,NULL,$7,$8)`, [randomUUID(), orgId, id, company.id, stage.id, stage.name, actor.id || null, actor.name || '']);
    const api = { ...mapDeal(await loadDeal(c, orgId, id)), items };
    const changes = DEAL_SPEC.filter((f) => api[f.key] != null && api[f.key] !== '' && !(f.key === 'value' && !api.value)).map((f) => ({ field: f.key, label: f.label, from: null, to: api[f.key] }));
    if (items.length) changes.push({ field: 'items', label: 'Produtos', from: null, to: itemsSummary(items) });
    changes.push({ field: 'stage', label: 'Etapa', from: null, to: stage.name });
    await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'create', changes, actor });
    await addTimeline(c, { orgId, companyId: company.id, entityType: 'deal', entityId: id, eventType: 'deal_created', actor,
      summary: `${actor.name} criou o negócio "${api.title}" (${DEAL_TYPE_LABELS[api.dealType]}) na etapa ${stage.name}${api.value ? ` — ${brl(api.value)}` : ''}.`, data: { dealId: id, dealType: api.dealType, stage: stage.name, value: api.value } });
    return api;
  });
}

export async function updateDeal(orgId, actor, id, input, { canEditClosed = false } = {}) {
  requireUuid(id, 'Negócio');
  const src = input || {};
  const { values, errors } = sanitize(DEAL_SPEC, src, { partial: true });
  if ('title' in values && !values.title) errors.push('O título do negócio não pode ficar vazio.');
  checkProbability(values, errors);
  if (errors.length) throw new CrmError(400, errors.join(' '));
  return tx(async (c) => {
    const row = await loadDeal(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Negócio não encontrado.');
    if (row.status !== 'open' && !canEditClosed) throw new CrmError(403, 'Negócio já fechado: só gestores podem editar. Reabra-o ou peça a um gestor.');
    const beforeItems = await loadItems(c, id);
    const before = { ...mapDeal(row), items: beforeItems };
    const after = { ...before };
    DEAL_SPEC.forEach((f) => { if (f.col in values) after[f.key] = values[f.col]; });
    if (after.dealType === 'upsell' && before.dealType !== 'upsell' && before.companyRelationship !== 'client') throw new CrmError(400, 'Upsell só existe para empresas que já são clientes.');
    if ('owner_id' in values) await assertUserInOrg(c, orgId, values.owner_id);
    if ('primary_contact_id' in values) await assertContactOfCompany(c, orgId, values.primary_contact_id, row.company_id);
    const itemsProvided = 'items' in src;
    const items = itemsProvided ? await resolveItems(c, orgId, src.items, new Set(beforeItems.map((i) => i.productId).filter(Boolean))) : beforeItems;
    after.value = items.length ? sumItems(items) : ('value' in values ? (values.value || 0) : before.value);
    const changes = diffApi(DEAL_SPEC, before, after);
    const itemsChanged = itemsProvided && itemsSummary(beforeItems) !== itemsSummary(items);
    if (itemsChanged) changes.push({ field: 'items', label: 'Produtos', from: itemsSummary(beforeItems) || null, to: itemsSummary(items) || null });
    if (!changes.length) return before;
    const sets = [];
    const params = [];
    changes.filter((ch) => ch.field !== 'items').forEach((ch) => {
      const f = DEAL_SPEC.find((x) => x.key === ch.field);
      params.push(after[ch.field] === '' && ['date', 'number', 'int', 'user'].includes(f.type) ? null : after[ch.field]);
      sets.push(`${f.col}=$${params.length}`);
    });
    if (itemsChanged) await writeItems(c, orgId, id, items);
    params.push(actor.id || null); sets.push(`updated_by=$${params.length}`);
    params.push(id);
    await c.query(`UPDATE crm_deals SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'update', changes, actor });
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'deal', entityId: id, eventType: 'deal_updated', actor,
      summary: `${actor.name} alterou o negócio "${after.title}": ${changeSummary(DEAL_SPEC, changes)}.`, data: { dealId: id, changes } });
    return fetchDeal(c, orgId, id);
  });
}

// Mover de etapa é a operação central do funil. Ganhar/perder fecham o negócio;
// voltar de uma etapa fechada reabre. Ganhar promove a empresa a cliente — é
// assim que "Lead vira cliente" acontece sem ninguém precisar lembrar de editar
// o cadastro.
export async function moveDeal(orgId, actor, id, { stageId, lostReason = '', lostDetail = '' } = {}) {
  requireUuid(id, 'Negócio');
  requireUuid(stageId, 'Etapa');
  return tx(async (c) => {
    const row = await loadDeal(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Negócio não encontrado.');
    const { rows: st } = await c.query('SELECT id, name, kind, probability FROM crm_pipeline_stages WHERE id=$1 AND pipeline_id=$2 AND deleted_at IS NULL', [stageId, row.pipeline_id]);
    const to = st[0];
    if (!to) throw new CrmError(404, 'Etapa não encontrada neste funil.');
    if (to.id === row.stage_id) return fetchDeal(c, orgId, id);
    const reason = String(lostReason || '').trim();
    const detail = String(lostDetail || '').trim().slice(0, 1000);
    if (to.kind === 'lost') {
      if (!LOST_REASONS[reason]) throw new CrmError(400, 'Escolha o motivo da perda.');
      if (reason === 'outro' && !detail) throw new CrmError(400, 'Descreva o motivo da perda.');
    }
    const daysInFrom = Math.round((Date.now() - new Date(row.stage_entered_at).getTime()) / 864000) / 100;
    await c.query(
      `UPDATE crm_deals SET stage_id=$1, status=$2, stage_entered_at=now(), board_order=$3, closed_at=${to.kind === 'open' ? 'NULL' : 'now()'},
              lost_reason=$4, lost_detail=$5, updated_at=now(), updated_by=$6 WHERE id=$7`,
      [to.id, to.kind, await nextOrder(c, to.id), to.kind === 'lost' ? reason : '', to.kind === 'lost' ? detail : '', actor.id || null, id]);
    await c.query(
      `INSERT INTO crm_deal_stage_history (id, org_id, deal_id, company_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, days_in_from, actor_id, actor_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(), orgId, id, row.company_id, row.stage_id, to.id, row.stage_name, to.name, daysInFrom, actor.id || null, actor.name || '']);
    const changes = [{ field: 'stage', label: 'Etapa', from: row.stage_name, to: to.name }];
    if (row.status !== to.kind) changes.push({ field: 'status', label: 'Situação', from: row.status, to: to.kind });
    if (to.kind === 'lost') changes.push({ field: 'lostReason', label: 'Motivo da perda', from: null, to: LOST_REASONS[reason] + (detail ? ` — ${detail}` : '') });
    await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'move', changes, actor });
    const val = Number(row.value || 0);
    let eventType = 'deal_stage_changed';
    let summary = `${actor.name} moveu o negócio "${row.title}" de ${row.stage_name} para ${to.name}.`;
    if (to.kind === 'won') { eventType = 'deal_won'; summary = `${actor.name} ganhou o negócio "${row.title}"${val ? ` (${brl(val)})` : ''}.`; }
    else if (to.kind === 'lost') { eventType = 'deal_lost'; summary = `${actor.name} marcou o negócio "${row.title}" como perdido — ${LOST_REASONS[reason]}${detail ? `: ${detail}` : ''}.`; }
    else if (row.status !== 'open') { eventType = 'deal_reopened'; summary = `${actor.name} reabriu o negócio "${row.title}" na etapa ${to.name}.`; }
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'deal', entityId: id, eventType, actor, summary,
      data: { dealId: id, from: row.stage_name, to: to.name, lostReason: to.kind === 'lost' ? reason : undefined } });
    if (to.kind === 'won' && ['prospect', 'former_client'].includes(row.company_relationship)) {
      await c.query(`UPDATE crm_companies SET relationship='client', client_since=COALESCE(client_since, $2::date), updated_at=now(), updated_by=$3 WHERE id=$1`, [row.company_id, todayBR(), actor.id || null]);
      await addAudit(c, { orgId, entityType: 'company', entityId: row.company_id, action: 'update', changes: [{ field: 'relationship', label: 'Relação', from: row.company_relationship, to: 'client' }], actor });
      await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'company', entityId: row.company_id, eventType: 'relationship_changed', actor,
        summary: `Relação alterada de ${RELATIONSHIP_LABELS[row.company_relationship]} para Cliente (negócio "${row.title}" ganho).`, data: { from: row.company_relationship, to: 'client', automatic: true, dealId: id } });
    }
    return fetchDeal(c, orgId, id);
  });
}

export async function deleteDeal(orgId, actor, id) {
  requireUuid(id, 'Negócio');
  return tx(async (c) => {
    const row = await loadDeal(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Negócio não encontrado.');
    await c.query('UPDATE crm_deals SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'delete', actor });
    await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'deal', entityId: id, eventType: 'deal_deleted', actor, summary: `${actor.name} excluiu o negócio "${row.title}".`, data: { dealId: id } });
    return { ok: true };
  });
}
