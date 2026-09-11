// Cache semântico de perguntas/respostas da RENATA (Fase 7, 2026-09-11)
// — modo "seguro", ver PROJECT_CONTEXT.md pro racional completo. A
// chave é a pergunta já RESOLVIDA (participant/meetingId/kind, saída de
// resolveQuery em server/assistantRetrieval.js), não o texto cru do
// usuário — evita reaproveitar resposta certa pra pergunta parecida mas
// com intenção diferente (ex.: pendências do Evanio vs. do Rafael).
//
// GARANTIA DE ESCOPO (mesma invariante de server/knowledgeFacts.js):
// toda leitura aqui filtra por org_id/project_id no SQL ANTES de
// qualquer cálculo de similaridade em JS — um cache de um projeto nunca
// é candidato pra pergunta de outro projeto só por parecer semanticamente
// igual.
import { cosineSimilarity } from './embeddings.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Calibrado empiricamente (script local, embeddings reais, input_type
// 'query'): duas perguntas parafraseadas com a mesma intenção ficam em
// ~0.89-0.90 de similaridade; perguntas genuinamente diferentes ficam
// bem abaixo de 0.2 — margem enorme. 0.95 (primeiro palpite, sem medir)
// era alto demais e nunca dava acerto nem em paráfrase óbvia. 0.85 tem
// folga confortável dos dois lados, e ainda conta com a camada extra de
// segurança de exigir participant/meetingId/kind idênticos (ver
// lookupCachedAnswer) — não é só a similaridade que decide.
const CACHE_SIMILARITY_THRESHOLD = 0.85;

// Muda sozinho quando o projeto é editado (updatedAt) ou quando o dia
// muda — perguntas sensíveis a data ("o que preciso fazer hoje") nunca
// ficam presas num cache de ontem. Grosseiro (invalida tudo do projeto
// de uma vez) mas seguro, mesmo espírito do reindex-needed (Fase 6).
// Fase 7.1: deixa de ser a ÚNICA defesa — ver `isStillFresh` abaixo,
// que invalida por DEPENDÊNCIA real (reunião/fato específico), sem
// precisar derrubar o cache do projeto inteiro por uma edição que não
// tem nada a ver com a pergunta cacheada.
export function computeFingerprint(projectUpdatedAt, todayIsoStr) {
  return `${new Date(projectUpdatedAt).toISOString()}|${todayIsoStr}`;
}

// Fase 7.1 (pedido do Rafael: "não quero apenas TTL como segurança") —
// pra cada resposta cacheada, checa se alguma das fontes reais que a
// formaram mudou depois que ela foi salva:
// 1. alguma reunião citada foi reindexada (chunk novo/atualizado) depois
//    do cache → a reunião pode ter conteúdo diferente agora.
// 2. algum fato de conhecimento citado mudou de status/conteúdo, ou
//    deixou de valer (archived/superseded) → a resposta pode citar algo
//    que não é mais verdade.
// 3. surgiu um fato NOVO no escopo (org ou projeto) depois do cache →
//    pode ser informação relevante que a resposta cacheada não tinha.
// Qualquer uma dessas condições falhando = cache inelegível, mesmo com
// fingerprint batendo e similaridade alta.
export async function isStillFresh(pool, { orgId, projectId, createdAt, dependencyMeetingIds, dependencyFactIds }) {
  const meetingIds = dependencyMeetingIds || [];
  if (meetingIds.length) {
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(created_at), to_timestamp(0)) AS max_created
       FROM project_memory_chunks WHERE project_id = $1 AND meeting_id = ANY($2::text[])`,
      [projectId, meetingIds],
    );
    if (new Date(rows[0].max_created) > new Date(createdAt)) return false;
  }

  const factIds = dependencyFactIds || [];
  if (factIds.length) {
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(updated_at), to_timestamp(0)) AS max_updated,
              COUNT(*) FILTER (WHERE status IN ('archived', 'superseded')) AS gone_count,
              COUNT(*) AS found_count
       FROM ai_knowledge_facts WHERE id = ANY($1::text[])`,
      [factIds],
    );
    const row = rows[0];
    if (new Date(row.max_updated) > new Date(createdAt)) return false;
    if (Number(row.gone_count) > 0) return false;
    if (Number(row.found_count) < factIds.length) return false;
  }

  const { rows: newFactRows } = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM ai_knowledge_facts
       WHERE org_id = $1 AND created_at > $2 AND status NOT IN ('archived', 'superseded')
         AND (scope = 'org' OR (scope = 'project' AND project_id = $3))
     ) AS has_new`,
    [orgId, createdAt, projectId],
  );
  if (newFactRows[0].has_new) return false;

  return true;
}

// Só considera candidatos do MESMO projeto, MESMO fingerprint (dado não
// mudou "grosso") e MESMOS participant/meetingId/kind resolvidos
// (igualdade exata, null-safe via IS NOT DISTINCT FROM) — a similaridade
// semântica só decide ENTRE esses, nunca sozinha. Fase 7.1: depois de
// achar o melhor candidato por similaridade, ainda checa `isStillFresh`
// antes de aceitar — um candidato "grosseiramente" válido (fingerprint
// bate) pode estar fino (uma dependência real dele mudou).
export async function lookupCachedAnswer(pool, { orgId, projectId, fingerprint, participant, meetingId, kind, queryEmbedding }) {
  const { rows } = await pool.query(
    `SELECT id, structured, cited_sources, cited_fact_ids, has_evidence, query_embedding, created_at,
            dependency_meeting_ids, dependency_fact_ids, tokens_input, tokens_output
     FROM ai_answer_cache
     WHERE project_id = $1 AND data_fingerprint = $2
       AND participant IS NOT DISTINCT FROM $3
       AND meeting_id IS NOT DISTINCT FROM $4
       AND kind IS NOT DISTINCT FROM $5`,
    [projectId, fingerprint, participant || null, meetingId || null, kind || null],
  );
  const candidates = [];
  for (const row of rows) {
    const sim = cosineSimilarity(queryEmbedding, row.query_embedding);
    if (sim >= CACHE_SIMILARITY_THRESHOLD) candidates.push({ ...row, similarity: sim });
  }
  candidates.sort((a, b) => b.similarity - a.similarity);

  for (const candidate of candidates) {
    const fresh = await isStillFresh(pool, {
      orgId,
      projectId,
      createdAt: candidate.created_at,
      dependencyMeetingIds: candidate.dependency_meeting_ids || [],
      dependencyFactIds: candidate.dependency_fact_ids || [],
    });
    if (!fresh) continue;
    // Fire-and-forget — atualizar o contador nunca deve atrasar a resposta.
    pool.query(`UPDATE ai_answer_cache SET hit_count = hit_count + 1, last_used_at = now() WHERE id=$1`, [candidate.id]).catch(() => {});
    return {
      structured: candidate.structured,
      citedSources: candidate.cited_sources || [],
      citedFactIds: candidate.cited_fact_ids || [],
      hasEvidence: candidate.has_evidence,
      tokensInput: candidate.tokens_input || 0,
      tokensOutput: candidate.tokens_output || 0,
    };
  }
  return candidates.length ? { staleCandidate: true } : null;
}

// Nunca chamado quando a resposta tinha proposedAction — reaproveitar
// uma ação proposta fora de contexto é perigoso (ver askProjectAssistant).
export async function saveCachedAnswer(pool, {
  orgId, projectId, standaloneQuery, queryEmbedding, participant, meetingId, kind,
  structured, citedSources, hasEvidence, fingerprint,
  dependencyMeetingIds, dependencyFactIds, citedFactIds, tokensInput, tokensOutput,
}) {
  const id = uid('aac');
  await pool.query(
    `INSERT INTO ai_answer_cache
      (id, org_id, project_id, standalone_query, query_embedding, participant, meeting_id, kind,
       structured, cited_sources, has_evidence, data_fingerprint,
       dependency_meeting_ids, dependency_fact_ids, cited_fact_ids, tokens_input, tokens_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id, orgId, projectId, standaloneQuery, JSON.stringify(queryEmbedding),
      participant || null, meetingId || null, kind || null,
      JSON.stringify(structured), JSON.stringify(citedSources || []), !!hasEvidence, fingerprint,
      JSON.stringify(dependencyMeetingIds || []), JSON.stringify(dependencyFactIds || []), JSON.stringify(citedFactIds || []),
      tokensInput || 0, tokensOutput || 0,
    ],
  );
  return id;
}
