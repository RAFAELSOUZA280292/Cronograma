// Vínculo tarefa de reunião → atividade do cronograma (Fase 1 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md).
// Um <select> nativo (acessível, funciona no celular) agrupado por fase. `row.activityId` aponta a atividade; `row.activityLink.status`
// guarda 'confirmed' (alguém escolheu/confirmou) ou 'none' ("nenhuma atividade se aplica"). Atividade excluída vira "Atividade excluída".
import React from 'react';
import { Link2 } from 'lucide-react';

export const NO_ACTIVITY = '__none__';

export function buildActivityOptions(activities, phases) {
  const phaseName = new Map((phases || []).map((p) => [p.id, p.name]));
  return (activities || [])
    .filter((a) => a && !a.deleted && a.title)
    .map((a) => ({ id: a.id, title: a.title, phase: a.phase, phaseName: phaseName.get(a.phase) || 'Sem fase', date: a.date || '' }))
    .sort((x, y) => (x.phase === y.phase ? `${x.date}`.localeCompare(`${y.date}`) : (x.phase || 0) - (y.phase || 0)));
}

// Contagem por atividade: só tarefas vivas com `activityId`. "Abertas" = fora de concluída/não relevante (mesmo critério do quadro).
export function taskCountsByActivity(meetings) {
  const out = {};
  for (const m of meetings || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) {
      if (!it || it.deleted || !it.activityId) continue;
      const c = out[it.activityId] || (out[it.activityId] = { total: 0, open: 0 });
      c.total += 1;
      if (it.status !== 'concluida' && it.status !== 'nao-relevante') c.open += 1;
    }
  }
  return out;
}

export function linkState(row, options) {
  const id = row && row.activityId;
  if (id) {
    const found = (options || []).find((o) => o.id === id);
    return found ? { kind: 'linked', option: found } : { kind: 'orphan' };
  }
  if (row && row.activityLink && row.activityLink.status === 'none') return { kind: 'none' };
  return { kind: 'empty' };
}

export const ACTIVITY_LINK_CSS = `
  .alink { display:inline-flex; align-items:center; gap:5px; max-width:100%; }
  .alink select { width:auto; max-width:230px; font-size:11.5px; font-weight:600; padding:4px 6px; border-radius:7px; text-overflow:ellipsis; }
  .alink.linked select { color:var(--text-1); border-color:var(--border-3); background:var(--bg-3); }
  .alink.empty select, .alink.orphan select { color:var(--text-5); border-style:dashed; }
  .alink.orphan select { color:#e2574c; border-color:rgba(226,87,76,.5); }
  .alink svg { flex-shrink:0; color:var(--text-6); }
  @media (max-width: 767px) { .alink select { min-height:44px; max-width:100%; font-size:16px; } }
`;

export function ActivityLinkSelect({ row, options, onLink, labelled }) {
  const st = linkState(row, options);
  const value = st.kind === 'linked' ? row.activityId : st.kind === 'orphan' ? row.activityId : st.kind === 'none' ? NO_ACTIVITY : '';
  const groups = [];
  for (const o of options || []) {
    let g = groups[groups.length - 1];
    if (!g || g.name !== o.phaseName) { g = { name: o.phaseName, items: [] }; groups.push(g); }
    g.items.push(o);
  }
  return (
    <span className={`alink ${st.kind}`} onClick={(e) => e.stopPropagation()}>
      <Link2 size={12} aria-hidden="true" />
      <select
        aria-label={labelled || 'Atividade do cronograma desta tarefa'}
        title={st.kind === 'linked' ? `Atividade do cronograma: ${st.option.title}` : 'Vincular a uma atividade do cronograma'}
        value={value}
        onChange={(e) => onLink(e.target.value)}
      >
        <option value="">Vincular atividade…</option>
        {st.kind === 'orphan' && <option value={row.activityId}>Atividade excluída</option>}
        <option value={NO_ACTIVITY}>Nenhuma atividade se aplica</option>
        {groups.map((g) => (
          <optgroup key={g.name} label={g.name}>
            {g.items.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </optgroup>
        ))}
      </select>
    </span>
  );
}
