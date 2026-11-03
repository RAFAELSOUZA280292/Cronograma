// Links internos do painel que a RENATA escreve e o chat abre (shared/panelLinks.js).
import assert from 'node:assert/strict';
import { linkToActivity, linkToMeeting, linkToDeal, parsePanelLink } from '../shared/panelLinks.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
ok('atividade vai e volta', () => assert.deepEqual(parsePanelLink(linkToActivity('proj-kuhn', 'a-12')), { kind: 'activity', pid: 'proj-kuhn', activityId: 'a-12' }));
ok('tarefa de reunião e reunião', () => {
  assert.deepEqual(parsePanelLink(linkToMeeting('proj-kuhn', 'mtg-1', 'todo-9')), { kind: 'todo', pid: 'proj-kuhn', meetingId: 'mtg-1', todoId: 'todo-9' });
  assert.equal(parsePanelLink(linkToMeeting('proj-kuhn', 'mtg-1')).kind, 'meeting');
});
ok('negócio do CRM', () => assert.equal(parsePanelLink(linkToDeal('3f0e6c1a-1111-4222-8333-444455556666')).kind, 'deal'));
ok('módulo', () => assert.deepEqual(parsePanelLink('/agenda'), { kind: 'module', mode: 'agenda' }));
ok('nada de fora do painel', () => {
  for (const bad of ['https://evil.com/empresas?empresa=x', '//evil.com/empresas', 'javascript:alert(1)', '/empresas?empresa=<script>', '/qualquer', '']) assert.equal(parsePanelLink(bad), null, bad);
});
console.log(`\n${n} verificações dos links internos passaram.`);
