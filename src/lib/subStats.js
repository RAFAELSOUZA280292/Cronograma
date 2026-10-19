// Números de uma atividade para o velocímetro (2026-10-19): subatividades concluídas (feitas), puladas e quantas faltam. "Pulada" é uma subatividade marcada como
// concluída com `skipped: true`: para todo o resto do app continua sendo "concluída" (barras, Tabela, auditoria); só o velocímetro e a futura análise separam as duas.
export function subStats(subs) {
  const live = (Array.isArray(subs) ? subs : []).filter((s) => s && !s.deleted);
  const total = live.length;
  const skipped = live.filter((s) => s.done && s.skipped).length;
  const done = live.filter((s) => s.done && !s.skipped).length;
  const pending = total - done - skipped;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return { total, done, skipped, pending, resolved: done + skipped, pctDone: pct(done), pctSkipped: pct(skipped), pctResolved: pct(done + skipped) };
}
