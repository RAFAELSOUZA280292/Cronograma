// Resumo para o widget do iPhone (2026-10-05, §76). Funções puras: recebem o JSON do quadro pessoal,
// os eventos do Google e "agora", e devolvem só títulos e horários — nada de descrição, convidados ou links.
export const TZ = 'America/Sao_Paulo';
const MAX_ITEMS = 5;
const COMMITMENT = new Set(['accepted', 'organizer', 'unknown']);

export function todayInSp(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T12:00:00Z`) - new Date(`${fromIso}T12:00:00Z`)) / 86400000);
}

export function boardItems(board, todayIso) {
  const overdue = [];
  const today = [];
  if (board && Array.isArray(board.boards) && todayIso) {
    for (const b of board.boards) {
      for (const col of b.columns || []) {
        for (const card of col.cards || []) {
          if (!card || card.completed || card.deleted || card.archived || !card.dueDate) continue;
          const item = { title: String(card.title || 'Sem título').slice(0, 120), dueDate: card.dueDate };
          if (card.dueDate < todayIso) overdue.push({ ...item, days: daysBetween(card.dueDate, todayIso) });
          else if (card.dueDate === todayIso) today.push(item);
        }
      }
    }
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    overdue: { count: overdue.length, items: overdue.slice(0, MAX_ITEMS) },
    today: { count: today.length, items: today.slice(0, MAX_ITEMS) },
  };
}

export function pickNextMeeting(events, now = new Date()) {
  const nowMs = now.getTime();
  const candidates = (events || [])
    .filter((e) => e && !e.allDay && e.status !== 'cancelled' && !e.transparent && COMMITMENT.has(e.myResponse || 'accepted') && e.start && e.end)
    .map((e) => ({ e, s: new Date(e.start).getTime(), f: new Date(e.end).getTime() }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.f) && x.f > nowMs)
    .sort((a, b) => a.s - b.s);
  if (!candidates.length) return null;
  const { e, s, f } = candidates[0];
  return { title: String(e.title || '(sem título)').slice(0, 120), start: new Date(s).toISOString(), end: new Date(f).toISOString(), ongoing: s <= nowMs };
}

export function buildSummary({ board, events, calendarConnected, now = new Date(), userName }) {
  const todayIso = todayInSp(now);
  const items = boardItems(board, todayIso);
  return {
    generatedAt: now.toISOString(),
    today: todayIso,
    name: userName || '',
    overdue: items.overdue,
    dueToday: items.today,
    calendarConnected: !!calendarConnected,
    nextMeeting: calendarConnected ? pickNextMeeting(events, now) : null,
  };
}
