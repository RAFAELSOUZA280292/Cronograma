// Teste descartável da fusão do quadro pessoal (2026-10-27): duas abas editando o mesmo quadro não podem apagar o trabalho uma da outra.
import assert from 'node:assert/strict';
import { deepEqual, mergeBoards, mergePage } from '../src/personal/boardMerge.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const card = (id, extra = {}) => ({ id, title: id, desc: '', checklist: [], tags: [], history: [], ...extra });
const col = (id, cards) => ({ id, name: id, cards });
const page = (id, cols, extra = {}) => ({ id, name: id, log: [], columns: cols, ...extra });
const ids = (p, c) => p.columns.find((x) => x.id === c).cards.map((k) => k.id);
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { boards: [page('p1', [col('todo', [card('a'), card('b')]), col('done', [])]), page('p2', [col('todo', [card('x')])])] };

// 1) O cenário real: aba nova adiciona atividade + subtarefas na página p2; a aba velha (sem saber) edita a página p1 e salva depois.
const tab2 = clone(base);
tab2.boards[1].columns[0].cards.push(card('nova', { checklist: [{ id: 'c1', text: 'sub 1', done: false }, { id: 'c2', text: 'sub 2', done: false }] }));
const serverAfterTab2 = clone(tab2);
const tab1 = clone(base);
tab1.boards[0].columns[0].cards[0].title = 'a editado na aba velha';
let m = mergeBoards(base, tab1, serverAfterTab2);
ok(ids(m.boards[1], 'todo').join() === 'x,nova', 'atividade nova da outra aba sobrevive');
ok(m.boards[1].columns[0].cards[1].checklist.length === 2, 'subtarefas da outra aba sobrevivem');
ok(m.boards[0].columns[0].cards[0].title === 'a editado na aba velha', 'a edição de quem grava também entra');

// 2) Mesma página: as duas abas acrescentam atividades diferentes na mesma coluna.
const t1 = clone(base); t1.boards[0].columns[0].cards.push(card('da-aba-1'));
const t2 = clone(base); t2.boards[0].columns[0].cards.push(card('da-aba-2'));
m = mergeBoards(base, t1, t2);
ok(ids(m.boards[0], 'todo').join() === 'a,b,da-aba-1,da-aba-2' || ids(m.boards[0], 'todo').sort().join() === 'a,b,da-aba-1,da-aba-2', 'as duas atividades ficam');

// 3) Subtarefas: cada aba acrescenta uma na mesma atividade; uma terceira conclui outra.
const bs = clone(base); bs.boards[0].columns[0].cards[0].checklist = [{ id: 'k1', text: 'um', done: false }];
const s1 = clone(bs); s1.boards[0].columns[0].cards[0].checklist.push({ id: 'k2', text: 'dois', done: false });
const s2 = clone(bs); s2.boards[0].columns[0].cards[0].checklist[0].done = true; s2.boards[0].columns[0].cards[0].checklist.push({ id: 'k3', text: 'três', done: false });
m = mergeBoards(bs, s1, s2);
const chk = m.boards[0].columns[0].cards[0].checklist;
ok(chk.length === 3 && chk.find((i) => i.id === 'k1').done === true, 'subtarefas das duas abas + conclusão preservada');

// 4) Exclusão de verdade: a outra aba apagou o cartão 'b' (e eu não mexi nele) → continua apagado; se eu tinha editado, ele volta.
const d2 = clone(base); d2.boards[0].columns[0].cards = d2.boards[0].columns[0].cards.filter((k) => k.id !== 'b');
let me = clone(base); me.boards[0].columns[0].cards[0].title = 'mexi no a';
m = mergeBoards(base, me, d2);
ok(ids(m.boards[0], 'todo').join() === 'a', 'exclusão alheia respeitada quando não mexi no cartão');
me = clone(base); me.boards[0].columns[0].cards[1].title = 'mexi no b';
m = mergeBoards(base, me, d2);
ok(ids(m.boards[0], 'todo').join() === 'a,b' && m.boards[0].columns[0].cards[1].title === 'mexi no b', 'cartão que eu editei não some por exclusão alheia');
// …e a minha exclusão não ressuscita o que a outra aba não mexeu
const mineDel = clone(base); mineDel.boards[0].columns[0].cards = mineDel.boards[0].columns[0].cards.filter((k) => k.id !== 'a');
const theirsOther = clone(base); theirsOther.boards[1].columns[0].cards.push(card('y'));
m = mergeBoards(base, mineDel, theirsOther);
ok(ids(m.boards[0], 'todo').join() === 'b' && ids(m.boards[1], 'todo').join() === 'x,y', 'minha exclusão fica e a novidade alheia entra');

// 5) Mesmo campo nos dois lados: vence quem está gravando; campos diferentes: os dois valem.
const f1 = clone(base); f1.boards[0].columns[0].cards[0].title = 'titulo meu'; f1.boards[0].columns[0].cards[0].desc = 'desc minha';
const f2 = clone(base); f2.boards[0].columns[0].cards[0].title = 'titulo deles'; f2.boards[0].columns[0].cards[0].priority = 'alta';
m = mergeBoards(base, f1, f2);
const a = m.boards[0].columns[0].cards[0];
ok(a.title === 'titulo meu' && a.desc === 'desc minha' && a.priority === 'alta', 'campo igual: quem grava vence; campos diferentes: junta');

// 6) Cartão movido de coluna por uma aba enquanto a outra o editava: uma cópia só, onde quem grava o pôs.
const mv = clone(base); const moved = mv.boards[0].columns[0].cards.shift(); mv.boards[0].columns[1].cards.push(moved);
const ed = clone(base); ed.boards[0].columns[0].cards[0].title = 'a editado';
m = mergeBoards(base, mv, ed);
const all = m.boards[0].columns.flatMap((c) => c.cards.map((k) => k.id));
ok(all.filter((x) => x === 'a').length === 1 && ids(m.boards[0], 'done').join() === 'a', 'sem cartão duplicado depois de mover + editar');

// 7) Histórico/log: união sem duplicar, mais novo primeiro.
const lb = clone(base); lb.boards[0].log = [{ ts: '2026-10-27T10:00:00Z', action: 'x', user: 'R' }];
const l1 = clone(lb); l1.boards[0].log.unshift({ ts: '2026-10-27T11:00:00Z', action: 'meu', user: 'R' });
const l2 = clone(lb); l2.boards[0].log.unshift({ ts: '2026-10-27T10:30:00Z', action: 'deles', user: 'M' });
m = mergeBoards(lb, l1, l2);
ok(m.boards[0].log.map((e) => e.action).join() === 'meu,deles,x', 'log unido e ordenado');

// 8) Listas de valores (responsáveis): adições dos dois lados, remoção respeitada.
const rb = clone(base); rb.boards[0].columns[0].cards[0].responsibleIds = ['u1', 'u2'];
const r1 = clone(rb); r1.boards[0].columns[0].cards[0].responsibleIds = ['u1', 'u2', 'u3'];
const r2 = clone(rb); r2.boards[0].columns[0].cards[0].responsibleIds = ['u2', 'u4'];
m = mergeBoards(rb, r1, r2);
ok(m.boards[0].columns[0].cards[0].responsibleIds.slice().sort().join() === 'u2,u3,u4', 'responsáveis: u1 removido pela outra aba, u3 e u4 adicionados');

// 9) Ordem das chaves não importa (o jsonb do Postgres reordena) → nada de conflito falso.
const reordered = { boards: base.boards.map((p) => ({ columns: p.columns.map((c) => ({ cards: c.cards.map((k) => Object.fromEntries(Object.entries(k).reverse())), name: c.name, id: c.id })), log: p.log, name: p.name, id: p.id })) };
ok(deepEqual(base, reordered), 'deepEqual ignora a ordem das chaves');
m = mergeBoards(base, tab1, (() => { const t = clone(reordered); return t; })());
ok(m.boards[0].columns[0].cards[0].title === 'a editado na aba velha', 'quem só mexeu de um lado não perde para a ordem de chaves');

// 10) Reordenação de colunas por uma aba + cartão novo na outra.
const o1 = clone(base); o1.boards[0].columns.reverse();
const o2 = clone(base); o2.boards[0].columns[0].cards.push(card('novo'));
m = mergeBoards(base, o1, o2);
ok(m.boards[0].columns.map((c) => c.id).join() === 'done,todo' && ids(m.boards[0], 'todo').join() === 'a,b,novo', 'ordem de colunas de uma aba + cartão novo da outra');

// 11) Página nova criada numa aba; página excluída em outra.
const pn = clone(base); pn.boards.push(page('p3', [col('c', [])]));
const pd = clone(base); pd.boards = pd.boards.filter((p) => p.id !== 'p2');
m = mergeBoards(base, pn, pd);
ok(m.boards.map((p) => p.id).join() === 'p1,p3', 'página nova fica, página excluída pela outra aba sai');

// 12) Página isolada (quadro compartilhado): mesma regra.
const pb = base.boards[0];
const pm = clone(pb); pm.columns[0].cards.push(card('meu'));
const pt = clone(pb); pt.columns[1].cards.push(card('dela'));
const mp = mergePage(pb, pm, pt);
ok(ids(mp, 'todo').join() === 'a,b,meu' && ids(mp, 'done').join() === 'dela', 'mergePage junta as duas');

// 13) Sem conflito real: devolve o mesmo objeto (barato) e não muta as entradas.
const same = clone(base);
const snapshot = JSON.stringify([base, tab1, serverAfterTab2]);
mergeBoards(base, tab1, serverAfterTab2);
ok(JSON.stringify([base, tab1, serverAfterTab2]) === snapshot, 'entradas não são mutadas');
ok(mergeBoards(base, same, same) === same, 'iguais → sem trabalho');

console.log(`board-merge: ${n} checagens OK`);
