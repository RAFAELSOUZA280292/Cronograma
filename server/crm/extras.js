// CRM — campos que o PipeRun tinha e o CRM não: MRR do negócio, tags e prazo (SLA) por etapa (§85). Só colunas/tabelas NOVAS e aditivas.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { tx, addAudit, addTimeline, requireUuid, createCompany, createContact } from './service.js';
import { createDeal } from './deals.js';

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
  const company = await createCompany(orgId, actor, { legalName: companyName, relationship: 'prospect', ownerId: actor.id || null }, { force: !!src.force, timelineSummary: `${actor.name} cadastrou a empresa como lead rápido.` });
  let contact = null;
  if (contactName || phone || email) {
    const [first, ...rest] = (contactName || 'Contato').split(/\s+/);
    contact = await createContact(orgId, actor, { companyId: company.id, firstName: first, lastName: rest.join(' '), phone, whatsapp: phone, email, isPrimary: true }, { force: true });
  }
  const deal = await createDeal(orgId, actor, {
    companyId: company.id, title: String(src.title || '').trim() || companyName, pipelineId: src.pipelineId || null, stageId: src.stageId || undefined,
    primaryContactId: contact ? contact.id : undefined, source: String(src.source || '').slice(0, 200), value: 0,
  });
  return { deal, company, contact };
}
