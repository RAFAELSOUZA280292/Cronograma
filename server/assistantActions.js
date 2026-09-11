// Agente executor do Assistente do Projeto (2026-09, pedido do Rafael:
// "ele precisa ser um agente executor também... sempre trazendo pro
// usuário validar e confirmar tudo"). A IA (`synthesizeAnswer`, em
// `server/assistantRetrieval.js`) só PROPÕE uma ação — nunca executa
// sozinha. Este arquivo é o único lugar que de fato muta `projects.data`
// em nome do assistente, e só é chamado depois que o usuário confirma
// explicitamente pelo painel (`POST /api/assistant/messages/:id/action`,
// `server/assistant.js`).
import { reindexMeetingMemory } from './memoryIngest.js';
import { normalizeName } from './assistantContext.js';
import { createEvent as createGoogleCalendarEvent } from './googleCalendar.js';

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
  const updatedMeeting = { ...meetings[idx], actionItems: [...(meetings[idx].actionItems || []), newItem] };
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

// Criar uma atividade nova no cronograma oficial (Gantt/Tabela/Fases/
// Quadro -- mesma base, `project.activities`). Mesmos defaults de
// `addActivity` (src/App.jsx): mes seguinte ao ultimo cadastrado, fase
// resolvida por nome (nunca um id inventado pela IA -- mesmo principio
// de defesa em profundidade usado em toda parte deste arquivo) caindo
// pra ultima fase da lista quando nao bate com nenhuma.
async function executeCreateScheduleActivity(pool, projectId, project, action, actingUserName) {
  const activities = project.activities || [];
  const phases = project.phases || [];
  if (!phases.length) throw new Error('Este projeto ainda nao tem nenhuma fase cadastrada no cronograma.');

  const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month || 1)) + 1 : 1;
  const matchedPhase = action.phaseName
    ? phases.find((p) => normalizeName(p.name) === normalizeName(action.phaseName))
    : null;
  const phaseId = matchedPhase ? matchedPhase.id : phases[phases.length - 1].id;

  const newActivity = {
    id: uid('act'), month: nextMonth, phase: phaseId,
    title: (action.title || '').trim() || 'Atividade criada pelo Assistente do Projeto',
    desc: '', responsible: action.responsible || (project.team && project.team[0] && project.team[0].name) || 'PRICETAX',
    priority: '', participants: [],
    date: action.dueDate || '', endDate: action.dueDate || '', durationDays: '',
    status: 'nao-iniciado', required: false, subactivities: [],
    notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
  };
  const nextData = {
    ...project,
    activities: [...activities, newActivity],
    log: [
      { ts: new Date().toISOString(), action: `Atividade criada no cronograma via Assistente do Projeto, confirmado por ${actingUserName || 'usuario'}: "${newActivity.title}"`, user: actingUserName || 'Assistente do Projeto', activityId: newActivity.id },
      ...(project.log || []),
    ].slice(0, 300),
  };

  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
  return { activityId: newActivity.id, activityTitle: newActivity.title, date: newActivity.date };
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

export async function executeProposedAction(pool, orgId, projectId, action, actingUserName, userId) {
  if (!action) throw new Error('Nenhuma ação pra executar.');
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
    return executeCreateScheduleActivity(pool, projectId, project, action, actingUserName);
  }
  if (action.type === 'delete_schedule_activity') {
    return executeDeleteScheduleActivity(pool, projectId, project, action, actingUserName);
  }
  if (action.type === 'create_calendar_event') {
    return executeCreateCalendarEvent(pool, projectId, project, action, actingUserName, userId);
  }
  throw new Error('Tipo de ação não suportado.');
}
