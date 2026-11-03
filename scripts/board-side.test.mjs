// Tarefas no painel lateral da Caixa (server/boardSide.js, §151): o que aparece em "Hoje e atrasadas" e a descrição do cartão do e-mail.
import assert from 'node:assert/strict';
import { sideView, cardFromMail } from '../server/boardSide.js';

const board = { boards: [{ id: 'b1', name: 'Minhas atividades', columns: [
  { id: 'c1', name: 'A fazer', cards: [
    { id: 'k1', title: 'Atrasada', dueDate: '2026-11-01' },
    { id: 'k2', title: 'Hoje', dueDate: '2026-11-03', priority: 'alta' },
    { id: 'k3', title: 'Amanhã', dueDate: '2026-11-04' },
    { id: 'k4', title: 'Sem prazo', dueDate: '' },
    { id: 'k5', title: 'Concluída', dueDate: '2026-11-01', completed: true },
    { id: 'k6', title: 'Na lixeira', dueDate: '2026-11-01', deleted: true },
    { id: 'k7', title: 'Arquivada', dueDate: '2026-11-01', archived: true },
  ] },
  { id: 'c2', name: 'Em andamento', cards: [{ id: 'k8', title: 'Data inválida', dueDate: '2026-02-31' }] },
] }, { id: 'b2', name: 'Clientes', columns: [] }] };
const v = sideView(board, '2026-11-03');
assert.deepEqual(v.due.map((t) => t.id), ['k1', 'k2'], 'só abertas com prazo até hoje; concluída, lixeira, arquivada, sem prazo e data inválida fora');
assert.equal(v.due[0].overdue, true); assert.equal(v.due[1].overdue, false);
assert.deepEqual(v.pages.map((p) => [p.name, p.columns.length]), [['Minhas atividades', 2], ['Clientes', 0]]);
assert.equal(sideView(null, '2026-11-03').due.length, 0);

const html = cardFromMail({ note: 'Ligar <b>amanhã</b>\nsem falta', from: { name: 'Felipe Dal Santo', email: 'felipe@pricetax.com.br' }, subject: 'Convite: Everton / Felipe <script>x</script>', threadId: '19a4b2c3d4e5', base: 'https://painel.pricetax.com.br' });
assert.match(html, /Ligar &lt;b&gt;amanhã&lt;\/b&gt;<br \/>sem falta|Ligar &lt;b&gt;amanhã&lt;\/b&gt;<br>sem falta/);
assert.match(html, /<strong>Felipe Dal Santo \(felipe@pricetax.com.br\)<\/strong>/);
assert.ok(!/<script/i.test(html), 'assunto não injeta HTML');
assert.match(html, /href="https:\/\/painel\.pricetax\.com\.br\/email#conversa=19a4b2c3d4e5"/);
assert.ok(!/href/.test(cardFromMail({ subject: 'x', threadId: 'javascript:alert(1)' })), 'id de conversa estranho não vira link');
console.log('board-side: tudo certo');
