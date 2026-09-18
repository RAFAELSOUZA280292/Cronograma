// Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório
// de PDFs (pareceres técnicos) pra compartilhar com sócios/colaboradores.
// Área PRICETAX-only (master/pricetax — decisão confirmada com o Rafael,
// mesma regra da Central de Conhecimento em server/knowledge.js), montada
// como um novo workspaceMode em src/App.jsx. Mesmo padrão de módulo
// autocontido de src/knowledge/ — CSS próprio, SidePanel reaproveitado do
// App.jsx pro drawer de detalhe.
import React, { useEffect, useRef, useState } from 'react';
import { FileText, X, LogOut, Plus, Upload, Trash2, Pencil, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { ThemeToggleBtn, SidePanel, useDebouncedField, fmtTs } from '../App.jsx';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { PARECERES_CSS, fmtFileSize, PARECERES_MAX_MB } from './pareceresMeta.js';

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const idx = result.indexOf(',');
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function UploadParecerModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  function pickFile(f) {
    setError('');
    if (!f) { setFile(null); return; }
    if (f.type !== 'application/pdf') { setError('Só arquivos PDF são aceitos.'); return; }
    if (f.size > PARECERES_MAX_MB * 1024 * 1024) { setError(`Arquivo maior que ${PARECERES_MAX_MB}MB — não pode ser enviado.`); return; }
    setFile(f);
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Informe uma identificação para o arquivo.'); return; }
    if (!file) { setError('Selecione um arquivo PDF.'); return; }
    setSaving(true);
    setError('');
    try {
      const fileDataBase64 = await readFileAsBase64(file);
      const created = await apiPost('/api/pareceres', {
        title: title.trim(), description: description.trim(),
        fileName: file.name, mimeType: 'application/pdf', fileDataBase64,
      });
      onCreated(created);
    } catch (e) {
      setError(e.message || 'Não foi possível enviar o Parecer.');
      setSaving(false);
    }
  }

  return (
    <SidePanel title="Novo Parecer" onClose={onClose}>
      <div className="par-form">
        <label>Identificação do arquivo *</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Ex.: "Parecer — Reforma Tributária, créditos de IBS/CBS sobre RH"' autoFocus />

        <label>Comentário / contexto (opcional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Do que se trata, pra quem é relevante, etc." />

        <label>Arquivo PDF *</label>
        <div className={`par-dropzone ${file ? 'has-file' : ''}`} onClick={() => fileRef.current && fileRef.current.click()}>
          {file ? (
            <span><strong>{file.name}</strong> — {fmtFileSize(file.size)}</span>
          ) : (
            <span><Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Clique pra escolher um PDF (até {PARECERES_MAX_MB}MB)</span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files && e.target.files[0])} />

        {error && <div className="par-error">{error}</div>}

        <div className="par-btn-row">
          <button className="par-btn par-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="par-btn par-btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Enviando…' : 'Enviar Parecer'}</button>
        </div>
      </div>
    </SidePanel>
  );
}

function ParecerDrawer({ parecer, currentUser, onClose, onChanged, onDeleted }) {
  const [comments, setComments] = useState(parecer.comments || []);
  const [commentDraft, setCommentDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const titleField = useDebouncedField(parecer.title, (v) => saveField({ title: v }));
  const descField = useDebouncedField(parecer.description || '', (v) => saveField({ description: v }));

  useEffect(() => { setComments(parecer.comments || []); }, [parecer.id, parecer.comments]);

  async function saveField(patch) {
    try {
      const updated = await apiPatch(`/api/pareceres/${parecer.id}`, patch);
      onChanged(updated);
    } catch { /* useDebouncedField já mantém o rascunho local; falha de rede não perde o que foi digitado */ }
  }

  async function submitComment() {
    if (!commentDraft.trim()) return;
    setSendingComment(true);
    try {
      const { comment } = await apiPost(`/api/pareceres/${parecer.id}/comments`, { text: commentDraft.trim() });
      setComments((prev) => [...prev, comment]);
      setCommentDraft('');
    } catch { /* erro de rede — mantém o rascunho pro usuário tentar de novo */ }
    setSendingComment(false);
  }

  async function removeComment(id) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    try { await apiDelete(`/api/pareceres/${parecer.id}/comments/${id}`); } catch { setComments(parecer.comments || []); }
  }

  async function handleDelete() {
    if (!window.confirm(`Excluir "${parecer.title}"? Essa ação não pode ser desfeita.`)) return;
    await apiDelete(`/api/pareceres/${parecer.id}`);
    onDeleted(parecer.id);
  }

  const canDeleteComment = (c) => currentUser && (c.userId === currentUser.id || currentUser.role === 'master');

  return (
    <SidePanel title="Parecer" onClose={() => { titleField.flush(); descField.flush(); onClose(); }}>
      <div className="par-drawer-title-row">
        {editing ? (
          <input type="text" style={{ flex: 1, fontSize: 15, fontWeight: 800 }} value={titleField.draft} onChange={(e) => titleField.onChange(e.target.value)} onBlur={titleField.flush} autoFocus />
        ) : (
          <div className="par-drawer-title" style={{ flex: 1 }}>{titleField.draft}</div>
        )}
        <button className="par-comment-del" title={editing ? 'Concluir edição' : 'Editar identificação'} onClick={() => setEditing((v) => !v)}><Pencil size={14} /></button>
      </div>
      <div className="par-drawer-file">{parecer.file_name} · {fmtFileSize(parecer.file_size)} · enviado por {parecer.created_by_name || 'alguém'} em {fmtTs(parecer.created_at)}</div>

      <div className="par-drawer-actions">
        <a className="par-btn par-btn-primary" href={`/api/pareceres/${parecer.id}/file`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          <ExternalLink size={14} /> Abrir PDF
        </a>
        <button className="par-btn par-btn-danger" onClick={handleDelete}><Trash2 size={14} /> Excluir</button>
      </div>

      <div className="par-drawer-section">
        <div className="par-drawer-label">Comentário / contexto</div>
        {editing ? (
          <textarea style={{ width: '100%', minHeight: 70 }} value={descField.draft} onChange={(e) => descField.onChange(e.target.value)} onBlur={descField.flush} placeholder="Do que se trata, pra quem é relevante, etc." />
        ) : (
          <div className="par-drawer-desc">{descField.draft || <span style={{ color: 'var(--text-7)' }}>Sem descrição.</span>}</div>
        )}
      </div>

      <div className="par-drawer-section">
        <div className="par-drawer-label"><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários ({comments.length})</div>
        {comments.map((c) => (
          <div key={c.id} className="par-comment">
            <div className="par-comment-head">
              <span><strong>{c.userName}</strong> · {fmtTs(c.ts)}</span>
              {canDeleteComment(c) && <button className="par-comment-del" onClick={() => removeComment(c.id)}><X size={12} /></button>}
            </div>
            <div className="par-comment-text">{c.text}</div>
          </div>
        ))}
        <div className="par-comment-input-row">
          <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Escreva um comentário…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitComment(); }} />
          <button className="par-btn par-btn-primary" onClick={submitComment} disabled={sendingComment || !commentDraft.trim()}><Send size={14} /></button>
        </div>
      </div>
    </SidePanel>
  );
}

export default function PareceresScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [pareceres, setPareceres] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    apiGet('/api/pareceres').then((res) => { setPareceres(res.pareceres || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  function handleCreated(created) {
    setPareceres((prev) => [created, ...prev]);
    setShowUpload(false);
  }

  function handleChanged(updated) {
    setPareceres((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  function handleDeleted(id) {
    setPareceres((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
  }

  const filtered = pareceres.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const selected = selectedId ? pareceres.find((p) => p.id === selectedId) : null;

  return (
    <>
      <style>{PARECERES_CSS}</style>
      <div className="par-shell">
        <div className="par-topbar">
          <div className="par-brand"><FileText size={18} color="#F5C400" /> Pareceres PRICETAX</div>
          <div className="par-actions">
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
            {onExit && <button title="Sair dos Pareceres" onClick={onExit}><X size={18} /></button>}
            <button title="Sair" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <div className="par-body">
          <div className="par-toolbar">
            <input type="text" placeholder="Buscar por identificação ou comentário…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="par-btn par-btn-primary" onClick={() => setShowUpload(true)}><Plus size={14} /> Novo Parecer</button>
          </div>

          {!loaded && <div className="par-empty">Carregando…</div>}
          {loaded && filtered.length === 0 && (
            <div className="par-empty">
              {pareceres.length === 0 ? 'Nenhum Parecer enviado ainda. Clique em "Novo Parecer" pra subir o primeiro PDF.' : 'Nenhum Parecer encontrado com esse termo.'}
            </div>
          )}
          {filtered.length > 0 && (
            <div className="par-grid">
              {filtered.map((p) => (
                <div key={p.id} className="par-card" onClick={() => setSelectedId(p.id)}>
                  <div className="par-card-head">
                    <div className="par-card-icon"><FileText size={18} /></div>
                    <div>
                      <div className="par-card-title">{p.title}</div>
                      <div className="par-card-file">{p.file_name} · {fmtFileSize(p.file_size)}</div>
                    </div>
                  </div>
                  {p.description && <div className="par-card-desc">{p.description}</div>}
                  <div className="par-card-foot">
                    <span>{p.created_by_name || 'alguém'} · {fmtTs(p.created_at)}</span>
                    <span className="par-card-comments"><MessageSquare size={12} /> {(p.comments || []).length}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showUpload && <UploadParecerModal onClose={() => setShowUpload(false)} onCreated={handleCreated} />}
      {selected && (
        <ParecerDrawer
          parecer={selected} currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onChanged={handleChanged}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
