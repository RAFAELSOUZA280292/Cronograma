// Agente executor do Assistente do Projeto (2026-09, pedido do Rafael:
// "ele precisa ser um agente executor também... sempre trazendo pro
// usuário validar e confirmar tudo"). A IA (`synthesizeAnswer`, em
// `server/assistantRetrieval.js`) só PROPÕE uma ação — nunca executa
// sozinha. Este arquivo é o único lugar que de fato muta `projects.data`
// em nome do assistente, e só é chamado depois que o usuário confirma
// explicitamente pelo painel (`POST /api/assistant/messages/:id/action`,
// `server/assistant.js`).
import { reindexMeetingMemory } from './memoryIngest.js';

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

export async function executeProposedAction(pool, orgId, projectId, action, actingUserName) {
  if (!action) throw new Error('Nenhuma ação pra executar.');
  const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) throw new Error('Empresa não encontrada.');
  const project = rows[0].data || {};

  if (action.type === 'create_meeting_todo') {
    return executeCreateMeetingTodo(pool, orgId, projectId, project, action, actingUserName);
  }
  if (action.type === 'reschedule_activity') {
    return executeRescheduleActivity(pool, projectId, project, action, actingUserName);
  }
  throw new Error('Tipo de ação não suportado.');
}
