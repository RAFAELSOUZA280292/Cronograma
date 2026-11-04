// Anexos do e-mail com pré-visualização (2026-11-04, §166; Rafael: "crie a pré-visualização dessas imagens e anexos"). Usado na leitura
// da Caixa (MailScreen) e na aba E-mails do CRM (MailLinks). Cada anexo vira um cartão: imagem com miniatura; os demais com o tipo
// (PDF, Word, Excel, Convite, XML…). Clicar abre a janela de visualização (setas ← → passam para o próximo anexo); o ícone de
// download continua baixando direto. O servidor converte (server/mailPreview.js): imagem e PDF vêm como estão, Word/Excel/texto em JSON.
import React, { useEffect, useMemo, useState } from 'react';
import { Paperclip, Download, FileText, FileSpreadsheet, CalendarDays, FileCode, File as FileIcon, ChevronLeft, ChevronRight, ExternalLink, Eye } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { IconButton } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { isTypingTarget } from '../shell/shortcuts.js';
import MailFrame from './MailFrame.jsx';
import { previewKind, kindLabel, previewUrl, extOf } from '../../shared/attachmentPreview.js';
import './attachments.css';

const fmtSize = (n) => (!n ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

function TypeIcon({ a, size = 18 }) {
  const k = previewKind(a.filename, a.mimeType);
  const ext = extOf(a.filename);
  const Icon = ext === 'ics' ? CalendarDays : k === 'sheet' ? FileSpreadsheet : ext === 'xml' || ext === 'json' ? FileCode : k ? FileText : FileIcon;
  return <Icon size={size} aria-hidden="true" />;
}

function Thumb({ a }) {
  const [broken, setBroken] = useState(false);
  if (previewKind(a.filename, a.mimeType) !== 'image' || broken) {
    const k = previewKind(a.filename, a.mimeType);
    return <span className={`mail-att-tile k-${k || 'file'}`}><TypeIcon a={a} size={22} /><span>{kindLabel(a.filename, a.mimeType)}</span></span>;
  }
  return <img className="mail-att-thumb" src={previewUrl(a.url, a.mimeType)} alt="" loading="lazy" onError={() => setBroken(true)} />;
}

export function AttachmentList({ items, className = '' }) {
  const [open, setOpen] = useState(-1);
  if (!items || !items.length) return null;
  return (
    <>
      <ul className={`mail-atts ${className}`} aria-label="Anexos">
        {items.map((a, i) => {
          const can = !!previewKind(a.filename, a.mimeType);
          return (
            <li key={a.key || a.url} className="mail-att-card">
              <button type="button" className="mail-att-open" onClick={() => (can ? setOpen(i) : window.location.assign(a.url))}
                title={can ? `Pré-visualizar ${a.filename}` : `Baixar ${a.filename} (sem pré-visualização para este tipo)`}>
                <Thumb a={a} />
                <span className="mail-att-foot">
                  <Paperclip size={13} aria-hidden="true" />
                  <span className="mail-att-name">{a.filename}</span>
                </span>
              </button>
              <span className="mail-att-meta">
                <span className="mail-att-size">{fmtSize(a.size)}</span>
                {can && <button type="button" className="mail-att-icon" aria-label={`Pré-visualizar ${a.filename}`} title="Pré-visualizar" onClick={() => setOpen(i)}><Eye size={14} aria-hidden="true" /></button>}
                <a className="mail-att-icon" href={a.url} download={a.filename} aria-label={`Baixar ${a.filename}`} title="Baixar"><Download size={14} aria-hidden="true" /></a>
              </span>
            </li>
          );
        })}
      </ul>
      {open >= 0 && items[open] && <AttachmentViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </>
  );
}

// Só os anexos que abrem na janela entram nas setas.
export function AttachmentViewer({ items, index, onIndex, onClose }) {
  const a = items[index];
  const order = useMemo(() => items.map((x, i) => (previewKind(x.filename, x.mimeType) ? i : -1)).filter((i) => i >= 0), [items]);
  const pos = order.indexOf(index);
  const prev = pos > 0 ? order[pos - 1] : -1;
  const next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : -1;

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' && prev >= 0) { e.preventDefault(); onIndex(prev); }
      if (e.key === 'ArrowRight' && next >= 0) { e.preventDefault(); onIndex(next); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onIndex]);

  const header = (
    <div className="mail-pv-head">
      <TypeIcon a={a} />
      <div className="mail-pv-titles">
        <h2 className="ui-frame-title mail-pv-name" title={a.filename}>{a.filename}</h2>
        <div className="ui-frame-sub">{[kindLabel(a.filename, a.mimeType), fmtSize(a.size), order.length > 1 ? `${pos + 1} de ${order.length}` : ''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
  const actions = (
    <>
      {order.length > 1 && <IconButton label="Anexo anterior (←)" icon={ChevronLeft} onClick={() => onIndex(prev)} disabled={prev < 0} disabledReason="Este é o primeiro" />}
      {order.length > 1 && <IconButton label="Próximo anexo (→)" icon={ChevronRight} onClick={() => onIndex(next)} disabled={next < 0} disabledReason="Este é o último" />}
      <a className="ui-btn sm mail-pv-dl" href={a.url} download={a.filename}><Download size={14} aria-hidden="true" /> Baixar</a>
    </>
  );
  return (
    <Modal header={header} label={`Pré-visualização de ${a.filename}`} actions={actions} onClose={onClose} size="lg" className="mail-pv" layer="over-modal" history={false}>
      <PreviewBody key={a.url} a={a} />
    </Modal>
  );
}

function PreviewBody({ a }) {
  const kind = previewKind(a.filename, a.mimeType);
  const url = previewUrl(a.url, a.mimeType);
  const [state, setState] = useState({ loading: true });
  const [sheet, setSheet] = useState(0);

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    (async () => {
      try {
        if (kind === 'image' || kind === 'pdf') {
          // Busca antes de mostrar: um erro do servidor vira mensagem, não um quadro com texto cru.
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) { let m = ''; try { m = (await res.json()).message; } catch { /* sem corpo */ } throw new Error(m || 'Não consegui abrir a pré-visualização. Baixe para abrir.'); }
          objectUrl = URL.createObjectURL(await res.blob());
          if (alive) setState({ src: objectUrl });
        } else {
          const data = await apiGet(url);
          if (alive) setState({ data });
        }
      } catch (e) { if (alive) setState({ error: e.message || 'Não consegui abrir a pré-visualização. Baixe para abrir.' }); }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, kind]);

  if (state.loading) return <div className="mail-pv-empty" role="status">Abrindo {a.filename}…</div>;
  if (state.error) return <div className="mail-pv-empty" role="alert"><p>{state.error}</p><a className="ui-btn sm primary" href={a.url} download={a.filename}><Download size={14} aria-hidden="true" /> Baixar</a></div>;
  if (kind === 'image') return <div className="mail-pv-img"><img src={state.src} alt={a.filename} /></div>;
  if (kind === 'pdf') {
    return (
      <div className="mail-pv-pdf">
        <iframe src={state.src} title={`PDF ${a.filename}`} />
        <a className="mail-pv-newtab" href={state.src} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden="true" /> Abrir em outra aba</a>
      </div>
    );
  }
  const d = state.data || {};
  if (d.kind === 'html') return <div className="mail-pv-doc">{d.html ? <MailFrame html={d.html} title={`Documento ${a.filename}`} minHeight={300} /> : <p className="mail-pv-empty">O documento está vazio.</p>}</div>;
  if (d.kind === 'text') {
    return (
      <div className="mail-pv-text">
        {d.event && <IcsSummary ev={d.event} />}
        {d.event ? <details className="mail-pv-raw"><summary>Ver o arquivo como texto</summary><pre>{d.text}</pre></details> : <pre>{d.text || '(arquivo vazio)'}</pre>}
        {d.truncated && <p className="mail-pv-note">Mostrando o começo do arquivo. Baixe para ver tudo.</p>}
      </div>
    );
  }
  if (d.kind === 'sheet') {
    const sheets = d.sheets || [];
    const s = sheets[Math.min(sheet, sheets.length - 1)];
    return (
      <div className="mail-pv-sheet">
        {sheets.length > 1 && (
          <div className="mail-pv-tabs" role="tablist" aria-label="Planilhas">
            {sheets.map((x, i) => <button key={x.name + i} type="button" role="tab" aria-selected={i === sheet} className={i === sheet ? 'on' : ''} onClick={() => setSheet(i)}>{x.name}</button>)}
          </div>
        )}
        {!s || !s.rows.length ? <p className="mail-pv-empty">Planilha vazia.</p> : (
          <div className="mail-pv-grid">
            <table>
              <tbody>
                {s.rows.map((r, i) => <tr key={i}><th scope="row">{i + 1}</th>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
        {(s && s.more) || d.moreSheets ? <p className="mail-pv-note">Mostrando as primeiras linhas{d.moreSheets ? ' e planilhas' : ''}. Baixe para ver tudo.</p> : null}
      </div>
    );
  }
  return <div className="mail-pv-empty"><p>Sem pré-visualização para este arquivo.</p><a className="ui-btn sm primary" href={a.url} download={a.filename}><Download size={14} aria-hidden="true" /> Baixar</a></div>;
}

// Data e hora em Brasília: "sex., 20 de nov. de 2026, 18:30 – 06:30 (sáb.)".
const BR = 'America/Sao_Paulo';
function fmtWhen(ev) {
  const s = new Date(ev.start); const e = ev.end ? new Date(ev.end) : null;
  if (Number.isNaN(s.getTime())) return '';
  if (ev.allDay || /^\d{4}-\d{2}-\d{2}$/.test(String(ev.start))) return s.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const day = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: BR });
  const hour = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BR });
  if (!e || Number.isNaN(e.getTime())) return `${day(s)}, ${hour(s)}`;
  return day(s) === day(e) ? `${day(s)}, ${hour(s)} – ${hour(e)}` : `${day(s)}, ${hour(s)} – ${day(e)}, ${hour(e)}`;
}
function IcsSummary({ ev }) {
  return (
    <div className="mail-pv-ics">
      <CalendarDays size={22} aria-hidden="true" />
      <div>
        <div className="mail-pv-ics-title">{ev.title}</div>
        <div>{fmtWhen(ev)} <span className="mail-pv-ics-tz">(horário de Brasília)</span></div>
        {ev.location && <div>{ev.location}</div>}
        {ev.description && <p className="mail-pv-ics-desc">{ev.description}</p>}
      </div>
    </div>
  );
}

export default AttachmentList;
