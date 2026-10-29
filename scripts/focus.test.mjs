// Foco de hoje: lógica pura (src/personal/focus.js). Rodar: node scripts/focus.test.mjs
import assert from 'node:assert/strict';
import { addIsoDays, buildFocus, diffIsoDays, listPeople, localIso, normName, personKeyForUser, setCardStatus, toggleStep } from '../src/personal/focus.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

const TODAY = '2026-10-29';
const board = {
  boards: [
    {
      id: 'p1', name: 'Rotina',
      responsibles: [{ id: 'r1', name: 'Rafael' }, { id: 'r2', name: 'Amanda' }, { id: 'r3', name: 'Felipe' }],
      columns: [{
        id: 'c1', name: 'A fazer', cards: [
          { id: 'k1', title: 'GARCIA', status: 'em-andamento', dueDate: '2026-10-28', responsibleIds: ['r1'], checklist: [{ id: 'i1', text: 'Revisar CNAE', done: false }, { id: 'i2', text: 'Enviar prévia', done: false }] },
          { id: 'k2', title: 'INDEMIL', status: 'em-andamento', dueDate: TODAY, priority: 'alta', responsibleIds: ['r1'] },
          { id: 'k3', title: 'Operações', dueDate: TODAY, responsibleIds: ['r2'], checklist: [{ id: 'i3', text: 'Escala', done: false, dueDate: TODAY, responsibleIds: ['r1'] }, { id: 'i4', text: 'Outro', done: true, doneAt: '2026-10-29T15:00:00.000Z' }] },
          { id: 'k4', title: 'CLAC', waiting: { since: '2026-10-27', who: 'cliente' }, responsibleIds: ['r1'] },
          { id: 'k5', title: 'SDK do Léo', dueDate: '2026-10-26', responsibleIds: ['r3'] },
          { id: 'k6', title: 'Sem data', responsibleIds: ['r1'] },
          { id: 'k7', title: 'Amanhã', dueDate: '2026-10-30', priority: 'urgente', responsibleIds: ['r1'] },
          { id: 'k8', title: 'Concluída hoje', completed: true, status: 'concluida', completedAt: '2026-10-29T14:00:00.000Z', responsibleIds: ['r1'] },
          { id: 'k9', title: 'Apagada', dueDate: TODAY, deleted: true, responsibleIds: ['r1'] },
          { id: 'k10', title: 'Arquivada', dueDate: TODAY, archived: true, responsibleIds: ['r1'] },
        ],
      }],
    },
    { id: 'p2', name: 'Eventos', responsibles: [{ id: 'q1', name: 'rafael' }], columns: [{ id: 'd1', name: 'Fazer', cards: [{ id: 'z1', title: 'Evento RJ', dueDate: TODAY, responsibleIds: ['q1'] }] }] },
  ],
};
const ids = (l) => l.map((e) => e.card.id);

ok('datas: soma, diferença e dia local', () => {
  assert.equal(addIsoDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addIsoDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffIsoDays('2026-10-29', '2026-10-26'), 3);
  assert.equal(localIso(''), '');
  assert.equal(localIso('lixo'), '');
});

ok('pessoas: junta nomes iguais entre páginas e acha "eu" pelo primeiro nome', () => {
  const all = listPeople(board, 'all');
  assert.deepEqual(all.map((p) => p.key), ['amanda', 'felipe', 'rafael']);
  assert.equal(personKeyForUser('Rafael Souza', all), 'rafael');
  assert.equal(personKeyForUser('Fulano Qualquer', all), null);
  assert.equal(personKeyForUser('', all), null);
  assert.equal(listPeople(board, 'p2').length, 1);
});

ok('pessoa duplicada no primeiro nome não vira "eu" por engano', () => {
  const ppl = [{ key: 'rafael souza', name: 'Rafael Souza' }, { key: 'rafael lima', name: 'Rafael Lima' }];
  assert.equal(personKeyForUser('Rafael Souza', ppl), 'rafael souza');
  assert.equal(personKeyForUser('Rafael Alves', ppl), null);
});

ok('Eu · Hoje · todas as páginas: separa Agora, Próximos e Atenção', () => {
  const f = buildFocus(board, { person: 'rafael', day: TODAY, span: 'dia', today: TODAY });
  assert.deepEqual(ids(f.agora), ['k2', 'k1']);
  assert.deepEqual(ids(f.atencao), ['k4']);
  assert.deepEqual(ids(f.proximos).sort(), ['k3', 'z1']);
  assert.ok(!ids(f.agora).concat(ids(f.proximos), ids(f.atencao)).some((x) => ['k5', 'k6', 'k7', 'k8', 'k9', 'k10'].includes(x)));
});

ok('cada atividade aparece uma vez só', () => {
  const f = buildFocus(board, { day: TODAY, today: TODAY });
  const all = [...f.agora, ...f.proximos, ...f.atencao].map((e) => e.key);
  assert.equal(new Set(all).size, all.length);
});

ok('em andamento e atrasada fica em Agora, com o atraso marcado', () => {
  const f = buildFocus(board, { person: 'rafael', day: TODAY, today: TODAY });
  const k1 = f.agora.find((e) => e.card.id === 'k1');
  assert.equal(k1.tone, 'overdue');
  assert.equal(k1.overdueDays, 1);
  assert.equal(k1.steps.length, 2);
});

ok('atrasada de outro responsável cai em Atenção de "Todos"', () => {
  const f = buildFocus(board, { person: 'all', day: TODAY, today: TODAY });
  const k5 = f.atencao.find((e) => e.card.id === 'k5');
  assert.equal(k5.overdueDays, 3);
  assert.equal(f.atencao[0].card.id, 'k5');
});

ok('subatividade atribuída a mim puxa a atividade de outra pessoa', () => {
  const f = buildFocus(board, { person: 'rafael', pageId: 'p1', day: TODAY, today: TODAY });
  const k3 = f.proximos.find((e) => e.card.id === 'k3');
  assert.ok(k3);
  assert.deepEqual(k3.steps.map((s) => s.id), ['i3']);
  const amanda = buildFocus(board, { person: 'amanda', pageId: 'p1', day: TODAY, today: TODAY });
  assert.deepEqual(amanda.proximos.find((e) => e.card.id === 'k3').steps.map((s) => s.id), []);
});

ok('filtro de página', () => {
  const f = buildFocus(board, { person: 'rafael', pageId: 'p2', day: TODAY, today: TODAY });
  assert.deepEqual(ids(f.proximos), ['z1']);
  assert.equal(f.agora.length + f.atencao.length, 0);
});

ok('Amanhã e Semana', () => {
  const amanha = buildFocus(board, { person: 'rafael', day: '2026-10-30', span: 'dia', today: TODAY });
  assert.deepEqual(ids(amanha.proximos), ['k7']);
  assert.deepEqual(ids(amanha.agora), ['k2', 'k1']);
  const sem = buildFocus(board, { person: 'rafael', day: TODAY, span: 'semana', today: TODAY });
  assert.deepEqual(ids(sem.proximos), ['k7', 'k3', 'z1'].sort((a, b) => ids(sem.proximos).indexOf(a) - ids(sem.proximos).indexOf(b)));
  assert.equal(sem.proximos.length, 3);
  assert.equal(sem.proximos[0].card.id, 'k7');
});

ok('progresso: passos e atividades concluídos hoje', () => {
  const f = buildFocus(board, { person: 'all', pageId: 'p1', day: TODAY, today: TODAY });
  assert.equal(f.passosFeitosHoje, 1);
  assert.deepEqual(f.feitoHoje.map((e) => e.card.id), ['k8']);
  assert.equal(f.progress.done, 2);
  assert.ok(f.progress.total > f.progress.done);
});

ok('toggleStep marca e desmarca sem tocar nas outras atividades', () => {
  const t = '2026-10-29T18:00:00.000Z';
  const a = toggleStep(board, { boardId: 'p1', colId: 'c1', cardId: 'k1', itemId: 'i1' }, t, 'Rafael Souza');
  const k1 = a.boards[0].columns[0].cards.find((c) => c.id === 'k1');
  assert.equal(k1.checklist[0].done, true);
  assert.equal(k1.checklist[0].doneAt, t);
  assert.equal(k1.updatedBy, 'Rafael Souza');
  assert.equal(board.boards[0].columns[0].cards[0].checklist[0].done, false);
  const b = toggleStep(a, { boardId: 'p1', colId: 'c1', cardId: 'k1', itemId: 'i1' }, t, 'Rafael Souza');
  assert.equal(b.boards[0].columns[0].cards.find((c) => c.id === 'k1').checklist[0].done, false);
  assert.equal(b.boards[1], board.boards[1]);
});

ok('setCardStatus: começar mantém a ordem; concluir manda para o fim e registra histórico', () => {
  const t = '2026-10-29T18:00:00.000Z';
  const a = setCardStatus(board, { boardId: 'p1', colId: 'c1', cardId: 'k3' }, 'em-andamento', t, 'Rafael Souza');
  const cards = a.boards[0].columns[0].cards;
  assert.equal(cards.findIndex((c) => c.id === 'k3'), 2);
  assert.equal(cards[2].status, 'em-andamento');
  assert.match(cards[2].history[0].action, /Não iniciada → Em andamento/);
  const b = setCardStatus(a, { boardId: 'p1', colId: 'c1', cardId: 'k3' }, 'concluida', t, 'Rafael Souza');
  const last = b.boards[0].columns[0].cards.at(-1);
  assert.equal(last.id, 'k3');
  assert.equal(last.completed, true);
  assert.equal(last.completedAt, t);
  const same = setCardStatus(board, { boardId: 'p1', colId: 'c1', cardId: 'k2' }, 'em-andamento', t, 'x');
  assert.equal(same.boards[0].columns[0].cards[1], board.boards[0].columns[0].cards[1]);
});

ok('quadro vazio ou malformado não quebra', () => {
  const f = buildFocus({ boards: [{ id: 'x' }] }, { day: TODAY, today: TODAY });
  assert.equal(f.agora.length + f.proximos.length + f.atencao.length, 0);
  assert.equal(f.progress.total, 0);
  assert.equal(buildFocus(null, { day: TODAY, today: TODAY }).progress.done, 0);
  assert.equal(normName('  Álvaro  Souza '), 'alvaro souza');
});

console.log(`\n${n} verificações ok`);
