// Vínculo tarefa de reunião → atividade do cronograma (Fase 1 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md).
// Um <select> nativo (acessível, funciona no celular) agrupado por fase. `row.activityId` aponta a atividade; `row.activityLink.status`
// guarda 'confirmed' (alguém escolheu/confirmou) ou 'none' ("nenhuma atividade se aplica"). Atividade excluída vira "Atividade excluída".
import React, { useState } from 'react';
import { Link2, Sparkles, Check, X } from 'lucide-react';
import { askConfirm, notify } from '../ui/dialogs.jsx';

export const NO_ACTIVITY = '__none__';
export const HIGH_CONFIDENCE = 0.8; // mesmo limiar de server/taskLinkSuggest.js

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

// Tarefas vivas ligadas a uma atividade, para a lista do detalhe: abertas primeiro (prazo mais próximo antes; sem prazo por último), depois as encerradas.
export function linkedTasksForActivity(meetings, activityId) {
  const out = [];
  for (const m of meetings || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) {
      if (!it || it.deleted || it.activityId !== activityId) continue;
      out.push({
        id: it.id, meetingId: m.id, meetingTitle: m.title || '', meetingDate: m.date || '',
        title: it.title || '', status: it.status, responsible: it.responsible || '', dueDate: it.dueDate || '',
        done: it.status === 'concluida' || it.status === 'nao-relevante',
      });
    }
  }
  return out.sort((a, b) => (a.done - b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title));
}

export function linkState(row, options) {
  const id = row && row.activityId;
  if (id) {
    const found = (options || []).find((o) => o.id === id);
    return found ? { kind: 'linked', option: found } : { kind: 'orphan' };
  }
  if (row && row.activityLink && row.activityLink.status === 'none') return { kind: 'none' };
  const l = row && row.activityLink;
  if (l && l.status === 'suggested') {
    const sug = (options || []).find((o) => o.id === l.suggestedId);
    if (sug) return { kind: 'suggested', option: sug, confidence: Number(l.confidence) || 0, reason: l.reason || '', source: l.source || '' };
  }
  return { kind: 'empty' };
}

// Tarefas com sugestão de confiança alta e ainda sem vínculo (para o "confirmar todas").
export function highConfidenceRows(rows, options) {
  return (rows || []).filter((r) => {
    const st = linkState(r, options);
    return st.kind === 'suggested' && st.confidence >= HIGH_CONFIDENCE;
  });
}

export const ACTIVITY_LINK_CSS = `
  .alink-ask { background:transparent; }
  .alink-bulk:disabled { opacity:.6; cursor:wait; }
  .alink-bulk { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--text-1); background:rgba(245,196,0,.12); border:1px solid var(--ui-accent, #F5C400); border-radius:999px; padding:5px 12px; cursor:pointer; }
  .alink-bulk:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .alink-bulk { min-height:44px; } }
  .alink-sug { display:inline-flex; align-items:center; gap:4px; max-width:100%; border:1px dashed var(--ui-accent, #F5C400); border-radius:8px; padding:2px 4px 2px 8px; background:rgba(245,196,0,.08); }
  .alink-sug-text { font-size:11.5px; font-weight:600; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
  .alink-sug button { display:inline-flex; align-items:center; justify-content:center; gap:3px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-3); border-radius:6px; font-size:11px; font-weight:700; padding:3px 7px; cursor:pointer; }
  .alink-sug button:hover { color:var(--text-1); border-color:var(--border-3); }
  .alink-sug button.ok { color:#3ecf6e; border-color:rgba(62,207,110,.5); }
  .alink-sug button:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .alink-sug { flex-wrap:wrap; } .alink-sug-text { max-width:100%; white-space:normal; } .alink-sug button { min-height:44px; min-width:44px; } }
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
  const [changing, setChanging] = useState(false);
  if (st.kind === 'suggested' && !changing) {
    const pct = Math.round(st.confidence * 100);
    return (
      <span className="alink-sug" onClick={(e) => e.stopPropagation()}>
        <Sparkles size={12} aria-hidden="true" color="var(--ui-accent, #F5C400)" />
        <span className="alink-sug-text" title={st.reason || undefined}>Sugerido: {st.option.title}{pct ? ` · ${pct}%` : ''}</span>
        <button type="button" className="ok" onClick={() => onLink(st.option.id)} title={`Confirmar: ${st.option.title}`} aria-label={`Confirmar a atividade sugerida: ${st.option.title}`}><Check size={12} aria-hidden="true" /> Confirmar</button>
        <button type="button" onClick={() => setChanging(true)} title="Escolher outra atividade" aria-label="Trocar a atividade sugerida">Trocar</button>
        <button type="button" onClick={() => onLink(NO_ACTIVITY)} title="Nenhuma atividade do cronograma se aplica" aria-label="Nenhuma atividade se aplica"><X size={12} aria-hidden="true" /></button>
      </span>
    );
  }
  const value = st.kind === 'suggested' ? '' : st.kind === 'linked' ? row.activityId : st.kind === 'orphan' ? row.activityId : st.kind === 'none' ? NO_ACTIVITY : '';
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
        autoFocus={changing}
        onBlur={() => setChanging(false)}
        onChange={(e) => { setChanging(false); onLink(e.target.value); }}
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

// Botão "Confirmar todas as sugestões de confiança alta" (lista de tarefas da reunião e aba Tarefas).
export function ConfirmSuggestionsButton({ rows, options, onConfirmOne }) {
  const hi = highConfidenceRows(rows, options);
  if (!hi.length) return null;
  async function run() {
    const ok = await askConfirm({ title: 'Confirmar sugestões', message: `Confirmar ${hi.length} sugestão${hi.length === 1 ? '' : 'ões'} de confiança alta (${Math.round(HIGH_CONFIDENCE * 100)}% ou mais)? Cada tarefa será vinculada à atividade sugerida; você pode trocar depois.`, confirmLabel: 'Confirmar todas' });
    if (!ok) return;
    hi.forEach((r) => onConfirmOne(r));
    notify(`${hi.length} tarefa${hi.length === 1 ? '' : 's'} vinculada${hi.length === 1 ? '' : 's'} à atividade do cronograma.`);
  }
  return (
    <button type="button" className="alink-bulk" onClick={run}><Sparkles size={12} aria-hidden="true" /> Confirmar {hi.length} sugest{hi.length === 1 ? 'ão' : 'ões'} de confiança alta</button>
  );
}

// Tarefa que ainda pede sugestão: sem vínculo, sem "nenhuma se aplica" e sem sugestão válida. Espelha `eligibleTasks` (server/taskLinks.js).
export function needsSuggestion(row, options) {
  if (!row || row.deleted || row.activityId || !row.title) return false;
  const st = linkState(row, options);
  return st.kind === 'empty' || st.kind === 'orphan';
}

// Aplica as sugestões devolvidas pelo servidor às tarefas (nunca confirma; não toca em tarefa já vinculada/decidida).
export function applySuggestionsToMeetings(meetings, suggestions) {
  let count = 0;
  const next = (meetings || []).map((m) => {
    if (!m || m.deleted || !(m.actionItems || []).some((it) => suggestions[it.id])) return m;
    return {
      ...m,
      actionItems: m.actionItems.map((it) => {
        const s = suggestions[it.id];
        if (!s || it.activityId || (it.activityLink && (it.activityLink.status === 'confirmed' || it.activityLink.status === 'none'))) return it;
        count += 1;
        return { ...it, activityLink: { status: 'suggested', suggestedId: s.activityId, confidence: s.confidence, reason: s.reason, source: s.source } };
      }),
    };
  });
  return { meetings: next, count };
}

// "Sugerir atividades (N)": pede à RENATA a sugestão das tarefas pendentes de vínculo. Só sugere; a pessoa revisa e confirma.
export function SuggestLinksButton({ rows, options, onSuggest }) {
  const [busy, setBusy] = useState(false);
  const n = (rows || []).filter((r) => needsSuggestion(r, options)).length;
  if (!n && !busy) return null;
  async function run() {
    setBusy(true);
    try { await onSuggest(); } finally { setBusy(false); }
  }
  return (
    <button type="button" className="alink-bulk alink-ask" disabled={busy} onClick={run} title="A RENATA sugere a atividade do cronograma de cada tarefa sem vínculo. Nada é gravado sem você confirmar.">
      <Sparkles size={12} aria-hidden="true" /> {busy ? 'Pensando…' : `Sugerir atividades (${n})`}
    </button>
  );
}
