// Montagem da grade da Agenda no padrão do Google Agenda (03/11/2026, print do Rafael: "os eventos de um dia invadem o dia do outro").
// Puro, sem React; testado em scripts/agenda-layout.test.mjs.
// - Dia inteiro e compromisso de 24 h ou mais viram uma FAIXA na linha de cima, do primeiro ao último dia (cortada na semana mostrada).
// - Compromisso com horário que passa da meia-noite é dividido por dia.
// - Sobreposição: colunas só dentro do grupo que realmente se sobrepõe; o resto do dia continua com a largura inteira.

const DAY_MS = 86400000;
export const CAL_SOURCES = new Set(['google', 'microsoft', 'ical']);

const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// "2026-11-03" é meia-noite LOCAL (new Date('2026-11-03') seria meia-noite UTC = dia 2 às 21h em Brasília).
export function localDate(v) {
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
}
const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (days, d) => days.findIndex((x) => dayKey(x) === dayKey(d));

// Faixa de dias [início, fim) de um compromisso de dia inteiro. Google/Microsoft/iCal mandam o fim EXCLUSIVO (dia seguinte);
// TASK, atividade e CRM mandam o último dia (inclusivo).
export function allDaySpan(ev) {
  const s = midnight(localDate(ev.start));
  let e = ev.end ? midnight(localDate(ev.end)) : s;
  if (!CAL_SOURCES.has(ev.source)) e = addDays(e, 1);
  if (!(e > s)) e = addDays(s, 1);
  return { start: s, end: e };
}

// Vai para a linha de cima: dia inteiro, ou com horário e 24 h ou mais (como o "ATRINCA CONTÁBIL, 8am" de quinta a sábado).
export function isLong(ev) {
  if (ev.allDay) return true;
  const s = Date.parse(ev.start); const e = Date.parse(ev.end);
  return Number.isFinite(s) && Number.isFinite(e) && e - s >= DAY_MS;
}

function longSpan(ev) {
  if (ev.allDay) return allDaySpan(ev);
  const s = new Date(ev.start); const e = new Date(ev.end);
  const endDay = midnight(e).getTime() === e.getTime() ? midnight(e) : addDays(midnight(e), 1);
  return { start: midnight(s), end: endDay };
}

// Faixas da linha de cima para os dias mostrados: { ev, col, span, row, cutLeft, cutRight }. Mais longas primeiro; cada uma na
// primeira linha livre.
export function layoutTopRow(events, days) {
  if (!days.length) return { bars: [], rows: 0 };
  const first = midnight(days[0]); const after = addDays(midnight(days[days.length - 1]), 1);
  const items = [];
  for (const ev of events) {
    if (!isLong(ev)) continue;
    const { start, end } = longSpan(ev);
    if (!(end > first && start < after)) continue;
    const s = start < first ? first : start;
    const e = end > after ? after : end;
    const col = dayIndex(days, s);
    const span = Math.max(1, Math.round((midnight(addDays(e, -1)) - midnight(s)) / DAY_MS) + 1);
    if (col < 0) continue;
    items.push({ ev, col, span: Math.min(span, days.length - col), cutLeft: start < first, cutRight: end > after, len: end - start });
  }
  items.sort((a, b) => a.col - b.col || b.len - a.len || String(a.ev.title).localeCompare(String(b.ev.title)));
  const rowsEnd = [];
  for (const it of items) {
    let row = rowsEnd.findIndex((end) => end <= it.col);
    if (row === -1) { row = rowsEnd.length; rowsEnd.push(0); }
    rowsEnd[row] = it.col + it.span;
    it.row = row;
  }
  return { bars: items, rows: rowsEnd.length };
}

// Pedaços de cada compromisso com horário (< 24 h) por dia mostrado: { ev, day, startMin, endMin, contBefore, contAfter }.
export function timedSegments(events, days) {
  const out = new Map(days.map((d) => [dayKey(d), []]));
  for (const ev of events) {
    if (isLong(ev)) continue;
    const s = new Date(ev.start); let e = new Date(ev.end);
    if (Number.isNaN(s.getTime())) continue;
    if (Number.isNaN(e.getTime()) || e <= s) e = new Date(s.getTime() + 15 * 60000);
    for (let d = midnight(s); d < e; d = addDays(d, 1)) {
      const list = out.get(dayKey(d));
      if (!list) continue;
      const dayStart = d.getTime(); const dayEnd = addDays(d, 1).getTime();
      const a = Math.max(s.getTime(), dayStart); const b = Math.min(e.getTime(), dayEnd);
      list.push({ ev, startMin: Math.round((a - dayStart) / 60000), endMin: Math.round((b - dayStart) / 60000), contBefore: s.getTime() < dayStart, contAfter: e.getTime() > dayEnd });
    }
  }
  return out;
}

// Colunas lado a lado como no Google: grupos de compromissos que se sobrepõem (em cadeia); dentro do grupo, cada um na primeira
// coluna livre; depois cada um se estica para a direita enquanto a coluna vizinha estiver livre no horário dele.
// Devolve os mesmos itens com { col, cols, colSpan }. `minMin` = duração mínima desenhada (bloco curto não some).
export function layoutDay(items, minMin = 20) {
  const list = items.map((it) => ({ ...it, a: it.startMin, b: Math.max(it.endMin, it.startMin + minMin) }))
    .sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
  const out = [];
  let group = []; let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const colsEnd = [];
    for (const it of group) {
      let c = colsEnd.findIndex((end) => end <= it.a);
      if (c === -1) { c = colsEnd.length; colsEnd.push(0); }
      colsEnd[c] = it.b; it.col = c;
    }
    const cols = colsEnd.length;
    for (const it of group) {
      let span = 1;
      while (it.col + span < cols && !group.some((o) => o !== it && o.col === it.col + span && o.a < it.b && o.b > it.a)) span += 1;
      out.push({ ...it, cols, colSpan: span });
    }
    group = []; groupEnd = -1;
  };
  for (const it of list) {
    if (group.length && it.a >= groupEnd) flush();
    group.push(it); groupEnd = Math.max(groupEnd, it.b);
  }
  flush();
  return out;
}

// O que cada dia mostra na visão Mês e na lista do celular: faixas que cobrem o dia + pedaços com horário, já ordenados.
export function eventsPerDay(events, days) {
  const map = new Map(days.map((d) => [dayKey(d), { allDay: [], timed: [] }]));
  for (const ev of events) {
    if (!isLong(ev)) continue;
    const { start, end } = longSpan(ev);
    for (let d = start; d < end; d = addDays(d, 1)) { const m = map.get(dayKey(d)); if (m) m.allDay.push(ev); }
  }
  for (const [k, segs] of timedSegments(events, days)) {
    map.get(k).timed = segs.sort((a, b) => a.startMin - b.startMin).map((s) => ({ ...s.ev, startMin: s.startMin, endMin: s.endMin }));
  }
  return map;
}

// "08:00" / "08:30–09:00"; 24:00 quando passa da meia-noite.
export const hm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
