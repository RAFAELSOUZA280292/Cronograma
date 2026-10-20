// "Pauta da reunião" (2026-10-20, pedido do Rafael): um item de TRABALHO que será tratado numa reunião (subatividade do tipo Reunião da mesma atividade) fica vinculado a ela
// pelo campo `pautaDe` (id da subatividade-reunião) e acompanha a data da reunião. Funções puras, usadas pelas ações do app, pela Triagem e pela reserva de agenda.
const live = (a) => (Array.isArray(a) ? a.filter((x) => x && !x.deleted) : []);

// A reunião "de cima": a subatividade do tipo Reunião mais próxima ACIMA (na ordem da lista da atividade). Sem nenhuma acima, não há sugestão automática.
export function meetingAbove(subs, subId) {
  const list = live(subs);
  const i = list.findIndex((s) => s.id === subId);
  for (let k = i - 1; k >= 0; k -= 1) if (list[k].kind === 'reuniao') return list[k];
  return null;
}

export const pautaItems = (subs, meetingId) => live(subs).filter((s) => s.pautaDe === meetingId && !s.done);

// Depois de aplicar `patch` na subatividade `changedId`, mantém a pauta coerente:
//  - mudou a data da reunião -> os itens da pauta vão para a mesma data;
//  - a reunião deixou de ser Reunião -> a pauta é desvinculada (as datas ficam como estão);
//  - mudou a data de um item da pauta para um dia diferente da reunião -> ele se desvincula (a data manual vale).
export function reconcilePauta(subs, changedId, patch) {
  const list = Array.isArray(subs) ? subs : [];
  const me = list.find((s) => s.id === changedId);
  if (!me) return list;
  let out = list;
  if ('kind' in patch && me.kind !== 'reuniao') out = out.map((s) => (s.pautaDe === changedId ? { ...s, pautaDe: '' } : s));
  else if ('date' in patch) out = out.map((s) => (s.pautaDe === changedId && !s.deleted ? { ...s, date: me.date || '' } : s));
  if ('date' in patch && me.pautaDe && !('pautaDe' in patch)) {
    const mt = out.find((s) => s.id === me.pautaDe);
    if (!mt || (mt.date || '') !== (me.date || '')) out = out.map((s) => (s.id === changedId ? { ...s, pautaDe: '' } : s));
  }
  return out;
}

// Excluir a reunião desvincula a pauta.
export const unlinkPauta = (subs, meetingId) => (Array.isArray(subs) ? subs : []).map((s) => (s.pautaDe === meetingId ? { ...s, pautaDe: '' } : s));

// Patch para vincular um item de trabalho à reunião: guarda o vínculo e usa a data dela.
export const linkPatch = (meeting) => ({ pautaDe: meeting.id, ...(meeting.date ? { date: meeting.date } : {}) });
