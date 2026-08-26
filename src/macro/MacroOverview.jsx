// Visão Macro (2026-08, pedido do Rafael) — quadro de cronograma geral pra
// controle interno: junta as atividades de TODAS as empresas da org num só
// feed organizado por data, pra dar pra ver rápido o que está previsto na
// semana sem precisar entrar empresa por empresa. Só leitura, unidirecional
// a partir de `projects.data.activities` (mesma fonte da Tabela). Ver
// PROJECT_CONTEXT.md §23 pro desenho completo.

import React, { useEffect, useState } from 'react';
import { Building2, Columns3, Bug, CalendarDays, LogOut, Home, RefreshCw, AlertTriangle, Clock3 } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { S, BrandLogo, ThemeToggleBtn, NotificationBell, STATUS_META } from '../App.jsx';

const RANGE_OPTIONS = [
  { value: 'current_week', label: 'Semana atual' },
  { value: 'next_week', label: 'Próxima semana' },
  { value: 'next_30', label: 'Próximos 30 dias' },
];

const FULL_WEEKDAY_LABEL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${FULL_WEEKDAY_LABEL[dt.getDay()]} — ${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}`;
}

function urgencyOf(item, todayIso) {
  if (item.status === 'concluido') return null;
  if (item.date < todayIso) return 'atrasado';
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
}) {
  const [range, setRange] = useState('current_week');
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    apiGet(`/api/macro?range=${range}`)
      .then((res) => { if (!cancelled) { setData(res); setLoaded(true); setError(''); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [range]);

  function reload() {
    setLoaded(false);
    apiGet(`/api/macro?range=${range}`)
      .then((res) => { setData(res); setLoaded(true); setError(''); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }

  const groups = [];
  if (data) {
    const byDate = {};
    for (const item of data.items) {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    }
    for (const date of Object.keys(byDate).sort()) groups.push({ date, items: byDate[date] });
  }

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
          <button style={S.iconBtnGhost} title="Atualizar" onClick={reload}><RefreshCw size={14} /></button>
          <NotificationBell
            notifications={notifications} show={showNotifications} onToggle={onToggleNotifications}
            onOpenItem={onOpenNotification} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}
          />
          {onExit && <button style={S.iconBtnGhost} title="Início" onClick={onExit}><Home size={15} /></button>}
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 3, borderRadius: 8, width: 'fit-content', margin: '16px 24px 0' }}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            style={{ ...S.pbGhostBtn, border: 'none', ...(range === opt.value ? { background: S.pbGhostBtnActive.background, color: S.pbGhostBtnActive.color } : {}) }}
            onClick={() => setRange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && <div style={S.loginBlockedMsg}>{error}</div>}

        {loaded && !error && groups.length === 0 && (
          <div style={S.emptyMuted}>Nenhum compromisso previsto nesse período.</div>
        )}

        {data && groups.map((group) => {
          const isPast = group.date < data.today;
          const isToday = group.date === data.today;
          return (
            <div key={group.date}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, marginBottom: 8,
                color: isToday ? '#F5C400' : isPast ? '#e2574c' : 'var(--text-2)',
              }}>
                {fmtDayLabel(group.date)}
                {isToday && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,196,0,.14)', border: '1px solid rgba(245,196,0,.5)' }}>HOJE</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map((item) => {
                  const urgency = urgencyOf(item, data.today);
                  const urgencyMeta = urgency ? URGENCY_META[urgency] : null;
                  const statusMeta = STATUS_META[item.status] || STATUS_META['nao-iniciado'];
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                        background: 'var(--bg-2)', border: `1px solid ${urgencyMeta ? urgencyMeta.border : 'var(--border-1)'}`,
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.companyColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                          {item.company} <span style={{ fontWeight: 500, color: 'var(--text-4)' }}>—</span> {item.title}
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
                      {urgencyMeta && (
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
