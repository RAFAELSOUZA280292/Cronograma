// Agente executor do Assistente do Projeto (2026-09, pedido do Rafael:
// "ele precisa ser um agente executor também... sempre trazendo pro
// usuário validar e confirmar tudo"). A IA (`synthesizeAnswer`, em
// `server/assistantRetrieval.js`) só PROPÕE uma ação — nunca executa
// sozinha. Este arquivo é o único lugar que de fato muta `projects.data`
// em nome do assistente, e só é chamado depois que o usuário confirma
// explicitamente pelo painel (`POST /api/assistant/messages/:id/action`,
// `server/assistant.js`). Um só tipo de ação por enquanto — criar uma
// pendência (TO_DO) numa reunião já existente, o tipo mais simples e de
// menor risco pra começar (não mexe no cronograma oficial rastreado pro
// cliente); outros tipos entram aqui como mais um `case` quando pedidos.
import { reindexMeetingMemory } from './memoryIngest.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

export async function executeProposedAction(pool, orgId, projectId, action, actingUserName) {
  if (!action || action.type !== 'create_meeting_todo') {
    throw new Error('Tipo de ação não suportado.');
  }
  const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) throw new Error('Empresa não encontrada.');
  const project = rows[0].data || {};
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
