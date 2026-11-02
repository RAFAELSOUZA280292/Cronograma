// Agenda como a do Google, parte 2 (§138): agendas da equipe assinadas, "Reunião com…", livre/ocupado, Tarefas, Ausente e cor do
// compromisso. Puro (sem banco e sem Google). Rodar: node scripts/agenda-team.test.mjs
import assert from 'node:assert/strict';
import { cleanSubscriptions, mapTeamEvent, busyToEvents, rankPeople, outOfOfficeBody, mapTask, eventColorOf, GOOGLE_EVENT_COLORS, MAX_TEAM } from '../server/agendaTeam.js';
import { parseEventForm } from '../server/agendaForm.js';
import { buildPanelEventBody, mapGoogleEvent } from '../server/googleCalendar.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('assinaturas: e-mail válido, sem repetir, sem a própria pessoa, cor válida, limite', () => {
  const out = cleanSubscriptions([
    { email: ' Ronaldo@PRICETAX.com.br ', name: 'Ronaldo', color: '#123456' },
    { email: 'ronaldo@pricetax.com.br' },
    { email: 'rafael.souza@pricetax.com.br' },
    { email: 'sem-arroba' },
    { email: 'duda@pricetax.com.br', color: 'vermelho', show: false },
  ], 'rafael.souza@pricetax.com.br');
  assert.deepEqual(out.map((s) => s.email), ['ronaldo@pricetax.com.br', 'duda@pricetax.com.br']);
  assert.equal(out[0].color, '#123456');
  assert.match(out[1].color, /^#[0-9A-F]{6}$/i, 'cor inválida troca por uma da paleta');
  assert.equal(out[1].show, false);
  assert.equal(cleanSubscriptions(Array.from({ length: 30 }, (_, i) => ({ email: `p${i}@x.com` }))).length, MAX_TEAM);
  assert.deepEqual(cleanSubscriptions('lixo'), []);
});

ok('compromisso de colega: só leitura, cor da agenda dele; particular vira "Ocupado" sem detalhes', () => {
  const sub = { email: 'ronaldo@pricetax.com.br', name: 'Ronaldo', color: '#8E24AA' };
  const ev = mapTeamEvent(sub, { id: 'e1', summary: 'Almoço com cliente', description: 'pauta', location: 'Restaurante', start: { dateTime: '2026-11-04T15:00:00Z' }, end: { dateTime: '2026-11-04T16:00:00Z' } });
  assert.deepEqual([ev.id, ev.source, ev.owner, ev.color, ev.readOnly, ev.title], ['team:ronaldo@pricetax.com.br:e1', 'team', 'ronaldo@pricetax.com.br', '#8E24AA', true, 'Almoço com cliente']);
  const priv = mapTeamEvent(sub, { id: 'e2', summary: 'Médico', description: 'x', location: 'y', visibility: 'private', start: { dateTime: '2026-11-04T15:00:00Z' }, end: { dateTime: '2026-11-04T16:00:00Z' } });
  assert.deepEqual([priv.title, priv.description, priv.location], ['Ocupado', '', '']);
});

ok('só livre/ocupado: vira blocos "Ocupado" no horário certo', () => {
  const out = busyToEvents({ email: 'a@x.com', color: '#111111' }, [{ start: '2026-11-04T12:00:00Z', end: '2026-11-04T13:00:00Z' }, { start: null }]);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].title, out[0].busyOnly, out[0].start], ['Ocupado', true, '2026-11-04T12:00:00.000Z']);
});

ok('Reunião com…: quem começa com o digitado vem primeiro, sem acento', () => {
  const people = [{ name: 'Rafael Souza', email: 'rafael@p.com' }, { name: 'Maria Rafaela', email: 'maria@p.com' }, { name: 'Ronaldo', email: 'ronaldo@p.com' }, { name: 'Éder', email: 'eder@p.com' }];
  assert.deepEqual(rankPeople(people, 'raf').map((p) => p.name), ['Rafael Souza', 'Maria Rafaela']);
  assert.deepEqual(rankPeople(people, 'eder').map((p) => p.name), ['Éder']);
  assert.equal(rankPeople(people, '').length, 4);
});

ok('Ausente: "Fora do escritório" do Google, recusando convites com a mensagem (ou não)', () => {
  const b = outOfOfficeBody({ startISO: '2026-11-10T11:00:00.000Z', endISO: '2026-11-14T21:00:00.000Z', autoDecline: true, message: 'Em viagem' });
  assert.equal(b.eventType, 'outOfOffice');
  assert.deepEqual(b.outOfOfficeProperties, { autoDeclineMode: 'declineAllConflictingInvitations', declineMessage: 'Em viagem' });
  assert.equal(b.start.timeZone, 'America/Sao_Paulo');
  assert.deepEqual(outOfOfficeBody({ startISO: 'a', endISO: 'b', autoDecline: false, message: 'x' }).outOfOfficeProperties, { autoDeclineMode: 'declineNone' });
});

ok('Tarefa do Google na agenda: dia do prazo, concluída ou não', () => {
  const t = mapTask({ id: 'abc', title: 'Mandar proposta', notes: 'DELAVAL', due: '2026-11-05T00:00:00.000Z', status: 'completed' });
  assert.deepEqual([t.id, t.source, t.start, t.end, t.allDay, t.done], ['gtask-abc', 'gtask', '2026-11-05', '2026-11-05', true, true]);
});

ok('cor do compromisso: só as 11 do Google; vai para o Google e volta na leitura', () => {
  assert.equal(Object.keys(GOOGLE_EVENT_COLORS).length, 11);
  assert.equal(eventColorOf('11'), '#D50000');
  assert.equal(eventColorOf('99'), null);
  const base = { title: 'x', date: '2026-11-04', startTime: '15:00' };
  assert.equal(parseEventForm({ ...base, colorId: '5' }).fields.colorId, '5');
  assert.equal(parseEventForm({ ...base, colorId: '' }).fields.colorId, '', 'vazio = tirar a cor (cor da agenda)');
  assert.equal(parseEventForm(base).fields.colorId, undefined, 'sem campo = não mexe');
  assert.match(parseEventForm({ ...base, colorId: '12' }).error, /Cor/);
  assert.equal(buildPanelEventBody({ ...parseEventForm({ ...base, colorId: '5' }).fields }).colorId, '5');
  assert.equal(buildPanelEventBody({ ...parseEventForm({ ...base, colorId: '' }).fields }).colorId, null);
  assert.equal('colorId' in buildPanelEventBody(parseEventForm(base).fields), false);
  assert.equal(mapGoogleEvent({ id: 'e', colorId: '7', start: { dateTime: 'x' }, end: { dateTime: 'y' } }).colorId, '7');
});

console.log(`\n${n} verificações das agendas da equipe passaram.`);
