// Repetição de casos (31/10/2026, `--repeat=N`): a IA varia entre chamadas e uma rodada por caso oscila ±2 casos (medido: 18/23, 18/23 com outros casos, 21/23, 23/23 sem mudar de
// versão do medidor). Rodar cada caso N vezes dá a TAXA de acerto por caso e separa o que é estável do que é intermitente. Puro (sem banco/IA): testado em runUnitEval.mjs.
export const STATUS = { STABLE: 'estável', FLAKY: 'intermitente', FAIL: 'falha' };

// `results` = resultados de evaluateCase (um por execução; vários por caso). Devolve um resumo por caso e o total.
export function summarizeRepeats(results) {
  const byId = new Map();
  for (const r of results) {
    if (!byId.has(r.id)) byId.set(r.id, { id: r.id, category: r.category, runs: 0, passes: 0, reasons: new Map() });
    const c = byId.get(r.id);
    c.runs += 1;
    if (r.passed) c.passes += 1;
    else (r.failReasons && r.failReasons.length ? r.failReasons : ['falhou sem motivo registrado']).forEach((m) => c.reasons.set(m, (c.reasons.get(m) || 0) + 1));
  }
  const cases = [...byId.values()].map((c) => ({
    id: c.id, category: c.category, runs: c.runs, passes: c.passes, rate: c.runs ? c.passes / c.runs : 0,
    status: c.passes === c.runs ? STATUS.STABLE : (c.passes === 0 ? STATUS.FAIL : STATUS.FLAKY),
    reasons: [...c.reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
  }));
  const runs = cases.reduce((n, c) => n + c.runs, 0);
  const passes = cases.reduce((n, c) => n + c.passes, 0);
  return {
    cases, runs, passes, rate: runs ? passes / runs : 0,
    stable: cases.filter((c) => c.status === STATUS.STABLE).length,
    flaky: cases.filter((c) => c.status === STATUS.FLAKY).length,
    failing: cases.filter((c) => c.status === STATUS.FAIL).length,
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;
export function renderRepeatSummary(sum, repeat) {
  const lines = [];
  lines.push(`## Repetição (${repeat}× por caso)`);
  lines.push(`- Execuções: ${sum.runs} — acertos: ${sum.passes} (${pct(sum.rate)})`);
  lines.push(`- Casos estáveis (acertam ${repeat}/${repeat}): ${sum.stable} de ${sum.cases.length} — intermitentes: ${sum.flaky} — falham sempre: ${sum.failing}`);
  const notStable = sum.cases.filter((c) => c.status !== STATUS.STABLE).sort((a, b) => a.rate - b.rate);
  if (notStable.length) {
    lines.push('', '### Casos que não são estáveis');
    for (const c of notStable) {
      lines.push(`- **${c.id}** (${c.category}) — ${c.passes}/${c.runs} (${c.status}): ${c.reasons.slice(0, 3).map((r) => `${r.reason} ×${r.count}`).join(' | ')}`);
    }
  }
  return lines.join('\n');
}
