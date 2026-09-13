// RENATA Eval Harness — Fase 1. Chunk ids e fact ids são gerados
// aleatoriamente (uid()) pela ingestão real — não são estáveis entre uma
// reseed e outra. Em vez de hardcodar ids aleatórios em evalCases.js (frágil,
// ilegível), cada caso referencia evidência por uma CHAVE ESTÁVEL:
//   chunk:  "<meetingId>#<kind>#<índice da ocorrência daquele kind na reunião>"
//   fact:   "fact:<subject>"  (subject é definido por nós nas fixtures, único)
// Este módulo constrói o mapeamento chave<->id real consultando o Postgres
// depois da seed — nunca reimplementa a lógica de ingestão/geração de id.
export async function buildEvidenceKeyMaps(pool, projectId) {
  const { rows: chunkRows } = await pool.query(
    `SELECT id, meeting_id, kind, chunk_order, content FROM project_memory_chunks WHERE project_id=$1 ORDER BY meeting_id, chunk_order ASC`,
    [projectId],
  );
  const idToKey = new Map();
  const keyToId = new Map();
  const occurrenceCounters = new Map(); // `${meetingId}#${kind}` -> count
  for (const row of chunkRows) {
    const counterKey = `${row.meeting_id}#${row.kind}`;
    const idx = occurrenceCounters.get(counterKey) || 0;
    occurrenceCounters.set(counterKey, idx + 1);
    const key = `chunk:${row.meeting_id}#${row.kind}#${idx}`;
    idToKey.set(row.id, key);
    keyToId.set(key, row.id);
  }

  const { rows: factRows } = await pool.query(
    `SELECT id, subject FROM ai_knowledge_facts WHERE project_id=$1 ORDER BY created_at ASC`,
    [projectId],
  );
  for (const row of factRows) {
    const key = `fact:${row.subject}`;
    idToKey.set(row.id, key);
    // Um subject pode ter várias versões (ex.: v1/v2 do mesmo assunto) — a
    // chave `fact:<subject>` aponta pra ÚLTIMA (mais recente) por padrão,
    // que é o caso de uso mais comum ("o fato vigente sobre X"); casos que
    // precisam de uma versão específica usam `factVersionKey` abaixo.
    keyToId.set(key, row.id);
  }
  // Chaves versionadas explícitas, pra casos TEMPORAL que precisam apontar
  // pra uma versão ESPECÍFICA (não só "a mais recente").
  const bySubject = new Map();
  factRows.forEach((r) => {
    if (!bySubject.has(r.subject)) bySubject.set(r.subject, []);
    bySubject.get(r.subject).push(r.id);
  });
  bySubject.forEach((ids, subject) => {
    ids.forEach((id, i) => keyToId.set(`fact:${subject}#v${i + 1}`, id));
  });

  return { idToKey, keyToId, chunkRows, factRows };
}

// Traduz uma lista de candidatos retornados pelo trace (chunks OU facts, já
// que ambos têm `id`) numa lista de chaves estáveis, na MESMA ordem (ordem
// importa pra recall@K/MRR) — candidatos sem chave conhecida (não deveria
// acontecer, mas nunca quebra o eval por isso) viram `unknown:<id>`.
export function toStableKeys(items, idToKey) {
  return (items || []).map((item) => idToKey.get(item.id) || `unknown:${item.id}`);
}

// Mesma tradução, mas pra arrays de ids soltos (ex.: dependencyFactIds,
// citedFactIds, citedChunkIds) em vez de objetos com `.id`.
export function toStableKeysFromIds(ids, idToKey) {
  return (ids || []).map((id) => idToKey.get(id) || `unknown:${id}`);
}
