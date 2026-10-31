// Prioridade do dia na Visão geral do CRM (src/crm/overviewLogic.js): ordem, motivo escrito e um item por negócio. Rodar: node scripts/crm-overview-priority.test.mjs
import assert from 'node:assert/strict';
import { buildPriorities, lateDays, scoreOf, sortDealsByPriority, dias, RULE_TEXT } from '../src/crm/overviewLogic.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const TODAY = '2026-10-31';
const fmt = (v) => `R$ ${Math.round(v / 1000)} mil`;
const typeLabel = (t) => ({ followup: 'Follow-up', call: 'Ligação' }[t] || 'Atividade');
const deal = (id, over = {}) => ({ id, title: `Neg ${id}`, companyId: `c${id}`, companyName: `Emp ${id}`, value: 0, daysInStage: 3, nextActivityDate: null, ...over });

ok('dias de atraso: passado conta, hoje e futuro são 0, data inválida é 0', () => {
  assert.equal(lateDays('2026-10-21', TODAY), 10);
  assert.equal(lateDays('2026-10-31', TODAY), 0);
  assert.equal(lateDays('2026-11-05', TODAY), 0);
  assert.equal(lateDays('', TODAY), 0);
  assert.equal(lateDays('lixo', TODAY), 0);
  assert.equal(lateDays('2025-12-31', '2026-01-02'), 2, 'vira o ano');
});

ok('pontuação: dias + valor/1.000', () => {
  assert.equal(scoreOf(8, 24000), 32);
  assert.equal(scoreOf(8, 0), 8);
  assert.equal(scoreOf(-3, undefined), 0);
  assert.equal(dias(1), '1 dia'); assert.equal(dias(2), '2 dias');
});

ok('passo atrasado vem antes de "sem próximo passo", mesmo com valor menor', () => {
  const data = { deals: { late: [deal('a', { nextActivityDate: '2026-10-30', value: 1000 })], noNextStep: [deal('b', { value: 900000, daysInStage: 90 })] }, activities: { myDue: [] } };
  const p = buildPriorities(data, TODAY, fmt, typeLabel);
  assert.deepEqual(p.map((x) => x.dealId), ['a', 'b']);
});

ok('dentro do grupo, valor desempata com o atraso (R$ 1.000 = 1 dia)', () => {
  const data = { deals: { late: [
    deal('x', { nextActivityDate: '2026-10-21', value: 0 }),        // 10 dias, R$ 0  → 10
    deal('y', { nextActivityDate: '2026-10-29', value: 20000 }),     // 2 dias, R$ 20 mil → 22
    deal('z', { nextActivityDate: '2026-10-25', value: 3000 }),      // 6 dias, R$ 3 mil → 9
  ], noNextStep: [] }, activities: { myDue: [] } };
  assert.deepEqual(buildPriorities(data, TODAY, fmt, typeLabel, 3).map((x) => x.dealId), ['y', 'x', 'z']);
});

ok('o motivo está escrito, com valor só quando existe', () => {
  const data = { deals: { late: [deal('a', { nextActivityDate: '2026-10-23', value: 24000 })], noNextStep: [deal('b', { daysInStage: 14 })] }, activities: { myDue: [] } };
  const [a, b] = buildPriorities(data, TODAY, fmt, typeLabel);
  assert.equal(a.reason, 'Passo atrasado há 8 dias · R$ 24 mil');
  assert.equal(b.reason, 'Sem próximo passo, há 14 dias na etapa');
});

ok('um item por negócio: o de maior prioridade vence (atividade atrasada ganha de "sem passo")', () => {
  const data = { deals: { late: [], noNextStep: [deal('a', { value: 5000, daysInStage: 40 })] },
    activities: { myDue: [{ id: 'act1', bucket: 'overdue', dealId: 'a', dealTitle: 'Neg a', companyId: 'ca', companyName: 'Emp a', title: '1º Follow Up', activityType: 'followup', dueDate: '2026-10-26' }, { id: 'act2', bucket: 'today', dealId: 'a', title: 'hoje', dueDate: TODAY }, { id: 'act3', bucket: 'overdue', dealId: null, title: 'sem negócio', dueDate: '2026-10-01' }] } };
  const p = buildPriorities(data, TODAY, fmt, typeLabel);
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, 'activity-late'); assert.equal(p[0].activityId, 'act1');
  assert.equal(p[0].reason, 'Follow-up com 5 dias de atraso · R$ 5 mil', 'usa o valor do negócio das outras listas');
});

ok('limita a 3 e aceita dados vazios', () => {
  const many = { deals: { late: ['1', '2', '3', '4', '5'].map((i) => deal(i, { nextActivityDate: `2026-10-${20 + Number(i)}` })), noNextStep: [] }, activities: { myDue: [] } };
  assert.equal(buildPriorities(many, TODAY, fmt, typeLabel).length, 3);
  assert.deepEqual(buildPriorities({}, TODAY, fmt, typeLabel), []);
  assert.deepEqual(buildPriorities(null, TODAY, fmt, typeLabel), []);
});

ok('ordenar uma lista por prioridade devolve os mesmos itens com motivo e sem alterar a original', () => {
  const orig = [deal('p', { daysInStage: 5 }), deal('q', { daysInStage: 30 }), deal('r', { daysInStage: 30, value: 10000 })];
  const copy = JSON.parse(JSON.stringify(orig));
  const s = sortDealsByPriority(orig, 'noNextStep', TODAY, fmt);
  assert.deepEqual(s.map((d) => d.id), ['r', 'q', 'p']);
  assert.match(s[0]._reason, /R\$ 10 mil/);
  assert.deepEqual(orig, copy, 'não muta a lista original');
  assert.equal(sortDealsByPriority(null, 'late', TODAY, fmt).length, 0);
});

ok('a regra escrita na tela bate com o que o código faz', () => {
  assert.match(RULE_TEXT, /R\$ 1\.000 pesa 1 dia/);
  assert.match(RULE_TEXT, /atrasado vem antes/);
});

console.log(`\n${n} verificações ok`);
