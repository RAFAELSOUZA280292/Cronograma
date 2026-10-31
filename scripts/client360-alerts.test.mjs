// Cliente 360 (I1): regras puras de server/client360Alerts.js. Sem banco/IA/rede. Rodar: node scripts/client360-alerts.test.mjs
import assert from 'node:assert/strict';
import { clientAlerts, STALE_DAYS, STALLED_DAYS } from '../server/client360Alerts.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const TODAY = '2026-10-31';
const deal = (o) => ({ status: 'open', title: 'Contrato', noNextStep: false, nextActivityOverdue: false, daysInStage: 3, overdue: false, ...o });
const keys = (a) => a.map((x) => x.key);

ok('empresa em dia: nenhum alerta', () => {
  assert.deepEqual(clientAlerts({ deals: [deal({})], kpis: { daysSinceInteraction: 5 }, projects: [], today: TODAY }), []);
  assert.deepEqual(clientAlerts({}), []);
});

ok('passo atrasado, sem passo e parado: um alerta por tipo, sem duplicar o mesmo negócio entre atrasado e sem passo', () => {
  const a = clientAlerts({ deals: [deal({ id: 1, title: 'A', nextActivityOverdue: true, noNextStep: true }), deal({ id: 2, title: 'B', noNextStep: true }), deal({ id: 3, title: 'C', daysInStage: STALLED_DAYS + 1 }), deal({ id: 4, daysInStage: STALLED_DAYS })], kpis: { daysSinceInteraction: 1 }, today: TODAY });
  assert.deepEqual(keys(a), ['step_late', 'no_step', 'stalled']);
  assert.match(a[0].text, /1 negócio com passo atrasado: “A”/); assert.match(a[1].text, /1 negócio sem próximo passo: “B”/); assert.match(a[2].text, /1 negócio parado há mais de 14 dias.*“C”/);
  assert.ok(a.every((x) => x.hint));
});

ok('negócio fechado nunca gera alerta de negócio', () => {
  assert.deepEqual(clientAlerts({ deals: [deal({ status: 'won', noNextStep: true, nextActivityOverdue: true, daysInStage: 99 })], kpis: { daysSinceInteraction: 1 }, today: TODAY }), []);
});

ok('lista de nomes longa: mostra 2 e conta o resto', () => {
  const a = clientAlerts({ deals: ['X', 'Y', 'Z', 'W'].map((t) => deal({ title: t, noNextStep: true })), kpis: { daysSinceInteraction: 1 }, today: TODAY });
  assert.match(a[0].text, /4 negócios sem próximo passo: “X”, “Y” e mais 2/);
});

ok('sem interação: só com negócio aberto e acima de 30 dias; nunca interagiu também avisa', () => {
  assert.deepEqual(keys(clientAlerts({ deals: [deal({})], kpis: { daysSinceInteraction: STALE_DAYS + 1 }, today: TODAY })), ['cold']);
  assert.deepEqual(clientAlerts({ deals: [deal({})], kpis: { daysSinceInteraction: STALE_DAYS }, today: TODAY }), []);
  assert.match(clientAlerts({ deals: [deal({})], kpis: { daysSinceInteraction: null }, today: TODAY })[0].text, /Nenhuma interação registrada/);
  assert.deepEqual(clientAlerts({ deals: [], kpis: { daysSinceInteraction: 200 }, today: TODAY }), []);
});

ok('cronograma: atividades atrasadas e tarefas de reunião vencidas somam entre projetos', () => {
  const projects = [{ activities: { overdue: 2 }, overdueTodos: 1, meetings: {} }, { activities: { overdue: 1 }, overdueTodos: 0, meetings: {} }];
  const a = clientAlerts({ kpis: { daysSinceInteraction: 1 }, projects, today: TODAY });
  assert.deepEqual(keys(a), ['delivery_late', 'todo_late']); assert.match(a[0].text, /3 atividades do cronograma atrasadas/); assert.match(a[1].text, /1 tarefa de reunião vencida\./);
});

ok('reunião: aviso só se a última passou de 30 dias E não há próxima; informativo', () => {
  const p = (last, next) => [{ activities: { overdue: 0 }, meetings: { last: last ? { date: last } : null, next: next ? { date: next } : null } }];
  const a = clientAlerts({ kpis: { daysSinceInteraction: 1 }, projects: p('2026-09-01', null), today: TODAY });
  assert.deepEqual(keys(a), ['no_meeting']); assert.equal(a[0].level, 'info'); assert.match(a[0].text, /há 60 dias/);
  assert.deepEqual(clientAlerts({ kpis: { daysSinceInteraction: 1 }, projects: p('2026-09-01', '2026-11-10'), today: TODAY }), []);
  assert.deepEqual(clientAlerts({ kpis: { daysSinceInteraction: 1 }, projects: p('2026-10-20', null), today: TODAY }), []);
  assert.deepEqual(clientAlerts({ kpis: { daysSinceInteraction: 1 }, projects: p(null, null), today: TODAY }), []);
});

ok('cliente sem negócio aberto sugere ampliação; prospect não', () => {
  assert.deepEqual(keys(clientAlerts({ relationship: 'client', deals: [], kpis: {}, today: TODAY })), ['no_deal']);
  assert.deepEqual(clientAlerts({ relationship: 'prospect', deals: [], kpis: {}, today: TODAY }), []);
  assert.deepEqual(clientAlerts({ relationship: 'client', deals: [deal({})], kpis: { daysSinceInteraction: 1 }, today: TODAY }), []);
});

ok('ordem: o que exige atenção vem antes do informativo', () => {
  const a = clientAlerts({ relationship: 'client', deals: [deal({ overdue: true }), deal({ noNextStep: true })], kpis: { daysSinceInteraction: 1 }, projects: [{ activities: { overdue: 1 }, meetings: {} }], today: TODAY });
  const levels = a.map((x) => x.level); assert.deepEqual(levels, [...levels].sort((x, y) => (x === 'atencao' ? 0 : 1) - (y === 'atencao' ? 0 : 1)));
});

console.log(`\n${n} testes passaram.`);
