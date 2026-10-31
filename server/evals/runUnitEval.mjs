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
import { factKeyResolver } from './evidenceKeys.js';
import { evaluateCase } from './evalRunner.js';
import { summarizeRepeats, renderRepeatSummary } from './evalRepeat.js';

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

// Caso em que a IA FALHOU (ex.: queda de conexão, `synthesized` nulo): o caso é marcado como falho, nunca derruba a rodada inteira (31/10/2026: a rodada inteira abortava com TypeError).
const failedCase = evaluateCase({ id: 'x', category: 'FACTUAL', question: 'q', expected: { intent: 'pergunta_sobre_projeto', answerFacts: ['a'], evidence: { chunkKeys: ['chunk:m1#meeting_summary#0'] } } },
  { chunksConsidered: [{ id: 'c1', content: 'texto' }], resolved: null, synthesized: null, answerText: '', errorMsg: 'Connection error.' }, 'Connection error.', { idToKey: new Map([['c1', 'chunk:m1#meeting_summary#0']]), idToVersionedKey: new Map(), keyToId: new Map() });
assertEqual(failedCase.passed, false, 'caso com falha da IA vira reprovado sem derrubar a rodada');

// Repetição (`--repeat=N`, 31/10/2026): taxa por caso, estável / intermitente / falha, e motivos agregados.
const reps = summarizeRepeats([
  { id: 'a', category: 'X', passed: true }, { id: 'a', category: 'X', passed: true }, { id: 'a', category: 'X', passed: true },
  { id: 'b', category: 'Y', passed: true }, { id: 'b', category: 'Y', passed: false, failReasons: ['recall baixo'] }, { id: 'b', category: 'Y', passed: false, failReasons: ['recall baixo', 'sem evidência'] },
  { id: 'c', category: 'Z', passed: false, failReasons: ['x'] }, { id: 'c', category: 'Z', passed: false },
]);
assertEqual([reps.runs, reps.passes, reps.stable, reps.flaky, reps.failing], [8, 4, 1, 1, 1], 'repetição: totais por tipo de caso');
assertEqual(reps.cases.map((c) => [c.id, c.status]), [['a', 'estável'], ['b', 'intermitente'], ['c', 'falha']], 'repetição: estável, intermitente e falha');
assertEqual(reps.cases.find((c) => c.id === 'b').reasons, [{ reason: 'recall baixo', count: 2 }, { reason: 'sem evidência', count: 1 }], 'repetição: motivos agregados em ordem de frequência');
assertEqual(reps.cases.find((c) => c.id === 'c').reasons[1].reason, 'falhou sem motivo registrado', 'repetição: falha sem motivo é dita como tal');
assertEqual(summarizeRepeats([]).rate, 0, 'repetição: sem execuções, taxa 0');
const txt = renderRepeatSummary(reps, 3);
assertEqual([txt.includes('Repetição (3× por caso)'), txt.includes('**b**'), txt.includes('**a**')], [true, true, false], 'repetição: o relatório lista só quem não é estável');

// Chave versionada (31/10/2026): um caso que espera `#v2` casa com o id da versão 2, e só com ela; sem expectativa de versão, a chave de sempre.
const idToKey = new Map([['a1', 'fact:resp'], ['a2', 'fact:resp'], ['b1', 'fact:outro']]);
const idToVersionedKey = new Map([['a1', 'fact:resp#v1'], ['a2', 'fact:resp#v2']]);
const resolver = factKeyResolver(idToKey, idToVersionedKey, ['fact:resp#v2']);
assertEqual(['a1', 'a2', 'b1'].map((i) => resolver.get(i)), ['fact:resp', 'fact:resp#v2', 'fact:outro'], 'resolver: só a versão esperada vira chave versionada');
assertEqual(['a1', 'a2'].map((i) => factKeyResolver(idToKey, idToVersionedKey, []).get(i)), ['fact:resp', 'fact:resp'], 'resolver: sem versão esperada, chave de sempre');
assertEqual(M.recallAtK(['fact:resp#v2'], ['fact:resp#v2'], 5), 1, 'recall com a chave versionada casa');

// Recall por canal (31/10/2026): fato esperado conta mesmo depois de 12 trechos; trecho esperado fora do top-K do canal dele não conta (controle negativo).
const chunks12 = Array.from({ length: 12 }, (_, i) => `chunk:x#y#${i}`);
assertEqual(M.recallAtKByChannel({ chunkKeys: chunks12, factKeys: ['fact:a#v2'], relevantChunkKeys: [], relevantFactKeys: ['fact:a#v2'] }, 5), 1, 'recall por canal: fato esperado casa mesmo com 12 trechos antes');
assertEqual(M.recallAtKByChannel({ chunkKeys: chunks12, factKeys: [], relevantChunkKeys: ['chunk:x#y#9'], relevantFactKeys: [] }, 5), 0, 'recall por canal: trecho fora do top-5 não conta');
assertEqual(M.recallAtKByChannel({ chunkKeys: chunks12, factKeys: ['fact:a'], relevantChunkKeys: ['chunk:x#y#0'], relevantFactKeys: ['fact:a', 'fact:b'] }, 5), 2 / 3, 'recall por canal: soma os dois canais');
assertEqual(M.recallAtKByChannel({ chunkKeys: [], factKeys: [], relevantChunkKeys: [], relevantFactKeys: [] }, 5), null, 'recall por canal: sem evidência esperada = null');

// Manchete (31/10/2026): o proibido só conta na primeira frase quando o caso pede `scope: 'headline'`; sem scope, a resposta inteira (como antes).
const okAnswer = 'Antes de setembro de 2026, o responsável fiscal era **Felipe Dal Santo**.\n\nDepois, a partir de 01/09, Camila Souza assumiu.';
assertEqual(M.evaluateForbiddenClaims(okAnswer, ['Camila Souza'], { scope: 'headline' }).ok, true, 'manchete certa citando a sucessora depois NÃO viola');
assertEqual(M.evaluateForbiddenClaims(okAnswer, ['Camila Souza']).ok, false, 'sem scope a resposta inteira continua valendo');
assertEqual(M.evaluateForbiddenClaims('Antes de setembro de 2026, o responsável era Camila Souza.\n\nFelipe Dal Santo veio depois.', ['Camila Souza'], { scope: 'headline' }).ok, false, 'manchete ERRADA ainda viola (controle negativo)');
assertEqual(M.headlineOf('Resposta curta demais.'), 'Resposta curta demais.', 'manchete de texto curto é o texto todo');
assertEqual(M.headlineOf(''), '', 'manchete de texto vazio');

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
