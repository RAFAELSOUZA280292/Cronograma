// ComposeBox + CommentThread (Onda 3, §81): o MESMO gesto de comentar / linkar / anexar / colar print em todo módulo.
//
//  <ComposeBox
//    onSubmit={async ({ text, mentions, attachments, links }) => { ... }}   // lançar erro = mantém o rascunho e mostra o erro
//    mentionCandidates={[{ id, name }]}                                       // liga o @ com autocomplete
//    features={{ attach: true, link: true, mentions: true }}                  // o que este lugar aceita (paste/arrastar seguem attach)
//    maxFileBytes={8 * 1024 * 1024} maxFiles={10} accept="image/*,application/pdf"
//    submitLabel="Comentar" placeholder="…" draftKey="act:123" autoFocus compact
//    onDirtyChange={(dirty) => …}                                             // para a guarda de "descartar alterações"
//  />
//
//  <CommentThread comments={[…]} currentUserId canModerate onEdit={(id, text) => …} onDelete={(id) => …} mentionNames={[…]} />
//
// Anexo = { id, name, size, type, dataUrl } e link = { id, label, url } — o mesmo formato que atividades e XFlow já gravam.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Link2, Plus, Send, X, Pencil, Trash2, FileText, ImageIcon } from 'lucide-react';
import { IconButton, Button } from './index.jsx';
import { DialogOverlay } from './dialog.jsx';
import { notify } from './dialogs.jsx';
import { useEscClose } from '../lib/nav.js';

export const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const rid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const fmtSize = (n) => (n ? (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');
const fmtWhen = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export function readFileAsAttachment(file, maxBytes = DEFAULT_MAX_FILE_BYTES) {
  return new Promise((resolve) => {
    if (file.size > maxBytes) {
      notify(`"${file.name || 'imagem'}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite por arquivo é ${Math.round(maxBytes / (1024 * 1024))} MB.`, { tone: 'error' });
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ id: rid('att'), name: file.name || `print-${Date.now()}.png`, size: file.size, type: file.type || 'application/octet-stream', dataUrl: reader.result });
    reader.onerror = () => { notify(`Não consegui ler "${file.name || 'o arquivo'}".`, { tone: 'error' }); resolve(null); };
    reader.readAsDataURL(file);
  });
}

function safeUrl(u) {
  const t = String(u || '').trim();
  if (!t) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try { const x = new URL(withProto); return /^https?:$/.test(x.protocol) ? x.toString() : ''; } catch (e) { return ''; }
}

function ImageLightbox({ src, name, onClose }) {
  return (
    <DialogOverlay onClose={onClose} label={name || 'Imagem'} className="cmp-lightbox">
      <img src={src} alt={name || 'Imagem anexada'} onClick={(e) => e.stopPropagation()} />
      <IconButton label="Fechar" icon={X} className="cmp-lightbox-x" onClick={onClose} />
    </DialogOverlay>
  );
}

export function AttachmentList({ attachments = [], links = [], onRemoveAttachment, onRemoveLink }) {
  const [view, setView] = useState(null);
  if (!attachments.length && !links.length) return null;
  return (
    <div className="cmp-files">
      {attachments.map((a) => {
        const isImg = a.type && a.type.startsWith('image/');
        return (
          <div key={a.id} className="cmp-file">
            {isImg
              ? <button type="button" className="cmp-thumb" onClick={() => setView(a)} aria-label={`Ver imagem ${a.name}`} title="Ver imagem"><img src={a.dataUrl} alt="" /></button>
              : <FileText size={15} aria-hidden="true" />}
            {isImg
              ? <span className="cmp-file-name">{a.name}</span>
              : <a className="cmp-file-name" href={a.dataUrl} download={a.name}>{a.name}</a>}
            <span className="cmp-file-size">{fmtSize(a.size)}</span>
            {onRemoveAttachment && <IconButton size="sm" label={`Remover anexo ${a.name}`} icon={X} onClick={() => onRemoveAttachment(a.id)} />}
          </div>
        );
      })}
      {links.map((l) => (
        <div key={l.id} className="cmp-file">
          <Link2 size={15} aria-hidden="true" />
          <a className="cmp-file-name" href={l.url} target="_blank" rel="noopener noreferrer">{l.label || l.url}</a>
          {onRemoveLink && <IconButton size="sm" label={`Remover link ${l.label || l.url}`} icon={X} onClick={() => onRemoveLink(l.id)} />}
        </div>
      ))}
      {view && <ImageLightbox src={view.dataUrl} name={view.name} onClose={() => setView(null)} />}
    </div>
  );
}

export function ComposeBox({
  onSubmit, mentionCandidates = [], features, maxFileBytes = DEFAULT_MAX_FILE_BYTES, maxFiles = 10,
  accept = 'image/*,application/pdf', submitLabel = 'Comentar', placeholder, draftKey, autoFocus, compact, onDirtyChange, disabled, initialText = '',
}) {
  const f = { attach: true, link: true, mentions: mentionCandidates.length > 0, ...(features || {}) };
  const storageKey = draftKey ? `cmp-draft:${draftKey}` : null;
  const [text, setText] = useState(() => {
    if (initialText) return initialText;
    try { return (storageKey && window.sessionStorage.getItem(storageKey)) || ''; } catch (e) { return ''; }
  });
  const [mentions, setMentions] = useState([]); // [{id, name}] escolhidos
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pop, setPop] = useState(null); // { query, start, idx }
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const uid = useRef(rid('cmp')).current;

  const dirty = !!text.trim() || attachments.length > 0 || links.length > 0;
  useEffect(() => { if (onDirtyChange) onDirtyChange(dirty); }, [dirty]);
  useEffect(() => { if (autoFocus && taRef.current) taRef.current.focus(); }, []);
  useEffect(() => {
    if (!storageKey) return;
    try { if (text.trim()) window.sessionStorage.setItem(storageKey, text); else window.sessionStorage.removeItem(storageKey); } catch (e) { /* ignora */ }
  }, [text, storageKey]);
  useEscClose(() => setMenuOpen(false), menuOpen);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const candidates = useMemo(() => {
    if (!pop) return [];
    const q = pop.query.toLowerCase();
    return mentionCandidates.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [pop, mentionCandidates]);

  async function addFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const room = maxFiles - attachments.length;
    if (files.length > room) notify(`Dá para anexar até ${maxFiles} arquivos por vez.`, { tone: 'error' });
    const out = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const att = await readFileAsAttachment(file, maxFileBytes);
      if (att) out.push(att);
    }
    if (out.length) setAttachments((a) => [...a, ...out]);
  }

  function onPaste(e) {
    if (!f.attach) return;
    const items = [...((e.clipboardData && e.clipboardData.items) || [])];
    const files = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  }
  function onDrop(e) {
    if (!f.attach) return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) { e.preventDefault(); setDragOver(false); addFiles(files); }
  }

  function addLink() {
    const url = safeUrl(linkUrl);
    if (!url) { setError('Informe um endereço válido (começa com http:// ou https://).'); return; }
    setError('');
    setLinks((l) => [...l, { id: rid('lnk'), label: linkLabel.trim() || url.replace(/^https?:\/\//, '').replace(/\/$/, ''), url }]);
    setLinkLabel(''); setLinkUrl(''); setShowLink(false);
  }

  function onTextChange(e) {
    const v = e.target.value;
    setText(v);
    if (error) setError('');
    if (!f.mentions) return;
    const caret = e.target.selectionStart;
    const before = v.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    setPop(m ? { query: m[2], start: caret - m[2].length - 1, idx: 0 } : null);
  }
  function pickMention(m) {
    if (!pop) return;
    const el = taRef.current;
    const caret = el ? el.selectionStart : text.length;
    const next = `${text.slice(0, pop.start)}@${m.name} ${text.slice(caret)}`;
    setText(next);
    setMentions((arr) => (arr.some((x) => x.id === m.id) ? arr : [...arr, m]));
    setPop(null);
    requestAnimationFrame(() => { if (el) { const pos = pop.start + m.name.length + 2; el.focus(); el.setSelectionRange(pos, pos); } });
  }

  async function submit() {
    if (busy || disabled) return;
    if (!text.trim() && !attachments.length && !links.length) return;
    setBusy(true); setError('');
    try {
      const finalMentions = mentions.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id);
      await onSubmit({ text: text.trim(), mentions: finalMentions, attachments, links });
      setText(''); setMentions([]); setAttachments([]); setLinks([]); setShowLink(false); setPop(null);
    } catch (e) {
      setError((e && e.message) || 'Não foi possível enviar. O que você escreveu foi mantido — tente de novo.');
    } finally { setBusy(false); }
  }

  function onKeyDown(e) {
    if (pop && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPop((p) => ({ ...p, idx: (p.idx + 1) % candidates.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPop((p) => ({ ...p, idx: (p.idx - 1 + candidates.length) % candidates.length })); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(candidates[pop.idx]); return; }
    }
    if (pop && e.key === 'Escape') { e.preventDefault(); setPop(null); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  const empty = !text.trim() && !attachments.length && !links.length;
  const reason = busy ? 'Aguarde terminar de enviar' : empty ? 'Escreva algo, cole um print ou anexe um arquivo' : undefined;
  const showAdd = f.attach || f.link;

  return (
    <div className={`cmp-box${compact ? ' compact' : ''}${dragOver ? ' drag' : ''}`}
      onDragOver={(e) => { if (f.attach && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <AttachmentList attachments={attachments} links={links}
        onRemoveAttachment={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} onRemoveLink={(id) => setLinks((l) => l.filter((x) => x.id !== id))} />
      {showLink && (
        <div className="cmp-linkform">
          <input type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Nome do link (opcional)" aria-label="Nome do link" />
          <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." aria-label="Endereço do link" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} autoFocus />
          <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()} disabledReason="Informe o endereço do link">Adicionar link</Button>
          <IconButton size="sm" label="Cancelar link" icon={X} onClick={() => { setShowLink(false); setLinkUrl(''); setLinkLabel(''); }} />
        </div>
      )}
      <div className="cmp-row">
        <div className="cmp-field">
          <textarea
            ref={taRef} value={text} onChange={onTextChange} onKeyDown={onKeyDown} onPaste={onPaste} disabled={disabled}
            rows={compact ? 2 : 3} aria-label={placeholder || 'Escreva um comentário'} aria-autocomplete={f.mentions ? 'list' : undefined}
            placeholder={placeholder || `Escreva um comentário…${f.mentions ? ' @ para mencionar' : ''}${f.attach ? ' · cole um print com Ctrl+V' : ''}`}
          />
          {pop && candidates.length > 0 && (
            <ul className="cmp-pop" role="listbox" aria-label="Pessoas">
              {candidates.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === pop.idx} className={i === pop.idx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}>@{m.name}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="cmp-actions">
          {showAdd && (
            <div className="cmp-add" ref={menuRef}>
              <Button size="sm" icon={Plus} onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>Adicionar</Button>
              {menuOpen && (
                <div className="cmp-menu" role="menu">
                  {f.attach && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); fileRef.current && fileRef.current.click(); }}><Paperclip size={14} aria-hidden="true" /> Arquivo ou imagem</button>}
                  {f.link && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setShowLink(true); }}><Link2 size={14} aria-hidden="true" /> Link</button>}
                  {f.attach && <div className="cmp-menu-hint"><ImageIcon size={13} aria-hidden="true" /> Print: cole com Ctrl+V na caixa</div>}
                </div>
              )}
              <input ref={fileRef} id={`${uid}-file`} type="file" accept={accept} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
          )}
          <Button variant="primary" size="sm" icon={Send} onClick={submit} loading={busy} disabled={empty} disabledReason={reason}>{submitLabel}</Button>
        </div>
      </div>
      {error && <div className="cmp-err" role="alert">{error}</div>}
      <div className="cmp-hint">Ctrl+Enter envia{f.attach ? ' · arraste ou cole arquivos aqui' : ''}</div>
    </div>
  );
}

// ---------- Lista de comentários (editar/excluir o próprio) ----------
function renderText(text, names) {
  if (!names || !names.length) return text;
  const sorted = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(@(?:${sorted.join('|')}))`, 'g');
  return String(text).split(re).map((part, i) => (re.test(part) && part.startsWith('@') ? <span key={i} className="cmp-mention">{part}</span> : part));
}

function CommentRow({ c, own, canEdit, canDelete, onEdit, onDelete, mentionNames }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (!draft.trim() && !(c.attachments || []).length && !(c.links || []).length) { setErr('O comentário não pode ficar vazio. Para apagar, use Excluir.'); return; }
    setBusy(true); setErr('');
    try { await onEdit(c.id, draft.trim()); setEditing(false); } catch (e) { setErr((e && e.message) || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  return (
    <div className="cmp-comment" id={`cmt-${c.id}`}>
      <div className="cmp-comment-head">
        <b>{c.author || c.userName || 'Alguém'}</b>
        <span>{fmtWhen(c.ts)}{c.editedAt ? ' · editado' : ''}</span>
        <span className="cmp-spacer" />
        {!editing && canEdit && own && onEdit && <IconButton size="sm" label="Editar comentário" icon={Pencil} onClick={() => { setDraft(c.text || ''); setEditing(true); }} />}
        {!editing && canDelete && onDelete && <IconButton size="sm" variant="danger" label="Excluir comentário" icon={Trash2} onClick={() => onDelete(c.id)} />}
      </div>
      {editing ? (
        <div className="cmp-edit">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Editar comentário" autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false); } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); } }} />
          {err && <div className="cmp-err" role="alert">{err}</div>}
          <div className="cmp-edit-actions">
            <Button size="sm" onClick={() => setEditing(false)} disabled={busy} disabledReason="Aguarde terminar de salvar">Cancelar</Button>
            <Button size="sm" variant="primary" onClick={save} loading={busy}>Salvar</Button>
          </div>
        </div>
      ) : (
        c.text ? <div className="cmp-comment-text">{renderText(c.text, mentionNames)}</div> : null
      )}
      <AttachmentList attachments={c.attachments || []} links={c.links || []} />
    </div>
  );
}

// Regra padrão: autor edita e exclui o próprio; `canModerate` (admin) exclui qualquer um.
export function CommentThread({ comments = [], currentUserId, canModerate, onEdit, onDelete, mentionNames, empty = 'Nenhum comentário ainda.' }) {
  if (!comments.length) return <div className="cmp-empty">{empty}</div>;
  return (
    <div className="cmp-thread">
      {comments.map((c) => {
        const authorId = c.authorId || c.userId;
        const own = !!currentUserId && authorId === currentUserId;
        return <CommentRow key={c.id} c={c} own={own} canEdit={own} canDelete={own || !!canModerate} onEdit={onEdit} onDelete={onDelete} mentionNames={mentionNames} />;
      })}
    </div>
  );
}
