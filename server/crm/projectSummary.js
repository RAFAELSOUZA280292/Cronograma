// Resumo SOMENTE-LEITURA de um projeto do cronograma pra ficha da empresa do
// CRM (2026-09-20). O CRM nunca escreve em `projects.data` — só lê o que o
// painel já guarda (atividades, reuniões, pendências) pelo vínculo
// crm_company_projects. Função pura: recebe o JSON do projeto.
const TODO_CLOSED = new Set(['concluida', 'nao-relevante']);

export function projectSummary(projectId, data, today) {
  const d = data || {};
  const company = d.company || {};
  const activities = (Array.isArray(d.activities) ? d.activities : []).filter((a) => a && !a.deleted);
  const done = activities.filter((a) => a.status === 'concluido').length;
  const overdue = activities.filter((a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < today).length;
  const meetings = (Array.isArray(d.meetings) ? d.meetings : []).filter((m) => m && !m.deleted);
  const past = meetings.filter((m) => m.date && m.date <= today).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const upcoming = meetings.filter((m) => m.date && m.date > today).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let openTodos = 0;
  let overdueTodos = 0;
  meetings.forEach((m) => (Array.isArray(m.actionItems) ? m.actionItems : []).forEach((it) => {
    if (!it || it.deleted || TODO_CLOSED.has(it.status)) return;
    openTodos += 1;
    if (it.dueDate && it.dueDate < today) overdueTodos += 1;
  }));
  return {
    projectId,
    name: company.nomeFantasia || company.name || 'Projeto sem nome',
    cnpj: company.cnpj || '',
    activities: { total: activities.length, done, overdue },
    meetings: {
      count: meetings.length,
      last: past[0] ? { id: past[0].id, title: past[0].title || 'Reunião', date: past[0].date } : null,
      next: upcoming[0] ? { id: upcoming[0].id, title: upcoming[0].title || 'Reunião', date: upcoming[0].date } : null,
      recent: past.slice(0, 5).map((m) => ({ id: m.id, title: m.title || 'Reunião', date: m.date })),
    },
    openTodos,
    overdueTodos,
  };
}
