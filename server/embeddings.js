// Embeddings pra busca semântica da RENATA (Fase 3, 2026-09 — ver
// PROJECT_CONTEXT.md). Provedor Voyage AI (parceiro de embeddings
// recomendado pela própria Anthropic) — chamado via `fetch` nativo, sem
// SDK novo, mesmo espírito minimalista do resto do projeto. Opcional:
// sem `VOYAGE_API_KEY` configurada, `voyageConfigured()` volta false e
// quem chama (server/memoryIngest.js, server/memoryRetrieval.js) pula a
// parte semântica e segue só com a busca lexical de sempre — nunca
// quebra por falta da chave.
const VOYAGE_EMBED_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const BATCH_SIZE = 100; // limite de segurança, não o limite exato da API

export function voyageConfigured() {
  return !!process.env.VOYAGE_API_KEY;
}

async function embedBatch(texts, inputType) {
  const res = await fetch(VOYAGE_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  // A API devolve `data` na mesma ordem da entrada, cada item com `index`
  // e `embedding` — ordena por `index` por segurança em vez de confiar
  // na ordem de chegada do array.
  return json.data.slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// `inputType`: 'document' pra texto sendo indexado (ingestão), 'query'
// pra pergunta do usuário — a Voyage otimiza o embedding de forma
// assimétrica pra cada papel, melhora a qualidade da busca de verdade
// (não é só um rótulo). Lança exceção se a chamada falhar; quem chama
// decide como degradar (ver comentário no topo do arquivo).
export async function embedTexts(texts, inputType) {
  if (!texts.length) return [];
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchVectors = await embedBatch(batch, inputType);
    vectors.push(...batchVectors);
  }
  return vectors;
}

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
