// "Hoje" da tela inicial (Onda 5, §81): junta num lugar só o que está atrasado ou vence hoje para UMA pessoa.
// Função PURA (sem React, sem relógio): recebe os dados já carregados no cliente e a data de hoje (YYYY-MM-DD, local).
// Fontes: (a) cartões do quadro pessoal; (b) atividades de empresa em que o responsável é a pessoa; (c) tarefas de
// reunião (project.meetings[].actionItems[]) em que o responsável é a pessoa. Mais as reuniões de hoje/amanhã em que ela
// participa. Não mexe em nada: quem usa decide o que cada botão faz.

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const PRIORITY_RANK = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const rank = (p) => (p in PRIORITY_RANK ? PRIORITY_RANK[p] : 4);

export function addDaysIso(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function utcMs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetweenIso(fromIso, toIso) {
  return Math.round((utcMs(toIso) - utcMs(fromIso)) / 86400000);
}

const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function byUrgency(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || rank(a.priority) - rank(b.priority) || String(a.title).localeCompare(String(b.title), 'pt-BR');
}
function byPriority(a, b) {
  return rank(a.priority) - rank(b.priority) || String(a.title).localeCompare(String(b.title), 'pt-BR');
}

export function buildTodayItems({ projects, personalBoard, user, todayIso, hiddenSources = [] }) {
  const out = { overdue: [], today: [], meetings: [], total: 0 };
  if (!isIso(todayIso)) return out;
  const tomorrowIso = addDaysIso(todayIso, 1);
  const me = normName(user && user.name);

  const hide = new Set(hiddenSources);

  function push(item) {
    if (hide.has(item.source) || !isIso(item.dueDate)) return;
    if (item.dueDate < todayIso) out.overdue.push({ ...item, daysLate: daysBetweenIso(item.dueDate, todayIso) });
    else if (item.dueDate === todayIso) out.today.push({ ...item, daysLate: 0 });
  }

  // (a) quadro pessoal
  if (!hide.has('card') && personalBoard && Array.isArray(personalBoard.boards)) {
    for (const b of personalBoard.boards) {
      for (const col of b.columns || []) {
        for (const c of col.cards || []) {
          if (!c || c.completed || c.deleted || c.archived || !c.dueDate) continue;
          push({
            key: `card:${c.id}`, source: 'card', title: c.title || '(sem título)', hint: b.name || 'Meu quadro',
            dueDate: c.dueDate, priority: c.priority || '', ref: { boardId: b.id, colId: col.id, cardId: c.id },
          });
        }
      }
    }
  }

  if (me && Array.isArray(projects)) {
    for (const p of projects) {
      if (!p) continue;
      const company = (p.company && (p.company.nomeFantasia || p.company.name)) || 'Sem nome';
      const paused = p.company && p.company.status === 'pausado';
      // (b) atividades de empresa
      if (!paused) {
        for (const a of p.activities || []) {
          if (!a || a.deleted || a.status === 'concluido' || a.status === 'pausado') continue;
          if (normName(a.responsible) !== me) continue;
          const due = a.endDate || a.date;
          if (!due) continue;
          push({
            key: `activity:${p.id}:${a.id}`, source: 'activity', title: a.title || '(sem título)', hint: company,
            dueDate: due, priority: a.priority || '', ref: { pid: p.id, id: a.id },
          });
        }
      }
      for (const m of p.meetings || []) {
        if (!m || m.deleted) continue;
        // (c) tarefas de reunião
        for (const it of m.actionItems || []) {
          if (!it || it.deleted || it.status === 'concluida' || it.status === 'nao-relevante' || !it.dueDate) continue;
          if (normName(it.responsible) !== me) continue;
          push({
            key: `todo:${p.id}:${m.id}:${it.id}`, source: 'todo', title: it.title || '(sem título)', hint: `${company} · ${m.title || 'Reunião'}`,
            dueDate: it.dueDate, priority: '', ref: { pid: p.id, meetingId: m.id, itemId: it.id },
          });
        }
        // reuniões de hoje/amanhã em que a pessoa participa
        if (!hide.has('meeting') && (m.date === todayIso || m.date === tomorrowIso) && (m.participants || []).some((n) => normName(n) === me)) {
          out.meetings.push({
            key: `meeting:${p.id}:${m.id}`, source: 'meeting', title: m.title || 'Reunião sem título', hint: company,
            date: m.date, time: m.time || '', day: m.date === todayIso ? 'today' : 'tomorrow', ref: { pid: p.id, meetingId: m.id },
          });
        }
      }
    }
  }

  out.overdue.sort(byUrgency);
  out.today.sort(byPriority);
  out.meetings.sort((a, b) => `${a.date}${a.time || '99:99'}`.localeCompare(`${b.date}${b.time || '99:99'}`));
  out.total = out.overdue.length + out.today.length;
  return out;
}
