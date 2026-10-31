// Tabela profissional (Onda 3, U3): peças que se encaixam nas tabelas que já existem (o `<table>` e as células de cada módulo ficam como estão):
// seleção em massa (clique, Shift para intervalo, marcar todas), faixa de ações em lote, escolha de colunas guardada por tabela e cabeçalho fixo.
// A lógica está em tableLogic.js (pura e testada); aqui só há estado de React e apresentação.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, X } from 'lucide-react';
import { clickRow, headerState, toggleAll, pruneSelection, parseHidden, defaultHidden, visibleColumns, toggleColumn } from './tableLogic.js';
import { Button } from './index.jsx';

export function useRowSelection(rows, getKey) {
  const keys = useMemo(() => rows.map(getKey), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState(() => new Set());
  const anchor = useRef(null);
  useEffect(() => { setSelected((s) => pruneSelection(s, keys)); }, [keys]);
  const onRowCheck = useCallback((key, e) => {
    setSelected((s) => { const r = clickRow(s, keys, key, { shift: !!(e && e.shiftKey), anchor: anchor.current }); anchor.current = r.anchor; return r.selected; });
  }, [keys]);
  const header = headerState(selected, keys);
  return {
    selected, count: header.count, header, keys,
    isSelected: (key) => selected.has(key),
    selectedRows: rows.filter((r) => selected.has(getKey(r))),
    onRowCheck,
    toggleAllRows: () => setSelected((s) => toggleAll(s, keys)),
    clear: () => { anchor.current = null; setSelected(new Set()); },
  };
}

// Células de seleção. O clique no checkbox nunca abre a linha (stopPropagation); o foco vai para o próprio checkbox.
export function SelectHeadCell({ state, onToggle, label = 'Selecionar todas as linhas desta página' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state.indeterminate; }, [state.indeterminate]);
  return <th className="ui-tk-sel"><input ref={ref} type="checkbox" checked={state.checked} onChange={onToggle} aria-label={label} /></th>;
}
export function SelectCell({ checked, onCheck, label }) {
  return <td className="ui-tk-sel" onClick={(e) => { e.stopPropagation(); onCheck(e); }}><input type="checkbox" checked={checked} onChange={() => {}} onClick={(e) => { e.stopPropagation(); onCheck(e); }} aria-label={label} /></td>;
}

// Faixa de ações em lote: aparece só com linhas marcadas; mostra quantas e oferece limpar. As ações entram como filhos.
export function BulkBar({ count, noun = { one: 'selecionado', many: 'selecionados' }, onClear, children }) {
  if (!count) return null;
  return (
    <div className="ui-tk-bulk" role="region" aria-label="Ações em lote">
      <strong>{count} {count === 1 ? noun.one : noun.many}</strong>
      <div className="ui-tk-bulk-acts">{children}</div>
      <Button size="sm" icon={X} onClick={onClear}>Limpar seleção</Button>
    </div>
  );
}

// Colunas escolhidas por tabela, guardadas no navegador (preferência de conforto: se o armazenamento falhar, a tabela segue com o padrão).
export function useColumns(storageKey, columns) {
  const key = `ptx-cols:${storageKey}`;
  const [hidden, setHidden] = useState(() => {
    try { const raw = window.localStorage.getItem(key); return raw == null ? defaultHidden(columns) : parseHidden(raw, columns); } catch { return defaultHidden(columns); }
  });
  const save = (next) => { setHidden(next); try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* sem armazenamento */ } };
  return { hidden, visible: visibleColumns(columns, hidden), toggle: (k) => save(toggleColumn(hidden, columns, k)), reset: () => save(defaultHidden(columns)) };
}

export function ColumnPicker({ columns, hidden, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="ui-tk-cols" ref={box}>
      <Button size="sm" icon={Columns3} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Colunas</Button>
      {open && (
        <div className="ui-tk-pop" role="group" aria-label="Colunas visíveis">
          {columns.map((c) => (
            <label key={c.key} className={c.hideable === false ? 'fixed' : ''}>
              <input type="checkbox" checked={c.hideable === false || !hidden.includes(c.key)} disabled={c.hideable === false} onChange={() => onToggle(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
          <button type="button" className="ui-tk-reset" onClick={onReset}>Voltar ao padrão</button>
        </div>
      )}
    </div>
  );
}
