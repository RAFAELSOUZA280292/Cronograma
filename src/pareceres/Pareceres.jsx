// Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório
// de PDFs (pareceres técnicos) pra compartilhar com sócios/colaboradores.
// Área PRICETAX-only (master/pricetax — decisão confirmada com o Rafael,
// mesma regra da Central de Conhecimento em server/knowledge.js), montada
// como um novo workspaceMode em src/App.jsx. Mesmo padrão de módulo
// autocontido de src/knowledge/ — CSS próprio, gaveta de detalhe em ModulePanel (acessível:
// foco preso, Esc e Voltar do navegador fecham a gaveta antes de sair do módulo).
//
// Tag de escopo (2026-09-28, pedido do Rafael): todo Parecer é "Geral" (todos os clientes) ou de
// um "Cliente específico" — nesse caso, o nome do cliente sempre fica salvo (denormalizado, sobrevive
// mesmo que o projeto seja excluído depois); quando o nome digitado bate com um projeto existente
// (`/api/projects/lite`, payload leve — nunca o `/api/projects` inteiro), guarda também o vínculo
// forte `company_project_id`, mas isso nunca é obrigatório (cliente pode ainda nem ser projeto aqui).
import React, { useEffect, useRef, useState } from 'react';
import { FileText, Plus, Upload, Trash2, ExternalLink, MessageSquare, Search, Globe, Building2 } from 'lucide-react';
import { useDirtyForm, ConfirmDiscardModal, fmtTs } from '../App.jsx';
import { ConfirmDialog, Button, ErrorState, SaveStatus } from '../ui/index.jsx';
import { ComposeBox, CommentThread, useMentionUsers } from '../ui/ComposeBox.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { ModulePanel } from './ModulePanel.jsx';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { PARECERES_CSS, fmtFileSize, PARECERES_MAX_MB, splitParecerTitle, urlHost, initialsOf, apiErrorText } from './pareceresMeta.js';

export function InlineAlert({ message, onRetry, retryLabel = 'Tentar de novo' }) {
  if (!message) return null;
  return (
    <div className="par-alert" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
    </div>
  );
}

// Autosave com estado visível: acumula os campos que ainda não foram gravados, grava em fila (nunca duas requisições
// em paralelo — o último valor sempre vence), reenvia no "tentar de novo" e deixa o chamador esperar (settle) o que
// está em voo antes de fechar a gaveta. Falha nunca apaga o que foi digitado: o valor fica em `pending` até gravar.
export function useFieldSaver(send) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const pending = useRef({});
  const active = useRef(0);
  const inflight = useRef(new Set());
  const chain = useRef(Promise.resolve());
  const lastError = useRef('');
  const sendRef = useRef(send);
  sendRef.current = send;

  function save(patch) {
    pending.current = { ...pending.current, ...patch };
    if (!Object.keys(pending.current).length) return Promise.resolve();
    active.current += 1;
    setState('saving'); setError('');
    const p = chain.current.then(async () => {
      const body = { ...pending.current };
      if (Object.keys(body).length) {
        try {
          await sendRef.current(body);
          for (const k of Object.keys(body)) if (pending.current[k] === body[k]) delete pending.current[k];
          lastError.current = '';
        } catch (e) { lastError.current = apiErrorText(e, 'Não foi possível salvar.'); }
      }
      active.current -= 1;
      if (active.current === 0) {
        if (!Object.keys(pending.current).length) { setState('saved'); setSavedAt(new Date()); setError(''); }
        else { setState('error'); setError(lastError.current || 'Algumas alterações ainda não foram gravadas.'); }
      }
    });
    chain.current = p;
    inflight.current.add(p);
    p.finally(() => inflight.current.delete(p));
    return p;
  }

  return {
    state, error, savedAt, save,
    retry: () => save({}),
    hasPending: () => Object.keys(pending.current).length > 0,
    settle: () => Promise.all([...inflight.current]),
  };
}

// Campo de texto sempre editável com gravação automática ~`delayMs` depois da última tecla (e na hora, no blur/ao fechar).
// O rascunho é 100% local e NUNCA é sobrescrito pela resposta do servidor (ela devolve o texto aparado e apagaria o espaço
// que a pessoa acabou de digitar). `unsent` = digitado e ainda não entregue ao gravador.
export function useAutosaveField(initial, commit, delayMs = 500) {
  const [draft, setDraft] = useState(initial);
  const [unsent, setUnsent] = useState(false);
  const draftRef = useRef(initial);
  const committedRef = useRef(initial);
  const timerRef = useRef(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const v = draftRef.current;
    if (v !== committedRef.current) { committedRef.current = v; commitRef.current(v); }
    setUnsent(false);
  }
  function onChange(v) {
    draftRef.current = v;
    setDraft(v);
    setUnsent(v !== committedRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delayMs);
  }
  useEffect(() => () => { if (timerRef.current) flush(); }, []);
  return { draft, unsent, onChange, flush };
}

export const fmtHHMM = (d) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

const COMMENT_MAX_FILE_BYTES = 3 * 1024 * 1024;
const COMMENT_MAX_FILES = 3;

function ScopeTag({ scope, companyName }) {
  return scope === 'cliente'
    ? <span className="par-tag par-tag-client"><Building2 size={11} />{companyName || 'Cliente'}</span>
    : <span className="par-tag par-tag-general"><Globe size={11} />Geral</span>;
}

// Toggle Geral/Cliente + campo de nome (com sugestão dos projetos já cadastrados). Reaproveitado no
// upload e na edição do drawer — a mesma regra dos dois lados: "cliente" sem nome não é permitido.
function ScopePicker({ value, onChange, companies, listId }) {
  return (
    <>
      <div className="par-scope-toggle">
        <button type="button" className={value.scope === 'geral' ? 'active' : ''} onClick={() => onChange({ scope: 'geral', companyName: '', companyProjectId: null })}>
          <Globe size={13} /> Geral
        </button>
        <button type="button" className={value.scope === 'cliente' ? 'active' : ''} onClick={() => onChange({ ...value, scope: 'cliente' })}>
          <Building2 size={13} /> Cliente específico
        </button>
      </div>
      {value.scope === 'cliente' && (
        <>
          <input
            type="text" list={listId} value={value.companyName} placeholder="Nome do cliente" aria-label="Nome do cliente"
            onChange={(e) => {
              const companyName = e.target.value;
              const match = companies.find((c) => c.name === companyName);
              onChange({ scope: 'cliente', companyName, companyProjectId: match ? match.id : null });
            }}
          />
          <datalist id={listId}>{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </>
      )}
    </>
  );
}

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

function UploadParecerModal({ onClose, onCreated, companies }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scopeValue, setScopeValue] = useState({ scope: 'geral', companyName: '', companyProjectId: null });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const fileRef = useRef(null);
  const dirty = useDirtyForm({ title, description, scopeValue, file: file ? file.name : null });

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true); else onClose();
  }

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
    if (scopeValue.scope === 'cliente' && !scopeValue.companyName.trim()) { setError('Informe o nome do cliente, ou marque como "Geral".'); return; }
    setSaving(true);
    setError('');
    try {
      const fileDataBase64 = await readFileAsBase64(file);
      const created = await apiPost('/api/pareceres', {
        title: title.trim(), description: description.trim(),
        fileName: file.name, mimeType: 'application/pdf', fileDataBase64,
        scope: scopeValue.scope, companyName: scopeValue.companyName.trim(), companyProjectId: scopeValue.companyProjectId,
      });
      onCreated(created);
    } catch (e) {
      setError(apiErrorText(e, 'Não foi possível enviar o Parecer.'));
      setSaving(false);
    }
  }

  return (
    <>
    <ModulePanel title="Novo Parecer" onClose={requestClose}>
      <div className="par-form">
        <label>Identificação do arquivo *</label>
        <input aria-label="Identificação do arquivo" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Ex.: "Parecer — Reforma Tributária, créditos de IBS/CBS sobre RH"' autoFocus />

        <label>Comentário / contexto (opcional)</label>
        <textarea aria-label="Comentário ou contexto do parecer" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Do que se trata, pra quem é relevante, etc." />

        <label>Este parecer é</label>
        <ScopePicker value={scopeValue} onChange={setScopeValue} companies={companies} listId="par-companies-upload" />

        <label>Arquivo PDF *</label>
        <div className={`par-dropzone ${file ? 'has-file' : ''}`} onClick={() => fileRef.current && fileRef.current.click()}>
          {file ? (
            <span><strong>{file.name}</strong> — {fmtFileSize(file.size)}</span>
          ) : (
            <span><Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Clique pra escolher um PDF (até {PARECERES_MAX_MB}MB)</span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files && e.target.files[0])} />

        {error && <div className="par-error" role="alert">{error}</div>}

        <div className="par-btn-row">
          <Button onClick={requestClose} disabled={saving} disabledReason="Aguarde terminar">Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving} disabledReason="Aguarde terminar">{saving ? 'Enviando…' : 'Criar parecer'}</Button>
        </div>
      </div>
    </ModulePanel>
    {confirmClose && <ConfirmDiscardModal onDiscard={onClose} onCancel={() => setConfirmClose(false)} />}
    </>
  );
}

const scopeValid = (v) => v.scope === 'geral' || !!v.companyName.trim();
const scopeKey = (v) => `${v.scope}|${v.companyName.trim()}|${v.companyProjectId || ''}`;

function ParecerDrawer({ parecer, currentUser, companies, onClose, onChanged, onDeleted }) {
  const [comments, setComments] = useState(parecer.comments || []);
  const [commentDirty, setCommentDirty] = useState(false);
  const [scopeDraft, setScopeDraft] = useState({ scope: parecer.scope || 'geral', companyName: parecer.company_name || '', companyProjectId: parecer.company_project_id || null });
  const [notice, setNotice] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [exiting, setExiting] = useState(false);
  const scopeDraftRef = useRef(scopeDraft);
  const scopeSentRef = useRef(scopeKey(scopeDraft));
  const scopeTimerRef = useRef(null);
  const mentionCandidates = useMentionUsers();

  const saver = useFieldSaver(async (body) => { onChanged(await apiPatch(`/api/pareceres/${parecer.id}`, body)); });
  const titleField = useAutosaveField(parecer.title, (v) => { if (v.trim()) saver.save({ title: v }); });
  const descField = useAutosaveField(parecer.description || '', (v) => saver.save({ description: v }));

  useEffect(() => { setComments(parecer.comments || []); }, [parecer.id, parecer.comments]);

  // Escopo grava sozinho assim que a combinação é válida (Geral, ou Cliente com empresa). Mandar 'cliente' sem nome
  // seria recusado, então fica só no rascunho com uma dica. Troca de Geral/Cliente grava na hora; digitar o nome espera a pausa.
  function flushScope() {
    if (scopeTimerRef.current) { clearTimeout(scopeTimerRef.current); scopeTimerRef.current = null; }
    const v = scopeDraftRef.current;
    if (!scopeValid(v) || scopeKey(v) === scopeSentRef.current) return;
    scopeSentRef.current = scopeKey(v);
    saver.save({ scope: v.scope, companyName: v.companyName.trim(), companyProjectId: v.companyProjectId || null });
  }
  function changeScope(next) {
    scopeDraftRef.current = next;
    setScopeDraft(next);
    if (scopeTimerRef.current) { clearTimeout(scopeTimerRef.current); scopeTimerRef.current = null; }
    if (next.scope === 'geral') flushScope(); else scopeTimerRef.current = setTimeout(flushScope, 700);
  }
  useEffect(() => () => { if (scopeTimerRef.current) flushScope(); }, []);

  const scopeIncomplete = !scopeValid(scopeDraft);
  const scopeUnsent = !scopeIncomplete && scopeKey(scopeDraft) !== scopeSentRef.current;
  const titleEmpty = !titleField.draft.trim();
  const unrecorded = titleField.unsent || descField.unsent || scopeUnsent || scopeIncomplete || titleEmpty;
  const status = saver.state === 'error' ? 'error' : saver.state === 'saving' ? 'saving' : unrecorded ? 'draft' : saver.state;

  async function submitComment({ text, mentions, attachments, links }) {
    setNotice(null);
    try {
      const { comment } = await apiPost(`/api/pareceres/${parecer.id}/comments`, { text, mentions, attachments, links });
      setComments((prev) => [...prev, comment]);
    } catch (e) {
      throw new Error(`Não foi possível enviar o comentário: ${apiErrorText(e, 'erro inesperado.')} O que você escreveu foi mantido.`);
    }
  }

  async function editComment(id, text) {
    try {
      const { comment } = await apiPatch(`/api/pareceres/${parecer.id}/comments/${id}`, { text });
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...comment } : c)));
    } catch (e) {
      throw new Error(apiErrorText(e, 'Não foi possível salvar o comentário.'));
    }
  }

  async function doRemoveComment(id) {
    const index = comments.findIndex((c) => c.id === id);
    const removed = comments[index];
    if (!removed) return;
    setNotice(null);
    setComments((prev) => prev.filter((c) => c.id !== id));
    try { await apiDelete(`/api/pareceres/${parecer.id}/comments/${id}`); } catch (e) {
      setComments((prev) => (prev.some((c) => c.id === id) ? prev : [...prev.slice(0, index), removed, ...prev.slice(index)]));
      setNotice({ message: `Não foi possível excluir o comentário: ${apiErrorText(e, 'erro inesperado.')} Ele foi mantido.`, retry: () => doRemoveComment(id) });
    }
  }

  async function removeComment(id) {
    const ok = await askConfirm({ title: 'Excluir comentário', message: 'Excluir este comentário? Essa ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true });
    if (ok) doRemoveComment(id);
  }

  async function handleDelete() {
    setDeleting(true); setDeleteError('');
    try {
      await apiDelete(`/api/pareceres/${parecer.id}`);
      onDeleted(parecer.id);
    } catch (e) {
      setDeleteError(apiErrorText(e, 'Não foi possível excluir o parecer.'));
      setDeleting(false);
    }
  }

  useDirtyForm(saver.state === 'error' || saver.state === 'saving' || saver.hasPending() || commentDirty || unrecorded);

  async function requestClose() {
    titleField.flush(); descField.flush(); flushScope();
    await saver.settle();
    if (saver.hasPending() || commentDirty || titleEmpty || scopeIncomplete) setConfirmClose(true); else onClose();
  }

  async function saveAndExit() {
    setExiting(true);
    saver.retry();
    await saver.settle();
    setExiting(false);
    if (saver.hasPending()) setConfirmClose(false); else onClose();
  }
  const canSaveAndExit = saver.hasPending() && !commentDirty && !titleEmpty && !scopeIncomplete;

  const threadComments = comments.map((c) => ({ ...c, author: c.userName, authorId: c.userId }));
  const mentionNames = mentionCandidates.map((m) => m.name);

  return (
    <>
    <ModulePanel title="Parecer" onClose={requestClose}>
      <div className="par-drawer-status"><SaveStatus state={status} savedAt={fmtHHMM(saver.savedAt)} onRetry={saver.retry} /></div>
      <div className="par-drawer-title-row">
        <input type="text" aria-label="Título do parecer" style={{ flex: 1, fontSize: 15, fontWeight: 800 }} value={titleField.draft} onChange={(e) => titleField.onChange(e.target.value)} onBlur={titleField.flush} />
      </div>
      {titleEmpty && <div className="par-error" role="alert" style={{ marginTop: 0, marginBottom: 8 }}>O título não pode ficar vazio.</div>}
      <div className="par-drawer-file">{parecer.file_name} · {fmtFileSize(parecer.file_size)} · enviado por {parecer.created_by_name || 'alguém'} em {fmtTs(parecer.created_at)}</div>

      {saver.state === 'error' && <InlineAlert message={`Não foi possível salvar as alterações: ${saver.error} O que você digitou continua aqui.`} />}
      {notice && <InlineAlert message={notice.message} onRetry={notice.retry} />}

      <div className="par-drawer-section par-drawer-scope">
        <div className="par-drawer-label">Este parecer é</div>
        <ScopePicker value={scopeDraft} onChange={changeScope} companies={companies} listId={`par-companies-${parecer.id}`} />
        {scopeIncomplete && <div className="par-hint" style={{ marginTop: 8, marginBottom: 0 }}>Escolha a empresa para salvar o escopo.</div>}
      </div>

      <div className="par-drawer-actions">
        <a className="ui-btn primary" href={`/api/pareceres/${parecer.id}/file`} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" /> Abrir PDF
        </a>
        <Button variant="danger" icon={Trash2} onClick={() => { setDeleteError(''); setConfirmDelete(true); }}>Excluir</Button>
      </div>

      <div className="par-drawer-section">
        <div className="par-drawer-label">Comentário / contexto</div>
        <textarea aria-label="Comentário / contexto" style={{ width: '100%', minHeight: 70 }} value={descField.draft} onChange={(e) => descField.onChange(e.target.value)} onBlur={descField.flush} placeholder="Do que se trata, pra quem é relevante, etc." />
      </div>

      <div className="par-drawer-section">
        <div className="par-drawer-label"><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários ({comments.length})</div>
        <CommentThread
          comments={threadComments} currentUserId={currentUser && currentUser.id} canModerate={!!currentUser && currentUser.role === 'master'}
          onEdit={editComment} onDelete={removeComment} mentionNames={mentionNames}
        />
        <ComposeBox
          onSubmit={submitComment} mentionCandidates={mentionCandidates} maxFileBytes={COMMENT_MAX_FILE_BYTES} maxFiles={COMMENT_MAX_FILES}
          submitLabel="Comentar" draftKey={`parecer:${parecer.id}`} onDirtyChange={setCommentDirty}
        />
      </div>
    </ModulePanel>
    {confirmDelete && (
      <ConfirmDialog
        title="Excluir parecer" danger confirmLabel="Excluir parecer"
        message={`Excluir "${parecer.title}"? Essa ação não pode ser desfeita.`}
        busy={deleting} error={deleteError}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)}
      />
    )}
    {confirmClose && <ConfirmDiscardModal onSaveAndExit={canSaveAndExit ? saveAndExit : undefined} saving={exiting} onDiscard={onClose} onCancel={() => setConfirmClose(false)} />}
    </>
  );
}

// Situação da memória da RENATA: quantos pareceres ela já estudou. O estudo é MANUAL (não roda ao enviar o PDF): parecer novo ou
// alterado fica "aguardando" até alguém pedir — este aviso mostra isso e tem o botão. GET /study é só SQL (sem custo de IA).
function StudyBanner({ refreshKey }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);

  function load() {
    apiGet('/api/pareceres/study').then((r) => { setSt(r); setErr(''); }).catch((e) => setErr(apiErrorText(e, 'Não consegui verificar a memória da RENATA.')));
  }
  useEffect(() => { load(); }, [refreshKey]);
  const running = !!(st && (st.jobRunning || st.running > 0));
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    const n = st ? st.pending : 0;
    if (!(await askConfirm({ title: 'A RENATA estudar os pareceres pendentes?', message: `${n} parecer${n === 1 ? '' : 'es'} ${n === 1 ? 'será lido' : 'serão lidos'} pela IA agora. Pode levar alguns minutos; você pode continuar usando o painel.`, confirmLabel: 'Estudar agora' }))) return;
    setStarting(true);
    try { const r = await apiPost('/api/pareceres/study'); setSt((cur) => ({ ...(cur || {}), ...r, jobRunning: true })); setTimeout(load, 1500); }
    catch (e) { notify(apiErrorText(e, 'Não foi possível iniciar o estudo.'), { tone: 'error' }); }
    finally { setStarting(false); }
  }

  if (err) return <div className="par-study"><InlineAlert message={err} onRetry={load} /></div>;
  if (!st || !st.total) return null;
  const done = st.studied;
  const upToDate = st.pending === 0 && !running;
  return (
    <div className={`par-study${upToDate ? ' ok' : ' warn'}`} role="status">
      <div className="par-study-t">
        {running ? <>A RENATA está estudando os pareceres… <b>{done} de {st.total}</b> prontos.</>
          : upToDate ? <>A memória da RENATA está em dia: ela já estudou <b>{st.total === 1 ? 'o único parecer' : `os ${st.total} pareceres`}</b>.</>
            : <>A RENATA estudou <b>{done} de {st.total}</b> {st.total === 1 ? 'parecer' : 'pareceres'}. <b>{st.pending}</b> {st.pending === 1 ? 'aguarda' : 'aguardam'} estudo e ainda não entram nas respostas dela. Os novos são estudados sozinhos ao enviar; ficam aqui os que falharam ou foram enviados antes disso.</>}
      </div>
      {!running && st.pending > 0 && <Button size="sm" variant="primary" onClick={start} loading={starting}>Estudar os pendentes</Button>}
    </div>
  );
}

export default function PareceresScreen({ currentUser, onExit, onLogout, theme, onToggleTheme, pendingOpenId, onPendingOpenConsumed }) {
  const [pareceres, setPareceres] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState('all'); // 'all' | 'geral' | nome de um cliente
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  function loadPareceres() {
    setLoaded(false); setLoadError('');
    apiGet('/api/pareceres').then((res) => { setPareceres(res.pareceres || []); setLoaded(true); }).catch((e) => { setLoadError(apiErrorText(e, 'Não foi possível carregar os pareceres.')); setLoaded(true); });
  }

  useEffect(() => {
    loadPareceres();
    apiGet('/api/projects/lite').then((res) => setCompanies(res.projects || [])).catch(() => {}); // só sugestão no autocomplete — falha não bloqueia a tela
  }, []);

  // Link de notificação: abre a gaveta quando a lista já carregou; só consome o pedido uma vez (se a carga falhou, espera o "tentar de novo").
  useEffect(() => {
    if (!pendingOpenId || !loaded || loadError) return;
    if (pareceres.some((p) => String(p.id) === String(pendingOpenId))) setSelectedId(pareceres.find((p) => String(p.id) === String(pendingOpenId)).id);
    else notify('Esse parecer não está mais disponível.', { tone: 'error' });
    if (onPendingOpenConsumed) onPendingOpenConsumed();
  }, [pendingOpenId, loaded, loadError, pareceres]);

  const [studyTick, setStudyTick] = useState(0);
  function handleCreated(created) {
    setStudyTick((t) => t + 1);
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

  const distinctClients = [...new Set(pareceres.filter((p) => p.scope === 'cliente' && p.company_name).map((p) => p.company_name))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filtered = pareceres.filter((p) => {
    if (filterScope === 'geral' && p.scope !== 'geral') return false;
    if (filterScope !== 'all' && filterScope !== 'geral' && p.company_name !== filterScope) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const selected = selectedId ? pareceres.find((p) => p.id === selectedId) : null;

  const countGeral = pareceres.filter((p) => p.scope === 'geral').length;
  const countOf = (name) => pareceres.filter((p) => p.scope === 'cliente' && p.company_name === name).length;
  const filterActive = search.trim() || filterScope !== 'all';

  return (
    <div className="par-root">
      <style>{PARECERES_CSS}</style>
      <div className="par-shell">
        <div className="par-body">
          <div className="par-inner">
            <div className="par-hero">
              <div>
                <h1 className="par-title">Pareceres</h1>
                <p className="par-subtitle">Documentos técnicos da PRICETAX para compartilhar com sócios e colaboradores.</p>
              </div>
              <Button variant="primary" icon={Plus} onClick={() => setShowUpload(true)}>Novo Parecer</Button>
            </div>

            <StudyBanner refreshKey={studyTick} />

            <div className="par-toolbar">
              <div className="par-search">
                <Search size={16} />
                <input aria-label="Buscar pareceres" type="text" placeholder="Buscar pareceres" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {pareceres.length > 0 && (
                <div className="par-chips">
                  <button className={`par-chip${filterScope === 'all' ? ' on' : ''}`} onClick={() => setFilterScope('all')}>Todos <span className="par-chip-n">{pareceres.length}</span></button>
                  {countGeral > 0 && <button className={`par-chip${filterScope === 'geral' ? ' on' : ''}`} onClick={() => setFilterScope('geral')}><Globe size={13} /> Geral <span className="par-chip-n">{countGeral}</span></button>}
                  {distinctClients.map((c) => (
                    <button key={c} className={`par-chip${filterScope === c ? ' on' : ''}`} onClick={() => setFilterScope(c)}><Building2 size={13} /> {c} <span className="par-chip-n">{countOf(c)}</span></button>
                  ))}
                </div>
              )}
            </div>

            {!loaded && <div className="par-empty">Carregando…</div>}
            {loaded && loadError && (
              <div className="par-empty">
                <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'left' }}>
                  <ErrorState title="Não foi possível carregar os pareceres" message={loadError} onRetry={loadPareceres} />
                </div>
              </div>
            )}
            {loaded && !loadError && filtered.length === 0 && (
              <div className="par-empty">
                <div className="par-empty-icon"><FileText size={26} /></div>
                <div>{pareceres.length === 0 ? 'Nenhum parecer enviado ainda.' : 'Nenhum parecer encontrado com esse filtro.'}</div>
                {pareceres.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-6)' }}>Clique em "Novo Parecer" para subir o primeiro PDF.</div>}
              </div>
            )}
            {filtered.length > 0 && (
              <>
                {filterActive && <div style={{ fontSize: 13, color: 'var(--text-5)', marginBottom: 14 }}>{filtered.length} {filtered.length === 1 ? 'parecer encontrado' : 'pareceres encontrados'}</div>}
                <div className="par-grid">
                  {filtered.map((p) => {
                    const { number, title } = splitParecerTitle(p.title);
                    const host = urlHost(p.description);
                    const nComments = (p.comments || []).length;
                    return (
                      <div key={p.id} className="par-card" role="button" tabIndex={0} onClick={() => setSelectedId(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(p.id); } }}>
                        <div className="par-card-top">
                          <ScopeTag scope={p.scope} companyName={p.company_name} />
                          <span className="par-card-pdf" title={p.file_name}><FileText size={13} /> PDF · {fmtFileSize(p.file_size)}</span>
                        </div>
                        <div className="par-card-main">
                          {number && <div className="par-card-kicker">Parecer Nº {number}</div>}
                          <div className="par-card-title">{title}</div>
                          {host
                            ? <div className="par-card-link"><ExternalLink size={13} /><span>{host}</span></div>
                            : p.description && <div className="par-card-desc">{p.description}</div>}
                        </div>
                        <div className="par-card-foot">
                          <div className="par-card-author">
                            <span className="par-avatar">{initialsOf(p.created_by_name)}</span>
                            <span className="par-card-who"><b>{p.created_by_name || 'Alguém'}</b><span>{new Date(p.created_at).toLocaleDateString('pt-BR')}</span></span>
                          </div>
                          {nComments > 0 && <span className="par-card-comments" title={`${nComments} comentário${nComments === 1 ? '' : 's'}`}><MessageSquare size={14} /> {nComments}</span>}
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

      {showUpload && <UploadParecerModal onClose={() => setShowUpload(false)} onCreated={handleCreated} companies={companies} />}
      {selected && (
        <ParecerDrawer
          key={selected.id}
          parecer={selected} currentUser={currentUser} companies={companies}
          onClose={() => setSelectedId(null)}
          onChanged={handleChanged}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
