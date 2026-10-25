// Automação "ao ganhar" (§84): reproduz a única automação ativa do PipeRun da PRICETAX ("Ganhos - Iniciar Operação": ao ganhar um negócio do funil Empresas na etapa Contrato,
// cria uma CÓPIA no funil Pós Vendas). Configuração por funil (Funis e etapas › Automação ao ganhar): funil e etapa de destino e, opcionalmente, só quando o negócio ganho
// estava numa etapa específica. A cópia leva empresa, título, valor, dono, contato, origem, descrição e produtos; nasce em aberto. Ganhar de novo não duplica (índice único por origem).
import { randomUUID } from 'node:crypto';
import { addAudit, addTimeline } from './service.js';

export async function ensureAutomationSchema(pool) {
  await pool.query(`ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS on_won_pipeline_id UUID REFERENCES crm_pipelines(id)`);
  await pool.query(`ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS on_won_stage_id UUID REFERENCES crm_pipeline_stages(id)`);
  await pool.query(`ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS on_won_from_stage_id UUID REFERENCES crm_pipeline_stages(id)`);
}

export const AUTO_SOURCE = 'auto-won';

// `row`: o negócio ANTES de ganhar (loadDeal); `prevStageId`: etapa em que estava.
export async function applyWonAutomation(c, orgId, actor, row, prevStageId) {
  const { rows: rules } = await c.query('SELECT name, on_won_pipeline_id, on_won_stage_id, on_won_from_stage_id FROM crm_pipelines WHERE id=$1 AND org_id=$2', [row.pipeline_id, orgId]);
  const rule = rules[0];
  if (!rule || !rule.on_won_pipeline_id || !rule.on_won_stage_id) return null;
  if (rule.on_won_from_stage_id && rule.on_won_from_stage_id !== prevStageId) return null;
  const { rows: tgt } = await c.query(
    `SELECT s.id, s.name, p.name AS pipeline_name FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id = s.pipeline_id
     WHERE s.id=$1 AND s.pipeline_id=$2 AND s.kind='open' AND s.deleted_at IS NULL AND p.deleted_at IS NULL AND p.org_id=$3`, [rule.on_won_stage_id, rule.on_won_pipeline_id, orgId]);
  if (!tgt[0]) return null;
  const id = randomUUID();
  const { rows: ord } = await c.query('SELECT COALESCE(max(board_order),0)+1 AS n FROM crm_deals WHERE stage_id=$1 AND deleted_at IS NULL', [tgt[0].id]);
  const note = `\n\nCriado automaticamente ao ganhar o negócio "${row.title}" (funil ${rule.name}).`;
  const ins = await c.query(
    `INSERT INTO crm_deals (id, org_id, company_id, pipeline_id, stage_id, board_order, title, deal_type, value, mrr, owner_id, primary_contact_id, source, description, status,
                            stage_entered_at, created_by, updated_by, external_source, external_id)
     SELECT $1, d.org_id, d.company_id, $2, $3, $4, d.title, d.deal_type, d.value, d.mrr, d.owner_id, d.primary_contact_id, d.source, left(d.description || $5, 3000), 'open', now(), $6, $6, $7, d.id::text
     FROM crm_deals d WHERE d.id=$8 AND d.org_id=$9
     ON CONFLICT (org_id, external_source, external_id) WHERE external_id <> '' DO NOTHING RETURNING id`,
    [id, rule.on_won_pipeline_id, tgt[0].id, Number(ord[0].n), note, actor.id || null, AUTO_SOURCE, row.id, orgId]);
  if (!ins.rows[0]) return null;
  await c.query(`INSERT INTO crm_deal_items (id, org_id, deal_id, product_id, name, quantity, unit_price, position) SELECT gen_random_uuid(), org_id, $1, product_id, name, quantity, unit_price, position FROM crm_deal_items WHERE deal_id=$2`, [id, row.id]);
  await c.query(`INSERT INTO crm_deal_tags (org_id, deal_id, tag_id) SELECT org_id, $1, tag_id FROM crm_deal_tags WHERE deal_id=$2 ON CONFLICT DO NOTHING`, [id, row.id]);
  await c.query(
    `INSERT INTO crm_deal_stage_history (id, org_id, deal_id, company_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, days_in_from, actor_id, actor_name)
     VALUES ($1,$2,$3,$4,NULL,$5,'',$6,NULL,$7,$8)`, [randomUUID(), orgId, id, row.company_id, tgt[0].id, tgt[0].name, actor.id || null, actor.name || '']);
  await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'create', actor, changes: [{ field: 'origem', label: 'Origem do registro', from: null, to: `Automação ao ganhar o negócio "${row.title}"` }, { field: 'stage', label: 'Etapa', from: null, to: `${tgt[0].pipeline_name} › ${tgt[0].name}` }] });
  await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'deal', entityId: id, eventType: 'deal_created', actor,
    summary: `Negócio "${row.title}" criado automaticamente em ${tgt[0].pipeline_name} › ${tgt[0].name}, ao ganhar o negócio original.`, data: { dealId: id, automatic: true, fromDealId: row.id } });
  await addTimeline(c, { orgId, companyId: row.company_id, entityType: 'deal', entityId: row.id, eventType: 'deal_copied', actor,
    summary: `Ao ganhar, o sistema criou uma cópia do negócio em ${tgt[0].pipeline_name} › ${tgt[0].name}.`, data: { dealId: row.id, copyId: id, automatic: true } });
  return { id, pipelineName: tgt[0].pipeline_name, stageName: tgt[0].name };
}
