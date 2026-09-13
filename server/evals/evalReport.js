// RENATA Eval Harness — Fase 1. Formata os resultados de runEvalSuite num
// relatório de texto (console + markdown), incluindo o FAILURE TRACE
// completo de cada caso que falhou — o pedido explícito era "não quero só
// 'teste 37 falhou'", então cada falha carrega resolveQuery/chunks/fatos/
// resposta/citações junto.
import * as M from './evalMetrics.js';

function fmtPct(n) { return n === null || n === undefined ? 'N/A' : `${(n * 100).toFixed(0)}%`; }
function fmtMs(n) { return n === null || n === undefined ? 'N/A' : `${Math.round(n)}ms`; }
function fmtNum(n) { return n === null || n === undefined ? 'N/A' : n.toFixed ? n.toFixed(2) : String(n); }

export function buildReport(results, { label = '', baseline = false } = {}) {
  const lines = [];
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  lines.push('# RENATA EVAL REPORT');
  if (baseline) lines.push('\n**BASELINE — BEFORE P0/P1 BRAIN IMPROVEMENTS** (nenhuma mudança arquitetural aplicada ainda — este número é o que se compara depois de cada fase).');
  if (label) lines.push(`\n_${label}_`);

  lines.push('\n## Overall');
  lines.push(`- Cases: ${results.length}`);
  lines.push(`- Passed: ${passed.length}`);
  lines.push(`- Failed: ${failed.length}`);
  lines.push(`- Pass rate: ${fmtPct(results.length ? passed.length / results.length : null)}`);

  const withRetrieval = results.filter((r) => r.retrieval);
  lines.push('\n## Retrieval');
  lines.push(`- Cases com evidência esperada definida: ${withRetrieval.length}/${results.length}`);
  lines.push(`- Recall@1: ${fmtPct(M.average(withRetrieval.map((r) => r.retrieval.recallAt1)))}`);
  lines.push(`- Recall@3: ${fmtPct(M.average(withRetrieval.map((r) => r.retrieval.recallAt3)))}`);
  lines.push(`- Recall@5: ${fmtPct(M.average(withRetrieval.map((r) => r.retrieval.recallAt5)))}`);
  lines.push(`- Precision@5: ${fmtPct(M.average(withRetrieval.map((r) => r.retrieval.precisionAt5)))}`);
  lines.push(`- MRR: ${fmtNum(M.average(withRetrieval.map((r) => r.retrieval.mrr)))}`);
  const cutBeforeSynthesis = withRetrieval.filter((r) => r.retrieval.wasCutBeforeSynthesis);
  lines.push(`- Evidência esperada NUNCA recuperada (cortada antes de chegar a synthesizeAnswer): ${cutBeforeSynthesis.length} caso(s)${cutBeforeSynthesis.length ? ` — ${cutBeforeSynthesis.map((r) => r.id).join(', ')}` : ''}`);

  lines.push('\n## Understanding (Query Understanding)');
  const intentCases = results.filter((r) => r.understanding.intentAccuracy !== null);
  lines.push(`- Intent accuracy: ${fmtPct(intentCases.length ? intentCases.filter((r) => r.understanding.intentAccuracy).length / intentCases.length : null)} (${intentCases.length} caso(s) avaliado(s))`);
  const entityCases = results.filter((r) => r.understanding.entityResolution !== null);
  lines.push(`- Entity resolution: ${fmtPct(M.average(entityCases.map((r) => r.understanding.entityResolution)))} (${entityCases.length} caso(s))`);
  const meetingCases = results.filter((r) => r.understanding.meetingResolution !== null);
  lines.push(`- Meeting resolution: ${fmtPct(meetingCases.length ? meetingCases.filter((r) => r.understanding.meetingResolution).length / meetingCases.length : null)} (${meetingCases.length} caso(s))`);
  const refCases = results.filter((r) => r.understanding.referenceResolution !== null);
  lines.push(`- Reference resolution: ${fmtPct(M.average(refCases.map((r) => r.understanding.referenceResolution)))} (${refCases.length} caso(s))`);

  lines.push('\n## Evidence');
  const factCases = results.filter((r) => r.expectedFacts.coverage !== null);
  lines.push(`- Expected fact coverage: ${fmtPct(M.average(factCases.map((r) => r.expectedFacts.coverage)))}`);
  const missingList = factCases.filter((r) => r.expectedFacts.missing.length).map((r) => `${r.id} (faltou: ${r.expectedFacts.missing.join('; ')})`);
  lines.push(`- Cases com fato esperado faltando: ${missingList.length}${missingList.length ? `\n  - ${missingList.join('\n  - ')}` : ''}`);

  lines.push('\n## Answer');
  const forbiddenViolations = results.filter((r) => !r.forbidden.ok);
  lines.push(`- Forbidden claims violados: ${forbiddenViolations.length} caso(s)${forbiddenViolations.length ? ` — ${forbiddenViolations.map((r) => r.id).join(', ')}` : ''}`);
  const noEvidenceCases = results.filter((r) => r.noEvidence !== null);
  const fp = noEvidenceCases.filter((r) => r.noEvidence === 'false_positive');
  const fn = noEvidenceCases.filter((r) => r.noEvidence === 'false_negative');
  lines.push(`- No-evidence accuracy: ${fmtPct(noEvidenceCases.length ? noEvidenceCases.filter((r) => r.noEvidence === 'correct').length / noEvidenceCases.length : null)} (${noEvidenceCases.length} caso(s))`);
  lines.push(`  - Falsos positivos (concluiu sem evidência): ${fp.length}${fp.length ? ` — ${fp.map((r) => r.id).join(', ')}` : ''}`);
  lines.push(`  - Falsos negativos (disse "sem evidência" existindo): ${fn.length}${fn.length ? ` — ${fn.map((r) => r.id).join(', ')}` : ''}`);

  lines.push('\n## Citation');
  const chunkCitCases = results.filter((r) => r.citation.chunkIdValidity !== null);
  lines.push(`- Citation id validity (chunks): ${fmtPct(M.average(chunkCitCases.map((r) => r.citation.chunkIdValidity)))}`);
  const lexSupportCases = results.filter((r) => r.citation.avgLexicalSupport !== null);
  lines.push(`- Citation relevance/support (heurística léxica, NÃO julgamento semântico — ver limitações): ${fmtPct(M.average(lexSupportCases.map((r) => r.citation.avgLexicalSupport)))}`);
  lines.push('  - Avaliação de suporte semântico de verdade ("a fonte sustenta a afirmação?") fica marcada como avaliação OFFLINE/opcional nesta fase — não implementada dentro do pipeline de produção.');

  lines.push('\n## Conflict');
  const conflictCases = results.filter((r) => r.conflict !== null);
  const conflictTP = conflictCases.filter((r) => r.conflict === 'true_positive').length;
  const conflictFP = conflictCases.filter((r) => r.conflict === 'false_positive').length;
  const conflictFN = conflictCases.filter((r) => r.conflict === 'false_negative').length;
  const conflictTN = conflictCases.filter((r) => r.conflict === 'true_negative').length;
  lines.push(`- Casos avaliados: ${conflictCases.length} — TP: ${conflictTP}, FP: ${conflictFP}, FN: ${conflictFN}, TN: ${conflictTN}`);

  lines.push('\n## Performance');
  lines.push(`- Avg tokens (input+output): ${fmtNum(M.average(results.map((r) => r.performance.tokensInput + r.performance.tokensOutput)))}`);
  const latencies = results.map((r) => r.performance.latencyTotalMs).filter((n) => n !== null);
  lines.push(`- P50 latency (total): ${fmtMs(M.percentile(latencies, 50))}`);
  lines.push(`- P95 latency (total): ${fmtMs(M.percentile(latencies, 95))}`);
  lines.push(`- Avg resolve latency: ${fmtMs(M.average(results.map((r) => r.performance.resolveLatencyMs)))}`);
  lines.push(`- Avg retrieval latency: ${fmtMs(M.average(results.map((r) => r.performance.retrievalLatencyMs)))}`);
  lines.push(`- Avg synthesis latency: ${fmtMs(M.average(results.map((r) => r.performance.synthesisLatencyMs)))}`);
  lines.push(`- Cache hits: ${results.filter((r) => r.performance.cacheHit).length}/${results.length}`);
  lines.push(`- Avg chunks considered: ${fmtNum(M.average(results.map((r) => r.performance.numberOfChunksConsidered)))}`);
  lines.push(`- Avg facts considered: ${fmtNum(M.average(results.map((r) => r.performance.numberOfFactsConsidered)))}`);

  lines.push('\n## Breakdown por categoria');
  const categories = Array.from(new Set(results.map((r) => r.category)));
  categories.forEach((cat) => {
    const inCat = results.filter((r) => r.category === cat);
    const p = inCat.filter((r) => r.passed).length;
    lines.push(`- ${cat}: ${p}/${inCat.length} passou`);
  });

  lines.push('\n## Piores casos');
  const worst = failed.slice().sort((a, b) => b.failReasons.length - a.failReasons.length).slice(0, 10);
  worst.forEach((r) => {
    lines.push(`- **${r.id}** (${r.category}, ${r.failReasons.length} motivo(s)): ${r.failReasons.join(' | ')}`);
  });

  return { text: lines.join('\n'), passed: passed.length, failed: failed.length, total: results.length };
}

export function buildFailureTraces(results) {
  const failed = results.filter((r) => !r.passed);
  const lines = ['# FAILURE TRACES\n'];
  failed.forEach((r) => {
    const t = r.failureTrace;
    lines.push(`## ${r.id} (${r.category})`);
    lines.push(`**QUESTION**: ${t.question}`);
    lines.push(`**EXPECTED**: \`${JSON.stringify(t.expected)}\``);
    lines.push(`**WHY FAILED**: ${r.failReasons.join(' | ')}`);
    lines.push(`**RESOLVE QUERY RESULT**: \`${JSON.stringify(t.resolveQueryResult)}\``);
    lines.push(`**RETRIEVED CHUNKS** (${t.retrievedChunks.length}):`);
    t.retrievedChunks.forEach((c) => lines.push(`  - [${c.key || c.id}] score=${fmtNum(c.score)} kind=${c.kind} meeting=${c.meetingId} — "${c.contentPreview}..."`));
    lines.push(`**RETRIEVED FACT IDS**: ${JSON.stringify(t.retrievedFactIds)}`);
    lines.push(`**CONTEXT SENT TO SYNTHESIS (facts)**: ${t.contextSentToSynthesis.factsText ? t.contextSentToSynthesis.factsText.slice(0, 500) : '(n/a — conversa geral ou cache hit)'}`);
    lines.push(`**ANSWER**: ${t.answer || '(vazio)'}`);
    lines.push(`**CITATIONS**: chunks=${JSON.stringify(t.citations.citedChunkKeys)} facts=${JSON.stringify(t.citations.citedFactKeys)}`);
    if (t.errorMsg) lines.push(`**ERROR**: ${t.errorMsg}`);
    lines.push('');
  });
  return lines.join('\n');
}
