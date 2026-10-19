// Campos novos das subatividades (2026-10-19, fase 2 do plano do cronograma funcional): prioridade, executor, áreas envolvidas, aplicabilidade, recorrência,
// âncora do prazo, limite (data, tipo, fonte, conferência), predecessoras e código. Servem ao cronograma padrão versionado e a toda empresa criada a partir dele.
// Mostra uma linha de selos só do que estiver preenchido (nada muda para subatividades antigas) e um painel "Detalhes" para editar (equipe PRICETAX).
// Dados na própria subatividade (JSON do projeto): priority, executor, areas[], applicability, recurrence, anchor, limit{date,type,source,conf,checked}, predecessors[] (ids), code.
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react';
import { PRIORITY_META, fmtDate, todayISOStr, useDebouncedField } from '../App.jsx';

export const EXECUTORS = ['Cliente', 'ERP', 'PriceTax', 'Portal X'];
export const RECURRENCES = ['semanal', 'mensal', 'anual', 'por versão', 'contínuo'];
export const LIMIT_TYPES = ['lei', 'nota técnica', 'previsão', 'decisão de projeto'];
export const LIMIT_CONFS = ['conferido no texto da norma', 'fonte secundária', 'a verificar'];
export const ANCHORS = [['kickoff', 'Kickoff da empresa (dias depois)'], ['fixa', 'Data fixa']];
const PRIO_LABEL = { alta: 'P1', media: 'P2', baixa: 'P3' };
const PRIO_TEXT = { alta: 'P1 · Alta', media: 'P2 · Média', baixa: 'P3 · Baixa' };
const CONF_TONE = { 'conferido no texto da norma': 'ok', 'fonte secundária': 'warn', 'a verificar': 'bad' };

export const hasExtras = (s) => !!(s.priority || s.executor || (s.areas && s.areas.length) || s.applicability || s.recurrence || s.anchor || (s.limit && (s.limit.date || s.limit.type || s.limit.source)) || (s.predecessors && s.predecessors.length) || s.code);

export const SUB_EXTRAS_CSS = `
  .sx { padding:2px 0 0 34px; display:flex; flex-direction:column; gap:6px; max-width:720px; }
  .sx-chips { display:flex; flex-wrap:wrap; align-items:center; gap:5px; }
  .sx-chip { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; border-radius:999px; padding:1px 8px; border:1px solid var(--border-2); color:var(--text-3); white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
  .sx-chip.ok { color:#3ecf6e; border-color:rgba(62,207,110,.5); } .sx-chip.warn { color:#ff9f40; border-color:rgba(255,159,64,.5); }
  .sx-chip.bad { color:#e2574c; border-color:rgba(226,87,76,.5); } .sx-chip.info { color:#6aa9ff; border-color:rgba(62,166,255,.5); }
  .sx-toggle { background:none; border:0; padding:2px 4px; color:var(--text-4); font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px; }
  .sx-toggle:hover { color:var(--text-2); }
  .sx-panel { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px 10px; background:var(--bg-3); border:1px solid var(--border-1); border-radius:8px; padding:9px 10px; }
  .sx-f { display:flex; flex-direction:column; gap:3px; min-width:0; }
  .sx-f > span { font-size:10.5px; font-weight:700; color:var(--text-5); text-transform:uppercase; letter-spacing:.03em; }
  .sx-f input, .sx-f select { font-size:12px; padding:5px 7px; border-radius:6px; background:var(--bg-2); border:1px solid var(--border-2); color:var(--text-2); min-width:0; width:100%; box-sizing:border-box; }
  .sx-f input:focus, .sx-f select:focus { outline:none; border-color:#F5C400; }
  .sx-wide { grid-column:1 / -1; }
  .sx-hint { font-size:11px; color:var(--text-5); line-height:1.4; }
  .sx-pred { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
  .sx-pred button { background:none; border:0; padding:0 0 0 2px; color:inherit; cursor:pointer; display:inline-flex; }
  @media (max-width: 767px) { .sx { padding-left:0; } .sx-toggle { min-height:44px; } .sx-f input, .sx-f select { min-height:44px; font-size:16px; } .sx-pred button { min-width:32px; min-height:32px; align-items:center; justify-content:center; } }
`;

function Field({ label, children, wide }) { return <label className={`sx-f${wide ? ' sx-wide' : ''}`}><span>{label}</span>{children}</label>; }

function DebouncedInput({ value, onCommit, ...rest }) {
  const f = useDebouncedField(value || '', onCommit);
  return <input type="text" value={f.draft} onChange={(e) => f.onChange(e.target.value)} onBlur={f.flush} {...rest} />;
}

const predTitle = (all, id) => { const x = (all || []).find((o) => o.id === id); return x ? x.title || '(sem título)' : null; };

export function SubExtras({ s, pid, actId, allSubs, canEdit, updateSub }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => updateSub(pid, actId, s.id, patch);
  const lim = s.limit || {};
  const setLim = (patch) => set({ limit: { ...lim, ...patch } });
  const today = todayISOStr();
  const preds = (s.predecessors || []).filter(Boolean);
  const pending = preds.filter((id) => { const x = (allSubs || []).find((o) => o.id === id); return x && !x.done; });
  const overLimit = !!(s.date && lim.date && s.date > lim.date);
  const limitSoon = !!(lim.date && !s.done && lim.date <= today);
  const showChips = hasExtras(s);
  if (!showChips && !canEdit) return null;
  // Não oferece quem já depende (direta ou indiretamente) desta subatividade: evita ciclo de predecessoras.
  const dependsOnMe = (id, seen = new Set()) => { if (id === s.id) return true; if (seen.has(id)) return false; seen.add(id); const x = (allSubs || []).find((o) => o.id === id); return !!x && (x.predecessors || []).some((p) => dependsOnMe(p, seen)); };
  const candidates = (allSubs || []).filter((o) => o.id !== s.id && !preds.includes(o.id) && !dependsOnMe(o.id));

  return (
    <div className="sx">
      {showChips && (
        <div className="sx-chips">
          {s.code && <span className="sx-chip" title="Código do item no cronograma padrão">{s.code}</span>}
          {s.priority && <span className="sx-chip" title={PRIO_TEXT[s.priority]} style={{ color: PRIORITY_META[s.priority].color, borderColor: PRIORITY_META[s.priority].border }}>{PRIO_LABEL[s.priority]}</span>}
          {s.executor && <span className="sx-chip" title="Quem executa">{s.executor}</span>}
          {lim.date && <span className={`sx-chip ${overLimit || limitSoon ? 'bad' : (CONF_TONE[lim.conf] || '')}`} title={[lim.type && `Tipo: ${lim.type}`, lim.source, lim.conf && `Conferência: ${lim.conf}`, lim.checked && `Verificado em ${fmtDate(lim.checked)}`].filter(Boolean).join(' · ')}>Limite {fmtDate(lim.date)}{lim.type ? ` · ${lim.type}` : ''}</span>}
          {overLimit && <span className="sx-chip bad" title="O prazo desta atividade passa do limite da norma">Passa do limite</span>}
          {s.recurrence && <span className="sx-chip info" title="Atividade recorrente">{s.recurrence}</span>}
          {s.applicability && <span className="sx-chip info" title="Só vale quando se aplica">Se: {s.applicability}</span>}
          {s.anchor === 'fixa' && <span className="sx-chip" title="A data não muda com o kickoff da empresa">Data fixa</span>}
          {preds.map((id) => { const t = predTitle(allSubs, id); return <span key={id} className="sx-chip" title={t ? `Depende de: ${t}` : 'Predecessora que não existe mais'}>{t ? `Depende de: ${t.length > 28 ? `${t.slice(0, 28)}…` : t}` : 'Predecessora removida'}</span>; })}
          {!s.done && pending.length > 0 && <span className="sx-chip warn" title="Há predecessora ainda não concluída"><Lock size={10} aria-hidden="true" /> Aguarda {pending.length}</span>}
        </div>
      )}
      {canEdit && (
        <div>
          <button type="button" className="sx-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />} Detalhes</button>
        </div>
      )}
      {canEdit && open && (
        <div className="sx-panel">
          <Field label="Prioridade">
            <select value={s.priority || ''} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Sem prioridade</option>
              <option value="alta">P1 · trava emissão, cálculo, apuração ou obrigação legal</option>
              <option value="media">P2 · risco financeiro, contratual ou de crédito</option>
              <option value="baixa">P3 · melhoria ou preparação</option>
            </select>
          </Field>
          <Field label="Executor">
            <select value={s.executor || ''} onChange={(e) => set({ executor: e.target.value })}>
              <option value="">Não definido</option>
              {EXECUTORS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Áreas envolvidas">
            <DebouncedInput value={(s.areas || []).join(', ')} onCommit={(v) => set({ areas: v.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Fiscal, TI, Compras" />
          </Field>
          <Field label="Aplicável quando">
            <DebouncedInput value={s.applicability || ''} onCommit={(v) => set({ applicability: v })} placeholder="Vazio = todas as empresas" />
          </Field>
          <Field label="Recorrência">
            <select value={s.recurrence || ''} onChange={(e) => set({ recurrence: e.target.value })}>
              <option value="">Não recorrente</option>
              {RECURRENCES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="O prazo acompanha">
            <select value={s.anchor || ''} onChange={(e) => set({ anchor: e.target.value })}>
              <option value="">Não definido</option>
              {ANCHORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Código">
            <DebouncedInput value={s.code || ''} onCommit={(v) => set({ code: v })} placeholder="Ex.: B3.2" />
          </Field>
          <Field label="Limite da norma (data)">
            <input type="date" value={lim.date || ''} onChange={(e) => setLim({ date: e.target.value })} />
          </Field>
          <Field label="Tipo do limite">
            <select value={lim.type || ''} onChange={(e) => setLim({ type: e.target.value })}>
              <option value="">Não definido</option>
              {LIMIT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Conferência do limite">
            <select value={lim.conf || ''} onChange={(e) => setLim({ conf: e.target.value })}>
              <option value="">Não definida</option>
              {LIMIT_CONFS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Verificado em">
            <input type="date" value={lim.checked || ''} onChange={(e) => setLim({ checked: e.target.value })} />
          </Field>
          <Field label="Fonte do limite" wide>
            <DebouncedInput value={lim.source || ''} onCommit={(v) => setLim({ source: v })} placeholder="Artigo, Parecer ou nota técnica" />
          </Field>
          <Field label="Predecessoras (precisam terminar antes)" wide>
            <div className="sx-pred">
              {preds.map((id) => { const t = predTitle(allSubs, id); return <span key={id} className="sx-chip">{t || 'removida'}<button type="button" aria-label={`Remover a predecessora ${t || ''}`} title="Remover predecessora" onClick={() => set({ predecessors: preds.filter((x) => x !== id) })}><X size={11} aria-hidden="true" /></button></span>; })}
            </div>
            <select value="" onChange={(e) => { if (e.target.value) set({ predecessors: [...preds, e.target.value] }); }} aria-label="Adicionar predecessora">
              <option value="">Adicionar predecessora…</option>
              {candidates.map((o) => <option key={o.id} value={o.id}>{`${o.code ? `${o.code} · ` : ''}${(o.title || '').slice(0, 70)}${(o.title || '').length > 70 ? '…' : ''}`}</option>)}
            </select>
          </Field>
          {overLimit && <div className="sx-hint sx-wide">O prazo desta atividade ({fmtDate(s.date)}) passa do limite ({fmtDate(lim.date)}). Em empresa nova, vale o limite e a atividade nasce com o prazo marcado como comprimido.</div>}
        </div>
      )}
    </div>
  );
}
