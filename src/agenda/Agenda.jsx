// Agenda (2026-08, pedido do Rafael) — junta o Google Calendar conectado
// do usuário com o que já é dele dentro do PRICETAX (TASK do XFlow,
// atividade de empresa) numa visão só de dia/semana/mês, com um toggle de
// privacidade pra apresentar disponibilidade sem expor assunto/nome de
// evento (útil numa call com cliente). Unidirecional (só leitura) — ver
// PROJECT_CONTEXT.md §22 pro desenho completo.
//
// Arquivo próprio (não em App.jsx) pelo mesmo motivo do XFlow: bloco de
// UI grande e autocontido, com sua própria lógica de grade de horários.

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Building2, Columns3, LogOut, Link2, Ban, Home } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { S, fmtDate, BrandLogo, ThemeToggleBtn, NotificationBell } from '../App.jsx';

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 21;
const PX_PER_HOUR = 48;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;

const SOURCE_META = {
  google: { label: 'Google Calendar', color: '#5B8DEF' },
  xflow_ticket: { label: 'TASK do XFlow', color: '#b98af5' },
  activity: { label: 'Atividade PRICETAX', color: '#3ecf6e' },
};

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDateOnly(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = startOfDay(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; return addDays(x, diff); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABEL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Encaixa eventos com horário que se sobrepõem lado a lado (algoritmo
// guloso simples — não maximiza largura por cluster isolado, só garante
// que nada fica um em cima do outro; suficiente pro uso real da Agenda).
function packTimedEvents(events) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const laneEnds = [];
  const placed = [];
  for (const ev of sorted) {
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.endMin); } else { laneEnds[lane] = ev.endMin; }
    placed.push({ ...ev, lane });
  }
  const totalLanes = laneEnds.length || 1;
  return placed.map((ev) => ({ ...ev, totalLanes }));
}

function rangeForView(viewMode, anchorDate) {
  if (viewMode === 'day') return { start: startOfDay(anchorDate), end: addDays(startOfDay(anchorDate), 1) };
  if (viewMode === 'month') {
    const first = startOfMonth(anchorDate);
    const last = endOfMonth(anchorDate);
    return { start: startOfWeek(first), end: addDays(startOfWeek(addDays(last, 1)), 0) === startOfWeek(last) ? addDays(startOfWeek(last), 7) : addDays(startOfWeek(last), 7) };
  }
  const start = startOfWeek(anchorDate);
  return { start, end: addDays(start, 7) };
}

function rangeLabel(viewMode, anchorDate) {
  if (viewMode === 'day') return `${WEEKDAY_LABEL[anchorDate.getDay()]}, ${anchorDate.getDate()} de ${MONTH_LABEL[anchorDate.getMonth()]}`;
  if (viewMode === 'month') return `${MONTH_LABEL[anchorDate.getMonth()]} de ${anchorDate.getFullYear()}`;
  const start = startOfWeek(anchorDate);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} de ${MONTH_LABEL[start.getMonth()]} de ${start.getFullYear()}`;
  return `${start.getDate()} de ${MONTH_LABEL[start.getMonth()]} – ${end.getDate()} de ${MONTH_LABEL[end.getMonth()]} de ${end.getFullYear()}`;
}

export default function AgendaScreen({
  currentUser, onExit, onGoCompany, onGoPersonal, onGoXFlow, onLogout, theme, onToggleTheme,
  notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead,
}) {
  const [viewMode, setViewMode] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [hideDetails, setHideDetails] = useState(false);
  const [connected, setConnected] = useState(null);
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  const { start: rangeStart, end: rangeEnd } = useMemo(() => rangeForView(viewMode, anchorDate), [viewMode, anchorDate]);
  const rangeKey = `${isoDateOnly(rangeStart)}_${isoDateOnly(rangeEnd)}`;

  useEffect(() => {
    let cancelled = false;
    function load() {
      apiGet(`/api/agenda?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`)
        .then((res) => { if (!cancelled) { setConnected(res.connected); setEvents(res.events || []); setLoaded(true); setLoadError(''); } })
        .catch((e) => { if (!cancelled) { setLoadError(e.message); setLoaded(true); } });
    }
    load();
    // Sem webhook do Google (exigiria endpoint público + renovação a cada
    // 7 dias) — like 2026-08: poll simples enquanto a tela estiver aberta
    // é o que mantém "sincronizado" sem esse esforço de infra a mais.
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  function goToday() { setAnchorDate(new Date()); }
  function goPrev() {
    if (viewMode === 'day') setAnchorDate((d) => addDays(d, -1));
    else if (viewMode === 'month') setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setAnchorDate((d) => addDays(d, -7));
  }
  function goNext() {
    if (viewMode === 'day') setAnchorDate((d) => addDays(d, 1));
    else if (viewMode === 'month') setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setAnchorDate((d) => addDays(d, 7));
  }

  const daysInView = viewMode === 'day' ? [startOfDay(anchorDate)] : viewMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))
    : Array.from({ length: Math.round((rangeEnd - rangeStart) / 86400000) }, (_, i) => addDays(rangeStart, i));

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const day of daysInView) map[isoDateOnly(day)] = { allDay: [], timed: [] };
    for (const ev of events) {
      const s = new Date(ev.start);
      const key = isoDateOnly(s);
      if (!map[key]) continue;
      if (ev.allDay) map[key].allDay.push(ev);
      else {
        const e = new Date(ev.end);
        map[key].timed.push({ ...ev, startMin: s.getHours() * 60 + s.getMinutes(), endMin: Math.max(e.getHours() * 60 + e.getMinutes(), s.getHours() * 60 + s.getMinutes() + 15) });
      }
    }
    return map;
  }, [events, daysInView]);

  function eventLabel(ev) {
    if (hideDetails) return ev.status === 'cancelled' ? 'Ocupado (cancelado)' : 'Ocupado';
    return ev.status === 'cancelled' ? `${ev.title} (cancelado)` : ev.title;
  }

  function openEvent(ev) {
    if (ev.source === 'xflow_ticket' && ev.link) { window.location.hash = ev.link; return; }
    if (ev.source === 'google' && ev.htmlLink && !hideDetails) { window.open(ev.htmlLink, '_blank', 'noopener'); }
  }

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>Agenda</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name}</div>
          </div>
          {onGoCompany && <button style={S.iconBtnGhost} onClick={onGoCompany}><Building2 size={14} /> Ir para Empresas</button>}
          {onGoPersonal && <button style={S.iconBtnGhost} onClick={onGoPersonal}><Columns3 size={14} /> Ir para Gestão de Atividades</button>}
          {onGoXFlow && <button style={S.iconBtnGhost} onClick={onGoXFlow}><CalendarDays size={14} /> Ir para XFlow</button>}
          {onExit && <button style={S.iconBtnGhost} onClick={onExit}>Sair da Agenda</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={{ ...S.pbGhostBtn, ...(hideDetails ? { background: '#e2574c', color: '#fff', border: '1px solid #e2574c' } : {}) }}
            title="Troca entre ver os títulos reais dos compromissos ou só 'Ocupado' — pra apresentar sua disponibilidade sem expor com quem/sobre o quê"
            onClick={() => setHideDetails((v) => !v)}
          >
            {hideDetails ? <EyeOff size={13} /> : <Eye size={13} />} {hideDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
          </button>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 3, borderRadius: 8 }}>
            <button style={{ ...S.pbGhostBtn, border: 'none', ...(viewMode === 'day' ? S.pbGhostBtnActive : {}) }} onClick={() => setViewMode('day')}>Dia</button>
            <button style={{ ...S.pbGhostBtn, border: 'none', ...(viewMode === 'week' ? S.pbGhostBtnActive : {}) }} onClick={() => setViewMode('week')}>Semana</button>
            <button style={{ ...S.pbGhostBtn, border: 'none', ...(viewMode === 'month' ? S.pbGhostBtnActive : {}) }} onClick={() => setViewMode('month')}>Mês</button>
          </div>
          <NotificationBell
            notifications={notifications} show={showNotifications} onToggle={onToggleNotifications}
            onOpenItem={onOpenNotification} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}
          />
          {onExit && <button style={S.iconBtnGhost} title="Início" onClick={onExit}><Home size={15} /></button>}
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px 0' }}>
        <button style={S.iconBtnGhost} onClick={goPrev}><ChevronLeft size={18} /></button>
        <button style={S.pbGhostBtn} onClick={goToday}>Hoje</button>
        <button style={S.iconBtnGhost} onClick={goNext}><ChevronRight size={18} /></button>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{rangeLabel(viewMode, anchorDate)}</div>
        {loaded && <RefreshCw size={12} style={{ color: 'var(--text-6)', marginLeft: 4 }} />}
      </div>

      <div style={{ padding: '10px 24px 24px' }}>
        {connected === false && (
          <div style={{ ...S.loginBlockedMsg, background: 'rgba(91,141,239,.12)', borderColor: 'rgba(91,141,239,.4)', color: 'var(--text-2)', marginBottom: 14 }}>
            Você ainda não conectou seu Google Calendar — as TASKs e atividades do PRICETAX já aparecem abaixo, mas os compromissos do Google não.{' '}
            <a href="/api/google/oauth/start" style={{ color: '#5B8DEF', fontWeight: 700 }}>Conectar Google Calendar</a>
          </div>
        )}
        {loadError && <div style={S.loginBlockedMsg}>{loadError}</div>}

        {viewMode === 'month' ? (
          <MonthGrid daysInView={daysInView} eventsByDay={eventsByDay} anchorDate={anchorDate} hideDetails={hideDetails} eventLabel={eventLabel} onOpenEvent={openEvent} onPickDay={(d) => { setAnchorDate(d); setViewMode('day'); }} />
        ) : (
          <WeekGrid daysInView={daysInView} eventsByDay={eventsByDay} hideDetails={hideDetails} eventLabel={eventLabel} onOpenEvent={openEvent} />
        )}

        <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(SOURCE_META).map(([key, meta]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-5)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, display: 'inline-block' }} />
              {meta.label}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-6)' }}>
            <Ban size={12} /> Cancelado
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekGrid({ daysInView, eventsByDay, hideDetails, eventLabel, onOpenEvent }) {
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const now = new Date();
  const showNowLine = daysInView.some((d) => isoDateOnly(d) === isoDateOnly(now));
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) - GRID_START_HOUR * 60) / ((GRID_END_HOUR - GRID_START_HOUR) * 60) * GRID_HEIGHT;

  return (
    <div style={{ border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-1)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${daysInView.length}, 1fr)`, borderBottom: '1px solid var(--border-1)' }}>
        <div />
        {daysInView.map((d) => (
          <div key={isoDateOnly(d)} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--border-1)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-5)', fontWeight: 700, textTransform: 'uppercase' }}>{WEEKDAY_LABEL[d.getDay()]}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: isoDateOnly(d) === isoDateOnly(now) ? '#F5C400' : 'var(--text-1)' }}>{d.getDate()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${daysInView.length}, 1fr)`, borderBottom: '1px solid var(--border-1)', minHeight: 32 }}>
        <div style={{ fontSize: 9.5, color: 'var(--text-6)', padding: '4px 6px' }}>Dia todo</div>
        {daysInView.map((d) => (
          <div key={isoDateOnly(d)} style={{ borderLeft: '1px solid var(--border-1)', padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(eventsByDay[isoDateOnly(d)]?.allDay || []).map((ev) => (
              <div
                key={ev.id} onClick={() => onOpenEvent(ev)}
                title={hideDetails ? '' : ev.description}
                style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, cursor: ev.link || ev.htmlLink ? 'pointer' : 'default',
                  background: `${SOURCE_META[ev.source]?.color || '#999'}22`, color: SOURCE_META[ev.source]?.color || 'var(--text-2)',
                  textDecoration: ev.status === 'cancelled' ? 'line-through' : 'none', opacity: ev.status === 'cancelled' ? 0.6 : 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {eventLabel(ev)}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${daysInView.length}, 1fr)`, position: 'relative' }}>
        <div>
          {hours.map((h) => (
            <div key={h} style={{ height: PX_PER_HOUR, fontSize: 10, color: 'var(--text-6)', textAlign: 'right', paddingRight: 6, transform: 'translateY(-6px)' }}>{pad2(h)}:00</div>
          ))}
        </div>
        {daysInView.map((d) => {
          const packed = packTimedEvents(eventsByDay[isoDateOnly(d)]?.timed || []);
          return (
            <div key={isoDateOnly(d)} style={{ position: 'relative', borderLeft: '1px solid var(--border-1)', height: GRID_HEIGHT }}>
              {hours.map((h) => <div key={h} style={{ position: 'absolute', top: (h - GRID_START_HOUR) * PX_PER_HOUR, left: 0, right: 0, borderTop: '1px solid var(--border-1)', height: 0 }} />)}
              {isoDateOnly(d) === isoDateOnly(now) && showNowLine && nowTop >= 0 && nowTop <= GRID_HEIGHT && (
                <div style={{ position: 'absolute', top: nowTop, left: 0, right: 0, borderTop: '2px solid #e2574c', zIndex: 3 }} />
              )}
              {packed.map((ev) => {
                const top = Math.max(0, (ev.startMin - GRID_START_HOUR * 60) / ((GRID_END_HOUR - GRID_START_HOUR) * 60) * GRID_HEIGHT);
                const bottom = Math.min(GRID_HEIGHT, (ev.endMin - GRID_START_HOUR * 60) / ((GRID_END_HOUR - GRID_START_HOUR) * 60) * GRID_HEIGHT);
                const width = 100 / ev.totalLanes;
                return (
                  <div
                    key={ev.id} onClick={() => onOpenEvent(ev)}
                    title={hideDetails ? '' : ev.description}
                    style={{
                      position: 'absolute', top, height: Math.max(16, bottom - top), left: `${ev.lane * width}%`, width: `${width}%`,
                      background: `${SOURCE_META[ev.source]?.color || '#999'}33`, borderLeft: `3px solid ${SOURCE_META[ev.source]?.color || '#999'}`,
                      borderRadius: 4, padding: '2px 5px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden',
                      cursor: ev.link || ev.htmlLink ? 'pointer' : 'default', zIndex: 2,
                      textDecoration: ev.status === 'cancelled' ? 'line-through' : 'none', opacity: ev.status === 'cancelled' ? 0.55 : 1,
                    }}
                  >
                    {eventLabel(ev)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ daysInView, eventsByDay, anchorDate, hideDetails, eventLabel, onOpenEvent, onPickDay }) {
  const currentMonth = anchorDate.getMonth();
  const today = isoDateOnly(new Date());
  const weeks = [];
  for (let i = 0; i < daysInView.length; i += 7) weeks.push(daysInView.slice(i, i + 7));

  return (
    <div style={{ border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-1)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-1)' }}>
        {WEEKDAY_LABEL.map((l) => <div key={l} style={{ padding: '6px 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-5)', textAlign: 'center' }}>{l}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid var(--border-1)' : 'none' }}>
          {week.map((d) => {
            const key = isoDateOnly(d);
            const dayEvents = [...(eventsByDay[key]?.allDay || []), ...(eventsByDay[key]?.timed || [])];
            const dimmed = d.getMonth() !== currentMonth;
            return (
              <div
                key={key} onClick={() => onPickDay(d)}
                style={{ minHeight: 92, borderLeft: '1px solid var(--border-1)', padding: 5, cursor: 'pointer', opacity: dimmed ? 0.4 : 1, background: key === today ? 'rgba(245,196,0,.08)' : 'transparent' }}
              >
                <div style={{ fontSize: 11.5, fontWeight: key === today ? 800 : 600, color: key === today ? '#F5C400' : 'var(--text-2)' }}>{d.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id} onClick={(e) => { e.stopPropagation(); onOpenEvent(ev); }}
                      style={{
                        fontSize: 9.5, fontWeight: 600, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: `${SOURCE_META[ev.source]?.color || '#999'}22`, color: SOURCE_META[ev.source]?.color || 'var(--text-2)',
                        textDecoration: ev.status === 'cancelled' ? 'line-through' : 'none',
                      }}
                    >
                      {eventLabel(ev)}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div style={{ fontSize: 9, color: 'var(--text-6)' }}>+{dayEvents.length - 3} mais</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
