// Cliente 360 (Onda 3, I1): alertas e sugestões do cliente, escritos por regra a partir do que o CRM e o cronograma JÁ calculam (sem IA, sem consulta nova).
// Uma função só, usada nos dois sentidos: a ficha da empresa no CRM e a tela da empresa no cronograma mostram a MESMA faixa. Puro (sem banco).
export const STALE_DAYS = 30;
export const STALLED_DAYS = 14;

const LEVEL = { atencao: 0, info: 1 };
const names = (list, max = 2) => {
  const t = list.map((d) => `“${String(d.title || 'Negócio').slice(0, 50)}”`);
  return t.length > max ? `${t.slice(0, max).join(', ')} e mais ${t.length - max}` : t.join(', ');
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const dayCount = (iso, today) => { const a = Date.parse(`${iso}T12:00:00Z`); const b = Date.parse(`${today}T12:00:00Z`); return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0; };

// `deals` = negócios da empresa (mapDeal), `kpis` = indicadores da ficha (getCompanyOverview), `projects` = resumos dos projetos vinculados (projectSummary).
export function clientAlerts({ relationship = '', deals = [], kpis = {}, projects = [], today } = {}) {
  const open = deals.filter((d) => d.status === 'open');
  const out = [];
  const add = (key, level, text, hint) => out.push({ key, level, text, hint: hint || '' });

  const late = open.filter((d) => d.nextActivityOverdue);
  if (late.length) add('step_late', 'atencao', `${plural(late.length, 'negócio com passo atrasado', 'negócios com passo atrasado')}: ${names(late)}.`, 'Conclua ou reagende a atividade atrasada.');
  const noStep = open.filter((d) => d.noNextStep && !d.nextActivityOverdue);
  if (noStep.length) add('no_step', 'atencao', `${plural(noStep.length, 'negócio sem próximo passo', 'negócios sem próximo passo')}: ${names(noStep)}.`, 'Agende o próximo passo para o negócio não esfriar.');
  const stalled = open.filter((d) => (d.daysInStage || 0) > STALLED_DAYS);
  if (stalled.length) add('stalled', 'atencao', `${plural(stalled.length, 'negócio parado', 'negócios parados')} há mais de ${STALLED_DAYS} dias na mesma etapa: ${names(stalled)}.`, 'Veja o que está travando a etapa ou mova o negócio.');
  const pastClose = open.filter((d) => d.overdue);
  if (pastClose.length) add('close_date', 'info', `${plural(pastClose.length, 'negócio com previsão de fechamento vencida', 'negócios com previsão de fechamento vencida')}: ${names(pastClose)}.`, 'Atualize a previsão de fechamento.');

  const days = kpis.daysSinceInteraction;
  if (open.length && days != null && days > STALE_DAYS) add('cold', 'atencao', `Sem interação há ${days} dias (nota, reunião ou atividade concluída).`, 'Registre um contato ou agende um follow-up.');
  if (open.length && days == null) add('cold', 'atencao', 'Nenhuma interação registrada com esta empresa.', 'Registre um contato ou agende um follow-up.');

  const lateActs = projects.reduce((n, p) => n + ((p.activities && p.activities.overdue) || 0), 0);
  if (lateActs) add('delivery_late', 'atencao', `${plural(lateActs, 'atividade do cronograma atrasada', 'atividades do cronograma atrasadas')}.`, 'Combine a nova data com o responsável.');
  const lateTodos = projects.reduce((n, p) => n + (p.overdueTodos || 0), 0);
  if (lateTodos) add('todo_late', 'atencao', `${plural(lateTodos, 'tarefa de reunião vencida', 'tarefas de reunião vencidas')}.`, 'Cobre o responsável ou reprograme.');
  if (today) {
    const lastDates = projects.map((p) => p.meetings && p.meetings.last && p.meetings.last.date).filter(Boolean).sort();
    const last = lastDates[lastDates.length - 1];
    const upcoming = projects.some((p) => p.meetings && p.meetings.next);
    if (projects.length && last && !upcoming && dayCount(last, today) > STALE_DAYS) add('no_meeting', 'info', `Última reunião há ${dayCount(last, today)} dias e nenhuma agendada.`, 'Marque a próxima reunião com o cliente.');
  }

  if (relationship === 'client' && open.length === 0) add('no_deal', 'info', 'Cliente sem nenhum negócio aberto.', 'Avalie uma oportunidade de ampliação (upsell).');

  return out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
}
