// Edição direta na célula (§94): clicar e digitar/escolher salva na hora, sem abrir formulário. Esc cancela. Não propaga o clique (a linha abre a ficha).
import React, { useEffect, useRef, useState } from 'react';
import { fmtMoney, moneyToNumber } from './crmMeta.js';
import { DateField } from '../ui/DateTimeFields.jsx';

const stop = (e) => e.stopPropagation();
const numStr = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));

export function InlineMoney({ value, disabled, disabledTitle, label, onSave }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (edit && ref.current) ref.current.select(); }, [edit]);
  const commit = () => {
    setEdit(false);
    const n = moneyToNumber(v);
    if (n == null || Number.isNaN(n) || n === Number(value || 0)) return;
    onSave(n);
  };
  if (disabled) return <span onClick={stop} title={disabledTitle}>{value ? fmtMoney(value) : <span className="crm-muted">—</span>}</span>;
  return (
    <span onClick={stop} onKeyDown={stop}>
      {edit
        ? <input ref={ref} inputMode="decimal" aria-label={`Valor — ${label}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(false); }} style={{ width: 96, textAlign: 'right' }} />
        : <button type="button" className="crm-inline" title="Clique para editar o valor" aria-label={`Editar o valor de ${label}`} onClick={() => { setV(value ? numStr(value) : ''); setEdit(true); }}>{value ? fmtMoney(value) : <span className="crm-muted">definir</span>}</button>}
    </span>
  );
}

export function InlineDate({ value, disabled, disabledTitle, label, overdue, onSave }) {
  return (
    <span onClick={stop} onKeyDown={stop} style={{ display: 'inline-block', minWidth: 150 }}>
      <DateField value={value || ''} disabled={disabled} ariaLabel={`Previsão de fechamento — ${label}`} allowClear onChange={(v) => { if (v !== (value || '')) onSave(v || null); }} className={overdue ? 'dt-overdue' : ''} />
    </span>
  );
}

export function InlineSelect({ value, options, disabled, disabledTitle, label, empty, onSave, width }) {
  return (
    <span onClick={stop} onKeyDown={stop}>
      <select className="crm-inline-input" value={value || ''} disabled={disabled} title={disabled ? disabledTitle : undefined} aria-label={label} onChange={(e) => { if (e.target.value !== (value || '')) onSave(e.target.value); }} style={{ maxWidth: width || 150 }}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </span>
  );
}
