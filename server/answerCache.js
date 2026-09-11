// Cache semântico de perguntas/respostas da RENATA (Fase 7, 2026-09-11)
// — modo "seguro", ver PROJECT_CONTEXT.md pro racional completo. A
// chave é a pergunta já RESOLVIDA (participant/meetingId/kind, saída de
// resolveQuery em server/assistantRetrieval.js), não o texto cru do
// usuário — evita reaproveitar resposta certa pra pergunta parecida mas
// com intenção diferente (ex.: pendências do Evanio vs. do Rafael).
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
export function computeFingerprint(projectUpdatedAt, todayIsoStr) {
  return `${new Date(projectUpdatedAt).toISOString()}|${todayIsoStr}`;
}

// Só considera candidatos do MESMO projeto, MESMO fingerprint (dado não
// mudou) e MESMOS participant/meetingId/kind resolvidos (igualdade
// exata, null-safe via IS NOT DISTINCT FROM) — a similaridade semântica
// só decide ENTRE esses, nunca sozinha.
export async function lookupCachedAnswer(pool, { projectId, fingerprint, participant, meetingId, kind, queryEmbedding }) {
  const { rows } = await pool.query(
    `SELECT id, structured, cited_sources, has_evidence, query_embedding FROM ai_answer_cache
     WHERE project_id = $1 AND data_fingerprint = $2
       AND participant IS NOT DISTINCT FROM $3
       AND meeting_id IS NOT DISTINCT FROM $4
       AND kind IS NOT DISTINCT FROM $5`,
    [projectId, fingerprint, participant || null, meetingId || null, kind || null],
  );
  let best = null;
  for (const row of rows) {
    const sim = cosineSimilarity(queryEmbedding, row.query_embedding);
    if (sim >= CACHE_SIMILARITY_THRESHOLD && (!best || sim > best.similarity)) {
      best = { ...row, similarity: sim };
    }
  }
  if (!best) return null;
  // Fire-and-forget — atualizar o contador nunca deve atrasar a resposta.
  pool.query(`UPDATE ai_answer_cache SET hit_count = hit_count + 1, last_used_at = now() WHERE id=$1`, [best.id]).catch(() => {});
  return { structured: best.structured, citedSources: best.cited_sources || [], hasEvidence: best.has_evidence };
}

// Nunca chamado quando a resposta tinha proposedAction — reaproveitar
// uma ação proposta fora de contexto é perigoso (ver askProjectAssistant).
export async function saveCachedAnswer(pool, { orgId, projectId, standaloneQuery, queryEmbedding, participant, meetingId, kind, structured, citedSources, hasEvidence, fingerprint }) {
  const id = uid('aac');
  await pool.query(
    `INSERT INTO ai_answer_cache (id, org_id, project_id, standalone_query, query_embedding, participant, meeting_id, kind, structured, cited_sources, has_evidence, data_fingerprint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, orgId, projectId, standaloneQuery, JSON.stringify(queryEmbedding),
      participant || null, meetingId || null, kind || null,
      JSON.stringify(structured), JSON.stringify(citedSources || []), !!hasEvidence, fingerprint,
    ],
  );
  return id;
}
