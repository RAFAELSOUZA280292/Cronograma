// Janela de escrita da Caixa de e-mail (2026-11-02, Fase 2): novo, responder, responder a todos e encaminhar. No computador
// fica no canto da tela (dá para continuar lendo a lista); no celular ocupa a tela toda. O servidor (POST /api/mail/send,
// server/mailCompose.js) monta o e-mail compatível com Outlook/celular, cola a assinatura e cita a mensagem original —
// aqui só aparece a prévia de ambos.
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Quote, Paperclip, Send, Trash2, X, PenLine, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, IconButton, BusyBar } from '../ui/index.jsx';
import { askConfirm, askText, notify } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import MailFrame from './MailFrame.jsx';

export const MAX_ATTACH_BYTES = 20 * 1024 * 1024;
const TITLES = { new: 'Nova mensagem', reply: 'Responder', replyAll: 'Responder a todos', forward: 'Encaminhar' };

export function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const addrText = (list) => (list || []).map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(', ');

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Não consegui ler o arquivo ${file.name}.`));
    r.readAsDataURL(file);
  });
}

function MailEditor({ onReady, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: 'Escreva a mensagem…' }),
    ],
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': 'Mensagem', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? '' : ed.getHTML()),
  }, []);
  useEffect(() => { if (editor) onReady(editor); }, [editor, onReady]);
  if (!editor) return null;
  const keep = (e) => e.preventDefault();
  async function setLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = await askText({ title: 'Inserir link', label: 'Endereço do link (deixe vazio para remover)', defaultValue: prev, confirmLabel: 'Aplicar', required: false });
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url.trim()) chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}` }).run();
    else chain.unsetLink().run();
  }
  const btn = (on, name, onClick, icon) => (
    <button type="button" className={`mc-btn${on ? ' on' : ''}`} aria-label={name} aria-pressed={on} title={name} onMouseDown={keep} onClick={onClick}>{React.createElement(icon, { size: 15, 'aria-hidden': 'true' })}</button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="mc-editor">
      <div className="mc-tools" role="toolbar" aria-label="Formatação do texto">
        {btn(editor.isActive('bold'), 'Negrito (Ctrl+B)', () => c().toggleBold().run(), Bold)}
        {btn(editor.isActive('italic'), 'Itálico (Ctrl+I)', () => c().toggleItalic().run(), Italic)}
        {btn(editor.isActive('underline'), 'Sublinhado (Ctrl+U)', () => c().toggleUnderline().run(), Underline)}
        {btn(editor.isActive('bulletList'), 'Lista com marcadores', () => c().toggleBulletList().run(), List)}
        {btn(editor.isActive('orderedList'), 'Lista numerada', () => c().toggleOrderedList().run(), ListOrdered)}
        {btn(editor.isActive('blockquote'), 'Citação', () => c().toggleBlockquote().run(), Quote)}
        {btn(editor.isActive('link'), 'Link', setLink, Link2)}
      </div>
      <EditorContent editor={editor} className="mc-body" />
    </div>
  );
}

export default function Compose({ init, signature, isMobile, onClose, onSent, onEditSignature }) {
  const mode = init.mode || 'new';
  const [ctx, setCtx] = useState(mode === 'new' ? { to: init.to || [], cc: [], subject: '', attachments: [] } : null);
  const [loadError, setLoadError] = useState('');
  const [to, setTo] = useState(addrText(init.to));
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [files, setFiles] = useState([]);
  const [keepParts, setKeepParts] = useState(() => new Set());
  const [includeQuote, setIncludeQuote] = useState(true);
  const [showQuote, setShowQuote] = useState(false);
  const [useSig, setUseSig] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editorRef = useRef(null);
  const toRef = useRef(null);
  const fileRef = useRef(null);
  const initialSubject = useRef('');

  useEffect(() => {
    if (mode === 'new') { setTimeout(() => toRef.current && toRef.current.focus(), 0); return undefined; }
    let alive = true;
    apiGet(`/api/mail/compose?mode=${mode}&messageId=${encodeURIComponent(init.messageId)}`).then((d) => {
      if (!alive) return;
      setCtx(d);
      setTo(addrText(d.to)); setCc(addrText(d.cc)); setShowCc(d.cc.length > 0);
      setSubject(d.subject); initialSubject.current = d.subject;
      setKeepParts(new Set(d.attachments.map((a) => a.partId)));
      setTimeout(() => (mode === 'forward' ? toRef.current && toRef.current.focus() : editorRef.current && editorRef.current.commands.focus('start')), 0);
    }).catch((e) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, [mode, init.messageId]);

  const sigOk = !!(signature && signature.previewHtml && signature.signature && signature.signature.enabled);
  useEffect(() => { setUseSig(sigOk); }, [sigOk]);

  const forwardList = (ctx && ctx.attachments) || [];
  const keptForward = forwardList.filter((a) => keepParts.has(a.partId));
  const totalBytes = files.reduce((n, f) => n + f.size, 0) + keptForward.reduce((n, a) => n + (a.size || 0), 0);
  const dirty = !!(html || files.length || (mode === 'new' && (to.trim() || subject.trim())) || cc.trim() !== addrText(ctx && ctx.cc) || subject !== initialSubject.current);

  async function close() {
    if (busy) return;
    if (dirty && !(await askConfirm({ title: 'Descartar esta mensagem?', message: 'O que você escreveu será perdido.', confirmLabel: 'Descartar', danger: true }))) return;
    onClose();
  }

  async function addFiles(list) {
    const picked = [...list];
    if (!picked.length) return;
    const sum = totalBytes + picked.reduce((n, f) => n + f.size, 0);
    if (sum > MAX_ATTACH_BYTES) {
      notify(`Os anexos somariam ${fmtSize(sum)} e o limite é 20 MB por e-mail. Para arquivos maiores, mande um link do Google Drive.`, { tone: 'error' });
      return;
    }
    try {
      const read = await Promise.all(picked.map(async (f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, filename: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, data: await readAsBase64(f) })));
      setFiles((prev) => [...prev, ...read]);
    } catch (e) { notify(e.message, { tone: 'error' }); }
  }

  async function send() {
    if (busy) return;
    setError('');
    if (!to.trim() && !cc.trim() && !bcc.trim()) { setError('Informe ao menos um destinatário.'); toRef.current && toRef.current.focus(); return; }
    if (!subject.trim() && !(await askConfirm({ title: 'Enviar sem assunto?', message: 'A mensagem não tem assunto.', confirmLabel: 'Enviar assim' }))) return;
    if (totalBytes > MAX_ATTACH_BYTES) { setError(`Os anexos somam ${fmtSize(totalBytes)} e o limite é 20 MB por e-mail.`); return; }
    setBusy(true);
    try {
      const r = await apiPost('/api/mail/send', {
        mode, messageId: mode === 'new' ? undefined : init.messageId,
        to, cc, bcc, subject: subject.trim(), html,
        includeQuote: mode !== 'new' && includeQuote,
        signature: useSig,
        attachments: files.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
        forwardParts: mode === 'forward' ? [...keepParts] : [],
      });
      notify('E-mail enviado.', { tone: 'success' });
      onSent(r);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };

  return (
    <section className={`mc${isMobile ? ' mobile' : ''}`} role="dialog" aria-label={TITLES[mode]} onKeyDown={onKeyDown}
      onDragOver={(e) => { if (ctx && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (!ctx || !e.dataTransfer.files.length) return; e.preventDefault(); addFiles(e.dataTransfer.files); }}
    >
      <header className="mc-head">
        <strong>{TITLES[mode]}</strong>
        <IconButton label="Fechar" icon={X} size="sm" onClick={close} />
      </header>
      <BusyBar active={busy || (!ctx && !loadError)} />
      {loadError ? <div className="mc-error" role="alert">{loadError}</div> : (
        <div className="mc-scroll">
          <div className="mc-field">
            <label htmlFor="mc-to">Para</label>
            <input id="mc-to" ref={toRef} value={to} onChange={(e) => setTo(e.target.value)} autoComplete="email" placeholder="nome@empresa.com.br, outro@…" />
            {!showCc && <button type="button" className="mail-link" onClick={() => setShowCc(true)}>Cc/Cco</button>}
          </div>
          {showCc && (
            <>
              <div className="mc-field"><label htmlFor="mc-cc">Cc</label><input id="mc-cc" value={cc} onChange={(e) => setCc(e.target.value)} autoComplete="email" /></div>
              <div className="mc-field"><label htmlFor="mc-bcc">Cco</label><input id="mc-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} autoComplete="email" placeholder="Cópia oculta" /></div>
            </>
          )}
          <div className="mc-field"><label htmlFor="mc-subject">Assunto</label><input id="mc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} /></div>

          <MailEditor onReady={(ed) => { editorRef.current = ed; }} onChange={setHtml} />

          {(files.length > 0 || forwardList.length > 0) && (
            <ul className="mc-atts" aria-label="Anexos">
              {forwardList.map((a) => (
                <li key={a.partId} className={keepParts.has(a.partId) ? '' : 'off'}>
                  <Paperclip size={13} aria-hidden="true" /><span className="mail-att-name">{a.filename}</span><span className="mail-att-size">{fmtSize(a.size)}</span>
                  <button
                    type="button" className="mail-ic" aria-label={keepParts.has(a.partId) ? `Não encaminhar ${a.filename}` : `Encaminhar ${a.filename}`}
                    title={keepParts.has(a.partId) ? 'Tirar do encaminhamento' : 'Incluir de novo'}
                    onClick={() => setKeepParts((prev) => { const n = new Set(prev); if (n.has(a.partId)) n.delete(a.partId); else n.add(a.partId); return n; })}
                  >{keepParts.has(a.partId) ? <X size={13} aria-hidden="true" /> : '+'}</button>
                </li>
              ))}
              {files.map((f) => (
                <li key={f.key}>
                  <Paperclip size={13} aria-hidden="true" /><span className="mail-att-name">{f.filename}</span><span className="mail-att-size">{fmtSize(f.size)}</span>
                  <button type="button" className="mail-ic" aria-label={`Remover ${f.filename}`} title="Remover" onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}><X size={13} aria-hidden="true" /></button>
                </li>
              ))}
              <li className="mc-total">{fmtSize(totalBytes)} de 20 MB</li>
            </ul>
          )}

          <div className="mc-extra">
            <label className="mc-check">
              <input type="checkbox" checked={useSig} onChange={(e) => setUseSig(e.target.checked)} disabled={!signature || !signature.previewHtml} />
              <span>Assinatura</span>
            </label>
            <button type="button" className="mail-link" onClick={onEditSignature}><PenLine size={13} aria-hidden="true" /> {signature && signature.saved ? 'Editar assinatura' : 'Criar assinatura'}</button>
          </div>
          {useSig && signature && signature.previewHtml && <div className="mc-preview"><MailFrame html={signature.previewHtml} title="Prévia da assinatura" minHeight={40} /></div>}

          {mode !== 'new' && ctx && (
            <>
              <div className="mc-extra">
                <label className="mc-check">
                  <input type="checkbox" checked={includeQuote} onChange={(e) => setIncludeQuote(e.target.checked)} />
                  <span>{mode === 'forward' ? 'Mensagem encaminhada' : 'Citar a mensagem original'}</span>
                </label>
                {includeQuote && (
                  <button type="button" className="mail-link" aria-expanded={showQuote} onClick={() => setShowQuote((v) => !v)}>
                    {showQuote ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />} {showQuote ? 'Esconder' : 'Mostrar'}
                  </button>
                )}
              </div>
              {includeQuote && showQuote && <div className="mc-preview"><MailFrame html={ctx.quotePreview} title="Mensagem original" /></div>}
            </>
          )}
        </div>
      )}
      {error && <div className="mc-error" role="alert">{error}</div>}
      <footer className="mc-foot">
        <Button variant="primary" icon={Send} onClick={send} loading={busy} disabled={!ctx || busy} title="Enviar (Ctrl+Enter)">Enviar</Button>
        <IconButton label="Anexar arquivo" icon={Paperclip} onClick={() => fileRef.current && fileRef.current.click()} disabled={!ctx} />
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <span style={{ flex: 1 }} />
        <IconButton label="Descartar" icon={Trash2} onClick={close} disabled={busy} />
      </footer>
    </section>
  );
}
