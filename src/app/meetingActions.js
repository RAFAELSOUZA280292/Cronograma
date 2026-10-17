// Ações sobre reuniões e tarefas de reunião (criar/editar, compartilhar, participantes, tarefas, vínculo com atividade, subtarefas, comentários e anexos).
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { NO_ACTIVITY, applySuggestionsToMeetings } from '../meetings/ActivityLink.jsx';
import { apiPost } from '../lib/api.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { todoStatusMeta } from '../meetings/Meetings.jsx';
import { DELETE_CONFIRM_PHRASE, fmtDate, genShareToken, todayISOStr, uid } from '../App.jsx';

export function createMeetingActions({ currentUser, flushProjectSave, mutateProject, openMeetingDetail, projects, pushAppUndoToast }) {
  // Reuniões (2026-09) — mesmo padrão de mutação das atividades
  // (mutateProject + soft-delete pra item de primeira classe, hard-delete
  // pra sub-item leve tipo attachment/link), num array próprio
  // `project.meetings` — não é atividade do cronograma, não deveria
  // aparecer nem contar em nenhuma métrica/filtro de atividade existente.
  function addMeeting(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const nm = {
      id: uid('mtg'), title: 'Nova reunião', date: todayISOStr(), time: '',
      participants: [], transcript: '', summary: '', decisions: '', actionItems: [],
      createdAt: new Date().toISOString(), deleted: false, deletedAt: '', deletedBy: '',
    };
    mutateProject(targetPid, (p) => ({ ...p, meetings: [...(p.meetings || []), nm] }), `Reunião criada: "${nm.title}"`);
    openMeetingDetail(targetPid, nm.id);
  }

  function updateMeeting(targetPid, meetingId, patch, logMsg) {
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((m) => (m.id === meetingId ? { ...m, ...patch } : m)),
    }), logMsg);
  }

  // Compartilhar reunião por link público, só-leitura — mesmo padrão de
  // token do quadro pessoal (genShareToken, gerado no cliente), mas sem
  // rota PATCH pública: quem recebe o link só visualiza.
  function toggleMeetingShare(targetPid, meetingId, visibility) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    const patch = { shareVisibility: visibility };
    if (visibility === 'public' && !m.shareToken) patch.shareToken = genShareToken();
    updateMeeting(targetPid, meetingId, patch, visibility === 'public' ? `Reunião "${m.title}" tornada pública por link` : `Reunião "${m.title}" tornada privada`);
  }

  function regenerateMeetingShareLink(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    updateMeeting(targetPid, meetingId, { shareToken: genShareToken() }, `Link público da reunião "${m.title}" regenerado (link anterior invalidado)`);
  }

  async function deleteMeeting(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return false;
    const okDelete = await askConfirm({ title: 'Excluir reunião?', message: `Para excluir "${m.title}", digite "${DELETE_CONFIRM_PHRASE}" abaixo.`, confirmLabel: 'Excluir', danger: true, requireText: DELETE_CONFIRM_PHRASE });
    if (!okDelete) return false;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : x)),
    }), `Reunião excluída: "${m.title}"`);
    return true;
  }

  function restoreMeeting(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, deleted: false, deletedAt: '', deletedBy: '' } : x)),
    }), m ? `Reunião restaurada: "${m.title}"` : undefined);
  }

  function toggleMeetingParticipant(targetPid, meetingId, name) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    const has = (m.participants || []).includes(name);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, participants: has ? (x.participants || []).filter((n) => n !== name) : [...(x.participants || []), name] } : x)),
    }), `${has ? 'Participante removido' : 'Participante adicionado'} na reunião "${m.title}": ${name}`);
  }

  // Contato externo (cliente/fornecedor) fica salvo em project.externalContacts
  // pra reaparecer como sugestão nas próximas reuniões dessa empresa — não
  // precisa retypar nome/e-mail toda vez. Mesmo padrão JSONB de team/meetings,
  // sem tabela relacional nova (é sempre escopado a UMA empresa).
  function addMeetingParticipantFreeText(targetPid, meetingId, name, email) {
    const v = (name || '').trim();
    if (!v) return;
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m || (m.participants || []).includes(v)) return;
    const emailTrim = (email || '').trim();
    mutateProject(targetPid, (p) => {
      const contacts = p.externalContacts || [];
      const existing = contacts.find((c) => c.name.toLowerCase() === v.toLowerCase());
      const nextContacts = existing
        ? (emailTrim && !existing.email ? contacts.map((c) => (c.id === existing.id ? { ...c, email: emailTrim } : c)) : contacts)
        : [...contacts, { id: uid('ctt'), name: v, email: emailTrim, createdAt: new Date().toISOString() }];
      return {
        ...p,
        externalContacts: nextContacts,
        meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, participants: [...(x.participants || []), v] } : x)),
      };
    }, `Participante adicionado na reunião "${m.title}": ${v}`);
  }

  function addMeetingActionItem(targetPid, meetingId, overrides) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    const item = {
      id: uid('mai'), title: 'Nova tarefa', responsible: '', owner: 'pricetax', dueDate: '', status: 'nao-iniciado', deleted: false,
      subtitle: '', notes: '', subtasks: [], comments: [], attachments: [],
      createdBy: currentUser ? currentUser.name : '', createdAt: new Date().toISOString(),
      ...(overrides || {}),
    };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, actionItems: [...(x.actionItems || []), item] } : x)),
    }), m ? `Tarefa adicionada na reunião "${m.title}"` : undefined, item.id);
    return item.id;
  }

  // Gera uma frase legível a partir do diff — reaproveita o mesmo
  // mecanismo de log/histórico já usado pelas atividades de cronograma
  // (activityId + project.log), agora passando o id do item de TO_DO.
  function describeActionItemChange(item, patch) {
    const who = currentUser ? currentUser.name : 'Alguém';
    const parts = [];
    if ('status' in patch && patch.status !== item.status) {
      parts.push(`status de "${todoStatusMeta(item.status).label}" para "${todoStatusMeta(patch.status).label}"`);
    }
    if ('responsible' in patch && (patch.responsible || '') !== (item.responsible || '')) {
      parts.push(`responsável de "${item.responsible || 'sem responsável'}" para "${patch.responsible || 'sem responsável'}"`);
    }
    if ('dueDate' in patch && (patch.dueDate || '') !== (item.dueDate || '')) {
      parts.push(`prazo de "${item.dueDate ? fmtDate(item.dueDate) : 'sem prazo'}" para "${patch.dueDate ? fmtDate(patch.dueDate) : 'sem prazo'}"`);
    }
    if ('owner' in patch && patch.owner !== item.owner) {
      const label = (o) => (o === 'cliente' ? 'cliente' : 'PRICETAX');
      parts.push(`o lado responsável de "${label(item.owner)}" para "${label(patch.owner)}"`);
    }
    if ('title' in patch && patch.title !== item.title) parts.push('o título');
    if ('subtitle' in patch && (patch.subtitle || '') !== (item.subtitle || '')) parts.push('o contexto');
    if ('notes' in patch && (patch.notes || '') !== (item.notes || '')) parts.push('a descrição');
    if (!parts.length) return null;
    return `${who} alterou ${parts.join(', ')}`;
  }

  function findActionItem(targetPid, meetingId, itemId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    const item = m && (m.actionItems || []).find((it) => it.id === itemId);
    return { m, item };
  }

  function updateMeetingActionItem(targetPid, meetingId, itemId, patch) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const logMsg = item ? describeActionItemChange(item, patch) : null;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) })),
    }), logMsg || undefined, itemId);
  }

  function deleteMeetingActionItem(targetPid, meetingId, itemId) {
    const { m, item } = findActionItem(targetPid, meetingId, itemId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, deleted: true } : it)) })),
    }), item ? `Tarefa removida na reunião "${m.title}": ${item.title}` : undefined);
    if (item) pushAppUndoToast(`Tarefa "${item.title}" excluída.`, () => updateMeetingActionItem(targetPid, meetingId, itemId, { deleted: false }), 8000);
  }

  function duplicateActionItem(targetPid, meetingId, itemId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    if (!item) return;
    const copy = {
      ...item, id: uid('mai'), title: `${item.title} (cópia)`, status: 'nao-iniciado',
      subtasks: (item.subtasks || []).map((s) => ({ ...s, id: uid('sub'), done: false })),
      comments: [], attachments: [],
      createdBy: currentUser ? currentUser.name : '', createdAt: new Date().toISOString(),
    };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, actionItems: [...(x.actionItems || []), copy] } : x)),
    }), `${currentUser ? currentUser.name : 'Alguém'} duplicou a tarefa "${item.title}"`, copy.id);
    return copy.id;
  }

  // Vínculo tarefa → atividade do cronograma (Fase 1, docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). `value`: id da atividade, NO_ACTIVITY ("nenhuma se
  // aplica") ou '' (limpar). O campo vai junto do projeto (autosave); a decisão humana também vai pro livro-razão (aprendizado), sem bloquear.
  // "Sugerir atividades" para as tarefas pendentes de vínculo (Fase 3): grava antes, pede ao servidor, aplica só como SUGESTÃO (a pessoa confirma).
  async function requestTaskSuggestions(targetPid) {
    try {
      await flushProjectSave(targetPid);
      const r = await apiPost('/api/task-links/suggest', { projectId: targetPid });
      const sugg = (r && r.suggestions) || {};
      const project = projects.find((p) => p.id === targetPid);
      const applied = applySuggestionsToMeetings((project && project.meetings) || [], sugg).count;
      if (applied > 0) {
        mutateProject(targetPid, (p) => ({ ...p, meetings: applySuggestionsToMeetings(p.meetings || [], sugg).meetings }),
          `${currentUser ? currentUser.name : 'Alguém'} pediu sugestões da RENATA: ${applied} tarefa${applied === 1 ? '' : 's'} com atividade do cronograma sugerida (a confirmar)`);
      }
      const rest = r && r.remaining > 0 ? ` Restam ${r.remaining} tarefas: clique de novo para continuar.` : '';
      notify(applied > 0 ? `A RENATA sugeriu a atividade de ${applied} de ${r.considered} tarefas. Revise e confirme.${rest}` : `A RENATA não achou atividade com segurança para essas ${r.considered} tarefas.${rest}`, { tone: applied > 0 ? 'success' : 'info', ttlMs: 8000 });
    } catch (e) {
      notify((e && e.message) || 'Não foi possível pedir as sugestões agora.', { tone: 'error' });
    }
  }
  const canLinkTasks = !!currentUser && (currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax');
  function linkTaskToActivity(targetPid, meetingId, itemId, value) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const project = projects.find((p) => p.id === targetPid);
    if (!item || !project) return;
    const who = currentUser ? currentUser.name : 'Alguém';
    const act = value && value !== NO_ACTIVITY ? (project.activities || []).find((a) => a.id === value && !a.deleted) : null;
    if (value && value !== NO_ACTIVITY && !act) return;
    const now = new Date().toISOString();
    const sug = item.activityLink && item.activityLink.status === 'suggested' ? item.activityLink : null; // sugestão da RENATA ainda pendente
    const base = { confirmedBy: who, confirmedAt: now, source: sug ? 'sugestao' : 'manual', ...(sug ? { suggestedId: sug.suggestedId, confidence: sug.confidence } : {}) };
    const patch = !value
      ? { activityId: '', activityLink: null }
      : act
        ? { activityId: act.id, activityLink: { status: 'confirmed', ...base } }
        : { activityId: '', activityLink: { status: 'none', ...base } };
    const suggestedTitle = sug ? ((project.activities || []).find((a) => a.id === sug.suggestedId) || {}).title : '';
    const logMsg = !value ? (sug ? `${who} dispensou a sugestão de atividade da tarefa "${item.title}"` : `${who} removeu o vínculo da tarefa "${item.title}" com o cronograma`)
      : act ? (sug && act.id === sug.suggestedId ? `${who} confirmou a sugestão da RENATA: tarefa "${item.title}" na atividade "${act.title}"`
        : sug ? `${who} trocou a sugestão da RENATA${suggestedTitle ? ` ("${suggestedTitle}")` : ''}: tarefa "${item.title}" vinculada à atividade "${act.title}"`
          : `${who} vinculou a tarefa "${item.title}" à atividade "${act.title}"`)
        : `${who} marcou que nenhuma atividade do cronograma se aplica à tarefa "${item.title}"`;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) })),
    }), logMsg, itemId);
    if (value) {
      apiPost('/api/task-links', {
        projectId: targetPid, taskId: itemId, decision: act ? 'escolheu' : 'nenhuma', activityId: act ? act.id : undefined,
        suggestedActivityId: sug ? sug.suggestedId : undefined, confidence: sug ? sug.confidence : undefined, source: sug ? (sug.source || 'ia') : 'manual',
      }).catch(() => {});
    }
  }

  function addTodoSubtask(targetPid, meetingId, itemId, title) {
    const v = (title || '').trim();
    if (!v) return;
    const sub = { id: uid('sub'), title: v, done: false };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, subtasks: [...(it.subtasks || []), sub] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} adicionou a subtarefa "${v}"`, itemId);
  }

  function toggleTodoSubtask(targetPid, meetingId, itemId, subId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const sub = item && (item.subtasks || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, subtasks: (it.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) })) })),
    }), sub ? `${currentUser ? currentUser.name : 'Alguém'} marcou a subtarefa "${sub.title}" como ${sub.done ? 'não concluída' : 'concluída'}` : undefined, itemId);
  }

  function deleteTodoSubtask(targetPid, meetingId, itemId, subId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const sub = item && (item.subtasks || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, subtasks: (it.subtasks || []).filter((s) => s.id !== subId) })) })),
    }), sub ? `${currentUser ? currentUser.name : 'Alguém'} removeu a subtarefa "${sub.title}"` : undefined, itemId);
  }

  function addTodoComment(targetPid, meetingId, itemId, text, attachments, links) {
    const v = (text || '').trim();
    const atts = attachments || [];
    const lks = links || [];
    if (!v && !atts.length && !lks.length) return;
    const comment = { id: uid('tc'), text: v, ts: new Date().toISOString(), user: currentUser ? currentUser.name : '', userId: currentUser ? currentUser.id : null, ...(atts.length ? { attachments: atts } : {}), ...(lks.length ? { links: lks } : {}) };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, comments: [...(it.comments || []), comment] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} comentou`, itemId);
  }

  function updateTodoComment(targetPid, meetingId, itemId, commentId, text) {
    const v = (text || '').trim();
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const cur = item && (item.comments || []).find((c) => c.id === commentId);
    if (!v && !(cur && ((cur.attachments || []).length || (cur.links || []).length))) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, comments: (it.comments || []).map((c) => (c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c)) })) })),
    }), undefined, itemId);
  }

  function deleteTodoComment(targetPid, meetingId, itemId, commentId) {
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, comments: (it.comments || []).filter((c) => c.id !== commentId) })) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} removeu um comentário`, itemId);
  }

  function addTodoAttachment(targetPid, meetingId, itemId, fileMeta) {
    const att = { id: uid('att'), name: fileMeta.name, size: fileMeta.size, type: fileMeta.type, dataUrl: fileMeta.dataUrl, addedBy: currentUser ? currentUser.name : '', addedAt: new Date().toISOString() };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, attachments: [...(it.attachments || []), att] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} anexou o arquivo "${fileMeta.name}"`, itemId);
  }

  function deleteTodoAttachment(targetPid, meetingId, itemId, attId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const att = item && (item.attachments || []).find((a) => a.id === attId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, attachments: (it.attachments || []).filter((a) => a.id !== attId) })) })),
    }), att ? `${currentUser ? currentUser.name : 'Alguém'} removeu o anexo "${att.name}"` : undefined, itemId);
  }

  return {
    addMeeting,
    addMeetingActionItem,
    addMeetingParticipantFreeText,
    addTodoAttachment,
    addTodoComment,
    addTodoSubtask,
    canLinkTasks,
    deleteMeeting,
    deleteMeetingActionItem,
    deleteTodoAttachment,
    deleteTodoComment,
    deleteTodoSubtask,
    duplicateActionItem,
    findActionItem,
    linkTaskToActivity,
    regenerateMeetingShareLink,
    requestTaskSuggestions,
    restoreMeeting,
    toggleMeetingParticipant,
    toggleMeetingShare,
    toggleTodoSubtask,
    updateMeeting,
    updateMeetingActionItem,
    updateTodoComment,
  };
}
