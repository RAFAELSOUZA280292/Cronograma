// Janela de escrita da Caixa de e-mail (2026-11-02, Fase 2): novo, responder, responder a todos e encaminhar. No computador
// fica no canto da tela (dá para continuar lendo a lista); no celular ocupa a tela toda. O servidor (POST /api/mail/send,
// server/mailCompose.js) monta o e-mail compatível com Outlook/celular, cola a assinatura e cita a mensagem original —
// aqui só aparece a prévia de ambos.
// Pacote de produtividade (2026-11-02): rascunho salvo sozinho no Gmail (3 s depois de parar de digitar, e ao fechar), reabrir
// rascunho (init.draftId) e sugestão de destinatários (para quem você mais escreve + contatos do CRM).
// Pacote de personalização (2026-11-02): cor e tamanho do texto e imagem colada, arrastada ou escolhida no corpo (vai embutida
// por Content-ID, ver server/mailCompose.js; preparo e limites em mailImage.js).
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import ImageExt from '@tiptap/extension-image';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Quote, Paperclip, Send, Trash2, X, PenLine, ChevronDown, ChevronUp, Baseline, ImagePlus, Check } from 'lucide-react';
import { Button, IconButton, BusyBar } from '../ui/index.jsx';
import { askConfirm, askText, notify } from '../ui/dialogs.jsx';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import MailFrame from './MailFrame.jsx';
import { prepareImage, isImageFile, htmlImageBytes, clipboardFiles } from './mailImage.js';
import { blockReason } from '../../shared/mailAttachments.js';

export const MAX_ATTACH_BYTES = 20 * 1024 * 1024;
const TITLES = { new: 'Nova mensagem', reply: 'Responder', replyAll: 'Responder a todos', forward: 'Encaminhar' };

export function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const AUTOSAVE_MS = 3000;
const addrText = (list) => (list || []).map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(', ');

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Não consegui ler o arquivo ${file.name}.`));
    r.readAsDataURL(file);
  });
}

// Campo de destinatários com sugestão: completa o trecho depois da última vírgula. Setas escolhem, Enter/Tab confirmam, Esc fecha.
function RecipientInput({ id, value, onChange, inputRef, placeholder }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const token = value.split(',').pop().trim();
  useEffect(() => {
    if (!open || token.length < 2 || /<[^>]+>$/.test(token)) { setItems([]); return undefined; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      apiGet(`/api/mail/contacts?q=${encodeURIComponent(token)}`).then((d) => { if (n === seq.current) { setItems(d.contacts || []); setActive(0); } }).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [token, open]);
  function pick(c) {
    const parts = value.split(',');
    parts[parts.length - 1] = ` ${c.name ? `${c.name} <${c.email}>` : c.email}`;
    onChange(`${parts.join(',').replace(/^\s+/, '')}, `);
    setItems([]);
    if (inputRef && inputRef.current) inputRef.current.focus();
  }
  function onKeyDown(e) {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setItems([]); }
  }
  const listId = `${id}-sug`;
  return (
    <div className="mc-rcpt">
      <input
        id={id} ref={inputRef} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul className="mc-sug" id={listId} role="listbox" aria-label="Sugestões de destinatário">
          {items.map((c, i) => (
            <li
              key={c.email} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}
            >
              <span className="mc-sug-name">{c.name || c.email}</span>
              {c.name && <span className="mc-sug-mail">{c.email}</span>}
              {c.source === 'crm' && <span className="mc-sug-tag">CRM</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const TEXT_COLORS = [
  ['#000000', 'Preto'], ['#666666', 'Cinza'], ['#cc0000', 'Vermelho'], ['#e69138', 'Laranja'],
  ['#38761d', 'Verde'], ['#1155cc', 'Azul'], ['#0b5394', 'Azul-escuro'], ['#674ea7', 'Roxo'],
];
const SIZES = [['12px', 'Pequeno'], ['', 'Normal'], ['18px', 'Grande']];
const imageFiles = (list) => [...(list || [])].filter(isImageFile);

// Põe imagens no corpo (na posição `at` quando arrastadas). Erro de uma imagem não impede as outras.
async function insertImageFiles(ed, files, at) {
  if (!ed) return;
  for (const f of files) {
    try {
      const img = await prepareImage(f);
      const node = { type: 'image', attrs: { src: `data:${img.mimeType};base64,${img.data}`, alt: f.name || 'imagem', width: img.width || null, height: img.height || null } };
      // Imagem recém-posta fica selecionada; a próxima vai depois dela (senão a substituiria).
      const sel = ed.state.selection;
      const pos = typeof at === 'number' ? at : sel.node ? sel.to : null;
      if (pos !== null) ed.chain().focus().insertContentAt(pos, node).run();
      else ed.chain().focus().insertContent(node).run();
      at = undefined;
    } catch (e) { notify(e.message, { tone: 'error' }); }
  }
}

// Cor do texto: menu com a paleta (fecha com Esc ou clique fora).
function ColorMenu({ editor }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const current = editor.getAttributes('textStyle').color || '';
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const pick = (hex) => { const ch = editor.chain().focus(); (hex ? ch.setColor(hex) : ch.unsetColor()).run(); setOpen(false); };
  return (
    <div className="mc-menu" ref={box} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" className={`mc-btn${current ? ' on' : ''}`} aria-label="Cor do texto" title="Cor do texto" aria-haspopup="true" aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
        <Baseline size={15} aria-hidden="true" /><i className="mc-color-bar" style={{ background: current || 'currentColor' }} aria-hidden="true" />
      </button>
      {open && (
        <div className="mc-pop" role="group" aria-label="Cores do texto">
          <button type="button" className="mc-swatch auto" title="Automática" aria-label="Cor automática" onMouseDown={(e) => e.preventDefault()} onClick={() => pick('')}>A</button>
          {TEXT_COLORS.map(([hex, name]) => (
            <button key={hex} type="button" className="mc-swatch" style={{ background: hex }} title={name} aria-label={name} aria-pressed={current.toLowerCase() === hex} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(hex)}>
              {current.toLowerCase() === hex && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MailEditor({ onReady, onChange, onFiles }) {
  const imgRef = useRef(null);
  const editorRef = useRef(null);
  const filesRef = useRef(onFiles);
  filesRef.current = onFiles;
  const insertImages = useCallback((files, at) => insertImageFiles(editorRef.current, files, at), []);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: 'Escreva a mensagem…' }),
      TextStyle, Color, FontSize,
      ImageExt.configure({ allowBase64: true, inline: false }),
    ],
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { 'aria-label': 'Mensagem', role: 'textbox', 'aria-multiline': 'true' },
      // Print colado (macOS ⌘⇧4/⌘⇧Ctrl+4, Windows PrtSc/Win+Shift+S) ou imagem copiada: entra no corpo, embutida.
      // Arquivo copiado no Finder/Explorer que não é imagem (PDF, zip, rar…): vira anexo.
      handlePaste: (view, event) => {
        const files = clipboardFiles(event.clipboardData);
        if (!files.length) return false;
        const imgs = imageFiles(files);
        const others = files.filter((f) => !isImageFile(f));
        if (imgs.length) insertImages(imgs);
        if (others.length && filesRef.current) filesRef.current(others);
        return true;
      },
      // Imagem arrastada para dentro do texto vai no ponto onde caiu; outros arquivos seguem para os anexos.
      handleDrop: (view, event, slice, moved) => {
        const imgs = moved ? [] : imageFiles(event.dataTransfer && event.dataTransfer.files);
        if (!imgs.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImages(imgs, pos ? pos.pos : undefined);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? '' : ed.getHTML()),
  }, []);
  useEffect(() => { editorRef.current = editor; if (editor) onReady(editor); }, [editor, onReady]);
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
  const size = editor.getAttributes('textStyle').fontSize || '';
  return (
    <div className="mc-editor">
      <div className="mc-tools" role="toolbar" aria-label="Formatação do texto">
        {btn(editor.isActive('bold'), 'Negrito (Ctrl+B)', () => c().toggleBold().run(), Bold)}
        {btn(editor.isActive('italic'), 'Itálico (Ctrl+I)', () => c().toggleItalic().run(), Italic)}
        {btn(editor.isActive('underline'), 'Sublinhado (Ctrl+U)', () => c().toggleUnderline().run(), Underline)}
        <ColorMenu editor={editor} />
        <select className="mc-size" aria-label="Tamanho do texto" title="Tamanho do texto" value={SIZES.some(([v]) => v === size) ? size : ''} onChange={(e) => { const v = e.target.value; (v ? c().setFontSize(v) : c().unsetFontSize()).run(); }}>
          {SIZES.map(([v, label]) => <option key={label} value={v}>{label}</option>)}
        </select>
        <span className="mc-sep" aria-hidden="true" />
        {btn(editor.isActive('bulletList'), 'Lista com marcadores', () => c().toggleBulletList().run(), List)}
        {btn(editor.isActive('orderedList'), 'Lista numerada', () => c().toggleOrderedList().run(), ListOrdered)}
        {btn(editor.isActive('blockquote'), 'Citação', () => c().toggleBlockquote().run(), Quote)}
        {btn(editor.isActive('link'), 'Link', setLink, Link2)}
        {btn(false, 'Inserir imagem no texto (ou cole/arraste)', () => imgRef.current && imgRef.current.click(), ImagePlus)}
        <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { insertImages(imageFiles(e.target.files)); e.target.value = ''; }} />
      </div>
      <EditorContent editor={editor} className="mc-body" />
    </div>
  );
}

const Compose = forwardRef(function Compose({ init, signature, isMobile, onClose, onSent, onEditSignature, onDraftChange }, ref) {
  const fromDraft = !!init.draftId;
  const [mode, setMode] = useState(init.mode || 'new');
  const [origId, setOrigId] = useState(init.messageId || '');
  const [ctx, setCtx] = useState(mode === 'new' && !fromDraft ? { to: init.to || [], cc: [], subject: init.subject || '', attachments: [] } : null);
  const [loadError, setLoadError] = useState('');
  const [to, setTo] = useState(addrText(init.to));
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(init.subject || '');
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
  // Rascunho no Gmail: id, mensagem atual (muda a cada gravação) e anexos que já estão nele.
  const [draft, setDraft] = useState({ id: init.draftId || null, messageId: null, threadId: null });
  const [draftAtts, setDraftAtts] = useState([]);
  const [draftKeep, setDraftKeep] = useState(() => new Set());
  const [saveState, setSaveState] = useState({ at: null, saving: false, error: '' });
  const [baseline, setBaseline] = useState(0);
  const savedSig = useRef(null);
  const savingRef = useRef(null);
  const latest = useRef({});

  useEffect(() => { apiGet('/api/mail/contacts').catch(() => {}); }, []);

  useEffect(() => {
    if (!fromDraft) return undefined;
    let alive = true;
    apiGet(`/api/mail/drafts/${encodeURIComponent(init.draftId)}`).then((d) => {
      if (!alive) return;
      setMode(d.mode); setOrigId(d.messageId || '');
      setCtx({ to: d.to, cc: d.cc, subject: d.subject, attachments: [], quotePreview: d.quotePreview });
      setTo(addrText(d.to)); setCc(addrText(d.cc)); setBcc(addrText(d.bcc)); setShowCc(d.cc.length > 0 || d.bcc.length > 0);
      setSubject(d.subject); initialSubject.current = d.subject;
      setIncludeQuote(d.includeQuote); if (!d.signature || !d.ours) setUseSig(false);
      setDraft({ id: d.draftId, messageId: d.draftMessageId, threadId: d.threadId || null });
      setDraftAtts(d.attachments); setDraftKeep(new Set(d.attachments.map((a) => a.partId)));
      const apply = () => { editorRef.current.commands.setContent(d.html || '', false); setHtml(editorRef.current.isEmpty ? '' : editorRef.current.getHTML()); editorRef.current.commands.focus('end'); };
      const apply2 = () => { if (editorRef.current) { apply(); setBaseline((n) => n + 1); } else setTimeout(apply2, 30); };
      apply2();
    }).catch((e) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, [fromDraft, init.draftId]);

  useEffect(() => {
    if (fromDraft) return undefined;
    if (mode === 'new') { setTimeout(() => toRef.current && toRef.current.focus(), 0); return undefined; }
    let alive = true;
    apiGet(`/api/mail/compose?mode=${mode}&messageId=${encodeURIComponent(init.messageId)}`).then((d) => {
      if (!alive) return;
      setCtx(d);
      setTo(addrText(d.to)); setCc(addrText(d.cc)); setShowCc(d.cc.length > 0);
      setSubject(d.subject); initialSubject.current = d.subject;
      setKeepParts(new Set(d.attachments.map((a) => a.partId)));
      setBaseline((n) => n + 1);
      setTimeout(() => (mode === 'forward' ? toRef.current && toRef.current.focus() : editorRef.current && editorRef.current.commands.focus('start')), 0);
    }).catch((e) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.messageId]);

  const sigOk = !!(signature && signature.previewHtml && signature.signature && signature.signature.enabled);
  useEffect(() => { if (!fromDraft) setUseSig(sigOk); }, [sigOk, fromDraft]);

  const forwardList = (ctx && ctx.attachments) || [];
  const keptForward = forwardList.filter((a) => keepParts.has(a.partId));
  const keptDraft = draftAtts.filter((a) => draftKeep.has(a.partId));
  const totalBytes = files.reduce((n, f) => n + f.size, 0) + htmlImageBytes(html) + keptForward.reduce((n, a) => n + (a.size || 0), 0) + keptDraft.reduce((n, a) => n + (a.size || 0), 0);
  // "Impressão" do que a pessoa escreveu/anexou. Anexos entram por nome+tamanho: depois de gravar eles passam para o rascunho
  // e a impressão não muda (senão regravaria à toa). O rascunho grava quando a impressão difere da última gravada/carregada.
  const sig = JSON.stringify([to.trim(), cc.trim(), bcc.trim(), subject, html,
    [...files.map((f) => `${f.filename}|${f.size}`), ...keptForward.map((a) => `${a.filename}|${a.size}`), ...keptDraft.map((a) => `${a.filename}|${a.size}`)].sort()]);
  useEffect(() => { savedSig.current = sig; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [baseline]);
  const unsaved = savedSig.current !== null && sig !== savedSig.current;

  latest.current = { mode, origId, to, cc, bcc, subject, html, files, keepParts, draftKeep, includeQuote, useSig, draft, sig, ctx };

  const saveDraft = useCallback(async () => {
    if (savingRef.current) return savingRef.current;
    const L = latest.current;
    if (!L.ctx) return null;
    const sentKeys = new Set(L.files.map((f) => f.key));
    const mySig = L.sig;
    setSaveState((st) => ({ ...st, saving: true, error: '' }));
    const job = (async () => {
      try {
        const r = await apiPost('/api/mail/drafts', {
          draftId: L.draft.id || undefined, draftMessageId: L.draft.messageId || undefined, draftParts: [...L.draftKeep], threadId: L.draft.threadId || undefined,
          mode: L.mode, messageId: L.mode === 'new' ? undefined : L.origId,
          to: L.to, cc: L.cc, bcc: L.bcc, subject: L.subject.trim(), html: L.html,
          includeQuote: L.mode !== 'new' && L.includeQuote, signature: L.useSig,
          attachments: L.files.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
          forwardParts: L.mode === 'forward' ? [...L.keepParts] : [],
        });
        // O que foi gravado passa a morar no rascunho: anexos enviados e encaminhados viram anexos do rascunho.
        setDraft((d) => ({ ...d, id: r.draftId, messageId: r.draftMessageId }));
        setDraftAtts(r.attachments); setDraftKeep(new Set(r.attachments.map((a) => a.partId)));
        setFiles((prev) => prev.filter((f) => !sentKeys.has(f.key)));
        if (L.mode === 'forward') { setCtx((c) => (c ? { ...c, attachments: [] } : c)); setKeepParts(new Set()); }
        savedSig.current = mySig;
        setSaveState({ at: new Date(), saving: false, error: '' });
        if (onDraftChange) onDraftChange();
        return r;
      } catch (e) {
        setSaveState((st) => ({ ...st, saving: false, error: e.message }));
        if (e.data && e.data.code === 'draft_gone') setDraft({ id: null, messageId: null, threadId: null });
        throw e;
      } finally { savingRef.current = null; }
    })();
    savingRef.current = job;
    return job;
  }, [onDraftChange]);

  // Grava sozinho 3 s depois da última mudança (só se já houver algo escrito).
  useEffect(() => {
    if (!unsaved || busy || !ctx || saveState.saving) return undefined;
    const t = setTimeout(() => { if (latest.current.sig !== savedSig.current) saveDraft().catch(() => {}); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [sig, unsaved, busy, ctx, saveState.saving, saveDraft]);

  // Fechar = guardar em Rascunhos (como no Outlook). Só pergunta se a gravação falhar.
  async function close() {
    if (busy) return false;
    if (latest.current.sig === savedSig.current && !savingRef.current) { onClose(); return true; }
    try {
      if (savingRef.current) await savingRef.current.catch(() => {});
      if (latest.current.sig !== savedSig.current) await saveDraft();
      notify('Mensagem guardada em Rascunhos.', { tone: 'success' });
      onClose();
      return true;
    } catch (e) {
      if (await askConfirm({ title: 'Não consegui guardar o rascunho', message: `${e.message} Fechar mesmo assim? O que você escreveu será perdido.`, confirmLabel: 'Fechar sem guardar', danger: true })) { onClose(); return true; }
      return false;
    }
  }

  async function discard() {
    if (busy) return;
    if ((latest.current.sig !== savedSig.current || draft.id) && !(await askConfirm({ title: 'Descartar esta mensagem?', message: draft.id ? 'O rascunho também sai de Rascunhos no Gmail.' : 'O que você escreveu será perdido.', confirmLabel: 'Descartar', danger: true }))) return;
    if (savingRef.current) await savingRef.current.catch(() => {});
    const id = latest.current.draft.id;
    if (id) {
      try { await apiDelete(`/api/mail/drafts/${encodeURIComponent(id)}`); if (onDraftChange) onDraftChange(); } catch (e) { notify(e.message, { tone: 'error' }); return; }
    }
    onClose();
  }

  useImperativeHandle(ref, () => ({ close }));

  async function addFiles(list) {
    let picked = [...list];
    if (!picked.length) return;
    // Tipos que o Gmail bloqueia (.exe, .js… ou .zip com um deles dentro): avisa já, em vez de falhar no envio.
    const reasons = await Promise.all(picked.map(async (f) => blockReason(f.name, /\.zip$/i.test(f.name) ? await f.arrayBuffer().catch(() => null) : null)));
    const refused = reasons.filter(Boolean);
    if (refused.length) notify(refused.length === 1 ? refused[0] : `${refused[0]} Também ficaram de fora: ${picked.filter((f, i) => reasons[i]).slice(1).map((f) => f.name).join(', ')}.`, { tone: 'error' });
    picked = picked.filter((f, i) => !reasons[i]);
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
      if (savingRef.current) await savingRef.current.catch(() => {});
      const r = await apiPost('/api/mail/send', {
        draftId: draft.id || undefined, draftMessageId: draft.messageId || undefined, draftParts: [...draftKeep], threadId: draft.threadId || undefined,
        mode, messageId: mode === 'new' ? undefined : origId,
        to, cc, bcc, subject: subject.trim(), html,
        includeQuote: mode !== 'new' && includeQuote,
        signature: useSig,
        attachments: files.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
        forwardParts: mode === 'forward' ? [...keepParts] : [],
      });
      notify('E-mail enviado.', { tone: 'success' });
      if (draft.id && onDraftChange) onDraftChange();
      onSent(r);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };

  return (
    <section className={`mc${isMobile ? ' mobile' : ''}`} role="dialog" aria-label={TITLES[mode]} onKeyDown={onKeyDown}
      onDragOver={(e) => { if (ctx && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (!ctx || e.defaultPrevented || !e.dataTransfer.files.length) return; e.preventDefault(); addFiles(e.dataTransfer.files); }}
      onPaste={(e) => {
        // Colar arquivo fora do texto (Para, Assunto…): imagem vai para o corpo, o resto vira anexo. Dentro do texto, quem cuida é o editor.
        if (!ctx || e.defaultPrevented) return;
        const files = clipboardFiles(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        const imgs = imageFiles(files);
        if (imgs.length) insertImageFiles(editorRef.current, imgs);
        const others = files.filter((f) => !isImageFile(f));
        if (others.length) addFiles(others);
      }}
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
            <RecipientInput id="mc-to" inputRef={toRef} value={to} onChange={setTo} placeholder="Digite um nome ou e-mail" />
            {!showCc && <button type="button" className="mail-link" onClick={() => setShowCc(true)}>Cc/Cco</button>}
          </div>
          {showCc && (
            <>
              <div className="mc-field"><label htmlFor="mc-cc">Cc</label><RecipientInput id="mc-cc" value={cc} onChange={setCc} /></div>
              <div className="mc-field"><label htmlFor="mc-bcc">Cco</label><RecipientInput id="mc-bcc" value={bcc} onChange={setBcc} placeholder="Cópia oculta" /></div>
            </>
          )}
          <div className="mc-field"><label htmlFor="mc-subject">Assunto</label><input id="mc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} /></div>

          <MailEditor onReady={(ed) => { editorRef.current = ed; }} onChange={setHtml} onFiles={addFiles} />

          {(files.length > 0 || forwardList.length > 0 || draftAtts.length > 0 || htmlImageBytes(html) > 0) && (
            <ul className="mc-atts" aria-label="Anexos">
              {draftAtts.map((a) => (
                <li key={`d-${a.partId}`} className={draftKeep.has(a.partId) ? '' : 'off'}>
                  <Paperclip size={13} aria-hidden="true" /><span className="mail-att-name">{a.filename}</span><span className="mail-att-size">{fmtSize(a.size)}</span>
                  <button
                    type="button" className="mail-ic" aria-label={draftKeep.has(a.partId) ? `Remover ${a.filename}` : `Incluir ${a.filename} de novo`}
                    title={draftKeep.has(a.partId) ? 'Remover' : 'Incluir de novo'}
                    onClick={() => setDraftKeep((prev) => { const n = new Set(prev); if (n.has(a.partId)) n.delete(a.partId); else n.add(a.partId); return n; })}
                  >{draftKeep.has(a.partId) ? <X size={13} aria-hidden="true" /> : '+'}</button>
                </li>
              ))}
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
              <li className="mc-total">{fmtSize(totalBytes)} de 20 MB{htmlImageBytes(html) > 0 ? ' (anexos + imagens no texto)' : ''}</li>
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
        <span className="mc-saved" aria-live="polite">
          {saveState.saving ? 'Salvando rascunho…' : saveState.error ? 'Rascunho não salvo' : saveState.at ? `Rascunho salvo às ${saveState.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <IconButton label="Descartar" icon={Trash2} onClick={discard} disabled={busy} />
      </footer>
    </section>
  );
});

export default Compose;
