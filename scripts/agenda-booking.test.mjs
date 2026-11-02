// Link público de agendamento (§139): horários livres em Brasília, almoço, aviso mínimo, dias da semana, o que ocupa a agenda (sem
// vazar título) e o pedido de quem marca (e-mails obrigatórios, Meet escolhido). Puro. Rodar: node scripts/agenda-booking.test.mjs
import assert from 'node:assert/strict';
import { computeSlots, busyFromEvents, parseBooking, cleanSettings, cleanRanges, newBookingToken, brDay, DEFAULTS, MAX_RANGES } from '../server/agendaBooking.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const br = (s) => Date.parse(`${s}-03:00`);
const NOW = br('2026-11-02T07:00:00'); // segunda, 7h de Brasília

ok('configuração: fora do permitido volta ao padrão', () => {
  assert.deepEqual(cleanSettings({}), DEFAULTS);
  const s = cleanSettings({ duration: 45, dayStart: '09:00', dayEnd: '17:00', lunch: false, daysAhead: 30, minNoticeHours: 24, weekdays: [1, 3, 9], title: ' PRICETAX ' });
  assert.deepEqual([s.duration, s.ranges, s.daysAhead, s.minNoticeHours, s.weekdays, s.title], [45, [{ start: '09:00', end: '17:00' }], 30, 24, [1, 3], 'PRICETAX'], 'configuração antiga sem almoço = uma faixa');
  assert.deepEqual(cleanSettings({ dayStart: '07:00', dayEnd: '19:00', lunch: true }).ranges, [{ start: '07:00', end: '12:00' }, { start: '13:00', end: '19:00' }], 'configuração antiga com almoço = duas faixas');
  const bad = cleanSettings({ duration: 7, dayStart: '18:00', dayEnd: '09:00', daysAhead: 999, weekdays: [] });
  assert.deepEqual([bad.duration, bad.dayStart, bad.dayEnd, bad.daysAhead, bad.weekdays], [30, '08:00', '18:00', 14, [1, 2, 3, 4, 5]]);
});

ok('faixas de horário: almoço em qualquer horário, sobrepostas juntadas, ordem, limite e inválidas fora', () => {
  assert.deepEqual(cleanRanges([{ start: '14:00', end: '18:00' }, { start: '08:30', end: '11:30' }]), [{ start: '08:30', end: '11:30' }, { start: '14:00', end: '18:00' }]);
  assert.deepEqual(cleanRanges([{ start: '08:00', end: '12:00' }, { start: '11:00', end: '13:00' }]), [{ start: '08:00', end: '13:00' }]);
  assert.deepEqual(cleanRanges([{ start: '10:00', end: '09:00' }, { start: '04:00', end: '06:00' }, { start: 'x', end: '10:00' }, { start: '10:00', end: '10:10' }]), []);
  assert.equal(cleanRanges(Array.from({ length: 6 }, (_, i) => ({ start: `${String(8 + 2 * i).padStart(2, '0')}:00`, end: `${String(9 + 2 * i).padStart(2, '0')}:00` }))).length, MAX_RANGES);
  assert.deepEqual(cleanSettings({ ranges: [] }).ranges, DEFAULTS.ranges, 'nenhuma faixa válida = padrão');
  const s = cleanSettings({ ranges: [{ start: '09:00', end: '11:30' }, { start: '14:00', end: '17:00' }] });
  assert.deepEqual([s.dayStart, s.dayEnd], ['09:00', '17:00']);
  const seg = computeSlots({ busy: [], settings: { ...s, duration: 60, minNoticeHours: 0 }, now: NOW }).days.find((d) => d.date === '2026-11-02');
  const iso = (h) => new Date(br(`2026-11-02T${h}:00`)).toISOString();
  assert.deepEqual(seg.slots, [iso('09:00'), iso('09:30'), iso('10:00'), iso('10:30'), iso('14:00'), iso('14:30'), iso('15:00'), iso('15:30'), iso('16:00')], 'cada horário cabe inteiro numa faixa; 12h–14h fora');
});

ok('horários livres: expediente, almoço fora, aviso mínimo de 2 h, só dias úteis', () => {
  const { days } = computeSlots({ busy: [], settings: { daysAhead: 7 }, now: NOW });
  const seg = days.find((d) => d.date === '2026-11-02');
  assert.equal(seg.slots[0], new Date(br('2026-11-02T09:00:00')).toISOString(), 'agora 7h + 2 h de aviso = primeiro às 9h');
  assert.ok(!seg.slots.includes(new Date(br('2026-11-02T12:00:00')).toISOString()) && !seg.slots.includes(new Date(br('2026-11-02T12:30:00')).toISOString()), 'almoço fora');
  assert.equal(seg.slots[seg.slots.length - 1], new Date(br('2026-11-02T17:30:00')).toISOString(), 'último cabe até 18h');
  assert.ok(!days.some((d) => d.date === '2026-11-07' || d.date === '2026-11-08'), 'sábado e domingo fora');
  assert.equal(brDay(br('2026-11-08T23:30:00')).dow, 0);
});

ok('compromisso ocupa o horário (e o encaixe de 60 min não pode cruzar)', () => {
  const busy = [{ start: br('2026-11-03T10:00:00'), end: br('2026-11-03T11:00:00') }];
  const ter = computeSlots({ busy, settings: { duration: 60 }, now: NOW }).days.find((d) => d.date === '2026-11-03');
  const iso = (h) => new Date(br(`2026-11-03T${h}:00`)).toISOString();
  assert.ok(!ter.slots.includes(iso('10:00')) && !ter.slots.includes(iso('09:30')) && !ter.slots.includes(iso('10:30')));
  assert.ok(ter.slots.includes(iso('09:00')) && ter.slots.includes(iso('11:00')));
  assert.deepEqual(Object.keys(ter.busy[0]).sort(), ['end', 'start'], 'só início e fim saem; nada de título');
});

ok('o que ocupa: livre, cancelado e recusado não; dia inteiro só se "ocupado"', () => {
  const items = [
    { summary: 'Segredo do cliente', status: 'confirmed', start: { dateTime: '2026-11-03T13:00:00Z' }, end: { dateTime: '2026-11-03T14:00:00Z' } },
    { summary: 'Livre', transparency: 'transparent', start: { dateTime: '2026-11-03T15:00:00Z' }, end: { dateTime: '2026-11-03T16:00:00Z' } },
    { summary: 'Cancelado', status: 'cancelled', start: { dateTime: '2026-11-03T17:00:00Z' }, end: { dateTime: '2026-11-03T18:00:00Z' } },
    { summary: 'Recusei', attendees: [{ self: true, responseStatus: 'declined' }], start: { dateTime: '2026-11-03T19:00:00Z' }, end: { dateTime: '2026-11-03T20:00:00Z' } },
    { summary: 'Feriado', start: { date: '2026-11-04' }, end: { date: '2026-11-05' } },
  ];
  const busy = busyFromEvents(items);
  assert.equal(busy.length, 2);
  assert.equal(JSON.stringify(busy).includes('Segredo'), false);
  const qua = computeSlots({ busy, settings: {}, now: NOW }).days.find((d) => d.date === '2026-11-04');
  assert.equal(qua.slots.length, 0, 'dia inteiro ocupado bloqueia o dia');
});

ok('pedido: nome, assunto, ao menos um e-mail válido, Meet escolhido; campo-isca barra robô', () => {
  const base = { name: 'Ana Parceira', subject: 'Proposta', emails: 'ana@parceiro.com, Bia@Parceiro.com ana@parceiro.com', meet: true, start: '2026-11-03T12:00:00.000Z' };
  const { fields } = parseBooking(base);
  assert.deepEqual(fields.emails, ['ana@parceiro.com', 'bia@parceiro.com']);
  assert.equal(fields.meet, true);
  assert.match(parseBooking({ ...base, emails: '' }).error, /pelo menos um/);
  assert.match(parseBooking({ ...base, emails: 'ana@' }).error, /válido/);
  assert.match(parseBooking({ ...base, meet: undefined }).error, /Meet/);
  assert.match(parseBooking({ ...base, meet: 'sim' }).error, /Meet/);
  assert.equal(parseBooking({ ...base, meet: false }).fields.meet, false);
  assert.match(parseBooking({ ...base, name: 'A' }).error, /nome/);
  assert.match(parseBooking({ ...base, subject: '' }).error, /assunto/);
  assert.match(parseBooking({ ...base, website: 'http://spam' }).error, /recusado/);
  assert.match(parseBooking({ ...base, emails: Array.from({ length: 21 }, (_, i) => `p${i}@x.com`) }).error, /20/);
});

ok('token do link: 24 caracteres seguros, diferentes a cada vez', () => {
  const a = newBookingToken(); const b = newBookingToken();
  assert.match(a, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(a, b);
});

console.log(`\n${n} verificações do link de agendamento passaram.`);
