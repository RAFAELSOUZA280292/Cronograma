// Completude da conta (PRD 62). Função pura. "Produtos" do PRD entra na Fase
// 5 (quando existir cadastro de produtos por empresa) — por ora são 8 itens
// de peso igual, e o denominador acompanha quando o 9º chegar.
const ITEMS = [
  { key: 'cnpj', label: 'CNPJ', ok: (c) => !!c.cnpj },
  { key: 'segment', label: 'Segmento', ok: (c) => !!c.segment },
  { key: 'taxRegime', label: 'Regime tributário', ok: (c) => !!c.taxRegime },
  { key: 'erp', label: 'ERP', ok: (c) => !!c.erp },
  { key: 'decisionMaker', label: 'Decisor identificado', ok: (c, s) => !!s.hasDecisionMaker },
  { key: 'primaryContact', label: 'Contato principal', ok: (c, s) => !!s.hasPrimaryContact },
  { key: 'revenue', label: 'Faturamento estimado', ok: (c) => c.revenueEstimate != null && c.revenueEstimate !== '' },
  { key: 'lastInteraction', label: 'Interação registrada', ok: (c, s) => !!s.lastInteractionAt },
];

export function companyCompleteness(company, stats = {}) {
  const missing = [];
  let done = 0;
  ITEMS.forEach((it) => { if (it.ok(company, stats)) done += 1; else missing.push({ key: it.key, label: it.label }); });
  return { percent: Math.round((done / ITEMS.length) * 100), missing };
}
