// Resumo para o widget do iPhone (2026-10-05, §76). Funções puras: recebem o JSON do quadro pessoal,
// os eventos do Google e "agora", e devolvem só títulos e horários — nada de descrição, convidados ou links.
export const TZ = 'America/Sao_Paulo';
const MAX_ITEMS = 12;
const COMMITMENT = new Set(['accepted', 'organizer', 'unknown']);

export function todayInSp(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T12:00:00Z`) - new Date(`${fromIso}T12:00:00Z`)) / 86400000);
}

export const BLOCKS = {
  overdue: 'Atrasadas',
  today: 'Vencem hoje',
  urgent: 'Urgentes',
  meeting: 'Próxima reunião',
  agenda: 'Agenda de hoje e amanhã',
};
export const DEFAULT_VIEWS = [{ name: 'Principal', blocks: ['overdue', 'today', 'meeting'] }];
const MAX_VIEWS = 6;

export function sanitizeViews(input) {
  if (!Array.isArray(input) || input.length === 0) return { error: 'Crie pelo menos uma visão.' };
  if (input.length > MAX_VIEWS) return { error: `No máximo ${MAX_VIEWS} visões.` };
  const views = [];
  const seen = new Set();
  for (const v of input) {
    const name = String((v && v.name) || '').trim().slice(0, 24);
    if (!name) return { error: 'Toda visão precisa de um nome.' };
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `Já existe uma visão chamada "${name}".` };
    seen.add(key);
    const blocks = [...new Set(Array.isArray(v.blocks) ? v.blocks : [])].filter((b) => Object.prototype.hasOwnProperty.call(BLOCKS, b));
    if (blocks.length === 0) return { error: `A visão "${name}" precisa mostrar pelo menos uma coisa.` };
    views.push({ name, blocks: blocks.slice(0, 5) });
  }
  return { views };
}

export function pickView(views, name) {
  const list = Array.isArray(views) && views.length ? views : DEFAULT_VIEWS;
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return { view: list[0], found: true, names: list.map((v) => v.name) };
  const hit = list.find((v) => v.name.toLowerCase() === wanted);
  return { view: hit || list[0], found: !!hit, names: list.map((v) => v.name) };
}

export function boardItems(board, todayIso) {
  const overdue = [];
  const today = [];
  const urgent = [];
  if (board && Array.isArray(board.boards) && todayIso) {
    for (const b of board.boards) {
      for (const col of b.columns || []) {
        for (const card of col.cards || []) {
          if (!card || card.completed || card.deleted || card.archived) continue;
          if (card.priority === 'urgente') urgent.push({ title: String(card.title || 'Sem título').slice(0, 120), dueDate: card.dueDate || '' });
          if (!card.dueDate) continue;
          const item = { title: String(card.title || 'Sem título').slice(0, 120), dueDate: card.dueDate };
          if (card.dueDate < todayIso) overdue.push({ ...item, days: daysBetween(card.dueDate, todayIso) });
          else if (card.dueDate === todayIso) today.push(item);
        }
      }
    }
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  urgent.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  return {
    urgent: { count: urgent.length, items: urgent.slice(0, MAX_ITEMS) },
    overdue: { count: overdue.length, items: overdue.slice(0, MAX_ITEMS) },
    today: { count: today.length, items: today.slice(0, MAX_ITEMS) },
  };
}

function upcoming(events, nowMs) {
  return (events || [])
    .filter((e) => e && !e.allDay && e.status !== 'cancelled' && !e.transparent && COMMITMENT.has(e.myResponse || 'accepted') && e.start && e.end)
    .map((e) => ({ e, s: new Date(e.start).getTime(), f: new Date(e.end).getTime() }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.f) && x.f > nowMs)
    .sort((a, b) => a.s - b.s);
}

const shapeEvent = ({ e, s, f }, nowMs) => ({ title: String(e.title || '(sem título)').slice(0, 120), start: new Date(s).toISOString(), end: new Date(f).toISOString(), ongoing: s <= nowMs });

export function pickNextMeeting(events, now = new Date()) {
  const nowMs = now.getTime();
  const list = upcoming(events, nowMs);
  return list.length ? shapeEvent(list[0], nowMs) : null;
}

export function agendaItems(events, now = new Date()) {
  const nowMs = now.getTime();
  const lastDay = todayInSp(new Date(nowMs + 86400000));
  const list = upcoming(events, nowMs).filter((x) => todayInSp(new Date(x.s)) <= lastDay);
  return { count: list.length, items: list.slice(0, 14).map((x) => shapeEvent(x, nowMs)) };
}

export function buildSummary({ board, events, calendarConnected, now = new Date(), userName, views, viewName }) {
  const todayIso = todayInSp(now);
  const items = boardItems(board, todayIso);
  const picked = pickView(views, viewName);
  return {
    view: { name: picked.view.name, blocks: picked.view.blocks },
    viewFound: picked.found,
    viewNames: picked.names,
    urgent: items.urgent,
    agenda: calendarConnected ? agendaItems(events, now) : { count: 0, items: [] },
    generatedAt: now.toISOString(),
    today: todayIso,
    name: userName || '',
    overdue: items.overdue,
    dueToday: items.today,
    calendarConnected: !!calendarConnected,
    nextMeeting: calendarConnected ? pickNextMeeting(events, now) : null,
  };
}
