// WhatsApp (2026-11-02, Fase 1): caixa de conversas do número da PRICETAX, compartilhada pela equipe. Duas colunas —
// conversas e conversa aberta —; no celular, uma coluna (lista → conversa → Voltar). Rotas /api/whatsapp (server/whatsapp.js).
// Responder texto ou arquivo só dentro da janela de 24 h da última mensagem do cliente (regra da Meta); fora dela, só
// modelo aprovado (Fase 3). Atualiza sozinha: lista a cada 15 s e conversa aberta a cada 5 s, só com a aba visível.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, ArrowLeft, Archive, Inbox, Paperclip, Send, Check, CheckCheck, AlertTriangle, Clock, Download, FileText, MessageCircle, Smartphone } from 'lucide-react';
import { Callout, BusyBar, Button, IconButton, EmptyState, Segmented, activateRow } from '../ui/index.jsx';
import { notify } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { BrandLogo, useIsMobile } from '../App.jsx';
import { S } from '../styles/S.js';
import './whatsapp.css';

const LIST_MS = 15 * 1000;
const OPEN_MS = 5 * 1000;
const MAX_FILE = 20 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const hashConv = () => {
  const m = /conversa=([A-Za-z0-9-]+)/.exec(window.location.hash || '');
  return m ? m[1] : null;
};

function fmtListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
}
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const label = (c) => c.name || c.phone;
const initials = (c) => (c.name || '').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '#';

function windowText(c) {
  if (!c.windowOpen) return 'Janela de 24 h fechada: só é possível responder quando o cliente escrever de novo (ou com modelo aprovado, na Fase 3).';
  return `Pode responder até ${new Date(c.windowEndsAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

export default function WhatsAppScreen({ currentUser, theme }) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState(null);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [openId, setOpenId] = useState(hashConv);

  useEffect(() => {
    apiGet('/api/whatsapp/status').then(setStatus).catch(() => setStatus({ enabled: false, missing: [] }));
  }, []);

  const loadList = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const qs = new URLSearchParams({ ...(archived ? { archived: '1' } : {}), ...(search ? { q: search } : {}) }).toString();
      const data = await apiGet(`/api/whatsapp/conversations${qs ? `?${qs}` : ''}`);
      setConvs(data.conversations || []);
      setListError('');
    } catch (e) {
      if (!quiet) setListError(e.message || 'Não consegui carregar as conversas.');
    } finally { if (!quiet) setLoading(false); }
  }, [archived, search]);

  useEffect(() => { loadList(false); }, [loadList]);
  useEffect(() => {
    const t = setInterval(() => { if (visible()) loadList(true); }, LIST_MS);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    const onHash = () => { const id = hashConv(); if (id) setOpenId(id); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = (id) => {
    setOpenId(id);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${id ? `#conversa=${id}` : ''}`);
  };

  const submitSearch = (e) => { e.preventDefault(); setSearch(query.trim()); };
  const showList = !isMobile || !openId;
  const showChat = !isMobile || !!openId;

  return (
    <div style={S.page} className="wa-page">
      <div style={S.topbar} className="wa-top">
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>WhatsApp</div>
            <div style={{ fontSize: 12, color: 'var(--text-5)' }}>{(status && status.phone) || 'Número da PRICETAX'}</div>
          </div>
        </div>
        <form className="wa-search" role="search" onSubmit={submitSearch}>
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por nome ou número" aria-label="Pesquisar conversas" />
          {search && <button type="button" className="wa-ic" aria-label="Limpar pesquisa" title="Limpar pesquisa" onClick={() => { setQuery(''); setSearch(''); }}><X size={14} aria-hidden="true" /></button>}
        </form>
      </div>

      {status === null && <div className="wa-pad"><BusyBar active /></div>}
      {status && !status.enabled && <SetupCard status={status} currentUser={currentUser} />}

      <div className={`wa-grid${isMobile ? ' mobile' : ''}`}>
        {showList && (
          <section className="wa-list" aria-label="Conversas">
            <div className="wa-list-head">
              <Segmented
                label="Quais conversas" value={archived ? 'arch' : 'open'} onChange={(v) => { setArchived(v === 'arch'); open(null); }}
                options={[{ value: 'open', label: 'Conversas' }, { value: 'arch', label: 'Arquivadas' }]}
              />
            </div>
            <BusyBar active={loading} />
            {listError && <div className="wa-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar as conversas">{listError}</Callout></div>}
            {!loading && !listError && convs.length === 0 && (
              <EmptyState
                icon={MessageCircle} compact
                title={search ? 'Nada encontrado' : archived ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa ainda'}
                description={search ? 'Tente outro nome ou parte do número.' : archived ? '' : 'Quando um cliente escrever para o WhatsApp da PRICETAX, a conversa aparece aqui.'}
              />
            )}
            <ul className="wa-rows">
              {convs.map((c) => (
                <li key={c.id} className={`wa-row${openId === c.id ? ' open' : ''}${c.unread ? ' unread' : ''}`} {...activateRow(() => open(c.id))} aria-current={openId === c.id ? 'true' : undefined}>
                  <span className="wa-avatar" aria-hidden="true">{initials(c)}</span>
                  <div className="wa-row-main">
                    <div className="wa-row-top">
                      <span className="wa-name">{label(c)}</span>
                      <span className="wa-date">{fmtListDate(c.lastMessageAt)}</span>
                    </div>
                    <div className="wa-row-bottom">
                      <span className="wa-preview">{c.lastDirection === 'out' ? 'Você: ' : ''}{c.lastPreview}</span>
                      {c.unread > 0 && <b className="wa-badge" aria-label={`${c.unread} não lidas`}>{c.unread > 99 ? '99+' : c.unread}</b>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {showChat && (
          <section className="wa-chat" aria-label="Conversa aberta">
            {openId
              ? <Conversation key={openId} id={openId} enabled={!!(status && status.enabled)} isMobile={isMobile} onBack={() => open(null)} onChanged={() => loadList(true)} />
              : <EmptyState icon={MessageCircle} title="Escolha uma conversa" description="As mensagens aparecem aqui. Toda a equipe vê as mesmas conversas e quem respondeu cada uma." />}
          </section>
        )}
      </div>
    </div>
  );
}

function SetupCard({ status, currentUser }) {
  return (
    <div className="wa-pad">
      <Callout tone="info" icon={Smartphone} title="O WhatsApp ainda não foi ligado ao painel">
        A tela já está pronta. Ela começa a receber mensagens quando a conta da PRICETAX na Meta (WhatsApp Business Platform) estiver verificada e as chaves forem cadastradas no servidor.
        {currentUser.role === 'master' && status.missing && status.missing.length > 0 && (
          <> Faltam: {status.missing.join(', ')}.</>
        )}
      </Callout>
    </div>
  );
}

function StatusIcon({ m }) {
  if (m.direction !== 'out') return null;
  if (m.status === 'failed') return <AlertTriangle size={13} className="wa-st failed" aria-label="Não entregue" />;
  if (m.status === 'read') return <CheckCheck size={14} className="wa-st read" aria-label="Lida" />;
  if (m.status === 'delivered') return <CheckCheck size={14} className="wa-st" aria-label="Entregue" />;
  if (m.status === 'sent') return <Check size={14} className="wa-st" aria-label="Enviada" />;
  return <Clock size={13} className="wa-st" aria-label="Enviando" />;
}

function Media({ m }) {
  const md = m.media;
  if (!md) return null;
  const src = `/api/whatsapp/media/${m.id}`;
  if (md.tooBig) return <div className="wa-file muted">Arquivo acima de 25 MB: veja no celular.</div>;
  if (!md.stored) return <div className="wa-file muted">{m.direction === 'in' ? 'Baixando o arquivo…' : 'Arquivo'}</div>;
  if (m.kind === 'image' || m.kind === 'sticker') return <a href={src} target="_blank" rel="noreferrer"><img className="wa-img" src={src} alt={md.filename || 'Imagem recebida'} loading="lazy" /></a>;
  if (m.kind === 'audio') return <audio className="wa-audio" controls preload="none" src={src} />;
  if (m.kind === 'video') return <video className="wa-video" controls preload="none" src={src} />;
  return (
    <a className="wa-file" href={`${src}?download=1`} download={md.filename || true}>
      <FileText size={16} aria-hidden="true" />
      <span className="wa-file-name">{md.filename || 'Documento'}</span>
      {md.size ? <span className="wa-file-size">{fmtSize(md.size)}</span> : null}
      <Download size={14} aria-hidden="true" />
    </a>
  );
}

function Conversation({ id, enabled, isMobile, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const lastCount = useRef(0);

  const load = useCallback(async (quiet) => {
    try {
      const d = await apiGet(`/api/whatsapp/conversations/${id}`);
      setData(d);
      setError('');
      if (d.conversation.unread > 0) apiPost(`/api/whatsapp/conversations/${id}/read`).then(onChanged).catch(() => {});
    } catch (e) {
      if (!quiet) setError(e.message || 'Não consegui abrir a conversa.');
    }
  }, [id, onChanged]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (visible()) load(true); }, OPEN_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const n = data ? data.messages.length : 0;
    if (n !== lastCount.current) { lastCount.current = n; endRef.current && endRef.current.scrollIntoView({ block: 'end' }); }
  }, [data]);

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE) { notify('Arquivo acima de 20 MB. Envie pelo Google Drive.', { tone: 'error' }); return; }
    setFile(f);
  };

  const send = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    try {
      const body = { text };
      if (file) body.attachment = { filename: file.name, data: await readFile(file) };
      await apiPost(`/api/whatsapp/conversations/${id}/messages`, body);
      setText(''); setFile(null);
      await load(true);
      onChanged();
    } catch (e) {
      notify(e.message || 'Não consegui enviar.', { tone: 'error' });
    } finally { setSending(false); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  const toggleArchive = async () => {
    const on = !data.conversation.archived;
    try {
      await apiPost(`/api/whatsapp/conversations/${id}/archive`, { archived: on });
      notify(on ? 'Conversa arquivada. Ela volta sozinha se o cliente escrever.' : 'Conversa de volta à lista.', { tone: 'success' });
      onChanged();
      onBack();
    } catch (e) { notify(e.message, { tone: 'error' }); }
  };

  if (error) return <div className="wa-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui abrir a conversa">{error}</Callout>{isMobile && <Button icon={ArrowLeft} onClick={onBack}>Voltar</Button>}</div>;
  if (!data) return <BusyBar active />;
  const c = data.conversation;
  const canSend = enabled && c.windowOpen;
  let lastDay = '';

  return (
    <div className="wa-conv">
      <header className="wa-conv-head">
        {isMobile && <IconButton label="Voltar" icon={ArrowLeft} size="sm" onClick={onBack} />}
        <span className="wa-avatar" aria-hidden="true">{initials(c)}</span>
        <div className="wa-conv-who">
          <strong>{label(c)}</strong>
          {c.name && <div className="wa-sub">{c.phone}</div>}
        </div>
        <IconButton label={c.archived ? 'Voltar para Conversas' : 'Arquivar conversa'} icon={c.archived ? Inbox : Archive} size="sm" onClick={toggleArchive} />
      </header>
      <div className="wa-msgs" role="log" aria-live="polite">
        {data.messages.map((m) => {
          const day = new Date(m.createdAt).toDateString();
          const sep = day !== lastDay ? fmtDay(m.createdAt) : null;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {sep && <div className="wa-day"><span>{sep}</span></div>}
              <div className={`wa-msg ${m.direction}${m.kind === 'reaction' ? ' reaction' : ''}`}>
                {m.direction === 'out' && (m.sentByName || m.via === 'celular') && <div className="wa-by">{m.via === 'celular' ? 'Pelo celular' : m.sentByName}</div>}
                <Media m={m} />
                {m.body && <div className="wa-text">{m.body}</div>}
                <div className="wa-meta">{fmtTime(m.createdAt)}<StatusIcon m={m} /></div>
                {m.status === 'failed' && m.error && <div className="wa-err">{m.error}</div>}
              </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className={`wa-window${c.windowOpen ? '' : ' closed'}`}><Clock size={13} aria-hidden="true" /> {windowText(c)}</div>
      <div className="wa-compose">
        {file && (
          <div className="wa-chip">
            <Paperclip size={13} aria-hidden="true" /><span>{file.name}</span><span className="wa-file-size">{fmtSize(file.size)}</span>
            <button type="button" className="wa-ic" aria-label="Tirar o arquivo" onClick={() => setFile(null)}><X size={13} aria-hidden="true" /></button>
          </div>
        )}
        <div className="wa-compose-row">
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={pickFile} />
          <IconButton label="Anexar arquivo" icon={Paperclip} size="sm" disabled={!canSend} onClick={() => fileRef.current && fileRef.current.click()} />
          <textarea
            className="wa-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={!canSend}
            placeholder={!enabled ? 'WhatsApp ainda não ligado' : canSend ? (file ? 'Legenda (opcional)' : 'Escreva a mensagem (Enter envia; Shift+Enter quebra a linha)') : 'Janela de 24 h fechada'}
            aria-label="Mensagem" maxLength={4096}
          />
          <Button icon={Send} variant="primary" loading={sending} disabled={!canSend || (!text.trim() && !file)} onClick={send}>Enviar</Button>
        </div>
      </div>
    </div>
  );
}
