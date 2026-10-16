// Atalhos de uso do quadro pessoal (2026-10-16, melhorias visuais 1 e 2 do pedido do Rafael): botão global "Nova atividade" com a tecla N e
// "visões rápidas" (Hoje, Atrasadas, Urgentes, Em andamento). Só apresentação: quem grava é o App (`addCard`) e os filtros são os MESMOS que
// já existiam (`filters`), então nada muda no modelo do quadro nem no que é salvo.
import React, { useEffect, useRef, useState } from 'react';
import { Plus, CalendarClock, AlertTriangle, Flame, Play } from 'lucide-react';

export const QUICK_CSS = `
  .qb-new { position:relative; display:inline-flex; }
  .qb-new-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; padding:6px 12px; border-radius:8px; border:1px solid var(--ui-accent, #F5C400); background:var(--ui-accent, #F5C400); color:#17171f; cursor:pointer; font-family:inherit; }
  .qb-new-btn:hover { filter:brightness(1.06); }
  .qb-new-btn kbd { font-family:inherit; font-size:10.5px; font-weight:800; padding:0 5px; border-radius:4px; background:rgba(0,0,0,.14); }
  .qb-pop { position:absolute; top:calc(100% + 6px); left:0; z-index:40; width:320px; max-width:90vw; background:var(--bg-2); border:1px solid var(--border-3); border-radius:12px; padding:12px; box-shadow:0 12px 32px rgba(0,0,0,.35); display:flex; flex-direction:column; gap:8px; }
  .qb-pop label { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-5); }
  .qb-pop input, .qb-pop select { width:100%; font-size:13px; }
  .qb-pop-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .qb-pop-hint { font-size:11.5px; color:var(--text-5); }
  .qb-pop-ok { font-size:11.5px; font-weight:700; color:#3ecf6e; }
  .qv-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:0 0 8px; }
  .qv-label { font-size:11.5px; font-weight:700; color:var(--text-5); margin-right:2px; }
  .qv-chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-3); cursor:pointer; font-family:inherit; }
  .qv-chip:hover { border-color:var(--border-3); color:var(--text-1); }
  .qv-chip.on { background:var(--bg-4); color:var(--text-1); border-color:var(--ui-accent, #F5C400); }
  .qv-chip.danger .qv-n { background:rgba(226,87,76,.18); color:#e2574c; }
  .qv-n { min-width:18px; text-align:center; font-size:11px; font-weight:800; padding:0 6px; border-radius:999px; background:var(--bg-4); color:var(--text-3); font-variant-numeric:tabular-nums; }
  .qb-new-btn:focus-visible, .qv-chip:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .qv-label { display:none; } .qb-new-btn, .qv-chip { min-height:44px; } .qb-pop input, .qb-pop select { font-size:16px; min-height:44px; } .qv-row { flex-wrap:nowrap; overflow-x:auto; padding-bottom:2px; } .qv-chip { flex-shrink:0; } }
`;

// "N" abre a criação rápida, a não ser que a pessoa esteja digitando ou que haja um diálogo aberto.
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

export function QuickNew({ columns, enabled, onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [colId, setColId] = useState('');
  const [justCreated, setJustCreated] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const firstColId = columns && columns[0] ? columns[0].id : '';

  useEffect(() => { if (open && !columns.some((c) => c.id === colId)) setColId(firstColId); }, [open, columns, colId, firstColId]);

  useEffect(() => {
    if (!enabled) return undefined;
    function onKey(e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'n' && e.key !== 'N')) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], .ui-modal')) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 0);
    function onDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  if (!enabled || !columns || !columns.length) return null;

  function submit() {
    const t = title.trim();
    if (!t) return;
    const col = columns.find((c) => c.id === colId) || columns[0];
    onCreate(col.id, t);
    setJustCreated(`Criada em “${col.name}”`);
    setTitle('');
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div className="qb-new" ref={wrapRef}>
      <style>{QUICK_CSS}</style>
      <button type="button" className="qb-new-btn" onClick={() => { setJustCreated(''); setOpen((v) => !v); }} aria-expanded={open} aria-keyshortcuts="N" title="Nova atividade (tecla N)">
        <Plus size={14} aria-hidden="true" /> Nova atividade <kbd aria-hidden="true">N</kbd>
      </button>
      {open && (
        <div className="qb-pop" role="group" aria-label="Nova atividade" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <label htmlFor="qb-title">O que precisa ser feito?</label>
          <input id="qb-title" ref={inputRef} type="text" value={title} placeholder="Digite e aperte Enter" onChange={(e) => { setTitle(e.target.value); setJustCreated(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
          <label htmlFor="qb-col">Coluna</label>
          <select id="qb-col" value={colId} onChange={(e) => setColId(e.target.value)}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
          </select>
          <div className="qb-pop-row">
            <span className={justCreated ? 'qb-pop-ok' : 'qb-pop-hint'} role="status">{justCreated || 'Enter cria · Esc fecha'}</span>
            <button type="button" className="qb-new-btn" onClick={submit} disabled={!title.trim()} title={title.trim() ? 'Criar a atividade' : 'Escreva o nome da atividade'} style={!title.trim() ? { opacity: 0.5, cursor: 'default' } : undefined}>Criar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ICONS = { today: CalendarClock, overdue: AlertTriangle, urgent: Flame, doing: Play };

export function QuickViews({ items }) {
  return (
    <div className="qv-row" role="group" aria-label="Visões rápidas">
      <style>{QUICK_CSS}</style>
      <span className="qv-label">Visões rápidas</span>
      {items.map((it) => {
        const Icon = ICONS[it.key];
        return (
          <button key={it.key} type="button" className={`qv-chip${it.active ? ' on' : ''}${it.danger && it.count > 0 ? ' danger' : ''}`} aria-pressed={it.active} onClick={it.onClick} title={it.active ? 'Clique para remover este filtro' : `Mostrar só: ${it.label.toLowerCase()}`}>
            {Icon && <Icon size={12} aria-hidden="true" />} {it.label} <span className="qv-n">{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}
