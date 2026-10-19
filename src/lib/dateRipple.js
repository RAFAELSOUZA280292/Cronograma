// Ajuste automático de datas (2026-10-19, pedido do Rafael: "se a caixinha estiver marcada e eu mudar o kickoff de 7 para 10, o fiscal que começava dia 8 vai para dia 11").
// Funções PURAS (sem React): `computeRipple` diz que campos de data mudam quando uma data é editada e `applyFieldChanges` aplica (ou desfaz) essa lista.
// Regra: ao mudar o INÍCIO de uma atividade (ou a data de uma subatividade), toda data do projeto que vem do mesmo dia em diante anda junto, pelo mesmo número de dias;
// ao mudar só o FIM, anda o que vem depois dele (estritamente). Não se movem: atividade concluída, atividade apagada, item com `dateLocked` (data travada),
// subatividade concluída ou de data fixa (`anchor: 'fixa'`). A atividade editada ignora a própria trava (a pessoa mexeu nela de propósito), mas as subatividades travadas dela seguem paradas.
const DAY = 86400000;
const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const add = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const actMovable = (a) => !!a && !a.deleted && a.status !== 'concluido' && !a.dateLocked;
export const subMovable = (a, s, editedActId) => !!s && !s.deleted && !s.done && !s.dateLocked && s.anchor !== 'fixa' && (a.id === editedActId ? !a.deleted : actMovable(a));

// change: { kind: 'activity' | 'sub', actId, subId?, patch }. Devolve null se não há o que propagar (sem data antes/depois, mesma data, atividade inexistente).
export function computeRipple(activities, change) {
  const acts = Array.isArray(activities) ? activities : [];
  const a = acts.find((x) => x && x.id === change.actId);
  if (!a) return null;
  const patch = change.patch || {};
  const changes = [];
  let pivot; let delta; let strict = false; let skipOwnStart = false; let skipOwnEnd = false; let skipSubId = null;
  if (change.kind === 'sub') {
    const s = (a.subactivities || []).find((x) => x && x.id === change.subId);
    if (!s || !ok(s.date) || !ok(patch.date)) return null;
    pivot = s.date; delta = diff(s.date, patch.date); skipSubId = s.id;
    changes.push({ actId: a.id, subId: s.id, field: 'date', from: s.date, to: patch.date, own: true });
  } else if (has(patch, 'date') && ok(a.date) && ok(patch.date)) {
    pivot = a.date; delta = diff(a.date, patch.date); skipOwnStart = true;
    changes.push({ actId: a.id, subId: null, field: 'date', from: a.date, to: patch.date, own: true });
    if (has(patch, 'endDate') && ok(patch.endDate) && patch.endDate !== a.endDate) { skipOwnEnd = true; changes.push({ actId: a.id, subId: null, field: 'endDate', from: a.endDate || '', to: patch.endDate, own: true }); }
    else if (has(patch, 'endDate')) skipOwnEnd = true;
  } else if (has(patch, 'endDate') && !has(patch, 'date') && ok(patch.endDate) && ok(a.endDate || a.date)) {
    const oldEnd = a.endDate || a.date;
    pivot = oldEnd; delta = diff(oldEnd, patch.endDate); strict = true; skipOwnEnd = true;
    changes.push({ actId: a.id, subId: null, field: 'endDate', from: a.endDate || '', to: patch.endDate, own: true });
  } else return null;
  if (!delta) return null;
  const inRange = (d) => ok(d) && (strict ? d > pivot : d >= pivot);
  const movedActs = new Set(); const movedSubs = new Set();
  for (const b of acts) {
    if (!b) continue;
    const isEdited = b.id === a.id;
    const actOk = isEdited ? !b.deleted : actMovable(b);
    if (actOk) {
      if (!(isEdited && skipOwnStart) && inRange(b.date)) { changes.push({ actId: b.id, subId: null, field: 'date', from: b.date, to: add(b.date, delta) }); if (!isEdited) movedActs.add(b.id); }
      if (!(isEdited && skipOwnEnd) && inRange(b.endDate)) { changes.push({ actId: b.id, subId: null, field: 'endDate', from: b.endDate, to: add(b.endDate, delta) }); if (!isEdited) movedActs.add(b.id); }
    }
    for (const s of b.subactivities || []) {
      if (!s || s.id === skipSubId || !subMovable(b, s, a.id) || !inRange(s.date)) continue;
      changes.push({ actId: b.id, subId: s.id, field: 'date', from: s.date, to: add(s.date, delta) }); movedSubs.add(s.id);
    }
  }
  // quantas subatividades passaram a ultrapassar o limite da norma por causa do ajuste
  let overLimit = 0;
  for (const c of changes) {
    if (!c.subId) continue;
    const b = acts.find((x) => x.id === c.actId); const s = b && (b.subactivities || []).find((x) => x.id === c.subId);
    const lim = s && s.limit && s.limit.date;
    if (lim && c.to > lim && !(c.from > lim)) overLimit += 1;
  }
  return { changes, delta, pivot, summary: { activities: movedActs.size, subs: movedSubs.size, overLimit, days: delta } };
}

// dir 'to': aplica as mudanças. dir 'from': desfaz, mas só o campo que ainda estiver com o valor aplicado (não pisa em edição posterior).
export function applyFieldChanges(activities, changes, dir = 'to') {
  const byAct = new Map();
  for (const c of changes) byAct.set(c.actId, [...(byAct.get(c.actId) || []), c]);
  return (activities || []).map((a) => {
    const list = byAct.get(a.id);
    if (!list) return a;
    let out = a;
    for (const c of list) {
      const target = dir === 'to' ? c.to : c.from;
      const expect = dir === 'to' ? null : c.to;
      if (c.subId) {
        out = { ...out, subactivities: (out.subactivities || []).map((s) => (s.id === c.subId && (expect === null || s[c.field] === expect) ? { ...s, [c.field]: target } : s)) };
      } else if (expect === null || out[c.field] === expect || (!out[c.field] && !expect)) out = { ...out, [c.field]: target };
    }
    return out;
  });
}

export const rippleText = (summary) => {
  const sign = summary.days > 0 ? '+' : '−'; const n = Math.abs(summary.days);
  const parts = [summary.activities && `${summary.activities} atividade${summary.activities === 1 ? '' : 's'}`, summary.subs && `${summary.subs} subatividade${summary.subs === 1 ? '' : 's'}`].filter(Boolean);
  return `Datas ajustadas (${sign}${n} dia${n === 1 ? '' : 's'}): ${parts.length ? `${parts.join(' e ')} acompanharam` : 'nada mais precisou mudar'}.${summary.overLimit ? ` ${summary.overLimit} ${summary.overLimit === 1 ? 'passa' : 'passam'} do limite da norma.` : ''}`;
};
