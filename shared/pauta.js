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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Pauta entre atividades (2026-10-20): a reunião pode receber itens de trabalho de OUTRAS atividades ("outros squads"). `pautaDe` guarda o id da subatividade-reunião
// (único no projeto); as funções abaixo trabalham sobre a lista de atividades inteira.
const mapSubs = (acts, fn) => (acts || []).map((a) => (Array.isArray(a.subactivities) && a.subactivities.length ? { ...a, subactivities: a.subactivities.map(fn) } : a));

export function findSub(acts, subId) {
  for (const a of acts || []) {
    if (a.deleted) continue;
    const s = (a.subactivities || []).find((x) => x.id === subId && !x.deleted);
    if (s) return { act: a, sub: s };
  }
  return null;
}

// Versão por projeto de `reconcilePauta`: `acts` já tem o `patch` aplicado em `changedId`.
export function reconcilePautaProject(acts, changedId, patch) {
  const hit = findSub(acts, changedId);
  if (!hit) return acts;
  const me = hit.sub;
  let out = acts;
  if ('kind' in patch && me.kind !== 'reuniao') out = mapSubs(out, (s) => (s.pautaDe === changedId ? { ...s, pautaDe: '' } : s));
  else if ('date' in patch) out = mapSubs(out, (s) => (s.pautaDe === changedId && !s.deleted ? { ...s, date: me.date || '' } : s));
  if ('date' in patch && me.pautaDe && !('pautaDe' in patch)) {
    const mt = findSub(out, me.pautaDe);
    if (!mt || (mt.sub.date || '') !== (me.date || '')) out = mapSubs(out, (s) => (s.id === changedId ? { ...s, pautaDe: '' } : s));
  }
  return out;
}

export const unlinkPautaProject = (acts, meetingId) => mapSubs(acts, (s) => (s.pautaDe === meetingId ? { ...s, pautaDe: '' } : s));

// Itens que um vínculo em lote pode pegar: abertos, de trabalho, ainda não ligados a esta reunião e que não sejam a própria reunião.
export function linkableItems(acts, meetingId) {
  const out = [];
  for (const a of acts || []) {
    if (a.deleted) continue;
    for (const s of a.subactivities || []) {
      if (s.deleted || s.done || s.kind === 'reuniao' || s.id === meetingId || s.pautaDe === meetingId) continue;
      out.push({ actId: a.id, actTitle: a.title || '', subId: s.id, title: s.title || '', date: s.date || '', pautaDe: s.pautaDe || '' });
    }
  }
  return out;
}

// Aplica o vínculo em lote. Devolve { activities, changed }, onde `changed` guarda o estado anterior de cada item (para desfazer).
export function linkPautaItems(acts, meetingId, items) {
  const hit = findSub(acts, meetingId);
  if (!hit || hit.sub.kind !== 'reuniao') return { activities: acts, changed: [] };
  const date = hit.sub.date || '';
  const want = new Set(items.map((i) => i.subId));
  const changed = [];
  const activities = mapSubs(acts, (s) => {
    if (!want.has(s.id) || s.deleted || s.done || s.kind === 'reuniao' || s.id === meetingId) return s;
    if (s.pautaDe === meetingId && (!date || s.date === date)) return s;
    changed.push({ subId: s.id, prev: { pautaDe: s.pautaDe || '', date: s.date || '' } });
    return { ...s, pautaDe: meetingId, ...(date ? { date } : {}) };
  });
  return { activities, changed };
}

export function revertPautaItems(acts, changed) {
  const by = new Map((changed || []).map((c) => [c.subId, c.prev]));
  return mapSubs(acts, (s) => (by.has(s.id) ? { ...s, ...by.get(s.id) } : s));
}

// Títulos da pauta de uma reunião (de qualquer atividade); item de outra atividade leva o nome dela na frente.
export function pautaTitles(acts, meetingActId, meetingId) {
  const out = [];
  for (const a of acts || []) {
    if (a.deleted) continue;
    for (const s of a.subactivities || []) if (!s.deleted && !s.done && s.pautaDe === meetingId) out.push(a.id === meetingActId ? (s.title || '') : `${a.title || ''}: ${s.title || ''}`);
  }
  return out;
}

// Move uma subatividade na lista da atividade: 'top' | 'up' | 'down' | 'bottom'.
export function moveSubIn(subs, subId, where) {
  const list = (Array.isArray(subs) ? subs : []).slice();
  const i = list.findIndex((s) => s.id === subId);
  if (i < 0) return list;
  const [x] = list.splice(i, 1);
  const to = where === 'top' ? 0 : where === 'bottom' ? list.length : where === 'up' ? Math.max(0, i - 1) : Math.min(list.length, i + 1);
  list.splice(to, 0, x);
  return list;
}
