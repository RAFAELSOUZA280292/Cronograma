// Visão Macro (2026-08, pedido do Rafael) — quadro de cronograma geral pra
// controle interno: junta as atividades de TODAS as empresas da org num só
// feed organizado por data, pra dar pra ver rápido o que está previsto na
// semana sem precisar entrar empresa por empresa. Só leitura pra fonte dos
// dados (unidirecional a partir de `projects.data.activities`, mesma fonte
// da Tabela), mas o item é clicável e abre o `ActivityDetailModal` de
// verdade (mesmo modal da Tabela, via `onOpenActivity`) — editar ali edita
// a atividade de verdade, reflete em todas as telas que leem o mesmo
// `projects` (é o mesmo estado, mesmo PATCH). Ver PROJECT_CONTEXT.md §23.

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Columns3, Bug, LogOut, Home, RefreshCw, AlertTriangle, Clock3, CalendarDays, CalendarRange, CalendarClock, CalendarOff, X } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { S, BrandLogo, ThemeToggleBtn, NotificationBell, STATUS_META, PRIORITY_META, PRIORITY_ORDER } from '../App.jsx';

const RANGE_OPTIONS = [
  { value: 'overdue', label: 'Atrasadas', icon: AlertTriangle, accent: '#e2574c', countKey: 'overdueCount' },
  { value: 'current_week', label: 'Semana atual', icon: CalendarDays, accent: '#F5C400' },
  { value: 'next_week', label: 'Próxima semana', icon: CalendarClock, accent: '#F5C400' },
  { value: 'next_30', label: 'Próximos 30 dias', icon: CalendarRange, accent: '#F5C400' },
  { value: 'no_date', label: 'Sem data', icon: CalendarOff, accent: '#B8BCC8', countKey: 'noDateCount' },
];

const FULL_WEEKDAY_LABEL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const FULL_MONTH_LABEL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${FULL_WEEKDAY_LABEL[dt.getDay()]} — ${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}`;
}
function fmtTodayFull() {
  const dt = new Date();
  return `${FULL_WEEKDAY_LABEL[dt.getDay()]}, ${dt.getDate()} de ${FULL_MONTH_LABEL[dt.getMonth()]} de ${dt.getFullYear()}`;
}
function daysOverdue(dateStr, todayIso) {
  return Math.round((new Date(todayIso) - new Date(dateStr)) / 86400000);
}

function urgencyOf(item, todayIso) {
  if (item.status === 'concluido') return null;
  if (item.date === todayIso) return 'hoje';
  const diffDays = Math.round((new Date(item.date) - new Date(todayIso)) / 86400000);
  if (diffDays > 0 && diffDays <= 2) return 'proximo';
  return null;
}

const URGENCY_META = {
  atrasado: { label: 'Atrasado', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  hoje: { label: 'Hoje', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  proximo: { label: 'Em breve', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
};

export default function MacroOverviewScreen({
  currentUser, onExit, onGoCompany, onGoPersonal, onGoXFlow, onLogout, theme, onToggleTheme,
  notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead,
  onOpenActivity, activityModalOpen,
}) {
  const [range, setRange] = useState('current_week');
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  function load() {
    return apiGet(`/api/macro?range=${range}`)
      .then((res) => { setData(res); setLoaded(true); setError(''); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    apiGet(`/api/macro?range=${range}`)
      .then((res) => { if (!cancelled) { setData(res); setLoaded(true); setError(''); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoaded(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Editar uma atividade abre o ActivityDetailModal de verdade (fora dessa
  // tela, montado lá em cima em App.jsx) — quando ele fecha, o snapshot que
  // essa tela já buscou pode ter ficado desatualizado (data/status/fase
  // mudaram), então recarrega sozinho pra refletir o que foi salvo.
  const wasModalOpenRef = useRef(false);
  useEffect(() => {
    if (wasModalOpenRef.current && !activityModalOpen) load();
    wasModalOpenRef.current = !!activityModalOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityModalOpen]);

  const filteredItems = data ? data.items.filter((item) =>
    (!filterCompany || item.projectId === filterCompany)
    && (!filterResponsible || item.responsible === filterResponsible)
    && (!filterStatus || item.status === filterStatus)
    && (!filterPriority || item.priority === filterPriority)
  ) : [];
  const filtersActive = !!(filterCompany || filterResponsible || filterStatus || filterPriority);

  const groups = [];
  if (data) {
    if (range === 'no_date') {
      // Sem data pra agrupar por dia — uma lista só, sem cabeçalho de dia.
      if (filteredItems.length > 0) groups.push({ date: null, items: filteredItems });
    } else {
      const byDate = {};
      for (const item of filteredItems) {
        if (!byDate[item.date]) byDate[item.date] = [];
        byDate[item.date].push(item);
      }
      for (const date of Object.keys(byDate).sort()) groups.push({ date, items: byDate[date] });
    }
  }

  const emptyMessage = (filtersActive && data && data.items.length > 0)
    ? 'Nenhum resultado com esses filtros.'
    : range === 'overdue'
      ? 'Nenhuma atividade atrasada no momento.'
      : range === 'no_date'
        ? 'Nenhuma atividade sem data no momento.'
        : 'Nenhum compromisso previsto nesse período.';

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>Visão Macro</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>Cronograma geral — todas as empresas</div>
          </div>
          {onGoCompany && <button style={S.iconBtnGhost} onClick={onGoCompany}><Building2 size={14} /> Ir para Empresas</button>}
          {onGoPersonal && <button style={S.iconBtnGhost} onClick={onGoPersonal}><Columns3 size={14} /> Ir para Gestão de Atividades</button>}
          {onGoXFlow && <button style={S.iconBtnGhost} onClick={onGoXFlow}><Bug size={14} /> Ir para XFlow</button>}
          {onExit && <button style={S.iconBtnGhost} onClick={onExit}>Sair da Visão Macro</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={S.iconBtnGhost} title="Atualizar" onClick={load}><RefreshCw size={14} /></button>
          <NotificationBell
            notifications={notifications} show={showNotifications} onToggle={onToggleNotifications}
            onOpenItem={onOpenNotification} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}
          />
          {onExit && <button style={S.iconBtnGhost} title="Início" onClick={onExit}><Home size={15} /></button>}
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '18px 24px 0' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Hoje</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#F5C400' }}>{fmtTodayFull()}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 24px 0' }}>
        {RANGE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = range === opt.value;
          const count = opt.countKey && data ? data[opt.countKey] : null;
          return (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                background: active ? opt.accent : 'var(--bg-2)',
                color: active ? '#111' : 'var(--text-2)',
                border: active ? `1px solid ${opt.accent}` : '1px solid var(--border-2)',
              }}
            >
              <Icon size={15} />
              {opt.label}
              {count !== null && count > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: 'center', padding: '1px 6px', borderRadius: 999,
                  background: active ? 'rgba(0,0,0,.22)' : `${opt.accent}2e`,
                  color: active ? '#111' : opt.accent,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '14px 24px 0' }}>
        <select style={S.companyFilterSelect} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
          <option value="">Todas as empresas</option>
          {data && data.companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select style={S.companyFilterSelect} value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {data && data.responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select style={S.companyFilterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select style={S.companyFilterSelect} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">Todas as prioridades</option>
          {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
        {filtersActive && (
          <button
            style={{ ...S.iconBtnGhost, fontSize: 12.5 }}
            onClick={() => { setFilterCompany(''); setFilterResponsible(''); setFilterStatus(''); setFilterPriority(''); }}
          >
            <X size={13} /> Limpar filtros
          </button>
        )}
      </div>

      <div style={{ padding: '18px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && <div style={S.loginBlockedMsg}>{error}</div>}

        {loaded && !error && groups.length === 0 && (
          <div style={S.emptyMuted}>{emptyMessage}</div>
        )}

        {data && groups.map((group) => {
          const isPast = group.date !== null && group.date < data.today;
          const isToday = group.date !== null && group.date === data.today;
          return (
            <div key={group.date === null ? 'no-date' : group.date}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, marginBottom: 8,
                color: isToday ? '#F5C400' : isPast ? '#e2574c' : 'var(--text-2)',
              }}>
                {group.date === null ? 'Sem data definida' : fmtDayLabel(group.date)}
                {isToday && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,196,0,.14)', border: '1px solid rgba(245,196,0,.5)' }}>HOJE</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map((item) => {
                  const urgency = (range === 'overdue' || range === 'no_date') ? null : urgencyOf(item, data.today);
                  const urgencyMeta = urgency ? URGENCY_META[urgency] : null;
                  const statusMeta = STATUS_META[item.status] || STATUS_META['nao-iniciado'];
                  const overdueDays = range === 'overdue' ? daysOverdue(item.date, data.today) : 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onOpenActivity && onOpenActivity(item.projectId, item.activityId)}
                      title="Clique para abrir e editar essa atividade"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                        background: 'var(--bg-2)', border: `1px solid ${range === 'overdue' ? URGENCY_META.atrasado.border : (urgencyMeta ? urgencyMeta.border : 'var(--border-1)')}`,
                        cursor: onOpenActivity ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.companyColor, flexShrink: 0 }} />
                      {item.priority && (
                        <span title={`Prioridade ${PRIORITY_META[item.priority].label}`} style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[item.priority].color, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                          {item.company} <span style={{ fontWeight: 500, color: 'var(--text-4)' }}>—</span>{' '}
                          {item.time && <span style={{ color: '#F5C400' }}>{item.time} — </span>}
                          {item.title}
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 11.5, color: 'var(--text-5)' }}>
                          {item.phase && (
                            <span style={{ color: item.phaseColor || 'var(--text-5)' }}>{item.phase}</span>
                          )}
                          {item.responsible && <span>{item.responsible}</span>}
                          {item.endDate !== item.date && <span><Clock3 size={11} style={{ verticalAlign: -1 }} /> até {item.endDate.split('-').reverse().join('/')}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, whiteSpace: 'nowrap' }}>
                        {statusMeta.label}
                      </span>
                      {range === 'overdue' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: URGENCY_META.atrasado.color, background: URGENCY_META.atrasado.bg, border: `1px solid ${URGENCY_META.atrasado.border}`, whiteSpace: 'nowrap' }}>
                          <AlertTriangle size={11} /> Há {overdueDays} dia{overdueDays === 1 ? '' : 's'}
                        </span>
                      ) : urgencyMeta && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: urgencyMeta.color, background: urgencyMeta.bg, border: `1px solid ${urgencyMeta.border}`, whiteSpace: 'nowrap' }}>
                          <AlertTriangle size={11} /> {urgencyMeta.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
