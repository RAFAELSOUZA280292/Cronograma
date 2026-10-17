// Ações sobre as atividades de uma empresa (criar, editar, excluir, subatividades, anexos, comentários, links e participantes).
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { askConfirm } from '../ui/dialogs.jsx';
import { readFileAsAttachment } from '../ui/ComposeBox.jsx';
import { DELETE_CONFIRM_PHRASE, MAX_ATTACHMENT_BYTES, uid } from '../App.jsx';

export function createCompanyActivityActions({ currentUser, mutateProject, openActivityDetail, projects, pushAppUndoToast, setExpanded }) {
  function addLog(targetPid, action) {
    mutateProject(targetPid, (p) => p, action);
  }

  function updateActivity(targetPid, id, patch, logMsg) {
    const sourceProject = projects.find((p) => p.id === targetPid);
    const sourceActivity = sourceProject && sourceProject.activities.find((a) => a.id === id);

    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), logMsg, id);

    // Atividade de grupo: título/descrição/datas/fase/obrigatoriedade ficam sincronizados
    // entre as cópias irmãs; status/responsável/comentários/etc. continuam independentes.
    if (sourceActivity && sourceActivity.groupActivityId) {
      const GROUP_SYNC_FIELDS = ['title', 'desc', 'date', 'endDate', 'durationDays', 'phase', 'required'];
      const syncPatch = {};
      let hasSyncField = false;
      GROUP_SYNC_FIELDS.forEach((f) => {
        if (Object.prototype.hasOwnProperty.call(patch, f)) { syncPatch[f] = patch[f]; hasSyncField = true; }
      });
      if (hasSyncField) {
        projects.forEach((p) => {
          if (p.id === targetPid) return;
          const sibling = p.activities.find((a) => a.groupActivityId === sourceActivity.groupActivityId);
          if (sibling) {
            mutateProject(p.id, (pr) => ({ ...pr, activities: pr.activities.map((a) => (a.id === sibling.id ? { ...a, ...syncPatch } : a)) }), 'Sincronizado do grupo', sibling.id);
          }
        });
      }
    }
  }

  function addActivity(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = { id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '', responsible: (project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [], date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false };
    mutateProject(targetPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade criada: "${na.title}"`, na.id);
    // Sem isso, a atividade nasce lá no final da lista (ordenada por
    // data/mês) e "some" pro usuário — pedido do Rafael pra já abrir
    // direto pra edição, sem precisar caçar ela na lista depois.
    openActivityDetail(targetPid, na.id);
  }

  // Atividade "de grupo" (v2): registro único no projeto do Master, marcado com
  // as empresas-filhas envolvidas (involvedCompanyIds vazio = "Geral do Grupo").
  // Substitui o mecanismo antigo de cópia por empresa (groupActivityId) — cópias
  // já existentes continuam funcionando via o bloco de sync em updateActivity().
  function addGroupWideActivity(masterPid, involvedCompanyIds) {
    const project = projects.find((p) => p.id === masterPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = {
      id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '',
      responsible: (project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [],
      date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [],
      notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
      involvedCompanyIds: involvedCompanyIds || [],
    };
    mutateProject(masterPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade de grupo criada: "${na.title}"`, na.id);
    openActivityDetail(masterPid, na.id);
  }

  async function deleteActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    if (!a) return false;
    const okDelete = await askConfirm({ title: 'Excluir atividade?', message: `Para excluir "${a.title}", digite "${DELETE_CONFIRM_PHRASE}" abaixo.`, confirmLabel: 'Excluir', danger: true, requireText: DELETE_CONFIRM_PHRASE });
    if (!okDelete) return false;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((x) => (x.id === id ? { ...x, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : x)),
    }), `Atividade excluída: "${a.title}"`, id);
    return true;
  }

  function restoreActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((x) => (x.id === id ? { ...x, deleted: false, deletedAt: '', deletedBy: '' } : x)),
    }), a ? `Atividade restaurada: "${a.title}"` : undefined, id);
  }

  function addSub(targetPid, actId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: [...(a.subactivities || []), { id: uid('s'), title: 'Nova subatividade', done: false, responsible: '', date: '' }] }) }), act ? `Subatividade adicionada em "${act.title}"` : undefined, actId);
    setExpanded((e) => ({ ...e, [actId]: true }));
  }

  function updateSub(targetPid, actId, subId, patch) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, ...patch } : s) }) }), undefined, actId);
  }

  function deleteSub(targetPid, actId, subId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const sub = act && (act.subactivities || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : s),
      }),
    }), sub ? `Subatividade excluída em "${act.title}": ${sub.title}` : undefined, actId);
    if (sub) pushAppUndoToast(`Subatividade "${sub.title}" excluída.`, () => restoreSub(targetPid, actId, subId), 8000);
  }

  // Remoção de item de lista dentro da atividade (anexo, comentário, link): guarda o item e a posição para o "Desfazer" devolver no lugar.
  function undoReinsert(targetPid, actId, field, item, index) {
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => {
        if (a.id !== actId) return a;
        const list = [...(a[field] || [])];
        if (list.some((x) => x.id === item.id)) return a;
        list.splice(Math.min(index, list.length), 0, item);
        return { ...a, [field]: list };
      }),
    }), undefined, actId);
  }

  function restoreSub(targetPid, actId, subId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const sub = act && (act.subactivities || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, deleted: false, deletedAt: '', deletedBy: '' } : s),
      }),
    }), sub ? `Subatividade restaurada em "${act.title}": ${sub.title}` : undefined, actId);
  }

  function reorderSub(targetPid, actId, fromId, toId) {
    if (!fromId || fromId === toId) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => {
        if (a.id !== actId) return a;
        const list = (a.subactivities || []).slice();
        const fromIdx = list.findIndex((s) => s.id === fromId);
        const toIdx = list.findIndex((s) => s.id === toId);
        if (fromIdx === -1 || toIdx === -1) return a;
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...a, subactivities: list };
      }),
    }), undefined, actId);
  }

  async function addAttachments(targetPid, actId, files) {
    for (const file of files || []) {
      const att = await readFileAsAttachment(file, MAX_ATTACHMENT_BYTES);
      if (!att) continue;
      const project = projects.find((p) => p.id === targetPid);
      const act = project && project.activities.find((a) => a.id === actId);
      mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: [...(a.attachments || []), att] }) }), `Anexo adicionado em "${act ? act.title : ''}": ${att.name}`, actId);
    }
  }

  function addAttachment(targetPid, actId, file) {
    if (file) addAttachments(targetPid, actId, [file]);
  }

  function removeAttachment(targetPid, actId, attId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const att = act && (act.attachments || []).find((x) => x.id === attId);
    const attIdx = act ? (act.attachments || []).findIndex((x) => x.id === attId) : -1;
    if (att) pushAppUndoToast(`Anexo "${att.name || 'arquivo'}" removido.`, () => undoReinsert(targetPid, actId, 'attachments', att, attIdx), 8000);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: (a.attachments || []).filter((x) => x.id !== attId) }) }), att ? `Anexo removido em "${act.title}": ${att.name}` : undefined, actId);
  }

  function addComment(targetPid, actId, text, mentionIds, attachments, links) {
    const v = (text || '').trim();
    const atts = attachments || [];
    const lks = links || [];
    // Comentário só de anexo/link (sem texto) é válido — pedido do
    // Rafael pra dar pra mandar só um print/PDF/link sem precisar
    // escrever nada junto.
    if (!v && !atts.length && !lks.length) return;
    const c = {
      id: uid('cm'), text: v, ts: new Date().toISOString(), author: currentUser ? currentUser.name : '', authorId: currentUser ? currentUser.id : '',
      mentions: mentionIds && mentionIds.length ? mentionIds : [], attachments: atts, links: lks,
    };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: [...(a.comments || []), c] }) }), `Comentário adicionado em "${act ? act.title : ''}"`, actId);
  }

  function removeComment(targetPid, actId, commentId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const cm = act && (act.comments || []).find((c) => c.id === commentId);
    const cmIdx = act ? (act.comments || []).findIndex((c) => c.id === commentId) : -1;
    if (cm) pushAppUndoToast('Comentário removido.', () => undoReinsert(targetPid, actId, 'comments', cm, cmIdx), 8000);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }) }), undefined, actId);
  }

  function updateComment(targetPid, actId, commentId, text) {
    const v = (text || '').trim();
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const cur = act && (act.comments || []).find((c) => c.id === commentId);
    if (!v && !(cur && ((cur.attachments || []).length || (cur.links || []).length))) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        comments: (a.comments || []).map((c) => c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c),
      }),
    }), undefined, actId);
  }

  function addLink(targetPid, actId, link) {
    if (!link || !link.url || !link.url.trim()) return;
    const url = /^https?:\/\//i.test(link.url.trim()) ? link.url.trim() : `https://${link.url.trim()}`;
    const l = { id: uid('lnk'), label: (link.label || '').trim() || url, url };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, links: [...(a.links || []), l] }) }), act ? `Link adicionado em "${act.title}": ${l.label}` : undefined, actId);
  }

  function removeLink(targetPid, actId, linkId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const l = act && (act.links || []).find((x) => x.id === linkId);
    const lIdx = act ? (act.links || []).findIndex((x) => x.id === linkId) : -1;
    if (l) pushAppUndoToast(`Link "${l.label}" removido.`, () => undoReinsert(targetPid, actId, 'links', l, lIdx), 8000);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, links: (a.links || []).filter((x) => x.id !== linkId) }) }), l ? `Link removido em "${act.title}": ${l.label}` : undefined, actId);
  }

  function toggleParticipant(targetPid, actId, name) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    if (!act) return;
    const has = (act.participants || []).includes(name);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : { ...a, participants: has ? (a.participants || []).filter((n) => n !== name) : [...(a.participants || []), name] }),
    }), `${has ? 'Participante removido' : 'Participante adicionado'} em "${act.title}": ${name}`, actId);
  }

  return {
    addActivity,
    addAttachment,
    addAttachments,
    addComment,
    addGroupWideActivity,
    addLink,
    addLog,
    addSub,
    deleteActivity,
    deleteSub,
    removeAttachment,
    removeComment,
    removeLink,
    reorderSub,
    restoreActivity,
    restoreSub,
    toggleParticipant,
    updateActivity,
    updateComment,
    updateSub,
  };
}
