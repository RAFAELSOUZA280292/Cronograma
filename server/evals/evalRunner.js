// RENATA Eval Harness — Fase 1. Orquestra UM caso de eval: prepara o estado
// (conversa limpa, cache conforme o modo, turnos anteriores se o caso
// pedir), chama askProjectAssistant DE VERDADE (server/assistantRetrieval.js,
// sem nenhuma alteração de comportamento — só o parâmetro `trace` adicionado
// nesta fase, ver o comentário no topo daquela função) e avalia o resultado
// contra o `expected` do caso.
//
// REGRA DA FASE 1, reforçada aqui: este arquivo NUNCA ajusta threshold,
// prompt, ranking ou lógica de resolveQuery/searchProjectMemory/
// synthesizeAnswer pra fazer um caso passar — ele só MEDE o que o pipeline
// real devolveu.
import { askProjectAssistant } from '../assistantRetrieval.js';
import {
  EVAL_ORG_ID, EVAL_PROJECT_ID, EVAL_USER_ID,
  resetConversation, clearAnswerCache, seedPriorTurns,
} from './fixtures.js';
import { buildEvidenceKeyMaps, toStableKeys, toStableKeysFromIds } from './evidenceKeys.js';
import * as M from './evalMetrics.js';

// Limiares de aprovação — únicos números "de julgamento" deste arquivo,
// documentados aqui pra serem auditáveis (não escondidos numa expressão
// solta no meio da lógica). Mudar um destes NÃO muda o comportamento da
// RENATA — só o que o HARNESS considera "falha" ao reportar.
export const THRESHOLDS = {
  ENTITY_RESOLUTION_MIN: 1,
  REFERENCE_RESOLUTION_MIN: 1,
  EXPECTED_FACT_COVERAGE_MIN: 0.6,
  EVIDENCE_RECALL_AT_5_MIN: 0.5,
};

async function runOneCase(pool, testCase, { evidenceMaps, projectData, projectUpdatedAt, cacheMode }) {
  await resetConversation(pool);
  if (cacheMode === 'without') await clearAnswerCache(pool);
  if (testCase.priorTurns && testCase.priorTurns.length) {
    await seedPriorTurns(pool, testCase.priorTurns);
  }

  const trace = {};
  let threwError = null;
  try {
    await askProjectAssistant({
      pool, orgId: EVAL_ORG_ID, projectId: EVAL_PROJECT_ID, userId: EVAL_USER_ID,
      question: testCase.question, context: testCase.context || {}, projectData, projectUpdatedAt,
      trace,
    });
  } catch (e) {
    threwError = e.message || String(e);
  }

  return evaluateCase(testCase, trace, threwError, evidenceMaps);
}

function evaluateCase(testCase, trace, threwError, evidenceMaps) {
  const expected = testCase.expected || {};
  const { idToKey, keyToId } = evidenceMaps;

  const resolved = trace.resolved || null;
  const synthesized = trace.synthesized || null;
  const chunksConsidered = trace.chunksConsidered || [];
  const answerText = trace.answerText || '';

  const retrievedChunkKeys = toStableKeys(chunksConsidered, idToKey);
  const retrievedFactKeys = toStableKeysFromIds(trace.dependencyFactIds || [], idToKey);
  const relevantChunkKeys = (expected.evidence && expected.evidence.chunkKeys) || [];
  const relevantFactKeys = (expected.evidence && expected.evidence.factKeys) || [];
  const allRetrievedKeys = [...retrievedChunkKeys, ...retrievedFactKeys];
  const allRelevantKeys = [...relevantChunkKeys, ...relevantFactKeys];

  const retrieval = allRelevantKeys.length ? {
    recallAt1: M.recallAtK(allRetrievedKeys, allRelevantKeys, 1),
    recallAt3: M.recallAtK(allRetrievedKeys, allRelevantKeys, 3),
    recallAt5: M.recallAtK(allRetrievedKeys, allRelevantKeys, 5),
    precisionAt5: M.precisionAtK(allRetrievedKeys, allRelevantKeys, 5),
    mrr: M.meanReciprocalRank(allRetrievedKeys, allRelevantKeys),
    firstRelevantPosition: M.firstRelevantPosition(allRetrievedKeys, allRelevantKeys),
    wasCutBeforeSynthesis: !!allRelevantKeys.length && M.firstRelevantPosition(allRetrievedKeys, allRelevantKeys) === null,
  } : null;

  const understanding = {
    intentAccuracy: expected.intent ? M.intentAccuracy(resolved && resolved.intent, expected.intent) : null,
    entityResolution: expected.entities ? M.entityResolutionAccuracy(
      [trace.resolvedParticipant, ...((resolved && resolved.participant) ? [resolved.participant] : [])].filter(Boolean),
      expected.entities,
    ) : null,
    meetingResolution: expected.meetingId ? M.meetingResolutionCorrect(trace.searchMeetingId, expected.meetingId) : null,
    kindResolution: expected.kind ? M.kindResolutionCorrect(resolved && resolved.kind, expected.kind) : null,
    referenceResolution: expected.resolvedTerms ? M.referenceResolutionCoverage(resolved && resolved.standaloneQuery, expected.resolvedTerms) : null,
  };

  const citedChunkKeys = toStableKeysFromIds((synthesized && synthesized.citedChunkIds) || [], idToKey);
  const citedFactKeys = toStableKeysFromIds(trace.citedFactIds || [], idToKey);
  const consideredIds = chunksConsidered.map((c) => c.id);
  const citation = {
    chunkIdValidity: synthesized ? M.citationIdValidity(synthesized.citedChunkIds || [], consideredIds) : null,
    factIdValidity: trace.citedFactIds ? M.citationIdValidity(trace.citedFactIds, trace.dependencyFactIds || []) : null,
    // Suporte léxico médio das fontes citadas em relação ao texto da
    // resposta — heurística determinística, ver evalMetrics.js. Avaliação
    // por JULGAMENTO SEMÂNTICO de verdade fica marcada como N/A aqui de
        // propósito (ver docs/RENATA_EVAL_BASELINE.md, seção de limitações).
    avgLexicalSupport: (() => {
      const cited = chunksConsidered.filter((c) => (synthesized && (synthesized.citedChunkIds || [])).includes(c.id));
      if (!cited.length) return null;
      const scores = cited.map((c) => M.lexicalSupportScore(answerText, c.content));
      return M.average(scores);
    })(),
    citedChunkKeys, citedFactKeys,
  };

  const expectedFacts = M.evaluateExpectedFacts(answerText, expected.answerFacts);
  const forbidden = M.evaluateForbiddenClaims(answerText, expected.forbiddenClaims);
  const noEvidence = M.noEvidenceVerdict({ hasEvidence: trace.hasEvidence, shouldHaveEvidence: expected.shouldHaveEvidence });
  const detectedConflict = !!(trace.proposedAction && trace.proposedAction.type === 'flag_knowledge_conflict')
    || !!(synthesized && (synthesized.sections || []).some((s) => s.type === 'warning' && /conflitant|divergent/i.test(s.title || '')));
  const conflict = M.conflictVerdict({ detectedConflict, expectedConflict: expected.expectConflictDetected });

  const performance = {
    model: trace.model || null,
    tokensInput: trace.tokensInput || 0,
    tokensOutput: trace.tokensOutput || 0,
    latencyTotalMs: trace.latencyMs || null,
    resolveLatencyMs: trace.resolveLatencyMs || null,
    retrievalLatencyMs: trace.retrievalLatencyMs || null,
    synthesisLatencyMs: trace.synthesisLatencyMs || null,
    cacheHit: !!trace.cacheHit,
    numberOfChunksConsidered: chunksConsidered.length,
    numberOfFactsConsidered: (trace.dependencyFactIds || []).length,
  };

  // --- Veredito geral do caso -------------------------------------------
  const failReasons = [];
  if (threwError) failReasons.push(`erro em tempo de execução: ${threwError}`);
  if (understanding.intentAccuracy === false) failReasons.push('intent errado');
  if (understanding.meetingResolution === false) failReasons.push('reunião errada');
  if (understanding.kindResolution === false) failReasons.push('kind errado');
  if (understanding.entityResolution !== null && understanding.entityResolution < THRESHOLDS.ENTITY_RESOLUTION_MIN) failReasons.push(`resolução de entidade abaixo do esperado (${understanding.entityResolution})`);
  if (understanding.referenceResolution !== null && understanding.referenceResolution < THRESHOLDS.REFERENCE_RESOLUTION_MIN) failReasons.push(`resolução de referência incompleta (${understanding.referenceResolution})`);
  if (noEvidence === 'false_positive') failReasons.push('FALSO POSITIVO: concluiu algo sem evidência suficiente');
  if (noEvidence === 'false_negative') failReasons.push('FALSO NEGATIVO: disse "sem evidência" mas ela existia no corpus');
  if (!forbidden.ok) failReasons.push(`afirmou algo proibido: ${forbidden.violated.join('; ')}`);
  if (expectedFacts.coverage !== null && expectedFacts.coverage < THRESHOLDS.EXPECTED_FACT_COVERAGE_MIN) failReasons.push(`cobertura de fatos esperados baixa (${(expectedFacts.coverage * 100).toFixed(0)}%) — faltou: ${expectedFacts.missing.join('; ')}`);
  if (conflict === 'false_negative') failReasons.push('CONFLITO NÃO DETECTADO (esperava que fosse sinalizado)');
  if (conflict === 'false_positive') failReasons.push('CONFLITO DETECTADO ONDE NÃO DEVERIA (falso positivo)');
  if (retrieval && retrieval.recallAt5 !== null && retrieval.recallAt5 < THRESHOLDS.EVIDENCE_RECALL_AT_5_MIN) failReasons.push(`recall@5 de evidência baixo (${(retrieval.recallAt5 * 100).toFixed(0)}%)`);

  return {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    passed: failReasons.length === 0,
    failReasons,
    retrieval, understanding, citation,
    expectedFacts, forbidden, noEvidence, conflict,
    performance,
    // Rastro completo pra depuração — o pedido explícito de "quero
    // conseguir enxergar EM QUAL ETAPA falhou", não só "caso 37 falhou".
    failureTrace: {
      question: testCase.question,
      expected,
      resolveQueryResult: resolved,
      retrievedChunks: chunksConsidered.map((c) => ({ id: c.id, key: idToKey.get(c.id) || null, kind: c.kind, meetingId: c.meetingId, score: c.score, contentPreview: (c.content || '').slice(0, 200) })),
      retrievedFactIds: trace.dependencyFactIds || [],
      contextSentToSynthesis: { factsText: trace.factsText || null },
      answer: answerText,
      citations: { citedChunkKeys, citedFactKeys },
      errorMsg: trace.errorMsg || threwError || null,
    },
  };
}

export async function runEvalSuite(pool, cases, { cacheMode = 'without' } = {}) {
  const { seedFixtures } = await import('./fixtures.js');
  const { projectData, projectUpdatedAt } = await seedFixtures(pool);
  const evidenceMaps = await buildEvidenceKeyMaps(pool, EVAL_PROJECT_ID);

  const results = [];
  for (const testCase of cases) {
    // eslint-disable-next-line no-await-in-loop -- casos rodam em série de
    // propósito: compartilham a mesma conversa/cache, ordem e isolamento
    // importam mais aqui do que paralelismo.
    const result = await runOneCase(pool, testCase, { evidenceMaps, projectData, projectUpdatedAt, cacheMode });
    results.push(result);
  }
  return { results, evidenceMaps };
}

export { evaluateCase };
