// Briefing diário (R3): regras puras de server/briefingRules.js. Sem banco/IA/rede. Rodar: node scripts/briefing-rules.test.mjs
import assert from 'node:assert/strict';
import {
  BRIEFING_RULES, readBriefingOff, publicBriefingRules, isValidRuleKey, daysBetween, overdueDeliveries, meetingsWithoutTasks, stalledFromDeals, composeBriefing, describe, MAX_PER_RULE,
} from '../server/briefingRules.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const TODAY = '2026-10-31';
const project = (id, data) => ({ id, data });

ok('regras: quatro, chaves válidas e únicas', () => {
  assert.deepEqual(BRIEFING_RULES.map((r) => r.key), ['overdue_deliveries', 'stalled_deals', 'cold_clients', 'meetings_no_tasks']);
  assert.ok(isValidRuleKey('cold_clients')); assert.ok(!isValidRuleKey('x'));
});

ok('preferências: lê só chaves válidas, sem duplicar; padrão = tudo ligado', () => {
  assert.deepEqual(readBriefingOff(null), []);
  assert.deepEqual(readBriefingOff({ notifications: { briefingOff: ['cold_clients', 'cold_clients', 'lixo'] } }), ['cold_clients']);
  const pub = publicBriefingRules(['cold_clients']);
  assert.equal(pub.find((r) => r.key === 'cold_clients').off, true); assert.equal(pub.find((r) => r.key === 'stalled_deals').off, false);
});

ok('daysBetween: nunca negativo', () => {
  assert.equal(daysBetween('2026-10-01', TODAY), 30); assert.equal(daysBetween(TODAY, TODAY), 0); assert.equal(daysBetween('2026-11-05', TODAY), 0); assert.equal(daysBetween('', TODAY), 0);
});

const P = [
  project('p1', { company: { nomeFantasia: 'KUHN' }, ownerIds: ['u1'], activities: [
    { id: 'a1', title: 'Mapear créditos', responsible: 'Rafael Souza', endDate: '2026-10-20', status: 'em-andamento' },
    { id: 'a2', title: 'Feita', responsible: 'Rafael Souza', endDate: '2026-10-10', status: 'concluido' },
    { id: 'a3', title: 'Excluída', responsible: 'Rafael Souza', endDate: '2026-10-10', deleted: true },
    { id: 'a4', title: 'De outra pessoa', responsible: 'Eduarda', endDate: '2026-10-10', status: 'a-fazer' },
    { id: 'a5', title: 'No prazo', responsible: 'Rafael Souza', date: '2026-10-31', status: 'a-fazer' },
    { id: 'a6', title: 'Só com data inicial', responsible: ' rafael souza ', date: '2026-10-25', status: 'a-fazer' },
  ], meetings: [
    { id: 'm1', title: 'Kickoff', date: '2026-10-28', actionItems: [] },
    { id: 'm2', title: 'Com tarefa', date: '2026-10-28', actionItems: [{ id: 't', title: 'x', status: 'concluida' }] },
    { id: 'm3', title: 'Antiga', date: '2026-09-01', actionItems: [] },
    { id: 'm4', title: 'Futura', date: '2026-11-05' },
    { id: 'm5', title: 'Excluída', date: '2026-10-29', deleted: true },
  ] }),
  project('p2', { company: { name: 'Outra' }, ownerIds: ['u2'], principalOwnerId: 'u2', meetings: [{ id: 'm9', title: 'Sem tarefa', date: '2026-10-30' }] }),
];

ok('entregas vencidas: só do responsável, abertas, vencidas; nome sem caixa/espaços; mais atrasada primeiro', () => {
  const r = overdueDeliveries(P, 'Rafael Souza', TODAY);
  assert.deepEqual(r.map((x) => x.activityId), ['a1', 'a6']);
  assert.equal(r[0].days, 11); assert.equal(r[0].company, 'KUHN');
  assert.deepEqual(overdueDeliveries(P, '', TODAY), []);
});

ok('reuniões sem tarefa: só das empresas da pessoa, dos últimos 14 dias, já realizadas, e tarefa concluída conta como tarefa', () => {
  assert.deepEqual(meetingsWithoutTasks(P, 'u1', TODAY).map((x) => x.meetingId), ['m1']);
  assert.deepEqual(meetingsWithoutTasks(P, 'u2', TODAY).map((x) => x.meetingId), ['m9']);
  assert.deepEqual(meetingsWithoutTasks(P, 'u3', TODAY), []);
});

ok('negócios parados: só acima de 14 dias, o mais parado primeiro', () => {
  const r = stalledFromDeals([{ id: 'd1', daysInStage: 14 }, { id: 'd2', daysInStage: 20, title: 'B', companyName: 'X', stageName: 'Proposta', value: 5000 }, { id: 'd3', daysInStage: 40 }]);
  assert.deepEqual(r.map((x) => x.dealId), ['d3', 'd2']);
});

ok('texto: cada linha diz o porquê em números', () => {
  assert.match(describe('overdue_deliveries', { title: 'T', company: 'C', days: 1, due: '2026-10-30' }), /venceu há 1 dia \(30\/10\)/);
  assert.match(describe('stalled_deals', { title: 'T', company: 'C', days: 20, stage: 'Proposta', value: 5000 }, (v) => `R$ ${v}`), /20 dias em “Proposta” · R\$ 5000/);
  assert.match(describe('cold_clients', { company: 'C', lastDate: '2026-09-01', days: 60 }), /sem interação há 60 dias/);
  assert.match(describe('cold_clients', { company: 'C', lastDate: null }), /nunca teve interação/);
  assert.match(describe('meetings_no_tasks', { title: 'T', company: 'C', date: '2026-10-28' }), /reunião de 28\/10 sem nenhuma tarefa/);
});

ok('compor: só regras ligadas e com itens; limita a 3 por regra mas conta todas; vazio = total 0', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ kind: 'activity', title: `A${i}`, company: 'C', days: i + 1, due: '2026-10-20' }));
  const b = composeBriefing({ byRule: { overdue_deliveries: many, cold_clients: [{ kind: 'company', company: 'Z', lastDate: null }] }, off: ['cold_clients'] });
  assert.equal(b.total, 5); assert.equal(b.sections.length, 1); assert.equal(b.sections[0].items.length, MAX_PER_RULE); assert.equal(b.sections[0].count, 5);
  assert.match(b.title, /5 pontos pedem atenção/); assert.match(b.body, /Entregas vencidas \(5\)/); assert.match(b.body, /e mais 4/);
  const none = composeBriefing({ byRule: {}, off: [] });
  assert.equal(none.total, 0); assert.equal(none.sections.length, 0); assert.match(none.title, /em ordem/);
  assert.equal(composeBriefing({ byRule: { overdue_deliveries: many.slice(0, 1) } }).title, 'Seu dia: 1 ponto pede atenção');
});

ok('compor: o corpo da notificação cabe (limite de 600)', () => {
  const long = Array.from({ length: 3 }, () => ({ kind: 'activity', title: 'T'.repeat(200), company: 'E'.repeat(200), days: 3, due: '2026-10-20' }));
  const b = composeBriefing({ byRule: { overdue_deliveries: long, meetings_no_tasks: long.map((x) => ({ ...x, date: '2026-10-28' })) } });
  assert.ok(b.body.length <= 600);
});

console.log(`\n${n} testes passaram.`);
