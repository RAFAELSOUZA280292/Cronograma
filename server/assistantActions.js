// Agente executor do Assistente do Projeto (2026-09, pedido do Rafael:
// "ele precisa ser um agente executor também... sempre trazendo pro
// usuário validar e confirmar tudo"). A IA (`synthesizeAnswer`, em
// `server/assistantRetrieval.js`) só PROPÕE uma ação — nunca executa
// sozinha. Este arquivo é o único lugar que de fato muta `projects.data`
// em nome do assistente, e só é chamado depois que o usuário confirma
// explicitamente pelo painel (`POST /api/assistant/messages/:id/action`,
// `server/assistant.js`).
import { reindexMeetingMemory } from './memoryIngest.js';
import { createEvent as createGoogleCalendarEvent } from './googleCalendar.js';
import { saveKnowledgeFact, saveConflictPair } from './knowledgeFacts.js';
import { logMetric } from './metrics.js';
import { suggestActivityLinks, applySuggestions } from './taskLinkSuggest.js';
import { loadLedgerExamples } from './taskLinkLearn.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

async function executeCreateMeetingTodo(pool, orgId, projectId, project, action, actingUserName) {
  const meetings = project.meetings || [];
  const idx = meetings.findIndex((m) => m.id === action.meetingId && !m.deleted);
  if (idx === -1) throw new Error('Reunião de destino não encontrada (pode ter sido apagada).');

  const newItem = {
    id: uid('mai'),
    title: (action.title || '').trim() || 'Pendência criada pelo Assistente do Projeto',
    responsible: action.responsible || '',
    owner: action.owner === 'cliente' ? 'cliente' : 'pricetax',
    dueDate: action.dueDate || '',
    status: 'nao-iniciado',
    deleted: false,
    subtitle: '', notes: '', subtasks: [], comments: [], attachments: [],
    createdBy: 'Assistente do Projeto (IA)',
    createdAt: new Date().toISOString(),
  };
  // Vínculo tarefa → atividade (Fase 3): só aprendido + regra (sem IA, para não atrasar a confirmação); nunca confirma sozinho.
  let itemToAdd = newItem;
  try {
    const sug = await suggestActivityLinks({
      client: null, activities: project.activities, phases: project.phases, tasks: [{ id: newItem.id, title: newItem.title, area: '', owner: newItem.owner, responsible: newItem.responsible }],
      meeting: meetings[idx], learn: { examples: await loadLedgerExamples(pool, orgId), projectId, data: project },
    });
    itemToAdd = applySuggestions([newItem], sug.suggestions)[0];
  } catch (e) { console.error('Assistente do Projeto: falha ao sugerir atividade do cronograma', e.message); }
  const updatedMeeting = { ...meetings[idx], actionItems: [...(meetings[idx].actionItems || []), itemToAdd] };
  const nextMeetings = meetings.map((m, i) => (i === idx ? updatedMeeting : m));
  const nextData = {
    ...project,
    meetings: nextMeetings,
    log: [
      { ts: new Date().toISOString(), action: `Pendência criada via Assistente do Projeto, confirmado por ${actingUserName || 'usuário'}: "${newItem.title}" (reunião "${updatedMeeting.title}")`, user: actingUserName || 'Assistente do Projeto', activityId: null },
      ...(project.log || []),
    ].slice(0, 300),
  };

  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
  // A pendência nova precisa entrar na memória pesquisável da reunião —
  // mesma reindexação automática que já roda pra qualquer edição manual
  // (ver syncProjectMemoryFromDiff em server/routes.js).
  reindexMeetingMemory(pool, orgId, projectId, updatedMeeting)
    .catch((e) => console.error('Assistente do Projeto: falha ao reindexar memória após ação executada', e.message));

  return { meetingId: updatedMeeting.id, meetingTitle: updatedMeeting.title, actionItem: newItem };
}

// Excluir (soft-delete) um TO_DO de uma reunião. Mesma mutacao de
// deleteMeetingActionItem (src/App.jsx) -- so marca `deleted:true`, sem
// campos extras de auditoria (esse item nao tem isso hoje, diferente da
// atividade do cronograma abaixo).
async function executeDeleteMeetingTodo(pool, orgId, projectId, project, action, actingUserName) {
  const meetings = project.meetings || [];
  const idx = meetings.findIndex((m) => m.id === action.meetingId && !m.deleted);
  if (idx === -1) throw new Error('Reuniao de origem nao encontrada (pode ter sido apagada).');
  const meeting = meetings[idx];
  const itemIdx = (meeting.actionItems || []).findIndex((it) => it.id === action.todoItemId && !it.deleted);
  if (itemIdx === -1) throw new Error('Pendencia nao encontrada (pode ja ter sido excluida).');
  const item = meeting.actionItems[itemIdx];

  const updatedMeeting = {
    ...meeting,
    actionItems: meeting.actionItems.map((it, i) => (i === itemIdx ? { ...it, deleted: true } : it)),
  };
  const nextMeetings = meetings.map((m, i) => (i === idx ? updatedMeeting : m));
  const nextData = {
    ...project,
    meetings: nextMeetings,
    log: [
      { ts: new Date().toISOString(), action: `Pendencia excluida via Assistente do Projeto, confirmado por ${actingUserName || 'usuario'}: "${item.title}" (reuniao "${updatedMeeting.title}")`, user: actingUserName || 'Assistente do Projeto', activityId: null },
      ...(project.log || []),
    ].slice(0, 300),
  };

  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
  // Chunk da pendencia excluida precisa sumir da memoria pesquisavel --
  // reindexMeetingMemory reconstroi do zero e ja filtra `!it.deleted`.
  reindexMeetingMemory(pool, orgId, projectId, updatedMeeting)
    .catch((e) => console.error('Assistente do Projeto: falha ao reindexar memoria apos exclusao de pendencia', e.message));

  return { meetingId: updatedMeeting.id, meetingTitle: updatedMeeting.title, todoTitle: item.title };
}

// Excluir (soft-delete) uma atividade do cronograma oficial. Mesma
// mutacao de `deleteActivity` (src/App.jsx), incluindo os campos de
// auditoria (`deletedAt`/`deletedBy`) -- essa exclusao afeta prazo
// visivel pro cliente, por isso o card de confirmacao no painel usa um
// estilo de aviso mais forte (ver src/assistant/ProjectAssistant.jsx).
async function executeDeleteScheduleActivity(pool, projectId, project, action, actingUserName) {
  const activities = project.activities || [];
  const idx = activities.findIndex((a) => a.id === action.activityId && !a.deleted);
  if (idx === -1) throw new Error('Atividade do cronograma nao encontrada (pode ja ter sido excluida).');
  const activity = activities[idx];

  const nextActivities = activities.map((a, i) => (i === idx ? { ...a, deleted: true, deletedAt: new Date().toISOString(), deletedBy: actingUserName || '' } : a));
  const nextData = {
    ...project,
    activities: nextActivities,
    log: [
      { ts: new Date().toISOString(), action: `Atividade excluida do cronograma via Assistente do Projeto, confirmado por ${actingUserName || 'usuario'}: "${activity.title}"`, user: actingUserName || 'Assistente do Projeto', activityId: activity.id },
      ...(project.log || []),
    ].slice(0, 300),
  };

  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
  return { activityId: activity.id, activityTitle: activity.title };
}

// Criar um evento de verdade no Google Calendar do usuario que confirmou
// a acao (OAuth por usuario, nao por projeto -- ver server/googleCalendar.js).
// So chega aqui se o backend ja validou que o usuario esta conectado
// (ver askProjectAssistant em server/assistantRetrieval.js); mesmo assim
// `createEvent` lanca erro claro se a conexao tiver sumido nesse meio-tempo.
async function executeCreateCalendarEvent(pool, projectId, project, action, actingUserName, userId) {
  const title = (action.title || '').trim() || 'Compromisso criado pelo Assistente do Projeto';
  const date = action.dueDate;
  if (!date) throw new Error('Data do evento nao informada.');
  const time = /^\d{2}:\d{2}$/.test(action.startTime || '') ? action.startTime : '09:00';
  const startISO = `${date}T${time}:00`;
  const startDate = new Date(startISO);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const companyName = (project.company && project.company.name) || '';

  const event = await createGoogleCalendarEvent(userId, {
    summary: title,
    description: `Criado pela RENATA (Assistente do Projeto)${companyName ? ` -- empresa ${companyName}` : ''}.`,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
  });

  const nextData = {
    ...project,
    log: [
      { ts: new Date().toISOString(), action: `Evento criado no Google Calendar via Assistente do Projeto, confirmado por ${actingUserName || 'usuario'}: "${title}" em ${date} ${time}`, user: actingUserName || 'Assistente do Projeto', activityId: null },
      ...(project.log || []),
    ].slice(0, 300),
  };
  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);

  return { title, date, time, htmlLink: event.htmlLink };
}

// Reagendar uma atividade do cronograma oficial (Gantt/Tabela/Fases/
// Quadro — mesma base, `project.activities`). Pedido explícito do Rafael
// (exemplo dado: "postergar o split payment pro final do cronograma"),
// com o mesmo fluxo de confirmação — só muda `date`/`endDate` pra manter
// o efeito simples e previsível (não recalcula duração nem reordena
// `month`, que é só um rótulo de exibição).
async function executeRescheduleActivity(pool, projectId, project, action, actingUserName) {
  const activities = project.activities || [];
  const idx = activities.findIndex((a) => a.id === action.activityId && !a.deleted);
  if (idx === -1) throw new Error('Atividade do cronograma não encontrada (pode ter sido apagada).');

  const oldActivity = activities[idx];
  const updatedActivity = { ...oldActivity, date: action.newDate, endDate: action.newDate };
  const nextActivities = activities.map((a, i) => (i === idx ? updatedActivity : a));
  const nextData = {
    ...project,
    activities: nextActivities,
    log: [
      { ts: new Date().toISOString(), action: `Atividade reagendada via Assistente do Projeto, confirmado por ${actingUserName || 'usuário'}: "${updatedActivity.title}" de ${oldActivity.date || 'sem data'} para ${action.newDate}`, user: actingUserName || 'Assistente do Projeto', activityId: updatedActivity.id },
      ...(project.log || []),
    ].slice(0, 300),
  };

  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
  return { activityId: updatedActivity.id, activityTitle: updatedActivity.title, oldDate: oldActivity.date || '', newDate: action.newDate };
}

// Grava um fato na memória em camadas (Fase 7 — server/knowledgeFacts.js)
// depois de confirmação explícita, igual às outras ações. Não mexe em
// `project.data`/`project.log` de propósito — `ai_knowledge_facts` já é
// a própria trilha de auditoria (quem disse, quando, em qual conversa).
// Fase 7.1: `scope` já chega aqui como o valor FINAL (a IA sugere, mas
// `decideProposedAction` — server/assistantRetrieval.js — já aplicou a
// escolha do usuário no seletor do painel antes de chegar aqui) —
// mesmo assim nunca confia cegamente: revalida contra o enum real.
// Fase 8: repassa `sourceMeetingId` (reunião aberta na tela quando a
// RENATA propôs o fato, se houver) e `entityMentions` (pessoas/empresas/
// etc. que a IA identificou no fato) pra `saveKnowledgeFact` — nenhuma
// lógica nova aqui, só propagação. `projectData` só é carregado quando
// há menções de entidade pra resolver (nunca uma leitura extra à toa).
async function executeSaveKnowledgeFact(pool, orgId, projectId, action, userId, conversationId) {
  const subject = (action.subject || '').trim();
  const content = (action.content || '').trim();
  if (!subject || !content) throw new Error('Assunto ou conteúdo do fato não informado.');
  const scope = ['conversation', 'org'].includes(action.scope) ? action.scope : 'project';

  let projectData = null;
  if (action.entityMentions && action.entityMentions.length) {
    const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
    projectData = rows[0] && rows[0].data;
  }

  const result = await saveKnowledgeFact(pool, {
    orgId, projectId, scope, subject, content,
    knowledgeType: action.knowledgeType || 'FACT',
    validFrom: action.validFrom || null,
    sourceUserId: userId, sourceConversationId: conversationId,
    sourceMeetingId: action.sourceMeetingId || null,
    entityMentions: action.entityMentions || null,
    projectData,
  });
  // `factId` (Fase 8) — sem isso, getFactDetail (server/knowledgeCenter.js)
  // não consegue achar o evento "confirmado" na timeline de histórico do
  // fato (os outros 4 eventos automáticos já tinham newId/existingId/
  // oldId; este era o único que faltava um id pesquisável).
  logMetric(pool, { orgId, projectId, eventType: 'fact_confirmed', metadata: { factId: result.id, subject, scope, relation: result.relation, status: result.status } }).catch(() => {});
  return { subject, content, scope, ...result };
}

// Registra um conflito que a RENATA percebeu sozinha entre duas fontes
// já existentes (ver server/knowledgeFacts.js `saveConflictPair` pro
// racional completo). Mesmo padrão de `executeSaveKnowledgeFact`: não
// mexe em `project.data`, `ai_knowledge_facts` já é a trilha de
// auditoria; `projectData` só carregado se houver entidades a ligar.
async function executeFlagKnowledgeConflict(pool, orgId, projectId, action, userId, conversationId) {
  const subject = (action.subject || '').trim();
  const contentA = (action.content || '').trim();
  const contentB = (action.conflictingContent || '').trim();
  if (!subject || !contentA || !contentB) throw new Error('Conflito incompleto — faltam as duas versões do fato.');
  const scope = ['conversation', 'org'].includes(action.scope) ? action.scope : 'project';

  let projectData = null;
  if (action.entityMentions && action.entityMentions.length) {
    const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
    projectData = rows[0] && rows[0].data;
  }

  const result = await saveConflictPair(pool, {
    orgId, projectId, scope, subject, contentA, contentB,
    knowledgeType: action.knowledgeType || 'FACT',
    sourceUserId: userId, sourceConversationId: conversationId,
    sourceMeetingId: action.sourceMeetingId || null,
    entityMentions: action.entityMentions || null,
    projectData,
  });
  logMetric(pool, { orgId, projectId, eventType: 'conflict_flag_confirmed', metadata: { factIdA: result.idA, factIdB: result.idB, subject, scope } }).catch(() => {});
  return { subject, contentA, contentB, scope, ...result };
}

export async function executeProposedAction(pool, orgId, projectId, action, actingUserName, userId, conversationId) {
  if (!action) throw new Error('Nenhuma ação pra executar.');

  if (action.type === 'save_knowledge_fact') {
    return executeSaveKnowledgeFact(pool, orgId, projectId, action, userId, conversationId);
  }
  if (action.type === 'flag_knowledge_conflict') {
    return executeFlagKnowledgeConflict(pool, orgId, projectId, action, userId, conversationId);
  }

  const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) throw new Error('Empresa não encontrada.');
  const project = rows[0].data || {};

  if (action.type === 'create_meeting_todo') {
    return executeCreateMeetingTodo(pool, orgId, projectId, project, action, actingUserName);
  }
  if (action.type === 'delete_meeting_todo') {
    return executeDeleteMeetingTodo(pool, orgId, projectId, project, action, actingUserName);
  }
  if (action.type === 'reschedule_activity') {
    return executeRescheduleActivity(pool, projectId, project, action, actingUserName);
  }
  if (action.type === 'create_schedule_activity') {
    // Regra do Rafael (2026-10-19): a RENATA não cria atividade do cronograma. Propostas antigas, ainda pendentes de confirmação, também são recusadas.
    throw new Error('A RENATA não cria atividades do cronograma. Crie a atividade pela tela, ou vincule a tarefa a uma atividade que já existe.');
  }
  if (action.type === 'delete_schedule_activity') {
    return executeDeleteScheduleActivity(pool, projectId, project, action, actingUserName);
  }
  if (action.type === 'create_calendar_event') {
    return executeCreateCalendarEvent(pool, projectId, project, action, actingUserName, userId);
  }
  throw new Error('Tipo de ação não suportado.');
}
