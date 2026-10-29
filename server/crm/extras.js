// CRM — campos que o PipeRun tinha e o CRM não: MRR do negócio, tags e prazo (SLA) por etapa (§85). Só colunas/tabelas NOVAS e aditivas.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { tx, addAudit, addTimeline, requireUuid, createCompany, createContact, deleteCompany, deleteContact } from './service.js';
import { createDeal, loadDeal } from './deals.js';
import { createActivity, cancelActivity, ACTIVITY_TYPES } from './activities.js';
import { todayBR } from './service.js';

export async function ensureCrmExtrasSchema(db) {
  await db.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS mrr NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await db.query(`ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS sla_days INTEGER`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_tags (
      id         UUID PRIMARY KEY,
      org_id     TEXT NOT NULL REFERENCES organizations(id),
      name       TEXT NOT NULL,
      name_key   TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (org_id, name_key)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_deal_tags (
      org_id  TEXT NOT NULL REFERENCES organizations(id),
      deal_id UUID NOT NULL REFERENCES crm_deals(id),
      tag_id  UUID NOT NULL REFERENCES crm_tags(id),
      PRIMARY KEY (deal_id, tag_id)
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS crm_deal_tags_tag_idx ON crm_deal_tags(tag_id)`);
  // Cadência de follow-up: regra por etapa de funil que agenda a atividade seguinte sozinha (§93).
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_cadences (
      id          UUID PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id),
      stage_id    UUID NOT NULL REFERENCES crm_pipeline_stages(id),
      name        TEXT NOT NULL,
      steps       JSONB NOT NULL DEFAULT '[]'::jsonb,
      active      BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by  TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at  TIMESTAMPTZ
    )`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_cadences_stage_uidx ON crm_cadences(stage_id) WHERE deleted_at IS NULL`);
  await db.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS cadence_id UUID`);
  await db.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS cadence_step INTEGER`);
  await db.query(`CREATE INDEX IF NOT EXISTS crm_activities_cadence_idx ON crm_activities(deal_id) WHERE cadence_id IS NOT NULL AND status = 'open'`);
}

export const TAG_COLORS = ['default', 'primary', 'success', 'info', 'warning', 'danger'];
export const tagKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 60);

export async function listTags(orgId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.color, (SELECT count(*)::int FROM crm_deal_tags dt JOIN crm_deals d ON d.id = dt.deal_id AND d.deleted_at IS NULL WHERE dt.tag_id = t.id) AS deals
     FROM crm_tags t WHERE t.org_id=$1 ORDER BY t.name`, [orgId]);
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, deals: r.deals }));
}

// Garante a tag no catálogo (pelo nome, sem diferenciar maiúsculas); devolve o id. `db` pode ser pool ou transação.
export async function ensureTag(db, orgId, name, color = 'default') {
  const nm = cleanName(name);
  if (!nm) throw new CrmError(400, 'A tag precisa de um nome.');
  const col = TAG_COLORS.includes(color) ? color : 'default';
  const { rows } = await db.query(
    `INSERT INTO crm_tags (id, org_id, name, name_key, color) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, name_key) DO UPDATE SET name = crm_tags.name RETURNING id, name`, [randomUUID(), orgId, nm, tagKey(nm), col]);
  return rows[0];
}

// Troca o conjunto de tags do negócio (nomes). Cria no catálogo as que não existem. Auditoria + linha do tempo na mesma transação.
export async function setDealTags(orgId, actor, dealId, names) {
  requireUuid(dealId, 'Negócio');
  if (!Array.isArray(names) || names.length > 30) throw new CrmError(400, 'Informe a lista de tags (no máximo 30).');
  const wanted = [...new Map(names.map(cleanName).filter(Boolean).reverse().map((n) => [tagKey(n), n])).values()].reverse();
  return tx(async (c) => {
    const { rows: dr } = await c.query('SELECT id, company_id, title FROM crm_deals WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [dealId, orgId]);
    if (!dr[0]) throw new CrmError(404, 'Negócio não encontrado.');
    const { rows: cur } = await c.query('SELECT t.id, t.name FROM crm_deal_tags dt JOIN crm_tags t ON t.id = dt.tag_id WHERE dt.deal_id=$1 ORDER BY t.name', [dealId]);
    const ids = [];
    for (const n of wanted) ids.push(await ensureTag(c, orgId, n));
    const nextNames = ids.map((t) => t.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const before = cur.map((t) => t.name);
    if (before.join('|') === nextNames.join('|')) return nextNames;
    await c.query('DELETE FROM crm_deal_tags WHERE deal_id=$1', [dealId]);
    for (const t of ids) await c.query('INSERT INTO crm_deal_tags (org_id, deal_id, tag_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [orgId, dealId, t.id]);
    await addAudit(c, { orgId, entityType: 'deal', entityId: dealId, action: 'update', actor, changes: [{ field: 'tags', label: 'Tags', from: before.join(', ') || null, to: nextNames.join(', ') || null }] });
    await addTimeline(c, { orgId, companyId: dr[0].company_id, entityType: 'deal', entityId: dealId, eventType: 'deal_updated', actor,
      summary: `${actor.name} alterou as tags do negócio "${dr[0].title}": ${nextNames.join(', ') || 'nenhuma'}.`, data: { dealId, tags: nextNames } });
    return nextNames;
  });
}

// Lead rápido (rotina de quem prospecta): empresa nova + contato com telefone/WhatsApp + negócio num passo só, como o formulário do PipeRun.
// Empresa parecida já cadastrada → 409 com a lista (a tela oferece "usar esta" ou "criar mesmo assim", `force`). Os 3 registros nascem pelas
// mesmas funções da tela (validação, auditoria, linha do tempo); se o passo seguinte falhar, o que já foi criado fica (é um cadastro válido).
export async function quickLead(orgId, actor, input) {
  const src = input || {};
  const companyName = String(src.companyName || '').trim();
  if (companyName.length < 2) throw new CrmError(400, 'Informe o nome da empresa.');
  const contactName = String(src.contactName || '').trim();
  const phone = String(src.phone || '').trim();
  const email = String(src.email || '').trim();
  // Dados vindos da consulta do CNPJ (Receita): só campos conhecidos da empresa; nada além disso entra.
  const COMPANY_KEYS = ['tradeName', 'city', 'state', 'cnae', 'segment', 'taxRegime', 'companySize', 'phone', 'zipCode', 'street', 'streetNumber', 'complement', 'district', 'foundedAt', 'shareCapital', 'website'];
  const extra = {};
  if (src.companyData && typeof src.companyData === 'object') COMPANY_KEYS.forEach((k) => { const v = src.companyData[k]; if (v !== undefined && v !== null && v !== '') extra[k] = v; });
  const company = await createCompany(orgId, actor, { ...extra, ...(src.cnpj ? { cnpj: src.cnpj } : {}), legalName: companyName, relationship: 'prospect', ownerId: actor.id || null }, { force: !!src.force, timelineSummary: `${actor.name} cadastrou a empresa como lead rápido.` });
  let contact = null; let deal;
  // Empresa, contato e negócio nascem em passos separados: se um deles falhar, o que já foi criado é desfeito (exclusão lógica) para não sobrar empresa solta (M8).
  try {
    if (contactName || phone || email) {
      const [first, ...rest] = (contactName || 'Contato').split(/\s+/);
      contact = await createContact(orgId, actor, { companyId: company.id, firstName: first, lastName: rest.join(' '), phone, whatsapp: phone, email, isPrimary: true }, { force: true });
    }
    deal = await createDeal(orgId, actor, {
      companyId: company.id, title: String(src.title || '').trim() || companyName, pipelineId: src.pipelineId || null, stageId: src.stageId || undefined,
      primaryContactId: contact ? contact.id : undefined, source: String(src.source || '').slice(0, 200), value: 0,
    });
  } catch (e) {
    if (contact) await deleteContact(orgId, actor, contact.id).catch((err) => console.error('quickLead: falha ao desfazer o contato', err.message));
    await deleteCompany(orgId, actor, company.id).catch((err) => console.error('quickLead: falha ao desfazer a empresa', err.message));
    throw e;
  }
  return { deal, company, contact, cadence: await cadenceAfterMove(orgId, actor, deal) };
}

// ---------------------------------------------------------------- Cadência de follow-up (§93)
// Regra por ETAPA: ao entrar na etapa agenda o 1º passo; ao concluir um passo agenda o seguinte (dias contados da conclusão); ao sair da etapa
// ou fechar o negócio cancela o que sobrou. Os passos são atividades comuns (aparecem na Agenda/fila, têm auditoria e linha do tempo).
const CADENCE_TYPES = Object.keys(ACTIVITY_TYPES);
function cleanSteps(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new CrmError(400, 'A cadência precisa de 1 a 8 passos.');
  return raw.map((x, i) => {
    const title = String((x && x.title) || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!title) throw new CrmError(400, `O passo ${i + 1} precisa de um título.`);
    const type = CADENCE_TYPES.includes(x.type) ? x.type : 'followup';
    const days = Number(x.days);
    if (!Number.isInteger(days) || days < 0 || days > 90) throw new CrmError(400, `Prazo inválido no passo ${i + 1} (0 a 90 dias).`);
    return { title, type, days };
  });
}
const cadenceOut = (r) => ({ id: r.id, pipelineId: r.pipeline_id, stageId: r.stage_id, pipelineName: r.pipeline_name || '', stageName: r.stage_name || '', name: r.name, steps: r.steps, active: r.active });

export async function listCadences(orgId) {
  const { rows } = await pool.query(
    `SELECT c.*, p.name AS pipeline_name, s.name AS stage_name FROM crm_cadences c JOIN crm_pipelines p ON p.id = c.pipeline_id JOIN crm_pipeline_stages s ON s.id = c.stage_id
     WHERE c.org_id=$1 AND c.deleted_at IS NULL ORDER BY p.name, s.position`, [orgId]);
  return rows.map(cadenceOut);
}

export async function saveCadence(orgId, actor, input, id = null) {
  const src = input || {};
  if (id) requireUuid(id, 'Cadência');
  const steps = cleanSteps(src.steps);
  const name = String(src.name || '').trim().slice(0, 80);
  return tx(async (c) => {
    let cur = null;
    if (id) { const r = await c.query('SELECT * FROM crm_cadences WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [id, orgId]); cur = r.rows[0]; if (!cur) throw new CrmError(404, 'Cadência não encontrada.'); }
    const stageId = cur ? cur.stage_id : src.stageId; const pipelineId = cur ? cur.pipeline_id : src.pipelineId;
    requireUuid(stageId, 'Etapa'); requireUuid(pipelineId, 'Funil');
    const { rows: st } = await c.query(`SELECT s.id, s.name FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id WHERE s.id=$1 AND s.pipeline_id=$2 AND s.org_id=$3 AND s.kind='open' AND s.deleted_at IS NULL AND p.deleted_at IS NULL`, [stageId, pipelineId, orgId]);
    if (!st[0]) throw new CrmError(400, 'Escolha uma etapa em aberto do funil.');
    const active = src.active === undefined ? (cur ? cur.active : true) : !!src.active;
    const nm = name || `Cadência de ${st[0].name}`;
    let outId = id;
    if (cur) await c.query('UPDATE crm_cadences SET name=$2, steps=$3::jsonb, active=$4, updated_at=now() WHERE id=$1', [id, nm, JSON.stringify(steps), active]);
    else {
      const dup = await c.query('SELECT 1 FROM crm_cadences WHERE stage_id=$1 AND deleted_at IS NULL', [stageId]);
      if (dup.rows[0]) throw new CrmError(409, 'Esta etapa já tem uma cadência — edite a existente.');
      outId = randomUUID();
      await c.query('INSERT INTO crm_cadences (id, org_id, pipeline_id, stage_id, name, steps, active, created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)', [outId, orgId, pipelineId, stageId, nm, JSON.stringify(steps), active, actor.id || null]);
    }
    await addAudit(c, { orgId, entityType: 'pipeline', entityId: pipelineId, action: cur ? 'update' : 'create', actor,
      changes: [{ field: 'cadence', label: `Cadência da etapa ${st[0].name}`, from: cur ? cur.steps.map((x) => `${x.title} (+${x.days} d)`).join(' → ') : null, to: `${active ? '' : '[desligada] '}${steps.map((x) => `${x.title} (+${x.days} d)`).join(' → ')}` }] });
    const r = await c.query(`SELECT c.*, p.name AS pipeline_name, s.name AS stage_name FROM crm_cadences c JOIN crm_pipelines p ON p.id=c.pipeline_id JOIN crm_pipeline_stages s ON s.id=c.stage_id WHERE c.id=$1`, [outId]);
    return cadenceOut(r.rows[0]);
  });
}

export async function deleteCadence(orgId, actor, id) {
  requireUuid(id, 'Cadência');
  return tx(async (c) => {
    const r = await c.query('UPDATE crm_cadences SET deleted_at=now() WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL RETURNING pipeline_id, stage_id', [id, orgId]);
    if (!r.rows[0]) throw new CrmError(404, 'Cadência não encontrada.');
    await addAudit(c, { orgId, entityType: 'pipeline', entityId: r.rows[0].pipeline_id, action: 'update', actor, changes: [{ field: 'cadence', label: 'Cadência', from: 'ativa', to: 'removida' }] });
    return { removed: true };
  });
}

const addDays = (n) => new Date(new Date(`${todayBR()}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

async function scheduleStep(orgId, actor, deal, cad, index) {
  const step = cad.steps[index];
  const a = await createActivity(orgId, actor, {
    companyId: deal.companyId, dealId: deal.id, contactId: deal.primaryContactId || undefined, ownerId: deal.ownerId || actor.id, title: step.title, activityType: step.type,
    dueDate: addDays(step.days), priority: 'normal', description: `Cadência "${cad.name}" — passo ${index + 1} de ${cad.steps.length}.`,
  });
  await pool.query('UPDATE crm_activities SET cadence_id=$2, cadence_step=$3 WHERE id=$1', [a.id, cad.id, index]);
  return { ...a, cadenceStep: index + 1, cadenceSteps: cad.steps.length };
}

// Depois de criar ou mover um negócio: fecha → cancela os passos abertos; saiu da etapa → cancela; entrou numa etapa com cadência → agenda o passo 1.
// Melhor esforço (nunca derruba a operação principal): erro vai para o log e a tela segue.
export async function cadenceAfterMove(orgId, actor, deal) {
  const out = { scheduled: null, cancelled: 0 };
  try {
    const { rows: open } = await pool.query(`SELECT a.id, a.cadence_id, c.stage_id AS cad_stage FROM crm_activities a JOIN crm_cadences c ON c.id = a.cadence_id WHERE a.deal_id=$1 AND a.org_id=$2 AND a.status='open' AND a.deleted_at IS NULL`, [deal.id, orgId]);
    const stale = open.filter((x) => deal.status !== 'open' || x.cad_stage !== deal.stageId);
    for (const x of stale) { await cancelActivity(orgId, actor, x.id); out.cancelled += 1; }
    if (deal.status !== 'open') return out;
    const { rows: cads } = await pool.query(`SELECT * FROM crm_cadences WHERE stage_id=$1 AND org_id=$2 AND active AND deleted_at IS NULL`, [deal.stageId, orgId]);
    const cad = cads[0];
    if (cad && !open.some((x) => x.cad_stage === deal.stageId && !stale.includes(x))) out.scheduled = await scheduleStep(orgId, actor, deal, cad, 0);
  } catch (e) { console.error('Cadência (entrada/saída de etapa):', e.message); }
  return out;
}

// Depois de concluir uma atividade da cadência: agenda o passo seguinte (se o negócio segue aberto, na mesma etapa, e não há outro passo aberto).
export async function cadenceAfterComplete(orgId, actor, activityId) {
  try {
    const { rows } = await pool.query(`SELECT a.deal_id, a.cadence_id, a.cadence_step, c.steps, c.name, c.stage_id, c.active, c.pipeline_id, c.org_id FROM crm_activities a JOIN crm_cadences c ON c.id = a.cadence_id WHERE a.id=$1 AND a.org_id=$2 AND a.deleted_at IS NULL AND c.deleted_at IS NULL`, [activityId, orgId]);
    const r = rows[0];
    if (!r || !r.active || !r.deal_id) return null;
    const next = Number(r.cadence_step) + 1;
    if (next >= r.steps.length) return null;
    const deal = await loadDeal(pool, orgId, r.deal_id);
    if (!deal || deal.status !== 'open' || deal.stage_id !== r.stage_id) return null;
    const { rows: still } = await pool.query(`SELECT 1 FROM crm_activities WHERE deal_id=$1 AND cadence_id=$2 AND status='open' AND deleted_at IS NULL LIMIT 1`, [r.deal_id, r.cadence_id]);
    if (still[0]) return null;
    const mapped = { id: deal.id, companyId: deal.company_id, primaryContactId: deal.primary_contact_id, ownerId: deal.owner_id };
    return await scheduleStep(orgId, actor, mapped, { id: r.cadence_id, name: r.name, steps: r.steps }, next);
  } catch (e) { console.error('Cadência (passo seguinte):', e.message); return null; }
}
