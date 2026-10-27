// Aba Biblioteca da Central de Conhecimento (2026-10-27, §116): onde a equipe ENSINA a RENATA com material próprio (PDF, Word, PowerPoint, Excel, texto).
// A RENATA lê, divide em trechos, estuda e passa a usar nas respostas (RENATA do projeto e RENATA geral, só para a equipe PRICETAX).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Download, FileText, Loader2, Plus, RefreshCw, Search, Trash2, Undo2, Upload } from 'lucide-react';
import { Button, Callout, Chip, EmptyState, Segmented, SkeletonCards } from '../ui/index.jsx';
import { Drawer, Modal } from '../ui/dialog.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js';
import { fmtTs } from '../App.jsx';

const CSS = `
.lib-top { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:14px 0; }
.lib-top input[type=text] { flex:1 1 220px; min-width:0; padding:9px 12px; border-radius:10px; font-size:13px; }
.lib-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:13px 15px; margin-bottom:10px; }
.lib-card.archived { opacity:.65; }
.lib-head { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.lib-title { font-size:14px; font-weight:800; color:var(--text-1); flex:1 1 220px; min-width:0; overflow-wrap:anywhere; }
.lib-pill { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; padding:2px 8px; border-radius:999px; background:var(--bg-4); color:var(--text-3); }
.lib-pill.ok { background:rgba(62,207,110,.16); color:#2f9e57; } .lib-pill.bad { background:rgba(226,87,76,.16); color:#e2574c; } .lib-pill.warn { background:rgba(255,159,64,.18); color:#c9741a; }
.lib-meta { font-size:11.5px; color:var(--text-5); margin-top:5px; display:flex; flex-wrap:wrap; gap:4px 12px; }
.lib-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
.lib-tag { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border-2); color:var(--text-3); }
.lib-sum { font-size:12.5px; color:var(--text-3); line-height:1.5; margin-top:7px; }
.lib-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.lib-err { font-size:12.5px; color:#e2574c; margin-top:7px; } .lib-warn { font-size:12.5px; color:#c9741a; margin-top:7px; }
.lib-test { border:1px dashed var(--border-3); border-radius:12px; padding:12px 14px; margin-bottom:16px; }
.lib-test h3 { margin:0 0 4px; font-size:13px; font-weight:800; color:var(--text-1); display:flex; align-items:center; gap:6px; }
.lib-test p { margin:0 0 9px; font-size:12px; color:var(--text-4); line-height:1.5; }
.lib-test .row { display:flex; gap:8px; flex-wrap:wrap; } .lib-test .row input { flex:1 1 240px; min-width:0; padding:9px 12px; border-radius:10px; font-size:13px; }
.lib-pass { border-left:3px solid #F5C400; background:var(--bg-2); border-radius:0 8px 8px 0; padding:8px 11px; margin-top:8px; }
.lib-pass b { font-size:12px; color:var(--text-2); } .lib-pass .src { font-size:11px; color:var(--text-5); margin:2px 0 4px; } .lib-pass .tx { font-size:12.5px; color:var(--text-3); line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
.lib-form { display:flex; flex-direction:column; gap:12px; }
.lib-form label { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:700; color:var(--text-3); }
.lib-form label small { font-weight:500; color:var(--text-5); }
.lib-form input[type=text], .lib-form textarea { padding:9px 12px; border-radius:10px; font-size:13.5px; font-weight:400; }
.lib-form textarea { min-height:90px; resize:vertical; line-height:1.5; }
.lib-drop { border:2px dashed var(--border-3); border-radius:12px; padding:18px 14px; text-align:center; font-size:13px; color:var(--text-4); cursor:pointer; background:var(--bg-2); }
.lib-drop:hover, .lib-drop.over { border-color:#F5C400; background:var(--bg-3); } .lib-drop strong { color:var(--text-1); display:block; margin-bottom:3px; }
.lib-d h4 { margin:18px 0 6px; font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-5); }
.lib-d p, .lib-d li { font-size:13px; color:var(--text-2); line-height:1.55; } .lib-d ul { margin:0; padding-left:18px; } .lib-d li { margin-bottom:4px; }
.lib-cmp { width:100%; border-collapse:collapse; font-size:12.5px; } .lib-cmp th { text-align:left; font-size:11px; color:var(--text-5); padding:5px 8px; border-bottom:1px solid var(--border-2); }
.lib-cmp td { vertical-align:top; padding:7px 8px; border-bottom:1px solid var(--border-1); color:var(--text-2); line-height:1.45; } .lib-cmp td:first-child { font-weight:700; width:24%; }
.lib-cmp-wrap { overflow-x:auto; }
.lib-qa { margin-bottom:10px; } .lib-qa b { display:block; font-size:13px; color:var(--text-1); } .lib-qa span { font-size:12.5px; color:var(--text-3); line-height:1.5; }
.lib-spin { animation:lib-spin 1s linear infinite; } @keyframes lib-spin { to { transform:rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .lib-spin { animation:none; } }
`;

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.markdown,.html,.htm,.json';
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const chars = (n) => (n >= 1000 ? `${Math.round(n / 1000).toLocaleString('pt-BR')} mil caracteres` : `${n} caracteres`);

function statusPill(m) {
  if (m.archived) return <span className="lib-pill">Arquivado</span>;
  if (m.status === 'processing') {
    const p = m.progress || {};
    const label = m.stage === 'estudar' ? 'Estudando' : `Lendo${p.total ? ` ${Math.min(p.done || 0, p.total)}/${p.total}` : ''}`;
    return <span className="lib-pill warn"><Loader2 size={10} className="lib-spin" aria-hidden="true" /> {label}…</span>;
  }
  if (m.status === 'failed') return <span className="lib-pill bad">Falhou</span>;
  return m.studyError ? <span className="lib-pill warn">Pronto · sem resumo</span> : <span className="lib-pill ok">A RENATA já sabe</span>;
}

const readBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
  r.readAsDataURL(file);
});

function AddModal({ info, onClose, onAdded }) {
  const [kind, setKind] = useState('file');
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const dirty = !!(file || title || topic || tags || note || text);
  const maxMb = (info && info.maxFileMb) || 10;

  function pick(f) {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) { setError(`O arquivo tem ${kb(f.size)} e o limite é ${maxMb} MB. Divida em partes menores ou cole o texto.`); return; }
    setError(''); setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
  }
  async function close() {
    if (busy) return;
    if (dirty && !(await askConfirm({ title: 'Descartar o que você preencheu?', message: 'O material ainda não foi enviado. Se fechar agora, o que está na janela se perde.', confirmLabel: 'Descartar', danger: true }))) return;
    onClose();
  }
  async function submit() {
    setError('');
    if (!title.trim()) { setError('Dê um título ao material.'); return; }
    if (kind === 'file' && !file) { setError('Escolha um arquivo.'); return; }
    if (kind === 'text' && text.trim().length < 200) { setError('O texto está curto demais (mínimo de 200 caracteres).'); return; }
    setBusy(true);
    try {
      const body = { kind, title, topic, tags, note };
      if (kind === 'file') Object.assign(body, { fileName: file.name, mimeType: file.type, dataBase64: await readBase64(file) }); else body.text = text;
      const res = await apiPost('/api/knowledge-library', body);
      notify('Material enviado. A RENATA está lendo — leva de alguns segundos a poucos minutos.', { tone: 'success' });
      onAdded(res.material);
    } catch (e) { setError(e.message || 'Não foi possível enviar.'); setBusy(false); }
  }
  return (
    <Modal title="Ensinar a RENATA" subtitle="Envie um material e ela passa a usá-lo nas respostas." onClose={close} busy={busy} error={error} width="min(640px, 96vw)"
      footer={<><Button onClick={close} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button><Button variant="primary" icon={Upload} loading={busy} onClick={submit}>Enviar e estudar</Button></>}>
      <div className="lib-form">
        <Segmented label="Como enviar" value={kind} onChange={(v) => { setKind(v); setError(''); }} options={[{ value: 'file', label: 'Arquivo' }, { value: 'text', label: 'Colar texto' }]} />
        {kind === 'file' ? (
          <div>
            <div className={`lib-drop${over ? ' over' : ''}`} role="button" tabIndex={0} onClick={() => input.current && input.current.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
              <strong>{file ? `${file.name} · ${kb(file.size)}` : 'Clique ou arraste o arquivo até aqui'}</strong>
              PDF (com texto), Word, PowerPoint, Excel, CSV, texto, Markdown ou HTML · até {maxMb} MB
            </div>
            <input ref={input} type="file" accept={ACCEPT} style={{ display: 'none' }} aria-label="Escolher arquivo" onChange={(e) => pick(e.target.files && e.target.files[0])} />
          </div>
        ) : (
          <label>Texto do material <small>Cole o conteúdo completo (artigo, nota técnica, roteiro…).</small>
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} aria-label="Texto do material" />
          </label>
        )}
        <label>Título
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Produtor Rural — antes e depois da reforma" maxLength={200} />
        </label>
        <label>Tema <small>Opcional. Ajuda a RENATA a achar o material (ex.: Produtor Rural, Split Payment).</small>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} />
        </label>
        <label>Etiquetas <small>Opcional, separadas por vírgula.</small>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="agro, LC 214, regime regular" />
        </label>
        <label>Como a RENATA deve usar este material <small>Opcional. Ex.: “Material de 2026; vale mais que o parecer antigo.”</small>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} style={{ minHeight: 64 }} />
        </label>
        <Callout tone="warn" icon={AlertTriangle} title="Só conhecimento geral">
          Todo material vale para a PRICETAX inteira: a RENATA pode usá-lo ao conversar sobre qualquer empresa. Não envie documento confidencial de um cliente.
        </Callout>
      </div>
    </Modal>
  );
}

function Study({ s }) {
  const list = (a) => (a && a.length ? <ul>{a.map((x, i) => <li key={i}>{x}</li>)}</ul> : null);
  return (
    <>
      <h4>Resumo</h4><p>{s.executiveSummary}</p>
      {s.keyPoints && s.keyPoints.length > 0 && <><h4>Pontos-chave</h4>{list(s.keyPoints)}</>}
      {s.comparisons && s.comparisons.length > 0 && (
        <><h4>Antes × depois da reforma</h4>
          <div className="lib-cmp-wrap"><table className="lib-cmp"><thead><tr><th>Ponto</th><th>Antes</th><th>Depois</th><th>Base</th></tr></thead>
            <tbody>{s.comparisons.map((c, i) => <tr key={i}><td>{c.topic}</td><td>{c.before || '—'}</td><td>{c.after || '—'}</td><td>{c.basis || '—'}</td></tr>)}</tbody></table></div></>
      )}
      {s.faq && s.faq.length > 0 && <><h4>Perguntas e respostas</h4>{s.faq.map((q, i) => <div className="lib-qa" key={i}><b>{q.question}</b><span>{q.answer}</span></div>)}</>}
      {s.appliesTo && <><h4>Quando usar</h4><p>{s.appliesTo}</p></>}
      {s.legalBasis && s.legalBasis.length > 0 && <><h4>Base legal citada</h4>{list(s.legalBasis)}</>}
      {s.limits && <><h4>Limites e cuidados</h4><p>{s.limits}</p></>}
      {s.themes && s.themes.length > 0 && <><h4>Temas</h4><div className="lib-tags">{s.themes.map((t, i) => <span className="lib-tag" key={i}>{t}</span>)}</div></>}
    </>
  );
}

function DetailDrawer({ id, onClose, onChanged }) {
  const [m, setM] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => apiGet(`/api/knowledge-library/${id}`).then((r) => setM(r.material)).catch(() => setM(false)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!m || m.status !== 'processing') return undefined; const t = setInterval(load, 3000); return () => clearInterval(t); }, [m, load]);
  async function act(fn, ok) { try { await fn(); if (ok) notify(ok, { tone: 'success' }); await load(); onChanged(); } catch (e) { notify(e.message || 'Não foi possível concluir.', { tone: 'error' }); } }
  async function save() {
    await act(() => apiPatch(`/api/knowledge-library/${id}`, { title: edit.title, topic: edit.topic, tags: edit.tags, note: edit.note }), 'Material atualizado.');
    setEdit(null);
  }
  async function archive() {
    if (!(await askConfirm({ title: 'Arquivar este material?', message: 'A RENATA deixa de usá-lo nas respostas. Dá para restaurar depois.', confirmLabel: 'Arquivar', danger: true }))) return;
    await act(() => apiDelete(`/api/knowledge-library/${id}`), 'Material arquivado.');
  }
  return (
    <Drawer title={m ? m.title : 'Material'} subtitle={m && m.topic ? `Tema: ${m.topic}` : undefined} onClose={onClose} width="min(760px, 100vw)">
      <div className="lib-d">
        {m === null && <SkeletonCards count={3} />}
        {m === false && <EmptyState icon={AlertTriangle} title="Não foi possível abrir o material" description="Feche e tente de novo." />}
        {m && (
          <>
            <div className="lib-head">{statusPill(m)}<span className="lib-meta" style={{ margin: 0 }}>{m.chunkCount} trechos · {chars(m.charCount)}{m.fileName ? ` · ${m.fileName} (${kb(m.fileSize)})` : ' · texto colado'}</span></div>
            <div className="lib-meta">Enviado por {m.createdByName || '—'} em {fmtTs(m.createdAt)}</div>
            {m.error && <div className="lib-err" role="alert">{m.error}</div>}
            {m.studyError && !m.error && <div className="lib-warn" role="alert">A RENATA já encontra os trechos deste material, mas o resumo não foi gerado: {m.studyError}</div>}
            <div className="lib-actions">
              {m.sourceKind && <a className="ui-btn" href={`/api/knowledge-library/${id}/file`}><Download size={13} aria-hidden="true" /> Baixar original</a>}
              <Button icon={RefreshCw} disabled={m.status === 'processing'} disabledReason="Aguarde a leitura terminar" onClick={() => act(() => apiPost(`/api/knowledge-library/${id}/reprocess?only=study`), 'A RENATA vai estudar de novo.')}>Estudar de novo</Button>
              <Button icon={RefreshCw} disabled={m.status === 'processing'} disabledReason="Aguarde a leitura terminar" onClick={() => act(() => apiPost(`/api/knowledge-library/${id}/reprocess`), 'A RENATA vai ler o material de novo.')}>Ler de novo</Button>
              <Button onClick={() => setEdit({ title: m.title, topic: m.topic, tags: (m.tags || []).join(', '), note: m.note })}>Editar dados</Button>
              {m.archived ? <Button icon={Undo2} onClick={() => act(() => apiPost(`/api/knowledge-library/${id}/restore`), 'Material restaurado.')}>Restaurar</Button> : <Button icon={Trash2} onClick={archive}>Arquivar</Button>}
            </div>
            {edit && (
              <div className="lib-form" style={{ marginTop: 14, padding: 12, border: '1px solid var(--border-2)', borderRadius: 12 }}>
                <label>Título<input type="text" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
                <label>Tema<input type="text" value={edit.topic} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} /></label>
                <label>Etiquetas <small>separadas por vírgula</small><input type="text" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></label>
                <label>Como a RENATA deve usar<textarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
                <div className="lib-actions"><Button variant="primary" onClick={save} disabled={!edit.title.trim()} disabledReason="O título não pode ficar vazio">Salvar</Button><Button onClick={() => setEdit(null)}>Cancelar</Button></div>
              </div>
            )}
            {m.note && !edit && <><h4>Orientação de uso</h4><p>{m.note}</p></>}
            {m.tags && m.tags.length > 0 && <div className="lib-tags">{m.tags.map((t) => <span className="lib-tag" key={t}>{t}</span>)}</div>}
            {m.study ? <Study s={m.study} /> : m.status === 'ready' && <p className="lib-sum">Sem resumo ainda. Use “Estudar de novo” quando a IA estiver disponível.</p>}
          </>
        )}
      </div>
    </Drawer>
  );
}

function TestBox() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!q.trim() || busy) return;
    setBusy(true);
    try { setRes(await apiPost('/api/knowledge-library/search', { query: q })); } catch (e) { notify(e.message || 'Não foi possível buscar.', { tone: 'error' }); } finally { setBusy(false); }
  }
  return (
    <div className="lib-test">
      <h3><Search size={14} aria-hidden="true" /> Testar o que a RENATA acha</h3>
      <p>Escreva uma pergunta como um consultor faria. Mostra os trechos que ela receberia para responder — se nada aparece, ela não usaria nenhum material.</p>
      <div className="row">
        <input type="text" aria-label="Pergunta de teste" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="Ex.: o produtor rural é obrigado a recolher IBS e CBS?" />
        <Button icon={Search} loading={busy} onClick={run} disabled={!q.trim()} disabledReason="Escreva a pergunta">Ver trechos</Button>
      </div>
      {res && (res.passages.length === 0
        ? <p style={{ marginTop: 10 }}>Nenhum trecho dos materiais toca essa pergunta{res.embeddings ? '' : ' (busca só por palavra: a busca por significado não está ativa neste ambiente)'}.</p>
        : res.passages.map((p) => (
          <div className="lib-pass" key={p.chunkId}><b>{p.title}</b><div className="src">{[p.ref, p.heading].filter(Boolean).join(' · ') || `Trecho ${p.idx + 1}`}</div><div className="tx">{p.content.length > 700 ? `${p.content.slice(0, 700)}…` : p.content}</div></div>
        )))}
    </div>
  );
}

export function LibraryTab({ refreshKey, onChanged }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(() => apiGet('/api/knowledge-library').then((r) => { setData(r); setFailed(false); }).catch(() => setFailed(true)), []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const anyProcessing = !!(data && data.materials.some((m) => m.status === 'processing'));
  useEffect(() => { if (!anyProcessing) return undefined; const t = setInterval(load, 3000); return () => clearInterval(t); }, [anyProcessing, load]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return ((data && data.materials) || []).filter((m) => (showArchived || !m.archived) && (!n || `${m.title} ${m.topic} ${(m.tags || []).join(' ')}`.toLowerCase().includes(n)));
  }, [data, q, showArchived]);
  const archivedCount = data ? data.materials.filter((m) => m.archived).length : 0;

  return (
    <div>
      <style>{CSS}</style>
      <Callout tone="info" icon={BookOpen} title="Ensine a RENATA com o seu material">
        Envie um PDF, Word, PowerPoint, Excel ou cole um texto. A RENATA lê tudo, divide em trechos, estuda e passa a usar nas respostas da RENATA do projeto e da RENATA geral — com o título do material como fonte. Fica disponível para a equipe PRICETAX.
      </Callout>
      <div className="lib-top">
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Ensinar a RENATA</Button>
        <input type="text" aria-label="Pesquisar nos materiais" placeholder="Pesquisar por título, tema ou etiqueta" value={q} onChange={(e) => setQ(e.target.value)} />
        {archivedCount > 0 && <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)}>Arquivados ({archivedCount})</Chip>}
      </div>
      {data && data.materials.some((m) => !m.archived && m.status === 'ready') && <TestBox />}
      {failed && !data ? (
        <EmptyState icon={AlertTriangle} title="Não foi possível carregar a biblioteca" description="Atualize a página em alguns segundos."><Button onClick={load}>Tentar de novo</Button></EmptyState>
      ) : !data ? <SkeletonCards count={3} height={110} /> : list.length === 0 ? (
        <EmptyState icon={FileText} title={data.materials.length ? 'Nenhum material encontrado' : 'A biblioteca ainda está vazia'}
          description={data.materials.length ? 'Tente outros termos.' : 'Comece com o material que a RENATA deve dominar — por exemplo, um estudo sobre o Produtor Rural antes e depois da reforma.'}>
          {!data.materials.length && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Ensinar a RENATA</Button>}
        </EmptyState>
      ) : list.map((m) => (
        <div key={m.id} className={`lib-card${m.archived ? ' archived' : ''}`}>
          <div className="lib-head">
            <div className="lib-title">{m.title}</div>
            {statusPill(m)}
          </div>
          <div className="lib-meta">
            {m.topic && <span>Tema: {m.topic}</span>}
            <span>{m.chunkCount ? `${m.chunkCount} trechos · ` : ''}{chars(m.charCount)}</span>
            <span>{m.fileName || 'texto colado'}</span>
            <span>{m.createdByName ? `${m.createdByName} · ` : ''}{fmtTs(m.createdAt)}</span>
          </div>
          {m.tags && m.tags.length > 0 && <div className="lib-tags">{m.tags.map((t) => <span className="lib-tag" key={t}>{t}</span>)}</div>}
          {m.error && <div className="lib-err" role="alert">{m.error}</div>}
          {m.studyError && !m.error && <div className="lib-warn">Resumo não gerado: {m.studyError}</div>}
          <div className="lib-actions"><Button size="sm" onClick={() => setOpenId(m.id)}>Abrir estudo</Button></div>
        </div>
      ))}
      {adding && <AddModal info={data} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); onChanged && onChanged(); }} />}
      {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => { load(); onChanged && onChanged(); }} />}
    </div>
  );
}
