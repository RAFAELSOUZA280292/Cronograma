// Grafo de entidades da RENATA — versão relacional (Fase 8, 2026-09-11,
// ver PROJECT_CONTEXT.md §39 pro desenho completo). Pedido do Rafael:
// "não precisa ser Neo4j agora... mas quero que a arquitetura comece a
// identificar e conectar entidades". `ai_knowledge_entities` +
// `ai_knowledge_fact_entities` (server/db.js) são as duas tabelas;
// deduplicação por nome normalizado DENTRO da org (índice único,
// `normalizeName` reaproveitado de server/assistantContext.js — mesma
// função já usada pra apelidos/nomes parciais no resto do app).
import { normalizeName } from './assistantContext.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Tenta ligar uma entidade PERSON a um usuário real (`teamLinks`/
// `normalizeTeam`, src/App.jsx) e uma entidade COMPANY/PROJECT ao
// projeto de origem, quando o nome bate com confiança. Nunca bloqueia a
// criação da entidade se a resolução falhar — é um bônus best-effort,
// não um requisito (mesmo espírito de `buildPersonLookupText`: nunca
// travar o fluxo principal por causa de uma resolução opcional).
function resolveLinks(type, normalizedName, projectData, projectId) {
  if (type === 'PERSON') {
    const team = (projectData && projectData.team) || [];
    const match = team.find((m) => m && m.userId && normalizeName(m.name) === normalizedName);
    return { linkedUserId: match ? match.userId : null, linkedProjectId: null };
  }
  if (type === 'COMPANY' || type === 'PROJECT') {
    const companyName = projectData && projectData.company && (projectData.company.nomeFantasia || projectData.company.name);
    if (companyName && normalizeName(companyName) === normalizedName) {
      return { linkedUserId: null, linkedProjectId: projectId || null };
    }
  }
  return { linkedUserId: null, linkedProjectId: null };
}

// Find-or-create por (org_id, type, normalized_name) — único no schema,
// então uma corrida entre duas gravações simultâneas do "mesmo" nome
// nunca duplica (a segunda cai no ON CONFLICT). `projectData`/`projectId`
// são opcionais (só usados pra tentar resolver os links, nunca
// obrigatórios pra criar a entidade).
export async function findOrCreateEntity(pool, { orgId, type, name, projectData, projectId }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Nome da entidade não informado.');
  const normalized = normalizeName(cleanName);
  const { linkedUserId, linkedProjectId } = resolveLinks(type, normalized, projectData, projectId);

  const { rows: existingRows } = await pool.query(
    'SELECT id FROM ai_knowledge_entities WHERE org_id=$1 AND type=$2 AND normalized_name=$3',
    [orgId, type, normalized],
  );
  if (existingRows[0]) return existingRows[0].id;

  const id = uid('ake');
  await pool.query(
    `INSERT INTO ai_knowledge_entities (id, org_id, type, name, normalized_name, linked_user_id, linked_project_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id, type, normalized_name) DO NOTHING`,
    [id, orgId, type, cleanName, normalized, linkedUserId, linkedProjectId],
  );
  // Se a corrida aconteceu (ON CONFLICT DO NOTHING não inseriu), busca
  // de novo pra devolver o id que realmente ficou gravado.
  const { rows: finalRows } = await pool.query(
    'SELECT id FROM ai_knowledge_entities WHERE org_id=$1 AND type=$2 AND normalized_name=$3',
    [orgId, type, normalized],
  );
  return finalRows[0].id;
}

// Liga um fato a uma lista de menções `{name, type}` — usado tanto pela
// proposta da IA (server/assistantActions.js) quanto por uma ligação
// manual feita no drawer (server/knowledge.js). `mention_count` só
// incrementa quando o vínculo fato↔entidade é REALMENTE novo (nunca no
// caminho "já existia essa ligação").
export async function linkFactEntities(pool, { factId, orgId, entityMentions, projectData, projectId }) {
  const linked = [];
  for (const mention of (entityMentions || [])) {
    if (!mention || !mention.name || !mention.type) continue;
    const entityId = await findOrCreateEntity(pool, { orgId, type: mention.type, name: mention.name, projectData, projectId });
    const { rows } = await pool.query(
      `INSERT INTO ai_knowledge_fact_entities (id, fact_id, entity_id) VALUES ($1,$2,$3)
       ON CONFLICT (fact_id, entity_id) DO NOTHING
       RETURNING id`,
      [uid('akfe'), factId, entityId],
    );
    if (rows[0]) {
      await pool.query('UPDATE ai_knowledge_entities SET mention_count = mention_count + 1, updated_at = now() WHERE id=$1', [entityId]);
    }
    linked.push(entityId);
  }
  return linked;
}

export async function unlinkFactEntity(pool, { factId, entityId }) {
  const { rows } = await pool.query(
    'DELETE FROM ai_knowledge_fact_entities WHERE fact_id=$1 AND entity_id=$2 RETURNING id',
    [factId, entityId],
  );
  if (rows[0]) {
    await pool.query('UPDATE ai_knowledge_entities SET mention_count = GREATEST(mention_count - 1, 0), updated_at = now() WHERE id=$1', [entityId]);
  }
  return !!rows[0];
}

// Lista entidades (Pessoas/Empresas) — só as que têm ao menos um fato
// LIGADO e VISÍVEL pro usuário (escopo 'org', ou 'project' dentro de
// accessibleProjectIds) — mesmo funil permissão→escopo do resto da
// Fase 8, nunca lista uma entidade só porque existe na org sem checar
// se algum fato ligado a ela é realmente acessível.
export async function listEntities(pool, { orgId, accessibleProjectIds, type, query }) {
  const params = [orgId];
  const conditions = ['e.org_id = $1'];
  if (type) { params.push(type); conditions.push(`e.type = $${params.length}`); }
  if (query) { params.push(`%${query}%`); conditions.push(`e.name ILIKE $${params.length}`); }
  params.push(accessibleProjectIds.length ? accessibleProjectIds : ['__none__']);
  const visibilityClause = `EXISTS (
    SELECT 1 FROM ai_knowledge_fact_entities fe
    JOIN ai_knowledge_facts f ON f.id = fe.fact_id
    WHERE fe.entity_id = e.id
      AND f.status NOT IN ('archived','superseded')
      AND (f.scope = 'org' OR (f.scope IN ('project','conversation') AND f.project_id = ANY($${params.length}::text[])))
  )`;
  const { rows } = await pool.query(
    `SELECT e.id, e.type, e.name, e.linked_user_id, e.linked_project_id, e.mention_count, e.created_at
     FROM ai_knowledge_entities e
     WHERE ${conditions.join(' AND ')} AND ${visibilityClause}
     ORDER BY e.mention_count DESC, e.name ASC`,
    params,
  );
  return rows;
}

export async function getEntityDetail(pool, { orgId, accessibleProjectIds, entityId }) {
  const { rows: entityRows } = await pool.query('SELECT * FROM ai_knowledge_entities WHERE id=$1 AND org_id=$2', [entityId, orgId]);
  const entity = entityRows[0];
  if (!entity) return null;

  const projectFilter = accessibleProjectIds.length ? accessibleProjectIds : ['__none__'];
  const { rows: facts } = await pool.query(
    `SELECT f.id, f.subject, f.content, f.knowledge_type, f.scope, f.status, f.project_id, f.created_at
     FROM ai_knowledge_fact_entities fe
     JOIN ai_knowledge_facts f ON f.id = fe.fact_id
     WHERE fe.entity_id = $1
       AND f.status NOT IN ('archived','superseded')
       AND (f.scope = 'org' OR (f.scope IN ('project','conversation') AND f.project_id = ANY($2::text[])))
     ORDER BY f.created_at DESC`,
    [entityId, projectFilter],
  );
  return { entity, facts, projectCount: new Set(facts.map((f) => f.project_id).filter(Boolean)).size };
}
