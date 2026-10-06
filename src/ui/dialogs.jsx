// Diálogos e avisos globais (Onda 2, §81) — o jeito único de confirmar, pedir um texto e avisar.
// Substituem window.confirm / window.prompt / window.alert. Funcionam de qualquer lugar (inclusive fora de componentes),
// porque o <DialogHost /> montado na raiz do App escuta um store de módulo.
//
//   if (!(await askConfirm({ title: 'Excluir X?', message: '…', confirmLabel: 'Excluir', danger: true }))) return;
//   const url = await askText({ title: 'Endereço do link', label: 'URL', defaultValue: prev, confirmLabel: 'Aplicar' }); // null = cancelou
//   notify('Salvo.', { tone: 'success' });  notify(err.message, { tone: 'error' });  notify('Excluída.', { undo: () => restaurar() });
//
// Fila: um diálogo por vez (FIFO). Toasts: um só empilhamento para o app todo (o useToasts do App usa o mesmo store).
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { ConfirmDialog } from './index.jsx';
import { useDialog } from '../lib/nav.js';

let dialogQueue = [];
let toastList = [];
let toastSeq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function askConfirm(opts) {
  return new Promise((resolve) => { dialogQueue = [...dialogQueue, { kind: 'confirm', opts: opts || {}, resolve }]; emit(); });
}
export function askText(opts) {
  return new Promise((resolve) => { dialogQueue = [...dialogQueue, { kind: 'text', opts: opts || {}, resolve }]; emit(); });
}

export function dismissToast(id) { toastList = toastList.filter((t) => t.id !== id); emit(); }
// notify(mensagem, { tone: 'info'|'success'|'error', undo, actionLabel, onAction, ttlMs })
export function notify(message, opts) {
  const o = opts || {};
  const id = `toast-${++toastSeq}`;
  const tone = o.tone || 'info';
  const actionLabel = o.undo ? 'Desfazer' : o.actionLabel;
  const onAction = o.undo || o.onAction;
  const ttl = o.ttlMs === undefined ? (tone === 'error' ? 9000 : o.undo ? 7000 : 5000) : o.ttlMs;
  toastList = [...toastList, { id, message, tone, actionLabel, onAction }];
  emit();
  if (ttl) setTimeout(() => dismissToast(id), ttl);
  return id;
}

function PromptDialog({ opts, onSubmit, onCancel }) {
  const { title, message, label, defaultValue = '', placeholder, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', multiline, required = true, validate } = opts;
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const trap = useDialog(onCancel, { history: false });
  useEffect(() => { if (ref.current) { ref.current.focus(); if (ref.current.select) ref.current.select(); } }, []);
  function submit() {
    const v = value.trim();
    if (required && !v) { setError('Preencha este campo para continuar.'); return; }
    const msg = validate ? validate(v) : '';
    if (msg) { setError(msg); return; }
    onSubmit(v);
  }
  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="ui-dlg-overlay" onClick={onCancel}>
      <div className="ui-dlg" role="dialog" aria-modal="true" aria-label={title} ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="ui-dlg-title">{title}</h2>
        {message && <div className="ui-dlg-msg">{message}</div>}
        <div className="ui-dlg-type">
          {label && <label htmlFor="ui-prompt-input">{label}</label>}
          <Field
            id="ui-prompt-input" ref={ref} value={value} placeholder={placeholder} autoComplete="off" rows={multiline ? 4 : undefined}
            onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
            aria-invalid={error ? 'true' : undefined}
          />
        </div>
        {error && <div className="ui-dlg-err" role="alert">{error}</div>}
        <div className="ui-dlg-actions">
          <button type="button" className="ui-btn" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="ui-btn primary" onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function ToastStack() {
  const toasts = useSyncExternalStore(subscribe, () => toastList);
  if (!toasts.length) return null;
  return (
    <div className="ui-toasts no-print" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`ui-toast tone-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span className="ui-toast-msg">{t.message}</span>
          {t.actionLabel && <button type="button" className="ui-toast-action" onClick={() => { if (t.onAction) t.onAction(); dismissToast(t.id); }}>{t.actionLabel}</button>}
          <button type="button" className="ui-toast-x" aria-label="Fechar aviso" title="Fechar aviso" onClick={() => dismissToast(t.id)}><X size={13} aria-hidden="true" /></button>
        </div>
      ))}
    </div>
  );
}

export function DialogHost() {
  const queue = useSyncExternalStore(subscribe, () => dialogQueue);
  const cur = queue[0];
  function finish(value) {
    if (!cur) return;
    dialogQueue = dialogQueue.slice(1);
    emit();
    cur.resolve(value);
  }
  return (
    <>
      {cur && cur.kind === 'confirm' && (
        <ConfirmDialog
          key={queue.length + (cur.opts.title || '')}
          title={cur.opts.title || 'Confirmar?'} message={cur.opts.message} confirmLabel={cur.opts.confirmLabel} cancelLabel={cur.opts.cancelLabel}
          danger={cur.opts.danger} requireText={cur.opts.requireText}
          onConfirm={() => finish(true)} onCancel={() => finish(false)}
        />
      )}
      {cur && cur.kind === 'text' && <PromptDialog key={queue.length + (cur.opts.title || '')} opts={cur.opts} onSubmit={(v) => finish(v)} onCancel={() => finish(null)} />}
      <ToastStack />
    </>
  );
}

// Para o useToasts do App (mesma API de antes, mas num empilhamento só).
export function pushToastCompat({ message, actionLabel, onAction, ttlMs }) {
  return notify(message, { actionLabel, onAction, ttlMs: ttlMs === undefined ? 5000 : ttlMs });
}
