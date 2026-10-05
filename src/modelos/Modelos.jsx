// Modelos de documentos (2026-10-05, §78) — aba irmã dos Pareceres: biblioteca de modelos para sócios e colaboradores. Um modelo
// tem VÁRIOS anexos (o mesmo documento em Word, Excel, PDF, HTML, link…); a gaveta alterna entre eles com prévia por tipo:
// PDF, imagem, HTML (isolado) e texto abrem na própria tela, Word/PowerPoint/Excel mostram o começo do conteúdo, link mostra a prévia da página.
import React, { useEffect, useRef, useState } from 'react';
import { FileText, FileSpreadsheet, Presentation, Image as ImageIcon, Link2, Code2, X, LogOut, Plus, Upload, Trash2, Pencil, ExternalLink, Download, RefreshCw, MessageSquare, Send, Search, ArrowLeft } from 'lucide-react';
import { ThemeToggleBtn, SidePanel, useDebouncedField, fmtTs } from '../App.jsx';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { PARECERES_CSS, fmtFileSize, initialsOf } from '../pareceres/pareceresMeta.js';
import { MODELOS_CSS, MAX_FILE_MB, MAX_ITEMS, ACCEPT, KIND_META, INLINE_KINDS, itemKind, kindsOf, itemName, hostOf, isAllowedFile, SUGGESTED_CATEGORIES } from './modelosMeta.js';

const ICONS = { pdf: FileText, word: FileText, text: FileText, ppt: Presentation, excel: FileSpreadsheet, image: ImageIcon, link: Link2, html: Code2 };
const KIND_ORDER = ['pdf', 'word', 'ppt', 'excel', 'html', 'image', 'text', 'link'];

function TypeBadge({ kind, extra }) {
  const Icon = ICONS[kind] || FileText;
  return <span className="mdl-type" style={{ '--c': KIND_META[kind].color }}><Icon size={12} />{KIND_META[kind].label}{extra ? ` · ${extra}` : ''}</span>;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result || ''; const i = r.indexOf(','); resolve(i === -1 ? r : r.slice(i + 1)); };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

const fileKind = (f) => itemKind({ kind: 'file', file_name: f.name });

// Capa do cartão: 1ª imagem disponível (imagem do link ou arquivo de imagem pequeno); senão o ícone do 1º anexo.
function Thumb({ t }) {
  const [broken, setBroken] = useState(false);
  const items = t.items || [];
  const cover = items.find((i) => (i.kind === 'link' && i.link_meta && i.link_meta.image) || (i.kind === 'file' && itemKind(i) === 'image' && i.file_size <= 2 * 1024 * 1024));
  const src = cover ? (cover.kind === 'link' ? cover.link_meta.image : `/api/templates/${t.id}/items/${cover.id}/file`) : '';
  const first = items[0];
  const kind = first ? itemKind(first) : 'text';
  const Icon = ICONS[kind] || FileText;
  return (
    <div className="mdl-thumb">
      {src && !broken
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <div className="mdl-thumb-icon" style={{ '--c': KIND_META[kind].color }}><Icon size={34} /><b>{KIND_META[kind].label}</b></div>}
    </div>
  );
}

function snippetOf(t) {
  if (t.description) return t.description;
  const withText = (t.items || []).find((i) => (i.kind === 'link' && i.link_meta && i.link_meta.description) || i.preview_text);
  return withText ? (withText.kind === 'link' ? withText.link_meta.description : withText.preview_text) : '';
}

// Escolha de anexos (arquivos e links) — usada ao criar o modelo e ao somar anexos pela gaveta.
function ItemPicker({ files, setFiles, links, setLinks, room, setError }) {
  const [over, setOver] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const fileRef = useRef(null);

  function addFiles(list) {
    setError('');
    const incoming = [...(list || [])];
    let space = room - files.length - links.length;
    const ok = [];
    for (const f of incoming) {
      if (space <= 0) { setError(`Um modelo aceita até ${MAX_ITEMS} anexos.`); break; }
      if (!isAllowedFile(f.name)) { setError(`"${f.name}" não é de um tipo aceito. Use PDF, Word, PowerPoint, Excel, HTML, texto ou imagem.`); continue; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(`"${f.name}" passa de ${MAX_FILE_MB} MB. Para arquivos grandes, adicione como link.`); continue; }
      ok.push(f); space -= 1;
    }
    if (ok.length) setFiles([...files, ...ok]);
  }
  function addLink() {
    const v = linkDraft.trim();
    if (!v) return;
    if (files.length + links.length >= room) { setError(`Um modelo aceita até ${MAX_ITEMS} anexos.`); return; }
    setLinks([...links, v]); setLinkDraft(''); setError('');
  }

  return (
    <>
      <label>Arquivos</label>
      <div
        className={`mdl-dz${over ? ' over' : ''}`} role="button" tabIndex={0}
        onClick={() => fileRef.current && fileRef.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current && fileRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        <Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Arraste aqui ou clique para escolher (pode ser mais de um)<br />PDF, Word, PowerPoint, Excel, HTML, texto ou imagem, até {MAX_FILE_MB} MB cada
      </div>
      <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

      <label htmlFor="mdl-link-draft">Links</label>
      <div className="mdl-add-row">
        <input id="mdl-link-draft" type="url" inputMode="url" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://..." onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
        <button type="button" className="par-btn par-btn-ghost" onClick={addLink} disabled={!linkDraft.trim()}>Incluir</button>
      </div>
      <div className="mdl-note">Para links a gente busca título, descrição e imagem da página. Páginas com login (Google Drive, SharePoint) mostram só o domínio.</div>

      {(files.length > 0 || links.length > 0) && (
        <div className="mdl-pick-list">
          {files.map((f, i) => {
            const k = fileKind(f); const Icon = ICONS[k] || FileText;
            return (
              <div key={`f${i}`} className="mdl-pick" style={{ '--c': KIND_META[k].color }}>
                <Icon size={15} /><span className="n">{f.name}</span><span className="s">{fmtFileSize(f.size)}</span>
                <button type="button" aria-label={`Tirar ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            );
          })}
          {links.map((l, i) => (
            <div key={`l${i}`} className="mdl-pick" style={{ '--c': KIND_META.link.color }}>
              <Link2 size={15} /><span className="n">{l}</span>
              <button type="button" aria-label={`Tirar ${l}`} onClick={() => setLinks(links.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Envia os anexos escolhidos, um por vez; devolve { template, failed[] }.
async function sendItems(rest, startTemplate) {
  let template = startTemplate;
  const failed = [];
  for (const it of rest) {
    try { template = await apiPost(`/api/templates/${template.id}/items`, await toBody(it)); } catch (e) { failed.push(`${it.label}: ${e.message || 'falhou'}`); }
  }
  return { template, failed };
}
async function toBody(it) {
  return it.file ? { kind: 'file', fileName: it.file.name, fileDataBase64: await readFileAsBase64(it.file) } : { kind: 'link', url: it.url };
}
const queueOf = (files, links) => [...files.map((f) => ({ file: f, label: f.name })), ...links.map((u) => ({ url: u, label: u }))];

function AddModal({ onClose, onCreated, categories }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError('');
    const queue = queueOf(files, links);
    if (!queue.length) { setError('Inclua pelo menos um arquivo ou link.'); return; }
    setSaving(true);
    try {
      setProgress(queue.length > 1 ? `Enviando 1 de ${queue.length}…` : 'Enviando…');
      const created = await apiPost('/api/templates', { ...(await toBody(queue[0])), title: title.trim(), category, description });
      let template = created; let failed = [];
      if (queue.length > 1) {
        const rest = queue.slice(1);
        setProgress(`Enviando ${queue.length - rest.length + 1} de ${queue.length}…`);
        const out = await sendItems(rest, created);
        template = out.template; failed = out.failed;
      }
      onCreated(template, failed);
    } catch (e) { setError(e.message || 'Não foi possível adicionar.'); setSaving(false); setProgress(''); }
  }

  return (
    <SidePanel title="Novo modelo" onClose={saving ? () => {} : onClose}>
      <div className="mdl-form">
        <label htmlFor="mdl-title" style={{ marginTop: 0 }}>Título (opcional)</label>
        <input id="mdl-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Se ficar vazio, usa o nome do primeiro anexo" />

        <label htmlFor="mdl-cat">Categoria</label>
        <input id="mdl-cat" type="text" list="mdl-cats-add" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Contratos, Propostas…" maxLength={40} />
        <datalist id="mdl-cats-add">{[...new Set([...categories, ...SUGGESTED_CATEGORIES])].map((c) => <option key={c} value={c} />)}</datalist>

        <label htmlFor="mdl-desc">Para que serve (opcional)</label>
        <textarea id="mdl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar, quem preenche, o que ajustar…" />

        <ItemPicker files={files} setFiles={setFiles} links={links} setLinks={setLinks} room={MAX_ITEMS} setError={setError} />

        {error && <div className="par-error" role="alert">{error}</div>}
        <div className="par-btn-row">
          <button className="par-btn par-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="par-btn par-btn-primary" onClick={submit} disabled={saving}>{saving ? progress || 'Enviando…' : 'Adicionar'}</button>
        </div>
      </div>
    </SidePanel>
  );
}

function Preview({ t, item }) {
  const kind = itemKind(item);
  if (kind === 'link') {
    const m = item.link_meta || {};
    return (
      <div className="mdl-pv">
        {m.image && <img className="mdl-lk-img" src={m.image} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div className="mdl-lk-body">
          <div className="mdl-lk-site">{m.siteName || m.host || hostOf(item.url)}</div>
          <div className="mdl-lk-title">{m.title || hostOf(item.url)}</div>
          {m.description && <div className="mdl-lk-desc">{m.description}</div>}
          {m.ok === false && <div className="mdl-lk-warn">{m.error || 'Sem prévia para este link.'} O link continua funcionando.</div>}
          {m.ok && !m.title && !m.description && <div className="mdl-lk-warn">A página não informa título nem descrição{m.needsLogin ? ' (pode exigir login)' : ''}.</div>}
        </div>
      </div>
    );
  }
  const src = `/api/templates/${t.id}/items/${item.id}/file`;
  if (kind === 'pdf') return <div className="mdl-pv"><iframe title={item.file_name} src={src} /></div>;
  if (kind === 'html') return <div className="mdl-pv"><iframe title={item.file_name} src={src} sandbox="" /><div className="mdl-pv-note">Prévia isolada: scripts do arquivo não rodam aqui.</div></div>;
  if (kind === 'image') return <div className="mdl-pv"><img className="mdl-pv-img" src={src} alt={item.file_name} /></div>;
  if (item.preview_text) {
    return (
      <div className="mdl-pv">
        <div className="mdl-pv-head">Começo do conteúdo</div>
        <div className="mdl-pv-text">{item.preview_text}</div>
        <div className="mdl-pv-note">Arquivos do Office não abrem aqui dentro. Baixe para ver completo.</div>
      </div>
    );
  }
  return <div className="mdl-pv"><div className="mdl-pv-text" style={{ color: 'var(--text-5)' }}>{kind === 'text' ? 'Abra o arquivo para ler.' : 'Este formato não tem prévia aqui. Baixe o arquivo para abrir no seu programa.'}</div></div>;
}

function Drawer({ t, currentUser, categories, onClose, onChanged, onDeleted }) {
  const items = t.items || [];
  const [itemId, setItemId] = useState(items[0] ? items[0].id : null);
  const [comments, setComments] = useState(t.comments || []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFiles, setNewFiles] = useState([]);
  const [newLinks, setNewLinks] = useState([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const item = items.find((i) => i.id === itemId) || items[0];
  const titleField = useDebouncedField(t.title, (v) => save({ title: v }));
  const descField = useDebouncedField(t.description || '', (v) => save({ description: v }));
  const catField = useDebouncedField(t.category || '', (v) => save({ category: v }));

  useEffect(() => { setComments(t.comments || []); }, [t.id, t.comments]);
  useEffect(() => { if (!items.some((i) => i.id === itemId)) setItemId(items[0] ? items[0].id : null); }, [t.items]);
  useEffect(() => { setUrlDraft(item && item.url ? item.url : ''); }, [item && item.id, item && item.url]);

  async function save(patch) {
    try { onChanged(await apiPatch(`/api/templates/${t.id}`, patch)); } catch { /* o rascunho local fica; rede falhou */ }
  }
  async function run(fn, fallback) {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(e.message || fallback); return null; } finally { setBusy(false); }
  }
  const saveUrl = () => run(async () => onChanged(await apiPatch(`/api/templates/${t.id}/items/${item.id}`, { url: urlDraft })), 'Não foi possível salvar o endereço.');
  const refresh = () => run(async () => onChanged(await apiPatch(`/api/templates/${t.id}/items/${item.id}`, {})), 'Não foi possível atualizar a prévia.');
  const removeItem = () => {
    if (!window.confirm(`Remover "${itemName(item)}" deste modelo?`)) return Promise.resolve();
    return run(async () => onChanged(await apiDelete(`/api/templates/${t.id}/items/${item.id}`)), 'Não foi possível remover o anexo.');
  };
  async function addItems() {
    const queue = queueOf(newFiles, newLinks);
    if (!queue.length) return;
    const out = await run(async () => sendItems(queue, t), 'Não foi possível adicionar.');
    if (!out) return;
    onChanged(out.template);
    if (out.failed.length) setError(`Não consegui enviar: ${out.failed.join('; ')}`);
    else { setAdding(false); setNewFiles([]); setNewLinks([]); }
    const last = out.template.items[out.template.items.length - 1];
    if (last && out.template.items.length > items.length) setItemId(last.id);
  }
  async function submitComment() {
    if (!draft.trim()) return;
    setSending(true);
    try { const { comment } = await apiPost(`/api/templates/${t.id}/comments`, { text: draft.trim() }); setComments((p) => [...p, comment]); setDraft(''); } catch { /* mantém o rascunho */ }
    setSending(false);
  }
  async function removeComment(id) {
    setComments((p) => p.filter((c) => c.id !== id));
    try { await apiDelete(`/api/templates/${t.id}/comments/${id}`); } catch { setComments(t.comments || []); }
  }
  async function handleDelete() {
    if (!window.confirm(`Excluir o modelo "${t.title}" e todos os ${items.length} anexos? Essa ação não pode ser desfeita.`)) return;
    await apiDelete(`/api/templates/${t.id}`);
    onDeleted(t.id);
  }

  const canDeleteComment = (c) => currentUser && (c.userId === currentUser.id || currentUser.role === 'master');
  const kind = item ? itemKind(item) : 'text';
  const fileUrl = item ? `/api/templates/${t.id}/items/${item.id}/file` : '';

  return (
    <SidePanel title="Modelo" onClose={() => { titleField.flush(); descField.flush(); catField.flush(); onClose(); }}>
      <div className="par-drawer-title-row">
        {editing
          ? <input type="text" style={{ flex: 1, fontSize: 15, fontWeight: 800 }} value={titleField.draft} onChange={(e) => titleField.onChange(e.target.value)} onBlur={titleField.flush} autoFocus />
          : <div className="par-drawer-title" style={{ flex: 1 }}>{titleField.draft}</div>}
        <button className="par-comment-del" title={editing ? 'Concluir edição' : 'Editar'} aria-label={editing ? 'Concluir edição' : 'Editar'} onClick={() => setEditing((v) => !v)}><Pencil size={14} /></button>
      </div>
      <div className="par-drawer-file">{items.length} {items.length === 1 ? 'anexo' : 'anexos'} · por {t.created_by_name || 'alguém'} em {fmtTs(t.created_at)}</div>

      <div className="mdl-items" role="group" aria-label="Anexos do modelo">
        {items.map((i) => {
          const k = itemKind(i); const Icon = ICONS[k] || FileText;
          return <button key={i.id} type="button" className="mdl-item" style={{ '--c': KIND_META[k].color }} aria-pressed={item && i.id === item.id} title={itemName(i)} onClick={() => setItemId(i.id)}><Icon size={14} /><span>{itemName(i)}</span></button>;
        })}
        {items.length < MAX_ITEMS && <button type="button" className="mdl-item" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus size={14} /><span>Adicionar anexo</span></button>}
      </div>

      {adding && (
        <div className="mdl-add-panel mdl-form">
          <ItemPicker files={newFiles} setFiles={setNewFiles} links={newLinks} setLinks={setNewLinks} room={MAX_ITEMS - items.length} setError={setError} />
          <div className="par-btn-row">
            <button className="par-btn par-btn-ghost" onClick={() => { setAdding(false); setNewFiles([]); setNewLinks([]); }} disabled={busy}>Cancelar</button>
            <button className="par-btn par-btn-primary" onClick={addItems} disabled={busy || (!newFiles.length && !newLinks.length)}>{busy ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </div>
      )}

      {item && <Preview t={t} item={item} />}

      {item && (
        <div className="par-drawer-actions">
          {kind === 'link' ? (
            <>
              <a className="par-btn par-btn-primary" href={item.url} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none' }}><ExternalLink size={14} /> Abrir link</a>
              <button className="par-btn par-btn-ghost" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Atualizar prévia</button>
            </>
          ) : (
            <>
              {INLINE_KINDS.has(kind)
                ? <a className="par-btn par-btn-primary" href={fileUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><ExternalLink size={14} /> Abrir</a>
                : <a className="par-btn par-btn-primary" href={`${fileUrl}?download=1`} style={{ textDecoration: 'none' }}><Download size={14} /> Baixar</a>}
              {INLINE_KINDS.has(kind) && <a className="par-btn par-btn-ghost" href={`${fileUrl}?download=1`} style={{ textDecoration: 'none' }}><Download size={14} /> Baixar</a>}
            </>
          )}
          {items.length > 1 && <button className="par-btn par-btn-ghost" onClick={removeItem} disabled={busy}><X size={14} /> Remover este anexo</button>}
        </div>
      )}
      {item && <div className="par-drawer-file" style={{ marginTop: -8 }}>{kind === 'link' ? item.url : `${item.file_name} · ${fmtFileSize(item.file_size)}`}</div>}
      {error && <div className="par-error" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{error}</div>}

      {editing && (
        <div className="mdl-form" style={{ marginBottom: 14 }}>
          <label htmlFor="mdl-edit-cat" style={{ marginTop: 0 }}>Categoria</label>
          <input id="mdl-edit-cat" type="text" list={`mdl-cats-${t.id}`} value={catField.draft} onChange={(e) => catField.onChange(e.target.value)} onBlur={catField.flush} maxLength={40} />
          <datalist id={`mdl-cats-${t.id}`}>{[...new Set([...categories, ...SUGGESTED_CATEGORIES])].map((c) => <option key={c} value={c} />)}</datalist>
          {item && kind === 'link' && (
            <>
              <label htmlFor="mdl-edit-url">Endereço deste link</label>
              <div className="mdl-url-row">
                <input id="mdl-edit-url" type="url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} />
                <button className="par-btn par-btn-primary" onClick={saveUrl} disabled={busy || urlDraft === item.url}>Salvar</button>
              </div>
            </>
          )}
        </div>
      )}
      {!editing && t.category && <div style={{ marginBottom: 12 }}><span className="mdl-cat">{t.category}</span></div>}

      <div className="par-drawer-section">
        <div className="par-drawer-label">Para que serve</div>
        {editing
          ? <textarea style={{ width: '100%', minHeight: 70 }} value={descField.draft} onChange={(e) => descField.onChange(e.target.value)} onBlur={descField.flush} placeholder="Quando usar, quem preenche, o que ajustar…" />
          : <div className="par-drawer-desc">{descField.draft || <span style={{ color: 'var(--text-7)' }}>Sem descrição.</span>}</div>}
      </div>

      <div className="par-drawer-section">
        <div className="par-drawer-label"><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários ({comments.length})</div>
        {comments.map((c) => (
          <div key={c.id} className="par-comment">
            <div className="par-comment-head">
              <span><strong>{c.userName}</strong> · {fmtTs(c.ts)}</span>
              {canDeleteComment(c) && <button className="par-comment-del" aria-label="Excluir comentário" onClick={() => removeComment(c.id)}><X size={12} /></button>}
            </div>
            <div className="par-comment-text">{c.text}</div>
          </div>
        ))}
        <div className="par-comment-input-row">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva um comentário…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitComment(); }} />
          <button className="par-btn par-btn-primary" aria-label="Enviar comentário" onClick={submitComment} disabled={sending || !draft.trim()}><Send size={14} /></button>
        </div>
      </div>

      <div className="par-drawer-actions" style={{ marginTop: 18 }}>
        <button className="par-btn par-btn-danger" onClick={handleDelete}><Trash2 size={14} /> Excluir modelo</button>
      </div>
    </SidePanel>
  );
}

export default function ModelosScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    apiGet('/api/templates').then((r) => { setItems(r.templates || []); setLoaded(true); }).catch((e) => { setError(e.message || 'Não foi possível carregar os modelos.'); setLoaded(true); });
  }, []);

  const categories = [...new Set(items.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const kindsPresent = KIND_ORDER.filter((k) => items.some((t) => kindsOf(t).includes(k)));
  const noCat = items.filter((t) => !t.category).length;

  const filtered = items.filter((t) => {
    if (cat === '__none') { if (t.category) return false; } else if (cat !== 'all' && t.category !== cat) return false;
    if (kindFilter !== 'all' && !kindsOf(t).includes(kindFilter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [t.title, t.description, t.category, ...(t.items || []).flatMap((i) => [i.file_name, i.url, i.preview_text, i.link_meta && i.link_meta.title, i.link_meta && i.link_meta.description])];
    return hay.some((v) => (v || '').toLowerCase().includes(q));
  });
  const selected = selectedId ? items.find((t) => t.id === selectedId) : null;
  const filterActive = search.trim() || cat !== 'all' || kindFilter !== 'all';
  const upsert = (u) => setItems((p) => (p.some((x) => x.id === u.id) ? p.map((x) => (x.id === u.id ? u : x)) : [u, ...p]));

  return (
    <div className="par-root">
      <style>{PARECERES_CSS}{MODELOS_CSS}</style>
      <div className="par-shell">
        <div className="par-topbar">
          {onExit ? <button className="par-back" onClick={onExit}><ArrowLeft size={16} /> Voltar</button> : <span />}
          <div className="par-actions">
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
            <button title="Sair" aria-label="Sair" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <div className="par-body">
          <div className="par-inner">
            <div className="par-hero">
              <div>
                <h1 className="par-title">Modelos de documentos</h1>
                <p className="par-subtitle">Contratos, propostas, apresentações e planilhas prontos para a equipe reaproveitar. Cada modelo pode ter vários anexos: o mesmo documento em Word, Excel, PDF, HTML ou link.</p>
              </div>
              <div className="mdl-hero-actions"><button className="par-btn par-btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Novo modelo</button></div>
            </div>
            {notice && <div className="par-error" role="alert" style={{ marginTop: 0, marginBottom: 16 }}>{notice} <button type="button" className="par-comment-del" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={12} /></button></div>}

            <div className="par-toolbar">
              <div className="par-search">
                <Search size={16} />
                <input type="text" placeholder="Buscar modelos" aria-label="Buscar modelos" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {items.length > 0 && (
                <>
                  {categories.length > 0 && (
                    <div className="mdl-chiprow">
                      <span className="mdl-chiplabel">Categoria</span>
                      <div className="par-chips">
                        <button className={`par-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>Todas <span className="par-chip-n">{items.length}</span></button>
                        {categories.map((c) => <button key={c} className={`par-chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c} <span className="par-chip-n">{items.filter((t) => t.category === c).length}</span></button>)}
                        {noCat > 0 && <button className={`par-chip${cat === '__none' ? ' on' : ''}`} onClick={() => setCat('__none')}>Sem categoria <span className="par-chip-n">{noCat}</span></button>}
                      </div>
                    </div>
                  )}
                  {kindsPresent.length > 1 && (
                    <div className="mdl-chiprow">
                      <span className="mdl-chiplabel">Tipo</span>
                      <div className="par-chips">
                        <button className={`par-chip${kindFilter === 'all' ? ' on' : ''}`} onClick={() => setKindFilter('all')}>Todos</button>
                        {kindsPresent.map((k) => <button key={k} className={`par-chip${kindFilter === k ? ' on' : ''}`} onClick={() => setKindFilter(k)}>{KIND_META[k].label} <span className="par-chip-n">{items.filter((t) => kindsOf(t).includes(k)).length}</span></button>)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!loaded && <div className="par-empty">Carregando…</div>}
            {error && <div className="par-error" role="alert">{error}</div>}
            {loaded && !error && filtered.length === 0 && (
              <div className="par-empty">
                <div className="par-empty-icon"><FileText size={26} /></div>
                <div>{items.length === 0 ? 'Nenhum modelo ainda.' : 'Nenhum modelo encontrado com esse filtro.'}</div>
                {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-6)' }}>Clique em "Novo modelo" para subir arquivos ou colar links.</div>}
              </div>
            )}
            {filtered.length > 0 && (
              <>
                {filterActive && <div style={{ fontSize: 13, color: 'var(--text-5)', marginBottom: 14 }}>{filtered.length} {filtered.length === 1 ? 'modelo encontrado' : 'modelos encontrados'}</div>}
                <div className="par-grid">
                  {filtered.map((t) => {
                    const kinds = kindsOf(t);
                    const snippet = snippetOf(t);
                    const n = (t.comments || []).length;
                    const nItems = (t.items || []).length;
                    return (
                      <div key={t.id} className="par-card" role="button" tabIndex={0} onClick={() => setSelectedId(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(t.id); } }}>
                        <Thumb t={t} />
                        <div className="par-card-top">
                          <div className="mdl-badges">
                            {kinds.slice(0, 4).map((k) => <TypeBadge key={k} kind={k} />)}
                            {kinds.length > 4 && <span className="mdl-more">+{kinds.length - 4}</span>}
                          </div>
                          {t.category && <span className="mdl-cat">{t.category}</span>}
                        </div>
                        <div className="par-card-main">
                          <div className="par-card-title">{t.title}</div>
                          {snippet && <div className="mdl-snippet">{snippet}</div>}
                        </div>
                        <div className="par-card-foot">
                          <div className="par-card-author">
                            <span className="par-avatar">{initialsOf(t.created_by_name)}</span>
                            <span className="par-card-who"><b>{t.created_by_name || 'Alguém'}</b><span>{new Date(t.created_at).toLocaleDateString('pt-BR')} · {nItems} {nItems === 1 ? 'anexo' : 'anexos'}</span></span>
                          </div>
                          {n > 0 && <span className="par-card-comments" title={`${n} comentário${n === 1 ? '' : 's'}`}><MessageSquare size={14} /> {n}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {adding && <AddModal categories={categories} onClose={() => setAdding(false)} onCreated={(tpl, failed) => { upsert(tpl); setAdding(false); setSelectedId(tpl.id); if (failed.length) setNotice(`Modelo criado, mas não consegui enviar: ${failed.join('; ')}`); }} />}
      {selected && (
        <Drawer
          key={selected.id}
          t={selected} currentUser={currentUser} categories={categories}
          onClose={() => setSelectedId(null)}
          onChanged={upsert}
          onDeleted={(id) => { setItems((p) => p.filter((x) => x.id !== id)); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
