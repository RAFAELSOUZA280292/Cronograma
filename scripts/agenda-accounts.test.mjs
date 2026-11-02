// Agendas extras (§128): link iCal (parser, recorrência, exceções, fuso), Microsoft Graph (mapeamento), conflitos e privacidade
// para a RENATA. Puro: sem banco, sem rede. Rodar: node scripts/agenda-accounts.test.mjs
import { parseFeed, expandFeed, normalizeFeedUrl, isPrivateIp, parseRRule } from '../server/icalFeed.js';
import { mapGraphEvent, mapGraphDetail, buildGraphEventBody, brWall, msIdentity, MSA_TENANT } from '../server/microsoftGraph.js';
import { findConflicts, conflictsWith, isBusy } from '../shared/agendaConflicts.js';
import { privacyOf, parseEventId, extraEventId, renataView, isHexColor } from '../server/calendarAccounts.js';

let failed = 0; let n = 0;
const ok = (name, cond, extra) => { n += 1; if (cond) return; failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); };

const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const ev = (lines) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;

// --- link e endereço ---
ok('webcal vira https', normalizeFeedUrl('webcal://calendar.google.com/x/basic.ics') === 'https://calendar.google.com/x/basic.ics');
ok('http recusado', normalizeFeedUrl('http://exemplo.com/a.ics') === null);
ok('porta estranha recusada', normalizeFeedUrl('https://exemplo.com:8443/a.ics') === null);
ok('usuário na URL recusado', normalizeFeedUrl('https://a:b@exemplo.com/a.ics') === null);
ok('lixo recusado', normalizeFeedUrl('nada') === null);
for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) ok(`IP interno ${ip}`, isPrivateIp(ip));
for (const ip of ['8.8.8.8', '142.250.79.14', '2800:3f0:4001:80a::200e']) ok(`IP público ${ip}`, !isPrivateIp(ip));

// --- evento simples com fuso de Brasília e com UTC ---
const simple = parseFeed(ics(ev(['UID:a1', 'SUMMARY:Reunião BRASILPRICE', 'DTSTART;TZID=America/Sao_Paulo:20261105T140000', 'DTEND;TZID=America/Sao_Paulo:20261105T150000', 'LOCATION:Sala 2\\, 3º andar'])
  + ev(['UID:a2', 'SUMMARY:UTC', 'DTSTART:20261105T170000Z', 'DURATION:PT30M'])
  + ev(['UID:a3', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261115', 'DTEND;VALUE=DATE:20261116', 'TRANSP:TRANSPARENT'])
  + 'BEGIN:VTIMEZONE\r\nTZID:America/Sao_Paulo\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n'));
ok('3 eventos lidos', simple.length === 3, simple.length);
const nov = expandFeed(simple, '2026-11-01T03:00:00Z', '2026-12-01T03:00:00Z');
const a1 = nov.find((e) => e.title === 'Reunião BRASILPRICE');
ok('14h de Brasília = 17h UTC', a1 && a1.start === '2026-11-05T17:00:00.000Z' && a1.end === '2026-11-05T18:00:00.000Z', a1);
ok('vírgula escapada no local', a1 && a1.location === 'Sala 2, 3º andar', a1 && a1.location);
const a2 = nov.find((e) => e.title === 'UTC');
ok('DURATION vira fim', a2 && a2.end === '2026-11-05T17:30:00.000Z', a2);
const a3 = nov.find((e) => e.title === 'Feriado');
ok('dia inteiro: data e fim exclusivo', a3 && a3.allDay && a3.start === '2026-11-15' && a3.end === '2026-11-16', a3);
ok('livre (TRANSP) marcado', a3 && a3.transparent === true);
ok('fora do período não entra', expandFeed(simple, '2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z').length === 0);

// --- semanal com BYDAY, COUNT, EXDATE e uma ocorrência alterada ---
const weekly = parseFeed(ics(
  ev(['UID:w1', 'SUMMARY:Aula', 'DTSTART;TZID=America/Sao_Paulo:20261102T190000', 'DTEND;TZID=America/Sao_Paulo:20261102T210000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE;TZID=America/Sao_Paulo:20261104T190000'])
  + ev(['UID:w1', 'SUMMARY:Aula (remarcada)', 'RECURRENCE-ID;TZID=America/Sao_Paulo:20261109T190000', 'DTSTART;TZID=America/Sao_Paulo:20261110T190000', 'DTEND;TZID=America/Sao_Paulo:20261110T210000']),
));
const wk = expandFeed(weekly, '2026-11-01T00:00:00Z', '2026-12-31T00:00:00Z');
const starts = wk.map((e) => `${e.title}@${e.start}`);
ok('COUNT=6 menos 1 EXDATE e 1 remarcada (que entra pelo próprio evento) = 5 itens', wk.length === 5, starts);
ok('quarta 04/11 excluída', !wk.some((e) => e.start === '2026-11-04T22:00:00.000Z'), starts);
ok('09/11 virou 10/11', wk.some((e) => e.title === 'Aula (remarcada)' && e.start === '2026-11-10T22:00:00.000Z') && !wk.some((e) => e.start === '2026-11-09T22:00:00.000Z'), starts);
ok('COUNT conta desde o início (02, 04, 09, 11, 16, 18): a última é 18/11', wk[wk.length - 1].start === '2026-11-18T22:00:00.000Z', starts);
ok('ids distintos por ocorrência', new Set(wk.map((e) => e.rawId)).size === wk.length);

// --- mensal na última sexta, até UNTIL; diário com intervalo; anual ---
const monthly = parseFeed(ics(ev(['UID:m1', 'SUMMARY:Fechamento', 'DTSTART;TZID=America/Sao_Paulo:20260925T090000', 'DTEND;TZID=America/Sao_Paulo:20260925T100000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20261231T235959Z'])));
const mo = expandFeed(monthly, '2026-09-01T00:00:00Z', '2027-03-01T00:00:00Z').map((e) => e.start.slice(0, 10));
ok('última sexta de set–dez', JSON.stringify(mo) === JSON.stringify(['2026-09-25', '2026-10-30', '2026-11-27', '2026-12-25']), mo);
const daily = parseFeed(ics(ev(['UID:d1', 'SUMMARY:Treino', 'DTSTART:20261101T100000Z', 'DTEND:20261101T110000Z', 'RRULE:FREQ=DAILY;INTERVAL=3'])));
const dd = expandFeed(daily, '2026-11-01T00:00:00Z', '2026-11-11T00:00:00Z').map((e) => e.start.slice(8, 10));
ok('a cada 3 dias sem fim, cortado pelo período', JSON.stringify(dd) === JSON.stringify(['01', '04', '07', '10']), dd);
const yearly = parseFeed(ics(ev(['UID:y1', 'SUMMARY:Aniversário', 'DTSTART;VALUE=DATE:20200229', 'RRULE:FREQ=YEARLY'])));
ok('29/02 só em ano bissexto', expandFeed(yearly, '2027-01-01T00:00:00Z', '2029-01-01T00:00:00Z').length === 1);
const series = parseFeed(ics(ev(['UID:s1', 'SUMMARY:Antiga', 'DTSTART:20200106T120000Z', 'DTEND:20200106T130000Z', 'RRULE:FREQ=WEEKLY'])));
ok('série antiga sem fim aparece no período atual', expandFeed(series, '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z').length === 1);
ok('RRULE lida', parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=1MO,-1FR').byday.length === 2);
ok('cancelado marcado', expandFeed(parseFeed(ics(ev(['UID:c', 'SUMMARY:x', 'DTSTART:20261105T100000Z', 'DTEND:20261105T110000Z', 'STATUS:CANCELLED']))), '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z')[0].status === 'cancelled');
ok('VALARM ignorado', parseFeed(ics(ev(['UID:al', 'SUMMARY:Com alarme', 'DTSTART:20261105T100000Z', 'BEGIN:VALARM', 'DESCRIPTION:lembrete', 'TRIGGER:-PT15M', 'END:VALARM'])))[0].description === undefined);

// --- Microsoft Graph ---
const g = {
  id: 'AAMk1', subject: 'Comitê PETCONT', bodyPreview: 'pauta', isAllDay: false, isCancelled: false, isOrganizer: false, showAs: 'busy',
  start: { dateTime: '2026-11-05T14:00:00.0000000', timeZone: 'E. South America Standard Time' }, end: { dateTime: '2026-11-05T15:30:00.0000000', timeZone: 'E. South America Standard Time' },
  responseStatus: { response: 'tentativelyAccepted' }, organizer: { emailAddress: { name: 'Fulana', address: 'fulana@petcont.com.br' } },
  attendees: [{ type: 'required', status: { response: 'accepted' }, emailAddress: { name: 'Ronaldo', address: 'Ronaldo@Petcont.com.br' } }, { type: 'optional', status: { response: 'none' }, emailAddress: { name: 'Beltrano', address: 'b@x.com' } }],
  location: { displayName: 'Teams' }, type: 'occurrence', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc' }, iCalUId: 'uid-1', isReminderOn: true, reminderMinutesBeforeStart: 15,
};
const m = mapGraphEvent(g);
ok('Graph: horário de Brasília → UTC', m.start === '2026-11-05T17:00:00.000Z' && m.end === '2026-11-05T18:30:00.000Z', m);
ok('Graph: talvez', m.myResponse === 'tentative');
ok('Graph: organizador mostrado', m.organizer === 'Fulana');
ok('Graph: link do Teams', m.meetLink.includes('teams.microsoft.com'));
const det = mapGraphDetail(g, 'ronaldo@petcont.com.br');
ok('Graph: organizador entra na lista', det.attendees[0].organizer && det.attendees[0].email === 'fulana@petcont.com.br', det.attendees);
ok('Graph: "você" reconhecido sem diferença de maiúsculas', det.attendees.some((a) => a.self && a.response === 'accepted'));
ok('Graph: opcional e sem resposta', det.attendees.some((a) => a.optional && a.response === 'needsAction'));
ok('Graph: recorrente, não editável por convidado, lembrete', det.recurring && !det.canEdit && det.reminderMinutes === 15);
const allDay = mapGraphEvent({ ...g, isAllDay: true, start: { dateTime: '2026-11-15T00:00:00.0000000', timeZone: 'E. South America Standard Time' }, end: { dateTime: '2026-11-16T00:00:00.0000000', timeZone: 'E. South America Standard Time' } });
ok('Graph: dia inteiro em data', allDay.allDay && allDay.start === '2026-11-15' && allDay.end === '2026-11-16', allDay);
ok('Graph: UTC também lido', mapGraphEvent({ ...g, start: { dateTime: '2026-11-05T17:00:00.0000000', timeZone: 'UTC' } }).start === '2026-11-05T17:00:00.000Z');
ok('Graph: organizador = "organizer"', mapGraphEvent({ ...g, isOrganizer: true }).myResponse === 'organizer');
ok('Graph: livre', mapGraphEvent({ ...g, showAs: 'free' }).transparent);
ok('brWall: ISO → relógio de Brasília', brWall('2026-11-05T17:00:00.000Z') === '2026-11-05T14:00:00');
const body = buildGraphEventBody({ title: 'T', startISO: '2026-11-05T17:00:00.000Z', endISO: '2026-11-05T18:00:00.000Z', attendees: ['a@b.com'], meet: true, reminderMinutes: -1, description: 'd', location: '' }, { teams: true });
ok('corpo Graph: hora local + fuso, Teams, sem lembrete', body.start.dateTime === '2026-11-05T14:00:00' && body.start.timeZone === 'E. South America Standard Time' && body.isOnlineMeeting && body.isReminderOn === false && body.attendees[0].emailAddress.address === 'a@b.com', body);
ok('corpo Graph: sem Teams em conta pessoal', !buildGraphEventBody({ title: 'T', startISO: '2026-11-05T17:00:00Z', endISO: '2026-11-05T18:00:00Z', meet: true, reminderMinutes: null }, { teams: false }).isOnlineMeeting);
const tok = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
ok('id_token: e-mail corporativo', msIdentity(tok({ preferred_username: 'Ronaldo@BrasilPrice.com.br', tid: 'abc' })).email === 'ronaldo@brasilprice.com.br');
ok('id_token: conta pessoal', msIdentity(tok({ email: 'r@outlook.com', tid: MSA_TENANT })).personal === true);
ok('id_token inválido não quebra', msIdentity('lixo').email === '');

// --- conflitos ---
const E = (id, s, e, extra = {}) => ({ id, title: id, start: `2026-11-05T${s}:00-03:00`, end: `2026-11-05T${e}:00-03:00`, ...extra });
const list = [E('a', '14:00', '15:00', { accountLabel: 'PRICETAX' }), E('b', '14:30', '16:00', { accountLabel: 'BRASILPRICE' }), E('c', '16:00', '17:00'), E('d', '14:15', '14:45', { myResponse: 'declined' }), E('e', '14:00', '15:00', { transparent: true }), { id: 'f', allDay: true, start: '2026-11-05', end: '2026-11-06' }, E('g', '15:30', '15:45', { status: 'cancelled' })];
const cf = findConflicts(list);
ok('a × b em conflito', cf.get('a').some((x) => x.id === 'b') && cf.get('b').some((x) => x.id === 'a'));
ok('encostar não é conflito (b termina 16h, c começa 16h)', !cf.has('c'));
ok('recusado, livre, dia inteiro e cancelado não contam', !cf.has('d') && !cf.has('e') && !cf.has('f') && !cf.has('g'));
ok('isBusy rejeita fim antes do início', !isBusy(E('z', '15:00', '14:00')));
const cw = conflictsWith('2026-11-05T17:45:00.000Z', '2026-11-05T18:15:00.000Z', list);
ok('horário novo 14:45–15:15 choca com a e b', cw.map((x) => x.id).join() === 'a,b', cw.map((x) => x.id));
ok('editar o próprio não conta', conflictsWith('2026-11-05T17:00:00.000Z', '2026-11-05T18:00:00.000Z', [list[0]], 'a').length === 0);

// --- privacidade e ids ---
ok('pricetax.com.br = pricetax', privacyOf('Ronaldo@PRICETAX.com.br') === 'pricetax');
ok('outro domínio = particular', privacyOf('ronaldo@brasilprice.com.br') === 'particular' && privacyOf('x@pricetax.com.br.evil.com') === 'particular' && privacyOf('') === 'particular');
const xid = extraEventId('ua0123456789ab', 'AAMk:x/y=');
ok('id de evento extra vai e volta (com dois-pontos no id do provedor)', JSON.stringify(parseEventId(xid)) === JSON.stringify({ accountId: 'ua0123456789ab', rawId: 'AAMk:x/y=' }));
ok('id da principal não é extra', parseEventId('google-abc') === null && parseEventId('x:outra:1') === null);
ok('cor hexadecimal', isHexColor('#0B8043') && !isHexColor('red') && !isHexColor('#fff'));
const accs = [{ id: 'ua1', privacy: 'particular', renataCalendar: false }, { id: 'ua2', privacy: 'particular', renataCalendar: true }, { id: 'ua3', privacy: 'pricetax', renataCalendar: false }];
const rv = renataView([
  { id: 'p', title: 'Principal', account: 'principal' }, { id: 'x1', account: 'ua1', title: 'Consulta médica', description: 'segredo', location: 'Clínica', start: 's', end: 'e', attendees: [1] },
  { id: 'x2', account: 'ua2', title: 'Reunião PETCONT' }, { id: 'x3', account: 'ua3', title: 'Cliente' },
], accs);
const r1 = rv.find((e) => e.id === 'x1');
ok('RENATA: particular sem permissão vira "Ocupado" sem detalhes', r1.title === 'Ocupado (agenda particular)' && !r1.description && !r1.location && !r1.attendees && r1.start === 's');
ok('RENATA: particular com permissão mantém título', rv.find((e) => e.id === 'x2').title === 'Reunião PETCONT');
ok('RENATA: conta PRICETAX mantém título', rv.find((e) => e.id === 'x3').title === 'Cliente');
ok('RENATA: principal não muda', rv.find((e) => e.id === 'p').title === 'Principal');
ok('RENATA: conta desconhecida (sem registro) vira "Ocupado"', renataView([{ id: 'q', account: 'uaX', title: 'x' }], []).every((e) => e.title === 'Ocupado (agenda particular)'));

console.log(failed ? `\n${failed} de ${n} verificações falharam.` : `${n} verificações ok.`);
process.exit(failed ? 1 : 0);
