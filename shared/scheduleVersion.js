// Versionamento do cronograma (2026-10-25, §83). Funções PURAS (sem banco, sem rede): usadas pelo servidor (comparar, restaurar, validar) e testadas à parte.
// "Cronograma" = activities (com subactivities), phases e team do documento da empresa. Reuniões, log, contatos e dados da empresa não entram na versão.

export const SCHEDULE_KEYS = ['activities', 'phases', 'team'];
// O que NÃO volta no tempo numa restauração: conteúdo de colaboração que outras pessoas acrescentaram depois (a versão antiga apagaria o trabalho delas).
export const PRESERVE_CURRENT = ['comments', 'attachments', 'links'];

const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const empty = (v) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
};
export const sameValue = (a, b) => (empty(a) && empty(b)) || stable(a) === stable(b);

export const scheduleOf = (data) => ({ activities: arr(data && data.activities), phases: arr(data && data.phases), team: arr(data && data.team) });

const liveActs = (s) => arr(s.activities).filter((a) => a && !a.deleted);
export function statsOf(snapshot) {
  const s = scheduleOf(snapshot);
  const acts = liveActs(s);
  const subs = acts.flatMap((a) => arr(a.subactivities).filter((x) => x && !x.deleted));
  return { activities: acts.length, subs: subs.length, done: subs.filter((x) => x.done).length };
}

const FIELD_LABELS = {
  title: 'Título', desc: 'Descrição', notes: 'Observações', transcript: 'Transcrição', date: 'Data', endDate: 'Data final', durationDays: 'Duração (dias)', status: 'Status', priority: 'Prioridade',
  responsible: 'Responsável', participants: 'Participantes', phase: 'Fase', month: 'Mês', required: 'Obrigatória', kind: 'Tipo', done: 'Concluída', pautaDe: 'Pauta da reunião',
  deleted: 'Na lixeira', deletedAt: 'Excluída em', deletedBy: 'Excluída por', comments: 'Comentários', attachments: 'Anexos', links: 'Links', clientDateConfirmed: 'Data confirmada pelo cliente',
  name: 'Nome', sub: 'Subtítulo', color: 'Cor', order: 'Ordem',
};
export const fieldLabel = (k) => FIELD_LABELS[k] || k;
const COUNT_FIELDS = new Set(['comments', 'attachments', 'links']);
const TEXT_LONG = new Set(['transcript']);
// Campos que mudam sozinhos e não contam como alteração de conteúdo.
const NOISE = new Set(['deletedAt', 'deletedBy', 'deletedReason']);

function fieldChanges(a, b, skip) {
  const out = [];
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  for (const k of keys) {
    if (skip.has(k) || NOISE.has(k)) continue;
    const x = a ? a[k] : undefined; const y = b ? b[k] : undefined;
    if (sameValue(x, y)) continue;
    if (COUNT_FIELDS.has(k)) out.push({ field: k, label: fieldLabel(k), before: arr(x).length, after: arr(y).length, kind: 'count' });
    else if (TEXT_LONG.has(k)) out.push({ field: k, label: fieldLabel(k), before: `${String(x || '').length} caracteres`, after: `${String(y || '').length} caracteres`, kind: 'text' });
    else out.push({ field: k, label: fieldLabel(k), before: empty(x) ? '' : x, after: empty(y) ? '' : y });
  }
  return out;
}

const subIndex = (acts) => {
  const m = new Map();
  for (const a of acts) for (const s of arr(a.subactivities)) if (s && s.id != null) m.set(s.id, { act: a, sub: s });
  return m;
};
const orderOf = (list, ids) => list.filter((x) => ids.has(x.id)).map((x) => x.id).join('|');

// Diferença entre dois estados do cronograma (`from` = antes, `to` = depois). Detalha atividade por atividade, campo a campo, com valor anterior e posterior.
export function diffSchedules(fromSnap, toSnap) {
  const A = scheduleOf(fromSnap); const B = scheduleOf(toSnap);
  const aById = new Map(A.activities.map((x) => [x.id, x])); const bById = new Map(B.activities.map((x) => [x.id, x]));
  const subsA = subIndex(A.activities); const subsB = subIndex(B.activities);
  const activities = [];
  const SKIP_ACT = new Set(['subactivities']);
  for (const b of B.activities) {
    const a = aById.get(b.id);
    if (!a) {
      const movedIn = arr(b.subactivities).filter((s) => subsA.has(s.id)).map((s) => ({ id: s.id, title: s.title || '', change: 'moved', fields: [], from: { id: subsA.get(s.id).act.id, title: subsA.get(s.id).act.title || '' } }));
      activities.push({ id: b.id, title: b.title || '', change: 'added', fields: [], subs: movedIn });
      continue;
    }
    const fields = fieldChanges(a, b, SKIP_ACT);
    const subs = [];
    for (const s of arr(b.subactivities)) {
      const prev = subsA.get(s.id);
      if (!prev) subs.push({ id: s.id, title: s.title || '', change: 'added', fields: [] });
      else {
        const f = fieldChanges(prev.sub, s, new Set());
        const moved = prev.act.id !== b.id;
        if (f.length || moved) subs.push({ id: s.id, title: s.title || '', change: moved ? 'moved' : 'changed', fields: f, from: moved ? { id: prev.act.id, title: prev.act.title || '' } : undefined });
      }
    }
    for (const s of arr(a.subactivities)) {
      const now = subsB.get(s.id);
      if (!now) subs.push({ id: s.id, title: s.title || '', change: 'removed', fields: [] });
    }
    if (fields.length || subs.length) activities.push({ id: b.id, title: b.title || '', change: 'changed', fields, subs });
  }
  for (const a of A.activities) if (!bById.has(a.id)) activities.push({ id: a.id, title: a.title || '', change: 'removed', fields: [], subs: [] });

  const pA = new Map(A.phases.map((p) => [p.id, p])); const pB = new Map(B.phases.map((p) => [p.id, p]));
  const phases = [];
  for (const [id, p] of pB) { const q = pA.get(id); if (!q) phases.push({ id, name: p.name || '', change: 'added', fields: [] }); else { const f = fieldChanges(q, p, new Set()); if (f.length) phases.push({ id, name: p.name || '', change: 'changed', fields: f }); } }
  for (const [id, p] of pA) if (!pB.has(id)) phases.push({ id, name: p.name || '', change: 'removed', fields: [] });

  const tk = (m) => (isObj(m) ? String(m.id || m.userId || m.name || stable(m)) : String(m));
  const tl = (m) => (isObj(m) ? String(m.name || m.id || '') : String(m));
  const tA = new Map(A.team.map((m) => [tk(m), tl(m)])); const tB = new Map(B.team.map((m) => [tk(m), tl(m)]));
  const team = { added: [...tB].filter(([k]) => !tA.has(k)).map(([, v]) => v), removed: [...tA].filter(([k]) => !tB.has(k)).map(([, v]) => v) };

  const common = new Set([...aById.keys()].filter((id) => bById.has(id)));
  const orderChanged = orderOf(A.activities, common) !== orderOf(B.activities, common);
  const count = (k) => activities.filter((x) => x.change === k).length;
  const subCount = (k) => activities.reduce((n, x) => n + x.subs.filter((s) => s.change === k).length, 0);
  const summary = {
    activitiesAdded: count('added'), activitiesRemoved: count('removed'), activitiesChanged: count('changed'),
    subsAdded: subCount('added'), subsRemoved: subCount('removed'), subsMoved: subCount('moved'), subsChanged: subCount('changed'),
    phasesChanged: phases.length, teamChanged: team.added.length + team.removed.length, orderChanged,
    fieldChanges: activities.reduce((n, x) => n + x.fields.length + x.subs.reduce((m, s) => m + s.fields.length, 0), 0),
  };
  summary.total = summary.activitiesAdded + summary.activitiesRemoved + summary.activitiesChanged + summary.subsAdded + summary.subsRemoved + summary.subsMoved + summary.subsChanged + summary.phasesChanged + summary.teamChanged + (orderChanged ? 1 : 0);
  return { summary, activities, phases, team };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Restauração. Nunca apaga de verdade: o que existe hoje e não existia na versão vai para a lixeira (volta de lá ou desfazendo a restauração); comentários, anexos e links
// de hoje são mantidos; fases e responsáveis que ainda são usados continuam existindo; vínculos de pauta são conferidos no fim.

const markDeleted = (x, by, now) => ({ ...x, deleted: true, deletedAt: now, deletedBy: by });
const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj && obj[k] !== undefined) o[k] = obj[k]; return o; };
const teamKey = (m) => (isObj(m) ? String(m.id || m.userId || m.name || stable(m)) : String(m));

function mergeSubs(snapSubs, curSubs, takenElsewhere, by, now, counters) {
  const curById = new Map(arr(curSubs).map((s) => [s.id, s]));
  const snapIds = new Set(arr(snapSubs).map((s) => s.id));
  const out = arr(snapSubs).map((s) => {
    const cur = curById.get(s.id);
    if (!cur) return s;
    const keep = pick(cur, PRESERVE_CURRENT);
    counters.preserved += Object.values(keep).reduce((n, v) => n + arr(v).length, 0);
    return { ...s, ...keep };
  });
  for (const s of arr(curSubs)) {
    if (snapIds.has(s.id) || takenElsewhere.has(s.id)) continue;
    if (s.deleted) { out.push(s); continue; }
    counters.subsToTrash += 1;
    out.push(markDeleted(s, by, now));
  }
  return out;
}

export function restoreSchedule(current, snapshot, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const by = opts.by || 'Restauração de versão';
  const cur = scheduleOf(current); const snap = scheduleOf(snapshot);
  const counters = { preserved: 0, subsToTrash: 0, actsToTrash: 0 };
  const errors = []; const warnings = []; const fixes = [];
  const only = Array.isArray(opts.activityIds) && opts.activityIds.length ? new Set(opts.activityIds) : null;
  const snapById = new Map(snap.activities.map((a) => [a.id, a])); const curById = new Map(cur.activities.map((a) => [a.id, a]));
  if (only) for (const id of only) if (!snapById.has(id)) errors.push(`A atividade ${id} não existe nesta versão.`);

  const scope = only ? snap.activities.filter((a) => only.has(a.id)) : snap.activities;
  const takenIds = new Set(scope.flatMap((a) => arr(a.subactivities).map((s) => s.id)));
  const mergeAct = (sa) => {
    const ca = curById.get(sa.id);
    const keep = ca ? pick(ca, PRESERVE_CURRENT) : {};
    counters.preserved += Object.values(keep).reduce((n, v) => n + arr(v).length, 0);
    return { ...sa, ...keep, subactivities: mergeSubs(sa.subactivities, ca ? ca.subactivities : [], takenIds, by, now, counters) };
  };

  let activities;
  if (!only) {
    activities = snap.activities.map(mergeAct);
    for (const ca of cur.activities) {
      if (snapById.has(ca.id)) continue;
      const subs = arr(ca.subactivities).filter((s) => !takenIds.has(s.id));
      if (ca.deleted) { activities.push({ ...ca, subactivities: subs }); continue; }
      counters.actsToTrash += 1;
      activities.push(markDeleted({ ...ca, subactivities: subs }, by, now));
    }
  } else {
    activities = cur.activities.map((ca) => {
      if (only.has(ca.id) && snapById.has(ca.id)) return mergeAct(snapById.get(ca.id));
      const subs = arr(ca.subactivities).filter((s) => !takenIds.has(s.id));
      return subs.length === arr(ca.subactivities).length ? ca : { ...ca, subactivities: subs };
    });
    for (const sa of scope) if (!curById.has(sa.id)) activities.push(mergeAct(sa));
  }

  // Fases: as da versão + as de hoje que algum item ainda usa (nada fica apontando para fase inexistente).
  const usedPhases = new Set(activities.map((a) => a.phase).filter((p) => p !== undefined && p !== null && p !== ''));
  let phases;
  if (!only) {
    const have = new Set(snap.phases.map((p) => p.id));
    phases = [...snap.phases, ...cur.phases.filter((p) => !have.has(p.id) && usedPhases.has(p.id))];
  } else {
    const have = new Set(cur.phases.map((p) => p.id));
    phases = [...cur.phases, ...snap.phases.filter((p) => !have.has(p.id) && usedPhases.has(p.id))];
  }
  // Equipe: união (quem era responsável não some). Na restauração parcial só entra quem a atividade restaurada cita.
  const team = [...(only ? cur.team : snap.team)];
  const haveTeam = new Set(team.map(teamKey));
  if (!only) for (const m of cur.team) if (!haveTeam.has(teamKey(m))) { team.push(m); haveTeam.add(teamKey(m)); }
  const names = (m) => (isObj(m) ? [m.name, m.id, m.userId].filter(Boolean) : [m]);
  const known = new Set(team.flatMap(names));
  for (const a of scope) for (const who of [a.responsible, ...arr(arr(a.subactivities).map((s) => s.responsible))]) {
    if (who && !known.has(who)) { const m = snap.team.find((t) => names(t).includes(who)) || cur.team.find((t) => names(t).includes(who)); if (m) { team.push(m); known.add(who); } }
  }

  const data = { ...current, activities, phases, team };
  const v = validateSchedule(data, { fix: true });
  errors.push(...v.errors); warnings.push(...v.warnings); fixes.push(...v.fixes);
  return {
    data: v.data,
    report: { errors, warnings, fixes, restoredActivities: scope.length, activitiesToTrash: counters.actsToTrash, subsToTrash: counters.subsToTrash, preservedCollaboration: counters.preserved, partial: !!only },
  };
}

// Confere a integridade dos vínculos. Com `fix`, corrige só o que é seguro (pauta apontando para reunião inexistente, como `unlinkPauta` já faz); o resto vira aviso/erro.
export function validateSchedule(data, { fix = false } = {}) {
  const errors = []; const warnings = []; const fixes = [];
  const acts = arr(data && data.activities);
  const seenAct = new Set(); const seenSub = new Set();
  for (const a of acts) {
    if (!a || a.id == null || a.id === '') { errors.push('Há uma atividade sem identificador.'); continue; }
    if (seenAct.has(a.id)) errors.push(`Atividade repetida: ${a.id}.`);
    seenAct.add(a.id);
    for (const s of arr(a.subactivities)) {
      if (!s || s.id == null || s.id === '') { errors.push(`Subatividade sem identificador em "${a.title || a.id}".`); continue; }
      if (seenSub.has(s.id)) errors.push(`Subatividade repetida: ${s.id}.`);
      seenSub.add(s.id);
    }
  }
  const phaseIds = new Set(arr(data && data.phases).map((p) => p.id));
  for (const a of acts) if (!a.deleted && a.phase !== undefined && a.phase !== null && a.phase !== '' && !phaseIds.has(a.phase)) warnings.push(`"${a.title || a.id}" usa uma fase que não existe (${a.phase}).`);
  const liveMeetings = new Set();
  for (const a of acts) if (!a.deleted) for (const s of arr(a.subactivities)) if (!s.deleted && s.kind === 'reuniao') liveMeetings.add(s.id);
  let next = acts;
  if (fix) {
    next = acts.map((a) => {
      if (!arr(a.subactivities).some((s) => s.pautaDe && !liveMeetings.has(s.pautaDe))) return a;
      return { ...a, subactivities: a.subactivities.map((s) => { if (s.pautaDe && !liveMeetings.has(s.pautaDe)) { fixes.push(`"${s.title || s.id}" saiu da pauta de uma reunião que não existe mais neste cronograma.`); return { ...s, pautaDe: '' }; } return s; }) };
    });
  } else {
    for (const a of acts) for (const s of arr(a.subactivities)) if (s.pautaDe && !liveMeetings.has(s.pautaDe)) warnings.push(`"${s.title || s.id}" aponta para uma reunião inexistente.`);
  }
  const live = new Set(next.filter((a) => !a.deleted).map((a) => a.id));
  let dangling = 0;
  for (const m of arr(data && data.meetings)) for (const it of arr(m && m.actionItems)) if (it && it.activityId && !live.has(it.activityId)) dangling += 1;
  if (dangling) warnings.push(`${dangling} tarefa(s) de reunião apontam para uma atividade que está na lixeira ou não existe.`);
  return { errors, warnings, fixes, data: fix ? { ...data, activities: next } : data };
}
