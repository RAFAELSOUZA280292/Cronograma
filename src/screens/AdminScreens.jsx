// Telas de administração: gestão de usuários, organizações (Super Admin), escolha/cadastro de empresas e perfil.
// Extraído de src/App.jsx (2026-10-16, "dividir o App.jsx"): carregado sob demanda (lazyRetry no App.jsx) para sair do pacote principal.
// O código é o mesmo de antes; o que vem do App.jsx é importado de lá (e lá foi exportado).

import { ArrowLeft, Building2, Check, ChevronDown, Copy, ListTree, Lock, Pause, Pencil, Play, Plus, Search, Trash2, Upload, UserCog, Users, X } from 'lucide-react';
import { BulkOwnersModal, OWNERS_CSS, OwnerBadges, OwnersField, mergeOwners, ownerIdsOf, ownerInitials, principalOf, readCompanyView, saveCompanyView, shortName } from '../companies/CompanyOwners.jsx';
import { Button, ConfirmDialog, SaveStatus, Segmented, Tabs } from '../ui/index.jsx';
import ConnectSection from '../connect/ConnectSection.jsx';
import DailyPrefs from '../daily/DailyPrefs.jsx';
import { DialogOverlay } from '../ui/dialog.jsx';
import PrivacyNotice from '../opsintel/PrivacyNotice.jsx';
import WidgetSection from '../widget/WidgetSection.jsx';
import { apiGet, apiPost, apiPut } from '../lib/api.js';
import { askConfirm, askText, notify } from '../ui/dialogs.jsx';
import { useAutosave } from '../lib/useAutosave.js';
import { useEffect, useMemo, useState } from 'react';
import { useMentionUsers } from '../ui/ComposeBox.jsx';
import { BrandLogo, CLIENT_TYPE_META, CLIENT_TYPE_ORDER, COMPANY_STATUS_META, ConfirmDiscardModal, PHASE_COLORS, ROLE_META, UserAvatar, fmtDate, fmtTs, groupMembers, todayISOStr, useDirtyForm, useIsMobile } from '../App.jsx';
import { S } from '../styles/S.js';

// Fica aqui (e não em crm/crmMeta.js) pra o CSS do CRM não entrar no pacote principal.
const CRM_ROLE_OPTIONS = [
  ['', 'Sem acesso'], ['admin', 'Administrador'], ['diretor', 'Diretor'], ['gestor', 'Gestor Comercial'], ['vendedor', 'Vendedor'],
  ['consultor', 'Consultor'], ['financeiro', 'Financeiro'], ['visualizacao', 'Visualização'],
];

const AVATAR_EMOJIS = [
  '😀', '😎', '🙂', '🤓', '🧐', '😊', '🤝', '💼',
  '🎯', '📊', '📈', '🚀', '⭐', '🔥', '💡', '🎓',
  '🦁', '🐼', '🦊', '🐧', '🐢', '🦉', '🐝', '🐱',
  '☕', '🌵', '🍀', '🎧', '🧩', '🛠️', '🧠', '🏆',
];

function isExpiredNotYetFlagged(user) {
  return !user.blocked && !!user.expiresAt && user.expiresAt < todayISOStr();
}

function projectProgress(p) {
  const activities = (p.activities || []).filter((a) => !a.deleted);
  const total = activities.length;
  const done = activities.filter((a) => a.status === 'concluido').length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function projectNextActivity(p) {
  const today = todayISOStr();
  const pending = (p.activities || []).filter((a) => !a.deleted && a.date && a.status !== 'concluido');
  const upcoming = pending.filter((a) => a.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) return upcoming[0];
  const overdue = pending.slice().sort((a, b) => a.date.localeCompare(b.date));
  return overdue[0] || null;
}

function UserPasswordReset({ onReset }) {
  const [pwd, setPwd] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Nova senha" />
      <button style={S.iconBtn} onClick={() => { if (pwd) { onReset(pwd); setPwd(''); } }}>Redefinir</button>
    </div>
  );
}

const ORG_STATUS_META = {
  active: { label: 'Ativa', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
  suspended: { label: 'Suspensa', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  blocked: { label: 'Bloqueada', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
};

export function SuperAdminScreen({ organizations, error, onClose, closeLabel, onLogout, onCreate, onSetStatus, onEnter, theme, onToggleTheme }) {
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [creating, setCreating] = useState(false);
  const isMobile = useIsMobile();

  async function submitCreate() {
    if (!draftName.trim() || creating) return;
    setCreating(true);
    const org = await onCreate({ name: draftName.trim() });
    setCreating(false);
    if (org) { setDraftName(''); setShowCreate(false); }
  }

  return (
    <div className="page-root t44" style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, button { font-family: 'Inter', sans-serif; }
        input[type=text], select {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:8px 10px; font-size:13px; width:100%;
        }
        input[type=text]:focus, select:focus { outline:none; border-color:#F5C400; }
      `}</style>

      <div style={S.usersHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={S.usersHeaderIcon}><Building2 size={20} color="#F5C400" /></div>
          <div>
            <div style={S.usersHeaderTitle}>Organizações (Super Admin)</div>
            <div style={S.usersHeaderSub}>{organizations.length} organiza{organizations.length === 1 ? 'ção' : 'ções'} na plataforma</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={S.primaryBtn} onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> Nova organização</button>
          {!closeLabel && <button style={S.iconBtn} onClick={onClose}><ArrowLeft size={14} /> Voltar</button>}
        </div>
      </div>

      {error && <div style={{ ...S.fieldHint, color: '#e2574c', padding: '8px 20px' }}>{error}</div>}

      {showCreate && (
        <div style={{ ...S.settingsBlock, margin: '0 20px 16px', maxWidth: 420 }}>
          <div style={S.settingsLabel}>Nome da organização</div>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); }}
            placeholder="Ex: Escritório Contábil XPTO"
            autoFocus
          />
          <div style={S.fieldHint}>O identificador de URL (slug) é gerado automaticamente a partir do nome.</div>
          <button title={creating ? 'Aguarde terminar de criar' : undefined} style={{ ...S.primaryBtn, marginTop: 10 }} onClick={submitCreate} disabled={creating}>
            {creating ? 'Criando...' : 'Criar organização'}
          </button>
        </div>
      )}

      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {organizations.map((org) => {
          const statusMeta = ORG_STATUS_META[org.status] || ORG_STATUS_META.active;
          return (
            <div key={org.id} style={{ ...S.companyCard, ...(isMobile ? S.companyCardMobile : null), borderLeft: `3px solid ${statusMeta.color}` }}>
              <div style={{ ...S.companyCardMain, ...(isMobile ? S.companyCardMainMobile : null) }}>
                <div style={{ ...S.companyCardLogoEmpty, background: org.primaryColor || 'var(--bg-4)' }}><Building2 size={16} color="#111" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.companyCardNameRow}>
                    <div style={S.companyCardName}>{org.displayName || org.name}</div>
                    <span style={{ ...S.companyStatusPillSm, color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}>{statusMeta.label}</span>
                  </div>
                  <div style={S.companyCardCnpj}>/{org.slug} · {org.userCount} usuário{org.userCount === 1 ? '' : 's'} · {org.projectCount} empresa{org.projectCount === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select value={org.status} onChange={(e) => onSetStatus(org.id, e.target.value)} style={{ width: 130 }}>
                  <option value="active">Ativa</option>
                  <option value="suspended">Suspensa</option>
                  <option value="blocked">Bloqueada</option>
                </select>
                <button style={S.iconBtn} onClick={() => onEnter(org)}><Building2 size={14} /> Entrar</button>
              </div>
            </div>
          );
        })}
        {organizations.length === 0 && <div style={S.emptyMuted}>Nenhuma organização carregada ainda.</div>}
      </div>
    </div>
  );
}

const COUNTRY_PT = { Brazil: 'Brasil', 'United States': 'Estados Unidos', Portugal: 'Portugal', Argentina: 'Argentina', Canada: 'Canadá', Germany: 'Alemanha', France: 'França', Spain: 'Espanha', Italy: 'Itália', 'United Kingdom': 'Reino Unido', Paraguay: 'Paraguai', Uruguay: 'Uruguai', Chile: 'Chile', Mexico: 'México' };

function fmtAccessPlace(ev) {
  if (!ev) return '';
  if (!ev.city && !ev.country) return ev.ip ? 'Local não identificado' : '';
  const country = COUNTRY_PT[ev.country] || ev.country;
  const place = [ev.city, ev.region].filter(Boolean).join(', ');
  return country && country !== 'Brasil' ? [place, country].filter(Boolean).join(' · ') : place;
}

const ACCESS_KIND = { login: { label: 'Login', color: '#3ecf6e' }, first_use: { label: 'Primeiro uso do dia', color: '#5B8DEF' }, visit: { label: 'Voltou à sessão', color: 'var(--text-4)' }, login_failed: { label: 'Tentativa falha', color: '#e2574c' } };

function UserAccessHistory({ userId, summary }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    apiGet(`/api/users/${userId}/access`)
      .then((r) => { if (!cancelled) setEvents(Array.isArray(r && r.events) ? r.events : []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [userId]);
  const count = (summary && summary.count) || 0;
  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border-1)' }}>
      <div style={S.subSectionLabel}>Acessos</div>
      <div style={{ ...S.fieldHint, marginBottom: 8 }}>
        {count} acesso{count === 1 ? '' : 's'} registrado{count === 1 ? '' : 's'}
        {summary && summary.failed30d > 0 && <span style={{ color: '#e2574c' }}> · {summary.failed30d} tentativa{summary.failed30d === 1 ? '' : 's'} de login com senha errada nos últimos 30 dias</span>}
      </div>
      {events === null && <div style={S.emptyMuted}>Carregando…</div>}
      {events && events.length === 0 && <div style={S.emptyMuted}>Nenhum acesso registrado ainda. O registro começou a valer a partir da ativação deste recurso.</div>}
      {events && events.map((e) => {
        const meta = ACCESS_KIND[e.kind] || { label: e.kind, color: 'var(--text-4)' };
        return (
          <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--border-1)', fontSize: 12 }}>
            <span style={{ color: meta.color, fontWeight: 700, width: 132, flexShrink: 0 }}>{meta.label}</span>
            <span style={{ color: 'var(--text-3)', width: 118, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtTs(e.at)}</span>
            <span style={{ color: 'var(--text-4)', minWidth: 0, flex: 1 }}>{[fmtAccessPlace(e), e.ip, e.device].filter(Boolean).join(' · ')}</span>
          </div>
        );
      })}
    </div>
  );
}

export function UsersManagementScreen({
  users, access, currentUser, registeredProjects, usersPanelError, organizations,
  onClose, closeLabel, onCreateUser, onUpdateUser, onToggleBlock, onRenew, onResetPassword, onDeleteUser, onToggleCnpj,
  theme, onToggleTheme,
}) {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);
  const isMobile = useIsMobile();

  function requestBlock(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    if (u.blocked) onToggleBlock(id);
    else setConfirmUser({ kind: 'block', user: u, busy: false, error: '' });
  }
  async function runConfirmUser() {
    const { kind, user } = confirmUser;
    setConfirmUser((c) => ({ ...c, busy: true, error: '' }));
    if (kind === 'block') { await onToggleBlock(user.id); setConfirmUser(null); return; }
    const err = await onDeleteUser(user.id);
    if (err) setConfirmUser((c) => ({ ...c, busy: false, error: err }));
    else { setConfirmUser(null); setEditingId(null); }
  }

  const total = users.length;
  const blocked = users.filter((u) => u.blocked).length;
  const active = total - blocked;
  const admins = users.filter((u) => u.role === 'master').length;
  const editingUser = users.find((u) => u.id === editingId) || null;

  const filtered = users.filter((u) => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (filterStatus === 'ativo' && u.blocked) return false;
    if (filterStatus === 'bloqueado' && !u.blocked) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      return (u.name || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="page-root t44" style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:8px 10px; font-size:13px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
      `}</style>

      <div style={S.usersHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={S.usersHeaderIcon}><UserCog size={20} color="#F5C400" /></div>
          <div>
            <div style={S.usersHeaderTitle}>Gestão de Usuários</div>
            <div style={S.usersHeaderSub}>Logado como <strong>{currentUser.username}</strong> · {total} usuário{total === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={S.primaryBtn} onClick={() => setShowCreate(true)}><Plus size={14} /> Novo usuário</button>
          {!closeLabel && <button style={S.iconBtn} onClick={onClose}><ArrowLeft size={14} /> Voltar</button>}
        </div>
      </div>

      <div style={S.usersStatsRow}>
        <div style={S.usersStatCard}>
          <div style={S.usersStatValue}>{total}</div>
          <div style={S.usersStatLabel}>Total</div>
        </div>
        <div style={S.usersStatCard}>
          <div style={{ ...S.usersStatValue, color: '#3ecf6e' }}>{active}</div>
          <div style={S.usersStatLabel}>Ativos</div>
        </div>
        <div style={S.usersStatCard}>
          <div style={{ ...S.usersStatValue, color: '#e2574c' }}>{blocked}</div>
          <div style={S.usersStatLabel}>Bloqueados</div>
        </div>
        <div style={S.usersStatCard}>
          <div style={{ ...S.usersStatValue, color: '#F5C400' }}>{admins}</div>
          <div style={S.usersStatLabel}>Admins</div>
        </div>
      </div>

      <div style={S.usersFilterRow}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, usuário ou e-mail..." style={{ flex: 1 }} />
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ width: 170, flexShrink: 0 }}>
          <option value="all">Todos os perfis</option>
          <option value="master">Master</option>
          <option value="pricetax">PRICETAX</option>
          <option value="cliente">Cliente</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 150, flexShrink: 0 }}>
          <option value="all">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </div>

      {usersPanelError && <div style={{ ...S.loginBlockedMsg, margin: '0 24px 16px 24px' }}>{usersPanelError}</div>}

      <div style={S.usersTableOuter}>
        <div style={S.usersTableWrap}>
          {!isMobile && (
          <div style={S.usersTableHeaderRow}>
            <div style={{ ...S.th, flex: 2 }}>Nome / Usuário</div>
            <div style={{ ...S.th, flex: 2 }}>E-mail</div>
            <div style={{ ...S.th, width: 148 }}>Perfil</div>
            <div style={{ ...S.th, width: 100 }}>Status</div>
            <div style={{ ...S.th, width: 110 }}>Licença até</div>
            <div style={{ ...S.th, width: 190 }}>Último acesso</div>
            <div style={{ ...S.th, width: 56, textAlign: 'right' }}>Acessos</div>
            <div style={{ ...S.th, width: 80, textAlign: 'right' }}>Ações</div>
          </div>
          )}
          {filtered.map((u) => (
            !isMobile ? (
            <div key={u.id} style={S.usersTableRow} onClick={() => setEditingId(u.id)}>
              <div style={{ flex: 2, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar user={u} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={S.usersRowName}>{u.name}</div>
                  <div style={S.usersRowUsername}>{u.username}</div>
                </div>
              </div>
              <div style={S.usersRowEmail}>{u.email || '—'}</div>
              <div style={{ width: 148 }}>
                <span style={{ ...S.roleTag, color: ROLE_META[u.role].color, borderColor: ROLE_META[u.role].color }}>{ROLE_META[u.role].label}</span>
              </div>
              <div style={{ width: 100 }}>
                {u.blocked ? <span style={S.usersStatusBlocked}>Bloqueado</span> : <span style={S.usersStatusActive}>Ativo</span>}
              </div>
              <div style={{ width: 110, fontSize: 12.5, color: isExpiredNotYetFlagged(u) ? '#e2574c' : 'var(--text-3)' }}>
                {u.expiresAt ? fmtDate(u.expiresAt) : 'Sem limite'}
              </div>
              <div style={{ width: 190, minWidth: 0 }}>
                {access && access[u.id] && access[u.id].last ? (
                  <>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{fmtTs(access[u.id].last.at)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={[fmtAccessPlace(access[u.id].last), access[u.id].last.ip, access[u.id].last.device].filter(Boolean).join(' · ')}>
                      {[fmtAccessPlace(access[u.id].last), access[u.id].last.device].filter(Boolean).join(' · ') || access[u.id].last.ip}
                    </div>
                  </>
                ) : <span style={{ fontSize: 12, color: 'var(--text-7)' }}>Sem registro</span>}
              </div>
              <div style={{ width: 56, textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {access && access[u.id] ? access[u.id].count : 0}
                {access && access[u.id] && access[u.id].activeDays > 0 && <div style={{ fontSize: 10.5, color: 'var(--text-6)' }} title="Dias diferentes em que a pessoa usou o painel">{access[u.id].activeDays} dia{access[u.id].activeDays === 1 ? '' : 's'}</div>}
                {access && access[u.id] && access[u.id].failed30d > 0 && <div style={{ fontSize: 10.5, color: '#e2574c' }} title="Tentativas de login com senha errada nos últimos 30 dias">{access[u.id].failed30d} falha{access[u.id].failed30d === 1 ? '' : 's'}</div>}
              </div>
              <div style={{ width: 80, display: 'flex', gap: 2, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button style={S.iconBtnGhost} title="Editar" onClick={() => setEditingId(u.id)}><Pencil size={14} /></button>
                <button
                  style={S.iconBtnGhost}
                  title={u.id === currentUser.id ? 'Você não pode bloquear a si mesmo' : u.blocked ? 'Desbloquear acesso' : 'Bloquear acesso'}
                  aria-label={u.blocked ? 'Desbloquear acesso' : 'Bloquear acesso'}
                  onClick={() => requestBlock(u.id)}
                  disabled={u.id === currentUser.id}
                >
                  {u.blocked ? <Check size={14} color="#3ecf6e" /> : <Lock size={14} color={u.id === currentUser.id ? 'var(--text-8)' : '#e2574c'} />}
                </button>
              </div>
            </div>
            ) : (
            <div key={u.id} style={S.usersMobileRow} onClick={() => setEditingId(u.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar user={u} size={34} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={S.usersRowName}>{u.name}</div>
                  <div style={S.usersRowUsername}>{u.username}</div>
                  <div style={{ ...S.usersRowEmail, marginTop: 2 }}>{u.email || '—'}</div>
                </div>
              </div>
              <div style={S.usersMobileBadgeRow}>
                <span style={{ ...S.roleTag, color: ROLE_META[u.role].color, borderColor: ROLE_META[u.role].color }}>{ROLE_META[u.role].label}</span>
                {u.blocked ? <span style={S.usersStatusBlocked}>Bloqueado</span> : <span style={S.usersStatusActive}>Ativo</span>}
                <span style={{ fontSize: 12, color: isExpiredNotYetFlagged(u) ? '#e2574c' : 'var(--text-5)' }}>
                  {u.expiresAt ? `Até ${fmtDate(u.expiresAt)}` : 'Sem limite'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-6)', marginTop: 6 }}>
                {access && access[u.id] && access[u.id].last
                  ? `Último acesso ${fmtTs(access[u.id].last.at)}${fmtAccessPlace(access[u.id].last) ? ` · ${fmtAccessPlace(access[u.id].last)}` : ''} · ${access[u.id].count} acesso${access[u.id].count === 1 ? '' : 's'}`
                  : 'Sem acesso registrado'}
              </div>
              <div style={S.usersMobileActionsRow} onClick={(e) => e.stopPropagation()}>
                <button style={S.mobileIconBtn} title="Editar" onClick={() => setEditingId(u.id)}><Pencil size={16} /></button>
                <button
                  style={S.mobileIconBtn}
                  title={u.id === currentUser.id ? 'Você não pode bloquear a si mesmo' : u.blocked ? 'Desbloquear acesso' : 'Bloquear acesso'}
                  aria-label={u.blocked ? 'Desbloquear acesso' : 'Bloquear acesso'}
                  onClick={() => requestBlock(u.id)}
                  disabled={u.id === currentUser.id}
                >
                  {u.blocked ? <Check size={16} color="#3ecf6e" /> : <Lock size={16} color={u.id === currentUser.id ? 'var(--text-8)' : '#e2574c'} />}
                </button>
              </div>
            </div>
            )
          ))}
          {filtered.length === 0 && <div style={{ ...S.emptyMuted, padding: 24 }}>Nenhum usuário encontrado.</div>}
        </div>
      </div>

      {showCreate && (
        <NewUserModal
          isSuperAdmin={currentUser.isSuperAdmin}
          organizations={organizations}
          registeredProjects={registeredProjects}
          onCreate={async (draft) => {
            const result = await onCreateUser(draft);
            if (result && result.error) throw new Error(result.error);
            setShowCreate(false);
            if (result && result.crossOrg) {
              notify(`Usuário criado na organização "${result.orgName}".`, { tone: 'success' });
            }
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          accessSummary={access && access[editingUser.id]}
          currentUser={currentUser}
          registeredProjects={registeredProjects}
          onClose={() => setEditingId(null)}
          onUpdate={onUpdateUser}
          onToggleBlock={requestBlock}
          onRenew={onRenew}
          onResetPassword={onResetPassword}
          onToggleCnpj={onToggleCnpj}
          onDelete={(id) => { const u = users.find((x) => x.id === id); if (u) setConfirmUser({ kind: 'delete', user: u, busy: false, error: '' }); }}
        />
      )}

      {confirmUser && confirmUser.kind === 'delete' && (
        <ConfirmDialog
          title={`Desativar ${confirmUser.user.name}?`}
          message={`Isto desativa a conta de "${confirmUser.user.username}": ela é bloqueada, perde a senha, as chaves de API, o widget do iPhone e a conexão com o Google. O histórico e o quadro pessoal ficam, e o login não pode ser reaproveitado.\nPara voltar atrás, use Renovar e depois Redefinir senha.`}
          confirmLabel="Desativar usuário"
          danger
          requireText={confirmUser.user.username}
          busy={confirmUser.busy}
          error={confirmUser.error}
          onConfirm={runConfirmUser}
          onCancel={() => setConfirmUser(null)}
        />
      )}
      {confirmUser && confirmUser.kind === 'block' && (
        <ConfirmDialog
          title={`Bloquear ${confirmUser.user.name}?`}
          message="A pessoa perde o acesso ao painel agora. Dá para desbloquear a qualquer momento; nada é apagado."
          confirmLabel="Bloquear acesso"
          danger
          busy={confirmUser.busy}
          error={confirmUser.error}
          onConfirm={runConfirmUser}
          onCancel={() => setConfirmUser(null)}
        />
      )}
    </div>
  );
}

function NewUserModal({ onCreate, onClose, isSuperAdmin, organizations, registeredProjects }) {
  const [draft, setDraft] = useState({ username: '', password: '', name: '', role: 'cliente', avatar: '', orgId: '', xflowRole: '', companiesAccess: false, allCompaniesAccess: false, allowedCnpjs: [], personalAccess: true });
  const isMobile = useIsMobile();
  const isDirty = useDirtyForm(draft);
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }

  function toggleCnpj(cnpj) {
    setDraft((d) => {
      const has = d.allowedCnpjs.includes(cnpj);
      return { ...d, allowedCnpjs: has ? d.allowedCnpjs.filter((c) => c !== cnpj) : [...d.allowedCnpjs, cnpj] };
    });
  }

  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  async function submit() {
    if (creating) return;
    if (!draft.username.trim() || !draft.password || !draft.name.trim()) { setFormError('Preencha o nome, o usuário (login) e a senha inicial.'); return; }
    setFormError('');
    setCreating(true);
    try { await onCreate(draft); } catch (e) { setFormError(e.message || 'Não foi possível criar o usuário.'); } finally { setCreating(false); }
  }

  return (
    <DialogOverlay style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose}>
      <div className="t44" style={{ ...S.detailBox, width: 'min(440px, 100%)', height: 'auto', maxHeight: '88vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Novo usuário</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>
        <div style={S.subSectionLabel}>Nome</div>
        <input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nome completo" />
        <div style={S.subSectionLabel}>Usuário (login)</div>
        <input type="text" value={draft.username} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} placeholder="Usuário (login)" />
        <div style={S.subSectionLabel}>Perfil</div>
        <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>
          <option value="master">Master</option>
          <option value="pricetax">PRICETAX</option>
          <option value="cliente">Cliente</option>
        </select>
        {isSuperAdmin && (
          <>
            <div style={S.subSectionLabel}>Organização (base)</div>
            <select value={draft.orgId} onChange={(e) => setDraft((d) => ({ ...d, orgId: e.target.value }))}>
              <option value="">Sua organização atual</option>
              {(organizations || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div style={S.fieldHint}>Define a base que esse usuário vai enxergar. Ele não terá acesso a nenhuma outra.</div>
          </>
        )}
        <div style={S.subSectionLabel}>Senha inicial</div>
        <input type="password" value={draft.password} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} placeholder="Senha inicial" />
        <div style={S.subSectionLabel}>Avatar (opcional)</div>
        <AvatarPicker value={draft.avatar} onChange={(avatar) => setDraft((d) => ({ ...d, avatar }))} />
        <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Acesso à Empresas</div>
        <label style={S.cnpjCheckRow}>
          <input type="checkbox" checked={draft.companiesAccess} onChange={(e) => setDraft((d) => ({ ...d, companiesAccess: e.target.checked }))} />
          Liberar acesso a empresas
        </label>
        {draft.companiesAccess && (
          <div style={{ marginLeft: 4, marginTop: 4 }}>
            <label style={S.cnpjCheckRow}>
              <input type="radio" name="newUserCompaniesScope" checked={draft.allCompaniesAccess} onChange={() => setDraft((d) => ({ ...d, allCompaniesAccess: true }))} />
              Todas as empresas
            </label>
            <label style={S.cnpjCheckRow}>
              <input type="radio" name="newUserCompaniesScope" checked={!draft.allCompaniesAccess} onChange={() => setDraft((d) => ({ ...d, allCompaniesAccess: false }))} />
              Empresas específicas
            </label>
            {!draft.allCompaniesAccess && (
              <div style={S.cnpjCheckList}>
                {(registeredProjects || []).length === 0 && <div style={S.emptyMuted}>Nenhuma empresa com CNPJ cadastrado ainda.</div>}
                {(registeredProjects || []).map((p) => (
                  <label key={p.id} style={S.cnpjCheckRow}>
                    <input type="checkbox" checked={draft.allowedCnpjs.includes(p.company.cnpj)} onChange={() => toggleCnpj(p.company.cnpj)} />
                    {p.company.name || 'Sem nome'} <span style={{ opacity: .6 }}>— {p.company.cnpj}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <label style={{ ...S.cnpjCheckRow, marginTop: 14 }}>
          <input type="checkbox" checked={draft.personalAccess} onChange={(e) => setDraft((d) => ({ ...d, personalAccess: e.target.checked }))} />
          Acesso à Gestão de Atividades
        </label>
        <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Acesso ao XFlow</div>
        <select value={draft.xflowRole} onChange={(e) => setDraft((d) => ({ ...d, xflowRole: e.target.value }))}>
          <option value="">Sem acesso</option>
          <option value="reporter">Reporter</option>
          <option value="dev">Dev</option>
          <option value="gestao">Gestão</option>
        </select>
        {formError && <div style={{ ...S.loginBlockedMsg, marginTop: 16, marginBottom: 0 }} role="alert">{formError}</div>}
        <button title={creating ? 'Aguarde terminar de criar' : undefined} style={{ ...S.primaryBtn, marginTop: formError ? 12 : 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={creating}><Plus size={14} /> {creating ? 'Criando...' : 'Criar usuário'}</button>
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={submit}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
        />
      )}
    </DialogOverlay>
  );
}

function EditUserModal({ user: u, accessSummary, currentUser, registeredProjects, onClose, onUpdate, onToggleBlock, onRenew, onResetPassword, onToggleCnpj, onDelete }) {
  const isSelf = u.id === currentUser.id;
  const [draftName, setDraftName] = useState(u.name);
  const [draftUsername, setDraftUsername] = useState(u.username);
  const [draftEmail, setDraftEmail] = useState(u.email);
  const [draftBlockReason, setDraftBlockReason] = useState(u.blockReason || '');
  const isMobile = useIsMobile();

  return (
    <DialogOverlay style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={onClose}>
      <div className="t44" style={{ ...S.detailBox, width: 'min(520px, 100%)', height: 'auto', maxHeight: '88vh', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserAvatar user={u} size={30} />
            <div style={{ fontSize: 17, fontWeight: 800 }}>{u.name}</div>
          </div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Nome</div>
            <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} onBlur={() => draftName !== u.name && onUpdate(u.id, { name: draftName })} placeholder="Nome" />
          </div>
          <div style={{ width: 150, flexShrink: 0 }}>
            <div style={S.subSectionLabel}>Perfil</div>
            <select value={u.role} onChange={(e) => onUpdate(u.id, { role: e.target.value })}>
              <option value="master">Master</option>
              <option value="pricetax">PRICETAX</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        </div>
        <div style={S.subSectionLabel}>Usuário (login)</div>
        <input type="text" value={draftUsername} onChange={(e) => setDraftUsername(e.target.value)} onBlur={() => draftUsername !== u.username && onUpdate(u.id, { username: draftUsername })} placeholder="Usuário (login)" />
        <div style={S.subSectionLabel}>E-mail</div>
        <input type="email" value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} onBlur={() => draftEmail !== u.email && onUpdate(u.id, { email: draftEmail })} placeholder="email@pricetax.com.br" />

        <div style={S.subSectionLabel}>Avatar</div>
        <AvatarPicker value={u.avatar} onChange={(avatar) => onUpdate(u.id, { avatar })} />

        <div style={{ marginTop: 12 }}>
          <div style={S.subSectionLabel}>Acesso à Empresas</div>
          <label style={S.cnpjCheckRow}>
            <input type="checkbox" checked={!!u.companiesAccess} onChange={(e) => onUpdate(u.id, { companiesAccess: e.target.checked })} />
            Liberar acesso a empresas
          </label>
          {u.companiesAccess && (
            <div style={{ marginLeft: 4, marginTop: 4 }}>
              <label style={S.cnpjCheckRow}>
                <input type="radio" name={`companiesScope-${u.id}`} checked={!!u.allCompaniesAccess} onChange={() => onUpdate(u.id, { allCompaniesAccess: true })} />
                Todas as empresas
              </label>
              <label style={S.cnpjCheckRow}>
                <input type="radio" name={`companiesScope-${u.id}`} checked={!u.allCompaniesAccess} onChange={() => onUpdate(u.id, { allCompaniesAccess: false })} />
                Empresas específicas
              </label>
              {!u.allCompaniesAccess && (
                <>
                  {registeredProjects.length === 0 && <div style={S.emptyMuted}>Nenhuma empresa com CNPJ cadastrado ainda.</div>}
                  {registeredProjects.length > 0 && (() => {
                    const allCnpjs = registeredProjects.map((p) => p.company.cnpj).filter(Boolean);
                    const allSelected = allCnpjs.length > 0 && allCnpjs.every((c) => (u.allowedCnpjs || []).includes(c));
                    return (
                      <label style={{ ...S.cnpjCheckRow, fontWeight: 700, borderBottom: '1px solid var(--border-1)', paddingBottom: 6, marginBottom: 4 }}>
                        <input type="checkbox" checked={allSelected} onChange={() => onUpdate(u.id, { allowedCnpjs: allSelected ? [] : allCnpjs })} />
                        Selecionar todas
                      </label>
                    );
                  })()}
                  <div style={S.cnpjCheckList}>
                    {registeredProjects.map((p) => (
                      <label key={p.id} style={S.cnpjCheckRow}>
                        <input type="checkbox" checked={(u.allowedCnpjs || []).includes(p.company.cnpj)} onChange={() => onToggleCnpj(u.id, p.company.cnpj)} />
                        {p.company.name || 'Sem nome'} <span style={{ opacity: .6 }}>— {p.company.cnpj}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={S.cnpjCheckRow}>
            <input type="checkbox" checked={!!u.personalAccess} onChange={(e) => onUpdate(u.id, { personalAccess: e.target.checked })} />
            Acesso à Gestão de Atividades
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={S.subSectionLabel}>Acesso ao XFlow</div>
          <select value={u.xflowRole || ''} onChange={(e) => onUpdate(u.id, { xflowRole: e.target.value })}>
            <option value="">Sem acesso</option>
            <option value="reporter">Reporter</option>
            <option value="dev">Dev</option>
            <option value="gestao">Gestão</option>
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={S.subSectionLabel}>Acesso ao CRM</div>
          <select value={u.crmRole || ''} onChange={(e) => onUpdate(u.id, { crmRole: e.target.value })} disabled={u.role === 'cliente' || u.role === 'master'}>
            {CRM_ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{u.role === 'master' ? 'Administrador (automático — Master)' : (u.role === 'cliente' && v === '' ? 'Sem acesso (usuários cliente nunca acessam)' : l)}</option>)}
          </select>
        </div>

        <div style={S.accessBlock}>
          <div style={S.settingsLabel}>Acesso</div>
          <label style={S.cnpjCheckRow}>
            <input type="checkbox" checked={!!u.blocked} onChange={() => onToggleBlock(u.id)} disabled={isSelf} />
            Bloqueado
          </label>
          {u.blocked && (
            <input type="text" value={draftBlockReason} onChange={(e) => setDraftBlockReason(e.target.value)} onBlur={() => draftBlockReason !== (u.blockReason || '') && onUpdate(u.id, { blockReason: draftBlockReason })} placeholder="Motivo do bloqueio" style={{ marginTop: 6 }} />
          )}
          <div style={{ marginTop: 8 }}>
            <div style={S.fieldHint}>Expira em (opcional — em branco nunca expira)</div>
            <input type="date" value={u.expiresAt || ''} onChange={(e) => onUpdate(u.id, { expiresAt: e.target.value })} />
          </div>
          {isExpiredNotYetFlagged(u) && (
            <div style={S.expireWarning}>
              <strong>Validade vencida em {fmtDate(u.expiresAt)}.</strong> Este usuário vai ser bloqueado sozinho na próxima tentativa de entrar.
              <button style={S.renewBtn} onClick={() => onRenew(u.id, 30)}>Renovar por +30 dias</button>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <div style={S.fieldHint}>Redefinir senha</div>
            <UserPasswordReset onReset={(pwd) => onResetPassword(u.id, pwd)} />
          </div>
        </div>

        <UserAccessHistory userId={u.id} summary={accessSummary} />

        <button title={isSelf ? 'Você não pode excluir o próprio usuário' : undefined} style={{ ...S.iconBtnGhost, marginTop: 14 }} onClick={() => onDelete(u.id)} disabled={isSelf}>
          <Trash2 size={13} color={isSelf ? 'var(--text-8)' : 'var(--text-5)'} /> {isSelf ? ' (é você)' : ' Excluir usuário'}
        </button>
      </div>
    </DialogOverlay>
  );
}

export function MyProfileModal({ user, onClose, onAvatar, googleConnectResult, initialTab, onDailySaved }) {
  const [tab, setTab] = useState(initialTab || 'perfil');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const isMobile = useIsMobile();
  const [tokenAtRisk, setTokenAtRisk] = useState(false);
  const [showTokenGuard, setShowTokenGuard] = useState(false);
  // Avatar e "Meu dia" gravam sozinhos (Onda 4): nada de botão "Salvar" que só grava uma parte da tela.
  const avatarSave = useAutosave({ value: avatar, delay: 250, save: (v) => onAvatar(v) });
  async function requestClose() {
    if (tokenAtRisk) { setShowTokenGuard(true); return; }
    const results = await Promise.all([avatarSave.flush(), dailySave.flush()]);
    if (results.every(Boolean)) onClose();
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  useEffect(() => {
    apiGet('/api/google/status').then(setGoogleStatus).catch(() => setGoogleStatus({ connected: false, configured: false }));
  }, []);
  const [daily, setDaily] = useState(null);
  const [dailySummary, setDailySummary] = useState(null);
  useEffect(() => {
    apiGet('/api/daily/preferences').then((p) => { setDaily({ enabled: p.enabled, cards: p.cards, birthDate: p.birthDate }); setDailySummary(p); }).catch(() => setDaily(null));
  }, []);
  const dailySave = useAutosave({
    value: daily, armed: !!daily, delay: 800,
    validate: (v) => (v && v.birthDate && v.birthDate > new Date().toISOString().slice(0, 10) ? 'A data de nascimento não pode ser no futuro.' : ''),
    save: async (v) => {
      const r = await apiPut('/api/daily/preferences', v);
      setDailySummary(r);
      if (onDailySaved) onDailySaved();
    },
  });
  async function disconnectGoogle() {
    setGoogleBusy(true);
    try {
      await apiPost('/api/google/disconnect');
      setGoogleStatus({ connected: false, connectedAt: null, configured: true });
    } finally { setGoogleBusy(false); }
  }

  async function submitPassword() {
    setPwError('');
    setPwSuccess(false);
    if (!currentPassword || !newPassword) { setPwError('Preencha a senha atual e a nova senha.'); return; }
    if (newPassword.length < 8) { setPwError('A nova senha precisa ter pelo menos 8 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setPwError('A confirmação não confere com a nova senha.'); return; }
    setPwSaving(true);
    try {
      await apiPost('/api/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwSuccess(true);
    } catch (e) { setPwError(e.message); } finally { setPwSaving(false); }
  }

  return (
    <DialogOverlay style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose}>
      <div className="t44" style={{ ...S.detailBox, width: 'min(520px, 100%)', height: 'auto', maxHeight: '90vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Meu perfil</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>

        <div style={S.myProfilePreview}>
          <UserAvatar user={{ ...user, avatar }} size={64} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{user.name}</div>
            <span style={{ ...S.roleTag, color: ROLE_META[user.role].color, borderColor: ROLE_META[user.role].color }}>{ROLE_META[user.role].label}</span>
          </div>
        </div>

        <div style={{ margin: '4px 0 16px' }}>
          <Tabs label="Seções do perfil" active={tab} onChange={setTab} tabs={[
            { id: 'perfil', label: 'Perfil' },
            { id: 'dia', label: 'Meu dia' },
            { id: 'agenda', label: 'Agenda' },
            { id: 'iphone', label: 'iPhone' },
            { id: 'privacidade', label: 'Privacidade' },
            { id: 'conectar', label: 'Integrações (avançado)' },
          ]} />
        </div>

        {tab === 'perfil' && (<>
        <div style={S.subSectionLabel}>Escolha seu avatar</div>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <div style={{ marginTop: 10, minHeight: 18 }}><SaveStatus state={avatarSave.state} savedAt={avatarSave.savedAt} onRetry={avatarSave.retry} /></div>

        <div style={{ ...S.subSectionLabel, marginTop: 26, paddingTop: 20, borderTop: '1px solid var(--border-1)' }}>Trocar senha</div>
        <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Senha atual" />
        <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova senha" style={{ marginTop: 8 }} />
        <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar nova senha" style={{ marginTop: 8 }} />
        {pwError && <div style={{ ...S.loginBlockedMsg, marginTop: 12, marginBottom: 0 }}>{pwError}</div>}
        {pwSuccess && <div style={{ ...S.fieldHint, color: '#3ddc84', marginTop: 8 }}>Senha alterada com sucesso.</div>}
        <button title={pwSaving ? 'Aguarde terminar de salvar' : undefined} style={{ ...S.iconBtn, marginTop: 12, width: '100%', justifyContent: 'center' }} disabled={pwSaving} onClick={submitPassword}>
          {pwSaving ? 'Salvando...' : 'Alterar senha'}
        </button>
        </>)}

        {tab === 'dia' && (
          <>
            <div style={S.subSectionLabel}>O que você quer ver no seu dia</div>
            {!daily ? <div style={S.fieldHint}>Carregando...</div> : (
              <>
                <DailyPrefs value={daily} onChange={setDaily} summary={dailySummary} />
                <div style={{ marginTop: 12, minHeight: 18 }}>
                  <SaveStatus state={dailySave.state} savedAt={dailySave.savedAt} onRetry={dailySave.retry} idleText="Grava sozinho — já aparece na sua tela inicial." />
                  {dailySave.reason && <div style={{ ...S.fieldHint, color: '#ff9f40' }}>{dailySave.reason}</div>}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'agenda' && (<>
        <div style={S.subSectionLabel}>Google Calendar</div>
        {googleConnectResult === 'connected' && <div style={{ ...S.fieldHint, color: '#3ddc84', marginBottom: 8 }}>Conta do Google conectada com sucesso.</div>}
        {googleConnectResult === 'error' && <div style={{ ...S.loginBlockedMsg, marginBottom: 8 }}>Não deu pra conectar sua conta do Google. Tente de novo.</div>}
        {!googleStatus ? (
          <div style={S.fieldHint}>Carregando...</div>
        ) : !googleStatus.configured ? (
          <div style={S.fieldHint}>Integração ainda não configurada nesse ambiente.</div>
        ) : googleStatus.connected ? (
          <>
            <div style={S.fieldHint}>Conectado desde {fmtTs(googleStatus.connectedAt)}. A Previsão de conclusão das suas TASKs no XFlow vira evento no seu Google Calendar automaticamente.</div>
            <button title={googleBusy ? 'Aguarde terminar' : undefined} style={{ ...S.iconBtn, marginTop: 8, width: '100%', justifyContent: 'center' }} disabled={googleBusy} onClick={disconnectGoogle}>
              {googleBusy ? 'Desconectando...' : 'Desconectar Google Calendar'}
            </button>
          </>
        ) : (
          <>
            <div style={S.fieldHint}>Conecte sua conta do Google pra ver a Previsão de conclusão das suas TASKs do XFlow direto na sua agenda.</div>
            <a href="/api/google/oauth/start" style={{ ...S.primaryBtn, marginTop: 8, width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
              Conectar Google Calendar
            </a>
          </>
        )}

        </>)}

        {tab === 'iphone' && <WidgetSection />}
        {tab === 'privacidade' && <PrivacyNotice />}
        <div style={{ display: tab === 'conectar' ? 'block' : 'none' }}><ConnectSection onAtRiskChange={setTokenAtRisk} /></div>
      </div>
      {showTokenGuard && (
        <ConfirmDialog
          title="Fechar sem copiar o token?"
          message="O token que você acabou de gerar só aparece uma vez e se perde ao fechar. Copie o comando do token na aba Integrações (avançado) antes de sair, ou gere outro depois."
          confirmLabel="Fechar mesmo assim"
          cancelLabel="Voltar e copiar"
          danger
          onConfirm={onClose}
          onCancel={() => setShowTokenGuard(false)}
        />
      )}
    </DialogOverlay>
  );
}

function AvatarPicker({ value, onChange }) {
  return (
    <div style={S.avatarPickerGrid}>
      {AVATAR_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          style={{ ...S.avatarPickerBtn, ...(value === e ? S.avatarPickerBtnActive : {}) }}
          onClick={() => onChange(value === e ? '' : e)}
          title={value === e ? 'Remover avatar' : e}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function EditCompanyModal({ project, projects, onClose, onSave }) {
  const c = project.company;
  const staffUsers = useMentionUsers();
  const [form, setForm] = useState({ name: c.name || '', nomeFantasia: c.nomeFantasia || '', color: c.color || PHASE_COLORS[0], logo: c.logo || '', status: c.status || 'ativo', resumeDate: c.resumeDate || '', clientType: c.clientType || '', ownerIds: ownerIdsOf(c), principalOwnerId: principalOf(c) });
  const [saving, setSaving] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState('');
  const isMobile = useIsMobile();
  const isDirty = useDirtyForm(form);
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }

  const isMaster = !!c.isGroupMaster;
  const isChild = !isMaster && !!c.groupId;
  const availableMasters = (projects || []).filter((p) => p.id !== project.id && p.company.isGroupMaster);
  const groupChildren = isMaster ? groupMembers(projects || [], project.id).filter((p) => p.id !== project.id) : [];
  const parentGroup = isChild ? (projects || []).find((p) => p.id === c.groupId) : null;

  function handleLogoPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  }

  async function becomeMaster() {
    const groupName = await askText({ title: 'Transformar em grupo', label: 'Nome do grupo', defaultValue: c.name || form.name || '', confirmLabel: 'Criar grupo', required: false });
    if (groupName === null || saving) return;
    setSaving(true);
    await onSave({ isGroupMaster: true, groupId: '', groupName: groupName.trim() || form.name, structureType: 'grupo' });
    setSaving(false);
    onClose();
  }
  async function linkAsChild() {
    if (!linkTargetId || saving) return;
    setSaving(true);
    await onSave({ isGroupMaster: false, groupId: linkTargetId, structureType: 'grupo' });
    setSaving(false);
    onClose();
  }
  async function unlinkFromGroup() {
    if (saving) return;
    const blocking = parentGroup ? (parentGroup.activities || []).filter((act) => !act.deleted && act.status !== 'concluido' && (act.involvedCompanyIds || []).includes(project.id)) : [];
    if (blocking.length > 0) {
      notify(`Não é possível desvincular: ${blocking.length} atividade${blocking.length === 1 ? '' : 's'} em aberto no grupo ainda envolve${blocking.length === 1 ? '' : 'm'} esta empresa ("${blocking.slice(0, 3).map((act) => act.title).join('", "')}"${blocking.length > 3 ? ', ...' : ''}). Remova a empresa dessas atividades (ou conclua-as) antes de desvincular.`, { tone: 'error' });
      return;
    }
    if (!(await askConfirm({ title: 'Remover vínculo com o grupo?', message: 'Esta empresa deixa de fazer parte do grupo e volta a ser individual.', confirmLabel: 'Remover vínculo', danger: true }))) return;
    setSaving(true);
    await onSave({ isGroupMaster: false, groupId: '', groupName: '', structureType: 'individual' });
    setSaving(false);
    onClose();
  }

  return (
    <DialogOverlay style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif", ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose}>
      <style>{`
        input[type=text], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus { outline:none; border-color:#F5C400; }
      `}</style>
      <div className="t44" style={{ ...S.detailBox, width: 'min(480px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Editar empresa</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>

        <div style={S.subSectionLabel}>CNPJ</div>
        <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 8 }}>{c.cnpj || 'Não informado'} (não editável aqui)</div>

        <div style={S.subSectionLabel}>Razão social</div>
        <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Razão social" />

        <div style={S.subSectionLabel}>Nome fantasia</div>
        <input type="text" value={form.nomeFantasia} onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value }))} placeholder="Nome fantasia" />

        <div style={S.subSectionLabel}>Tipo de cliente</div>
        <select value={form.clientType} onChange={(e) => setForm((f) => ({ ...f, clientType: e.target.value }))}>
          <option value="">Não definido</option>
          {CLIENT_TYPE_ORDER.map((t) => <option key={t} value={t}>{CLIENT_TYPE_META[t].label}</option>)}
        </select>

        {staffUsers.length > 0 && (
          <>
            <style>{OWNERS_CSS}</style>
            <div style={S.subSectionLabel}>Responsáveis (equipe PRICETAX)</div>
            <OwnersField users={staffUsers} value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
          </>
        )}

        <div style={S.subSectionLabel}>Status da empresa</div>
        <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 6 }}>Pausar também arquiva: a empresa some da lista principal e volta em "Pausadas e arquivadas".</div>
        <select value={form.status} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, status: v, resumeDate: v === 'ativo' ? '' : f.resumeDate })); }}>
          <option value="ativo">Ativo</option>
          <option value="pausado">Pausado</option>
        </select>
        {form.status === 'pausado' && (
          <div style={{ marginTop: 8 }}>
            <div style={S.fieldHint}>Previsão de retomada (opcional)</div>
            <input type="date" value={form.resumeDate} onChange={(e) => setForm((f) => ({ ...f, resumeDate: e.target.value }))} />
          </div>
        )}

        <div style={S.subSectionLabel}>Cor master da empresa</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={S.colorInput} />
          <div style={S.fieldHint}>Usada pra identificar essa empresa na visão de várias empresas.</div>
        </div>

        <div style={S.subSectionLabel}>Logotipo</div>
        <div style={S.logoRow}>
          {form.logo ? <img src={form.logo} alt="logo" style={S.logoPreview} /> : <div style={S.logoPreviewEmpty}><Building2 size={22} color="var(--text-7)" /></div>}
          <label style={S.iconBtn}><Upload size={14} /> Enviar logo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoPick} />
          </label>
        </div>

        <div style={{ ...S.subSectionLabel, marginTop: 18 }}>Estrutura</div>
        {isMaster ? (
          <div style={S.fieldHint}>
            Esta empresa é o <strong>CNPJ Master</strong> de um grupo
            {groupChildren.length > 0 ? ` com ${groupChildren.length} empresa${groupChildren.length === 1 ? '' : 's'} vinculada${groupChildren.length === 1 ? '' : 's'}:` : ' (ainda sem filiais vinculadas).'}
            {groupChildren.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {groupChildren.map((ch) => <li key={ch.id}>{ch.company.nomeFantasia || ch.company.name}</li>)}
              </ul>
            )}
          </div>
        ) : isChild ? (
          <>
            <div style={S.fieldHint}>
              Esta empresa é filial do grupo <strong>{(parentGroup && (parentGroup.company.groupName || parentGroup.company.name)) || 'grupo'}</strong>.
            </div>
            <button title={saving ? 'Aguarde terminar de salvar' : undefined} style={{ ...S.iconBtn, marginTop: 8 }} onClick={unlinkFromGroup} disabled={saving}>Remover vínculo com o grupo</button>
          </>
        ) : (
          <>
            <div style={S.fieldHint}>Empresa individual — não faz parte de nenhum grupo.</div>
            <button title={saving ? 'Aguarde terminar de salvar' : undefined} style={{ ...S.iconBtn, marginTop: 8 }} onClick={becomeMaster} disabled={saving}>Transformar em Grupo (Master)</button>
            {availableMasters.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={S.fieldHint}>Ou vincular como filial de um grupo existente:</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)}>
                    <option value="">Selecione o grupo</option>
                    {availableMasters.map((m) => <option key={m.id} value={m.id}>{m.company.groupName || m.company.name}</option>)}
                  </select>
                  <button title={saving ? 'Aguarde terminar de salvar' : !linkTargetId ? 'Escolha o grupo para vincular' : undefined} style={{ ...S.iconBtn, flexShrink: 0 }} onClick={linkAsChild} disabled={saving || !linkTargetId}>Vincular</button>
                </div>
              </div>
            )}
          </>
        )}

        <button title={saving ? 'Aguarde terminar de salvar' : !form.name.trim() ? 'Preencha a razão social para salvar' : undefined} style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={saving || !form.name.trim()}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {!saving && !form.name.trim() && <div style={{ ...S.fieldHint, textAlign: 'center', marginTop: 6 }}>Preencha a razão social para salvar.</div>}
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={form.name.trim() ? submit : undefined}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
          saving={saving}
        />
      )}
    </DialogOverlay>
  );
}

export function CompanySelectorScreen({ projects, initialSelected, onConfirm, onLogout, onCreateNew, onUpdateCompany, onDeleteCompany, onCloneCompany, onGoPersonal, onGoUsers, onGoXFlow, onGoAgenda, onGoHome, onOpenStandardPlan, actingOrg, onSwitchOrg, theme, onToggleTheme, currentUser, onOpenProfile }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [editingProject, setEditingProject] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRegime, setFilterRegime] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [openingStdPlan, setOpeningStdPlan] = useState(false);
  const canStdPlan = !!currentUser && (currentUser.role === 'master' || currentUser.role === 'pricetax');
  // Responsáveis por empresa (2026-10-09): por padrão só as empresas em que EU sou responsável; pausadas ficam arquivadas (ocultas).
  const staffUsers = useMentionUsers();
  const usersById = useMemo(() => new Map(staffUsers.map((u) => [u.id, u.name])), [staffUsers]);
  const canOwners = staffUsers.length > 0 && !!currentUser;
  const myId = currentUser ? currentUser.id : '';
  const mineCount = projects.filter((p) => ownerIdsOf(p.company).includes(myId)).length;
  // Padrão: "Minhas empresas" (ou "Todas" se ainda não sou responsável por nenhuma). Só a escolha EXPLÍCITA do responsável é lembrada;
  // pausadas/arquivadas sempre abrem ocultas.
  const [ownerView, setOwnerViewRaw] = useState(() => { const v = readCompanyView(myId); return (v && v.owner) || (mineCount > 0 ? 'mine' : 'all'); });
  const setOwnerView = (v) => { setOwnerViewRaw(v); saveCompanyView(myId, { owner: v }); };
  const [statusView, setStatusView] = useState('ativas');
  const [bulkOpen, setBulkOpen] = useState(false);
  // A barra do topo só "flutua" (cartão arredondado com sombra) nesta tela — marca o <html> enquanto ela está aberta.
  useEffect(() => { document.documentElement.setAttribute('data-co-sel', '1'); return () => document.documentElement.removeAttribute('data-co-sel'); }, []);
  const isMobile = useIsMobile();

  function toggleGroupExpanded(e, id) {
    e.preventDefault();
    e.stopPropagation();
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggle(id) {
    const p = projects.find((pr) => pr.id === id);
    const groupIds = p && p.company.isGroupMaster ? groupMembers(projects, id).map((m) => m.id) : [id];
    setSelected((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(id);
      if (turningOn) groupIds.forEach((gid) => next.add(gid));
      else groupIds.forEach((gid) => next.delete(gid));
      return next;
    });
  }

  const regimeOptions = Array.from(new Set(projects.map((p) => p.company.regimeTributario).filter(Boolean))).sort();
  const filtersActive = !!(filterType || filterRegime);

  const term = search.trim().toLowerCase();
  const isPausedCo = (c) => (c.status || 'ativo') === 'pausado';
  const ownerMatch = (c) => {
    if (!canOwners || ownerView === 'all') return true;
    const ids = ownerIdsOf(c);
    if (ownerView === 'none') return ids.length === 0;
    return ids.includes(ownerView === 'mine' ? myId : ownerView.slice(2));
  };
  const statusMatch = (c) => statusView === 'todas' || (statusView === 'pausadas' ? isPausedCo(c) : !isPausedCo(c));
  // "matching" = o que combina com a busca/tipo/regime; depois vêm os filtros de responsável e de situação.
  const matching = projects.filter((p) => {
    const c = p.company;
    if (term && ![c.nomeFantasia, c.name, c.cnpj].filter(Boolean).some((v) => v.toLowerCase().includes(term))) return false;
    if (filterType && c.clientType !== filterType) return false;
    if (filterRegime && c.regimeTributario !== filterRegime) return false;
    return true;
  });
  const filteredProjects = matching.filter((p) => ownerMatch(p.company) && statusMatch(p.company));
  const ownedMatching = matching.filter((p) => ownerMatch(p.company));
  const nActive = ownedMatching.filter((p) => !isPausedCo(p.company)).length;
  const nPaused = ownedMatching.filter((p) => isPausedCo(p.company)).length;
  const hiddenPaused = statusView === 'ativas' ? nPaused : 0;
  const hiddenOthers = matching.filter((p) => !ownerMatch(p.company) && statusMatch(p.company)).length;
  const noOwnerCount = projects.filter((p) => ownerIdsOf(p.company).length === 0).length;
  // Faixa "Por responsável": quantas empresas cada pessoa tem, na situação escolhida (mesmos números que a lista mostraria ao clicar).
  const inView = matching.filter((p) => statusMatch(p.company));
  const ownerChips = canOwners ? staffUsers.map((u) => {
    const mine = inView.filter((p) => ownerIdsOf(p.company).includes(u.id));
    return { id: u.id, name: u.name, value: u.id === myId ? 'mine' : `u:${u.id}`, count: mine.length, principal: mine.filter((p) => principalOf(p.company) === u.id).length, me: u.id === myId };
  }).filter((c) => c.count > 0 || c.me || c.value === ownerView).sort((a, b) => (b.me - a.me) || (b.count - a.count) || a.name.localeCompare(b.name, 'pt-BR')) : [];
  const noOwnerInView = inView.filter((p) => ownerIdsOf(p.company).length === 0).length;
  const anyView = !!(term || filtersActive || (canOwners && ownerView !== 'all') || statusView !== 'todas');
  const visibleIds = new Set(filteredProjects.map((p) => p.id));
  const hiddenSelected = [...selected].filter((id) => !visibleIds.has(id)).length;

  function toggleAll() {
    const ids = filteredProjects.map((p) => p.id);
    const allVisibleSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const [deleteTarget, setDeleteTarget] = useState(null);
  function handleDelete(e, p) {
    e.stopPropagation();
    setDeleteTarget(p);
  }

  const allChecked = filteredProjects.length > 0 && filteredProjects.every((p) => selected.has(p.id));

  return (
    <div className="page-root t44 co-sel" style={S.page}>
      {deleteTarget && (
        <ConfirmDialog
          title={`Excluir ${deleteTarget.company.name || 'esta empresa'}?`}
          message="Isto apaga a empresa e todo o cronograma dela (atividades, reuniões, histórico). Fica uma cópia por 1 ano, que só um administrador (Master) recupera em “Empresas excluídas”; links públicos, dossiê e reservas na agenda não voltam."
          confirmLabel="Excluir empresa"
          danger
          requireText={deleteTarget.company.name || 'EXCLUIR'}
          onConfirm={() => { onDeleteCompany(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        select {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px;
        }
        select:focus { outline:none; border-color:#F5C400; }
        input[type=checkbox]{ accent-color:#F5C400; width:18px; height:18px; }
        .company-card-check { flex:0 0 46px; align-self:stretch; display:flex; align-items:center; justify-content:center; border-right:1px solid var(--border-2); margin-right:8px; cursor:pointer; border-radius:12px 0 0 12px; transition:background .12s; }
        .company-card-check:hover { background:var(--bg-4); }
        .company-card-open { flex:1 1 0; min-width:0; display:flex; align-items:center; gap:10px; padding:9px 6px; cursor:pointer; border-radius:10px; }
        .company-card-open:hover { background:var(--bg-4); }
        .company-card-open:hover .company-card-name-t { text-decoration:underline; text-underline-offset:3px; }
        .company-card-open:focus-visible { outline:2px solid #F5C400; outline-offset:1px; }
        @media (max-width: 767px) { .company-card-check { flex-basis:38px; margin-right:4px; } .company-card-open { padding:8px 2px; gap:8px; } }
        .company-card .company-card-actions { opacity: .8; transition: opacity .12s; }
        .company-card:hover .company-card-actions, .company-card:focus-within .company-card-actions { opacity: 1; }
        @media (hover:none) { .company-card .company-card-actions { opacity: 1; } }
        ${OWNERS_CSS}
      `}</style>
      <div style={S.companySelectorWrap}>
        <div style={S.companySelectorHeader}>
          <BrandLogo theme={theme} style={{ ...S.loginLogo, marginBottom: 0 }} />
        </div>
        <h1 style={S.loginTitle}>Quais empresas você quer acompanhar?</h1>
        <p style={S.loginSub}>Clique no nome ou no logotipo para entrar direto na empresa. Para ver várias juntas, marque as caixinhas ao lado e use "Continuar". Dá pra trocar depois clicando em "Trocar empresas".</p>

        {actingOrg && (
          <div style={S.companyActingOrgRow}>
            <Building2 size={13} /> Organização: <strong>{actingOrg.name}</strong>
            {onSwitchOrg && <button style={S.companySwitchOrgBtn} onClick={onSwitchOrg}>Trocar organização</button>}
          </div>
        )}

        {canStdPlan && onOpenStandardPlan && (
          <div style={{ marginBottom: 18 }}>
            <Button onClick={async () => { setOpeningStdPlan(true); try { await onOpenStandardPlan(); } finally { setOpeningStdPlan(false); } }} disabled={openingStdPlan} title={openingStdPlan ? 'Abrindo…' : 'Abrir o cronograma padrão: o modelo que as empresas novas seguem, com versões'}><ListTree size={14} /> {openingStdPlan ? 'Abrindo…' : 'Ver cronograma padrão'}</Button>
          </div>
        )}

        {projects.length === 0 ? (
          <div style={S.companyEmptyState}>
            <div style={S.emptyMuted}>Nenhuma empresa cadastrada ainda.</div>
            <button style={{ ...S.primaryBtn, marginTop: 12 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar empresa</button>
          </div>
        ) : (
          <div style={S.companyPanel}>
            {projects.length > 6 && (
              <div style={S.companySearchWrap}>
                <Search size={14} color="var(--text-6)" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou CNPJ..."
                  style={S.companySearchInput}
                />
              </div>
            )}
            {projects.length > 1 && canOwners && (
              <div className="cview">
                {(ownerChips.length > 0 || noOwnerInView > 0 || ownerView !== 'all') && (
                  <div className="own-strip" role="group" aria-label="Quantas empresas cada pessoa tem">
                    <span className="own-strip-l">Por responsável</span>
                    <div className="own-strip-chips">
                      <button type="button" className={`own-chip${ownerView === 'all' ? ' on' : ''}`} aria-pressed={ownerView === 'all'} onClick={() => setOwnerView('all')} title="Todas as empresas, de todos os responsáveis">
                        <b>Todos</b><span className="own-n">{inView.length}</span>
                      </button>
                      {ownerChips.map((c) => (
                        <button key={c.id} type="button" className={`own-chip${ownerView === c.value ? ' on' : ''}`} aria-pressed={ownerView === c.value}
                          onClick={() => setOwnerView(ownerView === c.value ? 'all' : c.value)}
                          title={`${c.name}: ${c.count} ${c.count === 1 ? 'empresa' : 'empresas'} (${c.principal} como principal, ${c.count - c.principal} em que também acompanha)`}>
                          <span className="own-av" aria-hidden="true">{ownerInitials(c.name)}</span>
                          <b>{c.me ? 'Eu' : shortName(c.name)}</b><span className="own-n">{c.count}</span>
                          {c.principal > 0 && c.principal !== c.count && <em className="own-p">★ {c.principal}</em>}
                        </button>
                      ))}
                      {(noOwnerInView > 0 || ownerView === 'none') && (
                        <button type="button" className={`own-chip warn${ownerView === 'none' ? ' on' : ''}`} aria-pressed={ownerView === 'none'} onClick={() => setOwnerView(ownerView === 'none' ? 'all' : 'none')} title="Empresas que ainda não têm responsável">
                          <b>Sem responsável</b><span className="own-n">{noOwnerInView}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <Segmented label="Situação das empresas" value={statusView} onChange={setStatusView} options={[
                  { value: 'ativas', label: `Em andamento (${nActive})` },
                  { value: 'pausadas', label: `Pausadas e arquivadas (${nPaused})` },
                  { value: 'todas', label: `Todas (${nActive + nPaused})` },
                ]} />
              </div>
            )}
            {projects.length > 1 && !canOwners && (
              <div className="cview">
                <Segmented label="Situação das empresas" value={statusView} onChange={setStatusView} options={[
                  { value: 'ativas', label: `Em andamento (${nActive})` },
                  { value: 'pausadas', label: `Pausadas (${nPaused})` },
                  { value: 'todas', label: `Todas (${nActive + nPaused})` },
                ]} />
              </div>
            )}
            {(hiddenPaused > 0 || hiddenOthers > 0) && (
              <p className="cview-note">
                <span>Ocultas:</span>
                {hiddenPaused > 0 && <span>{hiddenPaused} {hiddenPaused === 1 ? 'pausada/arquivada' : 'pausadas/arquivadas'}</span>}
                {hiddenPaused > 0 && hiddenOthers > 0 && <span>·</span>}
                {hiddenOthers > 0 && <span>{hiddenOthers} de outros responsáveis</span>}
                {hiddenPaused > 0 && <button type="button" onClick={() => setStatusView('todas')}>Ver pausadas</button>}
                {hiddenOthers > 0 && <button type="button" onClick={() => setOwnerView('all')}>Ver de todos</button>}
              </p>
            )}
            {projects.length > 1 && (
              <div style={S.companyFilterRow}>
                <select style={S.companyFilterSelect} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">Todos os tipos</option>
                  {CLIENT_TYPE_ORDER.map((t) => <option key={t} value={t}>{CLIENT_TYPE_META[t].label}</option>)}
                </select>
                {regimeOptions.length > 0 && (
                  <select style={S.companyFilterSelect} value={filterRegime} onChange={(e) => setFilterRegime(e.target.value)}>
                    <option value="">Todos os regimes</option>
                    {regimeOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                {filtersActive && (
                  <button style={S.filterClearBtn} onClick={() => { setFilterType(''); setFilterRegime(''); }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <label style={S.companySelectAllRow}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                {anyView ? `Selecionar todas as exibidas (${filteredProjects.length})` : `Selecionar todas (${projects.length})`}
              </label>
              {canOwners && selected.size > 0 && (
                <Button size="sm" icon={Users} onClick={() => setBulkOpen(true)}>Definir responsáveis ({selected.size})</Button>
              )}
            </div>
            {filteredProjects.length === 0 && (
              <div style={S.emptyMuted}>
                {term ? `Nenhuma empresa encontrada para "${search}" com os filtros atuais.`
                  : (canOwners && ownerView === 'mine' && mineCount === 0) ? 'Você ainda não é responsável por nenhuma empresa.'
                    : statusView === 'pausadas' ? 'Nenhuma empresa pausada ou arquivada.'
                      : 'Nenhuma empresa encontrada para os filtros selecionados.'}
                {(canOwners && ownerView !== 'all') && <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => { setOwnerView('all'); setStatusView('todas'); }}>Ver todas as empresas</Button></div>}
              </div>
            )}
            <div style={S.companyList}>
              {filteredProjects.map((p) => {
                const isSelected = selected.has(p.id);
                const accent = p.company.color || '#F5C400';
                const progress = projectProgress(p);
                const next = projectNextActivity(p);
                const nextOverdue = next && next.date < todayISOStr();
                const donutCircumference = 2 * Math.PI * 13;
                const isPaused = (p.company.status || 'ativo') === 'pausado';
                const cardName = p.company.nomeFantasia || p.company.name || 'Empresa sem nome';
                const openCard = () => onConfirm(p.company.isGroupMaster ? groupMembers(projects, p.id).map((m) => m.id) : [p.id]);
                return (
                  <div key={p.id} className="company-card" style={{ ...S.companyCard, ...(isMobile ? S.companyCardMobile : null), borderLeft: `3px solid ${isPaused ? COMPANY_STATUS_META.pausado.color : isSelected ? accent : 'var(--border-2)'}`, ...(isPaused ? { opacity: .78 } : {}) }}>
                    <div style={{ ...S.companyCardMain, ...(isMobile ? S.companyCardMainMobile : null), padding: 0, cursor: 'default', gap: 0 }}>
                      <label className="company-card-check" title="Marcar para abrir várias empresas juntas (use Continuar)">
                        <input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} aria-label={`Selecionar ${cardName}`} />
                      </label>
                      <div
                        className="company-card-open"
                        role="link"
                        tabIndex={0}
                        aria-label={p.company.isGroupMaster ? `Abrir o grupo ${cardName}` : `Abrir ${cardName}`}
                        title={p.company.isGroupMaster ? 'Clique para entrar no grupo (todas as empresas vinculadas)' : 'Clique para entrar nesta empresa'}
                        onClick={openCard}
                        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openCard(); } }}
                      >
                      {p.company.logo ? <img src={p.company.logo} alt="" style={S.companyCardLogo} /> : <div style={{ ...S.companyCardLogoEmpty, background: p.company.color || 'var(--bg-4)' }}><Building2 size={16} color="#111" /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.companyCardNameRow}>
                          <div className="company-card-name-t" style={S.companyCardName}>
                            {cardName}
                          </div>
                          {p.company.isGroupMaster && (
                            <button
                              type="button"
                              onClick={(e) => toggleGroupExpanded(e, p.id)}
                              style={{ ...S.companyStatusPillSm, color: '#9b7af5', background: 'rgba(155,122,245,.14)', borderColor: 'rgba(155,122,245,.5)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            >
                              Grupo · {groupMembers(projects, p.id).length} empresa{groupMembers(projects, p.id).length === 1 ? '' : 's'}
                              <ChevronDown size={11} style={{ transform: expandedGroups.has(p.id) ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} />
                            </button>
                          )}
                          {p.company.clientType && CLIENT_TYPE_META[p.company.clientType] && (
                            <span style={{ ...S.companyStatusPillSm, color: CLIENT_TYPE_META[p.company.clientType].color, background: CLIENT_TYPE_META[p.company.clientType].bg, borderColor: CLIENT_TYPE_META[p.company.clientType].border }}>{CLIENT_TYPE_META[p.company.clientType].short}</span>
                          )}
                          {isPaused && (
                            <span
                              style={{ ...S.companyStatusPillSm, display: 'inline-flex', alignItems: 'center', gap: 3, color: COMPANY_STATUS_META.pausado.color, background: COMPANY_STATUS_META.pausado.bg, borderColor: COMPANY_STATUS_META.pausado.border }}
                              title={p.company.resumeDate ? `Previsão de retomada: ${fmtDate(p.company.resumeDate)}` : 'Projeto pausado'}
                            >
                              <Pause size={9} /> Pausado{p.company.resumeDate ? ` · ${fmtDate(p.company.resumeDate)}` : ''}
                            </span>
                          )}
                        </div>
                        {p.company.nomeFantasia && p.company.name && p.company.nomeFantasia !== p.company.name && (
                          <div style={S.companyCardSecondary}>{p.company.name}</div>
                        )}
                        <div style={S.companyCardCnpj}>
                          {p.company.cnpj || 'CNPJ não informado'}
                          {p.company.regimeTributario ? ` · ${p.company.regimeTributario}` : ''}
                        </div>
                        {canOwners && <div style={{ marginTop: 4 }}><OwnerBadges company={p.company} usersById={usersById} onEdit={() => setEditingProject(p)} /></div>}
                        {p.company.isGroupMaster && expandedGroups.has(p.id) && (
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: 'var(--text-5)' }}>
                            {groupMembers(projects, p.id).filter((m) => m.id !== p.id).map((m) => (
                              <li key={m.id}>{m.company.nomeFantasia || m.company.name || 'Empresa sem nome'}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      </div>
                    </div>
                    <div style={{ ...S.companyCardProgress, ...(isMobile ? S.companyCardProgressMobile : null) }}>
                      <div style={S.companyCardDonutWrap}>
                        <svg viewBox="0 0 32 32" width="46" height="46">
                          <circle cx="16" cy="16" r="13" fill="none" stroke="var(--border-1)" strokeWidth="4" />
                          <circle
                            cx="16" cy="16" r="13" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"
                            strokeDasharray={donutCircumference}
                            strokeDashoffset={donutCircumference * (1 - progress.pct / 100)}
                            transform="rotate(-90 16 16)"
                          />
                        </svg>
                        <div style={S.companyCardDonutLabel}>{progress.pct}%</div>
                      </div>
                      <div style={S.companyCardProgressText}>
                        <div style={S.companyCardProgressNum}>{progress.done}/{progress.total}</div>
                        atividades
                      </div>
                    </div>
                    <div style={{ ...S.companyCardNext, ...(isMobile ? S.companyCardNextMobile : null) }}>
                      <div style={S.companyCardNextLabel}>Próxima atividade</div>
                      {next ? (
                        <>
                          <div style={S.companyCardNextTitle} title={next.title}>{next.title}</div>
                          <div style={{ ...S.companyCardNextDate, color: nextOverdue ? '#e2574c' : 'var(--text-5)' }}>
                            {fmtDate(next.date)}{nextOverdue ? ' · atrasada' : ''}
                          </div>
                        </>
                      ) : (
                        <div style={{ ...S.companyCardNextDate, color: 'var(--text-6)', marginTop: 2 }}>Nenhuma pendente</div>
                      )}
                    </div>
                    <div className={isMobile ? undefined : 'company-card-actions'} style={{ ...S.companyCardActions, ...(isMobile ? S.companyCardActionsMobile : null) }}>
                      <button
                        style={{ ...S.iconBtnGhost, ...(isPaused ? { color: COMPANY_STATUS_META.ativo.color } : { color: COMPANY_STATUS_META.pausado.color }) }}
                        title={isPaused ? 'Retomar projeto (1 clique) — reativa as atividades pausadas e volta para a lista' : 'Pausar e arquivar (1 clique) — pausa as atividades em andamento e esconde a empresa desta lista'}
                        aria-label={isPaused ? 'Retomar projeto' : 'Pausar e arquivar projeto'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isPaused) setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
                          onUpdateCompany(p.id, isPaused ? { status: 'ativo', resumeDate: '' } : { status: 'pausado' });
                        }}
                      >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button style={S.iconBtnGhost} title="Clonar atividades para uma nova empresa" onClick={(e) => { e.stopPropagation(); onCloneCompany(p); }}><Copy size={14} /></button>
                      <button style={S.iconBtnGhost} title="Editar empresa" onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}><Pencil size={14} /></button>
                      {onDeleteCompany && <button style={S.iconBtnGhost} title="Excluir empresa" onClick={(e) => handleDelete(e, p)}><Trash2 size={14} color="#e2574c" /></button>}
                    </div>
                    <span style={{ ...S.companyColorDot, background: accent }} />
                  </div>
                );
              })}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 12 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar nova empresa</button>
          </div>
        )}

        {projects.length > 0 && hiddenSelected > 0 && (
          <div className="cview-note" style={{ width: 'min(1240px, 96%)', justifyContent: 'center', marginTop: 10, marginBottom: 0 }}>{hiddenSelected} {hiddenSelected === 1 ? 'empresa selecionada está' : 'empresas selecionadas estão'} fora do filtro atual e entra{hiddenSelected === 1 ? '' : 'm'} em "Continuar".</div>
        )}
        {projects.length > 0 && (
          <button title={selected.size === 0 ? 'Selecione ao menos uma empresa para continuar' : undefined} style={{ ...S.primaryBtn, marginTop: 16, width: 'min(1240px, 96%)', justifyContent: 'center' }} disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
            Continuar {selected.size > 0 ? `(${selected.size} selecionada${selected.size === 1 ? '' : 's'})` : ''}
          </button>
        )}
      </div>

      {editingProject && (
        <EditCompanyModal
          project={editingProject}
          projects={projects}
          onClose={() => setEditingProject(null)}
          onSave={async (patch) => onUpdateCompany(editingProject.id, patch)}
        />
      )}
      {bulkOpen && (
        <BulkOwnersModal
          users={staffUsers}
          count={selected.size}
          onClose={() => setBulkOpen(false)}
          onApply={async (val, mode) => {
            const ids = [...selected];
            ids.forEach((id) => { const pr = projects.find((x) => x.id === id); if (pr) onUpdateCompany(id, mergeOwners(pr.company, val, mode)); });
            notify(`Responsáveis ${mode === 'replace' ? 'substituídos' : 'adicionados'} em ${ids.length} ${ids.length === 1 ? 'empresa' : 'empresas'}.`, { tone: 'success' });
          }}
        />
      )}
    </div>
  );
}
