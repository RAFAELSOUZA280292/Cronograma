// Notas do CRM com texto formatado (2026-10-30, pedido do Rafael para incentivar o time): títulos, negrito, itálico, sublinhado, tachado, listas,
// destaque (citação), linha, link, EMOJIS, modelos prontos (ligação, WhatsApp, reunião, objeção), @menção, anexos e print colado.
// `body` no servidor continua sendo o texto puro (busca, auditoria, RENATA); a versão formatada vai em `bodyHtml` (higienizada nos dois lados).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { AtSign, Bold, Heading2, Heading3, Italic, LayoutTemplate, Link2, List, ListOrdered, Minus, Pencil, Quote, Redo2, Send, Smile, Strikethrough, Trash2, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { AddMenu, AttachmentList, readFileAsAttachment, useMentionUsers } from '../ui/ComposeBox.jsx';
import { IconButton, Button } from '../ui/index.jsx';
import { askConfirm, askText, notify } from '../ui/dialogs.jsx';
import { crmPlainToHtml, sanitizeCrmNote } from '../lib/richNote.js';
import { fmtDateTimeBR } from './crmMeta.js';
import { crm } from './crmApi.js';

const CSS = `
.crmrn { font-family: inherit; }
.crmrn-bar { display:flex; align-items:center; flex-wrap:wrap; gap:2px; padding:4px 6px; border:1px solid var(--border-2); border-bottom:0; border-radius:10px 10px 0 0; background:var(--bg-3); position:relative; }
.crmrn-sep { width:1px; height:20px; background:var(--border-2); margin:0 4px; }
.crmrn-btn { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:32px; height:32px; padding:0 6px; border:0; border-radius:var(--r-sm); background:transparent; color:var(--text-3); cursor:pointer; font:inherit; font-size:var(--fs-xs); font-weight:700; }
.crmrn-btn:hover { background:var(--bg-4); color:var(--text-1); }
.crmrn-btn.on { background:rgba(245,196,0,.18); color:var(--ui-accent-text, #F5C400); }
.crmrn-btn:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:1px; }
.crmrn-btn:disabled { opacity:.4; cursor:default; }
.crmrn-pop { position:absolute; top:calc(100% + 4px); left:6px; z-index:30; background:var(--bg-2); border:1px solid var(--border-3); border-radius:var(--r-xl); padding:8px; box-shadow:0 10px 30px rgba(0,0,0,.4); max-width:min(340px, 92vw); }
.crmrn-pop h4 { margin:6px 4px 4px; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-4); font-weight:800; }
.crmrn-pop h4:first-child { margin-top:0; }
.crmrn-emojis { display:grid; grid-template-columns:repeat(8, 1fr); gap:2px; }
.crmrn-emojis button { font-size:var(--fs-xl); line-height:1; width:36px; height:36px; border:0; border-radius:var(--r-md); background:transparent; cursor:pointer; }
.crmrn-emojis button:hover { background:var(--bg-4); }
.crmrn-list { display:flex; flex-direction:column; gap:2px; min-width:230px; }
.crmrn-list button { text-align:left; padding:8px 10px; border:0; border-radius:var(--r-md); background:transparent; color:var(--text-1); font:inherit; font-size:var(--fs-sm); cursor:pointer; display:flex; flex-direction:column; gap:1px; }
.crmrn-list button small { color:var(--text-4); font-size:11px; }
.crmrn-list button:hover { background:var(--bg-4); }
.crmrn-body .ProseMirror { min-height:110px; max-height:52vh; overflow-y:auto; padding:12px 14px; border:1px solid var(--border-2); border-radius:0 0 10px 10px; background:var(--bg-2); color:var(--text-1); font-size:var(--fs-md); line-height:1.55; outline:none; }
.crmrn-body .ProseMirror:focus { border-color:var(--ui-accent, #F5C400); }
.crmrn-body .ProseMirror p.is-editor-empty:first-child::before { content:attr(data-placeholder); float:left; height:0; pointer-events:none; color:var(--text-5); }
.crmrn-doc { color:var(--text-1); font-size:var(--fs-md); line-height:1.55; }
.crmrn-doc p { margin:0 0 6px; } .crmrn-doc p:last-child { margin-bottom:0; }
.crmrn-doc h2 { font-size:var(--fs-lg); font-weight:800; margin:10px 0 4px; } .crmrn-doc h3 { font-size:14.5px; font-weight:800; margin:8px 0 4px; }
.crmrn-doc h2:first-child, .crmrn-doc h3:first-child { margin-top:0; }
.crmrn-doc ul, .crmrn-doc ol { margin:2px 0 8px; padding-left:22px; } .crmrn-doc li { margin:1px 0; } .crmrn-doc li p { margin:0; }
.crmrn-doc blockquote { margin:6px 0 8px; padding:8px 12px; border-left:3px solid #FEDB00; background:rgba(254,219,0,.08); border-radius:0 8px 8px 0; }
.crmrn-doc hr { border:0; border-top:1px solid var(--border-2); margin:10px 0; }
.crmrn-doc a { color:var(--ui-accent-text, #F5C400); text-decoration:underline; }
.crmrn-doc.plain { white-space:pre-wrap; }
.crmrn-box { border:1px solid transparent; border-radius:var(--r-xl); }
.crmrn-box.drag { border-color:var(--ui-accent, #F5C400); background:rgba(245,196,0,.05); }
.crmrn-foot { display:flex; align-items:center; gap:var(--sp-2); flex-wrap:wrap; margin-top:8px; }
.crmrn-hint { font-size:var(--fs-xs); color:var(--text-5); margin-top:6px; }
.crmrn-err { color:#e2574c; font-size:12.5px; margin-top:6px; }
.crmrn-note { border:1px solid var(--border-1); border-radius:var(--r-xl); padding:12px 14px; margin-bottom:10px; background:var(--bg-1); color:var(--text-1); }
.crmrn-note-head { display:flex; align-items:center; gap:var(--sp-2); margin-bottom:8px; font-size:12.5px; }
.crmrn-note-head b { font-size:var(--fs-sm); color:var(--text-1); } .crmrn-note-head span { color:var(--text-4); }
.crmrn-spacer { flex:1; }
.crmrn-edit-actions { display:flex; justify-content:flex-end; gap:var(--sp-2); margin-top:8px; }
@media (max-width: 767px) { .crmrn-btn { min-width:44px; height:44px; } .crmrn-emojis button { width:44px; height:44px; } .crmrn-emojis { grid-template-columns:repeat(6, 1fr); } }
`;

const EMOJIS = [
  ['Andamento', ['✅', '☑️', '⬜', '❌', '⚠️', '❗', '❓', '⏳', '🔄', '🟢', '🟡', '🔴', '✔️', '🚧', '⏸️', '🔜']],
  ['Contato', ['📞', '📱', '💬', '📧', '🤝', '📅', '🗓️', '⏰', '📍', '🎥', '🗣️', '👤', '🔔', '📨', '🔗', '📎']],
  ['Negócio', ['💰', '💵', '📈', '📉', '🧾', '📑', '📄', '📊', '🎯', '🚀', '🏆', '🔥', '⭐', '💡', '🏷️', '🔒']],
  ['Reações', ['👍', '👏', '🙏', '😀', '🙂', '😅', '🤔', '😬', '🎉', '💪', '👀', '❤️', '🙌', '😎', '😕', '✨']],
];

const TEMPLATES = [
  { id: 'ligacao', label: '📞 Ligação', hint: 'Quem atendeu, o que foi dito, próximo passo', html: '<h3>📞 Ligação</h3><p><strong>Com quem falei:</strong> </p><p><strong>O que foi conversado:</strong></p><ul><li></li></ul><p><strong>⏭️ Próximo passo:</strong> </p>' },
  { id: 'whatsapp', label: '💬 Conversa no WhatsApp', hint: 'Linha do tempo da conversa e situação', html: '<h3>💬 Conversa no WhatsApp</h3><ul><li><strong>Data e hora:</strong> o que foi dito</li></ul><blockquote>📌 <strong>Situação:</strong> </blockquote><p><strong>⏭️ Próximo passo:</strong> </p>' },
  { id: 'reuniao', label: '🤝 Reunião', hint: 'Participantes, decisões e pendências', html: '<h3>🤝 Reunião</h3><p><strong>Participantes:</strong> </p><p><strong>Decisões:</strong></p><ul><li></li></ul><p><strong>Pendências:</strong></p><ul><li>⏳ </li></ul><p><strong>⏭️ Próximo passo:</strong> </p>' },
  { id: 'objecao', label: '⚠️ Objeção ou dúvida', hint: 'O que o cliente questionou e como respondemos', html: '<h3>⚠️ Objeção / dúvida do cliente</h3><blockquote>“”</blockquote><p><strong>💡 Como respondemos:</strong> </p><p><strong>⏭️ Próximo passo:</strong> </p>' },
];

const isEmptyHtml = (html) => !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

// Editor com barra completa. `initialHtml` só vale na criação; o pai lê o conteúdo por onChange (html) e pelo ref (editor).
function NoteEditor({ initialHtml, placeholder, onChange, onSubmitShortcut, onFiles, mentionUsers, onMention, autoFocus, label = 'Texto da nota' }) {
  const cbRef = useRef({});
  cbRef.current = { onChange, onSubmitShortcut, onFiles };
  const [pop, setPop] = useState(''); // '' | 'emoji' | 'tpl' | 'at'
  const barRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, codeBlock: false, code: false, trailingNode: false }),
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: initialHtml || '',
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' },
      handleKeyDown: (_v, e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (cbRef.current.onSubmitShortcut) cbRef.current.onSubmitShortcut(); return true; } return false; },
      handlePaste: (_v, e) => {
        const files = [...((e.clipboardData && e.clipboardData.items) || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
        if (!files.length || !cbRef.current.onFiles) return false;
        e.preventDefault(); cbRef.current.onFiles(files); return true;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => { if (transaction.docChanged && cbRef.current.onChange) cbRef.current.onChange(ed.isEmpty ? '' : sanitizeCrmNote(ed.getHTML()), ed.getText()); },
  }, []);

  useEffect(() => {
    if (!pop) return undefined;
    const down = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setPop(''); };
    const key = (e) => { if (e.key === 'Escape') setPop(''); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [pop]);

  if (!editor) return null;
  const keep = (e) => e.preventDefault();
  const run = (fn) => () => { fn(editor.chain().focus()).run(); };
  async function setLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = await askText({ title: 'Inserir link', label: 'Endereço do link (deixe vazio para remover)', defaultValue: prev, confirmLabel: 'Aplicar', required: false });
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url.trim()) chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}` }).run(); else chain.unsetLink().run();
  }
  const insertEmoji = (e) => { editor.chain().focus().insertContent(e).run(); };
  const applyTemplate = (t) => {
    if (editor.isEmpty) editor.chain().focus().setContent(t.html, { emitUpdate: true }).run();
    else editor.chain().focus('end').insertContent(`<p></p>${t.html}`).run();
    setPop('');
  };
  const insertMention = (u) => { editor.chain().focus().insertContent(`@${u.name} `).run(); if (onMention) onMention(u); setPop(''); };
  const btn = (on, name, onClick, icon, extra = {}) => (
    <button type="button" className={`crmrn-btn${on ? ' on' : ''}`} aria-label={name} title={name} aria-pressed={on === undefined ? undefined : !!on} onMouseDown={keep} onClick={onClick} {...extra}>{icon}</button>
  );
  const sz = 15;
  return (
    <div className="crmrn-editor">
      <div className="crmrn-bar" role="toolbar" aria-label="Formatação da nota" ref={barRef}>
        {btn(editor.isActive('heading', { level: 2 }), 'Título', run((c) => c.toggleHeading({ level: 2 })), <Heading2 size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('heading', { level: 3 }), 'Subtítulo', run((c) => c.toggleHeading({ level: 3 })), <Heading3 size={sz} aria-hidden="true" />)}
        <span className="crmrn-sep" aria-hidden="true" />
        {btn(editor.isActive('bold'), 'Negrito (Ctrl+B)', run((c) => c.toggleBold()), <Bold size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('italic'), 'Itálico (Ctrl+I)', run((c) => c.toggleItalic()), <Italic size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('underline'), 'Sublinhado (Ctrl+U)', run((c) => c.toggleUnderline()), <UnderlineIcon size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('strike'), 'Tachado', run((c) => c.toggleStrike()), <Strikethrough size={sz} aria-hidden="true" />)}
        <span className="crmrn-sep" aria-hidden="true" />
        {btn(editor.isActive('bulletList'), 'Lista com marcadores', run((c) => c.toggleBulletList()), <List size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('orderedList'), 'Lista numerada', run((c) => c.toggleOrderedList()), <ListOrdered size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('blockquote'), 'Destaque (caixa amarela)', run((c) => c.toggleBlockquote()), <Quote size={sz} aria-hidden="true" />)}
        {btn(undefined, 'Linha separadora', run((c) => c.setHorizontalRule()), <Minus size={sz} aria-hidden="true" />)}
        {btn(editor.isActive('link'), 'Link', setLink, <Link2 size={sz} aria-hidden="true" />)}
        <span className="crmrn-sep" aria-hidden="true" />
        {btn(pop === 'emoji', 'Emojis', () => setPop((p) => (p === 'emoji' ? '' : 'emoji')), <Smile size={sz} aria-hidden="true" />, { 'aria-haspopup': 'true', 'aria-expanded': pop === 'emoji' })}
        {mentionUsers && mentionUsers.length > 0 && btn(pop === 'at', 'Mencionar alguém', () => setPop((p) => (p === 'at' ? '' : 'at')), <AtSign size={sz} aria-hidden="true" />, { 'aria-haspopup': 'true', 'aria-expanded': pop === 'at' })}
        {btn(pop === 'tpl', 'Modelos prontos', () => setPop((p) => (p === 'tpl' ? '' : 'tpl')), <><LayoutTemplate size={sz} aria-hidden="true" /><span>Modelos</span></>, { 'aria-haspopup': 'true', 'aria-expanded': pop === 'tpl' })}
        <span className="crmrn-sep" aria-hidden="true" />
        {btn(undefined, 'Desfazer (Ctrl+Z)', run((c) => c.undo()), <Undo2 size={sz} aria-hidden="true" />, { disabled: !editor.can().undo() })}
        {btn(undefined, 'Refazer', run((c) => c.redo()), <Redo2 size={sz} aria-hidden="true" />, { disabled: !editor.can().redo() })}
        {pop === 'emoji' && (
          <div className="crmrn-pop" role="dialog" aria-label="Escolher emoji">
            {EMOJIS.map(([g, list]) => (
              <React.Fragment key={g}>
                <h4>{g}</h4>
                <div className="crmrn-emojis">{list.map((e) => <button key={e} type="button" onMouseDown={keep} onClick={() => insertEmoji(e)} aria-label={`Inserir ${e}`}>{e}</button>)}</div>
              </React.Fragment>
            ))}
            <h4>Dica</h4>
            <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px 2px' }}>No Mac: Ctrl+Cmd+Espaço abre todos os emojis. No Windows: tecla Windows + ponto.</div>
          </div>
        )}
        {pop === 'tpl' && (
          <div className="crmrn-pop" role="menu" aria-label="Modelos de nota">
            <h4>Comece por um modelo</h4>
            <div className="crmrn-list">{TEMPLATES.map((t) => <button key={t.id} type="button" role="menuitem" onMouseDown={keep} onClick={() => applyTemplate(t)}>{t.label}<small>{t.hint}</small></button>)}</div>
          </div>
        )}
        {pop === 'at' && (
          <div className="crmrn-pop" role="menu" aria-label="Mencionar">
            <h4>Avisar alguém do time</h4>
            <div className="crmrn-list">{mentionUsers.map((u) => <button key={u.id} type="button" role="menuitem" onMouseDown={keep} onClick={() => insertMention(u)}>@{u.name}</button>)}</div>
          </div>
        )}
      </div>
      <div className="crmrn-body"><EditorContent editor={editor} /></div>
    </div>
  );
}

// Composer da nota nova: texto formatado + anexos/links/print + @menção + rascunho por sessão.
export function RichNoteComposer({ about, placeholder, draftKey, onDirtyChange, onAdded }) {
  const users = useMentionUsers();
  const storageKey = draftKey ? `crm-rn-draft:${draftKey}` : null;
  const initial = useMemo(() => { try { return (storageKey && window.sessionStorage.getItem(storageKey)) || ''; } catch (e) { return ''; } }, [storageKey]);
  const [html, setHtml] = useState(initial);
  const [plain, setPlain] = useState('');
  const [mentions, setMentions] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const submitRef = useRef(null);
  const empty = isEmptyHtml(html);
  const dirty = !empty || attachments.length > 0 || links.length > 0;
  useEffect(() => { if (onDirtyChange) onDirtyChange(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!storageKey) return;
    try { if (!empty) window.sessionStorage.setItem(storageKey, html); else window.sessionStorage.removeItem(storageKey); } catch (e) { /* ignora */ }
  }, [html, empty, storageKey]);

  async function addFiles(list) {
    const files = [...(list || [])];
    const room = 5 - attachments.length;
    if (files.length > room) notify('Dá para anexar até 5 arquivos por nota.', { tone: 'error' });
    const out = [];
    for (const f of files.slice(0, Math.max(0, room))) { const a = await readFileAsAttachment(f, 3 * 1024 * 1024); if (a) out.push(a); }
    if (out.length) setAttachments((a) => [...a, ...out]);
  }
  async function addLink() {
    const url = await askText({ title: 'Anexar link', label: 'Endereço (começa com https://)', confirmLabel: 'Adicionar', required: true });
    if (!url) return;
    const u = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    if (!/^https?:\/\//i.test(u)) { setError('Informe um endereço válido (começa com http:// ou https://).'); return; }
    setError(''); setLinks((l) => [...l, { id: `lnk-${Date.now().toString(36)}`, label: u.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: u }]);
  }
  async function submit() {
    if (busy || (empty && !attachments.length && !links.length)) return;
    setBusy(true); setError('');
    try {
      const ids = mentions.filter((m) => plain.includes(`@${m.name}`)).map((m) => m.id);
      await crm.addNote({ ...about, bodyHtml: html, attachments, links, mentions: ids });
      setHtml(''); setPlain(''); setMentions([]); setAttachments([]); setLinks([]); setEditorKey((k) => k + 1);
      try { if (onAdded) await onAdded(); } catch (e) { /* a nota já foi gravada */ }
    } catch (e) {
      setError((e && e.message) || 'Não foi possível salvar a nota. O que você escreveu foi mantido — tente de novo.');
    } finally { setBusy(false); }
  }
  submitRef.current = submit;
  return (
    <div className={`crmrn crmrn-box${drag ? ' drag' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) { e.preventDefault(); setDrag(false); addFiles(f); } }}>
      <style>{CSS}</style>
      <NoteEditor key={editorKey} initialHtml={initial} placeholder={placeholder || 'Escreva a nota… use Modelos para começar mais rápido'} mentionUsers={users}
        onChange={(h, t) => { setHtml(h); setPlain(t); if (error) setError(''); }} onMention={(u) => setMentions((a) => (a.some((x) => x.id === u.id) ? a : [...a, u]))}
        onSubmitShortcut={() => submitRef.current && submitRef.current()} onFiles={addFiles} />
      <AttachmentList attachments={attachments} links={links} onRemoveAttachment={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} onRemoveLink={(id) => setLinks((l) => l.filter((x) => x.id !== id))} />
      <div className="crmrn-foot">
        <AddMenu onFiles={addFiles} onLink={addLink} accept="image/*,application/pdf" />
        <span className="crmrn-spacer" />
        <Button variant="primary" size="sm" icon={Send} onClick={submit} loading={busy} disabled={empty && !attachments.length && !links.length} disabledReason={busy ? 'Aguarde terminar de enviar' : 'Escreva algo, cole um print ou anexe um arquivo'}>Adicionar nota</Button>
      </div>
      {error && <div className="crmrn-err" role="alert">{error}</div>}
      <div className="crmrn-hint">Ctrl+Enter salva · arraste ou cole prints aqui · 😀 emojis e Modelos na barra</div>
    </div>
  );
}

// Corpo da nota: HTML higienizado (nota formatada) ou texto simples com quebras de linha (nota antiga ou da API).
export function NoteBody({ note }) {
  if (note.bodyHtml) return <div className="crmrn-doc" dangerouslySetInnerHTML={{ __html: sanitizeCrmNote(note.bodyHtml) }} />; // eslint-disable-line react/no-danger
  if (!note.body) return null;
  return <div className="crmrn-doc" dangerouslySetInnerHTML={{ __html: sanitizeCrmNote(crmPlainToHtml(note.body)) }} />; // eslint-disable-line react/no-danger
}

function NoteRow({ n, own, canDelete, ctx, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasExtras = (n.attachments || []).length > 0 || (n.links || []).length > 0;
  const startHtml = useMemo(() => (n.bodyHtml ? sanitizeCrmNote(n.bodyHtml) : crmPlainToHtml(n.body)), [n.bodyHtml, n.body]);
  async function save() {
    if (isEmptyHtml(html) && !hasExtras) { setErr('A nota não pode ficar vazia. Para apagar, use Remover.'); return; }
    setBusy(true); setErr('');
    try { await crm.updateNote(n.id, { bodyHtml: html }); setEditing(false); if (onChanged) await onChanged(); } catch (e) { setErr((e && e.message) || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!(await askConfirm({ title: 'Remover esta nota?', message: 'O registro de que ela existiu continua no histórico.', confirmLabel: 'Remover', danger: true }))) return;
    try { await crm.deleteNote(n.id); if (onChanged) await onChanged(); } catch (e) { notify((e && e.message) || 'Não foi possível concluir.', { tone: 'error' }); }
  }
  return (
    <div className="crmrn-note" id={`note-${n.id}`}>
      <div className="crmrn-note-head">
        <b>{n.createdByName || 'Alguém'}</b>
        <span>{fmtDateTimeBR(n.createdAt)}{n.editedAt ? ' · editada' : ''}{ctx}</span>
        <span className="crmrn-spacer" />
        {!editing && own && <IconButton size="sm" label="Editar nota" icon={Pencil} onClick={() => { setHtml(startHtml); setEditing(true); }} />}
        {!editing && canDelete && <IconButton size="sm" variant="danger" label="Remover nota" icon={Trash2} onClick={remove} />}
      </div>
      {editing ? (
        <div className="crmrn">
          <NoteEditor initialHtml={startHtml} autoFocus onChange={(h) => setHtml(h)} onSubmitShortcut={save} label="Editar nota" />
          {err && <div className="crmrn-err" role="alert">{err}</div>}
          <div className="crmrn-edit-actions">
            <Button size="sm" onClick={() => setEditing(false)} disabled={busy} disabledReason="Aguarde terminar de salvar">Cancelar</Button>
            <Button size="sm" variant="primary" onClick={save} loading={busy}>Salvar</Button>
          </div>
        </div>
      ) : <NoteBody note={n} />}
      {!editing && <AttachmentList attachments={n.attachments || []} links={n.links || []} />}
    </div>
  );
}

export function RichNoteThread({ notes, currentUserId, canModerate, onChanged, showContext }) {
  if (!notes.length) return null;
  return (
    <div className="crmrn">
      <style>{CSS}</style>
      {notes.map((n) => {
        const own = !!currentUserId && n.createdBy === currentUserId;
        const ctx = showContext ? `${n.contactName ? ` · sobre ${n.contactName}` : ''}${n.dealTitle ? ` · sobre o negócio ${n.dealTitle}` : ''}` : '';
        return <NoteRow key={n.id} n={n} own={own} canDelete={own || !!canModerate} ctx={ctx} onChanged={onChanged} />;
      })}
    </div>
  );
}
