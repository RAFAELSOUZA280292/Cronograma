// Campos de data e horário (2026-10-26): substituem <input type="date"/"time"> nativos, cujo calendário abre cortado dentro de janelas com rolagem.
// Calendário = react-day-picker (pt-BR); posição = @floating-ui/react-dom com strategy "fixed" + flip/shift/size, então o painel nunca passa da tela
// nem é cortado pelo overflow da janela. O painel é renderizado DENTRO do elemento (não em portal) para o foco preso do diálogo continuar funcionando.
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom';
import { CalendarDays, Clock, X } from 'lucide-react';
import 'react-day-picker/style.css';
import './datetime.css';

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(`${iso}T12:00:00`) : undefined);
export const brOf = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const addDaysIso = (iso, n) => { const d = dateOf(iso) || new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
const nextMonday = (iso) => { const d = dateOf(iso) || new Date(); const add = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + add); return isoOf(d); };

// "26102026" / "26/10/2026" / "26/10/26" → "2026-10-26" (ou '' se não for uma data válida)
export function parseBr(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length < 6) return '';
  const dd = digits.slice(0, 2); const mm = digits.slice(2, 4); let yy = digits.slice(4, 8);
  if (yy.length === 2) yy = `20${yy}`;
  if (yy.length !== 4) return '';
  const iso = `${yy}-${mm}-${dd}`;
  const d = dateOf(iso);
  return d && isoOf(d) === iso ? iso : '';
}
const maskBr = (text) => { const d = String(text || '').replace(/\D/g, '').slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/'); };

// Painel flutuante comum (calendário e lista de horários).
function useFloatingPanel(open, onClose) {
  const { refs, floatingStyles } = useFloating({
    open, placement: 'bottom-start', strategy: 'fixed', whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12, fallbackStrategy: 'bestFit' }), shift({ padding: 12 }),
      size({ padding: 12, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`; } })],
  });
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    // Esc fecha só o painel (fase de captura: o Esc que fecharia a janela inteira nem chega nela).
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(true); } };
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose(false); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('touchstart', onDown, true); };
  }, [open, onClose]);
  return { refs, floatingStyles, wrapRef };
}


// Conteúdo do calendário (atalhos + mês + rodapé), usado pelo campo e pelo botão de reagendar.
function CalendarPanel({ value, min, max, shortcuts = true, allowClear, onPick, onClear }) {
  const minD = dateOf(min); const maxD = dateOf(max);
  const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const today = todayIso();
  const quick = [['Hoje', today], ['Amanhã', addDaysIso(today, 1)], ['Em 7 dias', addDaysIso(today, 7)], ['Seg. que vem', nextMonday(today)]].filter(([, iso]) => inRange(iso));
  return (
    <>
      {shortcuts && quick.length > 0 && (
        <div className="dt-quick">{quick.map(([label, iso]) => <button type="button" key={label} className={`dt-chip ${value === iso ? 'is-on' : ''}`} onClick={() => onPick(iso)}>{label}</button>)}</div>
      )}
      <DayPicker mode="single" locale={ptBR} weekStartsOn={0} showOutsideDays fixedWeeks captionLayout="dropdown" startMonth={new Date(2024, 0)} endMonth={new Date(2032, 11)}
        defaultMonth={dateOf(value) || new Date()} selected={dateOf(value)} onSelect={(d) => { if (d) onPick(isoOf(d)); }}
        disabled={[...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : [])]} modifiers={{ hoje: new Date() }} modifiersClassNames={{ hoje: 'dt-today' }} />
      <div className="dt-foot">
        <button type="button" className="dt-link" onClick={() => onPick(today)} disabled={!inRange(today)} title={inRange(today) ? 'Escolher a data de hoje' : 'Hoje está fora do período permitido'}>Ir para hoje</button>
        {allowClear && <button type="button" className="dt-link" onClick={onClear}>Limpar</button>}
      </div>
    </>
  );
}

// Botão (ícone) que abre o calendário no próprio lugar e devolve a data escolhida — "Reagendar".
export function DatePopButton({ value, onPick, min, max, children, title = 'Escolher data', ariaLabel, className = 'crm-icon-btn' }) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const btnRef = useRef(null);
  const close = useCallback((refocus) => { setOpen(false); if (refocus && btnRef.current) btnRef.current.focus({ preventScroll: true }); }, []);
  const { refs, floatingStyles, wrapRef } = useFloatingPanel(open, close);
  return (
    <span className="dt-wrap dt-inline" ref={(el) => { wrapRef.current = el; refs.setReference(el); }}>
      <button ref={btnRef} type="button" className={className} title={title} aria-label={ariaLabel || title} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? uid : undefined} onClick={() => setOpen((v) => !v)}>{children}</button>
      {open && (
        <div id={uid} ref={refs.setFloating} style={floatingStyles} className="dt-pop" role="dialog" aria-label="Escolher data">
          <CalendarPanel value={value} min={min} max={max} onPick={(iso) => { onPick(iso); close(true); }} />
        </div>
      )}
    </span>
  );
}

export function DateField({ value, onChange, min, max, disabled, placeholder = 'dd/mm/aaaa', ariaLabel, allowClear = false, shortcuts = true, className = '', id }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(brOf(value));
  const inputRef = useRef(null);
  const uid = useId();
  const close = useCallback((refocus) => { setOpen(false); if (refocus && inputRef.current) inputRef.current.focus({ preventScroll: true }); }, []);
  const { refs, floatingStyles, wrapRef } = useFloatingPanel(open, close);
  useEffect(() => { setText(brOf(value)); }, [value]);
  const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const pick = (iso) => { if (iso && !inRange(iso)) return; onChange(iso); setText(brOf(iso)); close(true); };
  return (
    <div className={`dt-wrap ${className}`} ref={(el) => { wrapRef.current = el; refs.setReference(el); }}>
      <div className={`dt-field ${disabled ? 'is-disabled' : ''}`}>
        <input ref={inputRef} id={id} className="dt-input" inputMode="numeric" autoComplete="off" disabled={disabled} placeholder={placeholder} aria-label={ariaLabel || 'Data'}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? uid : undefined} value={text}
          onChange={(e) => { const m = maskBr(e.target.value); setText(m); const iso = parseBr(m); if (iso && inRange(iso)) onChange(iso); else if (!m && allowClear) onChange(''); }}
          onBlur={() => { const iso = parseBr(text); if (!iso || !inRange(iso)) setText(brOf(value)); }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown' || (e.key === 'Enter' && !open)) { e.preventDefault(); setOpen(true); } }} />
        {allowClear && value && !disabled && <button type="button" className="dt-clear" aria-label="Limpar data" title="Limpar data" onClick={() => { onChange(''); setText(''); }}><X size={13} aria-hidden="true" /></button>}
        <button type="button" className="dt-btn" disabled={disabled} aria-label={open ? 'Fechar calendário' : 'Abrir calendário'} title={disabled ? 'Campo bloqueado' : 'Abrir calendário'} onClick={() => setOpen((v) => !v)}><CalendarDays size={16} aria-hidden="true" /></button>
      </div>
      {open && (
        <div id={uid} ref={refs.setFloating} style={floatingStyles} className="dt-pop" role="dialog" aria-label="Escolher data">
          <CalendarPanel value={value} min={min} max={max} shortcuts={shortcuts} allowClear={allowClear} onPick={pick} onClear={() => { onChange(''); setText(''); close(true); }} />
        </div>
      )}
    </div>
  );
}

// "9", "930", "09:30", "9h30" → "09:30"
export function parseTime(text) {
  const t = String(text || '').trim().toLowerCase().replace('h', ':');
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(t.replace(/\s/g, ''));
  if (!m) return '';
  const h = Number(m[1]); const mi = Number(m[2] || 0);
  if (h > 23 || mi > 59) return '';
  return `${pad(h)}:${pad(mi)}`;
}
const maskTime = (text) => { const d = String(text || '').replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };

export function TimeField({ value, onChange, disabled, placeholder = '--:--', ariaLabel, step = 15, from = 6, to = 22, allowClear = true, className = '', id }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || '');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId();
  const close = useCallback((refocus) => { setOpen(false); if (refocus && inputRef.current) inputRef.current.focus({ preventScroll: true }); }, []);
  const { refs, floatingStyles, wrapRef } = useFloatingPanel(open, close);
  useEffect(() => { setText(value || ''); }, [value]);
  const slots = useMemo(() => { const out = []; for (let m = from * 60; m <= to * 60; m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`); return out; }, [from, to, step]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[aria-selected="true"]') || listRef.current.querySelector(`[data-t="${slots.find((s) => s >= '09:00') || slots[0]}"]`);
    if (el) listRef.current.scrollTop = Math.max(0, el.offsetTop - 60);
  }, [open, slots]);
  const pick = (t) => { onChange(t); setText(t); close(true); };
  return (
    <div className={`dt-wrap ${className}`} ref={(el) => { wrapRef.current = el; refs.setReference(el); }}>
      <div className={`dt-field ${disabled ? 'is-disabled' : ''}`}>
        <input ref={inputRef} id={id} className="dt-input" inputMode="numeric" autoComplete="off" disabled={disabled} placeholder={placeholder} aria-label={ariaLabel || 'Horário'}
          aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid : undefined} value={text}
          onChange={(e) => { const m = maskTime(e.target.value); setText(m); const t = parseTime(m); if (m.length === 5 && t) onChange(t); else if (!m && allowClear) onChange(''); }}
          onBlur={() => { const t = parseTime(text); if (t && t !== value) onChange(t); else if (!t) setText(value || ''); else setText(t); }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }} />
        {allowClear && value && !disabled && <button type="button" className="dt-clear" aria-label="Limpar horário" title="Limpar horário" onClick={() => { onChange(''); setText(''); }}><X size={13} aria-hidden="true" /></button>}
        <button type="button" className="dt-btn" disabled={disabled} aria-label={open ? 'Fechar horários' : 'Escolher horário'} title={disabled ? 'Campo bloqueado' : 'Escolher horário'} onClick={() => setOpen((v) => !v)}><Clock size={16} aria-hidden="true" /></button>
      </div>
      {open && (
        <div id={uid} ref={(el) => { refs.setFloating(el); listRef.current = el; }} style={{ ...floatingStyles, minWidth: 120 }} className="dt-pop dt-times" role="listbox" aria-label="Escolher horário">
          {slots.map((t) => <button type="button" role="option" key={t} data-t={t} aria-selected={t === value} className={`dt-time ${t === value ? 'is-on' : ''}`} onClick={() => pick(t)}>{t}</button>)}
        </div>
      )}
    </div>
  );
}
