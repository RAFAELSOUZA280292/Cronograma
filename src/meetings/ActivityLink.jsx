// Vínculo tarefa de reunião → atividade do cronograma (Fase 1 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md).
// Um <select> nativo (acessível, funciona no celular) agrupado por fase. `row.activityId` aponta a atividade; `row.activityLink.status`
// guarda 'confirmed' (alguém escolheu/confirmou) ou 'none' ("nenhuma atividade se aplica"). Atividade excluída vira "Atividade excluída".
import React, { useState } from 'react';
import { Link2, Sparkles, Check, X, AlertTriangle } from 'lucide-react';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { Modal } from '../ui/dialog.jsx';
import { countLinks, dateMismatch } from '../../shared/linkSync.js';

export const NO_ACTIVITY = '__none__';
export const HIGH_CONFIDENCE = 0.8; // mesmo limiar de server/taskLinkSuggest.js

export function buildActivityOptions(activities, phases) {
  const phaseName = new Map((phases || []).map((p) => [p.id, p.name]));
  return (activities || [])
    .filter((a) => a && !a.deleted && a.title)
    .map((a) => ({ id: a.id, title: a.title, phase: a.phase, phaseName: phaseName.get(a.phase) || 'Sem fase', date: a.date || '', endDate: a.endDate || a.date || '', status: a.status || '' }))
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
        auto: !!(it.activityLink && it.activityLink.status === 'auto'),
      });
    }
  }
  return out.sort((a, b) => (a.done - b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title));
}

export function linkState(row, options) {
  const id = row && row.activityId;
  if (id) {
    const found = (options || []).find((o) => o.id === id);
    if (!found) return { kind: 'orphan' };
    const l = row.activityLink;
    // `auto` = a RENATA vinculou sozinha e ninguém validou ainda (só vínculo validado propaga conclusão).
    if (l && l.status === 'auto') return { kind: 'auto', option: found, confidence: Number(l.confidence) || 0, reason: l.reason || '', source: l.source || '' };
    return { kind: 'linked', option: found };
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
    return (st.kind === 'suggested' || st.kind === 'auto') && st.confidence >= HIGH_CONFIDENCE;
  });
}

export const ACTIVITY_LINK_CSS = `
  .alink-ask { background:transparent; }
  .alink-bulk:disabled { opacity:.6; cursor:wait; }
  .alink-bulk { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--text-1); background:rgba(245,196,0,.12); border:1px solid var(--ui-accent, #F5C400); border-radius:999px; padding:5px 12px; cursor:pointer; }
  .alink-bulk:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .alink-bulk { min-height:44px; } }
  .alink-sug { display:inline-flex; align-items:center; gap:4px; max-width:100%; border:1px dashed var(--ui-accent, #F5C400); border-radius:8px; padding:2px 4px 2px 8px; background:rgba(245,196,0,.08); }
  .alink-sug.auto { border-style:solid; border-color:rgba(62,207,110,.65); background:rgba(62,207,110,.08); }
  .alink-sug-text { font-size:11.5px; font-weight:600; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
  .alink-sug button { display:inline-flex; align-items:center; justify-content:center; gap:3px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-3); border-radius:6px; font-size:11px; font-weight:700; padding:3px 7px; cursor:pointer; }
  .alink-sug button:hover { color:var(--text-1); border-color:var(--border-3); }
  .alink-sug button.ok { color:#3ecf6e; border-color:rgba(62,207,110,.5); }
  .alink-sug button:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .alink-sug { flex-wrap:wrap; } .alink-sug-text { max-width:100%; white-space:normal; } .alink-sug button { min-height:44px; min-width:44px; } }
  .alink-wrap { display:inline-flex; align-items:center; gap:5px; max-width:100%; flex-wrap:wrap; }
  .alink-warn { display:inline-flex; align-items:center; color:#e0a21a; cursor:help; }
  .alink-dlg-list { margin:8px 0 0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; }
  .alink-dlg-list li { display:flex; justify-content:space-between; gap:12px; font-size:13px; color:var(--text-2); }
  .alink-dlg-list b { color:var(--text-1); font-variant-numeric:tabular-nums; }
  .alink-dlg-note { font-size:12.5px; color:var(--text-3); margin:10px 0 0; line-height:1.5; }
  .alink-dlg-opt { display:flex; gap:8px; align-items:flex-start; font-size:13px; color:var(--text-2); margin-top:10px; line-height:1.45; cursor:pointer; }
  .alink-bulk.danger { border-color:rgba(226,87,76,.6); background:rgba(226,87,76,.1); }
  .alink { display:inline-flex; align-items:center; gap:5px; max-width:100%; }
  .alink select { width:auto; max-width:230px; font-size:11.5px; font-weight:600; padding:4px 6px; border-radius:7px; text-overflow:ellipsis; }
  .alink.linked select { color:var(--text-1); border-color:var(--border-3); background:var(--bg-3); }
  .alink.empty select, .alink.orphan select { color:var(--text-3); border-style:dashed; border-color:var(--ui-accent, #F5C400); }
  .alink.orphan select { color:#e2574c; border-color:rgba(226,87,76,.5); }
  .alink svg { flex-shrink:0; color:var(--text-6); }
  @media (max-width: 767px) { .alink select { min-height:44px; max-width:100%; font-size:16px; } }
`;

// Seletor + aviso de datas: só avisa quando a tarefa vence depois do fim da atividade vinculada; nunca muda data de nada.
export function ActivityLinkSelect(props) {
  const st = linkState(props.row, props.options);
  const warn = st.option && (st.kind === 'linked' || st.kind === 'auto') ? dateMismatch(props.row, st.option) : null;
  if (!warn) return <ActivityLinkSelectBase {...props} />;
  return (
    <span className="alink-wrap">
      <ActivityLinkSelectBase {...props} />
      <span className="alink-warn" role="img" aria-label={`Atenção: ${warn.text}`} title={`${warn.text} O cronograma não foi alterado.`}><AlertTriangle size={13} aria-hidden="true" /></span>
    </span>
  );
}

function ActivityLinkSelectBase({ row, options, onLink, labelled }) {
  const st = linkState(row, options);
  const [changing, setChanging] = useState(false);
  if (st.kind === 'auto' && !changing) {
    const pct = Math.round(st.confidence * 100);
    return (
      <span className="alink-sug auto" onClick={(e) => e.stopPropagation()}>
        <Sparkles size={12} aria-hidden="true" color="#3ecf6e" />
        <span className="alink-sug-text" title={st.reason || undefined}>Automática: {st.option.title}{pct ? ` · ${pct}%` : ''}</span>
        <button type="button" className="ok" onClick={() => onLink(st.option.id)} title={`Validar: ${st.option.title}`} aria-label={`Validar a vinculação automática com ${st.option.title}`}><Check size={12} aria-hidden="true" /> Validar</button>
        <button type="button" onClick={() => setChanging(true)} title="Escolher outra atividade" aria-label="Trocar a atividade vinculada automaticamente">Trocar</button>
        <button type="button" onClick={() => onLink('')} title="Desvincular: a tarefa fica sem atividade" aria-label="Desvincular a atividade automática"><X size={12} aria-hidden="true" /></button>
      </span>
    );
  }
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
  const value = st.kind === 'suggested' ? '' : st.kind === 'auto' ? row.activityId : st.kind === 'linked' ? row.activityId : st.kind === 'orphan' ? row.activityId : st.kind === 'none' ? NO_ACTIVITY : '';
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
    const ok = await askConfirm({ title: 'Validar vinculações', message: `Validar ${hi.length} vinculaç${hi.length === 1 ? 'ão' : 'ões'} de confiança alta (${Math.round(HIGH_CONFIDENCE * 100)}% ou mais)? Cada tarefa será vinculada à atividade sugerida; você pode trocar depois.`, confirmLabel: 'Confirmar todas' });
    if (!ok) return;
    hi.forEach((r) => onConfirmOne(r));
    notify(`${hi.length} tarefa${hi.length === 1 ? '' : 's'} vinculada${hi.length === 1 ? '' : 's'} à atividade do cronograma.`);
  }
  return (
    <button type="button" className="alink-bulk" onClick={run}><Sparkles size={12} aria-hidden="true" /> Validar {hi.length} vinculaç{hi.length === 1 ? 'ão' : 'ões'} de confiança alta</button>
  );
}

// Tarefa que ainda pede sugestão: sem vínculo, sem "nenhuma se aplica" e sem sugestão válida. Espelha `eligibleTasks` (server/taskLinks.js).
export function needsSuggestion(row, options) {
  if (!row || row.deleted || row.activityId || !row.title) return false;
  const st = linkState(row, options);
  return st.kind === 'empty' || st.kind === 'orphan';
}

// Modo automático: sugestões pendentes de 50% ou mais viram vínculo automático (a validar). Não mexe em quem já tem vínculo ou decisão.
export function promoteSuggestedToAuto(meetings, options, now = new Date().toISOString()) {
  const live = new Set((options || []).map((o) => o.id));
  let count = 0;
  const next = (meetings || []).map((m) => {
    if (!m || m.deleted) return m;
    let ch = false;
    const actionItems = (m.actionItems || []).map((it) => {
      const l = it && !it.deleted && !it.activityId && it.activityLink;
      if (!l || l.status !== 'suggested' || !live.has(l.suggestedId) || !(Number(l.confidence) >= AUTO_MIN_CONFIDENCE)) return it;
      ch = true; count += 1;
      return { ...it, activityId: l.suggestedId, activityLink: { ...l, status: 'auto', at: now } };
    });
    return ch ? { ...m, actionItems } : m;
  });
  return { meetings: next, count };
}

// Aplica as sugestões devolvidas pelo servidor às tarefas (nunca confirma; não toca em tarefa já vinculada/decidida).
export const AUTO_MIN_CONFIDENCE = 0.5; // mesmo limiar de server/taskLinkSuggest.js
export function applySuggestionsToMeetings(meetings, suggestions, { auto = false, now = new Date().toISOString() } = {}) {
  let count = 0;
  const next = (meetings || []).map((m) => {
    if (!m || m.deleted || !(m.actionItems || []).some((it) => suggestions[it.id])) return m;
    return {
      ...m,
      actionItems: m.actionItems.map((it) => {
        const s = suggestions[it.id];
        if (!s || it.activityId || (it.activityLink && (it.activityLink.status === 'confirmed' || it.activityLink.status === 'none'))) return it;
        count += 1;
        if (auto && Number(s.confidence) >= AUTO_MIN_CONFIDENCE) return { ...it, activityId: s.activityId, activityLink: { status: 'auto', suggestedId: s.activityId, confidence: s.confidence, reason: s.reason, source: s.source, at: now } };
        return { ...it, activityLink: { status: 'suggested', suggestedId: s.activityId, confidence: s.confidence, reason: s.reason, source: s.source } };
      }),
    };
  });
  return { meetings: next, count };
}

// Botões "Vincular / sugerir atividades" e "Zerar vínculos" da aba Tarefas das reuniões. Nada aqui muda atividade, data ou status do cronograma.
export function LinkToolsButtons({ rows, options, onSuggest, onReset }) {
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null); // 'link' | 'reset'
  const [mode, setMode] = useState('auto');
  const [withValidated, setWithValidated] = useState(false);
  const live = new Set((options || []).map((o) => o.id));
  const counts = countLinks(rows, live);
  const pending = counts.vazio + counts.sugerido; // sem vínculo + com sugestão pendente (no modo automático, a sugestão de 50% ou mais vira vínculo automático)
  const clearable = counts.auto + counts.sugerido + counts.orfao;
  const clearableAll = clearable + counts.validado + counts.nenhuma;
  const toClear = withValidated ? clearableAll : clearable;
  async function runLink() {
    setBusy(true);
    try { await onSuggest(mode); setDlg(null); } finally { setBusy(false); }
  }
  async function runReset() {
    setBusy(true);
    try { await onReset({ includeValidated: withValidated }); setDlg(null); } finally { setBusy(false); }
  }
  const row = (label, n) => <li><span>{label}</span><b>{n}</b></li>;
  return (
    <>
      <button type="button" className="alink-bulk alink-ask" disabled={busy || !pending} onClick={() => { setMode('auto'); setDlg('link'); }}
        title={pending ? 'A RENATA vincula (ou sugere) a atividade do cronograma das tarefas sem vínculo. Não altera o cronograma.' : 'Todas as tarefas já têm vínculo ou decisão.'}>
        <Sparkles size={12} aria-hidden="true" /> {busy && dlg !== 'reset' ? 'Pensando…' : `Vincular / sugerir atividades${pending ? ` (${pending})` : ''}`}
      </button>
      <button type="button" className="alink-bulk danger" disabled={busy || !clearableAll} onClick={() => { setWithValidated(false); setDlg('reset'); }}
        title={clearableAll ? 'Remove vínculos de tarefa com atividade. Não altera o cronograma.' : 'Nenhuma tarefa tem vínculo para zerar.'}>
        <X size={12} aria-hidden="true" /> Zerar vínculos
      </button>
      {dlg === 'link' && (
        <Modal title="Vincular / sugerir atividades" subtitle={`${counts.vazio} sem vínculo e ${counts.sugerido} com sugestão pendente`} onClose={() => setDlg(null)} busy={busy}
          footer={<><button type="button" className="alink-bulk" onClick={() => setDlg(null)} disabled={busy} title="Aguarde terminar">Cancelar</button><button type="button" className="alink-bulk alink-ask" onClick={runLink} disabled={busy} title="Aguarde: a RENATA está analisando">{busy ? 'Pensando…' : 'Executar'}</button></>}>
          <label className="alink-dlg-opt"><input type="radio" name="alink-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} /><span><b>Vincular automaticamente</b> (confiança de {Math.round(AUTO_MIN_CONFIDENCE * 100)}% ou mais). A tarefa fica ligada com o selo "Automática, a validar"; você valida ou troca. O que não chegar a {Math.round(AUTO_MIN_CONFIDENCE * 100)}% fica só como sugestão.</span></label>
          <label className="alink-dlg-opt"><input type="radio" name="alink-mode" checked={mode === 'suggest'} onChange={() => setMode('suggest')} /><span><b>Só sugerir</b>. Nada é ligado: aparece "Sugerido" e você confirma uma a uma.</span></label>
          <p className="alink-dlg-note">Só são usadas atividades que já existem nesta empresa; a RENATA nunca cria atividade. Tarefa sem encaixe fica com "Vincular atividade…". Tarefa ligada a atividade excluída não entra aqui: use "Zerar vínculos" antes. Datas, status e atividades do cronograma não são alterados; vínculo automático também não conclui nada em outro lugar até você validar.</p>
        </Modal>
      )}
      {dlg === 'reset' && (
        <Modal title="Zerar vínculos" subtitle="Tira o vínculo das tarefas com as atividades. O cronograma não muda." onClose={() => setDlg(null)} busy={busy}
          footer={<><button type="button" className="alink-bulk" onClick={() => setDlg(null)} disabled={busy} title="Aguarde terminar">Cancelar</button><button type="button" className="alink-bulk danger" onClick={runReset} disabled={busy || !toClear} title={toClear ? 'Zerar os vínculos escolhidos' : 'Nenhum vínculo selecionado'}>{busy ? 'Zerando…' : `Zerar ${toClear} vínculo${toClear === 1 ? '' : 's'}`}</button></>}>
          <ul className="alink-dlg-list">
            {row('Vinculadas automaticamente (a validar)', counts.auto)}
            {row('Com sugestão pendente', counts.sugerido)}
            {row('Ligadas a atividade que não existe mais', counts.orfao)}
            {row('Validadas por pessoa', counts.validado)}
            {row('Marcadas "nenhuma atividade se aplica"', counts.nenhuma)}
            {row('Sem vínculo (nada a fazer)', counts.vazio)}
          </ul>
          <label className="alink-dlg-opt"><input type="checkbox" checked={withValidated} onChange={(e) => setWithValidated(e.target.checked)} /><span>Zerar também as <b>validadas por pessoa</b> e as marcadas "nenhuma atividade se aplica" ({counts.validado + counts.nenhuma}). Sem marcar, elas ficam como estão.</span></label>
          <p className="alink-dlg-note">Só o vínculo da tarefa é removido. Status e prazos de tarefas e atividades ficam como estão. Dá para desfazer logo em seguida.</p>
        </Modal>
      )}
    </>
  );
}
