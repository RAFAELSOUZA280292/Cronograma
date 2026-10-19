// Busca da tela aberta da empresa (2026-10-19, pedido do Rafael): um campo no cabeçalho que filtra SÓ a aba que está aberta (Resumo, Reuniões, Tarefas, Gantt, Tabela, Fases, Quadro, Mapa).
// Funções puras: sem acento, sem diferença de maiúscula, todas as palavras digitadas precisam aparecer (E) no texto do item.
const STATUS_LABEL = { 'nao-iniciado': 'Não iniciado', 'em-andamento': 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };

export const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function queryTerms(q) {
  return norm(q).split(/\s+/).filter(Boolean);
}

export function matchesTerms(hay, terms) {
  if (!terms.length) return true;
  const h = norm(hay);
  return terms.every((t) => h.includes(t));
}

const live = (list) => (Array.isArray(list) ? list : []).filter((x) => x && !x.deleted);

// Texto pesquisável de uma atividade: título, descrição, notas, responsável, participantes, fase, situação, número (#12) e as subatividades.
export function activityHay(a, phases, order) {
  const phase = (phases || []).find((p) => p.id === a.phase);
  const subs = live(a.subactivities).map((s) => [s.title, s.responsible, s.notes, s.description].filter(Boolean).join(' '));
  return [
    a.title, a.desc, a.notes, a.responsible, (a.participants || []).join(' '), phase && phase.name,
    STATUS_LABEL[a.status] || '', order ? `#${order}` : '', ...subs,
  ].filter(Boolean).join(' ');
}

export function filterActivities(list, q, phases, orderMap) {
  const terms = queryTerms(q);
  if (!terms.length) return list;
  return list.filter((a) => matchesTerms(activityHay(a, a._phases || phases, (orderMap && orderMap[a.id]) || a._order), terms));
}

const itemHay = (i) => [i.title, i.subtitle, i.notes, i.responsible, i.owner, ...live(i.subtasks).map((t) => t.title || t.text)].filter(Boolean).join(' ');

export function meetingHay(m) {
  return [m.title, m.summary, m.date, (m.participants || []).join(' '), ...live(m.actionItems).map(itemHay)].filter(Boolean).join(' ');
}

// Reuniões: casa pela própria reunião ou por qualquer tarefa dela. A lixeira também é filtrada (a tela decide o que mostrar).
export function filterMeetings(meetings, q) {
  const terms = queryTerms(q);
  if (!terms.length) return meetings;
  return (meetings || []).filter((m) => matchesTerms(meetingHay(m), terms));
}

// Tarefas (Tarefas = itens de ação das reuniões): mantém só as tarefas que casam; a reunião continua na lista para a tela não quebrar, mas sem as tarefas que não casam.
export function filterTodoMeetings(meetings, q) {
  const terms = queryTerms(q);
  if (!terms.length) return meetings;
  return (meetings || []).map((m) => {
    const meetingMatches = matchesTerms([m.title, m.date].filter(Boolean).join(' '), terms);
    const items = (m.actionItems || []).filter((i) => i.deleted || meetingMatches || matchesTerms(itemHay(i), terms));
    return { ...m, actionItems: items };
  });
}

export const countLiveItems = (meetings) => (meetings || []).filter((m) => !m.deleted).reduce((t, m) => t + live(m.actionItems).length, 0);
