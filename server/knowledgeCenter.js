// Central de Conhecimento — regra de negócio do admin (Fase 8,
// 2026-09-11, ver PROJECT_CONTEXT.md §39 pro desenho completo). Toda
// função aqui recebe `accessibleProjectIds` já calculado
// (server/permissions.js `listAccessibleProjectIds`) — NUNCA calcula
// permissão internamente, e SEMPRE filtra org_id + escopo/projeto no
// SQL antes de qualquer similaridade em JS, replicando o mesmo padrão
// de segurança já usado em server/memoryRetrieval.js
// `searchProjectMemory`: PERMISSÃO → ESCOPO → BUSCA SEMÂNTICA, nunca a
// ordem inversa.
import { voyageConfigured, embedTexts, cosineSimilarity } from './embeddings.js';
import { logMetric } from './metrics.js';
import { todayIso } from './assistantContext.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Cláusula de escopo/projeto reutilizada em toda query desta tela —
// única fonte da regra "conhecimento organizacional aparece em todo
// projeto autorizado; conhecimento de projeto/conversa só no(s)
// projeto(s) que o usuário pode acessar". `alias` é o alias da tabela
// ai_knowledge_facts na query (normalmente 'f').
function scopeAccessSQL(alias, projectsParamIdx) {
  return `(${alias}.scope = 'org' OR (${alias}.scope IN ('project','conversation') AND ${alias}.project_id = ANY($${projectsParamIdx}::text[])))`;
}

function safeProjectFilter(accessibleProjectIds) {
  // Postgres aceita ANY('{}'::text[]) sem erro (nunca casa nada) — mas
  // um array JS vazio via node-pg às vezes precisa de um placeholder
  // explícito pra não ambiguar o tipo; um id que nunca existe de
  // verdade é mais simples e igualmente seguro (nega por padrão).
  return accessibleProjectIds && accessibleProjectIds.length ? accessibleProjectIds : ['__none__'];
}

// Fase 8, item 12 do pedido do Rafael — 3 níveis, todos reaproveitando
// `user.role`/`accessibleProjectIds` já existentes, sem role/tabela
// nova: fato `scope='org'`/`'global'` (conhecimento organizacional) só
// pode ser editado/resolvido por quem é `role==='master'`
// (administrador); fato de projeto/conversa exige `role` master OU
// pricetax (gestor) E o projeto estar entre os acessíveis dele.
export function checkFactMutationPermission(user, fact, accessibleProjectIds) {
  if (!user || !fact) return false;
  if (fact.scope === 'org' || fact.scope === 'global') return user.role === 'master';
  return (user.role === 'master' || user.role === 'pricetax') && accessibleProjectIds.includes(fact.project_id);
}

// ---------------------------------------------------------------------
// Visão Geral
// ---------------------------------------------------------------------

export async function getOverview(pool, { orgId, accessibleProjectIds }) {
  const projectFilter = safeProjectFilter(accessibleProjectIds);

  const { rows: kpiRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE f.status = 'active' AND (f.valid_until IS NULL OR f.valid_until >= CURRENT_DATE)) AS active_count,
       COUNT(*) FILTER (WHERE f.scope = 'org') AS org_count,
       COUNT(*) FILTER (WHERE f.scope = 'project') AS project_count,
       COUNT(*) FILTER (WHERE f.scope = 'conversation') AS conversation_count,
       COUNT(*) FILTER (WHERE f.status = 'pending_validation') AS pending_count,
       COUNT(*) FILTER (WHERE f.status = 'disputed') AS disputed_rows,
       COUNT(*) FILTER (WHERE f.status = 'superseded') AS superseded_count,
       COUNT(*) FILTER (WHERE f.created_at >= now() - interval '7 days') AS recent_count
     FROM ai_knowledge_facts f
     WHERE f.org_id = $1 AND ${scopeAccessSQL('f', 2)}`,
    [orgId, projectFilter],
  );
  const kpis = kpiRows[0];

  const { rows: metricRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'cache_hit') AS cache_hits,
       COUNT(*) FILTER (WHERE event_type = 'cache_miss') AS cache_misses,
       COALESCE(SUM((metadata->>'tokensSavedInput')::int) FILTER (WHERE event_type = 'cache_hit'), 0) AS tokens_saved_input,
       COALESCE(SUM((metadata->>'tokensSavedOutput')::int) FILTER (WHERE event_type = 'cache_hit'), 0) AS tokens_saved_output
     FROM ai_metrics_events
     WHERE org_id = $1 AND (project_id IS NULL OR project_id = ANY($2::text[]))`,
    [orgId, projectFilter],
  );
  const cacheStats = metricRows[0];

  const { rows: recentFacts } = await pool.query(
    `SELECT f.id, f.subject, f.content, f.knowledge_type, f.scope, f.project_id, f.created_at, u.name AS source_user_name
     FROM ai_knowledge_facts f
     LEFT JOIN users u ON u.id = f.source_user_id
     WHERE f.org_id = $1 AND ${scopeAccessSQL('f', 2)}
     ORDER BY f.created_at DESC
     LIMIT 8`,
    [orgId, projectFilter],
  );

  const { rows: needsAttention } = await pool.query(
    `SELECT f.id, f.subject, f.content, f.conflicts_with, f.project_id, f.created_at
     FROM ai_knowledge_facts f
     WHERE f.org_id = $1 AND f.status = 'disputed' AND f.disputed_reviewed_at IS NULL AND ${scopeAccessSQL('f', 2)}
     ORDER BY f.created_at DESC
     LIMIT 8`,
    [orgId, projectFilter],
  );

  const { rows: mostUsed } = await pool.query(
    `WITH usage AS (
       SELECT jsonb_array_elements_text(m.cited_fact_ids) AS fact_id
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.org_id = $1 AND c.project_id = ANY($2::text[])
     )
     SELECT f.id, f.subject, f.knowledge_type, count(*)::int AS usage_count
     FROM usage u
     JOIN ai_knowledge_facts f ON f.id = u.fact_id
     GROUP BY f.id, f.subject, f.knowledge_type
     ORDER BY usage_count DESC
     LIMIT 5`,
    [orgId, projectFilter],
  );

  return {
    kpis: {
      active: Number(kpis.active_count), org: Number(kpis.org_count), project: Number(kpis.project_count),
      conversation: Number(kpis.conversation_count), pendingValidation: Number(kpis.pending_count),
      // `disputed_rows` conta as DUAS linhas de cada par em conflito —
      // dividido por 2 vira "quantos conflitos", que é o número que faz
      // sentido pro executivo ver (não "quantas linhas estão em disputa").
      conflicts: Math.ceil(Number(kpis.disputed_rows) / 2),
      superseded: Number(kpis.superseded_count), recentlyLearned: Number(kpis.recent_count),
      cacheHits: Number(cacheStats.cache_hits), cacheMisses: Number(cacheStats.cache_misses),
      tokensSaved: Number(cacheStats.tokens_saved_input) + Number(cacheStats.tokens_saved_output),
    },
    recentlyLearned: recentFacts,
    needsAttention,
    mostUsed,
  };
}

// ---------------------------------------------------------------------
// Memórias — busca híbrida (lexical + semântica), mesmo padrão de
// server/memoryRetrieval.js `searchProjectMemory`.
// ---------------------------------------------------------------------

export async function searchKnowledgeFacts(pool, { orgId, accessibleProjectIds, q, filters = {}, limit = 30, offset = 0 }) {
  const query = (q || '').trim();
  const limitClamped = Math.min(Math.max(limit, 1), 100);
  const offsetClamped = Math.max(offset, 0);
  const projectFilter = safeProjectFilter(accessibleProjectIds);

  function buildBaseConditions() {
    const conditions = ['f.org_id = $1', scopeAccessSQL('f', 2)];
    const params = [orgId, projectFilter];
    function addParam(value) { params.push(value); return `$${params.length}`; }
    if (filters.status) {
      conditions.push(`f.status = ${addParam(filters.status)}`);
    } else {
      // Default = "verdade atual": nunca mostra archived/superseded nem
      // um 'active' com valid_until já vencido (achado real corrigido
      // na Fase 8) — quem quer ver histórico descartado filtra status
      // explicitamente.
      conditions.push(`f.status NOT IN ('archived','superseded')`);
      conditions.push(`(f.valid_until IS NULL OR f.valid_until >= CURRENT_DATE)`);
    }
    if (filters.knowledgeType) conditions.push(`f.knowledge_type = ${addParam(filters.knowledgeType)}`);
    if (filters.scope) conditions.push(`f.scope = ${addParam(filters.scope)}`);
    if (filters.projectId) conditions.push(`f.project_id = ${addParam(filters.projectId)}`);
    if (filters.origin) conditions.push(`f.origin = ${addParam(filters.origin)}`);
    if (filters.dateFrom) conditions.push(`f.created_at >= ${addParam(filters.dateFrom)}`);
    if (filters.dateTo) conditions.push(`f.created_at <= ${addParam(filters.dateTo)}`);
    if (filters.personEntityId) conditions.push(`f.id IN (SELECT fact_id FROM ai_knowledge_fact_entities WHERE entity_id = ${addParam(filters.personEntityId)})`);
    return { conditions, params, addParam };
  }

  const SELECT_COLUMNS = `f.id, f.subject, f.content, f.knowledge_type, f.scope, f.status, f.project_id,
    f.valid_from, f.valid_until, f.origin, f.reference, f.source_meeting_id, f.source_user_id,
    f.conflicts_with, f.created_at, u.name AS source_user_name`;

  // Sem texto de busca: lista filtrada simples, com paginação de
  // verdade (offset). Com texto: busca híbrida pontuada (mesmo padrão
  // de searchProjectMemory) — não pagina por offset nesse caso (juntar
  // duas pernas pontuadas com offset é mais complexidade do que vale
  // pra uma busca que se refina em vez de rolar página after page).
  if (!query) {
    const { conditions, params, addParam } = buildBaseConditions();
    const limitParam = addParam(limitClamped);
    const offsetParam = addParam(offsetClamped);
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM ai_knowledge_facts f LEFT JOIN users u ON u.id = f.source_user_id
       WHERE ${conditions.join(' AND ')} ORDER BY f.created_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return rows;
  }

  async function runLexicalSearch(mode) {
    const { conditions, params, addParam } = buildBaseConditions();
    const queryText = mode === 'or' ? query.split(/\s+/).filter(Boolean).join(' OR ') : query;
    const qParam = addParam(queryText);
    const tsqFn = mode === 'or' ? 'websearch_to_tsquery' : 'plainto_tsquery';
    const tsq = `${tsqFn}('portuguese', immutable_unaccent(${qParam}))`;
    conditions.push(`f.content_tsv @@ ${tsq}`);
    const limitParam = addParam(limitClamped);
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS}, ts_rank_cd(f.content_tsv, ${tsq}) AS score
       FROM ai_knowledge_facts f LEFT JOIN users u ON u.id = f.source_user_id
       WHERE ${conditions.join(' AND ')} ORDER BY score DESC, f.created_at DESC LIMIT ${limitParam}`,
      params,
    );
    return rows;
  }

  let lexicalRows = await runLexicalSearch('and');
  if (lexicalRows.length === 0) lexicalRows = await runLexicalSearch('or');

  let semanticRows = [];
  if (voyageConfigured()) {
    try {
      const [queryVector] = await embedTexts([query], 'query');
      const { conditions, params } = buildBaseConditions();
      conditions.push('f.embedding IS NOT NULL');
      const { rows: candidates } = await pool.query(
        `SELECT ${SELECT_COLUMNS}, f.embedding
         FROM ai_knowledge_facts f LEFT JOIN users u ON u.id = f.source_user_id
         WHERE ${conditions.join(' AND ')}`,
        params,
      );
      semanticRows = candidates
        .map((r) => ({ ...r, score: cosineSimilarity(queryVector, r.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limitClamped);
    } catch (e) {
      console.error('Central de Conhecimento: busca semântica falhou, seguindo só com a busca lexical.', e.message);
    }
  }

  const byId = new Map();
  [...lexicalRows, ...semanticRows].forEach((r) => {
    const prev = byId.get(r.id);
    if (prev) prev.score += Number(r.score);
    else byId.set(r.id, { ...r, score: Number(r.score) });
  });
  return Array.from(byId.values()).sort((a, b) => b.score - a.score).slice(0, limitClamped);
}

// ---------------------------------------------------------------------
// Card/drawer de um fato — histórico, entidades, utilização, eventos.
// ---------------------------------------------------------------------

// Caminha a cadeia superseded_by/superseded-de-quem em JS (não uma CTE
// recursiva) com um teto de 25 saltos — cadeias reais são curtas; um
// dado que estourasse isso seria um sinal de algo incomum que merece
// investigação manual, não um algoritmo mais sofisticado preventivo.
const MAX_SUPERSEDE_HOPS = 25;

async function walkSupersedeChain(pool, factId) {
  let rootId = factId;
  for (let i = 0; i < MAX_SUPERSEDE_HOPS; i++) {
    const { rows } = await pool.query('SELECT id FROM ai_knowledge_facts WHERE superseded_by = $1 LIMIT 1', [rootId]);
    if (!rows[0]) break;
    rootId = rows[0].id;
  }
  const chain = [];
  let currentId = rootId;
  for (let i = 0; i < MAX_SUPERSEDE_HOPS; i++) {
    const { rows } = await pool.query(
      `SELECT f.id, f.content, f.subject, f.status, f.knowledge_type, f.superseded_by, f.supersede_reason,
              f.valid_from, f.valid_until, f.created_at, u.name AS source_user_name
       FROM ai_knowledge_facts f LEFT JOIN users u ON u.id = f.source_user_id WHERE f.id = $1`,
      [currentId],
    );
    const row = rows[0];
    if (!row) break;
    chain.push(row);
    if (!row.superseded_by) break;
    currentId = row.superseded_by;
  }
  return chain;
}

export async function getFactDetail(pool, { orgId, accessibleProjectIds, factId }) {
  const { rows } = await pool.query('SELECT * FROM ai_knowledge_facts WHERE id=$1 AND org_id=$2', [factId, orgId]);
  const fact = rows[0];
  if (!fact) return null;
  if (fact.scope !== 'org' && fact.scope !== 'global' && !accessibleProjectIds.includes(fact.project_id)) return null;

  const projectFilter = safeProjectFilter(accessibleProjectIds);
  const [chain, entityRows, usageRows, eventRows] = await Promise.all([
    walkSupersedeChain(pool, factId),
    pool.query(
      `SELECT e.id, e.type, e.name FROM ai_knowledge_fact_entities fe
       JOIN ai_knowledge_entities e ON e.id = fe.entity_id WHERE fe.fact_id=$1`,
      [factId],
    ).then((r) => r.rows),
    pool.query(
      `SELECT count(*)::int AS usage_count, count(DISTINCT c.project_id)::int AS project_count, max(m.created_at) AS last_used_at
       FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.org_id=$1 AND c.project_id = ANY($2::text[]) AND m.cited_fact_ids @> jsonb_build_array($3::text)`,
      [orgId, projectFilter, factId],
    ).then((r) => r.rows[0]),
    // Eventos ligados a este fato — as chaves de metadata variam por
    // tipo de evento (histórico natural desde a Fase 7.1: newId/
    // existingId/oldId nos 4 eventos de classificação automática,
    // factId/previousFactId/factIdA/factIdB nos eventos manuais desta
    // fase) — cobrir todas é o que monta a timeline completa.
    pool.query(
      `SELECT event_type, metadata, created_at FROM ai_metrics_events
       WHERE org_id=$1 AND (
         metadata->>'newId' = $2 OR metadata->>'existingId' = $2 OR metadata->>'oldId' = $2 OR
         metadata->>'factId' = $2 OR metadata->>'previousFactId' = $2 OR
         metadata->>'factIdA' = $2 OR metadata->>'factIdB' = $2
       )
       ORDER BY created_at ASC`,
      [orgId, factId],
    ).then((r) => r.rows),
  ]);

  return {
    fact,
    chain,
    entities: entityRows,
    usage: { count: Number(usageRows.usage_count), projectCount: Number(usageRows.project_count), lastUsedAt: usageRows.last_used_at },
    events: eventRows,
  };
}

// Edição controlada (item 5 do pedido do Rafael): NUNCA um UPDATE de
// conteúdo — sempre uma linha NOVA, a antiga vira 'superseded' com o
// motivo gravado na linha nova. É a generalização manual do mesmo
// padrão que classifyRelation já usa pra atualização automática
// (Fase 7.1) — não uma lógica de versionamento nova/paralela. As
// ligações de entidade da linha antiga são copiadas pra linha nova (é
// o MESMO conhecimento, só corrigido — não faria sentido "esquecer" que
// o fato era sobre o Felipe só porque um typo foi corrigido).
export async function editFactVersioned(pool, {
  orgId, factId, actingUser, newContent, newKnowledgeType, newValidFrom, newOrigin, newReference, newSourceDate, reason,
}) {
  const { rows } = await pool.query('SELECT * FROM ai_knowledge_facts WHERE id=$1 AND org_id=$2', [factId, orgId]);
  const oldFact = rows[0];
  if (!oldFact) throw new Error('Conhecimento não encontrado.');
  if (!(reason || '').trim()) throw new Error('Informe o motivo da edição.');
  const content = (newContent || '').trim() || oldFact.content;

  let embedding = null;
  try {
    [embedding] = await embedTexts([content], 'document');
  } catch (e) {
    console.error('Central de Conhecimento: falha ao embedar edição — gravando sem embedding novo.', e.message);
  }

  const newId = uid('akf');
  const validFrom = newValidFrom || oldFact.valid_from;
  await pool.query(
    `INSERT INTO ai_knowledge_facts
      (id, org_id, project_id, scope, subject, content, status, knowledge_type, valid_from,
       source_user_id, source_conversation_id, embedding, origin, reference, source_date,
       source_meeting_id, supersede_reason)
     VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,NULL,$10,$11,$12,$13,$14,$15)`,
    [
      newId, orgId, oldFact.project_id, oldFact.scope, oldFact.subject, content,
      newKnowledgeType || oldFact.knowledge_type, validFrom || null,
      actingUser.id, embedding ? JSON.stringify(embedding) : null,
      newOrigin || oldFact.origin, newReference != null ? newReference : oldFact.reference,
      newSourceDate || oldFact.source_date, oldFact.source_meeting_id, reason.trim(),
    ],
  );
  await pool.query(
    `UPDATE ai_knowledge_facts SET status='superseded', superseded_by=$1, valid_until=$2, updated_at=now() WHERE id=$3`,
    [newId, validFrom || todayIso(), factId],
  );
  await pool.query(
    `INSERT INTO ai_knowledge_fact_entities (id, fact_id, entity_id)
     SELECT $1 || '-' || row_number() OVER (), $1, entity_id FROM ai_knowledge_fact_entities WHERE fact_id=$2
     ON CONFLICT (fact_id, entity_id) DO NOTHING`,
    [newId, factId],
  );

  logMetric(pool, { orgId, projectId: oldFact.project_id, eventType: 'fact_edited', metadata: { factId: newId, previousFactId: factId, subject: oldFact.subject, reason: reason.trim() } }).catch(() => {});
  return { id: newId, previousId: factId };
}

// ---------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------

export async function listConflicts(pool, { orgId, accessibleProjectIds, includeReviewed = false }) {
  const projectFilter = safeProjectFilter(accessibleProjectIds);
  const reviewedClause = includeReviewed ? '' : 'AND a.disputed_reviewed_at IS NULL';
  const { rows } = await pool.query(
    `SELECT
       a.id AS fact_a_id, a.subject AS subject, a.content AS content_a, a.knowledge_type AS knowledge_type,
       a.scope AS scope, a.project_id AS project_id, a.created_at AS created_at_a, ua.name AS source_user_name_a,
       b.id AS fact_b_id, b.content AS content_b, b.created_at AS created_at_b, ub.name AS source_user_name_b,
       a.disputed_reviewed_at, a.disputed_reviewed_by
     FROM ai_knowledge_facts a
     JOIN ai_knowledge_facts b ON b.id = a.conflicts_with
     LEFT JOIN users ua ON ua.id = a.source_user_id
     LEFT JOIN users ub ON ub.id = b.source_user_id
     WHERE a.org_id = $1 AND a.id < b.id
       AND a.status = 'disputed' AND b.status = 'disputed'
       AND ${scopeAccessSQL('a', 2)}
       ${reviewedClause}
     ORDER BY a.created_at DESC`,
    [orgId, projectFilter],
  );
  return rows;
}

// 6 desfechos possíveis (item 6 do pedido do Rafael) — todos só usam
// UPDATE sobre status/superseded_by/conflicts_with/disputed_reviewed_at
// já existentes, NUNCA um DELETE. `temporal_update` é literalmente o
// ramo 'update' de classifyRelation (server/knowledgeFacts.js) acionado
// à mão em vez de automático.
const VALID_RESOLUTIONS = new Set(['keep_a', 'keep_b', 'temporal_update', 'complement', 'archive_both', 'mark_reviewed']);

export async function resolveConflict(pool, { orgId, factIdA, factIdB, resolution, olderFactId, actingUser, reason }) {
  if (!VALID_RESOLUTIONS.has(resolution)) throw new Error('Resolução inválida.');
  const { rows } = await pool.query('SELECT * FROM ai_knowledge_facts WHERE id = ANY($1::text[]) AND org_id=$2', [[factIdA, factIdB], orgId]);
  const factA = rows.find((r) => r.id === factIdA);
  const factB = rows.find((r) => r.id === factIdB);
  if (!factA || !factB) throw new Error('Conhecimento não encontrado.');
  if (factA.conflicts_with !== factB.id && factB.conflicts_with !== factA.id) {
    throw new Error('Esses dois conhecimentos não estão marcados como conflitantes.');
  }

  if (resolution === 'keep_a' || resolution === 'keep_b') {
    const keptId = resolution === 'keep_a' ? factA.id : factB.id;
    const discardedId = resolution === 'keep_a' ? factB.id : factA.id;
    await pool.query(`UPDATE ai_knowledge_facts SET status='archived', superseded_by=$1, conflicts_with=NULL, updated_at=now() WHERE id=$2`, [keptId, discardedId]);
    await pool.query(`UPDATE ai_knowledge_facts SET status='active', conflicts_with=NULL, updated_at=now() WHERE id=$1`, [keptId]);
  } else if (resolution === 'temporal_update') {
    if (![factA.id, factB.id].includes(olderFactId)) throw new Error('Informe qual dos dois é o mais antigo.');
    const olderId = olderFactId;
    const older = olderId === factA.id ? factA : factB;
    const newer = olderId === factA.id ? factB : factA;
    await pool.query(
      `UPDATE ai_knowledge_facts SET status='superseded', superseded_by=$1, valid_until=$2, conflicts_with=NULL, updated_at=now() WHERE id=$3`,
      [newer.id, newer.valid_from || todayIso(), older.id],
    );
    await pool.query(`UPDATE ai_knowledge_facts SET status='active', conflicts_with=NULL, updated_at=now() WHERE id=$1`, [newer.id]);
  } else if (resolution === 'complement') {
    await pool.query(`UPDATE ai_knowledge_facts SET status='active', conflicts_with=NULL, updated_at=now() WHERE id = ANY($1::text[])`, [[factA.id, factB.id]]);
  } else if (resolution === 'archive_both') {
    await pool.query(`UPDATE ai_knowledge_facts SET status='archived', conflicts_with=NULL, updated_at=now() WHERE id = ANY($1::text[])`, [[factA.id, factB.id]]);
  } else if (resolution === 'mark_reviewed') {
    // Único desfecho que NÃO muda status — os dois continuam 'disputed'
    // (a RENATA continua tratando como divergente no prompt), só marca
    // que um humano já olhou, pra sair da lista de "nunca visto".
    await pool.query(`UPDATE ai_knowledge_facts SET disputed_reviewed_at=now(), disputed_reviewed_by=$1, updated_at=now() WHERE id = ANY($2::text[])`, [actingUser.id, [factA.id, factB.id]]);
  }

  logMetric(pool, {
    orgId, projectId: factA.project_id || factB.project_id, eventType: 'conflict_resolved',
    metadata: { factIdA: factA.id, factIdB: factB.id, resolution, reason: (reason || '').trim() || null, actingUserId: actingUser.id },
  }).catch(() => {});
  return { resolution };
}

// ---------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------

export async function getMetrics(pool, { orgId, accessibleProjectIds, dateFrom, dateTo }) {
  const projectFilter = safeProjectFilter(accessibleProjectIds);
  const params = [orgId, projectFilter];
  let dateClause = '';
  if (dateFrom) { params.push(dateFrom); dateClause += ` AND created_at >= $${params.length}`; }
  if (dateTo) { params.push(dateTo); dateClause += ` AND created_at <= $${params.length}`; }

  const [eventRows, cacheAggRows, topFactRows, topProjectRows, topUserRows] = await Promise.all([
    pool.query(
      `SELECT event_type, count(*)::int AS count FROM ai_metrics_events
       WHERE org_id=$1 AND (project_id IS NULL OR project_id = ANY($2::text[]))${dateClause}
       GROUP BY event_type`,
      params,
    ).then((r) => r.rows),
    pool.query(
      `SELECT
         COALESCE(SUM((metadata->>'tokensSavedInput')::int) FILTER (WHERE event_type='cache_hit'), 0) AS tokens_saved_input,
         COALESCE(SUM((metadata->>'tokensSavedOutput')::int) FILTER (WHERE event_type='cache_hit'), 0) AS tokens_saved_output
       FROM ai_metrics_events WHERE org_id=$1 AND (project_id IS NULL OR project_id = ANY($2::text[]))${dateClause}`,
      params,
    ).then((r) => r.rows[0]),
    pool.query(
      `WITH usage AS (
         SELECT jsonb_array_elements_text(m.cited_fact_ids) AS fact_id
         FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
         WHERE c.org_id = $1 AND c.project_id = ANY($2::text[])
       )
       SELECT f.id, f.subject, f.knowledge_type, count(*)::int AS usage_count
       FROM usage u JOIN ai_knowledge_facts f ON f.id = u.fact_id
       GROUP BY f.id, f.subject, f.knowledge_type ORDER BY usage_count DESC LIMIT 10`,
      [orgId, projectFilter],
    ).then((r) => r.rows),
    pool.query(
      `SELECT f.project_id, count(*)::int AS facts_taught
       FROM ai_knowledge_facts f
       WHERE f.org_id=$1 AND f.project_id = ANY($2::text[])
       GROUP BY f.project_id ORDER BY facts_taught DESC LIMIT 10`,
      [orgId, projectFilter],
    ).then((r) => r.rows),
    pool.query(
      `SELECT u.id, u.name, count(*)::int AS facts_taught
       FROM ai_knowledge_facts f JOIN users u ON u.id = f.source_user_id
       WHERE f.org_id=$1 AND ${scopeAccessSQL('f', 2)}
       GROUP BY u.id, u.name ORDER BY facts_taught DESC LIMIT 10`,
      [orgId, projectFilter],
    ).then((r) => r.rows),
  ]);

  const events = Object.fromEntries(eventRows.map((r) => [r.event_type, r.count]));
  const hits = events.cache_hit || 0;
  const misses = events.cache_miss || 0;
  return {
    memory: {
      factsProposed: events.fact_proposed || 0, factsConfirmed: events.fact_confirmed || 0, factsRejected: events.fact_rejected || 0,
      conflictsDetected: events.conflict_detected || 0, temporalUpdates: events.temporal_update_detected || 0,
      duplicates: events.duplicate_detected || 0, complements: events.complement_detected || 0,
      factsEdited: events.fact_edited || 0, conflictsResolved: events.conflict_resolved || 0,
    },
    cache: {
      hits, misses, rejectedStale: events.cache_rejected_stale || 0,
      hitRate: (hits + misses) > 0 ? hits / (hits + misses) : null,
      tokensSavedInput: Number(cacheAggRows.tokens_saved_input), tokensSavedOutput: Number(cacheAggRows.tokens_saved_output),
    },
    topFacts: topFactRows,
    topProjects: topProjectRows,
    topUsers: topUserRows,
  };
}
