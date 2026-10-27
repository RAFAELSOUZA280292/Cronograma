// Mover um negócio de etapa NA TELA, antes de o servidor responder (2026-10-27, §119). O quadro do funil é um objeto
// { stages: [{ id, kind, probability, color, position, count, value, weighted, deals: [...] }] }. Função pura, testável em Node.
// O servidor continua mandando: ao terminar, a tela recarrega o quadro e os números exatos substituem os estimados aqui.

const round2 = (n) => Math.round(n * 100) / 100;

export function moveDealInBoard(board, dealId, toStageId, nowIso = new Date().toISOString()) {
  if (!board || !Array.isArray(board.stages)) return board;
  const from = board.stages.find((s) => s.deals.some((d) => d.id === dealId));
  const to = board.stages.find((s) => s.id === toStageId);
  if (!from || !to || from.id === to.id || to.kind !== 'open') return board;
  const deal = from.deals.find((d) => d.id === dealId);
  const probability = deal.probabilityOverride != null ? deal.probabilityOverride : to.probability;
  const moved = {
    ...deal, stageId: to.id, stageName: to.name, stageKind: to.kind, stageColor: to.color, stagePosition: to.position,
    status: 'open', probability, weightedValue: round2(Number(deal.value || 0) * probability / 100), daysInStage: 0, stageEnteredAt: nowIso,
  };
  const sums = (deals) => ({ count: deals.length, value: deals.reduce((n, d) => n + Number(d.value || 0), 0), weighted: round2(deals.reduce((n, d) => n + Number(d.weightedValue || 0), 0)) });
  return {
    ...board,
    stages: board.stages.map((s) => {
      if (s.id === from.id) { const deals = s.deals.filter((d) => d.id !== dealId); return { ...s, ...sums(deals), deals }; }
      if (s.id === to.id) { const deals = [...s.deals, moved]; return { ...s, ...sums(deals), deals }; } // o servidor também põe no fim da coluna
      return s;
    }),
  };
}

// Troca o cartão pelo que o SERVIDOR devolveu depois de gravar (valores exatos), sem baixar o quadro inteiro de novo: em computador lento
// recarregar e redesenhar centenas de cartões travava a tela por vários segundos a cada movimento. Se o servidor colocou o negócio em outra
// etapa que a estimada aqui, ele é realocado.
export function replaceDealInBoard(board, deal) {
  if (!board || !Array.isArray(board.stages) || !deal) return board;
  const cur = board.stages.find((s) => s.deals.some((d) => d.id === deal.id));
  const dest = board.stages.find((s) => s.id === deal.stageId);
  if (!cur || !dest) return board;
  const sums = (deals) => ({ count: deals.length, value: deals.reduce((n, d) => n + Number(d.value || 0), 0), weighted: round2(deals.reduce((n, d) => n + Number(d.weightedValue || 0), 0)) });
  return {
    ...board,
    stages: board.stages.map((s) => {
      if (cur.id === dest.id && s.id === cur.id) { const deals = s.deals.map((d) => (d.id === deal.id ? deal : d)); return { ...s, ...sums(deals), deals }; }
      if (s.id === cur.id) { const deals = s.deals.filter((d) => d.id !== deal.id); return { ...s, ...sums(deals), deals }; }
      if (s.id === dest.id) { const deals = [...s.deals, deal]; return { ...s, ...sums(deals), deals }; }
      return s;
    }),
  };
}
