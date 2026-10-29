// Foco de hoje (2026-10-29): tela para deixar aberta no iPad. Separa o que está em andamento (Agora), o que vence no dia (Próximos)
// e o que está atrasado ou esperando alguém (Atenção), com filtro por dia, pessoa e página do quadro. Funções puras, sem React nem DOM —
// testáveis em Node (scripts/focus.test.mjs).

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = (s) => typeof s === 'string' && ISO.test(s);
export const normName = (n) => (n || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

export function addIsoDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffIsoDays(a, b) {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
}
// Dia local (e não UTC) de um carimbo ISO: "concluída hoje" é o dia do relógio de quem trabalha, em Brasília.
export function localIso(ts) {
  const d = new Date(ts);
  if (!ts || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PRIO = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const pagesOf = (b) => (b && Array.isArray(b.boards) ? b.boards : []);
const selectedPages = (board, pageId) => pagesOf(board).filter((p) => !pageId || pageId === 'all' || p.id === pageId);

// Pessoas (responsáveis) das páginas escolhidas, sem repetir o mesmo nome entre páginas.
export function listPeople(board, pageId) {
  const seen = new Map();
  for (const p of selectedPages(board, pageId)) for (const r of p.responsibles || []) {
    const key = normName(r.name);
    if (key && !seen.has(key)) seen.set(key, { key, name: r.name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// Qual responsável é "eu": nome completo igual, ou o primeiro nome igual quando só há um com ele.
export function personKeyForUser(userName, people) {
  const full = normName(userName);
  if (!full) return null;
  const exact = people.find((p) => p.key === full);
  if (exact) return exact.key;
  const first = full.split(' ')[0];
  const firsts = people.filter((p) => p.key.split(' ')[0] === first);
  return firsts.length === 1 ? firsts[0].key : null;
}

const byPriorityThenDate = (a, b) => (PRIO[a.card.priority] ?? 4) - (PRIO[b.card.priority] ?? 4)
  || (a.minDate || '9999-99-99').localeCompare(b.minDate || '9999-99-99')
  || (a.card.title || '').localeCompare(b.card.title || '', 'pt-BR');

// `day` é o dia olhado; `span` 'dia' (só ele) ou 'semana' (ele e os 6 seguintes). Atrasado e aguardando aparecem sempre.
export function buildFocus(board, { pageId = 'all', person = 'all', day, span = 'dia', today }) {
  const end = span === 'semana' ? addIsoDays(day, 6) : day;
  const out = { agora: [], proximos: [], atencao: [], feitoHoje: [], passosFeitosHoje: 0, openUnits: 0 };
  for (const page of selectedPages(board, pageId)) {
    const nameOf = new Map((page.responsibles || []).map((r) => [r.id, normName(r.name)]));
    const keys = (ids) => (ids || []).map((id) => nameOf.get(id)).filter(Boolean);
    for (const col of page.columns || []) {
      for (const card of col.cards || []) {
        if (!card || card.deleted || card.archived) continue;
        const owners = keys(card.responsibleIds);
        const mineItem = (it) => person === 'all' || keys(it.responsibleIds).includes(person) || ((it.responsibleIds || []).length === 0 && owners.includes(person));
        const items = Array.isArray(card.checklist) ? card.checklist : [];
        const myItems = items.filter(mineItem);
        const mineCard = person === 'all' || owners.includes(person) || myItems.length > 0;
        if (!mineCard) continue;
        if (card.completed) {
          if (localIso(card.completedAt) === today) out.feitoHoje.push({ boardId: page.id, colId: col.id, card });
          continue;
        }
        out.passosFeitosHoje += myItems.filter((it) => it.done && localIso(it.doneAt) === today).length;
        const steps = myItems.filter((it) => !it.done);
        const dates = [card.dueDate, ...steps.map((it) => it.dueDate)].filter(isIso);
        const minDate = dates.slice().sort()[0] || '';
        const overdue = dates.some((d) => d < today);
        const inWindow = dates.some((d) => d >= day && d <= end);
        const status = card.status || 'nao-iniciada';
        const waiting = !!(card.waiting && card.waiting.since);
        const entry = {
          key: `${page.id}:${card.id}`, boardId: page.id, boardName: page.name || '', colId: col.id, colName: col.name || '',
          card, status, steps, minDate, overdueDays: overdue ? diffIsoDays(today, dates.filter((d) => d < today).sort()[0]) : 0,
          tone: overdue ? 'overdue' : dates.includes(today) ? 'today' : minDate ? 'soon' : 'none',
          ownerNames: (card.responsibleIds || []).map((id) => (page.responsibles || []).find((r) => r.id === id)).filter(Boolean).map((r) => r.name),
          reason: waiting ? 'aguardando' : overdue ? 'atrasada' : '',
        };
        if (waiting) out.atencao.push(entry);
        else if (status === 'em-andamento') out.agora.push(entry);
        else if (overdue) out.atencao.push(entry);
        else if (inWindow) out.proximos.push(entry);
        else continue;
        out.openUnits += Math.max(1, steps.length);
      }
    }
  }
  out.agora.sort(byPriorityThenDate);
  out.proximos.sort(byPriorityThenDate);
  out.atencao.sort((a, b) => (b.overdueDays - a.overdueDays) || byPriorityThenDate(a, b));
  const done = out.passosFeitosHoje + out.feitoHoje.length;
  out.progress = { done, total: done + out.openUnits };
  return out;
}

// ---- ações (devolvem o quadro inteiro novo; o chamador passa isso ao onMutate) ----
function mapCard(prev, boardId, colId, cardId, fn) {
  return { ...prev, boards: (prev.boards || []).map((b) => (b.id !== boardId ? b : { ...b, columns: (b.columns || []).map((c) => (c.id !== colId ? c : fn(c))) })) };
}

export function toggleStep(prev, { boardId, colId, cardId, itemId }, now, userName) {
  return mapCard(prev, boardId, colId, cardId, (c) => ({
    ...c,
    cards: c.cards.map((cd) => (cd.id !== cardId ? cd : {
      ...cd,
      checklist: (cd.checklist || []).map((i) => (i.id !== itemId ? i : (i.done ? { ...i, done: false, doneAt: '' } : { ...i, done: true, doneAt: now }))),
      updatedAt: now, updatedBy: userName || cd.updatedBy || '',
    })),
  }));
}

const STATUS_LABEL = { 'nao-iniciada': 'Não iniciada', 'em-andamento': 'Em andamento', pausada: 'Pausada', concluida: 'Concluída' };

export function setCardStatus(prev, { boardId, colId, cardId }, status, now, userName) {
  return mapCard(prev, boardId, colId, cardId, (c) => {
    const card = c.cards.find((cd) => cd.id === cardId);
    if (!card) return c;
    const before = card.status || (card.completed ? 'concluida' : 'nao-iniciada');
    if (before === status) return c;
    const willComplete = status === 'concluida';
    const updated = {
      ...card, status, completed: willComplete,
      completedAt: willComplete ? now : '', completedBy: willComplete ? (userName || '') : '',
      updatedAt: now, updatedBy: userName || card.updatedBy || '',
      history: [{ ts: now, action: `Status alterado: ${STATUS_LABEL[before] || before} → ${STATUS_LABEL[status] || status}`, user: userName || '' }, ...(card.history || [])].slice(0, 200),
    };
    return willComplete ? { ...c, cards: [...c.cards.filter((cd) => cd.id !== cardId), updated] } : { ...c, cards: c.cards.map((cd) => (cd.id !== cardId ? cd : updated)) };
  });
}
