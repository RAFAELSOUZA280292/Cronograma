// Caixa de e-mail (2026-11-02, Fase 1: ler e organizar). Três colunas como no Outlook — pastas, lista, leitura — sobre o
// Gmail da própria pessoa (rotas /api/mail, server/mail.js). No celular vira uma coluna: lista → leitura → Voltar.
// O corpo do e-mail é desenhado num iframe sem script (sandbox) com o HTML já higienizado no servidor; imagens externas
// só carregam com "Mostrar imagens".
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, Star, Send, FileText, Archive, AlertOctagon, Trash2, Tag, RefreshCw, Search, Paperclip, ArrowLeft, MailOpen, Mail, Undo2, Image as ImageIcon, Download, Link2, AlertTriangle, X, PenSquare, Reply, ReplyAll, Forward, Signature } from 'lucide-react';
import { Callout, BusyBar, Button, IconButton, EmptyState, activateRow } from '../ui/index.jsx';
import { notify, askConfirm } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { BrandLogo, useIsMobile } from '../App.jsx';
import { S } from '../styles/S.js';
import MailFrame from './MailFrame.jsx';
import Compose, { fmtSize } from './Compose.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import './mail.css';

const FOLDER_ICON = { INBOX: Inbox, STARRED: Star, SENT: Send, DRAFT: FileText, ARCHIVE: Archive, SPAM: AlertOctagon, TRASH: Trash2 };
const REFRESH_MS = 60 * 1000;

function fmtListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtFullDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const who = (p) => (p ? p.name || p.email : '');
const initials = (p) => (who(p) || '?').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function MailScreen({ currentUser, theme }) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState(null);
  const [nav, setNav] = useState({ folders: [], labels: [] });
  const [folder, setFolder] = useState('INBOX');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [threads, setThreads] = useState([]);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [compose, setCompose] = useState(null);
  const [signature, setSignature] = useState(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [threadRev, setThreadRev] = useState(0);
  const reqRef = useRef(0);

  const loadStatus = useCallback(async (fresh) => {
    try { setStatus(await apiGet(`/api/mail/status${fresh ? '?fresh=1' : ''}`)); } catch (e) { setStatus({ configured: true, connected: false, mail: false, error: e.message }); }
  }, []);

  useEffect(() => {
    const h = window.location.hash;
    if (h === '#google-mail-connected' || h === '#google-mail-error') {
      if (h === '#google-mail-connected') notify('Gmail conectado.', { tone: 'success' });
      else notify('O Google não concluiu a conexão. Tente de novo e marque a permissão do Gmail.', { tone: 'error' });
      window.history.replaceState(window.history.state, '', window.location.pathname);
      loadStatus(true);
    } else loadStatus(false);
  }, [loadStatus]);

  const ready = !!(status && status.mail);

  const loadNav = useCallback(async () => {
    try { setNav(await apiGet('/api/mail/labels')); } catch { /* a lista mostra o erro; as pastas ficam como estavam */ }
  }, []);

  const loadThreads = useCallback(async ({ append = false, quiet = false } = {}) => {
    const id = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ folder: search ? '' : folder });
      if (search) params.set('q', search);
      if (append && nextPage) params.set('pageToken', nextPage);
      const data = await apiGet(`/api/mail/threads?${params}`);
      if (id !== reqRef.current) return;
      setThreads((prev) => (append ? [...prev, ...data.threads.filter((t) => !prev.some((p) => p.id === t.id))] : data.threads));
      setNextPage(data.nextPageToken);
      setListError('');
    } catch (e) {
      if (id !== reqRef.current) return;
      if (e.data && e.data.code === 'mail_not_connected') loadStatus(true);
      if (!quiet) setListError(e.message);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [folder, search, nextPage, loadStatus]);

  useEffect(() => { if (ready) loadNav(); }, [ready, loadNav]);
  useEffect(() => { if (ready) apiGet('/api/mail/signature').then(setSignature).catch(() => {}); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    setSelected(new Set());
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, folder, search]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadNav();
      loadThreads({ quiet: true });
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [ready, loadNav, loadThreads]);

  function pickFolder(id) {
    setSearch(''); setQuery(''); setFolder(id); setOpenId(null);
  }

  function submitSearch(e) {
    e.preventDefault();
    setSearch(query.trim()); setOpenId(null);
  }

  const patchThreads = (ids, fn) => setThreads((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, ...fn(t) } : t)));
  const dropThreads = (ids) => {
    setThreads((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelected(new Set());
    if (ids.includes(openId)) setOpenId(null);
  };

  async function act(ids, action, { silent } = {}) {
    if (!ids.length) return;
    const removes = (action === 'archive' && folder === 'INBOX') || action === 'trash' || action === 'spam'
      || (action === 'untrash' && folder === 'TRASH') || (action === 'inbox' && (folder === 'ARCHIVE' || folder === 'SPAM'))
      || (action === 'unstar' && folder === 'STARRED');
    const before = threads;
    if (removes && !search) dropThreads(ids);
    else patchThreads(ids, () => ({
      ...(action === 'read' ? { unread: false } : {}), ...(action === 'unread' ? { unread: true } : {}),
      ...(action === 'star' ? { starred: true } : {}), ...(action === 'unstar' ? { starred: false } : {}),
    }));
    try {
      await apiPost('/api/mail/threads/modify', { ids, action });
      const undoOf = { archive: 'inbox', trash: 'untrash', spam: 'inbox', inbox: folder === 'SPAM' ? 'spam' : 'archive', untrash: 'trash' }[action];
      const label = { archive: 'Arquivado', trash: 'Movido para a Lixeira', spam: 'Marcado como spam', inbox: 'Movido para a Caixa de entrada', untrash: 'Restaurado da Lixeira' }[action];
      if (label && !silent) {
        const n = ids.length > 1 ? ` (${ids.length})` : '';
        notify(`${label}${n}.`, { undo: undoOf ? async () => { await apiPost('/api/mail/threads/modify', { ids, action: undoOf }); loadThreads({ quiet: true }); loadNav(); } : undefined });
      }
      if (action === 'read' || action === 'unread' || removes) loadNav();
    } catch (e) {
      setThreads(before);
      notify(e.message, { tone: 'error' });
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const onOpened = useCallback((id, hadUnread) => {
    if (!hadUnread) return;
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    apiPost('/api/mail/threads/modify', { ids: [id], action: 'read' }).then(loadNav).catch(() => {});
  }, [loadNav]);

  async function openCompose(next) {
    if (compose && !(await askConfirm({ title: 'Trocar de mensagem?', message: 'Já existe uma mensagem sendo escrita. Ela será descartada.', confirmLabel: 'Descartar e abrir', danger: true }))) return;
    setCompose({ ...next, key: Date.now() });
  }

  function onSent(r) {
    setCompose(null);
    if (r && r.threadId && r.threadId === openId) setThreadRev((n) => n + 1);
    loadThreads({ quiet: true });
    loadNav();
  }

  const folderName = search ? `Resultados para “${search}”` : (nav.folders.find((f) => f.id === folder) || nav.labels.find((l) => l.id === folder) || { name: 'Caixa de entrada' }).name;
  const selIds = [...selected];
  const showList = !isMobile || !openId;
  const showReader = !isMobile || !!openId;

  return (
    <div style={S.page} className="mail-page">
      <div style={S.topbar} className="mail-top">
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>E-mail</div>
            <div style={{ fontSize: 12, color: 'var(--text-5)' }}>{(status && status.email) || currentUser.name}</div>
          </div>
        </div>
        {ready && (
          <form className="mail-search" role="search" onSubmit={submitSearch}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={isMobile ? 'Pesquisar e-mails' : 'Pesquisar e-mails (ex.: from:cliente@x.com has:attachment)'} aria-label="Pesquisar e-mails"
            />
            {search && <button type="button" className="mail-ic" aria-label="Limpar pesquisa" title="Limpar pesquisa" onClick={() => { setQuery(''); setSearch(''); }}><X size={14} aria-hidden="true" /></button>}
          </form>
        )}
      </div>

      {status === null && <div className="mail-pad"><BusyBar active /></div>}
      {status && !ready && <ConnectCard status={status} />}

      {ready && (
        <div className={`mail-grid${isMobile ? ' mobile' : ''}`}>
          {!isMobile && (
            <nav className="mail-nav" aria-label="Pastas do e-mail">
              <Button variant="primary" icon={PenSquare} className="mail-write" onClick={() => openCompose({ mode: 'new' })}>Escrever</Button>
              {(nav.folders.length ? nav.folders : [{ id: 'INBOX', name: 'Caixa de entrada' }]).map((f) => {
                const Icon = FOLDER_ICON[f.id] || Tag;
                const count = f.id === 'DRAFT' ? f.total : f.unread;
                return (
                  <button key={f.id} type="button" className={`mail-folder${!search && folder === f.id ? ' on' : ''}`} onClick={() => pickFolder(f.id)} aria-current={!search && folder === f.id ? 'page' : undefined}>
                    <Icon size={15} aria-hidden="true" /><span>{f.name}</span>{count ? <b className="mail-count">{count}</b> : null}
                  </button>
                );
              })}
              {nav.labels.length > 0 && <div className="mail-nav-title">Marcadores</div>}
              {nav.labels.map((l) => (
                <button key={l.id} type="button" className={`mail-folder${!search && folder === l.id ? ' on' : ''}`} onClick={() => pickFolder(l.id)} title={l.name}>
                  <Tag size={14} aria-hidden="true" style={l.color ? { color: l.color } : undefined} /><span>{l.name}</span>{l.unread ? <b className="mail-count">{l.unread}</b> : null}
                </button>
              ))}
              <div className="mail-nav-title">Configurar</div>
              <button type="button" className="mail-folder" onClick={() => setSigOpen(true)} disabled={!signature}>
                <Signature size={14} aria-hidden="true" /><span>Assinatura</span>
              </button>
            </nav>
          )}

          {showList && (
            <section className="mail-list" aria-label="Lista de e-mails">
              {isMobile && (
                <div className="mail-mfolders">
                  <select value={search ? '' : folder} onChange={(e) => pickFolder(e.target.value)} aria-label="Pasta">
                    {search && <option value="">Resultados da pesquisa</option>}
                    {nav.folders.map((f) => <option key={f.id} value={f.id}>{f.name}{f.unread ? ` (${f.unread})` : ''}</option>)}
                    {nav.labels.map((l) => <option key={l.id} value={l.id}>{l.name}{l.unread ? ` (${l.unread})` : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="mail-list-head">
                {selIds.length ? (
                  <>
                    <span className="mail-list-title">{selIds.length} selecionada{selIds.length > 1 ? 's' : ''}</span>
                    <BulkActions folder={folder} onAct={(a) => act(selIds, a)} onClear={() => setSelected(new Set())} />
                  </>
                ) : (
                  <>
                    <span className="mail-list-title">{folderName}</span>
                    <div className="mail-actions">
                      {isMobile && <IconButton label="Assinatura do e-mail" icon={Signature} size="sm" onClick={() => setSigOpen(true)} disabled={!signature} />}
                      <IconButton label="Atualizar" icon={RefreshCw} size="sm" onClick={() => { loadThreads(); loadNav(); }} />
                    </div>
                  </>
                )}
              </div>
              <BusyBar active={loading} />
              {listError && <div className="mail-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar os e-mails">{listError}</Callout></div>}
              {!loading && !listError && threads.length === 0 && (
                <EmptyState icon={Inbox} title={search ? 'Nada encontrado' : 'Nenhum e-mail aqui'} description={search ? 'Tente outras palavras ou procure por remetente (from:).' : 'Quando chegar algo nesta pasta, aparece aqui.'} compact />
              )}
              <ul className="mail-rows">
                {threads.map((t) => (
                  <li
                    key={t.id}
                    className={`mail-row${t.unread ? ' unread' : ''}${openId === t.id ? ' open' : ''}${selected.has(t.id) ? ' sel' : ''}`}
                    {...activateRow(() => setOpenId(t.id))}
                    aria-label={`${t.unread ? 'Não lido. ' : ''}${t.from.map(who).join(', ')}: ${t.subject}`}
                  >
                    <input
                      type="checkbox" className="mail-check" checked={selected.has(t.id)} aria-label="Selecionar conversa"
                      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={() => toggleSelect(t.id)}
                    />
                    <div className="mail-row-main">
                      <div className="mail-row-top">
                        <span className="mail-from">{folder === 'SENT' && !search ? `Para: ${t.to.map(who).join(', ')}` : t.from.map(who).join(', ')}{t.count > 1 && <span className="mail-n">{t.count}</span>}</span>
                        {t.hasAttachment && <Paperclip size={13} aria-label="Tem anexo" className="mail-clip" />}
                        <span className="mail-date">{fmtListDate(t.date)}</span>
                      </div>
                      <div className="mail-subject">{t.subject}</div>
                      <div className="mail-snippet">{t.snippet}</div>
                    </div>
                    <button
                      type="button" className={`mail-star${t.starred ? ' on' : ''}`} aria-label={t.starred ? 'Tirar estrela' : 'Marcar com estrela'} title={t.starred ? 'Tirar estrela' : 'Marcar com estrela'}
                      onClick={(e) => { e.stopPropagation(); act([t.id], t.starred ? 'unstar' : 'star'); }} onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Star size={15} aria-hidden="true" fill={t.starred ? 'currentColor' : 'none'} />
                    </button>
                  </li>
                ))}
              </ul>
              {nextPage && !loading && <div className="mail-pad"><Button size="sm" onClick={() => loadThreads({ append: true })}>Carregar mais</Button></div>}
            </section>
          )}

          {showReader && (
            <section className="mail-reader" aria-label="Leitura do e-mail">
              {openId ? (
                <ThreadView
                  key={`${openId}-${threadRev}`} id={openId} isMobile={isMobile} folder={folder} myEmail={status && status.email}
                  onBack={() => setOpenId(null)} onOpened={onOpened} onAct={(a) => act([openId], a)}
                  onCompose={(mode, messageId) => openCompose({ mode, messageId })}
                />
              ) : (
                <EmptyState icon={MailOpen} title="Escolha um e-mail para ler" description="Clique numa conversa da lista. Ela é marcada como lida ao abrir, como no Outlook." />
              )}
            </section>
          )}
        </div>
      )}
      {ready && isMobile && !compose && (
        <button type="button" className="mail-fab" aria-label="Escrever e-mail" title="Escrever e-mail" onClick={() => openCompose({ mode: 'new' })}><PenSquare size={22} aria-hidden="true" /></button>
      )}
      {compose && (
        <Compose
          key={compose.key} init={compose} signature={signature} isMobile={isMobile}
          onClose={() => setCompose(null)} onSent={onSent} onEditSignature={() => setSigOpen(true)}
        />
      )}
      {sigOpen && signature && <SignatureDialog value={signature} onClose={() => setSigOpen(false)} onSaved={(r) => { setSignature(r); setSigOpen(false); }} />}
    </div>
  );
}

function ConnectCard({ status }) {
  if (!status.configured) {
    return <div className="mail-pad"><Callout tone="warn" icon={AlertTriangle} title="Integração com o Google não configurada no servidor">Avise o Rafael: faltam as chaves do Google na Railway.</Callout></div>;
  }
  return (
    <div className="mail-pad" style={{ maxWidth: 720 }}>
      <Callout
        tone="info" icon={Link2} title={status.connected ? 'Falta autorizar o Gmail' : 'Conecte o seu Gmail'}
        action={<a className="ui-btn primary sm" href="/api/google/oauth/start?mail=1">Conectar o Gmail</a>}
      >
        {status.connected
          ? 'Sua agenda do Google já está ligada ao painel; agora é só autorizar também o e-mail. Na tela do Google, deixe marcada a permissão do Gmail.'
          : 'O painel lê e organiza o e-mail direto na sua conta Google da PRICETAX. Nada é copiado para cá: o que você arquivar ou ler aqui aparece igual no Gmail e no celular.'}
        {status.error ? <div style={{ marginTop: 6 }}>{status.error}</div> : null}
      </Callout>
    </div>
  );
}

function BulkActions({ folder, onAct, onClear }) {
  return (
    <div className="mail-actions">
      {folder === 'TRASH' ? <IconButton label="Restaurar" icon={Undo2} size="sm" onClick={() => onAct('untrash')} />
        : folder === 'INBOX' ? <IconButton label="Arquivar" icon={Archive} size="sm" onClick={() => onAct('archive')} />
          : <IconButton label="Mover para a Caixa de entrada" icon={Inbox} size="sm" onClick={() => onAct('inbox')} />}
      <IconButton label="Marcar como lido" icon={MailOpen} size="sm" onClick={() => onAct('read')} />
      <IconButton label="Marcar como não lido" icon={Mail} size="sm" onClick={() => onAct('unread')} />
      {folder !== 'TRASH' && <IconButton label="Mover para a Lixeira" icon={Trash2} size="sm" onClick={() => onAct('trash')} />}
      <IconButton label="Cancelar seleção" icon={X} size="sm" onClick={onClear} />
    </div>
  );
}

function ThreadView({ id, isMobile, folder, myEmail, onBack, onOpened, onAct, onCompose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    apiGet(`/api/mail/threads/${id}`).then((d) => {
      if (!alive) return;
      if (!d || !Array.isArray(d.messages)) throw new Error('Resposta inesperada do servidor. Atualize a lista e tente de novo.');
      setData(d);
      const last = d.messages[d.messages.length - 1];
      setExpanded(new Set(d.messages.filter((m) => m.unread).map((m) => m.id).concat(last ? [last.id] : [])));
      onOpened(id, d.messages.some((m) => m.unread));
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, onOpened]);

  const back = isMobile ? <IconButton label="Voltar para a lista" icon={ArrowLeft} size="sm" onClick={onBack} /> : null;
  if (error) return <div className="mail-thread"><div className="mail-thread-bar">{back}</div><div style={{ marginTop: 14 }}><Callout tone="danger" icon={AlertTriangle} title="Não consegui abrir o e-mail">{error}</Callout></div></div>;
  if (!data) return <div className="mail-thread"><div className="mail-thread-bar">{back}</div><BusyBar active /></div>;

  const toggle = (mid) => setExpanded((prev) => { const n = new Set(prev); if (n.has(mid)) n.delete(mid); else n.add(mid); return n; });

  return (
    <div className="mail-thread">
      <div className="mail-thread-bar">
        {back}
        <div className="mail-actions">
          {data.messages.length > 0 && <IconButton label="Responder" icon={Reply} size="sm" onClick={() => onCompose('reply', data.messages[data.messages.length - 1].id)} />}
          {data.inTrash ? <IconButton label="Restaurar" icon={Undo2} size="sm" onClick={() => onAct('untrash')} />
            : data.inInbox ? <IconButton label="Arquivar" icon={Archive} size="sm" onClick={() => onAct('archive')} />
              : <IconButton label="Mover para a Caixa de entrada" icon={Inbox} size="sm" onClick={() => { onAct('inbox'); setData((d) => ({ ...d, inInbox: true, inSpam: false })); }} />}
          {!data.inTrash && <IconButton label="Mover para a Lixeira" icon={Trash2} size="sm" onClick={() => onAct('trash')} />}
          {!data.inSpam && !data.inTrash && folder !== 'SENT' && <IconButton label="Marcar como spam" icon={AlertOctagon} size="sm" onClick={() => onAct('spam')} />}
          <IconButton label="Marcar como não lido" icon={Mail} size="sm" onClick={() => { onAct('unread'); onBack(); }} />
          <IconButton
            label={data.starred ? 'Tirar estrela' : 'Marcar com estrela'} icon={Star} size="sm" className={data.starred ? 'mail-starred' : ''}
            onClick={() => { onAct(data.starred ? 'unstar' : 'star'); setData((d) => ({ ...d, starred: !d.starred })); }}
          />
        </div>
      </div>
      <h2 className="mail-thread-subject">{data.subject}</h2>
      {data.messages.map((m) => (
        <article key={m.id} className={`mail-msg${expanded.has(m.id) ? ' open' : ''}`}>
          <header className="mail-msg-head" {...activateRow(() => toggle(m.id))} aria-expanded={expanded.has(m.id)}>
            <span className="mail-avatar" aria-hidden="true">{initials(m.from)}</span>
            <div className="mail-msg-who">
              <div><strong>{who(m.from)}</strong>{m.from.name && <span className="mail-addr mail-addr-email"> &lt;{m.from.email}&gt;</span>}</div>
              {expanded.has(m.id) ? (
                <div className="mail-addr">
                  Para: {m.to.map(who).join(', ') || '—'}{m.cc.length ? ` · Cc: ${m.cc.map(who).join(', ')}` : ''}
                </div>
              ) : <div className="mail-addr mail-one-line">{m.snippet}</div>}
            </div>
            <span className="mail-date" title={fmtFullDate(m.date)}><span className="mail-date-full">{fmtFullDate(m.date)}</span><span className="mail-date-short">{fmtListDate(m.date)}</span></span>
          </header>
          {expanded.has(m.id) && <MessageBody msg={m} />}
          {expanded.has(m.id) && (
            <div className="mail-reply-bar">
              <Button size="sm" icon={Reply} onClick={() => onCompose('reply', m.id)}>Responder</Button>
              {replyAllCount(m, myEmail) > 1 && <Button size="sm" icon={ReplyAll} onClick={() => onCompose('replyAll', m.id)}>Responder a todos</Button>}
              <Button size="sm" icon={Forward} onClick={() => onCompose('forward', m.id)}>Encaminhar</Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function replyAllCount(m, me) {
  const mine = String(me || '').toLowerCase();
  return new Set([m.from, ...m.to, ...m.cc].map((p) => String((p && p.email) || '').toLowerCase()).filter((e) => e && e !== mine)).size;
}

function MessageBody({ msg }) {
  const [images, setImages] = useState(false);
  const html = useMemo(() => (images ? msg.html.replace(/ data-pt-src="/g, ' src="') : msg.html), [msg.html, images]);
  return (
    <div className="mail-msg-body">
      {msg.remoteImages > 0 && !images && (
        <div className="mail-images">
          <ImageIcon size={14} aria-hidden="true" />
          <span>As imagens deste e-mail foram bloqueadas para proteger sua privacidade.</span>
          <button type="button" className="mail-link" onClick={() => setImages(true)}>Mostrar imagens</button>
        </div>
      )}
      <MailFrame html={html} />
      {msg.attachments.length > 0 && (
        <ul className="mail-atts" aria-label="Anexos">
          {msg.attachments.map((a) => (
            <li key={a.id}>
              <a className="mail-att" href={`/api/mail/messages/${msg.id}/attachments/${encodeURIComponent(a.id)}?name=${encodeURIComponent(a.filename)}`} download={a.filename}>
                <Paperclip size={14} aria-hidden="true" />
                <span className="mail-att-name">{a.filename}</span>
                <span className="mail-att-size">{fmtSize(a.size)}</span>
                <Download size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
