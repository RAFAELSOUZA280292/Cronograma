// Leitura da agenda (2026-09-20, pedido do Rafael): deixar claro o que ele ACEITOU, o que está
// SEM RESPOSTA / TALVEZ e o que RECUSOU, quanto dura cada compromisso e quanto espaço de descanso
// o dia tem. Módulo puro (sem React) para ser testado em Node com casos reais.
//
// Regras:
//  · só compromisso ACEITADO (ou seu: evento sem convidados/criado por você) ocupa o seu tempo;
//  · sem resposta e talvez são "pendentes": aparecem, mas NÃO contam como tempo ocupado — o resumo
//    mostra também quanto sobra "se aceitar tudo";
//  · recusado não ocupa tempo; evento marcado como "Livre" (transparent) também não;
//  · dia inteiro não entra na conta de horas;
//  · almoço = a janela [lunchStart, lunchEnd] (padrão 12:00–13:00, configurável): livre só se nenhum compromisso
//    ACEITO encosta nela; `lunch.blockers` diz quais reuniões pegam o almoço.

// Almoço PADRÃO: 12:00–13:00 (a pessoa pode mudar em agendaPrefs.js). Só conta como "livre" com a janela INTEIRA
// sem compromisso aceito — nada de supor que ela almoça fora dessa janela.
export const WORK = { start: 8 * 60, end: 18 * 60, lunchStart: 12 * 60, lunchEnd: 13 * 60, minGap: 15, backToBack: 5, longRun: 180 };

export const RSVP_META = {
  accepted: { label: 'Aceito', color: '#3ecf6e' },
  pending: { label: 'Sem resposta', color: '#ff9f40' },
  tentative: { label: 'Talvez', color: '#ff9f40' },
  declined: { label: 'Recusado', color: '#9a9a9a' },
};

// accepted | pending | tentative | declined. Só eventos do Google têm resposta; TASK do XFlow,
// atividades e atividades do CRM são do próprio usuário (sempre "aceitos").
export function rsvpOf(ev) {
  if (!ev || ev.source !== 'google') return 'accepted';
  if (ev.myResponse === 'declined') return 'declined';
  if (ev.myResponse === 'needsAction') return 'pending';
  if (ev.myResponse === 'tentative') return 'tentative';
  return 'accepted'; // accepted | organizer | unknown | ausente (dado antigo)
}
export const isPendingRsvp = (r) => r === 'pending' || r === 'tentative';

const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const hhmm = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

// 30 -> "30 min" · 60 -> "1h" · 90 -> "1h30" · 135 -> "2h15"
export function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${pad2(r)}` : `${h}h`;
}

// Duração do evento em minutos (dia inteiro não tem).
export function durationMin(e) {
  if (!e || e.allDay || !e.startDate || !e.endDate) return null;
  return Math.max(0, Math.round((e.endDate - e.startDate) / 60000));
}

// Intervalo [s, e) em minutos DENTRO do dia `day` (YYYY-MM-DD); evento que atravessa a meia-noite é cortado.
function clipToDay(e, day) {
  const s = isoDate(e.startDate) === day ? e.startDate.getHours() * 60 + e.startDate.getMinutes() : 0;
  const en = isoDate(e.endDate) === day ? e.endDate.getHours() * 60 + e.endDate.getMinutes() : 1440;
  return { s, e: Math.max(en, s + 1) };
}

function toItems(events, day) {
  return events.filter((e) => e && !e.allDay && e.startDate && e.endDate && !e.transparent).map((e) => ({ ev: e, rsvp: rsvpOf(e), ...clipToDay(e, day) }));
}

// Une intervalos que se sobrepõem (estritamente): minutos realmente ocupados, sem contar duas vezes.
function mergeOverlap(iv) {
  const out = [];
  [...iv].sort((a, b) => a.s - b.s).forEach((x) => {
    const last = out[out.length - 1];
    if (last && x.s < last.e) last.e = Math.max(last.e, x.e); else out.push({ s: x.s, e: x.e });
  });
  return out;
}
const total = (iv) => iv.reduce((n, x) => n + (x.e - x.s), 0);
const overlapWith = (iv, s, e) => iv.reduce((n, x) => n + Math.max(0, Math.min(x.e, e) - Math.max(x.s, s)), 0);

// Lacunas livres de `busy` (já unido) dentro da janela [ws, we].
function freeGaps(busy, ws, we) {
  const gaps = [];
  let cur = ws;
  busy.forEach((b) => {
    if (b.e <= ws || b.s >= we) return;
    if (b.s > cur) gaps.push({ s: cur, e: Math.min(b.s, we), min: Math.min(b.s, we) - cur });
    cur = Math.max(cur, b.e);
  });
  if (cur < we) gaps.push({ s: cur, e: we, min: we - cur });
  return gaps.filter((g) => g.min > 0);
}

// Sequência contínua de compromissos (pausa menor que `gapTol` não conta como pausa).
function longestRun(busy, gapTol = 10) {
  let best = null;
  let cur = null;
  busy.forEach((b) => {
    if (cur && b.s - cur.e < gapTol) cur = { s: cur.s, e: Math.max(cur.e, b.e) }; else { if (cur && (!best || cur.e - cur.s > best.e - best.s)) best = cur; cur = { s: b.s, e: b.e }; }
  });
  if (cur && (!best || cur.e - cur.s > best.e - best.s)) best = cur;
  return best ? { s: best.s, e: best.e, min: best.e - best.s } : null;
}

export function summarizeDay(events, day, opts = {}) {
  const W = { ...WORK, ...opts };
  const items = toItems(events, day);
  const acc = items.filter((i) => i.rsvp === 'accepted');
  const pen = items.filter((i) => isPendingRsvp(i.rsvp));
  const dec = items.filter((i) => i.rsvp === 'declined');
  const allDayAccepted = events.filter((e) => e && e.allDay && rsvpOf(e) === 'accepted').length;
  const allDayPending = events.filter((e) => e && e.allDay && isPendingRsvp(rsvpOf(e))).length;

  const busy = mergeOverlap(acc);
  const busyAll = mergeOverlap([...acc, ...pen]);
  const workMin = W.end - W.start;
  const freeMin = workMin - overlapWith(busy, W.start, W.end);
  const freeIfAllMin = workMin - overlapWith(busyAll, W.start, W.end);

  const gaps = freeGaps(busy, W.start, W.end).filter((g) => g.min >= W.minGap);
  const longestGap = gaps.reduce((b, g) => (!b || g.min > b.min ? g : b), null);
  const lunchMin = opts.lunchMin != null ? opts.lunchMin : W.lunchEnd - W.lunchStart;
  const lunchGaps = freeGaps(busy, W.lunchStart, W.lunchEnd);
  const lunchBest = lunchGaps.reduce((b, g) => (!b || g.min > b.min ? g : b), null);
  const lunchAll = freeGaps(busyAll, W.lunchStart, W.lunchEnd).reduce((b, g) => (!b || g.min > b.min ? g : b), null);
  const touchesLunch = (i) => i.s < W.lunchEnd && W.lunchStart < i.e;
  const lunchBlockers = acc.filter(touchesLunch).sort((a, b) => a.s - b.s).map((i) => ({ title: i.ev.title, s: i.s, e: i.e }));
  const lunchPendingBlockers = pen.filter(touchesLunch).sort((a, b) => a.s - b.s).map((i) => ({ title: i.ev.title, s: i.s, e: i.e }));

  const sortedAcc = [...acc].sort((a, b) => a.s - b.s || a.e - b.e);
  let backToBack = 0;
  const conflicts = [];
  for (let i = 1; i < sortedAcc.length; i += 1) {
    const prevEnd = Math.max(...sortedAcc.slice(0, i).map((x) => x.e));
    const gap = sortedAcc[i].s - prevEnd;
    if (gap < 0) conflicts.push({ a: sortedAcc.slice(0, i).find((x) => x.e > sortedAcc[i].s).ev, b: sortedAcc[i].ev });
    else if (gap < W.backToBack) backToBack += 1;
  }
  const pendingConflicts = pen.filter((p) => acc.some((a) => a.s < p.e && p.s < a.e)).length;

  return {
    day, confirmed: acc.length, pending: pen.length, declined: dec.length, allDayAccepted, allDayPending,
    confirmedMin: total(busy), pendingMin: total(mergeOverlap(pen)),
    workMin, freeMin, freeIfAllMin, gaps, longestGap,
    lunch: {
      ok: !!lunchBest && lunchBest.min >= lunchMin, min: lunchBest ? lunchBest.min : 0, window: lunchBest, okIfAll: !!lunchAll && lunchAll.min >= lunchMin,
      start: W.lunchStart, end: W.lunchEnd, blockers: lunchBlockers, pendingBlockers: lunchPendingBlockers,
    },
    longestRun: longestRun(busy), backToBack, conflicts, pendingConflicts,
    work: { start: W.start, end: W.end },
  };
}

// Linha do tempo do dia: eventos em ordem + "Livre X" entre compromissos ACEITOS. Cada evento leva
// flags: conflict (sobrepõe um aceito), backToBack (começa colado no aceito anterior).
export function timelineRows(events, day, opts = {}) {
  const W = { ...WORK, ...opts };
  const items = toItems(events, day).sort((a, b) => a.s - b.s || a.e - b.e);
  const acc = items.filter((i) => i.rsvp === 'accepted');
  const busy = mergeOverlap(acc);
  const rows = items.map((it) => {
    const overlapsAccepted = it.rsvp !== 'declined' && acc.some((a) => a !== it && a.s < it.e && it.s < a.e);
    const prevAcc = acc.filter((a) => a !== it && a.e <= it.s).reduce((m, a) => Math.max(m, a.e), -1);
    const back = it.rsvp === 'accepted' && prevAcc >= 0 && it.s - prevAcc < W.backToBack;
    return { type: 'event', key: it.s, ev: it.ev, rsvp: it.rsvp, s: it.s, e: it.e, conflict: overlapsAccepted, backToBack: back };
  });
  for (let i = 1; i < busy.length; i += 1) {
    const g = busy[i].s - busy[i - 1].e;
    if (g >= W.minGap) rows.push({ type: 'gap', key: busy[i - 1].e - 0.5, s: busy[i - 1].e, e: busy[i].s, min: g });
  }
  return rows.sort((a, b) => a.key - b.key);
}
