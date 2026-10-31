// Escopo da busca na memória do projeto (2026-10-31). A etapa que interpreta a pergunta (resolveQuery) PROPÕE um tipo de trecho (`kind`) e uma reunião-alvo; a busca os
// aplicava como filtro rígido. Medido: um `kind` que o projeto nem tem (ex.: "meeting_topic") devolvia 0 trechos e "antes da reunião de 05/09" virava "a reunião de 05/09"
// (só trechos DEPOIS do fato), e a RENATA respondia "não encontrei evidência" com a evidência no banco. O escopo agora é uma DICA: busca com ele primeiro (precisão, como
// antes) e, se vier pouco, completa com a busca aberta. Puro (sem banco): testado em scripts/retrieval-scope.test.mjs.
export const MIN_SCOPED_CHUNKS = 4;
export const RESERVE_WIDE = 6;

export const hasScope = (scope) => !!(scope && (scope.kind || scope.meetingId));

// Medido (69 interpretações, 23 casos): 57% estreitam e em 10 de 33 com evidência esperada o filtro PERDEU o trecho que a busca aberta achava — mesmo com 7 trechos de volta
// (kind errado), não só com 0. Então: o TIPO é sempre uma dica (sempre completa com a busca aberta); a REUNIÃO-ALVO é rigorosa quando traz o suficiente (pedido de resumo de uma
// reunião continua preciso, e a transcrição inteira dela é anexada à parte) e só completa quando traz pouco (< MIN). Sem filtro, nada muda.
export function needsWidening(scope, scopedCount, min = MIN_SCOPED_CHUNKS) {
  if (!hasScope(scope)) return false;
  return !!scope.kind || scopedCount < min;
}

// Trechos do escopo primeiro (mantêm a ordem), mas guardando `reserve` vagas para a busca aberta — senão um filtro que devolve 12 trechos erra de novo sem deixar espaço
// para a evidência fora dele. Depois completa com a busca aberta (sem repetir id) e, se ainda sobrar vaga, com o resto do escopo.
export function mergeScoped(scoped, wide, limit = 12, reserve = RESERVE_WIDE) {
  const clean = (a) => (a || []).filter(Boolean);
  const sc = clean(scoped); const wd = clean(wide);
  const take = Math.max(0, limit - Math.min(reserve, wd.length));
  const seen = new Set();
  const out = [];
  const add = (c) => { if (!seen.has(c.id) && out.length < limit) { seen.add(c.id); out.push(c); } };
  sc.slice(0, take).forEach(add);
  wd.forEach(add);
  sc.slice(take).forEach(add);
  return out;
}
