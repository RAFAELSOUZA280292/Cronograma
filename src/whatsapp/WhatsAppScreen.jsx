// WhatsApp (2026-11-02, Fase 1): caixa de conversas do número da PRICETAX, compartilhada pela equipe. Duas colunas —
// conversas e conversa aberta —; no celular, uma coluna (lista → conversa → Voltar). Rotas /api/whatsapp (server/whatsapp.js).
// Responder texto ou arquivo só dentro da janela de 24 h da última mensagem do cliente (regra da Meta); fora dela, só
// modelo aprovado (Fase 3). Atualiza sozinha: lista a cada 15 s e conversa aberta a cada 5 s, só com a aba visível.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, ArrowLeft, Archive, Inbox, Paperclip, Send, Check, CheckCheck, AlertTriangle, Clock, Download, FileText, MessageCircle, Smartphone, Settings, Lock, ShieldCheck, ShieldOff, Users, Plus } from 'lucide-react';
import { Callout, BusyBar, Button, IconButton, EmptyState, Segmented, activateRow } from '../ui/index.jsx';
import { notify, askConfirm } from '../ui/dialogs.jsx';
import { apiGet, apiPost, apiPatch } from '../lib/api.js';
import { useDialog } from '../lib/nav.js';
import { BrandLogo, useIsMobile, useDirtyForm, ConfirmDiscardModal } from '../App.jsx';
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

const INBOX_KEY = 'pt.whatsapp.inbox';
const savedInbox = () => { try { return localStorage.getItem(INBOX_KEY) || ''; } catch { return ''; } };
const saveInbox = (id) => { try { localStorage.setItem(INBOX_KEY, id); } catch { /* sem armazenamento: só não lembra */ } };

export default function WhatsAppScreen({ currentUser, theme }) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState(null);
  const [inboxId, setInboxId] = useState(savedInbox);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [openId, setOpenId] = useState(hashConv);
  const [adminOpen, setAdminOpen] = useState(false);

  const loadStatus = useCallback(() => apiGet('/api/whatsapp/status').then(setStatus).catch(() => setStatus({ enabled: false, missing: [], inboxes: [] })), []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const inboxes = (status && status.inboxes) || [];
  const inbox = inboxes.find((i) => i.id === inboxId) || inboxes.find((i) => i.authorized) || inboxes[0] || null;
  const usable = !!inbox && inbox.authorized;

  const pickInbox = (id) => { setInboxId(id); saveInbox(id); setArchived(false); setSearch(''); setQuery(''); open(null); };

  const loadList = useCallback(async (quiet) => {
    if (!inbox || !inbox.authorized) { setConvs([]); return; }
    if (!quiet) setLoading(true);
    try {
      const qs = new URLSearchParams({ inbox: inbox.id, ...(archived ? { archived: '1' } : {}), ...(search ? { q: search } : {}) }).toString();
      const data = await apiGet(`/api/whatsapp/conversations?${qs}`);
      setConvs(data.conversations || []);
      setListError('');
    } catch (e) {
      if (!quiet) setListError(e.message || 'Não consegui carregar as conversas.');
    } finally { if (!quiet) setLoading(false); }
  }, [inbox && inbox.id, inbox && inbox.authorized, archived, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList(false); }, [loadList]);
  useEffect(() => {
    const t = setInterval(() => { if (visible()) { loadList(true); loadStatus(); } }, LIST_MS);
    return () => clearInterval(t);
  }, [loadList, loadStatus]);

  useEffect(() => {
    const onHash = () => { const id = hashConv(); if (id) setOpenId(id); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function open(id) {
    setOpenId(id);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${id ? `#conversa=${id}` : ''}`);
  }

  const refresh = useCallback(() => { loadList(true); loadStatus(); }, [loadList, loadStatus]);
  // Conversa aberta por aviso de outra caixa: a lista acompanha.
  const onConvInbox = useCallback((id) => { if (id && inbox && id !== inbox.id) { setInboxId(id); saveInbox(id); } }, [inbox && inbox.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async () => {
    const ok = await askConfirm({
      title: 'Desligar o seu WhatsApp do painel?',
      message: 'O painel para de receber as suas conversas e APAGA tudo o que já guardou desta caixa (mensagens e arquivos). No celular nada muda. Para voltar, é só autorizar de novo.',
      confirmLabel: 'Desligar e apagar', danger: true,
    });
    if (!ok) return;
    try {
      const r = await apiPost(`/api/whatsapp/inboxes/${inbox.id}/revoke`);
      notify(`Desligado. ${r.removed} conversa(s) apagada(s) do painel.`, { tone: 'success' });
      open(null); setConvs([]); loadStatus();
    } catch (e) { notify(e.message, { tone: 'error' }); }
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
            <div style={{ fontSize: 12, color: 'var(--text-5)' }}>{inbox ? `${inbox.name}${inbox.displayPhone ? ` · ${inbox.displayPhone}` : ''}` : 'Conversas no painel'}</div>
          </div>
        </div>
        {inboxes.length > 1 && (
          <label className="wa-inbox-pick">
            <span className="ui-sr">Caixa</span>
            <select value={inbox ? inbox.id : ''} onChange={(e) => pickInbox(e.target.value)}>
              {inboxes.map((i) => <option key={i.id} value={i.id}>{i.kind === 'personal' ? '🔒 ' : ''}{i.name}{i.unread ? ` (${i.unread})` : ''}</option>)}
            </select>
          </label>
        )}
        {usable && (
          <form className="wa-search" role="search" onSubmit={submitSearch}>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por nome ou número" aria-label="Pesquisar conversas" />
            {search && <button type="button" className="wa-ic" aria-label="Limpar pesquisa" title="Limpar pesquisa" onClick={() => { setQuery(''); setSearch(''); }}><X size={14} aria-hidden="true" /></button>}
          </form>
        )}
        {status && status.isMaster && <Button icon={Settings} size="sm" onClick={() => setAdminOpen(true)}>Configurar caixas</Button>}
      </div>

      {status === null && <div className="wa-pad"><BusyBar active /></div>}
      {status && !status.enabled && <SetupCard status={status} />}
      {status && inboxes.length === 0 && (
        <EmptyState
          icon={MessageCircle} title="Você ainda não tem caixa de WhatsApp"
          description={status.isMaster ? 'Cadastre um número em "Configurar caixas": compartilhado (com as pessoas escolhidas) ou pessoal (só o dono vê).' : 'Quando o master incluir você numa caixa, ou cadastrar o seu número pessoal, ela aparece aqui.'}
        />
      )}
      {inbox && !inbox.authorized && <AuthorizeCard inbox={inbox} onDone={loadStatus} />}

      {usable && (
        <div className={`wa-grid${isMobile ? ' mobile' : ''}`}>
          {showList && (
            <section className="wa-list" aria-label="Conversas">
              <div className="wa-list-head">
                <Segmented
                  label="Quais conversas" value={archived ? 'arch' : 'open'} onChange={(v) => { setArchived(v === 'arch'); open(null); }}
                  options={[{ value: 'open', label: 'Conversas' }, { value: 'arch', label: 'Arquivadas' }]}
                />
                {inbox.kind === 'personal' && <IconButton label="Desligar o meu WhatsApp do painel" icon={ShieldOff} size="sm" onClick={revoke} />}
              </div>
              {inbox.kind === 'personal' && <div className="wa-private"><Lock size={12} aria-hidden="true" /> Caixa pessoal: só você vê.</div>}
              <BusyBar active={loading} />
              {listError && <div className="wa-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar as conversas">{listError}</Callout></div>}
              {!loading && !listError && convs.length === 0 && (
                <EmptyState
                  icon={MessageCircle} compact
                  title={search ? 'Nada encontrado' : archived ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa ainda'}
                  description={search ? 'Tente outro nome ou parte do número.' : archived ? '' : 'As conversas novas deste número aparecem aqui.'}
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
                ? <Conversation key={openId} id={openId} enabled={!!status.enabled && inbox.ready} isMobile={isMobile} onBack={() => open(null)} onChanged={refresh} onInbox={onConvInbox} />
                : <EmptyState icon={MessageCircle} title="Escolha uma conversa" description={inbox.kind === 'personal' ? 'As mensagens do seu número aparecem aqui, só para você.' : 'Todos os membros desta caixa veem as mesmas conversas e quem respondeu cada uma.'} />}
            </section>
          )}
        </div>
      )}
      {adminOpen && <InboxAdmin onClose={() => setAdminOpen(false)} onSaved={loadStatus} />}
    </div>
  );
}

function SetupCard({ status }) {
  return (
    <div className="wa-pad">
      <Callout tone="info" icon={Smartphone} title="O WhatsApp ainda não foi ligado ao painel">
        A tela está pronta. Ela começa a receber mensagens quando o app da PRICETAX na Meta (WhatsApp Business Platform) estiver aprovado e as chaves forem cadastradas no servidor.
        {status.isMaster && status.missing && status.missing.length > 0 && <> Faltam: {status.missing.join(', ')}.</>}
      </Callout>
    </div>
  );
}

// Número pessoal: nada é guardado até o PRÓPRIO dono autorizar aqui.
function AuthorizeCard({ inbox, onDone }) {
  const [busy, setBusy] = useState(false);
  const authorize = async () => {
    setBusy(true);
    try { await apiPost(`/api/whatsapp/inboxes/${inbox.id}/authorize`); notify('Autorizado. As próximas mensagens do seu número aparecem aqui, só para você.', { tone: 'success' }); onDone(); } catch (e) { notify(e.message, { tone: 'error' }); setBusy(false); }
  };
  return (
    <div className="wa-pad wa-auth">
      <Callout tone="info" icon={Lock} title={`Autorizar o seu WhatsApp pessoal${inbox.displayPhone ? ` (${inbox.displayPhone})` : ''} no painel?`}>
        <ul className="wa-auth-list">
          <li>Só você vê estas conversas. Ninguém mais tem acesso, nem o master do painel.</li>
          <li>O conteúdo fica cifrado no banco da PRICETAX. Grupos não aparecem (a Meta não os envia).</li>
          <li>O celular continua igual; o que você responder lá também aparece aqui.</li>
          <li>Você pode desligar quando quiser: o painel para de receber e apaga tudo o que guardou.</li>
        </ul>
        <Button variant="primary" icon={ShieldCheck} loading={busy} onClick={authorize}>Autorizo</Button>
      </Callout>
    </div>
  );
}

const blankInbox = { name: '', kind: 'shared', ownerId: '', phoneNumberId: '', displayPhone: '', token: '', active: true, memberIds: [] };

// Configurar caixas (master): número, chave da Meta (só gravada, nunca mostrada), tipo e quem vê. Não mostra conversa nenhuma.
function InboxAdmin({ onClose, onSaved }) {
  const trap = useDialog(() => requestClose());
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankInbox);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [base, setBase] = useState(blankInbox);
  const dirty = editing !== null && JSON.stringify(form) !== JSON.stringify(base);
  useDirtyForm(dirty);

  useEffect(() => { apiGet('/api/whatsapp/admin/inboxes').then(setData).catch((e) => setError(e.message)); }, []);

  function requestClose() { if (dirty) setConfirmDiscard(true); else onClose(); }
  const edit = (i) => {
    const f = i ? { name: i.name, kind: i.kind, ownerId: i.ownerId || '', phoneNumberId: i.phoneNumberId, displayPhone: i.displayPhone, token: '', active: i.active, memberIds: i.members.map((m) => m.id) } : blankInbox;
    setEditing(i ? i.id : 'new'); setForm(f); setBase(f); setError('');
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleMember = (id) => set('memberIds', form.memberIds.includes(id) ? form.memberIds.filter((x) => x !== id) : [...form.memberIds, id]);

  async function save(e) {
    if (e) e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { ...form };
      if (!body.token) delete body.token;
      const r = editing === 'new' ? await apiPost('/api/whatsapp/admin/inboxes', body) : await apiPatch(`/api/whatsapp/admin/inboxes/${editing}`, body);
      setData((d) => ({ ...d, inboxes: r.inboxes }));
      notify('Caixa salva.', { tone: 'success' });
      setEditing(null); setForm(blankInbox); setBase(blankInbox);
      onSaved();
      return true;
    } catch (err) { setError(err.message); return false; } finally { setBusy(false); }
  }

  const current = data && editing && editing !== 'new' ? data.inboxes.find((i) => i.id === editing) : null;
  return (
    <div className="ui-dlg-overlay" onClick={requestClose}>
      <div className="ui-dlg wa-admin" role="dialog" aria-modal="true" aria-label="Configurar caixas do WhatsApp" ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="wa-admin-head">
          <h2 className="ui-dlg-title">Caixas do WhatsApp</h2>
          {dirty && <span className="wa-dirty">Alterações não salvas</span>}
          <IconButton label="Fechar" icon={X} size="sm" onClick={requestClose} />
        </div>
        <BusyBar active={!data || busy} />
        {data && !data.webhookReady && <div className="ui-dlg-msg">O servidor ainda não tem as chaves do app da Meta (WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN). Dá para cadastrar as caixas; elas recebem quando as chaves entrarem.</div>}
        {data && editing === null && (
          <>
            <ul className="wa-admin-list">
              {data.inboxes.length === 0 && <li className="wa-sub">Nenhuma caixa cadastrada.</li>}
              {data.inboxes.map((i) => (
                <li key={i.id} className="wa-admin-row">
                  {i.kind === 'personal' ? <Lock size={14} aria-hidden="true" /> : <Users size={14} aria-hidden="true" />}
                  <div className="wa-admin-main">
                    <strong>{i.name}</strong>{!i.active && <span className="wa-sub"> · desligada</span>}
                    <div className="wa-sub">
                      {i.kind === 'personal' ? `Pessoal de ${i.ownerName} · ${i.authorized ? 'autorizada pelo dono' : 'aguardando o dono autorizar'}` : `Compartilhada · ${i.members.map((m) => m.name).join(', ') || 'sem membros'}`}
                      {i.displayPhone ? ` · ${i.displayPhone}` : ''}{i.tokenSet ? '' : ' · sem chave de acesso'}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => edit(i)}>Editar</Button>
                </li>
              ))}
            </ul>
            <div className="ui-dlg-actions">
              <Button icon={Plus} variant="primary" onClick={() => edit(null)}>Nova caixa</Button>
            </div>
          </>
        )}
        {data && editing !== null && (
          <form onSubmit={save} className="wa-admin-form">
            {editing === 'new' && (
              <Segmented label="Tipo da caixa" value={form.kind} onChange={(v) => set('kind', v)} options={[{ value: 'shared', label: 'Compartilhada' }, { value: 'personal', label: 'Pessoal' }]} />
            )}
            <div className="ui-dlg-msg">
              {form.kind === 'personal'
                ? 'Número pessoal de um sócio (coexistência com o app do celular). Só o dono vê; nada é guardado até ele autorizar no próprio painel. Você não terá acesso às conversas.'
                : 'Número profissional. Só os membros marcados abaixo veem e respondem as conversas.'}
            </div>
            <label className="wa-field"><span>Nome da caixa</span><input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} placeholder={form.kind === 'personal' ? 'Ex.: Rafael (pessoal)' : 'Ex.: Comercial'} /></label>
            {form.kind === 'personal' && editing === 'new' && (
              <label className="wa-field"><span>Dono do número</span>
                <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                  <option value="">Escolha…</option>
                  {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            )}
            {form.kind === 'personal' && current && <div className="wa-sub">Dono: {current.ownerName} (não muda; para outro dono, crie outra caixa).</div>}
            <label className="wa-field"><span>Número exibido</span><input value={form.displayPhone} onChange={(e) => set('displayPhone', e.target.value)} maxLength={30} placeholder="+55 (41) 99999-0000" /></label>
            <label className="wa-field"><span>Identificador do número na Meta (Phone number ID)</span><input value={form.phoneNumberId} onChange={(e) => set('phoneNumberId', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={25} /></label>
            <label className="wa-field"><span>Chave de acesso da Meta {current && current.tokenSet ? '(já guardada; preencha só para trocar)' : ''}</span><input type="password" value={form.token} onChange={(e) => set('token', e.target.value)} autoComplete="off" /></label>
            {form.kind === 'shared' && (
              <fieldset className="wa-field wa-members">
                <legend>Quem vê e responde</legend>
                {data.users.map((u) => (
                  <label key={u.id} className="wa-check"><input type="checkbox" checked={form.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} /> {u.name}</label>
                ))}
              </fieldset>
            )}
            {editing !== 'new' && <label className="wa-check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Caixa ligada</label>}
            {error && <div className="mc-error" role="alert">{error}</div>}
            <div className="ui-dlg-actions">
              <button type="button" className="ui-btn" onClick={() => (dirty ? setConfirmDiscard(true) : setEditing(null))} disabled={busy}>Voltar</button>
              <Button variant="primary" type="submit" loading={busy}>Salvar</Button>
            </div>
          </form>
        )}
        {error && editing === null && <div className="mc-error" role="alert">{error}</div>}
      </div>
      {confirmDiscard && (
        <ConfirmDiscardModal
          saving={busy}
          onSaveAndExit={async () => { if (await save()) { setConfirmDiscard(false); } }}
          onDiscard={() => { setConfirmDiscard(false); setEditing(null); setForm(blankInbox); setBase(blankInbox); }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
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

function Conversation({ id, enabled, isMobile, onBack, onChanged, onInbox }) {
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
      onInbox(d.conversation.inboxId);
      if (d.conversation.unread > 0) apiPost(`/api/whatsapp/conversations/${id}/read`).then(onChanged).catch(() => {});
    } catch (e) {
      if (!quiet) setError(e.message || 'Não consegui abrir a conversa.');
    }
  }, [id, onChanged, onInbox]);

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
