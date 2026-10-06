// Peças visuais comuns (2026-10-04, §72) — ver ui.css. Só apresentação: nenhuma lógica de negócio aqui, quem usa
// continua dono do estado e dos handlers. Acessibilidade embutida (aria-pressed/selected, role=status, foco).
import React, { useEffect, useRef, useState } from 'react';
import './ui.css';
import { useDialog } from '../lib/nav.js';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Card({ interactive, onClick, className, children, ...rest }) {
  const clickable = interactive && onClick;
  return (
    <div
      className={cx('ui-card', interactive && 'interactive', className)}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e); } } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Button({ variant, size, icon: Icon, children, className, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('ui-btn', variant, size, className)} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

export function Chip({ active, count, accent, icon: Icon, children, className, ...rest }) {
  return (
    <button type="button" aria-pressed={!!active} className={cx('ui-chip', className)} style={accent ? { '--chip-accent': accent } : undefined} {...rest}>
      {Icon && <Icon size={15} />}
      {children}
      {count !== undefined && count !== null && count > 0 && <span className="ui-chip-n">{count}</span>}
    </button>
  );
}

export function ChipRow({ children, label }) {
  return <div className="ui-chip-row" role="group" aria-label={label}>{children}</div>;
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, active, onChange, label }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" role="tab" id={`ui-tab-${t.id}`} aria-selected={active === t.id} className="ui-tab" onClick={() => onChange(t.id)}>
            {Icon && <Icon size={15} />}
            {t.label}
            {t.count > 0 && <span className="ui-tab-n">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Select({ className, children, ...rest }) {
  return <select className={cx('ui-select', className)} {...rest}>{children}</select>;
}

export function Kpi({ label, value, hint, tone, featured, icon: Icon, onClick }) {
  const body = (
    <>
      <div className="ui-kpi-label">{Icon && <Icon size={13} />}{label}</div>
      <div className="ui-kpi-value">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      {hint && <div className="ui-kpi-hint">{hint}</div>}
    </>
  );
  const klass = cx('ui-card', 'ui-kpi', featured && 'featured', tone && `tone-${tone}`, onClick && 'interactive');
  return onClick
    ? <button type="button" className={klass} onClick={onClick}>{body}</button>
    : <div className={klass}>{body}</div>;
}

export function KpiGrid({ featured, children }) {
  return <div className={cx('ui-kpi-grid', featured && 'featured')}>{children}</div>;
}

export function Section({ title, icon: Icon, iconColor, action, children }) {
  return (
    <section className="ui-section">
      <div className="ui-section-head">
        <h3 className="ui-section-title">{Icon && <Icon size={15} color={iconColor} />}{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, tone, compact, children }) {
  return (
    <div className={cx('ui-empty', compact && 'compact', tone && `tone-${tone}`)} role="status">
      {Icon && <div className="ui-empty-icon"><Icon size={22} /></div>}
      {title && <div className="ui-empty-title">{title}</div>}
      {description && <div className="ui-empty-desc">{description}</div>}
      {children && <div className="ui-empty-actions">{children}</div>}
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%', radius }) {
  return <span className="ui-skel" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonCards({ count = 3, height = 74 }) {
  return (
    <div className="ui-skel-stack" role="status" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} radius={12} />)}
    </div>
  );
}

export function SkeletonKpis({ count = 3, featured }) {
  return (
    <div className={cx('ui-kpi-grid', featured && 'featured')} role="status" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={featured ? 104 : 78} radius={14} />)}
    </div>
  );
}

export function Callout({ tone, icon: Icon, title, action, children }) {
  return (
    <div className={cx('ui-callout', tone && `tone-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      {Icon && <Icon size={18} className="ui-callout-icon" />}
      <div className="ui-callout-body">
        {title && <div className="ui-callout-title">{title}</div>}
        {children}
      </div>
      {action && <div className="ui-callout-action">{action}</div>}
    </div>
  );
}

export function BusyBar({ active }) {
  return active ? <div className="ui-busy" role="progressbar" aria-label="Carregando" /> : <div style={{ height: 2 }} />;
}

// Torna um elemento clicável (div de linha/cartão) acessível por teclado sem mudar o que o clique faz.
export function activate(fn) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } },
  };
}

// Linha de tabela clicável: foco por teclado e Enter/Espaço, sem trocar o papel (role) da linha.
export function activateRow(fn) {
  return {
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } },
  };
}

// Confirmação no visual do app (substitui window.confirm/prompt). `requireText`: a pessoa precisa digitar exatamente esse texto
// (nome da empresa, "EXCLUIR"…) para liberar o botão. Esc e "Cancelar" cancelam; `busy` trava os botões; `error` aparece dentro do
// diálogo (a ação que falhou não fecha a janela). Foco inicial no botão seguro (Cancelar) ou no campo de digitação.
export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, requireText, onConfirm, onCancel, busy, error }) {
  const [typed, setTyped] = useState('');
  const first = useRef(null);
  const trap = useDialog(onCancel, { esc: false, history: false });
  useEffect(() => {
    if (first.current) first.current.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy]);
  const ok = !requireText || typed.trim().toLowerCase() === String(requireText).trim().toLowerCase();
  const submit = () => { if (ok && !busy) onConfirm(); };
  return (
    <div className="ui-dlg-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="ui-dlg" role="alertdialog" aria-modal="true" aria-label={title} ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="ui-dlg-title">{title}</h2>
        {message && <div className="ui-dlg-msg">{message}</div>}
        {requireText && (
          <div className="ui-dlg-type">
            <label htmlFor="ui-dlg-input">Para confirmar, digite <b>{requireText}</b></label>
            <input id="ui-dlg-input" ref={first} type="text" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
        )}
        {error && <div className="ui-dlg-err" role="alert">{error}</div>}
        <div className="ui-dlg-actions">
          <button type="button" className="ui-btn" ref={requireText ? undefined : first} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`ui-btn ${danger ? 'danger' : 'primary'}`} onClick={submit} disabled={!ok || busy}>{busy ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
