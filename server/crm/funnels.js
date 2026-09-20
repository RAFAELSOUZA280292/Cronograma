// CRM — funis e etapas (Fase 2b, 2026-09-20, PROJECT_CONTEXT.md §58). A Fase 2 nasceu com um funil
// fixo; o PipeRun da PRICETAX usa 6 (Empresas, Tributaristas e Contadores, Partner…). Aqui o funil
// passa a ser configurável: criar, renomear, definir o padrão, arquivar e editar etapas.
// Regras: cada funil tem ≥1 etapa aberta, UMA "Ganho" e UMA "Perdido" (sempre por último, não
// removíveis); etapa com negócio não pode ser removida; etapa removida é arquivada (deleted_at), nunca
// apagada, porque o histórico de etapas dos negócios aponta pra ela.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { companyNameKey } from './text.js';
import { tx, addAudit, requireUuid } from './service.js';
import { ensureDefaultPipeline, DEFAULT_STAGES, spreadProbabilities, STAGE_COLORS } from './pipeline.js';

const nameKey = (v) => companyNameKey(v) || String(v || '').toLowerCase().trim();
const clean = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, 60);

export async function listPipelines(orgId) {
  await ensureDefaultPipeline(orgId);
  const { rows: ps } = await pool.query('SELECT id, name, is_default FROM crm_pipelines WHERE org_id=$1 AND deleted_at IS NULL ORDER BY is_default DESC, created_at, name', [orgId]);
  const { rows: st } = await pool.query(
    `SELECT s.id, s.pipeline_id, s.name, s.position, s.probability, s.kind, s.color,
            (SELECT count(*)::int FROM crm_deals d WHERE d.stage_id = s.id AND d.deleted_at IS NULL) AS deals
     FROM crm_pipeline_stages s WHERE s.org_id=$1 AND s.deleted_at IS NULL ORDER BY s.position`, [orgId]);
  return ps.map((p) => {
    const stages = st.filter((s) => s.pipeline_id === p.id).map((s) => ({ id: s.id, name: s.name, position: s.position, probability: s.probability, kind: s.kind, color: s.color, deals: s.deals }));
    return { id: p.id, name: p.name, isDefault: p.is_default, stages, dealCount: stages.reduce((n, s) => n + s.deals, 0) };
  });
}

async function assertUniqueName(db, orgId, name, excludeId = null) {
  const { rows } = await db.query('SELECT id, name FROM crm_pipelines WHERE org_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id <> $2)', [orgId, excludeId]);
  if (rows.some((r) => nameKey(r.name) === nameKey(name))) throw new CrmError(409, `Já existe um funil chamado "${name}".`, { blocking: true });
}

// Cria o funil com as etapas abertas dadas (nomes) + Ganho + Perdido. Usado pela tela e pelo importador
// (dentro da transação `c` de quem chama).
export async function createPipelineTx(c, orgId, actor, { name, openStageNames = null, makeDefault = false }) {
  const nm = clean(name);
  if (!nm) throw new CrmError(400, 'Informe o nome do funil.');
  await assertUniqueName(c, orgId, nm);
  const id = randomUUID();
  if (makeDefault) await c.query('UPDATE crm_pipelines SET is_default=false WHERE org_id=$1 AND is_default', [orgId]);
  await c.query('INSERT INTO crm_pipelines (id, org_id, name, is_default) VALUES ($1,$2,$3,$4)', [id, orgId, nm, makeDefault]);
  const opens = openStageNames && openStageNames.length
    ? openStageNames.map((n) => clean(n)).filter(Boolean)
    : DEFAULT_STAGES.filter((s) => s.kind === 'open').map((s) => s.name);
  const probs = spreadProbabilities(opens.length);
  const list = [...opens.map((n, i) => ({ name: n, probability: probs[i], kind: 'open', color: STAGE_COLORS[i % STAGE_COLORS.length] })),
    ...DEFAULT_STAGES.filter((s) => s.kind !== 'open')];
  for (let i = 0; i < list.length; i += 1) {
    await c.query('INSERT INTO crm_pipeline_stages (id, org_id, pipeline_id, name, position, probability, kind, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), orgId, id, list[i].name, i + 1, list[i].probability, list[i].kind, list[i].color]);
  }
  await addAudit(c, { orgId, entityType: 'pipeline', entityId: id, action: 'create', actor, changes: [{ field: 'name', label: 'Nome', from: null, to: nm }, { field: 'stages', label: 'Etapas', from: null, to: list.map((s) => s.name).join(' → ') }] });
  return id;
}

export const createPipeline = (orgId, actor, input) => tx((c) => createPipelineTx(c, orgId, actor, { name: (input || {}).name, openStageNames: (input || {}).stages })).then(() => listPipelines(orgId));

export async function updatePipeline(orgId, actor, id, input) {
  requireUuid(id, 'Funil');
  const src = input || {};
  await tx(async (c) => {
    const { rows } = await c.query('SELECT id, name, is_default FROM crm_pipelines WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [id, orgId]);
    if (!rows[0]) throw new CrmError(404, 'Funil não encontrado.');
    const changes = [];
    if (src.name !== undefined) {
      const nm = clean(src.name);
      if (!nm) throw new CrmError(400, 'O nome do funil não pode ficar vazio.');
      if (nm !== rows[0].name) { await assertUniqueName(c, orgId, nm, id); await c.query('UPDATE crm_pipelines SET name=$1 WHERE id=$2', [nm, id]); changes.push({ field: 'name', label: 'Nome', from: rows[0].name, to: nm }); }
    }
    if (src.isDefault === true && !rows[0].is_default) {
      await c.query('UPDATE crm_pipelines SET is_default=false WHERE org_id=$1 AND is_default', [orgId]);
      await c.query('UPDATE crm_pipelines SET is_default=true WHERE id=$1', [id]);
      changes.push({ field: 'isDefault', label: 'Funil padrão', from: false, to: true });
    }
    if (changes.length) await addAudit(c, { orgId, entityType: 'pipeline', entityId: id, action: 'update', actor, changes });
  });
  return listPipelines(orgId);
}

export async function deletePipeline(orgId, actor, id) {
  requireUuid(id, 'Funil');
  await tx(async (c) => {
    const { rows } = await c.query('SELECT id, name, is_default FROM crm_pipelines WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [id, orgId]);
    if (!rows[0]) throw new CrmError(404, 'Funil não encontrado.');
    if (rows[0].is_default) throw new CrmError(409, 'Este é o funil padrão. Defina outro funil como padrão antes de arquivar este.');
    const { rows: n } = await c.query('SELECT count(*)::int AS n FROM crm_deals WHERE pipeline_id=$1 AND deleted_at IS NULL', [id]);
    if (n[0].n) throw new CrmError(409, `O funil "${rows[0].name}" tem ${n[0].n} negócio(s). Exclua ou conclua-os antes de arquivar.`);
    await c.query('UPDATE crm_pipelines SET deleted_at=now() WHERE id=$1', [id]);
    await c.query('UPDATE crm_pipeline_stages SET deleted_at=now() WHERE pipeline_id=$1 AND deleted_at IS NULL', [id]);
    await addAudit(c, { orgId, entityType: 'pipeline', entityId: id, action: 'delete', actor, changes: [{ field: 'name', label: 'Nome', from: rows[0].name, to: null }] });
  });
  return listPipelines(orgId);
}

// Substitui a lista de etapas do funil pela enviada (ordem = ordem do array). Etapas com `id` são
// atualizadas; sem `id` são novas (sempre abertas); as que sumiram são arquivadas se estiverem vazias.
export async function saveStages(orgId, actor, pipelineId, input) {
  requireUuid(pipelineId, 'Funil');
  const list = Array.isArray(input) ? input : (input && input.stages);
  if (!Array.isArray(list) || list.length < 1 || list.length > 40) throw new CrmError(400, 'Informe de 1 a 40 etapas abertas.');
  await tx(async (c) => {
    const { rows: pr } = await c.query('SELECT id, name FROM crm_pipelines WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [pipelineId, orgId]);
    if (!pr[0]) throw new CrmError(404, 'Funil não encontrado.');
    const { rows: cur } = await c.query(
      `SELECT s.id, s.name, s.position, s.probability, s.kind, s.color, (SELECT count(*)::int FROM crm_deals d WHERE d.stage_id = s.id AND d.deleted_at IS NULL) AS deals
       FROM crm_pipeline_stages s WHERE s.pipeline_id=$1 AND s.deleted_at IS NULL ORDER BY s.position`, [pipelineId]);
    const byId = new Map(cur.map((s) => [s.id, s]));
    const wonLost = cur.filter((s) => s.kind !== 'open');
    const opens = [];
    const seen = new Set();
    for (const raw of list) {
      const name = clean(raw && raw.name);
      if (!name) throw new CrmError(400, 'Toda etapa precisa de um nome.');
      if (seen.has(nameKey(name))) throw new CrmError(400, `Etapa repetida: "${name}".`);
      seen.add(nameKey(name));
      const prob = Number(raw.probability);
      if (!Number.isInteger(prob) || prob < 0 || prob > 100) throw new CrmError(400, `Probabilidade inválida na etapa "${name}" (0 a 100).`);
      if (raw.id) {
        const ex = byId.get(raw.id);
        if (!ex) throw new CrmError(400, 'Etapa desconhecida neste funil.');
        if (ex.kind !== 'open') throw new CrmError(400, `"${ex.name}" é uma etapa de fechamento — o nome dela não muda aqui e ela fica sempre no fim.`);
      }
      opens.push({ id: raw.id || null, name, probability: prob });
    }
    for (const w of wonLost) if (seen.has(nameKey(w.name))) throw new CrmError(400, `"${w.name}" já é uma etapa de fechamento — use outro nome.`);
    const keptIds = new Set(opens.filter((o) => o.id).map((o) => o.id));
    const removed = cur.filter((s) => s.kind === 'open' && !keptIds.has(s.id));
    const busy = removed.find((s) => s.deals > 0);
    if (busy) throw new CrmError(409, `A etapa "${busy.name}" tem ${busy.deals} negócio(s). Mova-os para outra etapa antes de removê-la.`);
    let pos = 1;
    for (let i = 0; i < opens.length; i += 1) {
      const o = opens[i];
      if (o.id) await c.query('UPDATE crm_pipeline_stages SET name=$1, probability=$2, position=$3 WHERE id=$4', [o.name, o.probability, pos, o.id]);
      else await c.query('INSERT INTO crm_pipeline_stages (id, org_id, pipeline_id, name, position, probability, kind, color) VALUES ($1,$2,$3,$4,$5,$6,\'open\',$7)', [randomUUID(), orgId, pipelineId, o.name, pos, o.probability, STAGE_COLORS[i % STAGE_COLORS.length]]);
      pos += 1;
    }
    for (const w of wonLost.sort((a, b) => (a.kind === 'won' ? -1 : 1) - (b.kind === 'won' ? -1 : 1))) { await c.query('UPDATE crm_pipeline_stages SET position=$1 WHERE id=$2', [pos, w.id]); pos += 1; }
    for (const r of removed) await c.query('UPDATE crm_pipeline_stages SET deleted_at=now() WHERE id=$1', [r.id]);
    const before = cur.filter((s) => s.kind === 'open').map((s) => `${s.name} (${s.probability}%)`).join(' → ');
    const after = opens.map((o) => `${o.name} (${o.probability}%)`).join(' → ');
    if (before !== after) await addAudit(c, { orgId, entityType: 'pipeline', entityId: pipelineId, action: 'update', actor, changes: [{ field: 'stages', label: 'Etapas', from: before, to: after }] });
  });
  return listPipelines(orgId);
}

// Acrescenta uma etapa aberta ao FIM das abertas (antes de Ganho/Perdido). Usado pelo importador.
export async function appendOpenStageTx(c, orgId, pipelineId, name) {
  const { rows } = await c.query('SELECT id, position, kind FROM crm_pipeline_stages WHERE pipeline_id=$1 AND deleted_at IS NULL ORDER BY position', [pipelineId]);
  const firstClosed = rows.find((s) => s.kind !== 'open');
  const at = firstClosed ? firstClosed.position : rows.length + 1;
  await c.query('UPDATE crm_pipeline_stages SET position = position + 1 WHERE pipeline_id=$1 AND deleted_at IS NULL AND position >= $2', [pipelineId, at]);
  const id = randomUUID();
  const opens = rows.filter((s) => s.kind === 'open').length;
  await c.query('INSERT INTO crm_pipeline_stages (id, org_id, pipeline_id, name, position, probability, kind, color) VALUES ($1,$2,$3,$4,$5,$6,\'open\',$7)',
    [id, orgId, pipelineId, clean(name), at, Math.min(80, 10 + opens * 10), STAGE_COLORS[opens % STAGE_COLORS.length]]);
  return id;
}
