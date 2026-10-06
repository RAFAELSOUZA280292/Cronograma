// Peças visuais comuns (2026-10-04, §72) — ver ui.css. Só apresentação: nenhuma lógica de negócio aqui, quem usa
// continua dono do estado e dos handlers. Acessibilidade embutida (aria-pressed/selected, role=status, foco).
import React, { useEffect, useRef, useState } from 'react';
import './ui.css';
import { useDialog } from '../lib/nav.js';
import { useSaveState, retryFailedSaves } from '../lib/saveState.js';

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

// Botão de texto. variant: primary (amarelo — a ação principal da tela) · danger (vermelho — destrutivo) · padrão (secundário).
// `disabledReason` é OBRIGATÓRIO quando `disabled` (o motivo vira tooltip e texto para leitor de tela): botão desligado sem
// explicação é botão quebrado para quem usa. `loading` mostra "Aguarde…" e trava.
export function Button({ variant, size, icon: Icon, children, className, type = 'button', disabled, disabledReason, loading, title, ...rest }) {
  const off = !!(disabled || loading);
  const reason = disabled && disabledReason ? disabledReason : undefined;
  return (
    <button type={type} className={cx('ui-btn', variant, size, className)} disabled={off} title={reason || title} aria-busy={loading || undefined} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
      {loading ? 'Aguarde…' : children}
      {reason && <span className="ui-sr">{` — ${reason}`}</span>}
    </button>
  );
}

// Botão só-ícone: o rótulo (`label`) é obrigatório — vira aria-label e tooltip. Alvo de 36 px (44 no celular).
export function IconButton({ label, icon: Icon, variant, size, className, type = 'button', disabled, disabledReason, ...rest }) {
  if (!label && typeof console !== 'undefined') console.error('IconButton sem label');
  const reason = disabled && disabledReason ? disabledReason : undefined;
  return (
    <button type={type} className={cx('ui-iconbtn', variant, size, className)} aria-label={label} title={reason ? `${label} — ${reason}` : label} disabled={disabled} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
    </button>
  );
}

// Estado de erro com saída: o que aconteceu, por quê (se der) e "Tentar de novo".
export function ErrorState({ title = 'Não foi possível carregar', message, onRetry, retryLabel = 'Tentar de novo', compact }) {
  return (
    <div className={cx('ui-error', compact && 'compact')} role="alert">
      <div className="ui-error-title">{title}</div>
      {message && <div className="ui-error-msg">{message}</div>}
      {onRetry && <Button size="sm" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

// Estado de gravação: o mesmo texto em todo lugar. state: 'idle' | 'draft' (digitado, ainda não gravado) | 'saving' | 'saved' | 'error'.
// `idleText` aparece no estado idle (ex.: "Todas as alterações estão salvas"); `errorText` troca o texto do erro.
export function SaveStatus({ state, savedAt, onRetry, idleText, errorText }) {
  if (!state || (state === 'idle' && !idleText)) return null;
  return (
    <span className={cx('ui-save', `s-${state}`)} role="status">
      {state === 'idle' && idleText}
      {state === 'draft' && 'Alterações ainda não salvas'}
      {state === 'saving' && 'Salvando…'}
      {state === 'saved' && `Salvo${savedAt ? ` às ${savedAt}` : ''}`}
      {state === 'error' && <>{errorText || 'Não foi possível salvar'}{onRetry && <button type="button" className="ui-save-retry" onClick={onRetry}>Tentar de novo</button>}</>}
    </span>
  );
}

const hhmm = (d) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

// Selo de gravação do indicador GLOBAL (barra do topo): lê o estado de todas as gravações automáticas.
export function GlobalSaveStatus() {
  const g = useSaveState();
  return <SaveStatus state={g.status} savedAt={hhmm(g.savedAt)} onRetry={g.status === 'error' && g.retryable ? retryFailedSaves : undefined} />;
}

// Selo de um REGISTRO aberto (atividade, cartão, TASK, reunião…): mistura o rascunho local com o estado global de gravação.
// `lastSavedAt` vem do useAutosaveTimestamp do registro.
export function RecordSaveStatus({ hasDraft, lastSavedAt }) {
  const g = useSaveState();
  let state = 'idle';
  if (g.status === 'error') state = 'error';
  else if (g.status === 'saving') state = 'saving';
  else if (hasDraft) state = 'draft';
  else if (lastSavedAt) state = 'saved';
  return <SaveStatus state={state} savedAt={hhmm(lastSavedAt)} onRetry={state === 'error' && g.retryable ? retryFailedSaves : undefined} idleText="Todas as alterações estão salvas" />;
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
          <button type="button" className="ui-btn" ref={requireText ? undefined : first} onClick={onCancel} disabled={busy} title={busy ? 'Aguarde terminar' : undefined}>{cancelLabel}</button>
          <button type="button" className={`ui-btn ${danger ? 'danger' : 'primary'}`} onClick={submit} disabled={!ok || busy} title={busy ? 'Aguarde terminar' : !ok ? 'Digite o texto indicado para liberar' : undefined}>{busy ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
