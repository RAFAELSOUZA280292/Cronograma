// Filtro por VÁRIAS tags (o negócio precisa ter todas) — 2026-10-26. O valor é o texto "tag1|tag2" (mesmo formato do servidor e das visões salvas).
// Tem um botão "Tags" com busca e caixas de marcar, e, quando existem, atalhos de um clique para o evento e as curvas A/B/C/D.
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom';
import { Check, Tag, X } from 'lucide-react';
import { tagColor } from './crmMeta.js';

export const splitTags = (v) => String(v || '').split('|').map((x) => x.trim()).filter(Boolean);
export const joinTags = (list) => list.join('|');

export function TagChip({ name, onRemove, count, active, onClick, title }) {
  const body = <>{name}{count != null && <b> {count}</b>}</>;
  const style = { '--dot': tagColor(name) };
  if (onClick) return <button type="button" className="crm-tagbtn" style={style} aria-pressed={!!active} title={title} onClick={onClick}>{body}</button>;
  return <span className={`crm-tagbtn${onRemove ? ' on' : ''}`} style={style}>{body}{onRemove && <button type="button" className="crm-tagbtn-x" aria-label={`Tirar o filtro ${name}`} title="Tirar este filtro" onClick={onRemove}><X size={11} aria-hidden="true" /></button>}</span>;
}

export default function TagFilter({ tagList, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef(null);
  const { refs, floatingStyles } = useFloating({ open, placement: 'bottom-start', strategy: 'fixed', whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12, fallbackStrategy: 'bestFit' }), shift({ padding: 12 }), size({ padding: 12, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(200, availableHeight)}px`; } })] });
  const sel = splitTags(value);
  const live = useMemo(() => (tagList || []).filter((t) => t.deals > 0), [tagList]);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } };
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) close(); };
    window.addEventListener('keydown', onKey, true); document.addEventListener('mousedown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); };
  }, [open, close]);
  const toggle = (name) => onChange(joinTags(sel.includes(name) ? sel.filter((x) => x !== name) : [...sel, name]));
  const shown = live.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const quick = [...live.filter((t) => /Ponto Fora da Curva/.test(t.name)), ...live.filter((t) => /^Curva [A-D]\b/.test(t.name)).sort((a, b) => a.name.localeCompare(b.name))];
  if (!live.length) return null;
  return (
    <>
      <span className="crm-tagfilter" ref={(el) => { wrap.current = el; refs.setReference(el); }}>
        <button type="button" className={`crm-btn${sel.length ? ' crm-btn-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Filtrar por uma ou várias tags (o negócio precisa ter todas)"><Tag size={14} aria-hidden="true" /> Tags{sel.length ? ` (${sel.length})` : ''}</button>
        {open && (
          <div ref={refs.setFloating} style={floatingStyles} className="crm-tagpop" role="dialog" aria-label="Filtrar por tags">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tag…" aria-label="Buscar tag" />
            <div className="crm-tagpop-list">
              {shown.map((t) => (
                <label key={t.id} className="crm-tagpop-row">
                  <input type="checkbox" checked={sel.includes(t.name)} onChange={() => toggle(t.name)} />
                  <span className="crm-tagdot" style={{ background: tagColor(t.name) }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</span><small>{t.deals}</small>
                </label>
              ))}
              {!shown.length && <div className="crm-muted" style={{ padding: 8 }}>Nenhuma tag com esse nome.</div>}
            </div>
            {sel.length > 0 && <button type="button" className="crm-btn" style={{ marginTop: 8 }} onClick={() => { onChange(''); close(); }}>Limpar tags</button>}
          </div>
        )}
      </span>
      {sel.map((n) => <TagChip key={n} name={n} onRemove={() => toggle(n)} />)}
      {quick.length > 0 && (
        <div className="crm-quicktags" role="group" aria-label="Atalhos de tags do evento">
          <span className="crm-muted" style={{ fontSize: 11.5, fontWeight: 700 }}>Evento e curva:</span>
          {quick.map((t) => <TagChip key={t.id} name={t.name} count={t.deals} active={sel.includes(t.name)} title={sel.includes(t.name) ? 'Clique para tirar este filtro' : 'Clique para filtrar (soma com os outros atalhos: o negócio precisa ter todos)'} onClick={() => toggle(t.name)} />)}
          {sel.length > 0 && <button type="button" className="crm-link-btn" onClick={() => onChange('')}>limpar</button>}
        </div>
      )}
    </>
  );
}
