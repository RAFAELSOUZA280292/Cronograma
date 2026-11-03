// Ordem das subatividades (src/personal/checklistOrder.js, §162).
import assert from 'node:assert/strict';
import { sortChecklist, moveInChecklist } from '../src/personal/checklistOrder.js';

const T = '2026-11-04';
const it = (id, done, dueDate) => ({ id, text: id, done, ...(dueDate ? { dueDate } : {}) });
const list = [
  it('baixar', true, '2026-10-30'), it('prompt', false, '2026-11-04'), it('puc', true), it('compras', false, '2026-11-04'),
  it('ceo', false, '2026-11-04'), it('marlon', false), it('cartao', false, '2026-11-05'), it('cronograma', false), it('vencida', false, '2026-11-01'), it('validar', true, '2026-11-03'),
];
assert.deepEqual(sortChecklist(list, T).map((x) => x.id), [
  'baixar', 'puc', 'validar',            // concluídas no topo, na ordem em que estavam
  'marlon', 'cronograma',                // abertas sem data
  'prompt', 'compras', 'ceo',            // hoje (mais próxima), na ordem manual
  'cartao',                              // amanhã (1 dia)
  'vencida',                             // venceu há 3 dias (mais distante)
]);
assert.deepEqual(sortChecklist([it('a', false, '2026-11-03'), it('b', false, '2026-11-05')], T).map((x) => x.id), ['b', 'a'], 'mesma distância: a que ainda vai vencer antes da vencida');
assert.deepEqual(sortChecklist([], T), []);

const s = sortChecklist(list, T);
assert.deepEqual(moveInChecklist(list, 'compras', -1, T).map((x) => x.id).slice(5, 8), ['compras', 'prompt', 'ceo'], 'seta troca dentro da mesma data');
assert.equal(moveInChecklist(list, 'prompt', -1, T), null, 'não passa para o grupo sem data');
assert.equal(moveInChecklist(list, 'marlon', -1, T), null, 'aberta não sobe para as concluídas');
assert.deepEqual(moveInChecklist(list, 'puc', -1, T).map((x) => x.id).slice(0, 3), ['puc', 'baixar', 'validar'], 'concluídas trocam entre si');
assert.equal(moveInChecklist(list, 'cartao', 1, T), null, 'datas diferentes: a ordem é a da data');
assert.equal(s.length, list.length);
console.log('checklist-order: tudo certo');
