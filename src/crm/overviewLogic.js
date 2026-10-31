// Prioridade do dia na Visão geral do CRM (piloto da Onda 2, 2026-10-31). Lógica pura: nada de IA, nada de rede — escolhe e ordena o que já veio do servidor
// e escreve o MOTIVO de cada item. Regra única, escrita também na tela:
//   1) passo atrasado vem antes de "sem próximo passo";  2) dentro de cada grupo, vale `dias + valor/1.000` (cada R$ 1.000 do negócio pesa 1 dia).
// Servidor, indicadores e listas originais não mudam: isto só reordena e explica.
const MS = 86400000;
const parse = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };

export const todayBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Dias entre a data de vencimento e hoje (>0 = atrasado; 0 = hoje ou futuro).
export function lateDays(dueIso, todayIso) {
  const a = parse(dueIso); const b = parse(todayIso);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / MS));
}

export const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const money = (v, fmt) => (v > 0 ? ` · ${fmt(v)}` : '');
export const RULE_TEXT = 'Passo atrasado vem antes de “sem próximo passo”. Em cada grupo, vale o atraso em dias mais o valor do negócio (cada R$ 1.000 pesa 1 dia).';

// Pontuação dentro do grupo: dias + valor/1.000 (arredondada a 1 casa para o desempate ficar estável).
export const scoreOf = (days, value) => Math.round((Math.max(0, days) + Math.max(0, Number(value) || 0) / 1000) * 10) / 10;

// Negócio em "passo atrasado" (lista `late` da API) → candidato.
export function fromLateDeal(d, todayIso, fmt) {
  const n = lateDays(d.nextActivityDate, todayIso);
  return { key: `d:${d.id}`, dealId: d.id, companyId: d.companyId, companyName: d.companyName, title: d.title, tier: 2, days: n, value: d.value || 0, score: scoreOf(n, d.value), kind: 'step-late',
    reason: `Passo atrasado há ${dias(n)}${money(d.value, fmt)}` };
}

// Negócio "sem próximo passo" (lista `noNextStep`) → candidato; os dias são os que está parado na etapa.
export function fromNoStepDeal(d, fmt) {
  const n = d.daysInStage || 0;
  return { key: `d:${d.id}`, dealId: d.id, companyId: d.companyId, companyName: d.companyName, title: d.title, tier: 1, days: n, value: d.value || 0, score: scoreOf(n, d.value), kind: 'no-step',
    reason: `Sem próximo passo, há ${dias(n)} na etapa${money(d.value, fmt)}` };
}

// Atividade atrasada ligada a um negócio (lista `myDue` da API) → candidato. O valor vem do negócio, se ele estiver nas outras listas.
export function fromLateActivity(a, valueByDeal, todayIso, fmt, typeLabel) {
  const n = lateDays(a.dueDate, todayIso);
  const value = (valueByDeal && valueByDeal[a.dealId]) || 0;
  return { key: `d:${a.dealId}`, activityId: a.id, dealId: a.dealId, companyId: a.companyId, companyName: a.companyName, title: a.dealTitle || a.title, tier: 2, days: n, value, score: scoreOf(n, value), kind: 'activity-late',
    reason: `${typeLabel(a.activityType)} com ${dias(n)} de atraso${money(value, fmt)}` };
}

const byPriority = (x, y) => (y.tier - x.tier) || (y.score - x.score) || (y.days - x.days) || String(x.title).localeCompare(String(y.title), 'pt-BR');

// Até `max` itens, um por negócio (o de maior prioridade), com o motivo escrito.
export function buildPriorities(data, todayIso, fmt, typeLabel, max = 3) {
  const dl = (data && data.deals) || {}; const ac = (data && data.activities) || {};
  const valueByDeal = {};
  [...(dl.late || []), ...(dl.noNextStep || [])].forEach((d) => { valueByDeal[d.id] = d.value || 0; });
  const cands = [
    ...(dl.late || []).map((d) => fromLateDeal(d, todayIso, fmt)),
    ...(ac.myDue || []).filter((a) => a.bucket === 'overdue' && a.dealId).map((a) => fromLateActivity(a, valueByDeal, todayIso, fmt, typeLabel)),
    ...(dl.noNextStep || []).map((d) => fromNoStepDeal(d, fmt)),
  ];
  const best = new Map();
  for (const c of cands) { const cur = best.get(c.key); if (!cur || byPriority(c, cur) < 0) best.set(c.key, c); }
  return [...best.values()].sort(byPriority).slice(0, max);
}

// Lista de negócios reordenada por prioridade, com o motivo em cada item (`_reason`). `kind`: 'late' | 'noNextStep'.
export function sortDealsByPriority(deals, kind, todayIso, fmt) {
  const make = kind === 'late' ? (d) => fromLateDeal(d, todayIso, fmt) : (d) => fromNoStepDeal(d, fmt);
  return (deals || []).map((d) => ({ d, c: make(d) })).sort((x, y) => byPriority(x.c, y.c)).map(({ d, c }) => ({ ...d, _reason: c.reason }));
}
