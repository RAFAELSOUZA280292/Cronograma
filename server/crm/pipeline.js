// CRM — pipeline (Fase 2, 2026-09-20, PROJECT_CONTEXT.md §55).
// Cada org ganha, sob demanda, um pipeline padrão. O modelo já aceita vários
// (pipeline_id em todo negócio), mas a Fase 2 usa só o padrão e não edita etapas.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export const DEAL_TYPES = ['new', 'upsell'];
export const DEAL_TYPE_LABELS = { new: 'Novo negócio', upsell: 'Upsell' };

export const LOST_REASONS = {
  preco: 'Preço', concorrente: 'Fechou com concorrente', sem_orcamento: 'Sem orçamento', sem_decisao: 'Sem decisão / adiou',
  timing: 'Momento errado', sem_fit: 'Sem aderência ao serviço', sem_resposta: 'Parou de responder', escopo: 'Escopo diferente do necessário', outro: 'Outro', nao_informado: 'Não informado (importado)',
};

// "Não informado" só existe pra negócio perdido importado sem motivo (o PipeRun não exporta o motivo);
// fica de fora das listas de escolha pra ninguém usar de propósito.
export const SELECTABLE_LOST_REASONS = Object.entries(LOST_REASONS).filter(([k]) => k !== 'nao_informado').map(([value, label]) => ({ value, label }));

// Probabilidade por etapa é o ponto de partida do forecast (Fase 4 pode calibrar
// com o histórico real). Ganho = 100, Perdido = 0.
export const DEFAULT_STAGES = [
  { name: 'Lead', probability: 10, kind: 'open', color: '#9a9a9a' },
  { name: 'Qualificação', probability: 20, kind: 'open', color: '#3ea6ff' },
  { name: 'Diagnóstico', probability: 35, kind: 'open', color: '#b98af5' },
  { name: 'Proposta', probability: 55, kind: 'open', color: '#ff9f40' },
  { name: 'Negociação', probability: 75, kind: 'open', color: '#F5C400' },
  { name: 'Ganho', probability: 100, kind: 'won', color: '#3ecf6e' },
  { name: 'Perdido', probability: 0, kind: 'lost', color: '#e2574c' },
];

export async function ensureDefaultPipeline(orgId, db = pool) {
  const found = await db.query('SELECT id, name FROM crm_pipelines WHERE org_id=$1 AND is_default AND deleted_at IS NULL', [orgId]);
  if (found.rows[0]) return loadPipeline(db, found.rows[0]);
  const c = db === pool ? await pool.connect() : null;
  const conn = c || db;
  try {
    if (c) await c.query('BEGIN');
    const id = randomUUID();
    // O índice único parcial garante 1 padrão por org mesmo com duas chamadas simultâneas.
    const ins = await conn.query(`INSERT INTO crm_pipelines (id, org_id, name, is_default) VALUES ($1,$2,'Funil comercial',true) ON CONFLICT DO NOTHING`, [id, orgId]);
    if (ins.rowCount) {
      for (let i = 0; i < DEFAULT_STAGES.length; i += 1) {
        const s = DEFAULT_STAGES[i];
        await conn.query('INSERT INTO crm_pipeline_stages (id, org_id, pipeline_id, name, position, probability, kind, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), orgId, id, s.name, i + 1, s.probability, s.kind, s.color]);
      }
    }
    if (c) await c.query('COMMIT');
  } catch (e) {
    if (c) await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { if (c) c.release(); }
  const again = await db.query('SELECT id, name FROM crm_pipelines WHERE org_id=$1 AND is_default AND deleted_at IS NULL', [orgId]);
  return loadPipeline(db, again.rows[0]);
}

async function loadPipeline(db, row) {
  const { rows } = await db.query(
    'SELECT id, name, position, probability, kind, color FROM crm_pipeline_stages WHERE pipeline_id=$1 AND deleted_at IS NULL ORDER BY position', [row.id]);
  return { id: row.id, name: row.name, stages: rows.map((s) => ({ id: s.id, name: s.name, position: s.position, probability: s.probability, kind: s.kind, color: s.color })) };
}

// Funil por id (só da org, não arquivado). `null` se não existir.
export async function loadPipelineById(db, orgId, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const { rows } = await db.query('SELECT id, name, is_default FROM crm_pipelines WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [id, orgId]);
  if (!rows[0]) return null;
  const p = await loadPipeline(db, rows[0]);
  return { ...p, isDefault: rows[0].is_default };
}

// Funil escolhido, ou o padrão da org quando nenhum foi pedido.
export async function resolvePipeline(db, orgId, pipelineId) {
  if (pipelineId) return loadPipelineById(db, orgId, pipelineId);
  const p = await ensureDefaultPipeline(orgId, db);
  return { ...p, isDefault: true };
}

// Probabilidade das etapas abertas de um funil novo: espalhada de 10% a 80% pela posição.
export function spreadProbabilities(n) {
  return Array.from({ length: n }, (_, i) => (n === 1 ? 50 : Math.round(10 + (i * 70) / (n - 1))));
}
export const STAGE_COLORS = ['#9a9a9a', '#3ea6ff', '#b98af5', '#ff9f40', '#F5C400', '#2dd4bf', '#f472b6', '#84cc16'];
