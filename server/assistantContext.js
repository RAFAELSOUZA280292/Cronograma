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

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Resolve um nome parcial/apelido ("Evanio", "Rafa") pro nome completo
// exato como está gravado nas atividades (pedido do Rafael: "as vezes
// vão pedir do Rafa, ou do Rafael, mas me chamo Rafael Souza") — nunca
// exige que o usuário digite o nome idêntico. Varre `responsible` de
// TODAS as pendências de reunião (não só uma amostra) pra montar o
// universo de nomes conhecidos, já que é exatamente aí que "quem deve o
// quê" mora. Retorna a lista de nomes que bateram (normalmente 1; mais
// de 1 é ambíguo, zero é "não achei ninguém com esse nome").
export function findResponsibleMatches(project, rawName) {
  const query = normalizeName(rawName);
  if (!query) return [];
  const names = new Set();
  (project.meetings || []).filter((m) => !m.deleted).forEach((m) => {
    (m.actionItems || []).filter((it) => !it.deleted && it.responsible).forEach((it) => names.add(it.responsible));
  });
  const candidates = Array.from(names);
  const exact = candidates.filter((c) => normalizeName(c) === query);
  if (exact.length) return exact;
  return candidates.filter((c) => {
    const words = normalizeName(c).split(/\s+/);
    return words.some((w) => w.startsWith(query) || query.startsWith(w));
  });
}

// Todas as pendências de reunião (qualquer status, qualquer reunião)
// atribuídas a um nome exato (já resolvido por findResponsibleMatches)
// — sem limite/amostra, porque "o que fulano está devendo" precisa da
// lista completa, não de uma fatia dos itens mais recentes do projeto
// inteiro (que poderia nem incluir os dele se houver muita gente).
export function getResponsiblePendingItems(project, responsibleName) {
  const items = [];
  (project.meetings || []).filter((m) => !m.deleted).forEach((m) => {
    (m.actionItems || []).filter((it) => !it.deleted && it.responsible === responsibleName).forEach((it) => {
      items.push({ ...it, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date || '' });
    });
  });
  return items;
}

// Monta o bloco "PENDÊNCIAS POR PESSOA" pro contexto do assistente e
// devolve também o nome resolvido (pra reaproveitar no filtro exato de
// `searchProjectMemory`, que também é por igualdade — sem essa
// resolução, filtrar a busca por "Evanio" nunca bateria com
// "Evanio Santinon"). `resolvedName` vem `null` quando ambíguo ou
// não encontrado — nesses casos não faz sentido filtrar a busca por
// participante, só devolver a explicação no texto.
export function buildPersonLookupText(project, rawName) {
  const matches = findResponsibleMatches(project, rawName);
  if (matches.length === 0) {
    return { text: `PENDÊNCIAS POR PESSOA: não encontrei ninguém chamado "${rawName}" com nenhuma pendência de reunião atribuída neste projeto.`, resolvedName: null };
  }
  if (matches.length > 1) {
    return { text: `PENDÊNCIAS POR PESSOA: o nome "${rawName}" bateu com mais de uma pessoa neste projeto: ${matches.join(', ')} — pergunte ao usuário qual delas antes de listar pendências.`, resolvedName: null };
  }
  const resolvedName = matches[0];
  const today = todayIso();
  const all = getResponsiblePendingItems(project, resolvedName);
  const pending = all
    .filter((it) => it.status !== 'concluida' && it.status !== 'nao-relevante')
    .sort((a, b) => (a.dueDate || a.meetingDate || '9999-99-99').localeCompare(b.dueDate || b.meetingDate || '9999-99-99'));
  const critical = pending.filter((it) => it.status === 'urgente' || (it.dueDate && it.dueDate < today));
  const lines = [`PENDÊNCIAS POR PESSOA — "${rawName}" foi resolvido pra "${resolvedName}" (varredura completa de todas as reuniões, não uma amostra):`];
  lines.push(`- Total de pendências em aberto: ${pending.length} de ${all.length} atividade(s) atribuída(s) a ela no total (${all.length - pending.length} já concluída(s)/não relevante(s)).`);
  if (critical.length) {
    lines.push(`- CRÍTICAS (urgente ou prazo vencido — ${critical.length}):`);
    critical.forEach((it) => lines.push(`  · "${it.title}" — prazo: ${it.dueDate || 'sem prazo'}, status: ${TODO_STATUS_LABEL[it.status] || it.status}, reunião: "${it.meetingTitle}" (${it.meetingDate || 'sem data'})`));
  }
  if (pending.length) {
    lines.push(`- Todas em aberto (mais antiga primeiro):`);
    pending.forEach((it) => lines.push(`  · "${it.title}" — prazo: ${it.dueDate || 'sem prazo'}, status: ${TODO_STATUS_LABEL[it.status] || it.status}, reunião: "${it.meetingTitle}" (${it.meetingDate || 'sem data'})`));
  } else {
    lines.push('- Nenhuma pendência em aberto no momento.');
  }
  return { text: lines.join('\n'), resolvedName };
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
  lines.push('PARTICIPANTES DE REUNIÃO (agregado de todas as reuniões — use pra responder "quem já participou")');
  const teamSet = new Set((project.team || []).map((t) => String(t || '').toLowerCase()));
  const externalSet = new Set((project.externalContacts || []).map((c) => String((c && c.name) || '').toLowerCase()));
  const participantMeetings = new Map();
  meetings.forEach((m) => {
    (m.participants || []).forEach((name) => {
      if (!name) return;
      if (!participantMeetings.has(name)) participantMeetings.set(name, []);
      participantMeetings.get(name).push({ title: m.title, date: m.date || '' });
    });
  });
  const knownTeamParticipants = [];
  const knownExternalParticipants = [];
  const unresolvedParticipants = [];
  participantMeetings.forEach((occurrences, name) => {
    occurrences.sort((a, b) => a.date.localeCompare(b.date));
    const key = String(name || '').toLowerCase();
    if (teamSet.has(key)) knownTeamParticipants.push(name);
    else if (externalSet.has(key)) knownExternalParticipants.push(name);
    else unresolvedParticipants.push({ name, occurrences });
  });
  if (knownTeamParticipants.length) lines.push(`- Da equipe/áreas cadastradas: ${knownTeamParticipants.join(', ')}`);
  if (knownExternalParticipants.length) lines.push(`- Contatos externos já identificados (lado cliente, com e-mail cadastrado): ${knownExternalParticipants.join(', ')}`);
  if (unresolvedParticipants.length) {
    lines.push('- SEM IDENTIFICAÇÃO CLARA (apareceram em reunião, mas não sabemos se são da PRICETAX ou do cliente, nem a área — pergunte ao usuário de forma natural quando fizer sentido, no máximo uma pergunta por resposta, e registre a resposta como aprendizado):');
    unresolvedParticipants.slice(0, 8).forEach(({ name, occurrences }) => {
      const last = occurrences[occurrences.length - 1];
      lines.push(`  · "${name}" — participou de ${occurrences.length} reunião(ões), última: "${last.title}" em ${last.date || 'sem data'}`);
    });
  }
  if (!knownTeamParticipants.length && !knownExternalParticipants.length && !unresolvedParticipants.length) {
    lines.push('- Nenhum participante registrado em reunião ainda.');
  }

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

  // Lista completa (id incluso) pra localizar a atividade certa quando o
  // usuário pedir pra reagendar algo por título (ex.: "postergar o split
  // payment") — não é só a atrasada/próxima, pode ser qualquer uma.
  const activitiesById = activities.slice().sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  if (activitiesById.length) {
    lines.push(`- ATIVIDADES DO CRONOGRAMA — lista completa pra localizar por título ao propor reagendamento (id entre colchetes, use exatamente esse id em reschedule_activity):`);
    activitiesById.slice(0, 40).forEach((a) => {
      const phase = phases.find((p) => p.id === a.phase);
      lines.push(`  · [${a.id}] "${a.title}" — data: ${a.date || 'sem data'}, status: ${ACTIVITY_STATUS_LABEL[a.status] || a.status}${phase ? `, fase: ${phase.name}` : ''}`);
    });
    if (activitiesById.length > 40) lines.push(`  (+${activitiesById.length - 40} atividades mais recentes não listadas aqui — busque se precisar)`);
  }

  lines.push('');
  lines.push('REUNIÕES E TAREFAS DE REUNIÃO — quando listar várias, sempre da mais antiga pra mais atual, mas comece pelos alertas críticos');
  const pastMeetings = meetings.filter((m) => !m.date || m.date <= today).sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
  const futureMeetings = meetings.filter((m) => m.date && m.date > today).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  lines.push(`- Total de reuniões registradas: ${meetings.length} (${pastMeetings.length} realizadas, ${futureMeetings.length} programadas)`);
  if (pastMeetings.length) lines.push(`- Última reunião realizada: "${pastMeetings[pastMeetings.length - 1].title}" em ${pastMeetings[pastMeetings.length - 1].date || 'sem data'}`);
  if (futureMeetings.length) lines.push(`- Próxima reunião programada: "${futureMeetings[0].title}" em ${futureMeetings[0].date}`);

  // Lista completa (id incluso) pra vincular uma pendência nova a QUALQUER
  // reunião, não só a que estiver aberta na tela — pedido explícito do
  // Rafael/Amanda: dá pra criar um "próximo passo" sem estar dentro de
  // uma reunião específica, o assistente escolhe/pergunta qual vincular.
  const meetingsById = [...pastMeetings, ...futureMeetings];
  if (meetingsById.length) {
    lines.push(`- REUNIÕES DISPONÍVEIS pra vincular uma pendência nova (id entre colchetes, use exatamente esse id em create_meeting_todo — mais recente primeiro nesta lista de referência):`);
    meetingsById.slice(-20).reverse().forEach((m) => {
      lines.push(`  · [${m.id}] "${m.title}" — ${m.date || 'sem data'}`);
    });
  }

  const allTodos = [];
  meetings.forEach((m) => (m.actionItems || []).filter((it) => !it.deleted).forEach((it) => allTodos.push({ ...it, meetingTitle: m.title, meetingDate: m.date })));
  const pendingTodos = allTodos.filter((it) => it.status !== 'concluida' && it.status !== 'nao-relevante');
  const criticalTodos = pendingTodos.filter((it) => it.status === 'urgente' || (it.dueDate && it.dueDate < today));
  const aiCreatedTodos = pendingTodos.filter((it) => (it.createdBy || '').includes('Assistente'));
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
      const aiTag = (it.createdBy || '').includes('Assistente') ? ' [criada por você, o Assistente]' : '';
      lines.push(`  · "${it.title}" — responsável: ${it.responsible || 'sem responsável'}, prazo: ${it.dueDate || 'sem prazo'}, status: ${TODO_STATUS_LABEL[it.status] || it.status}, reunião: "${it.meetingTitle}"${aiTag}`);
    });
  }
  if (aiCreatedTodos.length) {
    lines.push(`- Dessas, ${aiCreatedTodos.length} foram criadas por você mesmo (o Assistente) a pedido do usuário em conversa anterior e ainda não foram concluídas — quando fizer sentido no contexto, pergunte proativamente se já foram resolvidas.`);
  }

  return lines.join('\n');
}
