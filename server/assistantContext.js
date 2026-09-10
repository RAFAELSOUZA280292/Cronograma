// Perfil do projeto (2026-09) — resumo compacto e sempre atualizado da
// identidade do cliente e do cronograma (mesma base de dados das abas
// Resumo/Gantt/Tabela/Fases/Quadro), injetado direto no contexto do
// Assistente do Projeto (`server/assistantRetrieval.js`). Diferente da
// memória de reuniões (`project_memory_chunks`, texto livre, recuperado
// por busca lexical), esse dado é estruturado e pequeno — não precisa de
// busca, cabe inteiro em todo pedido. Resolve perguntas de identidade
// ("qual o nome do cliente", "qual o regime tributário") que a memória de
// reuniões nunca teria condição de responder, porque esse dado não vem de
// transcrição nenhuma, vem do cadastro.

const ACTIVITY_STATUS_LABEL = {
  'nao-iniciado': 'não iniciado', 'em-andamento': 'em andamento', pausado: 'pausado', concluido: 'concluído',
};
const TODO_STATUS_LABEL = {
  'nao-iniciado': 'não iniciado', urgente: 'urgente', 'em-andamento': 'em andamento', pausada: 'pausada', concluida: 'concluída', 'nao-relevante': 'não é relevante',
};
const CLIENT_TYPE_LABEL = {
  diagnostico: 'Diagnóstico', 'diagnostico-consultoria': 'Diagnóstico e Consultoria Contínua', 'poc-demo': 'POC / Demonstração',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resumo compacto de identidade + cronograma — sempre da mais antiga pra
// mais atual quando lista reuniões/atividades (pedido do Rafael), com uma
// seção separada de alertas críticos (urgente ou atrasado) destacada antes
// da lista cronológica.
export function buildProjectSnapshot(project) {
  const today = todayIso();
  const company = project.company || {};
  const phases = project.phases || [];
  const activities = (project.activities || []).filter((a) => !a.deleted);
  const meetings = (project.meetings || []).filter((m) => !m.deleted);
  const lines = [];

  lines.push('IDENTIDADE DO CLIENTE (dado direto do cadastro do projeto — sempre correto, pode responder com confiança, não precisa de citação de reunião pra isso)');
  lines.push(`- Razão social: ${company.name || 'não informado'}${company.nomeFantasia ? ` (nome fantasia: ${company.nomeFantasia})` : ''}`);
  lines.push(`- CNPJ: ${company.cnpj || 'não informado'}`);
  lines.push(`- Regime tributário: ${company.regimeTributario || 'não informado'}`);
  if (company.clientType) lines.push(`- Tipo de projeto: ${CLIENT_TYPE_LABEL[company.clientType] || company.clientType}`);
  lines.push(`- Status do projeto: ${company.status === 'pausado' ? 'pausado' : 'em andamento'}`);
  if ((project.team || []).length) lines.push(`- Áreas/equipe envolvidas: ${project.team.join(', ')}`);
  if ((project.externalContacts || []).length) lines.push(`- Contatos externos conhecidos: ${project.externalContacts.map((c) => c.name).join(', ')}`);

  lines.push('');
  lines.push('CRONOGRAMA (mesma base de dados das abas Resumo, Gantt, Tabela, Fases e Quadro — não são fontes separadas)');
  lines.push(`- Fases: ${phases.map((p) => p.name).join(' → ') || 'nenhuma fase cadastrada'}`);
  const byStatus = {};
  activities.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
  const statusSummary = Object.entries(byStatus).map(([s, n]) => `${n} ${ACTIVITY_STATUS_LABEL[s] || s}`).join(', ');
  lines.push(`- Total de atividades ativas: ${activities.length}${statusSummary ? ` (${statusSummary})` : ''}`);
  const overdueActivities = activities
    .filter((a) => a.status !== 'concluido' && a.date && a.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (overdueActivities.length) {
    lines.push(`- ATIVIDADES ATRASADAS (prazo já passou, ainda não concluídas — ${overdueActivities.length} no total, mais antiga primeiro):`);
    overdueActivities.slice(0, 12).forEach((a) => {
      const phase = phases.find((p) => p.id === a.phase);
      lines.push(`  · "${a.title}" — responsável: ${a.responsible || 'sem responsável'}, prazo: ${a.date}${phase ? `, fase: ${phase.name}` : ''}, status: ${ACTIVITY_STATUS_LABEL[a.status] || a.status}`);
    });
  }
  const upcomingActivities = activities
    .filter((a) => a.status !== 'concluido' && a.date && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcomingActivities.length) lines.push(`- Próxima atividade agendada: "${upcomingActivities[0].title}" em ${upcomingActivities[0].date}`);

  lines.push('');
  lines.push('REUNIÕES E TAREFAS DE REUNIÃO — quando listar várias, sempre da mais antiga pra mais atual, mas comece pelos alertas críticos');
  const pastMeetings = meetings.filter((m) => !m.date || m.date <= today).sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
  const futureMeetings = meetings.filter((m) => m.date && m.date > today).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  lines.push(`- Total de reuniões registradas: ${meetings.length} (${pastMeetings.length} realizadas, ${futureMeetings.length} programadas)`);
  if (pastMeetings.length) lines.push(`- Última reunião realizada: "${pastMeetings[pastMeetings.length - 1].title}" em ${pastMeetings[pastMeetings.length - 1].date || 'sem data'}`);
  if (futureMeetings.length) lines.push(`- Próxima reunião programada: "${futureMeetings[0].title}" em ${futureMeetings[0].date}`);

  const allTodos = [];
  meetings.forEach((m) => (m.actionItems || []).filter((it) => !it.deleted).forEach((it) => allTodos.push({ ...it, meetingTitle: m.title, meetingDate: m.date })));
  const pendingTodos = allTodos.filter((it) => it.status !== 'concluida' && it.status !== 'nao-relevante');
  const criticalTodos = pendingTodos.filter((it) => it.status === 'urgente' || (it.dueDate && it.dueDate < today));
  pendingTodos.sort((a, b) => (a.dueDate || a.meetingDate || '9999-99-99').localeCompare(b.dueDate || b.meetingDate || '9999-99-99'));
  if (criticalTodos.length) {
    lines.push(`- ALERTAS CRÍTICOS (urgentes ou com prazo vencido — ${criticalTodos.length} no total):`);
    criticalTodos.slice(0, 10).forEach((it) => {
      lines.push(`  · "${it.title}" — responsável: ${it.responsible || 'sem responsável'} (${it.owner === 'cliente' ? 'lado cliente' : 'lado PRICETAX'}), prazo: ${it.dueDate || 'sem prazo'}, status: ${TODO_STATUS_LABEL[it.status] || it.status}, reunião: "${it.meetingTitle}"`);
    });
  }
  if (pendingTodos.length) {
    lines.push(`- Pendências de reunião em aberto (${pendingTodos.length} no total, mais antiga primeiro):`);
    pendingTodos.slice(0, 12).forEach((it) => {
      lines.push(`  · "${it.title}" — responsável: ${it.responsible || 'sem responsável'}, prazo: ${it.dueDate || 'sem prazo'}, status: ${TODO_STATUS_LABEL[it.status] || it.status}, reunião: "${it.meetingTitle}"`);
    });
  }

  return lines.join('\n');
}
