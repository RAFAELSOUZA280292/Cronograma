// Caixa de e-mail (2026-11-02, Fase 1: ler e organizar). Três colunas como no Outlook — pastas, lista, leitura — sobre o
// Gmail da própria pessoa (rotas /api/mail, server/mail.js). No celular vira uma coluna: lista → leitura → Voltar.
// O corpo do e-mail é desenhado num iframe sem script (sandbox) com o HTML já higienizado no servidor; imagens externas
// só carregam com "Mostrar imagens".
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Inbox, Star, Send, FileText, Archive, AlertOctagon, Trash2, Tag, RefreshCw, Search, Paperclip, ArrowLeft, MailOpen, Mail, Undo2, Image as ImageIcon, Download, Link2, AlertTriangle, X, PenSquare, Reply, ReplyAll, Forward, Signature, FolderInput, FolderPlus, Pencil, ListFilter, Bell, PencilLine, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, ChevronDown, MoreVertical } from 'lucide-react';
import { Callout, BusyBar, Button, IconButton, EmptyState, activateRow } from '../ui/index.jsx';
import { notify, askConfirm } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { BrandLogo, useIsMobile } from '../App.jsx';
import { S } from '../styles/S.js';
import MailFrame from './MailFrame.jsx';
import Compose, { fmtSize } from './Compose.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import { MoveDialog, RulesDialog, FolderDialog } from './Folders.jsx';
import { isTypingTarget } from '../shell/shortcuts.js';
import { LIMITS, sanitizeView, viewKey, clampList, stepSize, mailKeyAction, neighborId, afterRemoval, removesFrom } from './mailView.js';
import './mail.css';

const FOLDER_ICON = { INBOX: Inbox, STARRED: Star, SENT: Send, DRAFT: FileText, ARCHIVE: Archive, SPAM: AlertOctagon, TRASH: Trash2 };
const REFRESH_MS = 60 * 1000;
const isLabel = (id) => /^Label_/.test(String(id || ''));
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

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
  const [moveFor, setMoveFor] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [folderEdit, setFolderEdit] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() => (canNotify() ? Notification.permission : 'unsupported'));
  const reqRef = useRef(0);
  const composeRef = useRef(null);
  const seenUnread = useRef(null);
  const [view, setView] = useState(() => { try { return sanitizeView(window.localStorage.getItem(viewKey(currentUser.id))); } catch { return sanitizeView(null); } });
  const [cursor, setCursor] = useState(null);
  const gridRef = useRef(null);
  const mainRef = useRef(null);
  const threadRef = useRef(null);
  const searchRef = useRef(null);
  const keyRef = useRef(null);
  const paneOn = !isMobile && view.reading !== 'off';

  useEffect(() => { try { window.localStorage.setItem(viewKey(currentUser.id), JSON.stringify(view)); } catch { /* sem storage: vale só nesta visita */ } }, [view, currentUser.id]);
  const setV = (patch) => setView((v) => ({ ...v, ...patch }));

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

  // ⋮ → Marcar todas como lidas: vale para a pasta (ou pesquisa) inteira no Gmail, não só para o que está carregado.
  async function markAllRead() {
    try {
      const r = await apiPost('/api/mail/read-all', { folder: search ? '' : folder, q: search || undefined });
      setThreads((list) => list.map((t) => (t.unread ? { ...t, unread: false } : t)));
      loadNav();
      notify(r.count ? `${r.count} ${r.count > 1 ? 'mensagens marcadas' : 'mensagem marcada'} como lida${r.count > 1 ? 's' : ''}.${r.more ? ' Ainda há mais; clique de novo para continuar.' : ''}` : 'Não havia nada não lido aqui.', { tone: 'success' });
    } catch (e) { notify(e.message, { tone: 'error' }); }
  }

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

  // Aviso de e-mail novo (enquanto a tela de E-mail estiver aberta): compara as não lidas da Entrada com as já vistas.
  const checkNew = useCallback(async () => {
    try {
      const { threads: peek } = await apiGet('/api/mail/inbox-peek');
      const known = seenUnread.current;
      seenUnread.current = new Set([...(known || []), ...peek.map((t) => t.id)]);
      if (!known) return;
      const fresh = peek.filter((t) => !known.has(t.id));
      if (!fresh.length) return;
      if (folder === 'INBOX' && !search) loadThreads({ quiet: true });
      loadNav();
      fresh.slice(0, 3).forEach((t) => {
        const from = t.from.map(who).join(', ') || 'remetente desconhecido';
        notify(`Novo e-mail de ${from}: ${t.subject}`, { actionLabel: 'Abrir', onAction: () => { setSearch(''); setFolder('INBOX'); setOpenId(t.id); }, ttlMs: 8000 });
        if (canNotify() && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          try {
            const n = new Notification(`Novo e-mail de ${from}`, { body: t.subject, tag: `mail-${t.id}`, icon: '/favicon.ico' });
            n.onclick = () => { window.focus(); setSearch(''); setFolder('INBOX'); setOpenId(t.id); n.close(); };
          } catch { /* navegador sem suporte a Notification fora do service worker */ }
        }
      });
      if (fresh.length > 3) notify(`Mais ${fresh.length - 3} e-mails novos na Caixa de entrada.`);
    } catch { /* o aviso é um extra: falha silenciosa, a lista continua com o próprio erro */ }
  }, [folder, search, loadThreads, loadNav]);

  useEffect(() => {
    if (!ready) return undefined;
    checkNew();
    const t = setInterval(checkNew, REFRESH_MS);
    return () => clearInterval(t);
  }, [ready, checkNew]);

  const inboxUnread = (nav.folders.find((f) => f.id === 'INBOX') || {}).unread || 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = inboxUnread ? `(${inboxUnread}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\) /, ''); };
  }, [inboxUnread]);

  async function askNotifications() {
    if (!canNotify()) return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
    notify(p === 'granted' ? 'Avisos ligados: você recebe um alerta do computador quando chegar e-mail com o painel aberto.' : 'O navegador não liberou os avisos. Dá para liberar no cadeado ao lado do endereço.', { tone: p === 'granted' ? 'success' : 'info' });
  }

  async function moveTo(ids, label, rule) {
    const from = isLabel(folder) && folder !== label.id ? folder : null;
    const add = [label.id];
    const remove = ['INBOX', ...(from ? [from] : [])];
    const before = threads;
    if (!search) dropThreads(ids);
    setMoveFor(null);
    try {
      await apiPost('/api/mail/threads/modify', { ids, action: 'labels', add, remove });
      let extra = '';
      if (rule) {
        try {
          const r = await apiPost('/api/mail/rules', { from: rule.from, labelId: label.id, applyExisting: rule.applyExisting });
          extra = ` Regra criada: os próximos e-mails de ${rule.from} vão direto para lá${r.moved ? ` (${r.moved} conversa${r.moved > 1 ? 's' : ''} antiga${r.moved > 1 ? 's' : ''} também)` : ''}.`;
          if (r.moved && folder === 'INBOX') loadThreads({ quiet: true });
        } catch (e) { notify(e.message, { tone: 'error' }); }
      }
      const n = ids.length > 1 ? ` (${ids.length})` : '';
      notify(`Movido para “${label.name}”${n}.${extra}`, { undo: async () => { await apiPost('/api/mail/threads/modify', { ids, action: 'labels', add: remove, remove: add }); loadThreads({ quiet: true }); loadNav(); } });
      loadNav();
    } catch (e) {
      setThreads(before);
      notify(e.message, { tone: 'error' });
    }
  }

  // Nova pasta / editar pasta (nome e cor): Folders.jsx, FolderDialog. folderEdit = { label } (label null = nova).
  const newFolder = () => setFolderEdit({ label: null });
  const renameFolder = (l) => setFolderEdit({ label: l });

  // Arrastar conversas da lista para uma pasta (as selecionadas, se a arrastada estiver entre elas).
  const dragIds = (id) => (selected.has(id) ? [...selected] : [id]);
  const dropProps = (target) => ({
    onDragOver: (e) => { if (e.dataTransfer.types.includes('application/x-pt-threads')) { e.preventDefault(); e.currentTarget.classList.add('drop'); } },
    onDragLeave: (e) => e.currentTarget.classList.remove('drop'),
    onDrop: (e) => {
      e.currentTarget.classList.remove('drop');
      const raw = e.dataTransfer.getData('application/x-pt-threads');
      if (!raw) return;
      e.preventDefault();
      const ids = JSON.parse(raw);
      if (target === 'INBOX') act(ids, 'inbox'); else if (target === 'TRASH') act(ids, 'trash'); else if (target === 'ARCHIVE') act(ids, 'archive'); else moveTo(ids, target);
    },
  });

  async function openDraft(threadId) {
    try {
      const { draftId } = await apiGet(`/api/mail/drafts/by-thread/${encodeURIComponent(threadId)}`);
      openCompose({ draftId });
    } catch (e) { notify(e.message, { tone: 'error' }); }
  }

  const onDraftChange = useCallback(() => {
    if (folder === 'DRAFT' && !search) loadThreads({ quiet: true });
    loadNav();
  }, [folder, search, loadThreads, loadNav]);

  function pickFolder(id) {
    setSearch(''); setQuery(''); setFolder(id); setOpenId(null); setCursor(null);
  }

  function submitSearch(e) {
    e.preventDefault();
    setSearch(query.trim()); setOpenId(null); setCursor(null);
  }

  const patchThreads = (ids, fn) => setThreads((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, ...fn(t) } : t)));
  // Tirou a conversa aberta da pasta: com o painel de leitura ligado abre a próxima (como no Outlook); sem ele, volta à lista nela.
  const dropThreads = (ids) => {
    setThreads((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelected(new Set());
    const at = ids.includes(openId) ? openId : ids.includes(cursor) ? cursor : null;
    if (!at) return;
    const nxt = afterRemoval(threads.filter((t) => !ids.includes(t.id) || t.id === at).map((t) => t.id), at);
    setCursor(nxt);
    if (ids.includes(openId)) setOpenId(paneOn && folder !== 'DRAFT' ? nxt : null);
  };

  async function act(ids, action, { silent } = {}) {
    if (!ids.length) return;
    const removes = removesFrom(action, folder);
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

  // Só uma janela de escrita por vez: a que estava aberta é guardada em Rascunhos antes de abrir a outra.
  async function openCompose(next) {
    if (compose && composeRef.current && !(await composeRef.current.close())) return;
    setCompose({ ...next, key: Date.now() });
  }

  function onSent(r) {
    setCompose(null);
    if (r && r.threadId && r.threadId === openId) setThreadRev((n) => n + 1);
    loadThreads({ quiet: true });
    loadNav();
  }

  const openThread = (id) => { setCursor(id); if (folder === 'DRAFT' && !search) openDraft(id); else setOpenId(id); };
  const focusRow = (id) => setTimeout(() => {
    const el = id && document.querySelector(`.mail-row[data-tid="${CSS.escape(id)}"]`);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  }, 0);

  // Atalhos da lista e da leitura (mapa em mailView.js, ajuda "?" em shell/shortcuts.js). Nunca com o foco num campo, dentro da janela
  // de escrita, numa divisória ou por cima de outra janela; Ctrl/⌘/Alt ficam para os atalhos do sistema.
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = mailKeyAction(e);
    const t = e.target;
    if (!action || isTypingTarget(t)) return;
    if (t && t.closest && t.closest('.mc, [role="separator"], .mail-view-menu')) return;
    if (document.querySelector('[role="dialog"]:not(.mc), [role="alertdialog"], .ui-modal')) return;
    if (action === 'open' && t !== document.body && t.closest && t.closest('button, a, summary, [role="button"], .mail-row, .mail-msg-head')) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t.closest && t.closest('.mail-reader')) return;
    const ids = threads.map((x) => x.id);
    const cur = openId || cursor;
    const targets = selected.size ? [...selected] : cur ? [cur] : [];
    const th = openId && !selected.size ? threadRef.current : null;
    const row = threads.find((x) => x.id === cur);
    e.preventDefault();
    if (action === 'next' || action === 'prev') {
      const id = neighborId(ids, cur, action === 'next' ? 1 : -1);
      if (!id) return;
      if ((paneOn || openId) && !(folder === 'DRAFT' && !search)) setOpenId(id);
      setCursor(id); focusRow(id);
    } else if (action === 'open') { if (cur && !openId) openThread(cur); }
    else if (action === 'close') {
      if (openId) { const id = openId; setOpenId(null); setCursor(id); if (!paneOn) focusRow(id); } else if (selected.size) setSelected(new Set());
    } else if (action === 'compose') openCompose({ mode: 'new' });
    else if (action === 'search') { if (searchRef.current) { searchRef.current.focus(); searchRef.current.select(); } }
    else if (action === 'reply' || action === 'replyAll' || action === 'forward') { if (th) th.compose(action); }
    else if (th) th[action]();
    else if (!targets.length || folder === 'DRAFT') return;
    else if (action === 'move') { if (folder !== 'TRASH') setMoveFor({ ids: targets }); }
    else if (action === 'star') act(targets, row && row.starred && !selected.size ? 'unstar' : 'star');
    else if (action === 'archive') act(targets, folder === 'TRASH' ? 'untrash' : 'archive');
    else if (action === 'trash') { if (folder !== 'TRASH') act(targets, 'trash'); }
    else act(targets, action);
  };
  useEffect(() => {
    if (!ready) return undefined;
    const h = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ready]);

  const live = (name, v) => { if (gridRef.current) gridRef.current.style.setProperty(name, v); };
  const navBounds = () => ({ min: LIMITS.nav[0], max: LIMITS.nav[1], scale: 1 });
  const listBounds = () => ({ min: LIMITS.list[0], max: clampList(LIMITS.list[1], mainRef.current ? mainRef.current.clientWidth : 0), scale: 1 });
  const listHBounds = () => ({ min: LIMITS.listH[0], max: LIMITS.listH[1], scale: 1 / Math.max(1, mainRef.current ? mainRef.current.clientHeight : 600) });

  const folderName = search ? `Resultados para “${search}”` : (nav.folders.find((f) => f.id === folder) || nav.labels.find((l) => l.id === folder) || { name: 'Caixa de entrada' }).name;
  const selIds = [...selected];
  const showList = paneOn || !openId;
  const showReader = paneOn || !!openId;
  const compact = view.density === 'compact';
  const navFolders = nav.folders.length ? nav.folders : [{ id: 'INBOX', name: 'Caixa de entrada' }];

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
              ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={isMobile ? 'Pesquisar e-mails' : 'Pesquisar e-mails (ex.: from:cliente@x.com has:attachment)'} aria-label="Pesquisar e-mails"
            />
            {search && <button type="button" className="mail-ic" aria-label="Limpar pesquisa" title="Limpar pesquisa" onClick={() => { setQuery(''); setSearch(''); }}><X size={14} aria-hidden="true" /></button>}
          </form>
        )}
      </div>

      {status === null && <div className="mail-pad"><BusyBar active /></div>}
      {status && !ready && <ConnectCard status={status} />}

      {ready && (
        <div
          ref={gridRef} className={`mail-grid${isMobile ? ' mobile' : ''}${!isMobile && view.navCollapsed ? ' nav-collapsed' : ''}`}
          style={isMobile ? undefined : { '--mail-nav': `${view.navW}px`, '--mail-list': `${view.listW}px`, '--mail-list-h': `${Math.round(view.listH * 100)}%` }}
        >
          {!isMobile && view.navCollapsed && (
            <nav className="mail-nav mail-rail" aria-label="Pastas do e-mail">
              <IconButton label="Mostrar as pastas" icon={PanelLeftOpen} size="sm" onClick={() => setV({ navCollapsed: false })} />
              <button type="button" className="mail-rail-write" aria-label="Escrever" title="Escrever" onClick={() => openCompose({ mode: 'new' })}><PenSquare size={17} aria-hidden="true" /></button>
              {navFolders.map((f) => {
                const Icon = FOLDER_ICON[f.id] || Tag;
                const count = f.id === 'DRAFT' ? f.total : f.unread;
                const on = !search && folder === f.id;
                return (
                  <button
                    key={f.id} type="button" className={`mail-folder mail-rail-btn${on ? ' on' : ''}`} onClick={() => pickFolder(f.id)} aria-current={on ? 'page' : undefined}
                    aria-label={`${f.name}${count ? ` (${count})` : ''}`} title={`${f.name}${count ? ` (${count})` : ''}`} {...(['INBOX', 'ARCHIVE', 'TRASH'].includes(f.id) ? dropProps(f.id) : {})}
                  >
                    <Icon size={17} aria-hidden="true" />{count ? <b className="mail-rail-count" aria-hidden="true">{count > 99 ? '99+' : count}</b> : null}
                  </button>
                );
              })}
            </nav>
          )}
          {!isMobile && !view.navCollapsed && (
            <nav className="mail-nav" aria-label="Pastas do e-mail">
              <div className="mail-nav-top">
                <Button variant="primary" icon={PenSquare} className="mail-write" onClick={() => openCompose({ mode: 'new' })}>Escrever</Button>
                <IconButton label="Recolher as pastas" icon={PanelLeftClose} size="sm" onClick={() => setV({ navCollapsed: true })} />
              </div>
              {navFolders.map((f) => {
                const Icon = FOLDER_ICON[f.id] || Tag;
                const count = f.id === 'DRAFT' ? f.total : f.unread;
                return (
                  <button key={f.id} type="button" className={`mail-folder${!search && folder === f.id ? ' on' : ''}`} onClick={() => pickFolder(f.id)} aria-current={!search && folder === f.id ? 'page' : undefined} {...(['INBOX', 'ARCHIVE', 'TRASH'].includes(f.id) ? dropProps(f.id) : {})}>
                    <Icon size={15} aria-hidden="true" /><span>{f.name}</span>{count ? <b className="mail-count">{count}</b> : null}
                  </button>
                );
              })}
              <div className="mail-nav-title mail-nav-title-row">
                <span>Pastas</span>
                <button type="button" className="mail-ic" aria-label="Nova pasta" title="Nova pasta" onClick={newFolder}><FolderPlus size={14} aria-hidden="true" /></button>
              </div>
              {nav.labels.map((l) => (
                <div key={l.id} className="mail-folder-row" {...dropProps(l)}>
                  <button type="button" className={`mail-folder${!search && folder === l.id ? ' on' : ''}`} onClick={() => pickFolder(l.id)} title={l.name} aria-current={!search && folder === l.id ? 'page' : undefined}>
                    <Tag size={14} aria-hidden="true" style={l.color ? { color: l.color } : undefined} fill={l.color || 'none'} /><span>{l.name}</span>{l.unread ? <b className="mail-count">{l.unread}</b> : null}
                  </button>
                  <button type="button" className="mail-ic mail-folder-edit" aria-label={`Editar a pasta ${l.name} (nome e cor)`} title="Editar nome e cor" onClick={() => renameFolder(l)}><Pencil size={12} aria-hidden="true" /></button>
                </div>
              ))}
              {!nav.labels.length && <button type="button" className="mail-folder mail-folder-hint" onClick={newFolder}><FolderPlus size={14} aria-hidden="true" /><span>Criar a primeira pasta</span></button>}
              <div className="mail-nav-title">Configurar</div>
              <button type="button" className="mail-folder" onClick={() => setSigOpen(true)} disabled={!signature}>
                <Signature size={14} aria-hidden="true" /><span>Assinatura</span>
              </button>
              <button type="button" className="mail-folder" onClick={() => setRulesOpen(true)}>
                <ListFilter size={14} aria-hidden="true" /><span>Regras</span>
              </button>
              {notifPerm === 'default' && (
                <button type="button" className="mail-folder" onClick={askNotifications} title="Alerta do computador quando chegar e-mail (com o painel aberto)">
                  <Bell size={14} aria-hidden="true" /><span>Ativar avisos</span>
                </button>
              )}
            </nav>
          )}
          {!isMobile && !view.navCollapsed && (
            <Splitter
              label="Largura da coluna de pastas" value={view.navW} bounds={navBounds} fmt={(v) => `${Math.round(v)} px`}
              onLive={(v) => live('--mail-nav', `${v}px`)} onCommit={(v) => setV({ navW: Math.round(v) })}
            />
          )}

          <div ref={mainRef} className={`mail-main read-${isMobile ? 'mobile' : view.reading}`}>
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
                {/* Como no Gmail: caixa de seleção, Atualizar e ⋮ juntos, à esquerda. */}
                <div className="mail-list-tools">
                  {threads.length > 0 && <SelectMenu threads={threads} selected={selected} onSelect={setSelected} />}
                  {!selIds.length && (
                    <>
                      <IconButton label="Atualizar" icon={RefreshCw} size="sm" onClick={() => { loadThreads(); loadNav(); }} />
                      <MoreMenu items={[{ key: 'read-all', label: search ? 'Marcar todas da pesquisa como lidas' : 'Marcar todas como lidas', onClick: markAllRead }]} />
                    </>
                  )}
                </div>
                {selIds.length ? (
                  <>
                    <span className="mail-list-title">{selIds.length} selecionada{selIds.length > 1 ? 's' : ''}</span>
                    <BulkActions folder={folder} onAct={(a) => act(selIds, a)} onMove={() => setMoveFor({ ids: selIds })} onClear={() => setSelected(new Set())} />
                  </>
                ) : (
                  <>
                    <span className="mail-list-title">{folderName}</span>
                    <div className="mail-actions">
                      <ViewMenu view={view} isMobile={isMobile} onChange={setV} />
                      {isMobile && <IconButton label="Assinatura do e-mail" icon={Signature} size="sm" onClick={() => setSigOpen(true)} disabled={!signature} />}
                      {isMobile && <IconButton label="Regras do e-mail" icon={ListFilter} size="sm" onClick={() => setRulesOpen(true)} />}
                    </div>
                  </>
                )}
              </div>
              <BusyBar active={loading} />
              {listError && <div className="mail-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar os e-mails">{listError}</Callout></div>}
              {!loading && !listError && threads.length === 0 && (
                <EmptyState icon={Inbox} title={search ? 'Nada encontrado' : 'Nenhum e-mail aqui'} description={search ? 'Tente outras palavras ou procure por remetente (from:).' : 'Quando chegar algo nesta pasta, aparece aqui.'} compact />
              )}
              <ul className={`mail-rows${compact ? ' compact' : ''}`}>
                {threads.map((t) => (
                  <li
                    key={t.id} data-tid={t.id}
                    className={`mail-row${t.unread ? ' unread' : ''}${openId === t.id ? ' open' : ''}${selected.has(t.id) ? ' sel' : ''}${cursor === t.id && openId !== t.id ? ' cur' : ''}`}
                    {...activateRow(() => openThread(t.id))}
                    draggable={!isMobile && folder !== 'DRAFT'}
                    onDragStart={(e) => { e.dataTransfer.setData('application/x-pt-threads', JSON.stringify(dragIds(t.id))); e.dataTransfer.effectAllowed = 'move'; }}
                    aria-label={`${t.unread ? 'Não lido. ' : ''}${t.from.map(who).join(', ')}: ${t.subject}`}
                  >
                    <input
                      type="checkbox" className="mail-check" checked={selected.has(t.id)} aria-label="Selecionar conversa"
                      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={() => toggleSelect(t.id)}
                    />
                    {compact ? (
                      <div className="mail-row-main mail-row-line">
                        <span className="mail-from">{folder === 'SENT' && !search ? `Para: ${t.to.map(who).join(', ')}` : t.from.map(who).join(', ')}{t.count > 1 && <span className="mail-n">{t.count}</span>}</span>
                        <span className="mail-line-text"><span className="mail-subject">{t.subject}</span>{view.snippet && t.snippet ? <span className="mail-snippet"> — {t.snippet}</span> : null}</span>
                        {t.hasAttachment && <Paperclip size={13} aria-label="Tem anexo" className="mail-clip" />}
                        <span className="mail-date">{fmtListDate(t.date)}</span>
                      </div>
                    ) : (
                      <div className="mail-row-main">
                        <div className="mail-row-top">
                          <span className="mail-from">{folder === 'SENT' && !search ? `Para: ${t.to.map(who).join(', ')}` : t.from.map(who).join(', ')}{t.count > 1 && <span className="mail-n">{t.count}</span>}</span>
                          {t.hasAttachment && <Paperclip size={13} aria-label="Tem anexo" className="mail-clip" />}
                          <span className="mail-date">{fmtListDate(t.date)}</span>
                        </div>
                        <div className="mail-subject">{t.subject}</div>
                        {view.snippet && <div className="mail-snippet">{t.snippet}</div>}
                      </div>
                    )}
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
          {paneOn && showList && (
            view.reading === 'bottom' ? (
              <Splitter
                horizontal label="Altura da lista de e-mails" value={view.listH} bounds={listHBounds} step={0.05}
                fmt={(v) => `${Math.round(v * 100)}% da altura`} aria={(v) => Math.round(v * 100)}
                onLive={(v) => live('--mail-list-h', `${Math.round(v * 100)}%`)} onCommit={(v) => setV({ listH: Math.round(v * 100) / 100 })}
              />
            ) : (
              <Splitter
                label="Largura da lista de e-mails" value={view.listW} bounds={listBounds} fmt={(v) => `${Math.round(v)} px`}
                onLive={(v) => live('--mail-list', `${v}px`)} onCommit={(v) => setV({ listW: Math.round(v) })}
              />
            )
          )}

          {showReader && (
            <section className="mail-reader" aria-label="Leitura do e-mail">
              {openId ? (
                <ThreadView
                  ref={threadRef} key={`${openId}-${threadRev}`} id={openId} showBack={!paneOn} folder={folder} myEmail={status && status.email}
                  onBack={() => { const id = openId; setOpenId(null); setCursor(id); focusRow(id); }} onOpened={onOpened} onAct={(a) => act([openId], a)}
                  onCompose={(mode, messageId) => openCompose({ mode, messageId })}
                  onMove={(sender) => setMoveFor({ ids: [openId], sender })} onOpenDraft={() => openDraft(openId)}
                />
              ) : (
                <EmptyState icon={MailOpen} title="Escolha um e-mail para ler" description="Clique numa conversa da lista. Ela é marcada como lida ao abrir, como no Outlook." />
              )}
            </section>
          )}
          </div>
        </div>
      )}
      {ready && isMobile && !compose && (
        <button type="button" className="mail-fab" aria-label="Escrever e-mail" title="Escrever e-mail" onClick={() => openCompose({ mode: 'new' })}><PenSquare size={22} aria-hidden="true" /></button>
      )}
      {compose && (
        <Compose
          key={compose.key} init={compose} signature={signature} isMobile={isMobile}
          ref={composeRef} onClose={() => setCompose(null)} onSent={onSent} onEditSignature={() => setSigOpen(true)} onDraftChange={onDraftChange}
        />
      )}
      {moveFor && (
        <MoveDialog
          labels={nav.labels} count={moveFor.ids.length} sender={moveFor.sender} canRules={!!(status && status.rules)} currentLabel={isLabel(folder) ? folder : null}
          onClose={() => setMoveFor(null)} onMove={(label, rule) => moveTo(moveFor.ids, label, rule)}
          onCreated={(l) => setNav((n) => ({ ...n, labels: [...n.labels, { ...l, unread: 0 }].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))}
        />
      )}
      {folderEdit && <FolderDialog label={folderEdit.label} onClose={() => setFolderEdit(null)} onSaved={() => { setFolderEdit(null); loadNav(); }} />}
      {rulesOpen && <RulesDialog canRules={!!(status && status.rules)} onClose={() => setRulesOpen(false)} />}
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

function BulkActions({ folder, onAct, onMove, onClear }) {
  return (
    <div className="mail-actions">
      {folder !== 'TRASH' && folder !== 'DRAFT' && <IconButton label="Mover para pasta" icon={FolderInput} size="sm" onClick={onMove} />}
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

function ThreadView({ ref, id, showBack, folder, myEmail, onBack, onOpened, onAct, onCompose, onMove, onOpenDraft }) {
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

  const moveIt = () => { const last = [...data.messages].reverse().find((m) => !m.sent && m.from && m.from.email); onMove(last ? last.from : null); };
  const starIt = () => { onAct(data.starred ? 'unstar' : 'star'); setData((d) => ({ ...d, starred: !d.starred })); };
  // Mesmas ações da barra, para os atalhos de teclado (MailScreen chama pelo ref).
  useImperativeHandle(ref, () => ({
    compose: (mode) => {
      const last = data && data.messages[data.messages.length - 1];
      if (!last) return;
      if (last.draft) { onOpenDraft(); return; }
      onCompose(mode === 'replyAll' && replyAllCount(last, myEmail) <= 1 ? 'reply' : mode, last.id);
    },
    archive: () => { if (data && !data.inTrash && data.inInbox) onAct('archive'); else if (data && data.inTrash) onAct('untrash'); },
    trash: () => { if (data && !data.inTrash) onAct('trash'); },
    star: () => { if (data) starIt(); },
    unread: () => { onAct('unread'); onBack(); },
    move: () => { if (data && !data.inTrash) moveIt(); },
  }));

  const back = showBack ? <IconButton label="Voltar para a lista" icon={ArrowLeft} size="sm" onClick={onBack} /> : null;
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
          {!data.inTrash && (
            <IconButton
              label="Mover para pasta" icon={FolderInput} size="sm"
              onClick={moveIt}
            />
          )}
          {!data.inTrash && <IconButton label="Mover para a Lixeira" icon={Trash2} size="sm" onClick={() => onAct('trash')} />}
          {!data.inSpam && !data.inTrash && folder !== 'SENT' && <IconButton label="Marcar como spam" icon={AlertOctagon} size="sm" onClick={() => onAct('spam')} />}
          <IconButton label="Marcar como não lido" icon={Mail} size="sm" onClick={() => { onAct('unread'); onBack(); }} />
          <IconButton
            label={data.starred ? 'Tirar estrela' : 'Marcar com estrela'} icon={Star} size="sm" className={data.starred ? 'mail-starred' : ''}
            onClick={starIt}
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
          {expanded.has(m.id) && m.draft && (
            <div className="mail-reply-bar"><Button size="sm" variant="primary" icon={PencilLine} onClick={onOpenDraft}>Continuar rascunho</Button></div>
          )}
          {expanded.has(m.id) && !m.draft && (
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

// Divisória arrastável entre colunas (Pointer Events: mouse, caneta e toque). Durante o arrasto mexe só na variável CSS da grade
// (`onLive`, sem redesenhar a tela); ao soltar grava a preferência (`onCommit`). Teclado: setas, Shift+setas, Home/End.
function Splitter({ horizontal, label, value, bounds, onLive, onCommit, step = 16, fmt, aria = (v) => Math.round(v) }) {
  const drag = useRef(null);
  const b = bounds();
  function down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { start: horizontal ? e.clientY : e.clientX, value, last: value, ...bounds() };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem ponteiro ativo (evento sintético): arrasta sem captura */ }
    document.body.classList.add('mail-resizing', horizontal ? 'rows' : 'cols');
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    d.last = Math.min(d.max, Math.max(d.min, d.value + ((horizontal ? e.clientY : e.clientX) - d.start) * d.scale));
    onLive(d.last);
  }
  function up(e) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
    document.body.classList.remove('mail-resizing', 'rows', 'cols');
    if (d.last !== d.value) onCommit(d.last);
  }
  function key(e) {
    const v = stepSize(value, e, { ...bounds(), step, vertical: horizontal });
    if (v === null) return;
    e.preventDefault(); e.stopPropagation();
    onLive(v); onCommit(v);
  }
  return (
    <div
      role="separator" tabIndex={0} className={`mail-split${horizontal ? ' h' : ''}`} aria-label={label} aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuenow={aria(value)} aria-valuemin={aria(b.min)} aria-valuemax={aria(b.max)} aria-valuetext={fmt(value)} title={`${label}: arraste ou use as setas`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
    />
  );
}

const READING_LABEL = { right: 'À direita', bottom: 'Embaixo da lista', off: 'Desligado (abre no lugar da lista)' };

// "Exibir": painel de leitura, densidade da lista, trecho e coluna de pastas. A escolha fica guardada por pessoa (mailView.js).
// ⋮ da lista (como no Gmail): ações que valem para a pasta inteira.
function MoreMenu({ items }) {
  const [open, setOpen] = useState(null);
  const wrap = useRef(null);
  const toggle = (e) => {
    if (open) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const w = Math.min(260, window.innerWidth - 32);
    setOpen({ top: r.bottom + 6, left: Math.max(16, Math.min(r.right - w, window.innerWidth - w - 16)), width: w });
  };
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(null); } };
    document.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div className="mail-view-wrap" ref={wrap}>
      <IconButton label="Mais opções" icon={MoreVertical} size="sm" aria-haspopup="menu" aria-expanded={!!open} onClick={toggle} />
      {open && (
        <div className="mail-view-menu mail-sel-menu" role="menu" aria-label="Mais opções" style={{ top: open.top, left: open.left, width: open.width }}>
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" className="mail-sel-item" onClick={() => { setOpen(null); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Seleção como no Gmail: a caixa marca/desmarca todas as conversas carregadas e a setinha escolhe por estado.
const SELECT_OPTIONS = [
  ['all', 'Todos', () => true], ['none', 'Nenhum', () => false],
  ['read', 'Lidas', (t) => !t.unread], ['unread', 'Não lidas', (t) => !!t.unread],
  ['starred', 'Com estrela', (t) => !!t.starred], ['unstarred', 'Sem estrela', (t) => !t.starred],
];
function SelectMenu({ threads, selected, onSelect }) {
  const [open, setOpen] = useState(null);
  const wrap = useRef(null);
  const box = useRef(null);
  const count = threads.filter((t) => selected.has(t.id)).length;
  const all = count > 0 && count === threads.length;
  useEffect(() => { if (box.current) box.current.indeterminate = count > 0 && !all; }, [count, all]);
  const toggle = (e) => {
    if (open) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setOpen({ top: r.bottom + 6, left: Math.max(16, Math.min(r.left - 28, window.innerWidth - 200)) });
  };
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(null); } };
    document.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const pick = (fn) => { onSelect(new Set(threads.filter(fn).map((t) => t.id))); setOpen(null); };
  return (
    <div className="mail-selall" ref={wrap}>
      <input ref={box} type="checkbox" className="mail-check" checked={all} onChange={() => pick(all ? () => false : () => true)}
        aria-label={all ? 'Desmarcar todas' : 'Selecionar todas'} title={all ? 'Desmarcar todas' : 'Selecionar todas'} />
      <button type="button" className="mail-selall-btn" aria-label="Selecionar por tipo" title="Selecionar" aria-haspopup="menu" aria-expanded={!!open} onClick={toggle}>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="mail-view-menu mail-sel-menu" role="menu" aria-label="Selecionar" style={{ top: open.top, left: open.left }}>
          {SELECT_OPTIONS.map(([key, label, fn]) => (
            <button key={key} type="button" role="menuitem" className="mail-sel-item" onClick={() => pick(fn)}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewMenu({ view, isMobile, onChange }) {
  const [open, setOpen] = useState(null);
  const wrap = useRef(null);
  // Posição fixa calculada pelo botão: a lista rola (overflow) e cortaria um menu absoluto.
  const toggle = (e) => {
    if (open) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 32);
    setOpen({ top: r.bottom + 6, left: Math.max(16, Math.min(r.right - w, window.innerWidth - w - 16)), width: w });
  };
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(null); } };
    document.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const radio = (name, value, cur, label, patch) => (
    <label className="mc-check" key={value}>
      <input type="radio" name={name} checked={cur === value} onChange={() => onChange(patch)} />{label}
    </label>
  );
  return (
    <div className="mail-view-wrap" ref={wrap}>
      <IconButton label="Exibir: painel de leitura e densidade da lista" icon={SlidersHorizontal} size="sm" aria-expanded={!!open} aria-haspopup="true" onClick={toggle} />
      {open && (
        <div className="mail-view-menu" role="group" aria-label="Opções de exibição" style={{ top: open.top, left: open.left, width: open.width }}>
          {!isMobile && (
            <fieldset>
              <legend>Painel de leitura</legend>
              {['right', 'bottom', 'off'].map((r) => radio('mail-reading', r, view.reading, READING_LABEL[r], { reading: r }))}
            </fieldset>
          )}
          <fieldset>
            <legend>Lista</legend>
            {radio('mail-density', 'comfortable', view.density, 'Confortável (duas linhas)', { density: 'comfortable' })}
            {radio('mail-density', 'compact', view.density, 'Compacta (uma linha)', { density: 'compact' })}
            <label className="mc-check"><input type="checkbox" checked={view.snippet} onChange={(e) => onChange({ snippet: e.target.checked })} />Mostrar o trecho do e-mail</label>
          </fieldset>
          {!isMobile && (
            <fieldset>
              <legend>Pastas</legend>
              <label className="mc-check"><input type="checkbox" checked={view.navCollapsed} onChange={(e) => onChange({ navCollapsed: e.target.checked })} />Recolher a coluna de pastas</label>
            </fieldset>
          )}
          {!isMobile && <p className="mail-view-hint">Arraste as divisórias entre as colunas para mudar a largura. Tecla <kbd>?</kbd> mostra os atalhos.</p>}
        </div>
      )}
    </div>
  );
}
