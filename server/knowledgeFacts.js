// Memória de conhecimento em camadas da RENATA (Fase 7, 2026-09-11;
// endurecida na Fase 7.1, mesma data — ver PROJECT_CONTEXT.md pro
// desenho completo). Um fato só chega aqui depois de confirmação
// explícita do usuário (mesmo fluxo de proposedAction das outras ações
// da RENATA, ver server/assistantActions.js `executeSaveKnowledgeFact`)
// — nunca automático.
//
// GARANTIA DE ESCOPO (Fase 7.1, item pedido pelo Rafael: "segurança e
// escopo antes de similaridade"): toda função aqui filtra por
// org_id/project_id/scope no SQL (WHERE) ANTES de qualquer cálculo de
// similaridade em JS. Não existe caminho de código onde um fato de um
// projeto aparece pra outro projeto só por parecer semanticamente
// igual — a comparação por embedding só acontece DENTRO do conjunto já
// filtrado. Ver server/_test_knowledge_isolation.mjs (script de teste,
// roda localmente).
import { embedTexts, cosineSimilarity } from './embeddings.js';
import { logMetric } from './metrics.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Calibrado empiricamente (script local, embeddings reais): comparar só
// o "assunto" curto (2-4 palavras) NÃO discrimina bem — frases curtas
// ficam todas parecidas entre si por natureza (~0.5-0.6 de similaridade
// mesmo entre assuntos sem nenhuma relação). Comparar o CONTEÚDO
// completo do fato funciona muito melhor: duas frases sobre o mesmo
// tópico mas contraditórias ("Felipe é o CEO" vs "Felipe não é mais
// CEO") ficam em ~0.86-0.87; frases sem relação ficam em ~0.48-0.58;
// paráfrases quase idênticas ficam em ~0.97+. Por isso o embedding
// gravado e comparado é do `content`, não do `subject` — o `subject`
// continua existindo só como rótulo legível pro texto injetado no
// prompt (`loadRelevantFacts`).
const DUPLICATE_SIMILARITY_THRESHOLD = 0.93; // praticamente a mesma frase, paráfrase
const CONFLICT_SIMILARITY_THRESHOLD = 0.75; // mesmo tópico, afirmações potencialmente diferentes

// Heurística de detecção de negação/cessação (Fase 7.1) — não é NLP
// perfeito, é regex sobre marcadores comuns em português. LIMITAÇÃO
// CONHECIDA E DOCUMENTADA (não escondida): um conflito sem nenhuma
// dessas palavras (ex.: "a reunião é terça" vs "a reunião é quinta")
// não é pego por isso, cai em 'complement' por engano; resolver de
// verdade exigiria uma chamada à IA a mais por fato, o que vai contra a
// economia de custo da Fase 6 — decisão consciente de não fazer isso
// agora (ver PROJECT_CONTEXT.md, seção de riscos da Fase 7.1).
const NEGATION_PATTERN = /\b(não|nao|nunca|deixou|deixaram|deixa de ser|ex-)\b|foi substitu[ií]d[oa]/i;

function hasNegationMarker(text) {
  return NEGATION_PATTERN.test(text || '');
}

// Acha o fato ativo/relevante mais parecido (por CONTEÚDO) no mesmo
// escopo (mesmo projeto, ou org inteira se scope='org', ou mesma
// conversa se scope='conversation') — nunca compara projetos diferentes
// entre si, nem escopos diferentes entre si (ver garantia de escopo no
// topo do arquivo). Ignora fatos já `archived`/`superseded` (não
// competem mais por ser "o fato vigente"). Retorna null se não achar
// nada acima do limiar mais baixo (CONFLICT).
export async function findSimilarFact(pool, { orgId, projectId, scope, conversationId, contentEmbedding }) {
  const conditions = ["org_id = $1", "scope = $2", "status NOT IN ('archived','superseded')", 'embedding IS NOT NULL'];
  const params = [orgId, scope];
  function addParam(value) { params.push(value); return `$${params.length}`; }
  if (scope === 'project') {
    conditions.push(`project_id = ${addParam(projectId)}`);
  } else if (scope === 'conversation') {
    conditions.push(`source_conversation_id = ${addParam(conversationId)}`);
  } else {
    conditions.push('project_id IS NULL');
  }
  const { rows } = await pool.query(
    `SELECT id, subject, content, status, valid_from, created_at, embedding FROM ai_knowledge_facts WHERE ${conditions.join(' AND ')}`,
    params,
  );
  let best = null;
  for (const row of rows) {
    const sim = cosineSimilarity(contentEmbedding, row.embedding);
    if (sim >= CONFLICT_SIMILARITY_THRESHOLD && (!best || sim > best.similarity)) {
      best = { ...row, similarity: sim };
    }
  }
  return best;
}

// Retrocompatível — nome antigo, mesmo comportamento (mantido pra não
// quebrar nenhuma referência externa que ainda use o nome da Fase 7).
export const findConflictingFact = findSimilarFact;

// Decide a RELAÇÃO entre um fato novo e o candidato mais parecido já
// existente — 4 categorias (pedido do Rafael, item 4 da Fase 7.1):
// - 'duplicate': praticamente a mesma frase (limiar alto).
// - 'update': o fato novo traz uma data de vigência (validFrom) POSTERIOR
//   à do candidato — é uma sucessão no tempo, não uma incompatibilidade.
// - 'conflict': sem data de mudança, mas com assimetria de negação —
//   um afirma, o outro nega/cessa o mesmo tipo de afirmação.
// - 'complement': nenhuma das anteriores — mesmo tópico, mas
//   informação nova que não contradiz nem substitui a antiga.
function classifyRelation({ newContent, newValidFrom, existing }) {
  if (existing.similarity >= DUPLICATE_SIMILARITY_THRESHOLD) return 'duplicate';

  const existingRef = existing.valid_from || existing.created_at;
  if (newValidFrom && existingRef && new Date(newValidFrom) > new Date(existingRef)) {
    return 'update';
  }

  const newHasNegation = hasNegationMarker(newContent);
  const oldHasNegation = hasNegationMarker(existing.content);
  if (newHasNegation !== oldHasNegation) return 'conflict';

  return 'complement';
}

// Salva um fato novo, aplicando a classificação de 4 categorias.
// Chamado só depois de confirmação explícita do usuário
// (server/assistantActions.js `executeSaveKnowledgeFact`).
export async function saveKnowledgeFact(pool, {
  orgId, projectId, scope, subject, content, knowledgeType, validFrom,
  sourceUserId, sourceConversationId, origin, reference, sourceDate,
}) {
  if (scope === 'conversation' && !sourceConversationId) {
    throw new Error('Fato de escopo "conversation" precisa de uma conversa de origem.');
  }
  const type = knowledgeType || 'FACT';
  // HYPOTHESIS nasce pending_validation (é uma hipótese, por definição
  // ainda não confirmada) — único caso onde o tipo muda o status
  // inicial; todo o resto nasce 'active' (usável/citável já, mas
  // sempre atribuído — nunca "verdade anônima").
  const defaultStatus = type === 'HYPOTHESIS' ? 'pending_validation' : 'active';

  let contentEmbedding = null;
  try {
    [contentEmbedding] = await embedTexts([content], 'document');
  } catch (e) {
    console.error('Assistente do Projeto: falha ao embedar conteúdo do fato novo — seguindo sem detecção de relação.', e.message);
  }

  let relation = 'new';
  let existing = null;
  if (contentEmbedding) {
    existing = await findSimilarFact(pool, { orgId, projectId, scope, conversationId: sourceConversationId, contentEmbedding });
    if (existing) relation = classifyRelation({ newContent: content, newValidFrom: validFrom, existing });
  }

  if (relation === 'duplicate') {
    logMetric(pool, { orgId, projectId, eventType: 'duplicate_detected', metadata: { existingId: existing.id, subject } }).catch(() => {});
    return { id: existing.id, status: 'duplicate', relation };
  }

  const id = uid('akf');
  const status = relation === 'conflict' ? 'disputed' : defaultStatus;
  await pool.query(
    `INSERT INTO ai_knowledge_facts
      (id, org_id, project_id, scope, subject, content, status, knowledge_type, valid_from,
       source_user_id, source_conversation_id, embedding, origin, reference, source_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id, orgId, scope === 'project' ? projectId : null, scope, subject, content, status, type, validFrom || null,
      sourceUserId || null, sourceConversationId || null,
      contentEmbedding ? JSON.stringify(contentEmbedding) : null,
      origin || 'conversation', reference || null, sourceDate || null,
    ],
  );

  if (relation === 'update') {
    await pool.query(
      `UPDATE ai_knowledge_facts SET status='superseded', superseded_by=$1, valid_until=$2, updated_at=now() WHERE id=$3`,
      [id, validFrom, existing.id],
    );
    logMetric(pool, { orgId, projectId, eventType: 'temporal_update_detected', metadata: { oldId: existing.id, newId: id, subject } }).catch(() => {});
  } else if (relation === 'conflict') {
    await pool.query(`UPDATE ai_knowledge_facts SET status='disputed', updated_at=now() WHERE id=$1`, [existing.id]);
    logMetric(pool, { orgId, projectId, eventType: 'conflict_detected', metadata: { existingId: existing.id, newId: id, subject } }).catch(() => {});
  } else if (relation === 'complement') {
    logMetric(pool, { orgId, projectId, eventType: 'complement_detected', metadata: { existingId: existing.id, newId: id, subject } }).catch(() => {});
  }

  return { id, status, relation, conflictWith: relation === 'conflict' ? existing.id : null, supersedes: relation === 'update' ? existing.id : null };
}

// Monta o texto "CONHECIMENTO ACUMULADO" injetado no prompt da RENATA —
// fatos do projeto atual + fatos válidos pra organização inteira
// (scope='org') + fatos de escopo 'conversation' SE forem desta MESMA
// conversa (memória de trabalho intencional, não vaza pra outra
// conversa) — excluindo arquivados/substituídos. Fatos 'disputed'
// aparecem destacados; o prompt (server/assistantRetrieval.js) é
// instruído a nunca escolher uma versão sozinho quando ver essa marca.
// Retorna `{ text, factIds }` — `text` é o bloco pronto pra injetar no
// prompt, `factIds` é a lista de ids realmente incluídos (Fase 7.1:
// vira `dependency_fact_ids` no cache de resposta — server/answerCache.js
// `isStillFresh` invalida o cache se qualquer um desses fatos mudar).
export async function loadRelevantFacts(pool, orgId, projectId, conversationId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT k.id, k.subject, k.content, k.status, k.scope, k.knowledge_type, k.valid_from, k.valid_until, k.created_at, u.name AS source_user_name
     FROM ai_knowledge_facts k
     LEFT JOIN users u ON u.id = k.source_user_id
     WHERE k.org_id = $1
       AND k.status NOT IN ('archived', 'superseded')
       AND (
         k.scope = 'org'
         OR (k.scope = 'project' AND k.project_id = $2)
         OR (k.scope = 'conversation' AND k.source_conversation_id = $3)
       )
     ORDER BY k.created_at DESC
     LIMIT $4`,
    [orgId, projectId, conversationId || null, limit],
  );
  if (!rows.length) return { text: '(nenhum conhecimento acumulado registrado ainda para este projeto/organização/conversa)', factIds: [] };
  const text = rows.map((r) => {
    const scopeLabel = r.scope === 'org' ? 'PRICETAX (toda a organização)' : r.scope === 'conversation' ? 'só esta conversa' : 'específico deste projeto';
    const who = r.source_user_name ? `informado por ${r.source_user_name}` : 'origem não registrada';
    const dateLabel = new Date(r.created_at).toLocaleDateString('pt-BR');
    const vigencia = r.valid_from ? ` — vigente desde ${new Date(r.valid_from).toLocaleDateString('pt-BR')}${r.valid_until ? ` até ${new Date(r.valid_until).toLocaleDateString('pt-BR')}` : ''}` : '';
    const flag = r.status === 'disputed' ? ' [DIVERGENTE — existe outra versão conflitante deste mesmo assunto; não escolha uma sozinha, avise o usuário e pergunte qual vale]' : r.status === 'pending_validation' ? ' [HIPÓTESE — ainda não validada]' : '';
    return `- [${r.knowledge_type}] [${r.subject}] ${r.content}${vigencia} (${scopeLabel}, ${who}, em ${dateLabel})${flag}`;
  }).join('\n');
  return { text, factIds: rows.map((r) => r.id) };
}
