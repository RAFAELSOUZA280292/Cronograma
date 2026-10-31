// Tabela profissional (Onda 3, U3): lógica pura de seleção em massa, colunas escolhidas e resumo de lote. Sem React nem rede (testável em Node).

// Seleção: `selected` é um Set de chaves. Clique simples alterna; com Shift seleciona o intervalo desde a última linha clicada (ordem visível).
export function toggleKey(selected, key) {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

export function rangeKeys(orderedKeys, fromKey, toKey) {
  const a = orderedKeys.indexOf(fromKey); const b = orderedKeys.indexOf(toKey);
  if (a < 0 || b < 0) return [toKey].filter((k) => orderedKeys.includes(k));
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return orderedKeys.slice(lo, hi + 1);
}

// Clique na linha `key`; `anchor` = última clicada. Com Shift e âncora válida, liga todo o intervalo (nunca desliga: é o gesto de "marcar até aqui").
export function clickRow(selected, orderedKeys, key, { shift = false, anchor = null } = {}) {
  if (shift && anchor && anchor !== key && orderedKeys.includes(anchor)) {
    const next = new Set(selected);
    rangeKeys(orderedKeys, anchor, key).forEach((k) => next.add(k));
    return { selected: next, anchor: key };
  }
  return { selected: toggleKey(selected, key), anchor: key };
}

// Estado do "marcar todas" do cabeçalho: marcado / meio-marcado / vazio (sobre as linhas visíveis).
export function headerState(selected, orderedKeys) {
  const n = orderedKeys.filter((k) => selected.has(k)).length;
  return { checked: orderedKeys.length > 0 && n === orderedKeys.length, indeterminate: n > 0 && n < orderedKeys.length, count: n };
}

export function toggleAll(selected, orderedKeys) {
  const { checked } = headerState(selected, orderedKeys);
  const next = new Set(selected);
  if (checked) orderedKeys.forEach((k) => next.delete(k)); else orderedKeys.forEach((k) => next.add(k));
  return next;
}

// A lista mudou (página nova, filtro): só ficam selecionadas as chaves que ainda existem na tela — nada de agir em linha que a pessoa não vê.
export function pruneSelection(selected, orderedKeys) {
  const keep = new Set(orderedKeys);
  const next = new Set([...selected].filter((k) => keep.has(k)));
  return next.size === selected.size ? selected : next;
}

// Colunas: `columns` = [{ key, label, hideable? (padrão true), defaultHidden? }]. `hidden` = chaves escondidas pela pessoa (guardadas por tabela).
export function parseHidden(raw, columns) {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch { list = []; }
  const ok = new Set(columns.filter((c) => c.hideable !== false).map((c) => c.key));
  return Array.isArray(list) ? [...new Set(list.filter((k) => ok.has(k)))] : [];
}
export const defaultHidden = (columns) => columns.filter((c) => c.hideable !== false && c.defaultHidden).map((c) => c.key);
export function visibleColumns(columns, hidden) {
  const h = new Set(hidden);
  const vis = columns.filter((c) => c.hideable === false || !h.has(c.key));
  return vis.length ? vis : columns;
}
export function toggleColumn(hidden, columns, key) {
  const c = columns.find((x) => x.key === key);
  if (!c || c.hideable === false) return hidden;
  const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
  return columns.some((x) => x.hideable === false || !next.includes(x.key)) ? next : hidden;
}

// Resumo de um lote feito linha a linha: `results` = [{ key, ok, error? }] → texto para a pessoa, sem esconder falha.
export function summarizeBatch(results, noun = { one: 'registro', many: 'registros' }) {
  const ok = results.filter((r) => r.ok).length; const bad = results.filter((r) => !r.ok);
  const nm = (n) => `${n} ${n === 1 ? noun.one : noun.many}`;
  if (!bad.length) return { tone: 'success', text: `${nm(ok)} atualizado${ok === 1 ? '' : 's'}.`, failed: [] };
  const why = [...new Set(bad.map((b) => b.error).filter(Boolean))].slice(0, 2).join(' / ');
  return { tone: ok ? 'info' : 'error', text: `${ok ? `${nm(ok)} atualizado${ok === 1 ? '' : 's'}; ` : ''}${bad.length} não ${bad.length === 1 ? 'foi alterado' : 'foram alterados'}${why ? ` (${why})` : ''}.`, failed: bad.map((b) => b.key) };
}
