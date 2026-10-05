// Modelos de documentos (2026-10-05, §78) — aba irmã dos Pareceres: biblioteca de modelos (arquivos e links) para sócios e
// colaboradores. Mesma área PRICETAX-only e o mesmo esqueleto visual dos Pareceres (classes par-*), com prévia por tipo:
// PDF e imagem abrem na própria tela, Word/PowerPoint/Excel mostram o começo do conteúdo, link mostra título/descrição/imagem.
import React, { useEffect, useRef, useState } from 'react';
import { FileText, FileSpreadsheet, Presentation, Image as ImageIcon, Link2, X, LogOut, Plus, Upload, Trash2, Pencil, ExternalLink, Download, RefreshCw, MessageSquare, Send, Search, ArrowLeft } from 'lucide-react';
import { ThemeToggleBtn, SidePanel, useDebouncedField, fmtTs } from '../App.jsx';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { PARECERES_CSS, fmtFileSize, initialsOf } from '../pareceres/pareceresMeta.js';
import { MODELOS_CSS, MAX_FILE_MB, ACCEPT, KIND_META, INLINE_KINDS, kindOf, hostOf, extOf, SUGGESTED_CATEGORIES } from './modelosMeta.js';

const ICONS = { pdf: FileText, word: FileText, text: FileText, ppt: Presentation, excel: FileSpreadsheet, image: ImageIcon, link: Link2 };
const KIND_ORDER = ['pdf', 'word', 'ppt', 'excel', 'image', 'text', 'link'];

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

function Thumb({ t, kind }) {
  const [broken, setBroken] = useState(false);
  const Icon = ICONS[kind] || FileText;
  let src = '';
  if (kind === 'link' && t.link_meta && t.link_meta.image) src = t.link_meta.image;
  if (kind === 'image' && t.file_size <= 2 * 1024 * 1024) src = `/api/templates/${t.id}/file`;
  return (
    <div className="mdl-thumb">
      {src && !broken
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <div className="mdl-thumb-icon" style={{ '--c': KIND_META[kind].color }}><Icon size={34} /><b>{KIND_META[kind].label}</b></div>}
    </div>
  );
}

function snippetOf(t, kind) {
  if (t.description) return t.description;
  if (kind === 'link') return (t.link_meta && t.link_meta.description) || '';
  return t.preview_text || '';
}

function AddModal({ onClose, onCreated, categories }) {
  const [mode, setMode] = useState('file');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  function pickFile(f) {
    setError('');
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) { setError(`Arquivo maior que ${MAX_FILE_MB} MB. Para arquivos grandes, adicione como link.`); return; }
    setFile(f);
  }

  async function submit() {
    setError('');
    if (mode === 'file' && !file) { setError('Escolha um arquivo.'); return; }
    if (mode === 'link' && !url.trim()) { setError('Cole o endereço do link.'); return; }
    setSaving(true);
    try {
      const body = mode === 'file'
        ? { kind: 'file', title: title.trim(), category, description, fileName: file.name, fileDataBase64: await readFileAsBase64(file) }
        : { kind: 'link', title: title.trim(), category, description, url: url.trim() };
      onCreated(await apiPost('/api/templates', body));
    } catch (e) { setError(e.message || 'Não foi possível adicionar.'); setSaving(false); }
  }

  return (
    <SidePanel title="Novo modelo" onClose={onClose}>
      <div className="mdl-form">
        <div className="mdl-seg" role="group" aria-label="Tipo de modelo">
          <button type="button" className={mode === 'file' ? 'active' : ''} aria-pressed={mode === 'file'} onClick={() => setMode('file')}><Upload size={15} /> Arquivo</button>
          <button type="button" className={mode === 'link' ? 'active' : ''} aria-pressed={mode === 'link'} onClick={() => setMode('link')}><Link2 size={15} /> Link</button>
        </div>

        {mode === 'file' ? (
          <>
            <label>Arquivo *</label>
            <div
              className={`mdl-dz${file ? ' has-file' : ''}${over ? ' over' : ''}`}
              role="button" tabIndex={0}
              onClick={() => fileRef.current && fileRef.current.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current && fileRef.current.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
            >
              {file ? <span><strong>{file.name}</strong> — {fmtFileSize(file.size)}</span> : <span><Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Arraste o arquivo aqui ou clique para escolher<br />PDF, Word, PowerPoint, Excel, texto ou imagem, até {MAX_FILE_MB} MB</span>}
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
          </>
        ) : (
          <>
            <label htmlFor="mdl-url">Endereço do link *</label>
            <input id="mdl-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." autoFocus />
            <div className="mdl-note">A gente busca o título, a descrição e a imagem da página para montar a prévia. Páginas que exigem login (Google Drive, SharePoint) mostram só o endereço; dê um título você mesmo.</div>
          </>
        )}

        <label htmlFor="mdl-title">Título (opcional)</label>
        <input id="mdl-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'file' ? 'Se ficar vazio, usa o nome do arquivo' : 'Se ficar vazio, usa o título da página'} />

        <label htmlFor="mdl-cat">Categoria</label>
        <input id="mdl-cat" type="text" list="mdl-cats-add" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Contratos, Propostas…" maxLength={40} />
        <datalist id="mdl-cats-add">{[...new Set([...categories, ...SUGGESTED_CATEGORIES])].map((c) => <option key={c} value={c} />)}</datalist>

        <label htmlFor="mdl-desc">Para que serve (opcional)</label>
        <textarea id="mdl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar, quem preenche, o que ajustar…" />

        {error && <div className="par-error" role="alert">{error}</div>}
        <div className="par-btn-row">
          <button className="par-btn par-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="par-btn par-btn-primary" onClick={submit} disabled={saving}>{saving ? (mode === 'link' ? 'Buscando prévia…' : 'Enviando…') : 'Adicionar'}</button>
        </div>
      </div>
    </SidePanel>
  );
}

function Preview({ t, kind }) {
  if (kind === 'link') {
    const m = t.link_meta || {};
    return (
      <div className="mdl-pv">
        {m.image && <img className="mdl-lk-img" src={m.image} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div className="mdl-lk-body">
          <div className="mdl-lk-site">{m.siteName || m.host || hostOf(t.url)}</div>
          <div className="mdl-lk-title">{m.title || t.title}</div>
          {m.description && <div className="mdl-lk-desc">{m.description}</div>}
          {m.ok === false && <div className="mdl-lk-warn">{m.error || 'Sem prévia para este link.'} O link continua funcionando.</div>}
          {m.ok && !m.title && !m.description && <div className="mdl-lk-warn">A página não informa título nem descrição{m.needsLogin ? ' (pode exigir login)' : ''}.</div>}
        </div>
      </div>
    );
  }
  const src = `/api/templates/${t.id}/file`;
  if (kind === 'pdf') return <div className="mdl-pv"><iframe title={t.title} src={src} /></div>;
  if (kind === 'image') return <div className="mdl-pv"><img className="mdl-pv-img" src={src} alt={t.title} /></div>;
  if (t.preview_text) {
    return (
      <div className="mdl-pv">
        <div className="mdl-pv-head">Começo do conteúdo</div>
        <div className="mdl-pv-text">{t.preview_text}</div>
        <div className="mdl-pv-note">Arquivos do Office não abrem aqui dentro. Baixe para ver completo.</div>
      </div>
    );
  }
  return (
    <div className="mdl-pv">
      <div className="mdl-pv-text" style={{ color: 'var(--text-5)' }}>{kind === 'text' ? 'Abra o arquivo para ler.' : 'Este formato não tem prévia aqui. Baixe o arquivo para abrir no seu programa.'}</div>
    </div>
  );
}

function Drawer({ t, currentUser, categories, onClose, onChanged, onDeleted }) {
  const kind = kindOf(t);
  const [comments, setComments] = useState(t.comments || []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [urlDraft, setUrlDraft] = useState(t.url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titleField = useDebouncedField(t.title, (v) => save({ title: v }));
  const descField = useDebouncedField(t.description || '', (v) => save({ description: v }));
  const catField = useDebouncedField(t.category || '', (v) => save({ category: v }));

  useEffect(() => { setComments(t.comments || []); }, [t.id, t.comments]);
  useEffect(() => { setUrlDraft(t.url || ''); }, [t.id, t.url]);

  async function save(patch) {
    try { onChanged(await apiPatch(`/api/templates/${t.id}`, patch)); } catch { /* o rascunho local fica; rede falhou */ }
  }
  async function saveUrl() {
    setBusy(true); setError('');
    try { onChanged(await apiPatch(`/api/templates/${t.id}`, { url: urlDraft })); } catch (e) { setError(e.message || 'Não foi possível salvar o endereço.'); }
    setBusy(false);
  }
  async function refresh() {
    setBusy(true); setError('');
    try { onChanged(await apiPost(`/api/templates/${t.id}/refresh-preview`, {})); } catch (e) { setError(e.message || 'Não foi possível atualizar a prévia.'); }
    setBusy(false);
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
    if (!window.confirm(`Excluir "${t.title}"? Essa ação não pode ser desfeita.`)) return;
    await apiDelete(`/api/templates/${t.id}`);
    onDeleted(t.id);
  }

  const canDeleteComment = (c) => currentUser && (c.userId === currentUser.id || currentUser.role === 'master');
  const fileUrl = `/api/templates/${t.id}/file`;

  return (
    <SidePanel title="Modelo" onClose={() => { titleField.flush(); descField.flush(); catField.flush(); onClose(); }}>
      <div className="par-drawer-title-row">
        {editing
          ? <input type="text" style={{ flex: 1, fontSize: 15, fontWeight: 800 }} value={titleField.draft} onChange={(e) => titleField.onChange(e.target.value)} onBlur={titleField.flush} autoFocus />
          : <div className="par-drawer-title" style={{ flex: 1 }}>{titleField.draft}</div>}
        <button className="par-comment-del" title={editing ? 'Concluir edição' : 'Editar'} aria-label={editing ? 'Concluir edição' : 'Editar'} onClick={() => setEditing((v) => !v)}><Pencil size={14} /></button>
      </div>
      <div className="par-drawer-file" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge kind={kind} />
        <span>{kind === 'link' ? hostOf(t.url) : `${t.file_name} · ${fmtFileSize(t.file_size)}`} · por {t.created_by_name || 'alguém'} em {fmtTs(t.created_at)}</span>
      </div>

      <Preview t={t} kind={kind} />

      {editing && (
        <div className="mdl-form" style={{ marginBottom: 14 }}>
          <label htmlFor="mdl-edit-cat" style={{ marginTop: 0 }}>Categoria</label>
          <input id="mdl-edit-cat" type="text" list={`mdl-cats-${t.id}`} value={catField.draft} onChange={(e) => catField.onChange(e.target.value)} onBlur={catField.flush} maxLength={40} />
          <datalist id={`mdl-cats-${t.id}`}>{[...new Set([...categories, ...SUGGESTED_CATEGORIES])].map((c) => <option key={c} value={c} />)}</datalist>
          {kind === 'link' && (
            <>
              <label htmlFor="mdl-edit-url">Endereço do link</label>
              <div className="mdl-url-row">
                <input id="mdl-edit-url" type="url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} />
                <button className="par-btn par-btn-primary" onClick={saveUrl} disabled={busy || urlDraft === t.url}>Salvar</button>
              </div>
            </>
          )}
        </div>
      )}
      {!editing && t.category && <div style={{ marginBottom: 12 }}><span className="mdl-cat">{t.category}</span></div>}

      <div className="par-drawer-actions">
        {kind === 'link' ? (
          <>
            <a className="par-btn par-btn-primary" href={t.url} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none' }}><ExternalLink size={14} /> Abrir link</a>
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
        <button className="par-btn par-btn-danger" onClick={handleDelete}><Trash2 size={14} /> Excluir</button>
      </div>
      {error && <div className="par-error" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{error}</div>}

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
    </SidePanel>
  );
}

export default function ModelosScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    apiGet('/api/templates').then((r) => { setItems(r.templates || []); setLoaded(true); }).catch((e) => { setError(e.message || 'Não foi possível carregar os modelos.'); setLoaded(true); });
  }, []);

  const categories = [...new Set(items.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const kindsPresent = KIND_ORDER.filter((k) => items.some((t) => kindOf(t) === k));
  const noCat = items.filter((t) => !t.category).length;

  const filtered = items.filter((t) => {
    if (cat === '__none') { if (t.category) return false; } else if (cat !== 'all' && t.category !== cat) return false;
    if (kindFilter !== 'all' && kindOf(t) !== kindFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.title, t.description, t.category, t.file_name, t.url, t.preview_text, t.link_meta && t.link_meta.title, t.link_meta && t.link_meta.description].some((v) => (v || '').toLowerCase().includes(q));
  });
  const selected = selectedId ? items.find((t) => t.id === selectedId) : null;
  const filterActive = search.trim() || cat !== 'all' || kindFilter !== 'all';

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
                <p className="par-subtitle">Contratos, propostas, apresentações e planilhas prontos para a equipe reaproveitar. Suba o arquivo ou cole um link.</p>
              </div>
              <div className="mdl-hero-actions"><button className="par-btn par-btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Novo modelo</button></div>
            </div>

            <div className="par-toolbar">
              <div className="par-search">
                <Search size={16} />
                <input type="text" placeholder="Buscar modelos" aria-label="Buscar modelos" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {items.length > 0 && (
                <>
                  {(categories.length > 0) && (
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
                        {kindsPresent.map((k) => <button key={k} className={`par-chip${kindFilter === k ? ' on' : ''}`} onClick={() => setKindFilter(k)}>{KIND_META[k].label} <span className="par-chip-n">{items.filter((t) => kindOf(t) === k).length}</span></button>)}
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
                {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-6)' }}>Clique em "Novo modelo" para subir um arquivo ou colar um link.</div>}
              </div>
            )}
            {filtered.length > 0 && (
              <>
                {filterActive && <div style={{ fontSize: 13, color: 'var(--text-5)', marginBottom: 14 }}>{filtered.length} {filtered.length === 1 ? 'modelo encontrado' : 'modelos encontrados'}</div>}
                <div className="par-grid">
                  {filtered.map((t) => {
                    const kind = kindOf(t);
                    const snippet = snippetOf(t, kind);
                    const n = (t.comments || []).length;
                    const title = kind === 'link' ? t.title : t.title;
                    return (
                      <div key={t.id} className="par-card" role="button" tabIndex={0} onClick={() => setSelectedId(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(t.id); } }}>
                        <Thumb t={t} kind={kind} />
                        <div className="par-card-top">
                          <TypeBadge kind={kind} extra={kind === 'link' ? hostOf(t.url) : fmtFileSize(t.file_size)} />
                          {t.category && <span className="mdl-cat">{t.category}</span>}
                        </div>
                        <div className="par-card-main">
                          <div className="par-card-title">{title}</div>
                          {snippet && <div className="mdl-snippet">{snippet}</div>}
                        </div>
                        <div className="par-card-foot">
                          <div className="par-card-author">
                            <span className="par-avatar">{initialsOf(t.created_by_name)}</span>
                            <span className="par-card-who"><b>{t.created_by_name || 'Alguém'}</b><span>{new Date(t.created_at).toLocaleDateString('pt-BR')}</span></span>
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

      {adding && <AddModal categories={categories} onClose={() => setAdding(false)} onCreated={(c) => { setItems((p) => [c, ...p]); setAdding(false); setSelectedId(c.id); }} />}
      {selected && (
        <Drawer
          t={selected} currentUser={currentUser} categories={categories}
          onClose={() => setSelectedId(null)}
          onChanged={(u) => setItems((p) => p.map((x) => (x.id === u.id ? { ...x, ...u } : x)))}
          onDeleted={(id) => { setItems((p) => p.filter((x) => x.id !== id)); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
