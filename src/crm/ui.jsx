// Peças de UI compartilhadas do CRM.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { REL_META, completenessColor } from './crmMeta.js';

export function useEsc(onClose) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Modal({ title, onClose, children, width }) {
  useEsc(onClose);
  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" style={width ? { width } : undefined} role="dialog" aria-label={title}>
        <h2 className="crm-modal-title"><span>{title}</span><button type="button" className="crm-icon-btn" onClick={onClose} title="Fechar"><X size={16} /></button></h2>
        {children}
      </div>
    </div>
  );
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
