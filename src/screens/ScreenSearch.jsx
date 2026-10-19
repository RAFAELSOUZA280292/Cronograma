// Busca da tela aberta (2026-10-19): campo na barra de abas da empresa e aviso "filtrando" no topo do conteúdo. A lógica de casar texto fica em src/lib/screenSearch.js.
import { Search, X } from 'lucide-react';
import React from 'react';

const CSS = `
.ss-box{position:relative;display:flex;align-items:center;flex:0 0 auto}
.ss-in{box-sizing:border-box;width:230px;height:34px;padding:0 30px 0 30px;border:1px solid var(--border-3);border-radius:8px;background:var(--bg-2);color:var(--text-1);font:inherit;font-size:12.5px}
.ss-in:focus{outline:2px solid #3ea6ff;outline-offset:1px}
.ss-in::-webkit-search-cancel-button{display:none}
.ss-clear{all:unset;position:absolute;right:4px;top:50%;transform:translateY(-50%);width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;color:var(--text-4)}
.ss-clear:hover{background:var(--bg-4);color:var(--text-1)}
.ss-clear:focus-visible{outline:2px solid #3ea6ff}
@media (max-width:767px){.ss-box{width:100%}.ss-in{width:100%;height:40px;font-size:14px}}
`;

export function ScreenSearchBox({ value, onChange, placeholder }) {
  return (
    <div className="ss-box no-print">
      <style>{CSS}</style>
      <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-5)', pointerEvents: 'none' }} />
      <input
        className="ss-in"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        placeholder={placeholder}
        aria-label={`${placeholder} (só nesta tela)`}
        title="Filtra só o que está nesta tela"
        autoComplete="off"
      />
      {value ? <button type="button" className="ss-clear" aria-label="Limpar a busca" onClick={() => onChange('')}><X size={14} /></button> : null}
    </div>
  );
}

export function ScreenSearchNote({ value, shown, total, noun, onClear }) {
  if (!value.trim()) return null;
  return (
    <div role="status" className="no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, margin: '0 0 12px', padding: '8px 12px', border: '1px solid #3ea6ff66', background: 'rgba(62,166,255,.10)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
      <span>
        Esta tela está filtrada por <b>“{value.trim()}”</b>: {shown === 0 ? `nenhum${noun.fem ? 'a' : ''} ${noun.one} encontrad${noun.fem ? 'a' : 'o'}` : `${shown} de ${total} ${total === 1 ? noun.one : noun.many}`}.
      </span>
      <button type="button" onClick={onClear} style={{ all: 'unset', cursor: 'pointer', color: '#3ea6ff', fontWeight: 700, textDecoration: 'underline', padding: '4px 2px' }}>Limpar busca</button>
    </div>
  );
}
