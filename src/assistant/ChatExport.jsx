// Botões de copiar e exportar a conversa da RENATA (2026-10-27) — usados pelas três telas (do projeto, geral e operacional).
// O CSS (CHAT_EXPORT_CSS) é renderizado pela tela que usa estes botões. `getData()` devolve { title, subtitle, messages } já na forma de chatExport.js; é lido só na hora do clique.
import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { loadXlsx } from '../lib/xlsxLoader.js';
import { notify } from '../ui/dialogs.jsx';
import { EXPORT_FORMATS, conversationHtml, conversationJson, conversationRows, conversationText, exportFileName, messageText } from './chatExport.js';

export const CHAT_EXPORT_CSS = `
.cx-copy { display:inline-flex; align-items:center; gap:4px; border:none; background:transparent; color:var(--text-5); font:inherit; font-size:11px; cursor:pointer; padding:3px 4px; border-radius:6px; }
.cx-copy:hover { color:var(--text-1); background:var(--bg-3); }
.cx-copy:focus-visible, .cx-bar button:focus-visible, .cx-menu .cx-item:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
.cx-wrap { display:flex; flex-direction:column; gap:1px; max-width:94%; min-width:0; }
.cx-wrap.user { align-self:flex-end; align-items:flex-end; } .cx-wrap.bot { align-self:flex-start; align-items:flex-start; }
.cx-wrap > .rnh-msg, .cx-wrap > .rnc-msg { max-width:100%; align-self:auto; }
.cx-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.cx-bar > button, .cx-bar .cx-menu-btn { display:inline-flex; align-items:center; gap:6px; min-height:32px; padding:0 11px; border:1px solid var(--border-3); border-radius:8px; background:transparent; color:var(--text-2); font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
.cx-bar > button:hover:not(:disabled), .cx-bar .cx-menu-btn:hover:not(:disabled) { background:var(--bg-3); color:var(--text-1); }
.cx-bar button:disabled { opacity:.5; cursor:default; }
.cx-pop { position:relative; display:inline-flex; }
.cx-menu { position:absolute; top:calc(100% + 4px); right:0; z-index:300; min-width:218px; padding:5px; border:1px solid var(--border-3); border-radius:10px; background:var(--bg-2); box-shadow:0 12px 32px rgba(0,0,0,.35); display:flex; flex-direction:column; text-align:left; }
.cx-bar .cx-menu { right:auto; left:0; }
.cx-menu .cx-item { display:flex; align-items:center; gap:8px; width:100%; padding:9px 10px; border:none; border-radius:7px; background:transparent; color:var(--text-2); font:inherit; font-size:13px; text-align:left; cursor:pointer; min-height:36px; }
.cx-menu .cx-item:hover { background:var(--bg-3); color:var(--text-1); }
.cx-menu .cx-label { padding:5px 10px 3px; font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--text-5); }
`;

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowStr = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); notify(okMsg); return true; } catch (e) { notify('Não foi possível copiar. Selecione o texto e copie.', { tone: 'error' }); return false; }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Copiar UMA mensagem (a pergunta ou a resposta, isolada).
export function CopyMessageButton({ message, label = 'Copiar' }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    if (await copyText(messageText(message), message.role === 'user' ? 'Pergunta copiada.' : 'Resposta copiada.')) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1800); }
  }
  return (
    <button type="button" className="cx-copy" onClick={copy} aria-label={message.role === 'user' ? 'Copiar esta pergunta' : 'Copiar esta resposta'} title={message.role === 'user' ? 'Copiar só esta pergunta' : 'Copiar só esta resposta'}>
      {done ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}{label && <span>{done ? 'Copiado' : label}</span>}
    </button>
  );
}

// Copiar a conversa toda + menu de exportação. `variant="bar"` mostra texto nos botões; "icons" só os ícones (cabeçalho da RENATA do projeto).
export default function ChatExport({ getData, variant = 'bar' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); };
  }, [open]);

  const read = () => ({ ...getData(), exportedAt: nowStr() });

  async function copyAll() {
    const d = read();
    if (!d.messages.length) { notify('Não há conversa para copiar.', { tone: 'error' }); return; }
    await copyText(conversationText(d), 'Conversa copiada — é só colar.');
  }

  async function run(fmt) {
    setOpen(false);
    const d = read();
    if (!d.messages.length) { notify('Não há conversa para exportar.', { tone: 'error' }); return; }
    const name = (ext) => exportFileName(d.title, ext, todayStr());
    try {
      if (fmt === 'txt') download(new Blob([conversationText(d)], { type: 'text/plain;charset=utf-8' }), name('txt'));
      else if (fmt === 'md') download(new Blob([conversationText(d, { markdown: true })], { type: 'text/markdown;charset=utf-8' }), name('md'));
      else if (fmt === 'json') download(new Blob([conversationJson(d)], { type: 'application/json;charset=utf-8' }), name('json'));
      else if (fmt === 'doc') download(new Blob(['﻿', conversationHtml(d, { word: true })], { type: 'application/msword;charset=utf-8' }), name('doc'));
      else if (fmt === 'pdf') {
        const w = window.open('', '_blank');
        if (!w) { notify('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.', { tone: 'error' }); return; }
        w.document.open(); w.document.write(conversationHtml(d)); w.document.close(); w.focus();
        setTimeout(() => { try { w.print(); } catch (e) { /* o usuário imprime pelo menu */ } }, 400);
        return;
      } else if (fmt === 'xlsx') {
        setBusy('xlsx');
        const XLSX = await loadXlsx();
        const ws = XLSX.utils.json_to_sheet(conversationRows(d));
        ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 17 }, { wch: 110 }, { wch: 50 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Conversa');
        XLSX.writeFile(wb, name('xlsx'));
      }
      notify('Conversa exportada.');
    } catch (e) { notify('Não foi possível exportar agora. Tente de novo.', { tone: 'error' }); } finally { setBusy(''); }
  }

  const icons = variant === 'icons';
  const menu = open && (
    <div className="cx-menu" role="menu" aria-label="Exportar a conversa">
      <div className="cx-label">Exportar conversa</div>
      {EXPORT_FORMATS.map(([k, label]) => (
        <button key={k} type="button" role="menuitem" className="cx-item" onClick={() => run(k)}><Download size={13} aria-hidden="true" /> {label}</button>
      ))}
    </div>
  );
  return (
    <>
      <span className={icons ? undefined : 'cx-bar'} style={icons ? { display: 'contents' } : undefined}>
        <button type="button" onClick={copyAll} aria-label="Copiar a conversa toda" title="Copiar a conversa toda"><Copy size={icons ? 16 : 13} aria-hidden="true" />{!icons && ' Copiar conversa'}</button>
        <span className="cx-pop" ref={wrapRef}>
          <button type="button" className={icons ? undefined : 'cx-menu-btn'} aria-haspopup="menu" aria-expanded={open} disabled={busy === 'xlsx'} onClick={() => setOpen((v) => !v)} aria-label="Exportar a conversa" title="Exportar a conversa (Word, PDF, Excel, texto…)">
            <Download size={icons ? 16 : 13} aria-hidden="true" />{!icons && ' Exportar'}
          </button>
          {menu}
        </span>
      </span>
    </>
  );
}
