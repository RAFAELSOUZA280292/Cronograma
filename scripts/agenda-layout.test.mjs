// Grade da Agenda no padrão do Google (03/11/2026): faixas de dia inteiro/vários dias, divisão na meia-noite e colunas só onde há
// sobreposição. Casos tirados do print do Rafael da semana de 2 a 8/11/2026. Rodar: TZ=America/Sao_Paulo node scripts/agenda-layout.test.mjs
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const assert = (await import('node:assert/strict')).default;
const { layoutTopRow, timedSegments, layoutDay, eventsPerDay, allDaySpan, isLong, dayKey } = await import('../src/agenda/weekLayout.js');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 2 + i)); // seg 2 a dom 8
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();

ok('dia inteiro do Google (fim exclusivo): Smart01 só na terça, não entre segunda e terça', () => {
  const ev = { id: 'g1', source: 'google', allDay: true, start: '2026-11-03', end: '2026-11-04', title: 'Enviar proposta de parceria à Smart01' };
  const { bars, rows } = layoutTopRow([ev], week);
  assert.equal(rows, 1);
  assert.deepEqual([bars[0].col, bars[0].span], [1, 1]);
});

ok('atividade do CRM de um dia (fim inclusivo): DELAVAL só na quinta', () => {
  const ev = { id: 'c1', source: 'crm_activity', allDay: true, start: '2026-11-05', end: '2026-11-05', title: 'Elaborar e enviar proposta — DELAVAL LTDA' };
  const { bars } = layoutTopRow([ev], week);
  assert.deepEqual([bars[0].col, bars[0].span], [3, 1]);
  assert.deepEqual([dayKey(allDaySpan(ev).start), dayKey(allDaySpan(ev).end)], ['2026-11-05', '2026-11-06']);
});

ok('com horário e mais de 24 h vira faixa: ATRINCA CONTÁBIL de quinta 8h a sábado', () => {
  const ev = { id: 'g2', source: 'google', allDay: false, start: at(5, 8), end: at(7, 18), title: 'ATRINCA CONTÁBIL' };
  assert.equal(isLong(ev), true);
  const { bars } = layoutTopRow([ev], week);
  assert.deepEqual([bars[0].col, bars[0].span], [3, 3]);
  assert.equal(timedSegments([ev], week).get('2026-11-05').length, 0, 'não aparece também como bloco no horário');
});

ok('faixas que se cruzam vão para linhas diferentes; as que não se cruzam dividem a linha', () => {
  const a = { id: 'a', source: 'google', allDay: true, start: '2026-11-02', end: '2026-11-05', title: 'A' };
  const b = { id: 'b', source: 'google', allDay: true, start: '2026-11-04', end: '2026-11-05', title: 'B' };
  const c = { id: 'c', source: 'google', allDay: true, start: '2026-11-06', end: '2026-11-07', title: 'C' };
  const { bars, rows } = layoutTopRow([a, b, c], week);
  assert.equal(rows, 2);
  const byId = Object.fromEntries(bars.map((x) => [x.ev.id, x]));
  assert.equal(byId.a.row, 0); assert.equal(byId.b.row, 1); assert.equal(byId.c.row, 0);
});

ok('faixa que começa antes da semana é cortada e marcada', () => {
  const ev = { id: 'x', source: 'google', allDay: true, start: '2026-10-30', end: '2026-11-04', title: 'Férias' };
  const { bars } = layoutTopRow([ev], week);
  assert.deepEqual([bars[0].col, bars[0].span, bars[0].cutLeft, bars[0].cutRight], [0, 2, true, false]);
});

ok('compromisso que passa da meia-noite é dividido nos dois dias', () => {
  const ev = { id: 'n', source: 'google', start: at(6, 22), end: at(7, 1, 30), title: 'Viagem' };
  const seg = timedSegments([ev], week);
  assert.deepEqual(seg.get('2026-11-06').map((s) => [s.startMin, s.endMin, s.contAfter]), [[1320, 1440, true]]);
  assert.deepEqual(seg.get('2026-11-07').map((s) => [s.startMin, s.endMin, s.contBefore]), [[0, 90, true]]);
});

ok('CGH > MGF até 22h fica inteiro (a grade vai até meia-noite)', () => {
  const ev = { id: 'cgh', source: 'google', start: at(6, 18, 30), end: at(6, 22), title: 'CGH > MGF' };
  assert.deepEqual(timedSegments([ev], week).get('2026-11-06').map((s) => [s.startMin, s.endMin]), [[1110, 1320]]);
});

ok('sobreposição: só o grupo que se cruza divide a largura; o resto do dia fica inteiro', () => {
  const items = [
    { id: 'daily', startMin: 480, endMin: 510 },
    { id: 'alin', startMin: 480, endMin: 540 },
    { id: 'drlu', startMin: 780, endMin: 840 },
  ];
  const out = Object.fromEntries(layoutDay(items).map((x) => [x.id, x]));
  assert.equal(out.daily.cols, 2); assert.equal(out.alin.cols, 2);
  assert.notEqual(out.daily.col, out.alin.col);
  assert.deepEqual([out.drlu.cols, out.drlu.col, out.drlu.colSpan], [1, 0, 1], 'Dra. Luciane às 13h ocupa a largura toda');
});

ok('estica para a direita quando a coluna vizinha está livre naquele horário', () => {
  const items = [
    { id: 'a', startMin: 480, endMin: 600 }, // 8–10
    { id: 'b', startMin: 480, endMin: 540 }, // 8–9
    { id: 'c', startMin: 480, endMin: 510 }, // 8–8h30
    { id: 'd', startMin: 540, endMin: 600 }, // 9–10: cabe na coluna de b e se estica sobre a de c
  ];
  const out = Object.fromEntries(layoutDay(items).map((x) => [x.id, x]));
  assert.equal(out.a.cols, 3);
  assert.equal(out.d.col, 1); assert.equal(out.d.colSpan, 2);
  assert.equal(out.a.colSpan, 1);
});

ok('bloco curto tem altura mínima e não some', () => {
  const [x] = layoutDay([{ id: 'r', startMin: 600, endMin: 605 }]);
  assert.equal(x.b - x.a, 20);
});

ok('Mês e lista do celular: faixa aparece em cada dia que cobre; horários ordenados', () => {
  const evs = [
    { id: 'g2', source: 'google', start: at(5, 8), end: at(7, 18), title: 'ATRINCA' },
    { id: 't2', source: 'google', start: at(5, 14), end: at(5, 15), title: 'ALCAST' },
    { id: 't1', source: 'google', start: at(5, 9), end: at(5, 10), title: 'Daily' },
  ];
  const m = eventsPerDay(evs, week);
  assert.deepEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((k) => m.get(k).allDay.length), [1, 1, 1, 0]);
  assert.deepEqual(m.get('2026-11-05').timed.map((e) => e.id), ['t1', 't2']);
});

console.log(`\n${n} verificações da grade da Agenda passaram.`);
