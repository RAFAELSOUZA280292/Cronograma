#!/usr/bin/env node
// RENATA Eval Harness — Fase 1 — modo UNIT/DETERMINISTIC.
// Zero chamada de rede (nem Anthropic, nem Voyage, nem Postgres) — testa só
// as funções puras do próprio harness (evalMetrics.js) e algumas peças já
// existentes e já exportadas do "cérebro" que são puras por natureza
// (classifyRelation, normalizeName, cosineSimilarity) — pra confirmar o
// COMPORTAMENTO ATUAL delas como baseline, nunca pra corrigir nada aqui.
//
// Rodar: node server/evals/runUnitEval.mjs   (ou `npm run eval:unit`)
import * as M from './evalMetrics.js';
import { classifyRelation, DUPLICATE_SIMILARITY_THRESHOLD, CONFLICT_SIMILARITY_THRESHOLD } from '../knowledgeFacts.js';
import { normalizeName } from '../assistantContext.js';
import { cosineSimilarity } from '../embeddings.js';

let passCount = 0;
let failCount = 0;
const failures = [];

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passCount++; } else { failCount++; failures.push(`${label}: esperado ${JSON.stringify(expected)}, obteve ${JSON.stringify(actual)}`); }
}
function assertClose(actual, expected, label, tolerance = 1e-9) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
  if (ok) { passCount++; } else { failCount++; failures.push(`${label}: esperado ~${expected}, obteve ${actual}`); }
}

// --- evalMetrics.js -------------------------------------------------------
assertClose(M.recallAtK(['a', 'b', 'c'], ['a', 'z'], 3), 0.5, 'recallAtK parcial');
assertClose(M.recallAtK(['a', 'b'], ['a', 'b'], 5), 1, 'recallAtK completo, k maior que lista');
assertEqual(M.recallAtK(['a'], [], 3), null, 'recallAtK sem relevantes esperados devolve null');
assertClose(M.precisionAtK(['a', 'x', 'y'], ['a'], 3), 1 / 3, 'precisionAtK');
assertClose(M.meanReciprocalRank(['x', 'a', 'y'], ['a']), 0.5, 'MRR posição 2');
assertEqual(M.meanReciprocalRank(['x', 'y'], ['a']), 0, 'MRR sem achar nenhum relevante');
assertEqual(M.firstRelevantPosition(['x', 'a'], ['a']), 2, 'firstRelevantPosition');
assertEqual(M.firstRelevantPosition(['x', 'y'], ['a']), null, 'firstRelevantPosition ausente');

assertEqual(M.intentAccuracy('pergunta_sobre_projeto', 'pergunta_sobre_projeto'), true, 'intentAccuracy bate');
assertEqual(M.intentAccuracy('conversa_geral', 'pergunta_sobre_projeto'), false, 'intentAccuracy não bate');
assertClose(M.entityResolutionAccuracy(['Felipe Dal Santo'], ['Felipe Dal Santo', 'Camila Souza']), 0.5, 'entityResolutionAccuracy parcial');
assertClose(M.referenceResolutionCoverage('o que Felipe falou sobre markup na reunião de setembro', ['Felipe', 'markup']), 1, 'referenceResolutionCoverage completo');
assertClose(M.referenceResolutionCoverage('o que ele falou depois', ['Felipe', 'markup']), 0, 'referenceResolutionCoverage zero (pronome não resolvido)');

assertClose(M.citationIdValidity(['a', 'z'], ['a', 'b', 'c']), 0.5, 'citationIdValidity parcial');
assertEqual(M.citationIdValidity([], ['a']), null, 'citationIdValidity sem citação devolve null');

const factsEval = M.evaluateExpectedFacts('O markup da linha B foi definido em 8%.', ['8%', '15%']);
assertEqual(factsEval.supported, ['8%'], 'evaluateExpectedFacts supported');
assertEqual(factsEval.missing, ['15%'], 'evaluateExpectedFacts missing');

const forbiddenEval = M.evaluateForbiddenClaims('A resposta certa é Camila Souza.', ['Camila Souza']);
assertEqual(forbiddenEval.ok, false, 'evaluateForbiddenClaims detecta violação');

assertEqual(M.noEvidenceVerdict({ hasEvidence: true, shouldHaveEvidence: false }), 'false_positive', 'noEvidenceVerdict false_positive');
assertEqual(M.noEvidenceVerdict({ hasEvidence: false, shouldHaveEvidence: true }), 'false_negative', 'noEvidenceVerdict false_negative');
assertEqual(M.noEvidenceVerdict({ hasEvidence: true, shouldHaveEvidence: true }), 'correct', 'noEvidenceVerdict correct (com evidência)');

assertEqual(M.conflictVerdict({ detectedConflict: false, expectedConflict: true }), 'false_negative', 'conflictVerdict false_negative');
assertEqual(M.conflictVerdict({ detectedConflict: true, expectedConflict: false }), 'false_positive', 'conflictVerdict false_positive');

assertClose(M.average([1, 2, 3]), 2, 'average');
assertEqual(M.percentile([1, 2, 3, 4, 5], 50), 3, 'percentile p50');

// --- Peças já existentes no "cérebro" que são puras (documentam baseline) --
assertClose(cosineSimilarity([1, 0], [1, 0]), 1, 'cosineSimilarity vetores idênticos');
assertClose(cosineSimilarity([1, 0], [0, 1]), 0, 'cosineSimilarity vetores ortogonais');
assertEqual(normalizeName('Évanio  '), 'evanio', 'normalizeName remove acento/espaço/caixa');
assertEqual(DUPLICATE_SIMILARITY_THRESHOLD, 0.93, 'DUPLICATE_SIMILARITY_THRESHOLD atual (documentação de baseline)');
assertEqual(CONFLICT_SIMILARITY_THRESHOLD, 0.75, 'CONFLICT_SIMILARITY_THRESHOLD atual (documentação de baseline)');

// classifyRelation não chama embedding nenhum — recebe `existing.similarity`
// pronto — por isso é 100% testável com dado sintético, sem Voyage/Anthropic.
assertEqual(
  classifyRelation({ newContent: 'Felipe é o CEO da PRICETAX', newValidFrom: null, existing: { similarity: 0.97, content: 'Felipe é o CEO da PRICETAX.', valid_from: null, created_at: '2026-01-01' } }),
  'duplicate',
  'classifyRelation: alta similaridade vira duplicate',
);
assertEqual(
  classifyRelation({ newContent: 'Camila passou a ser a responsável a partir de 01/09', newValidFrom: '2026-09-01', existing: { similarity: 0.8, content: 'Felipe é o responsável.', valid_from: '2026-07-01', created_at: '2026-07-01' } }),
  'update',
  'classifyRelation: validFrom posterior vira update',
);
assertEqual(
  classifyRelation({ newContent: 'Felipe não é mais o responsável', newValidFrom: null, existing: { similarity: 0.8, content: 'Felipe é o responsável.', valid_from: null, created_at: '2026-07-01' } }),
  'conflict',
  'classifyRelation: negação assimétrica vira conflict',
);
// GAP JÁ CONHECIDO (docs/RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md, item
// 9, Conflict Engine 2.0): dois valores DIFERENTES pro mesmo atributo, sem
// negação textual e sem validFrom, hoje caem em 'complement' — não é o
// resultado CORRETO (deveria ser 'conflict'), é o resultado ATUAL. Este
// teste documenta o comportamento de hoje como baseline; se algum dia essa
// asserção passar a falhar porque alguém mudou classifyRelation SEM passar
// pela Fase 2+ (Conflict Engine 2.0) formalmente, isso é um sinal de alerta,
// não um "unit test quebrado que precisa ser mais permissivo".
assertEqual(
  classifyRelation({ newContent: 'O prazo de entrega do diagnóstico fiscal é 10/09/2026.', newValidFrom: null, existing: { similarity: 0.85, content: 'O prazo de entrega do diagnóstico fiscal é 25/08/2026.', valid_from: null, created_at: '2026-08-01' } }),
  'complement',
  'classifyRelation: valores numéricos diferentes SEM negação — BASELINE CONHECIDO, não corrigido nesta fase (deveria ser conflict)',
);

console.log(`\nRENATA Eval Harness — UNIT/DETERMINISTIC\nPassou: ${passCount}  Falhou: ${failCount}\n`);
if (failures.length) {
  console.log('Falhas:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
