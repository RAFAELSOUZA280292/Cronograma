// Tabela profissional (U3): seleção em massa, colunas e resumo de lote. Sem React/banco/rede. Rodar: node scripts/table-logic.test.mjs
import assert from 'node:assert/strict';
import { toggleKey, rangeKeys, clickRow, headerState, toggleAll, pruneSelection, parseHidden, defaultHidden, visibleColumns, toggleColumn, summarizeBatch } from '../src/ui/tableLogic.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const K = ['a', 'b', 'c', 'd', 'e'];

ok('alternar chave não muda o conjunto original', () => {
  const s = new Set(['a']); const t = toggleKey(s, 'b'); assert.deepEqual([...t], ['a', 'b']); assert.deepEqual([...s], ['a']); assert.deepEqual([...toggleKey(t, 'a')], ['b']);
});

ok('intervalo: nos dois sentidos; chave fora da lista cai para a própria linha', () => {
  assert.deepEqual(rangeKeys(K, 'b', 'd'), ['b', 'c', 'd']); assert.deepEqual(rangeKeys(K, 'd', 'b'), ['b', 'c', 'd']);
  assert.deepEqual(rangeKeys(K, 'zz', 'c'), ['c']); assert.deepEqual(rangeKeys(K, 'a', 'zz'), []);
});

ok('clique com Shift marca o intervalo desde a âncora e nunca desmarca; sem âncora age como clique simples', () => {
  let r = clickRow(new Set(), K, 'b'); assert.deepEqual([...r.selected], ['b']); assert.equal(r.anchor, 'b');
  r = clickRow(r.selected, K, 'd', { shift: true, anchor: r.anchor }); assert.deepEqual([...r.selected].sort(), ['b', 'c', 'd']); assert.equal(r.anchor, 'd');
  const r2 = clickRow(new Set(['a']), K, 'c', { shift: true, anchor: null }); assert.deepEqual([...r2.selected].sort(), ['a', 'c']);
  const r3 = clickRow(new Set(['b']), K, 'b', { shift: true, anchor: 'b' }); assert.deepEqual([...r3.selected], []);
});

ok('cabeçalho: vazio, meio-marcado e marcado; marcar todas só liga o que está visível', () => {
  assert.deepEqual(headerState(new Set(), K), { checked: false, indeterminate: false, count: 0 });
  assert.deepEqual(headerState(new Set(['a', 'x']), K), { checked: false, indeterminate: true, count: 1 });
  assert.deepEqual(headerState(new Set(K), K), { checked: true, indeterminate: false, count: 5 });
  assert.deepEqual(headerState(new Set(), []), { checked: false, indeterminate: false, count: 0 });
  assert.deepEqual([...toggleAll(new Set(['a']), K)].sort(), K);
  assert.deepEqual([...toggleAll(new Set(K), K)], []);
  assert.deepEqual([...toggleAll(new Set(['z', ...K]), K)], ['z']);
});

ok('lista mudou: só sobram as chaves visíveis (e devolve o mesmo Set quando nada muda)', () => {
  const s = new Set(['a', 'x']); assert.deepEqual([...pruneSelection(s, K)], ['a']);
  const t = new Set(['a']); assert.equal(pruneSelection(t, K), t);
});

const COLS = [{ key: 'name', label: 'Nome', hideable: false }, { key: 'seg', label: 'Segmento' }, { key: 'city', label: 'Cidade' }, { key: 'x', label: 'Extra', defaultHidden: true }];
ok('colunas: lê só chaves escondíveis; lixo vira vazio', () => {
  assert.deepEqual(parseHidden('["seg","name","zzz","seg"]', COLS), ['seg']); assert.deepEqual(parseHidden('lixo', COLS), []); assert.deepEqual(parseHidden(null, COLS), []); assert.deepEqual(parseHidden('{"a":1}', COLS), []);
  assert.deepEqual(defaultHidden(COLS), ['x']);
});
ok('colunas: a fixa nunca some e nunca fica sem coluna alguma', () => {
  assert.deepEqual(visibleColumns(COLS, ['seg', 'x']).map((c) => c.key), ['name', 'city']);
  assert.deepEqual(toggleColumn([], COLS, 'name'), []);
  assert.deepEqual(toggleColumn([], COLS, 'seg'), ['seg']); assert.deepEqual(toggleColumn(['seg'], COLS, 'seg'), []);
  const only = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
  assert.deepEqual(toggleColumn(['a'], only, 'b'), ['a']);
});

ok('resumo do lote: tudo certo, parcial e tudo falhou', () => {
  const noun = { one: 'negócio', many: 'negócios' };
  assert.deepEqual(summarizeBatch([{ key: 1, ok: true }], noun), { tone: 'success', text: '1 negócio atualizado.', failed: [] });
  assert.equal(summarizeBatch([{ key: 1, ok: true }, { key: 2, ok: true }], noun).text, '2 negócios atualizados.');
  const p = summarizeBatch([{ key: 1, ok: true }, { key: 2, ok: false, error: 'Sem permissão' }, { key: 3, ok: false, error: 'Sem permissão' }], noun);
  assert.equal(p.tone, 'info'); assert.equal(p.text, '1 negócio atualizado; 2 não foram alterados (Sem permissão).'); assert.deepEqual(p.failed, [2, 3]);
  const f = summarizeBatch([{ key: 1, ok: false }], noun); assert.equal(f.tone, 'error'); assert.equal(f.text, '1 não foi alterado.');
});

console.log(`\n${n} testes passaram.`);
