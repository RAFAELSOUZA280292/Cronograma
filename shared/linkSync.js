// Sincronia de conclusão entre tarefa de reunião e atividade do cronograma (2026-10-19, pedido do Rafael: "uma vez que está vinculado e validado pelo usuário, concluiu em um, mata em outro").
// Função PURA: recebe o projeto antes e depois de uma alteração e devolve o projeto com a conclusão propagada. Usada pelo painel (mutateProject, em src/App.jsx) e testada em Node.
// Regras:
//  1. Só vínculo VALIDADO propaga. Tarefa com selo `auto` (a RENATA vinculou, ninguém validou ainda) nunca é fechada nem fecha atividade.
//  2. Atividade que ACABOU de ser concluída → conclui as tarefas validadas dela que ainda estão abertas (marca `closedWith` para poder reabrir).
//  3. Tarefa que ACABOU de ser concluída (ou marcada "não relevante") → se TODAS as tarefas validadas da atividade estão encerradas E a atividade não tem subatividade aberta,
//     a atividade é concluída. Subatividade aberta bloqueia: a atividade não fecha por tarefa.
//  4. Reabrir é simétrico, mas só desfaz o que a própria sincronia fechou (`closedWith`): atividade reaberta reabre as tarefas que ela fechou; tarefa reaberta reabre a atividade
//     que as tarefas fecharam.
//  5. Nada é apagado e cada propagação devolve `undo` (o painel mostra "Desfazer").
const CLOSED = new Set(['concluida', 'nao-relevante']);
const live = (a) => (Array.isArray(a) ? a.filter((x) => x && !x.deleted) : []);

export const isClosedTask = (t) => !!t && CLOSED.has(t.status);
// Validado = alguém escolheu/confirmou (ou é vínculo antigo, sem selo). `auto` = a RENATA vinculou e ninguém validou.
export const isValidatedLink = (t) => !!t && !!t.activityId && !(t.activityLink && t.activityLink.status === 'auto');

export function syncLinkedStatus(prev, next, { now = new Date().toISOString() } = {}) {
  if (!prev || !next || prev === next) return { project: next, changed: false, messages: [], logs: [], undo: { tasks: [], activities: [] } };
  const prevAct = new Map(live(prev.activities).map((a) => [a.id, a]));
  const prevTask = new Map();
  for (const m of live(prev.meetings)) for (const it of live(m.actionItems)) prevTask.set(it.id, it);

  const meetings = (next.meetings || []).map((m) => ({ ...m, actionItems: (m.actionItems || []).map((it) => ({ ...it })) }));
  const activities = (next.activities || []).map((a) => ({ ...a }));
  const tasks = [];
  for (const m of meetings) { if (m.deleted) continue; for (const it of m.actionItems) if (!it.deleted) tasks.push({ m, it }); }
  const undo = { tasks: [], activities: [] };
  const messages = [];
  const logs = [];
  let changed = false;
  const saveTask = (m, it) => undo.tasks.push({ meetingId: m.id, itemId: it.id, status: it.status, closedWith: it.closedWith });
  const saveAct = (a) => undo.activities.push({ id: a.id, status: a.status, closedWith: a.closedWith });
  const touched = new Set(); // atividades cujo status a própria sincronia mexeu nesta passada

  // 2 e 4a) atividade concluída agora → fecha tarefas validadas; atividade reaberta agora → reabre as que ela fechou
  for (const a of activities) {
    if (a.deleted) continue;
    const pa = prevAct.get(a.id);
    if (!pa) continue;
    if (a.status === 'concluido' && pa.status !== 'concluido') {
      const open = tasks.filter(({ it }) => it.activityId === a.id && !isClosedTask(it));
      const validated = open.filter(({ it }) => isValidatedLink(it));
      for (const { m, it } of validated) { saveTask(m, it); it.closedWith = { by: 'activity', activityId: a.id, at: now, prevStatus: it.status }; it.status = 'concluida'; }
      if (validated.length) {
        changed = true;
        const autos = open.length - validated.length;
        messages.push(`Concluí também ${validated.length} ${validated.length === 1 ? 'tarefa vinculada' : 'tarefas vinculadas'} à atividade "${a.title}".${autos ? ` ${autos} ${autos === 1 ? 'tarefa automática ainda não validada segue aberta' : 'tarefas automáticas ainda não validadas seguem abertas'}.` : ''}`);
        logs.push(`Conclusão propagada: a atividade "${a.title}" foi concluída e ${validated.length} ${validated.length === 1 ? 'tarefa vinculada' : 'tarefas vinculadas'} foram concluídas junto`);
      } else if (open.length) {
        messages.push(`A atividade "${a.title}" tem ${open.length} ${open.length === 1 ? 'tarefa automática' : 'tarefas automáticas'} ainda não validada${open.length === 1 ? '' : 's'}; não mexi nelas.`);
      }
    } else if (a.status !== 'concluido' && pa.status === 'concluido') {
      const reopen = tasks.filter(({ it }) => it.closedWith && it.closedWith.by === 'activity' && it.closedWith.activityId === a.id && it.status === 'concluida');
      for (const { m, it } of reopen) { saveTask(m, it); it.status = it.closedWith.prevStatus || 'nao-iniciado'; delete it.closedWith; }
      if (a.closedWith) { delete a.closedWith; changed = true; }
      if (reopen.length) {
        changed = true;
        messages.push(`Reabri ${reopen.length} ${reopen.length === 1 ? 'tarefa' : 'tarefas'} que tinha${reopen.length === 1 ? '' : 'm'} sido concluída${reopen.length === 1 ? '' : 's'} junto com a atividade "${a.title}".`);
        logs.push(`Conclusão desfeita: a atividade "${a.title}" foi reaberta e ${reopen.length} ${reopen.length === 1 ? 'tarefa foi reaberta' : 'tarefas foram reabertas'}`);
      }
    }
  }

  // 3 e 4b) tarefa encerrada agora → talvez conclua a atividade; tarefa reaberta agora → reabre a atividade que as tarefas fecharam
  const newlyClosed = new Set();
  const newlyOpened = new Set();
  for (const { it } of tasks) {
    const pt = prevTask.get(it.id);
    if (!pt) continue;
    if (isClosedTask(it) && !isClosedTask(pt) && !(it.closedWith && it.closedWith.at === now)) { if (isValidatedLink(it)) newlyClosed.add(it.activityId); }
    if (!isClosedTask(it) && isClosedTask(pt)) { if (it.closedWith) delete it.closedWith; if (isValidatedLink(it)) newlyOpened.add(it.activityId); }
  }
  for (const id of newlyClosed) {
    const a = activities.find((x) => x.id === id);
    if (!a || a.deleted || a.status === 'concluido') continue;
    const mine = tasks.filter(({ it }) => isValidatedLink(it) && it.activityId === id);
    const subsOpen = live(a.subactivities).some((s) => !s.done);
    if (mine.length && mine.every(({ it }) => isClosedTask(it)) && !subsOpen) {
      saveAct(a); a.closedWith = { by: 'tasks', at: now, prevStatus: a.status }; a.status = 'concluido'; touched.add(id); changed = true;
      messages.push(`Todas as tarefas vinculadas estavam encerradas: concluí a atividade "${a.title}".`);
      logs.push(`Conclusão propagada: todas as tarefas vinculadas à atividade "${a.title}" foram encerradas e a atividade foi concluída`);
    }
  }
  for (const id of newlyOpened) {
    const a = activities.find((x) => x.id === id);
    if (!a || a.deleted || touched.has(id) || a.status !== 'concluido' || !a.closedWith || a.closedWith.by !== 'tasks') continue;
    saveAct(a); a.status = a.closedWith.prevStatus || 'em-andamento'; delete a.closedWith; changed = true;
    messages.push(`Reabri a atividade "${a.title}", que tinha sido concluída pelas tarefas vinculadas.`);
    logs.push(`Conclusão desfeita: uma tarefa vinculada foi reaberta e a atividade "${a.title}" foi reaberta`);
  }
  // tarefa tocada pelo usuário pode ter tido o `closedWith` limpo acima; isso também conta como alteração
  if (!changed) {
    const before = JSON.stringify(live(next.meetings).flatMap((m) => live(m.actionItems).map((it) => it.closedWith || null)));
    const after = JSON.stringify(meetings.filter((m) => !m.deleted).flatMap((m) => m.actionItems.filter((it) => !it.deleted).map((it) => it.closedWith || null)));
    if (before !== after) changed = true;
  }
  if (!changed) return { project: next, changed: false, messages: [], logs: [], undo: { tasks: [], activities: [] } };
  return { project: { ...next, meetings, activities }, changed: true, messages, logs, undo };
}

// Desfaz uma propagação (botão "Desfazer"). Não passa pela sincronia de novo: quem chama usa `skipSync`.
export function revertLinkedSync(project, undo) {
  if (!project || !undo) return project;
  const byTask = new Map((undo.tasks || []).map((u) => [`${u.meetingId}|${u.itemId}`, u]));
  const byAct = new Map((undo.activities || []).map((u) => [u.id, u]));
  const meetings = (project.meetings || []).map((m) => ({
    ...m,
    actionItems: (m.actionItems || []).map((it) => {
      const u = byTask.get(`${m.id}|${it.id}`);
      if (!u) return it;
      const out = { ...it, status: u.status };
      if (u.closedWith) out.closedWith = u.closedWith; else delete out.closedWith;
      return out;
    }),
  }));
  const activities = (project.activities || []).map((a) => {
    const u = byAct.get(a.id);
    if (!u) return a;
    const out = { ...a, status: u.status };
    if (u.closedWith) out.closedWith = u.closedWith; else delete out.closedWith;
    return out;
  });
  return { ...project, meetings, activities };
}
