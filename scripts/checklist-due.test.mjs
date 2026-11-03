// Prazo automático do cartão (shared/checklistDue.js, §163): só subatividades abertas contam.
import assert from 'node:assert/strict';
import { openChecklistDue } from '../shared/checklistDue.js';

const alcast = [
  { text: 'Preparar material', done: true, dueDate: '2026-10-28' },
  { text: 'Conduzir reunião com o comercial', done: true, dueDate: '2026-11-09' },
  { text: 'Consultar Ronaldo sobre exportação', done: false, dueDate: '2026-11-03' },
  { text: 'Elaborar simulação 2027', done: false, dueDate: '2026-11-03' },
  { text: 'Sem data', done: false },
];
assert.equal(openChecklistDue(alcast), '2026-11-03', 'o 09/11 concluído não conta: vale a mais distante das abertas');
assert.equal(openChecklistDue(alcast.map((i) => ({ ...i, done: true }))), '', 'tudo concluído: não mexe no prazo');
assert.equal(openChecklistDue([{ done: false, dueDate: '2026-11-10' }, { done: false, dueDate: '2026-11-04' }]), '2026-11-10');
assert.equal(openChecklistDue([{ done: false, dueDate: 'amanhã' }, { done: false }]), '');
assert.equal(openChecklistDue(null), '');
console.log('checklist-due: tudo certo');
