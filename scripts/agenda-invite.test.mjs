// Agenda completa no painel + convite no e-mail: leitura do .ics (convite, alteração, cancelamento, resposta e "novo horário
// sugerido"), fusos, formulário de compromisso, proposta de horário e mapeamento do evento do Google. Rodar: node scripts/agenda-invite.test.mjs
import assert from 'node:assert/strict';
import { parseIcs, icsDate, unfoldIcs, isCalendarPart, replierOf, meetingLinkOf } from '../server/calendarInvite.js';
import { parseEventForm, parseRange, proposalComment, fmtBrRange, withDeadline } from '../server/agendaForm.js';
import { mapEventDetail, buildPanelEventBody, applySelfRsvp, composePatch } from '../server/googleCalendar.js';
import { walkParts } from '../server/googleMail.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

// Como o Google manda o "Novo horário sugerido" (estrutura real de 02/11/2026; nomes e e-mails trocados).
const COUNTER = [
  'BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:COUNTER',
  'BEGIN:VEVENT', 'DTSTART:20261104T173000Z', 'DTEND:20261104T183000Z', 'DTSTAMP:20261102T165113Z',
  'ORGANIZER;CN=Organizador Teste:mailto:organizador@example.com', 'UID:abc123xyz@google.com',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=TENTATIVE;CN=Convid',
  ' ado Teste;X-NUM-GUESTS=0:mailto:convidado@example.com',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
  'DESCRIPTION:-::~:~::~:~:~:~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n\\nPlease do ',
  ' not edit this section.\\n-::~:~::~:~:~:~:~::-',
  'SEQUENCE:1', 'STATUS:CONFIRMED', 'SUMMARY:KUHN COM CEO', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');

ok('linhas dobradas viram uma só', () => {
  const lines = unfoldIcs('A:1\r\n 2\r\nB:3');
  assert.deepEqual(lines, ['A:12', 'B:3']);
});

ok('novo horário sugerido (COUNTER do Google): horário proposto, quem sugeriu, Meet e descrição limpa', () => {
  const inv = parseIcs(COUNTER);
  assert.equal(inv.kind, 'counter');
  assert.equal(inv.uid, 'abc123xyz@google.com');
  assert.equal(inv.start, '2026-11-04T17:30:00.000Z');
  assert.equal(inv.end, '2026-11-04T18:30:00.000Z');
  assert.equal(inv.meetLink, 'https://meet.google.com/abc-defg-hij');
  assert.equal(inv.description, '', 'bloco do Meet em inglês sai da descrição');
  assert.equal(inv.organizer.email, 'organizador@example.com');
  const who = replierOf(inv, 'organizador@example.com');
  assert.equal(who.email, 'convidado@example.com');
  assert.equal(who.name, 'Convidado Teste');
  assert.equal(who.response, 'tentative');
  assert.equal(fmtBrRange(inv.start, inv.end), 'qua., 4 de nov., 14:30–15:30');
});

ok('convite novo, alteração, cancelamento e resposta', () => {
  const base = (method, extra = []) => ['BEGIN:VCALENDAR', `METHOD:${method}`, 'BEGIN:VEVENT', 'UID:u1', 'DTSTART:20261110T130000Z', 'DTEND:20261110T140000Z', 'SUMMARY:Reunião', ...extra, 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  assert.equal(parseIcs(base('REQUEST')).kind, 'request');
  assert.equal(parseIcs(base('REQUEST', ['SEQUENCE:2'])).kind, 'update');
  assert.equal(parseIcs(base('CANCEL')).kind, 'cancel');
  assert.equal(parseIcs(base('CANCEL')).cancelled, true);
  assert.equal(parseIcs(base('REQUEST', ['STATUS:CANCELLED'])).kind, 'cancel');
  assert.equal(parseIcs(base('REPLY', ['ATTENDEE;PARTSTAT=ACCEPTED;CN=Ana:mailto:ana@x.com'])).attendees[0].response, 'accepted');
  assert.equal(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR'), null);
});

ok('fusos: Z, TZID de Brasília, fuso do Outlook (Windows), hora sem fuso e dia inteiro', () => {
  assert.equal(icsDate('20261104T150000', { TZID: 'America/Sao_Paulo' }).iso, '2026-11-04T18:00:00.000Z');
  assert.equal(icsDate('20261104T150000', { TZID: 'E. South America Standard Time' }).iso, '2026-11-04T18:00:00.000Z');
  assert.equal(icsDate('20260115T090000', { TZID: 'America/New_York' }).iso, '2026-01-15T14:00:00.000Z', 'inverno de NY = -5');
  assert.equal(icsDate('20260715T090000', { TZID: 'America/New_York' }).iso, '2026-07-15T13:00:00.000Z', 'verão de NY = -4');
  assert.equal(icsDate('20261104T150000', {}).iso, '2026-11-04T18:00:00.000Z', 'sem fuso = Brasília');
  assert.equal(icsDate('20261104T150000', { TZID: 'Fuso/Inexistente' }).iso, '2026-11-04T18:00:00.000Z');
  const d = icsDate('20261104', { VALUE: 'DATE' });
  assert.equal(d.allDay, true); assert.equal(d.date, '2026-11-04');
  assert.equal(icsDate('lixo', {}), null);
});

ok('convite do Outlook: TZID com aspas, texto escapado, lembrete ignorado, Teams na descrição e DURATION', () => {
  const ics = ['BEGIN:VCALENDAR', 'METHOD:REQUEST', 'BEGIN:VEVENT', 'UID:040000008200E00074C5B7101A82E008',
    'DTSTART;TZID="E. South America Standard Time":20261105T100000', 'DURATION:PT45M',
    'SUMMARY:Alinhamento\\, fase 2', 'LOCATION:Sala 3; prédio B',
    'DESCRIPTION:Pauta:\\n1) números\\nLink: https://teams.microsoft.com/l/meetup-join/19%3ameeting_x',
    'ORGANIZER;CN="Silva, João":mailto:Joao@Cliente.com.br',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Lembrete', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const inv = parseIcs(ics);
  assert.equal(inv.title, 'Alinhamento, fase 2');
  assert.equal(inv.start, '2026-11-05T13:00:00.000Z');
  assert.equal(inv.end, '2026-11-05T13:45:00.000Z');
  assert.equal(inv.description.startsWith('Pauta:\n1) números'), true, 'o DESCRIPTION do alarme não substitui o do evento');
  assert.equal(inv.organizer.name, 'Silva, João');
  assert.equal(inv.organizer.email, 'joao@cliente.com.br');
  assert.match(inv.meetLink, /^https:\/\/teams\.microsoft\.com\//);
  assert.equal(meetingLinkOf({ location: 'https://us02web.zoom.us/j/123?pwd=x' }), 'https://us02web.zoom.us/j/123?pwd=x');
});

ok('parte de convite no e-mail: text/calendar sem nome e invite.ics anexado são achados; PDF não', () => {
  const b64 = (t) => Buffer.from(t).toString('base64url');
  const payload = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      { partId: '0.0', mimeType: 'text/plain', body: { data: b64('oi') } },
      { partId: '0.1', mimeType: 'text/html', body: { data: b64('<p>oi</p>') } },
      { partId: '0.2', mimeType: 'text/calendar', headers: [{ name: 'Content-Type', value: 'text/calendar; charset="UTF-8"; method=COUNTER' }], body: { data: b64(COUNTER), size: 900 } },
    ] },
    { partId: '1', mimeType: 'application/ics', filename: 'invite.ics', body: { attachmentId: 'ATT123456789', size: 1200 } },
    { partId: '2', mimeType: 'application/pdf', filename: 'pauta.pdf', body: { attachmentId: 'ATT987654321', size: 5000 } },
  ] };
  const cal = walkParts(payload).attachments.filter(isCalendarPart);
  assert.equal(cal.length, 2);
  assert.equal(isCalendarPart({ mimeType: 'application/octet-stream', filename: 'Convite.ICS' }), true);
  assert.equal(isCalendarPart({ mimeType: 'application/pdf', filename: 'pauta.pdf' }), false);
});

ok('formulário: horário de Brasília, convidados, Meet, lembrete e erros', () => {
  const { fields } = parseEventForm({ title: ' KUHN ', date: '2026-11-04', startTime: '15:00', durationMinutes: 60, attendees: ['A@x.com', 'a@x.com', 'b@y.com'], meet: true, reminderMinutes: 10 });
  assert.equal(fields.title, 'KUHN');
  assert.equal(fields.startISO, '2026-11-04T18:00:00.000Z');
  assert.equal(fields.endISO, '2026-11-04T19:00:00.000Z');
  assert.deepEqual(fields.attendees, ['a@x.com', 'b@y.com']);
  assert.equal(fields.meet, true);
  assert.equal(fields.reminderMinutes, 10);
  assert.equal(parseEventForm({ title: 'x', date: '2026-11-04', startTime: '15:00' }).fields.reminderMinutes, null, 'sem lembrete escolhido = padrão do Google');
  assert.match(parseEventForm({ title: '' }).error, /título/);
  assert.match(parseEventForm({ title: 'x', date: '2026-11-04', startTime: '15:00', attendees: ['sem-arroba'] }).error, /e-mail válido/);
  assert.match(parseEventForm({ title: 'x', date: '2026-11-04', startTime: '15:00', durationMinutes: 2 }).error, /duração/);
  assert.match(parseEventForm({ title: 'x', date: '2026-11-04', startTime: '15:00', reminderMinutes: 7 }).error, /Lembrete/);
  assert.match(parseEventForm({ title: 'x', date: '2026-11-04', startTime: '15:00', attendees: Array.from({ length: 31 }, (_, i) => `p${i}@x.com`) }).error, /30/);
});

ok('corpo do Google: Meet pedido, lembrete (padrão / nenhum / n minutos) e fuso', () => {
  const f = { title: 'T', startISO: '2026-11-04T18:00:00.000Z', endISO: '2026-11-04T19:00:00.000Z', attendees: ['a@x.com'], meet: true, reminderMinutes: 30 };
  const b = buildPanelEventBody(f, 'req-1');
  assert.equal(b.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(b.conferenceData.createRequest.requestId, 'req-1');
  assert.deepEqual(b.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
  assert.equal(b.start.timeZone, 'America/Sao_Paulo');
  assert.deepEqual(b.attendees, [{ email: 'a@x.com' }]);
  assert.deepEqual(buildPanelEventBody({ ...f, meet: false, reminderMinutes: null }).reminders, { useDefault: true });
  assert.equal(buildPanelEventBody({ ...f, meet: false }).conferenceData, undefined);
  assert.deepEqual(buildPanelEventBody({ ...f, reminderMinutes: -1 }).reminders, { useDefault: false, overrides: [] });
});

ok('editar: quem já respondeu continua com a resposta; Meet existente não é trocado', () => {
  const cur = { hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc', attendees: [{ email: 'A@x.com', responseStatus: 'accepted' }, { email: 'b@y.com', responseStatus: 'declined' }] };
  const body = buildPanelEventBody({ title: 'T', startISO: 'x', endISO: 'y', attendees: ['a@x.com', 'novo@z.com'], meet: true });
  const { requestBody } = composePatch(cur, body);
  assert.equal(requestBody.conferenceData, undefined);
  assert.deepEqual(requestBody.attendees.map((a) => a.responseStatus || 'novo'), ['accepted', 'novo']);
});

ok('detalhe do evento: resposta de cada um, organizador, Meet, lembrete e quem pode editar', () => {
  const ev = mapEventDetail({
    id: 'e1', iCalUID: 'e1@google.com', summary: 'KUHN', status: 'confirmed', start: { dateTime: '2026-11-04T15:00:00-03:00' }, end: { dateTime: '2026-11-04T16:00:00-03:00' },
    organizer: { email: 'eu@pricetax.com.br', self: true },
    attendees: [
      { email: 'eu@pricetax.com.br', self: true, organizer: true, responseStatus: 'accepted' },
      { email: 'Felipe@pricetax.com.br', displayName: 'Felipe', responseStatus: 'tentative', comment: 'pode ser 14h30?' },
      { email: 'sala@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
    ],
    conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
  });
  assert.equal(ev.id, 'google-e1');
  assert.equal(ev.isOrganizer, true); assert.equal(ev.canEdit, true);
  assert.equal(ev.myResponse, 'accepted');
  assert.equal(ev.attendees.length, 2, 'sala de reunião não é participante');
  assert.equal(ev.attendees[1].email, 'felipe@pricetax.com.br');
  assert.equal(ev.attendees[1].comment, 'pode ser 14h30?');
  assert.equal(ev.meetLink, 'https://meet.google.com/abc-defg-hij');
  assert.equal(ev.reminderMinutes, 10);
  const guest = mapEventDetail({ id: 'e2', start: { date: '2026-11-04' }, end: { date: '2026-11-05' }, organizer: { email: 'x@y.com' }, attendees: [{ email: 'eu@p.com', self: true }], reminders: { useDefault: true } });
  assert.equal(guest.canEdit, false); assert.equal(guest.myResponse, 'needsAction'); assert.equal(guest.reminderMinutes, null);
});

ok('responder com nota e proposta de novo horário', () => {
  const list = applySelfRsvp([{ email: 'a', self: true }, { email: 'b' }], 'tentative', 'nota');
  assert.deepEqual(list[0], { email: 'a', self: true, responseStatus: 'tentative', comment: 'nota' });
  assert.equal(list[1].comment, undefined);
  assert.equal(applySelfRsvp([{ email: 'b' }], 'accepted', 'x'), null, 'quem não é convidado não responde');
  assert.throws(() => applySelfRsvp([{ email: 'a', self: true }], 'talvez'));
  const r = parseRange({ start: '2026-11-04T17:30:00.000Z', end: '2026-11-04T18:30:00.000Z' });
  assert.equal(proposalComment(r.startISO, r.endISO, 'Tenho outra reunião às 15h.'), 'Proposta de novo horário: qua., 4 de nov., 14:30–15:30 (horário de Brasília). Tenho outra reunião às 15h.');
  assert.match(parseRange({ start: '2026-11-04T18:00:00Z', end: '2026-11-04T17:00:00Z' }).error, /depois/);
  assert.match(parseRange({}).error, /novo horário/);
  assert.match(parseRange({ start: '2026-11-04T00:00:00Z', end: '2026-11-05T00:00:00Z' }).error, /12 horas/);
});

ok('editar mantém a sala reservada e quem editou (não estão no formulário)', () => {
  const cur = { attendees: [{ email: 'sala-1@resource.calendar.google.com', resource: true, responseStatus: 'accepted' }, { email: 'eu@pricetax.com.br', self: true, responseStatus: 'accepted' }, { email: 'ana@x.com', responseStatus: 'accepted' }] };
  const { requestBody } = composePatch(cur, { summary: 'Novo título', attendees: [{ email: 'ana@x.com' }, { email: 'bia@y.com' }] });
  const emails = requestBody.attendees.map((x) => x.email);
  assert.deepEqual(emails.sort(), ['ana@x.com', 'bia@y.com', 'eu@pricetax.com.br', 'sala-1@resource.calendar.google.com']);
  assert.equal(requestBody.attendees.find((x) => x.email === 'ana@x.com').responseStatus, 'accepted');
});

// Prazo das leituras da Agenda (02/11/2026): fonte que não responde vira aviso, não tela girando para sempre.
{
  let msg = '';
  try { await withDeadline(new Promise(() => {}), 50, 'O Google Calendar'); } catch (e) { msg = e.deadline ? e.message : ''; }
  ok('fonte que não responde estoura o prazo com aviso', () => assert.match(msg, /^O Google Calendar demorou mais de \d+ s para responder\.$/));
  const fast = await withDeadline(Promise.resolve([1]), 1000, 'x');
  ok('fonte rápida passa direto', () => assert.deepEqual(fast, [1]));
}

console.log(`\n${n} verificações da agenda e dos convites passaram.`);
