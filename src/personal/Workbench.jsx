// Painel "Calendário, anotações e atalhos" da Gestão de Atividades (2026-10-16, visões 5 e 6 do pedido do Rafael; inspirado no mockup "Mesa de
// Trabalho"). Faixa RECOLHÍVEL (começa recolhida; a escolha fica neste navegador) com três blocos independentes:
//  • Calendário do mês — pontos nos dias com prazo de atividade (nunca concluída), atrasadas e compromissos da Agenda (só o que NÃO foi recusado);
//  • Anotações rápidas — um bloco de notas da pessoa (mesmo editor do cartão) com "Transformar em atividade";
//  • Links e atalhos — grade de endereços da pessoa (só http/https, abrem em nova aba).
// Anotações e atalhos vão para /api/personal-extras (preferências da PESSOA), nunca para o quadro, que pode ter link público.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, StickyNote, Link2, Plus, Pencil, X, ListPlus } from 'lucide-react';
import { apiGet, apiPut } from '../lib/api.js';
import { notify } from '../ui/dialogs.jsx';
import { noteToPlain } from '../lib/richNote.js';
import { lazyRetry } from '../lib/lazyRetry.jsx';
import { liveCards } from './DaySummary.jsx';
import { monthGrid, buildDayMap, eventTime, splitNote, cleanUrl } from './workbenchUtils.js';

const RichNote = lazyRetry(() => import('../ui/RichNote.jsx'));
const PREF_KEY = 'pricetax-pb-tools-v1';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_SHORTCUTS = 24;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fmtBr = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const longDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${WEEKDAYS[dt.getDay()]}, ${d} de ${MONTHS[m - 1]}`; };

const CSS = `
  .wb { margin:0 0 12px; font-family:'Inter', sans-serif; }
  .wb-head { display:flex; align-items:center; gap:10px; width:100%; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:9px 14px; cursor:pointer; color:inherit; font:inherit; text-align:left; }
  .wb-head:hover { border-color:var(--border-3); }
  .wb-head:focus-visible, .wb-day:focus-visible, .wb-btn:focus-visible, .wb-nav:focus-visible, .wb-item:focus-visible, .wb-ev:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .wb-title { font-size:13.5px; font-weight:800; color:var(--text-1); }
  .wb-mini { font-size:12px; color:var(--text-4); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wb-chev { margin-left:auto; flex-shrink:0; transition:transform .15s ease; color:var(--text-5); }
  .wb.collapsed .wb-chev { transform:rotate(-90deg); }
  @media (prefers-reduced-motion: reduce) { .wb-chev { transition:none; } }
  .wb-grid { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr); gap:10px; margin-top:8px; align-items:start; }
  .wb-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:12px 14px; min-width:0; }
  .wb-card h3 { display:flex; align-items:center; gap:7px; margin:0 0 8px; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-4); }
  .wb-cal-top { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
  .wb-cal-top b { flex:1; font-size:13px; color:var(--text-1); }
  .wb-nav { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-3); border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; font-family:inherit; }
  .wb-nav.txt { width:auto; padding:0 9px; }
  .wb-nav:hover { color:var(--text-1); border-color:var(--border-3); }
  .wb-wk, .wb-days { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:2px; }
  .wb-wk span { text-align:center; font-size:10px; font-weight:700; color:var(--text-5); padding:2px 0; }
  .wb-day { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 0 3px; min-height:40px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--text-2); cursor:pointer; font:inherit; font-size:12px; font-variant-numeric:tabular-nums; }
  .wb-day.out { color:var(--text-6); }
  .wb-day:hover { background:var(--bg-3); }
  .wb-day.today { border-color:var(--ui-accent, #F5C400); font-weight:800; color:var(--text-1); }
  .wb-day.sel { background:var(--bg-4); border-color:var(--border-3); }
  .wb-dots { display:flex; gap:2px; min-height:7px; }
  .wb-dot { width:6px; height:6px; border-radius:50%; }
  .wb-dot.due { background:#F5C400; } .wb-dot.late { background:#e2574c; } .wb-dot.ev { background:#9b7af5; border-radius:2px; transform:rotate(45deg); }
  .wb-legend { display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:6px; font-size:10.5px; color:var(--text-5); }
  .wb-legend i { display:inline-block; vertical-align:middle; margin-right:4px; }
  .wb-sel { margin-top:8px; border-top:1px solid var(--border-1); padding-top:8px; }
  .wb-sel-h { font-size:12px; font-weight:800; color:var(--text-1); margin-bottom:4px; }
  .wb-item, .wb-ev { display:flex; align-items:flex-start; gap:8px; width:100%; background:transparent; border:0; border-top:1px solid var(--border-1); padding:6px 2px; text-align:left; color:inherit; font:inherit; }
  .wb-item { cursor:pointer; } .wb-item:hover { background:var(--bg-3); }
  .wb-item:first-of-type, .wb-ev:first-of-type { border-top:0; }
  .wb-t { display:block; font-size:12.5px; font-weight:700; color:var(--text-1); overflow-wrap:anywhere; }
  .wb-m { display:block; font-size:11px; color:var(--text-4); }
  .wb-late { color:#e2574c; font-weight:700; }
  .wb-none { font-size:12.5px; color:var(--text-5); }
  .wb-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .wb-st { font-size:11px; color:var(--text-5); }
  .wb-btn { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-2); cursor:pointer; font-family:inherit; }
  .wb-btn:hover:not(:disabled) { color:var(--text-1); border-color:var(--border-3); }
  .wb-btn:disabled { opacity:.5; cursor:default; }
  .wb-btn.pri { background:var(--ui-accent, #F5C400); border-color:var(--ui-accent, #F5C400); color:#17171f; }
  .wb-sc { display:flex; flex-wrap:wrap; gap:6px; }
  .wb-chip { display:inline-flex; align-items:center; border:1px solid var(--border-2); background:var(--bg-3); border-radius:999px; overflow:hidden; max-width:100%; }
  .wb-chip a { padding:5px 10px; font-size:12px; font-weight:700; color:var(--text-2); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:170px; }
  .wb-chip a:hover { color:var(--text-1); text-decoration:underline; }
  .wb-chip button { border:0; border-left:1px solid var(--border-2); background:transparent; color:var(--text-5); cursor:pointer; padding:5px 7px; display:inline-flex; }
  .wb-chip button:hover { color:var(--text-1); }
  .wb-chip button:focus-visible, .wb-chip a:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:-2px; }
  .wb-form { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .wb-form input { width:100%; font-size:13px; }
  .wb-err { font-size:11.5px; color:#e2574c; }
  .wb-note-ph { min-height:90px; border:1px solid var(--border-2); border-radius:10px; background:var(--bg-2); }
  @media (max-width: 900px) { .wb-grid { grid-template-columns:1fr; } .wb-head { min-height:44px; } .wb-day { min-height:44px; } .wb-nav { width:44px; height:44px; } .wb-nav.txt { width:auto; } .wb-btn, .wb-item { min-height:44px; } .wb-chip a, .wb-chip button { min-height:44px; display:inline-flex; align-items:center; } .wb-form input { min-height:44px; font-size:16px; } }
`;

function readPref() {
  try { return window.localStorage.getItem(PREF_KEY) === '1'; } catch (e) { return false; }
}

export default function Workbench({ boards, todayIso, onOpenCard, onCreateCard, readOnly }) {
  const [open, setOpen] = useState(readPref);
  const items = useMemo(() => liveCards(boards), [boards]);
  const dueSoon = useMemo(() => items.filter(({ card }) => !card.completed && card.dueDate && card.dueDate >= todayIso && card.dueDate.slice(0, 7) === todayIso.slice(0, 7)).length, [items, todayIso]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(PREF_KEY, next ? '1' : '0'); } catch (e) { /* ignora */ }
  }
  const mini = `${dueSoon ? `${dueSoon} prazo${dueSoon === 1 ? '' : 's'} neste mês · ` : ''}calendário, anotações e atalhos`;

  return (
    <section className={`wb${open ? '' : ' collapsed'}`} aria-label="Calendário, anotações e atalhos">
      <style>{CSS}</style>
      <button type="button" className="wb-head" onClick={toggle} aria-expanded={open} aria-controls="wb-body">
        <span className="wb-title">Calendário, anotações e atalhos</span>
        {!open && <span className="wb-mini">{mini}</span>}
        <ChevronDown size={16} className="wb-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="wb-grid" id="wb-body">
          <CalendarCard items={items} todayIso={todayIso} onOpenCard={onOpenCard} />
          <NotesCard readOnly={readOnly} onCreateCard={onCreateCard} />
          <ShortcutsCard readOnly={readOnly} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Calendário
function CalendarCard({ items, todayIso, onOpenCard }) {
  const [ty, tm] = todayIso.split('-').map(Number);
  const [view, setView] = useState({ y: ty, m: tm - 1 });
  const [sel, setSel] = useState(todayIso);
  const [events, setEvents] = useState([]);
  const grid = useMemo(() => monthGrid(view.y, view.m), [view]);
  const first = grid[0].iso; const last = grid[41].iso;

  useEffect(() => {
    let alive = true;
    const start = new Date(`${first}T00:00:00`).toISOString();
    const end = new Date(`${last}T23:59:59`).toISOString();
    apiGet(`/api/agenda?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then((r) => { if (alive) setEvents(Array.isArray(r && r.events) ? r.events : []); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [first, last]);

  const dayMap = useMemo(() => buildDayMap(items, events, todayIso), [items, events, todayIso]);
  const shift = (n) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { setView({ y: ty, m: tm - 1 }); setSel(todayIso); };
  const cur = dayMap[sel] || { due: [], overdue: [], events: [] };
  const selCards = [...cur.overdue, ...cur.due];
  const nothing = selCards.length === 0 && cur.events.length === 0;

  return (
    <div className="wb-card">
      <h3><CalendarDays size={13} aria-hidden="true" /> Calendário</h3>
      <div className="wb-cal-top">
        <button type="button" className="wb-nav" onClick={() => shift(-1)} aria-label="Mês anterior"><ChevronLeft size={15} aria-hidden="true" /></button>
        <b aria-live="polite">{cap(MONTHS[view.m])} de {view.y}</b>
        <button type="button" className="wb-nav txt" onClick={goToday}>Hoje</button>
        <button type="button" className="wb-nav" onClick={() => shift(1)} aria-label="Próximo mês"><ChevronRight size={15} aria-hidden="true" /></button>
      </div>
      <div className="wb-wk" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="wb-days" role="grid" aria-label={`Dias de ${MONTHS[view.m]} de ${view.y}`}>
        {grid.map((d) => {
          const info = dayMap[d.iso];
          const nDue = info ? info.due.length : 0; const nLate = info ? info.overdue.length : 0; const nEv = info ? info.events.length : 0;
          const parts = [nLate ? `${nLate} atrasada${nLate === 1 ? '' : 's'}` : '', nDue ? `${nDue} prazo${nDue === 1 ? '' : 's'}` : '', nEv ? `${nEv} compromisso${nEv === 1 ? '' : 's'}` : ''].filter(Boolean);
          return (
            <button key={d.iso} type="button" role="gridcell" className={`wb-day${d.inMonth ? '' : ' out'}${d.iso === todayIso ? ' today' : ''}${d.iso === sel ? ' sel' : ''}`} aria-pressed={d.iso === sel} aria-label={`${longDay(d.iso)}${d.iso === todayIso ? ' (hoje)' : ''}${parts.length ? `: ${parts.join(', ')}` : ''}`} onClick={() => setSel(d.iso)}>
              <span>{d.day}</span>
              <span className="wb-dots" aria-hidden="true">
                {nLate > 0 && <i className="wb-dot late" />}{nDue > 0 && <i className="wb-dot due" />}{nEv > 0 && <i className="wb-dot ev" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="wb-legend" aria-hidden="true">
        <span><i className="wb-dot due" />Prazo</span><span><i className="wb-dot late" />Atrasada</span><span><i className="wb-dot ev" />Compromisso</span>
      </div>
      <div className="wb-sel" aria-live="polite">
        <div className="wb-sel-h">{longDay(sel)}{sel === todayIso ? ' · hoje' : ''}</div>
        {nothing && <div className="wb-none">Nada marcado neste dia.</div>}
        {selCards.map((r) => (
          <button type="button" key={r.card.id} className="wb-item" onClick={() => onOpenCard(r.boardId, r.colId, r.card.id)} title={`Abrir: ${r.card.title}`}>
            <span style={{ minWidth: 0 }}>
              <span className="wb-t">{r.card.title}</span>
              <span className="wb-m">{r.card.dueDate < todayIso ? <span className="wb-late">Atrasada · prazo {fmtBr(r.card.dueDate)}</span> : 'Prazo da atividade'}{r.colName ? ` · ${r.colName}` : ''}</span>
            </span>
          </button>
        ))}
        {cur.events.map((ev) => (
          <div key={ev.id || `${ev.title}-${ev.start}`} className="wb-ev">
            <span style={{ minWidth: 0 }}>
              <span className="wb-t">{ev.title}</span>
              <span className="wb-m">{eventTime(ev) || 'Dia inteiro'}{ev.myResponse === 'needsAction' ? ' · sem resposta' : ev.myResponse === 'tentative' ? ' · talvez' : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------- Dados da pessoa (notas + atalhos)
function useExtras() {
  const [state, setState] = useState({ loading: true, error: false, notes: '', shortcuts: [] });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: false }));
    apiGet('/api/personal-extras')
      .then((r) => setState({ loading: false, error: false, notes: r.notes || '', shortcuts: r.shortcuts || [] }))
      .catch(() => setState((s) => ({ ...s, loading: false, error: true })));
  }, []);
  useEffect(() => { load(); }, [load]);
  return [state, setState, load];
}

// Os dois blocos leem a MESMA fonte; para não depender de ordem de montagem, cada um carrega a sua e salva só o seu campo (PUT parcial).
function NotesCard({ readOnly, onCreateCard }) {
  const [ex, setEx, reload] = useExtras();
  const [save, setSave] = useState('idle'); // idle | saving | saved | error
  const timer = useRef(null);
  const latest = useRef('');
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    setSave('saving');
    try { await apiPut('/api/personal-extras', { notes: latest.current }); setSave('saved'); } catch (e) { dirty.current = true; setSave('error'); }
  }, []);
  useEffect(() => () => { if (dirty.current) { apiPut('/api/personal-extras', { notes: latest.current }).catch(() => {}); } if (timer.current) clearTimeout(timer.current); }, []);

  function onChange(html) {
    latest.current = html;
    dirty.current = true;
    setEx((s) => ({ ...s, notes: html }));
    setSave('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  // O editor ignora mudança externa enquanto está com foco (para não atropelar quem digita). Safari/Firefox não tiram o foco ao clicar num
  // botão, então ele é solto aqui antes de esvaziar/restaurar a anotação — senão o texto antigo ficaria na tela e voltaria no próximo salvamento.
  const releaseFocus = () => { const a = document.activeElement; if (a && a !== document.body && a.closest && a.closest('.wb') && a.blur) a.blur(); };

  async function toAtividade() {
    releaseFocus();
    const html = latest.current || ex.notes;
    const { title, desc } = splitNote(html, noteToPlain(html, 'html'));
    if (!title) return;
    const prev = html;
    const undoCreate = onCreateCard(title, desc);
    latest.current = ''; dirty.current = true;
    setEx((s) => ({ ...s, notes: '' }));
    await flush();
    notify(`Atividade criada: “${title.length > 50 ? `${title.slice(0, 50)}…` : title}”. A anotação foi esvaziada.`, {
      tone: 'success', undo: () => { if (typeof undoCreate === 'function') undoCreate(); releaseFocus(); latest.current = prev; dirty.current = true; setEx((s) => ({ ...s, notes: prev })); flush(); },
    });
  }

  const plain = ex.notes ? noteToPlain(ex.notes, 'html') : '';
  const status = save === 'saving' ? 'Salvando…' : save === 'saved' ? 'Salvo' : save === 'error' ? 'Não foi possível salvar — tente de novo' : 'Salva automaticamente';

  return (
    <div className="wb-card">
      <h3><StickyNote size={13} aria-hidden="true" /> Anotações rápidas</h3>
      {ex.loading && <div className="wb-none">Carregando…</div>}
      {ex.error && <div><div className="wb-err" role="alert">Não consegui carregar suas anotações.</div><button type="button" className="wb-btn" onClick={reload}>Tentar de novo</button></div>}
      {!ex.loading && !ex.error && (
        <>
          <React.Suspense fallback={<div className="wb-note-ph" />}>
            <RichNote key="notes" value={ex.notes} format="html" readOnly={readOnly} onChange={onChange} onBlur={flush} placeholder="Escreva um lembrete, uma ideia, um telefone…" label="Anotações rápidas" />
          </React.Suspense>
          <div className="wb-row">
            <span className={`wb-st${save === 'error' ? ' wb-late' : ''}`} role="status">{status}</span>
            <button type="button" className="wb-btn pri" onClick={toAtividade} disabled={readOnly || !plain.trim()} title={plain.trim() ? 'Cria uma atividade na primeira coluna com esta anotação (você pode desfazer)' : 'Escreva algo para transformar em atividade'}>
              <ListPlus size={13} aria-hidden="true" /> Transformar em atividade
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ShortcutsCard({ readOnly }) {
  const [ex, setEx, reload] = useExtras();
  const [form, setForm] = useState(null); // null | { id|null, name, url }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function persist(next, okMsg) {
    const before = ex.shortcuts;
    setEx((s) => ({ ...s, shortcuts: next }));
    setBusy(true);
    try {
      const r = await apiPut('/api/personal-extras', { shortcuts: next });
      setEx((s) => ({ ...s, shortcuts: r.shortcuts || next }));
      if (okMsg) notify(okMsg, { tone: 'success', ttlMs: 2500 });
      return true;
    } catch (e) {
      setEx((s) => ({ ...s, shortcuts: before }));
      setErr((e && e.message) || 'Não foi possível salvar o atalho.');
      return false;
    } finally { setBusy(false); }
  }

  async function submit() {
    const url = cleanUrl(form.url);
    if (!url) { setErr('Informe um endereço http ou https válido (ex.: sefaz.sp.gov.br).'); return; }
    const name = form.name.replace(/\s+/g, ' ').trim().slice(0, 40) || new URL(url).hostname.replace(/^www\./, '');
    setErr('');
    const next = form.id ? ex.shortcuts.map((s) => (s.id === form.id ? { ...s, name, url } : s)) : [...ex.shortcuts, { id: `sc-${Math.random().toString(36).slice(2, 10)}`, name, url }];
    if (await persist(next)) setForm(null);
  }
  function remove(sc) {
    const before = ex.shortcuts;
    persist(before.filter((s) => s.id !== sc.id)).then((ok) => {
      if (ok) notify(`Atalho “${sc.name}” removido.`, { undo: () => persist(before) });
    });
  }

  return (
    <div className="wb-card">
      <h3><Link2 size={13} aria-hidden="true" /> Links e atalhos</h3>
      {ex.loading && <div className="wb-none">Carregando…</div>}
      {ex.error && <div><div className="wb-err" role="alert">Não consegui carregar seus atalhos.</div><button type="button" className="wb-btn" onClick={reload}>Tentar de novo</button></div>}
      {!ex.loading && !ex.error && (
        <>
          {ex.shortcuts.length === 0 && !form && <div className="wb-none">Nenhum atalho ainda. Guarde aqui os sites que você usa todo dia (e-CAC, Sefaz, Drive…).</div>}
          <div className="wb-sc">
            {ex.shortcuts.map((sc) => (
              <span key={sc.id} className="wb-chip">
                <a href={sc.url} target="_blank" rel="noopener noreferrer" title={`${sc.url} (abre em nova aba)`}>{sc.name}</a>
                {!readOnly && <button type="button" onClick={() => { setErr(''); setForm({ id: sc.id, name: sc.name, url: sc.url }); }} aria-label={`Editar o atalho ${sc.name}`} title="Editar"><Pencil size={12} aria-hidden="true" /></button>}
                {!readOnly && <button type="button" onClick={() => remove(sc)} aria-label={`Remover o atalho ${sc.name}`} title="Remover" disabled={busy}><X size={12} aria-hidden="true" /></button>}
              </span>
            ))}
          </div>
          {form ? (
            <form className="wb-form" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label={form.id ? 'Editar atalho' : 'Novo atalho'}>
              <input type="text" aria-label="Nome do atalho" placeholder="Nome (opcional)" maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              <input type="text" inputMode="url" aria-label="Endereço do atalho" placeholder="Endereço (https://…)" maxLength={500} value={form.url} onChange={(e) => { setForm({ ...form, url: e.target.value }); setErr(''); }} />
              {err && <div className="wb-err" role="alert">{err}</div>}
              <div className="wb-row" style={{ marginTop: 0 }}>
                <button type="button" className="wb-btn" onClick={() => { setForm(null); setErr(''); }}>Cancelar</button>
                <button type="submit" className="wb-btn pri" disabled={busy || !form.url.trim()} title={form.url.trim() ? undefined : 'Informe o endereço'}>{form.id ? 'Salvar' : 'Adicionar'}</button>
              </div>
            </form>
          ) : (
            <>
              {err && <div className="wb-err" role="alert">{err}</div>}
              {!readOnly && (
                <div className="wb-row">
                  <button type="button" className="wb-btn" onClick={() => { setErr(''); setForm({ id: null, name: '', url: '' }); }} disabled={ex.shortcuts.length >= MAX_SHORTCUTS} title={ex.shortcuts.length >= MAX_SHORTCUTS ? `Limite de ${MAX_SHORTCUTS} atalhos` : undefined}>
                    <Plus size={13} aria-hidden="true" /> Adicionar atalho
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
