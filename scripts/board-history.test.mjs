// Histórico do quadro pessoal: comparar uma cópia antiga com o quadro de hoje e recolocar cartões (src/personal/boardHistory.js).
import assert from 'node:assert/strict';
import { compareWithCurrent, placeFor, recoverCards, countCards } from '../src/personal/boardHistory.js';

const card = (id, extra = {}) => ({ id, title: `T-${id}`, deleted: false, history: [], ...extra });
const version = { boards: [
  { id: 'p1', name: 'Rotina', columns: [{ id: 'c1', name: 'A fazer', cards: [card('a'), card('b'), card('lixo', { deleted: true })] }, { id: 'c2', name: 'Feito', cards: [card('c')] }] },
  { id: 'p2', name: 'Projeto X', columns: [{ id: 'c3', name: 'Ideias', cards: [card('d')] }] },
] };
const now = { boards: [
  { id: 'p1', name: 'Rotina', columns: [{ id: 'c1', name: 'A fazer', cards: [card('a'), card('x')] }, { id: 'c9', name: 'Feito', cards: [card('b', { deleted: true })] }] },
] };

assert.equal(countCards(version), 4, 'conta sem a lixeira');
const d = compareWithCurrent(version, now);
assert.deepEqual(d.missing.map((m) => m.card.id).sort(), ['c', 'd'], 'b está na lixeira de hoje: não "sumiu"; "lixo" já era lixo na cópia');
assert.deepEqual(d.lostPages.map((p) => p.id), ['p2']);
assert.equal(d.versionCards, 4); assert.equal(d.currentCards, 2);

const c = d.missing.find((m) => m.card.id === 'c');
assert.deepEqual(placeFor(now, c), { boardId: 'p1', columnId: 'c9', exact: false }, 'coluna c2 sumiu: cai na de mesmo nome (Feito → c9)');
const dd = d.missing.find((m) => m.card.id === 'd');
assert.deepEqual(placeFor(now, dd), { boardId: 'p1', columnId: 'c1', exact: false }, 'página p2 sumiu: 1ª coluna que existir');

const r = recoverCards(now, d.missing, '2026-10-29T12:00:00Z', 'Rafael');
assert.equal(r.moved, 2); assert.equal(r.lost, 0);
assert.equal(countCards(r.board), 4);
const back = r.board.boards[0].columns[1].cards.find((x) => x.id === 'c');
assert.ok(back && back.history.at(-1).action.includes('Recuperada'));
assert.equal(now.boards[0].columns[0].cards.length, 2, 'não muta o quadro de entrada');
assert.equal(recoverCards(r.board, d.missing, 'x', 'R').moved, 0, 'recuperar de novo não duplica');
assert.equal(recoverCards({ boards: [] }, d.missing, 'x', 'R').lost, 2, 'sem coluna nenhuma: nada some, só é contado como não recuperado');
assert.equal(compareWithCurrent({}, now).missing.length, 0);
console.log('board-history: tudo certo');
