// Ações das notificações (marcar como lida e abrir o destino de uma notificação).
// Extraído de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"). É uma FÁBRICA chamada a cada render: recebe o estado e as funções
// atuais do AppScreens e devolve as ações — o mesmo código de antes, em outro arquivo (as funções são recriadas a cada render, como sempre foram).
import { apiPatch, apiPost } from '../lib/api.js';
import { canOpenMode } from '../lib/routes.js';
import { notify } from '../ui/dialogs.jsx';

export function createNotificationActions({
  currentUser,
  goToWorkspace,
  openActivityDetail,
  openCompanyWorkspace,
  openMeetingDetail,
  projects,
  setNotifications,
  setPendingCrmOpen,
  setPendingModeloOpen,
  setPendingParecerOpen,
  setPendingTodoOpen,
  setPendingXflowOpen,
  setShowNotifications,
  setView,
  workspaceMode,
}) {
  async function markNotificationRead(id, read) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
    try { await apiPatch(`/api/notifications/${id}`, { read }); } catch (e) { /* próximo poll corrige */ }
  }
  async function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await apiPost('/api/notifications/read-all'); } catch (e) { /* próximo poll corrige */ }
  }
  async function markNotificationsReadForTarget(target) {
    try { await apiPost('/api/notifications/mark-read-for-target', target); } catch (e) { /* ignora */ }
    setNotifications((prev) => prev.map((n) => {
      const t = n.target || {};
      if (t.kind !== target.kind) return n;
      if (target.ticketId && t.ticketId !== target.ticketId) return n;
      if (target.activityId && t.activityId !== target.activityId) return n;
      return { ...n, read: true };
    }));
  }
  // Igual acima, mas só localmente — usado quando o servidor JÁ marcou
  // como lida como efeito colateral de outra rota (o POST .../view do
  // XFlow já faz isso no visualizar-TASK), então só falta refletir na tela
  // sem bater a rota de novo.
  function markTicketNotificationsReadLocally(ticketId) {
    setNotifications((prev) => prev.map((n) => (
      n.target && n.target.kind === 'xflow_ticket' && n.target.ticketId === ticketId ? { ...n, read: true } : n
    )));
  }
  // Clicar numa notificação leva pro lugar exato (regra do Rafael: abrir o
  // painel sozinho NÃO marca como lida — só isso aqui, que é o usuário de
  // fato acessando a ocorrência, ou o botão explícito "marcar como lida").
  // Toda notificação navega (Onda 5, §81): cada `target.kind` que o servidor cria tem caminho aqui — xflow_ticket, activity,
  // todo, crm_activity, parecer, modelo. Alvo que sumiu (atividade/reunião/tarefa excluída) ou módulo sem acesso avisa em
  // vez de deixar a tela em branco; notificação sem alvo vai ao módulo mais provável pelo prefixo do tipo.
  function goToNotificationTarget(n) {
    const t = (n && n.target) || {};
    setShowNotifications(false);
    const gone = () => notify('Este item não existe mais.', { tone: 'error' });
    const enter = (mode) => {
      if (!canOpenMode(mode, currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return false; }
      if (workspaceMode !== mode) goToWorkspace(mode);
      return true;
    };
    if (t.kind === 'xflow_ticket') {
      if (!enter('xflow')) return;
      setPendingXflowOpen(t.ticketId);
    } else if (t.kind === 'activity') {
      const pr = projects.find((x) => x.id === t.projectId);
      const ac = pr && (pr.activities || []).find((x) => x.id === t.activityId && !x.deleted);
      if (!ac) { gone(); return; }
      if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
      openCompanyWorkspace([t.projectId]);
      openActivityDetail(t.projectId, t.activityId);
    } else if (t.kind === 'todo') {
      const pr = projects.find((x) => x.id === t.projectId);
      const mt = pr && (pr.meetings || []).find((x) => x.id === t.meetingId && !x.deleted);
      const it = mt && (mt.actionItems || []).find((x) => x.id === t.itemId && !x.deleted);
      if (!it) { gone(); return; }
      if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
      markNotificationRead(n.id, true);
      openCompanyWorkspace([t.projectId]);
      setView('meetings');
      setPendingTodoOpen({ pid: t.projectId, meetingId: t.meetingId, itemId: t.itemId });
      openMeetingDetail(t.projectId, t.meetingId);
    } else if (t.kind === 'crm_activity') {
      if (!enter('crm')) return;
      markNotificationsReadForTarget({ kind: 'crm_activity', activityId: t.activityId });
      setPendingCrmOpen({ companyId: t.companyId, dealId: t.dealId || null });
    } else if (t.kind === 'parecer') {
      if (!enter('pareceres')) return;
      markNotificationRead(n.id, true);
      setPendingParecerOpen(t.id);
    } else if (t.kind === 'modelo') {
      if (!enter('modelos')) return;
      markNotificationRead(n.id, true);
      setPendingModeloOpen(t.id);
    } else {
      const prefix = String((n && n.type) || '').split('_')[0];
      const mode = { xflow: 'xflow', crm: 'crm', parecer: 'pareceres', modelo: 'modelos', activity: 'company', todo: 'company' }[prefix];
      if (n && n.id) markNotificationRead(n.id, true);
      if (mode) enter(mode);
      else notify('Esta notificação não aponta para um item específico.');
    }
  }

  return {
    goToNotificationTarget,
    markAllNotificationsRead,
    markNotificationRead,
    markNotificationsReadForTarget,
    markTicketNotificationsReadLocally,
  };
}
