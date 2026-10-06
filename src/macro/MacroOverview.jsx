// Visão Geral (antes "Visão Macro"; 2026-08, pedido do Rafael) — quadro de cronograma geral pra
// controle interno: junta as atividades de TODAS as empresas da org num só
// feed organizado por data, pra dar pra ver rápido o que está previsto na
// semana sem precisar entrar empresa por empresa. Só leitura pra fonte dos
// dados (unidirecional a partir de `projects.data.activities`, mesma fonte
// da Tabela), mas o item é clicável e abre o `ActivityDetailModal` de
// verdade (mesmo modal da Tabela, via `onOpenActivity`) — editar ali edita
// a atividade de verdade, reflete em todas as telas que leem o mesmo
// `projects` (é o mesmo estado, mesmo PATCH). Ver PROJECT_CONTEXT.md §23.

import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, RefreshCw, AlertTriangle, Clock3, CalendarDays, CalendarRange, CalendarClock, CalendarOff, Pause, X, CheckCircle2, Search } from 'lucide-react';
import { Chip, ChipRow, Select, Button, EmptyState, SkeletonCards, activate } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { useHistoryValue, readHistoryValue } from '../lib/nav.js';
import { S, BrandLogo, STATUS_META, PRIORITY_META, PRIORITY_ORDER } from '../App.jsx';
import './macro.css';

const RANGE_OPTIONS = [
  { value: 'overdue', label: 'Atrasadas', icon: AlertTriangle, accent: '#e2574c', countKey: 'overdueCount' },
  { value: 'current_week', label: 'Semana atual', icon: CalendarDays, accent: '#F5C400' },
  { value: 'next_week', label: 'Próxima semana', icon: CalendarClock, accent: '#F5C400' },
  { value: 'next_30', label: 'Próximos 30 dias', icon: CalendarRange, accent: '#F5C400' },
  { value: 'no_date', label: 'Sem data', icon: CalendarOff, accent: '#B8BCC8', countKey: 'noDateCount' },
  { value: 'paused', label: 'Pausadas', icon: Pause, accent: '#ff9f40', countKey: 'pausedCount' },
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
  if (diffDays === 1) return 'amanha';
  if (diffDays > 1) return 'proximo';
  return null;
}

const URGENCY_META = {
  atrasado: { label: 'Atrasado', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  hoje: { label: 'Hoje', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  amanha: { label: 'Amanhã', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  proximo: { label: 'Em breve', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
};

export default function MacroOverviewScreen({
  currentUser, onExit, onGoCompany, onGoPersonal, onGoXFlow, onLogout, theme, onToggleTheme,
  notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead,
  onOpenActivity, activityModalOpen,
}) {
  const [range, setRange] = useState(() => readHistoryValue('macroView', 'current_week'));
  useHistoryValue('macroView', range, setRange, 'current_week');
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false); // só tem efeito no celular (no desktop os filtros ficam sempre à vista)
  const periodRef = useRef(null);

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

  // No celular os períodos rolam numa fileira: traz o escolhido (ex.: "Pausadas", ao voltar pelo navegador) para a vista.
  useEffect(() => {
    const el = periodRef.current && periodRef.current.querySelector('[aria-pressed="true"]');
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch { /* sem suporte */ } }
  }, [range]);

  const filteredItems = data ? data.items.filter((item) =>
    (!filterCompany || item.projectId === filterCompany)
    && (!filterResponsible || item.responsible === filterResponsible)
    && (!filterStatus || item.status === filterStatus)
    && (!filterPriority || item.priority === filterPriority)
  ) : [];
  const filtersActive = !!(filterCompany || filterResponsible || filterStatus || filterPriority);
  const filtersCount = [filterCompany, filterResponsible, filterStatus, filterPriority].filter(Boolean).length;
  const clearFilters = () => { setFilterCompany(''); setFilterResponsible(''); setFilterStatus(''); setFilterPriority(''); };

  const groups = [];
  if (data) {
    if (range === 'no_date') {
      // Sem data pra agrupar por dia — uma lista só, sem cabeçalho de dia.
      if (filteredItems.length > 0) groups.push({ date: null, items: filteredItems });
    } else {
      // Pausada pode ter data ou não (uma atividade pausada não passa
      // pela aba Sem data, então precisa do mesmo agrupamento "sem data"
      // aqui dentro pra não sumir do item se ele nunca teve uma data).
      const byDate = {};
      const noDateItems = [];
      for (const item of filteredItems) {
        if (!item.date) { noDateItems.push(item); continue; }
        if (!byDate[item.date]) byDate[item.date] = [];
        byDate[item.date].push(item);
      }
      for (const date of Object.keys(byDate).sort()) groups.push({ date, items: byDate[date] });
      if (noDateItems.length > 0) groups.push({ date: null, items: noDateItems });
    }
  }

  const emptyView = (filtersActive && data && data.items.length > 0)
    ? { icon: Search, title: 'Nenhum resultado com esses filtros', description: 'Tire algum filtro para ver mais atividades.' }
    : range === 'overdue'
      ? { icon: CheckCircle2, tone: 'ok', title: 'Nada atrasado', description: 'Nenhuma atividade atrasada no momento.' }
      : range === 'no_date'
        ? { icon: CalendarOff, title: 'Nenhuma atividade sem data', description: 'Nenhuma atividade sem data no momento.' }
        : range === 'paused'
          ? { icon: Pause, title: 'Nenhuma atividade pausada', description: 'Nenhuma atividade pausada no momento.' }
          : { icon: CalendarDays, title: 'Nenhum compromisso previsto', description: 'Nenhum compromisso previsto nesse período. Troque o período acima para ver outros.' };

  return (
    <div style={S.page}>
      <div className="mac-top" style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'inherit', fontWeight: 800 }}>Visão Geral</h1>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>Todas as empresas, por data</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="mac-ic" title="Atualizar" aria-label="Atualizar" onClick={load}><RefreshCw size={14} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="mac-today mac-pad" style={{ paddingTop: 18 }}>
        <span className="mac-today-l">Hoje</span>
        <span className="mac-today-d">{fmtTodayFull()}</span>
      </div>

      <div className="mac-period mac-pad" style={{ paddingTop: 14 }} ref={periodRef}>
        <ChipRow label="Período">
          {RANGE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value} icon={opt.icon} accent={opt.accent}
              active={range === opt.value}
              count={opt.countKey && data ? data[opt.countKey] : null}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="mac-pad" style={{ paddingTop: 14 }}>
        <Button className="mac-filters-toggle" icon={SlidersHorizontal} aria-expanded={filtersOpen} aria-controls="mac-filters" onClick={() => setFiltersOpen((v) => !v)}>
          Filtros{filtersCount > 0 ? ` (${filtersCount})` : ''}
        </Button>
        <div id="mac-filters" className={`mac-filters${filtersOpen ? ' open' : ''}`}>
          <Select className="mac-sel" aria-label="Filtrar por empresa" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">Todas as empresas</option>
            {data && data.companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <Select className="mac-sel" aria-label="Filtrar por responsável" value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {data && data.responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Select className="mac-sel" aria-label="Filtrar por situação" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
          <Select className="mac-sel" aria-label="Filtrar por prioridade" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">Todas as prioridades</option>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </Select>
          {filtersActive && <Button size="sm" icon={X} onClick={clearFilters}>Limpar filtros</Button>}
        </div>
      </div>

      <div className="mac-pad" style={{ paddingTop: 18, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && <div style={S.loginBlockedMsg}>{error}</div>}

        {!loaded && !error && <SkeletonCards count={4} height={58} />}

        {loaded && !error && groups.length === 0 && (
          <EmptyState icon={emptyView.icon} tone={emptyView.tone} title={emptyView.title} description={emptyView.description}>
            {filtersActive && (
              <Button size="sm" icon={X} onClick={clearFilters}>Limpar filtros</Button>
            )}
          </EmptyState>
        )}

        {data && groups.map((group) => {
          // Pausada não é sobre urgência de data — não faz sentido pintar
          // o cabeçalho de vermelho como se fosse atrasado.
          const isPast = range !== 'paused' && group.date !== null && group.date < data.today;
          const isToday = range !== 'paused' && group.date !== null && group.date === data.today;
          return (
            <section key={group.date === null ? 'no-date' : group.date} aria-label={group.date === null ? 'Sem data definida' : fmtDayLabel(group.date)}>
              <h2 className="mac-day" style={{ margin: '0 0 8px', color: isToday ? 'var(--ui-accent-text)' : isPast ? 'var(--ui-danger)' : 'var(--text-2)' }}>
                {group.date === null ? 'Sem data definida' : fmtDayLabel(group.date)}
                {isToday && <span className="mac-day-badge">HOJE</span>}
              </h2>
              <div className="mac-list">
                {group.items.map((item) => {
                  const urgency = (range === 'overdue' || range === 'no_date' || range === 'paused') ? null : urgencyOf(item, data.today);
                  const urgencyMeta = urgency ? URGENCY_META[urgency] : null;
                  const statusMeta = STATUS_META[item.status] || STATUS_META['nao-iniciado'];
                  const overdueDays = range === 'overdue' ? daysOverdue(item.date, data.today) : 0;
                  return (
                    <div
                      key={item.id}
                      className="mac-card"
                      {...(onOpenActivity ? activate(() => onOpenActivity(item.projectId, item.activityId)) : {})}
                      title={onOpenActivity ? 'Abrir esta atividade' : undefined}
                      style={{
                        border: `1px solid ${range === 'overdue' ? URGENCY_META.atrasado.border : (urgencyMeta ? urgencyMeta.border : 'var(--border-1)')}`,
                        cursor: onOpenActivity ? 'pointer' : 'default',
                      }}
                    >
                      <span className="mac-dots">
                        <span className="mac-dot" style={{ background: item.companyColor }} />
                        {item.priority && (
                          <span className="mac-dot" title={`Prioridade ${PRIORITY_META[item.priority].label}`} style={{ background: PRIORITY_META[item.priority].color }} />
                        )}
                      </span>
                      <div className="mac-main">
                        <div className="mac-title">
                          <span className="mac-co">{item.company}</span><span className="mac-sep"> — </span>
                          {item.time && <span className="mac-time">{item.time} — </span>}
                          {item.title}
                        </div>
                        <div className="mac-meta">
                          {item.phase && (
                            <span style={{ color: item.phaseColor || 'var(--text-5)' }}>{item.phase}</span>
                          )}
                          {item.responsible && <span>{item.responsible}</span>}
                          {item.endDate !== item.date && <span><Clock3 size={11} aria-hidden="true" style={{ verticalAlign: -1 }} /> até {item.endDate.split('-').reverse().join('/')}</span>}
                        </div>
                      </div>
                      <div className="mac-pills">
                        <span className="mac-pill" style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}>
                          {statusMeta.label}
                        </span>
                        {range === 'overdue' ? (
                          <span className="mac-pill" style={{ color: URGENCY_META.atrasado.color, background: URGENCY_META.atrasado.bg, borderColor: URGENCY_META.atrasado.border }}>
                            <AlertTriangle size={11} aria-hidden="true" /> Há {overdueDays} dia{overdueDays === 1 ? '' : 's'}
                          </span>
                        ) : urgencyMeta && (
                          <span className="mac-pill" style={{ color: urgencyMeta.color, background: urgencyMeta.bg, borderColor: urgencyMeta.border }}>
                            <AlertTriangle size={11} aria-hidden="true" /> {urgencyMeta.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
