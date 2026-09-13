// RENATA Eval Harness — Fase 1. Funções PURAS de métrica — sem chamada de
// rede, sem Postgres, sem IA. Recebem arrays já resolvidos (chaves estáveis
// de evidenceKeys.js, ou texto) e devolvem um número/objeto. Testadas
// isoladamente em server/evals/runUnitEval.mjs.

// --- Retrieval -------------------------------------------------------

// `retrievedKeys` já deve vir ORDENADO por relevância (rerank/score) —
// hoje isso é a ordem de saída de searchProjectMemory (fusão por soma de
// score, ver assistantRetrieval.js `chunksConsidered` no trace).
export function recallAtK(retrievedKeys, relevantKeys, k) {
  if (!relevantKeys.length) return null; // não faz sentido medir recall sem nenhuma evidência esperada
  const top = retrievedKeys.slice(0, k);
  const found = relevantKeys.filter((r) => top.includes(r));
  return found.length / relevantKeys.length;
}

export function precisionAtK(retrievedKeys, relevantKeys, k) {
  const top = retrievedKeys.slice(0, k);
  if (!top.length) return null;
  const found = top.filter((r) => relevantKeys.includes(r));
  return found.length / top.length;
}

export function meanReciprocalRank(retrievedKeys, relevantKeys) {
  if (!relevantKeys.length) return null;
  for (let i = 0; i < retrievedKeys.length; i++) {
    if (relevantKeys.includes(retrievedKeys[i])) return 1 / (i + 1);
  }
  return 0;
}

// Posição (1-based) da primeira evidência relevante, ou null se nenhuma foi
// encontrada — usado no FAILURE TRACE pra responder "achou, mas em que
// posição?" / "foi cortada antes do limit=12 chegar em synthesizeAnswer?".
export function firstRelevantPosition(retrievedKeys, relevantKeys) {
  for (let i = 0; i < retrievedKeys.length; i++) {
    if (relevantKeys.includes(retrievedKeys[i])) return i + 1;
  }
  return null;
}

// --- Query Understanding ---------------------------------------------

export function intentAccuracy(actualIntent, expectedIntent) {
  if (!expectedIntent) return null;
  return actualIntent === expectedIntent;
}

// Comparação normalizada (acento/caixa) — resolução de nome parcial é o
// próprio objeto de teste, não queremos um falso-negativo por causa de
// maiúscula/acento.
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function entityResolutionAccuracy(resolvedNames, expectedNames) {
  if (!expectedNames || !expectedNames.length) return null;
  const resolvedNorm = (resolvedNames || []).map(normalize);
  const hits = expectedNames.filter((e) => resolvedNorm.includes(normalize(e)));
  return hits.length / expectedNames.length;
}

export function meetingResolutionCorrect(actualMeetingId, expectedMeetingId) {
  if (!expectedMeetingId) return null;
  return actualMeetingId === expectedMeetingId;
}

export function kindResolutionCorrect(actualKind, expectedKind) {
  if (!expectedKind) return null;
  return actualKind === expectedKind;
}

// Checa se a `standaloneQuery` reformulada por resolveQuery contém os termos
// que o caso espera ver resolvidos (ex.: pra "e o que ele falou depois?",
// expectedResolvedTerms=['Felipe', 'Reunião de Revisão de Preços'] ou
// similar) — heurística de substring normalizada, não é NLP; documentado
// como limitação, mas é o suficiente pra pegar "não resolveu o pronome de
// jeito nenhum" (o erro mais grosseiro e mais importante de pegar aqui).
export function referenceResolutionCoverage(standaloneQuery, expectedResolvedTerms) {
  if (!expectedResolvedTerms || !expectedResolvedTerms.length) return null;
  const normQuery = normalize(standaloneQuery);
  const hits = expectedResolvedTerms.filter((t) => normQuery.includes(normalize(t)));
  return hits.length / expectedResolvedTerms.length;
}

// --- Evidence / Citation ----------------------------------------------

// IDs citados que realmente existiam entre os candidatos enviados pra
// synthesizeAnswer — já validado hoje dentro de askProjectAssistant (o
// próprio código de produção descarta um id inventado); esta função só
// RECONFERE isso de fora, como parte do relatório do harness.
export function citationIdValidity(citedIds, consideredIds) {
  if (!citedIds.length) return null;
  const valid = citedIds.filter((id) => consideredIds.includes(id));
  return valid.length / citedIds.length;
}

// Heurística de overlap léxico (determinística, sem IA) — checa se o
// CONTEÚDO da fonte citada compartilha palavras significativas com a
// afirmação da resposta que a cita. Não prova sustentação semântica de
// verdade (isso exigiria julgamento por modelo — deixado explicitamente
// como avaliação OFFLINE/opcional, nunca no pipeline de produção, ver
// `lexicalSupportScoreExperimental` mais abaixo) — mas pega o caso mais
// grosseiro: um id citado cujo conteúdo não tem NENHUMA palavra em comum
// com a resposta é quase certamente uma citação solta demais.
const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'que', 'em', 'um', 'uma', 'para', 'pra', 'com', 'no', 'na', 'nos', 'nas', 'foi', 'ser', 'é', 'ao', 'se']);
function significantWords(text) {
  // Números/percentuais curtos ("8%", "10%") carregam significado mesmo com
  // 2 caracteres — só aplica o corte de tamanho mínimo a palavras puramente
  // alfabéticas (evita descartar exatamente o tipo de fato mais checado
  // nos casos de eval: valores numéricos).
  return normalize(text).split(/[^a-z0-9%]+/).filter((w) => {
    if (!w || STOPWORDS.has(w)) return false;
    if (/\d/.test(w)) return true;
    return w.length > 2;
  });
}
export function lexicalSupportScore(answerText, sourceContent) {
  const answerWords = new Set(significantWords(answerText));
  const sourceWords = new Set(significantWords(sourceContent));
  if (!sourceWords.size) return 0;
  let overlap = 0;
  sourceWords.forEach((w) => { if (answerWords.has(w)) overlap += 1; });
  return overlap / sourceWords.size;
}

// --- Answer evaluation --------------------------------------------------

// `expectedAnswerFacts`/`forbiddenClaims` são frases curtas (não a resposta
// inteira) — presença é checada por overlap de palavras-chave normalizado,
// não igualdade de string (pedido explícito: "não usar apenas comparação
// textual exata"). Retorna quais entraram (`supported`) e quais faltaram
// (`missing`) pra aparecer no relatório sem exigir leitura humana da
// resposta inteira toda vez.
function factAppearsInAnswer(fact, answerText) {
  const factWords = significantWords(fact);
  if (!factWords.length) return false;
  const normAnswer = normalize(answerText);
  const hits = factWords.filter((w) => normAnswer.includes(w));
  return hits.length / factWords.length >= 0.6; // maioria das palavras-chave do fato precisa aparecer
}

export function evaluateExpectedFacts(answerText, expectedAnswerFacts) {
  const list = expectedAnswerFacts || [];
  const supported = list.filter((f) => factAppearsInAnswer(f, answerText));
  const missing = list.filter((f) => !factAppearsInAnswer(f, answerText));
  return { supported, missing, coverage: list.length ? supported.length / list.length : null };
}

export function evaluateForbiddenClaims(answerText, forbiddenClaims) {
  const list = forbiddenClaims || [];
  const violated = list.filter((f) => factAppearsInAnswer(f, answerText));
  return { violated, ok: violated.length === 0 };
}

// --- No-evidence behavior -----------------------------------------------

// FALSE POSITIVE: RENATA concluiu algo (hasEvidence=true) quando o caso diz
// que não deveria haver evidência suficiente. FALSE NEGATIVE: RENATA disse
// "não encontrei evidência" (hasEvidence=false) quando o caso afirma que a
// evidência EXISTE no corpus (shouldHaveEvidence=true) — este é o caso mais
// importante pra medir o ganho futuro de Iterative Retrieval/Reranking.
export function noEvidenceVerdict({ hasEvidence, shouldHaveEvidence }) {
  if (shouldHaveEvidence === undefined || shouldHaveEvidence === null) return null;
  if (shouldHaveEvidence && !hasEvidence) return 'false_negative';
  if (!shouldHaveEvidence && hasEvidence) return 'false_positive';
  return 'correct';
}

// --- Conflict ------------------------------------------------------------

export function conflictVerdict({ detectedConflict, expectedConflict }) {
  if (expectedConflict === undefined || expectedConflict === null) return null;
  if (expectedConflict && detectedConflict) return 'true_positive';
  if (expectedConflict && !detectedConflict) return 'false_negative';
  if (!expectedConflict && detectedConflict) return 'false_positive';
  return 'true_negative';
}

// --- Agregação por rodada -------------------------------------------------

export function average(numbers) {
  const valid = numbers.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function percentile(numbers, p) {
  const valid = numbers.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const idx = Math.min(valid.length - 1, Math.floor((p / 100) * valid.length));
  return valid[idx];
}
