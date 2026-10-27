// Teste descartável do movimento otimista do quadro do CRM (2026-10-27).
import assert from 'node:assert/strict';
import { moveDealInBoard } from '../src/crm/boardMove.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const deal = (id, value, extra = {}) => ({ id, title: id, value, weightedValue: value * 0.1, probability: 10, probabilityOverride: null, stageId: 'leads', stageName: 'Leads', status: 'open', daysInStage: 20, ...extra });
const board = () => ({ pipeline: { id: 'p' }, closedWindowDays: 60, stages: [
  { id: 'leads', name: 'Leads', kind: 'open', probability: 10, color: '#999', position: 1, count: 3, value: 600, weighted: 60, deals: [deal('a', 100), deal('b', 200), deal('c', 300)] },
  { id: 'cx', name: 'Conexão', kind: 'open', probability: 30, color: '#38f', position: 2, count: 1, value: 50, weighted: 15, deals: [deal('x', 50, { stageId: 'cx', stageName: 'Conexão', probability: 30, weightedValue: 15 })] },
  { id: 'won', name: 'Ganho', kind: 'won', probability: 100, color: '#3c6', position: 3, count: 0, value: 0, weighted: 0, deals: [] },
] });
const b0 = board(); const snap = JSON.stringify(b0);
let b = moveDealInBoard(b0, 'b', 'cx', '2026-10-27T12:00:00Z');
ok(JSON.stringify(b0) === snap, 'não muta o quadro original');
const L = b.stages[0]; const C = b.stages[1];
ok(L.deals.map((d) => d.id).join() === 'a,c' && L.count === 2 && L.value === 400 && L.weighted === 40, 'origem perde o cartão e recalcula');
ok(C.deals.map((d) => d.id).join() === 'x,b' && C.count === 2 && C.value === 250, 'destino recebe no FIM, como o servidor');
const m = C.deals[1];
ok(m.stageId === 'cx' && m.stageName === 'Conexão' && m.stageColor === '#38f' && m.probability === 30 && m.weightedValue === 60 && m.daysInStage === 0 && m.stageEnteredAt === '2026-10-27T12:00:00Z', 'cartão ganha etapa, cor, probabilidade e "0 dias parado"');
ok(C.weighted === 75, 'ponderado do destino = 15 + 60');
ok(b.stages[2] === b0.stages[2], 'colunas não envolvidas ficam idênticas (mesma referência)');
ok(b.pipeline === b0.pipeline && b.closedWindowDays === 60, 'resto do quadro preservado');
// probabilidade manual do negócio prevalece sobre a da etapa
const bo = board(); bo.stages[0].deals[0].probabilityOverride = 90;
ok(moveDealInBoard(bo, 'a', 'cx').stages[1].deals[1].probability === 90, 'probabilityOverride respeitada');
// casos em que não faz nada
ok(moveDealInBoard(b0, 'a', 'leads') === b0, 'mesma etapa');
ok(moveDealInBoard(b0, 'a', 'won') === b0, 'etapa de ganho/perda não é otimista (abre o diálogo de fechamento)');
ok(moveDealInBoard(b0, 'zzz', 'cx') === b0, 'negócio inexistente');
ok(moveDealInBoard(b0, 'a', 'nao-existe') === b0, 'etapa inexistente');
ok(moveDealInBoard(null, 'a', 'cx') === null, 'sem quadro');
// desfazer = mover de volta
const back = moveDealInBoard(b, 'b', 'leads');
ok(back.stages[0].count === 3 && back.stages[1].count === 1 && back.stages[0].value === 600, 'ir e voltar restaura contagens e valores');
// dois movimentos seguidos acumulam
const two = moveDealInBoard(moveDealInBoard(b0, 'a', 'cx'), 'c', 'cx');
ok(two.stages[1].deals.map((d) => d.id).join() === 'x,a,c' && two.stages[0].count === 1, 'dois movimentos acumulam');
console.log(`crm-board-move: ${n} checagens OK`);
