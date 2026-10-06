// Peças de UI compartilhadas do CRM.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ConfirmDialog } from '../ui/index.jsx';
import { ComposeBox, CommentThread, useMentionUsers } from '../ui/ComposeBox.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { crm } from './crmApi.js';
import { useDialog } from '../lib/nav.js';
import { REL_META, completenessColor } from './crmMeta.js';

// Compara o estado atual do formulário com o do primeiro render: só quem mexeu em algo está "sujo".
export function useDirty(value) {
  const base = useRef(null);
  const json = JSON.stringify(value);
  if (base.current === null) base.current = json;
  return json !== base.current;
}

// `guard(fn)` devolve uma função que roda `fn` direto quando não há alterações e, havendo, pede confirmação antes.
export function useDraftGuard(dirty, message) {
  const [pending, setPending] = useState(null);
  const guard = useCallback((fn) => () => { if (dirty) setPending({ fn }); else fn(); }, [dirty]);
  const dialog = pending ? (
    <ConfirmDialog title="Descartar alterações?" message={message || 'Você tem alterações que ainda não foram salvas. Se descartar, elas serão perdidas.'}
      confirmLabel="Descartar" cancelLabel="Continuar editando" danger
      onConfirm={() => { const { fn } = pending; setPending(null); fn(); }} onCancel={() => setPending(null)} />
  ) : null;
  return { guard, dialog };
}

const ModalCtx = createContext({ requestClose: () => {}, locked: false });

// `dirty`: há alterações não salvas — Esc, X e Cancelar pedem confirmação. `locked`: operação em andamento — nada fecha.
// Esc, Voltar do navegador e X passam todos por `requestClose` (respeita `dirty` e `locked`); useDialog cuida de foco preso e Esc em pilha.
export function Modal({ title, onClose, children, width, dirty, locked }) {
  const { guard, dialog } = useDraftGuard(dirty);
  const requestClose = useCallback(() => { if (!locked) guard(onClose)(); }, [locked, guard, onClose]);
  const dlg = useDialog(requestClose);
  useEffect(() => {
    const el = dlg.ref.current;
    const a = document.activeElement;
    if (!el || (a && a !== el && !(a.matches && a.matches('button')))) return;
    const f = el.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ModalCtx.Provider value={{ requestClose, locked: !!locked }}>
      <div className="crm-modal-overlay">
        <div className="crm-modal" style={width ? { width } : undefined} {...dlg} aria-label={title}>
          <h2 className="crm-modal-title"><span>{title}</span><button type="button" className="crm-icon-btn" onClick={requestClose} disabled={locked} title={locked ? 'Aguarde terminar' : 'Fechar'} aria-label="Fechar"><X size={16} aria-hidden="true" /></button></h2>
          {children}
        </div>
      </div>
      {dialog}
    </ModalCtx.Provider>
  );
}

export function CancelButton({ children = 'Cancelar' }) {
  const { requestClose, locked } = useContext(ModalCtx);
  return <button type="button" className="crm-btn" onClick={requestClose} disabled={locked} title={locked ? 'Aguarde terminar' : undefined}>{children}</button>;
}

export function Field({ label, children, full }) {
  return <div className={`crm-field${full ? ' full' : ''}`}><label>{label}</label>{children}</div>;
}

export function RelPill({ value }) {
  const m = REL_META[value] || { label: value, color: 'var(--text-5)' };
  return <span className="crm-pill" style={{ color: m.color }}>{m.label}</span>;
}

export function CompletenessBar({ percent }) {
  const c = completenessColor(percent);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span className="crm-bar"><span style={{ width: `${percent}%`, background: c }} /></span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
    </span>
  );
}

// Mostra o resultado de uma checagem de duplicidade vinda do servidor.
export function DuplicatesAlert({ duplicates, blocking, onOpenCompany }) {
  if (!duplicates) return null;
  const exact = duplicates.exactCnpj;
  const names = duplicates.byName || [];
  const contacts = duplicates.contacts || [];
  if (!exact && !names.length && !contacts.length) return null;
  return (
    <div className={`crm-alert ${blocking ? 'crm-alert-danger' : 'crm-alert-warn'}`}>
      <strong>{blocking ? 'Já existe uma empresa com este CNPJ.' : 'Possível registro duplicado.'}</strong>
      {exact && (
        <div style={{ marginTop: 6 }}>
          <button type="button" className="crm-btn" onClick={() => onOpenCompany && onOpenCompany(exact.id)}>Abrir {exact.legalName}</button>
        </div>
      )}
      {names.map((n) => (
        <div key={n.id} style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Parecida com <b>{n.legalName}</b>{n.cnpj ? ` (${n.cnpj})` : ''}</span>
          {onOpenCompany && <button type="button" className="crm-btn" onClick={() => onOpenCompany(n.id)}>Abrir</button>}
        </div>
      ))}
      {contacts.map((c) => (
        <div key={c.id} style={{ marginTop: 6 }}>Contato parecido: <b>{c.name}</b>{c.email ? ` · ${c.email}` : ''} — {c.companyName}</div>
      ))}
    </div>
  );
}

// Notas do CRM (Onda 3): o mesmo compositor/lista de todo módulo. O servidor recusa anexo acima de 3 MB e mais de 5 por nota.
export function NoteComposer({ about, placeholder, draftKey, onDirtyChange, onAdded }) {
  const users = useMentionUsers();
  async function submit({ text, mentions, attachments, links }) {
    await crm.addNote({ ...about, body: text, attachments, links, mentions });
    try { if (onAdded) await onAdded(); } catch (e) { /* a nota já foi gravada: não manter o rascunho */ }
  }
  return (
    <ComposeBox onSubmit={submit} mentionCandidates={users} submitLabel="Adicionar nota" placeholder={placeholder} draftKey={draftKey}
      maxFileBytes={3 * 1024 * 1024} maxFiles={5} onDirtyChange={onDirtyChange} />
  );
}

export function NoteThread({ notes, currentUserId, canModerate, onChanged, showContext }) {
  const users = useMentionUsers();
  const comments = notes.map((n) => {
    const ctx = showContext ? `${n.contactName ? ` · sobre ${n.contactName}` : ''}${n.dealTitle ? ` · sobre o negócio ${n.dealTitle}` : ''}` : '';
    return { id: n.id, text: n.body, ts: n.createdAt, author: `${n.createdByName || 'Alguém'}${ctx}`, authorId: n.createdBy, attachments: n.attachments || [], links: n.links || [], editedAt: n.editedAt };
  });
  async function edit(id, text) {
    await crm.updateNote(id, { body: text });
    if (onChanged) await onChanged();
  }
  async function remove(id) {
    if (!(await askConfirm({ title: 'Remover esta nota?', message: 'O registro de que ela existiu continua no histórico.', confirmLabel: 'Remover', danger: true }))) return;
    try { await crm.deleteNote(id); if (onChanged) await onChanged(); } catch (e) { notify((e && e.message) || 'Não foi possível concluir.', { tone: 'error' }); }
  }
  return <CommentThread comments={comments} currentUserId={currentUserId} canModerate={canModerate} onEdit={edit} onDelete={remove} mentionNames={users.map((u) => u.name)} />;
}
