// Agenda (2026-08, pedido do Rafael) — junta o Google Calendar conectado
// do usuário com o que já é dele dentro do PRICETAX (TASK do XFlow,
// atividade de empresa) numa visão só de dia/semana/mês, com um toggle de
// privacidade pra apresentar disponibilidade sem expor assunto/nome de
// evento (útil numa call com cliente). Leitura + (Onda 5, §81) criar compromisso
// no Google e responder convite; desde 2026-11-02 também editar, cancelar, Meet, participantes e propor horário (EventDetail.jsx),
// sem precisar abrir o Google Agenda — ver PROJECT_CONTEXT.md §22 pro desenho completo.
//
// Arquivo próprio (não em App.jsx) pelo mesmo motivo do XFlow: bloco de
// UI grande e autocontido, com sua própria lógica de grade de horários.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Link2, Ban, AlertTriangle, Plus, Menu, Search, X } from 'lucide-react';
import { Segmented, Callout, BusyBar, Button, activate } from '../ui/index.jsx';
import { apiGet, apiPatch, apiPut } from '../lib/api.js';
import AgendaSidebar from './AgendaSidebar.jsx';
import { TaskModal, AwayModal, TaskDetail, TeamEventDetail, SearchResults } from './AgendaExtras.jsx';
import BookingDialog from './BookingDialog.jsx';
import { rsvpOf, isPendingRsvp, RSVP_META, summarizeDay, fmtDur, hhmm, CAL_SOURCES } from './dayLoad.js';
import { layoutTopRow, timedSegments, layoutDay, eventsPerDay, hm } from './weekLayout.js';
import { inkOn } from '../lib/inkOn.js';
import AccountsDialog from './AccountsDialog.jsx';
import { findConflicts } from '../../shared/agendaConflicts.js';
import { notify } from '../ui/dialogs.jsx';
import { loadPrefs } from './agendaPrefs.js';
import NewEventModal, { defaultSlot } from './NewEventModal.jsx';
import EventDetailModal from './EventDetail.jsx';
import { useRespond, takeAgendaOpen } from './agendaActions.js';
import { BrandLogo } from '../App.jsx';
import { S } from '../styles/S.js';
import { useHistoryValue, readHistoryValue } from '../lib/nav.js';
import './agenda.css';

// Grade de 0h a 24h (como o Google), aberta rolada nas 7h; o cabeçalho com os dias e a linha "Dia todo" ficam fixos no topo.
const PX_PER_HOUR = 48;
const GRID_HEIGHT = 24 * PX_PER_HOUR;
const TOP_ROW_PX = 22;

const SOURCE_META = {
  google: { label: 'Google Calendar', color: '#5B8DEF' },
  xflow_ticket: { label: 'TASK do XFlow', color: '#b98af5' },
  activity: { label: 'Atividade PRICETAX', color: '#3ecf6e' },
  crm_activity: { label: 'Atividade do CRM', color: '#F5C400' },
  gtask: { label: 'Tarefa do Google', color: '#4285F4' },
};

// Cor do compromisso: a da agenda de origem (§128, cada conta tem a sua) ou a da origem no painel (TASK, atividade, CRM).
// (Até 02/11/2026 era `ev.color || colorOf(ev)`: chamava a si mesma em todo item sem cor própria — TASK, atividade, CRM — e travava a página.)
// Cores sugeridas para as agendas (além delas, "Outra cor…" aceita qualquer uma).
const PICK_COLORS = ['#5B8DEF', '#039BE5', '#3F51B5', '#7986CB', '#8E24AA', '#D50000', '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#0B8043', '#795548', '#616161'];
const NOT_MINE = new Set(['team', 'gtask']); // agenda de colega e tarefa não contam como compromisso seu (choque, "livre")
const colorOf = (ev) => ev.color || (SOURCE_META[ev.source] && SOURCE_META[ev.source].color) || '#999';

// Agendas escondidas pelo filtro rápido (só neste aparelho; "Mostrar na Agenda" em Minhas agendas vale em todo lugar).
const HIDDEN_KEY = 'agenda-hidden-accounts';
function loadHidden() { try { return new Set(JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); } }
function saveHidden(set) { try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* sem localStorage: vale só nesta visita */ } }
// O que aparece na grade: convites sem resposta/talvez e recusados (lembrado neste aparelho).
const SHOW_KEY = 'agenda-show-rsvp';
const SIDE_KEY = 'agenda-side-open';
function loadSide() { try { const v = window.localStorage.getItem(SIDE_KEY); return v === null ? !isMobileNow() : v === '1'; } catch { return !isMobileNow(); } }
function loadShow() { try { return { pending: true, declined: true, ...JSON.parse(window.localStorage.getItem(SHOW_KEY) || '{}') }; } catch { return { pending: true, declined: true }; } }
function saveShow(v) { try { window.localStorage.setItem(SHOW_KEY, JSON.stringify(v)); } catch { /* vale só nesta visita */ } }

// Volta do login de outra conta (Google/Microsoft): o servidor redireciona para /agenda#agenda-account-…
const ACCOUNT_HASH = {
  'agenda-account-connected': ['Agenda conectada. Escolha a cor e o nome dela em Minhas agendas.', 'success'],
  'agenda-account-error': ['Não foi possível conectar a agenda. Tente de novo.', 'error'],
  'agenda-account-principal': ['Essa conta já é a sua agenda principal do Google.', 'info'],
  'agenda-account-limit': ['Você já tem o máximo de agendas extras.', 'error'],
  'agenda-account-admin': ['A empresa dessa conta exige a aprovação do administrador da Microsoft para liberar o painel. Peça a ele o consentimento (o Rafael tem o link).', 'error'],
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

// Celular = abaixo de 768 px (mesmo corte do CSS). Decide o que muda de ESTRUTURA (lista em vez de grade); o resto é só CSS.
const MOBILE_QUERY = '(max-width: 767px)';
function isMobileNow() {
  try { return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches; } catch { return false; }
}
function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileNow);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(MOBILE_QUERY); } catch { return undefined; }
    const on = () => setMobile(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  return mobile;
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
  const isMobile = useIsMobile();
  // No celular a semana de 7 colunas é ilegível: a visão padrão é o Dia (Semana e Mês continuam à mão, com rolagem dentro da grade).
  const defaultView = useState(() => (isMobileNow() ? 'day' : 'week'))[0];
  const [viewMode, setViewMode] = useState(() => readHistoryValue('agendaView', defaultView));
  useHistoryValue('agendaView', viewMode, setViewMode, defaultView);
  const [dayLayout, setDayLayout] = useState('list'); // celular, visão Dia: 'list' (cartões) ou 'grid' (horários)
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [hideDetails, setHideDetails] = useState(false);
  const [show, setShow] = useState(loadShow);
  const toggleShow = (k) => setShow((cur) => { const next = { ...cur, [k]: !cur[k] }; saveShow(next); return next; });
  const [connected, setConnected] = useState(null);
  const [events, setEvents] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showAccounts, setShowAccounts] = useState(false);
  const [hidden, setHidden] = useState(loadHidden);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [newEvent, setNewEvent] = useState(null); // { date, time } enquanto o "Novo compromisso" está aberto
  const [detailId, setDetailId] = useState(null);
  const [editing, setEditing] = useState(null); // detalhe do evento enquanto o "Editar compromisso" está aberto
  const [sideOpen, setSideOpen] = useState(loadSide);
  const [team, setTeam] = useState([]);
  const [teamStatus, setTeamStatus] = useState([]);
  const [withPeople, setWithPeople] = useState([]); // "Reunião com…": [{ email, name, color }]
  const [withEvents, setWithEvents] = useState([]);
  const [withStatus, setWithStatus] = useState([]);
  const [creating, setCreating] = useState(null); // 'task' | 'away'
  const [showBooking, setShowBooking] = useState(false);
  const [taskOpen, setTaskOpen] = useState(null);
  const [teamOpen, setTeamOpen] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [search, setSearch] = useState(null); // { q, results, loading, error }
  const { respond, respondingId } = useRespond((id, myResponse) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, myResponse } : e))));

  useEffect(() => {
    const key = String(window.location.hash || '').replace(/^#/, '');
    if (!ACCOUNT_HASH[key]) return;
    const [msg, tone] = ACCOUNT_HASH[key];
    notify(msg, { tone });
    if (key === 'agenda-account-connected') setShowAccounts(true);
    try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); } catch { /* ignora */ }
  }, []);
  function toggleHidden(id) {
    setHidden((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); saveHidden(next); return next; });
  }

  // "Ver na agenda" vindo da Caixa de e-mail: abre no dia do evento, com o detalhe aberto.
  useEffect(() => {
    const go = () => {
      const want = takeAgendaOpen();
      if (!want) return;
      if (want.start && !Number.isNaN(Date.parse(want.start))) setAnchorDate(new Date(want.start));
      setDetailId(want.id);
    };
    go();
    window.addEventListener('pt-agenda-open', go); // pedido vindo com a Agenda já aberta (aviso do sino, §139)
    return () => window.removeEventListener('pt-agenda-open', go);
  }, []);

  const { start: rangeStart, end: rangeEnd } = useMemo(() => rangeForView(viewMode, anchorDate), [viewMode, anchorDate]);
  const rangeKey = `${isoDateOnly(rangeStart)}_${isoDateOnly(rangeEnd)}`;

  useEffect(() => {
    let cancelled = false;
    function load() {
      // Prazo também na tela: se o servidor não responder em 40 s, mostra o aviso (a próxima tentativa sai em 60 s) em vez de girar para sempre.
      const slow = new Promise((_, rej) => setTimeout(() => rej(new Error('A agenda demorou demais para responder. Vou tentar de novo em 1 minuto; se continuar, avise o Rafael.')), 40000));
      Promise.race([apiGet(`/api/agenda?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`), slow])
        .then((res) => { if (!cancelled) { setConnected(res.connected); setEvents(res.events || []); setAccounts(res.accounts || []); setWarnings(res.warnings || []); if (res.team) { setTeam(res.team.subscriptions || []); setTeamStatus(res.team.calendars || []); } setLoaded(true); setLoadError(''); } })
        .catch((e) => { if (!cancelled) { setLoadError(e.message); setLoaded(true); } });
    }
    load();
    // Sem webhook do Google (exigiria endpoint público + renovação a cada
    // 7 dias) — like 2026-08: poll simples enquanto a tela estiver aberta
    // é o que mantém "sincronizado" sem esse esforço de infra a mais.
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, reloadTick]);

  // "Reunião com…": traz a agenda das pessoas escolhidas para a grade (some ao tirar as pessoas).
  const withKey = withPeople.map((p) => p.email).join(',');
  useEffect(() => {
    if (!withKey) { setWithEvents([]); setWithStatus([]); return undefined; }
    let alive = true;
    apiGet(`/api/agenda/with?emails=${encodeURIComponent(withKey)}&start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`)
      .then((r) => { if (!alive) return; const colorBy = Object.fromEntries(withPeople.map((p) => [p.email, p.color])); const nameBy = Object.fromEntries(withPeople.map((p) => [p.email, p.name])); setWithEvents((r.events || []).map((e) => ({ ...e, id: `with-${e.id}`, color: colorBy[e.owner] || e.color, accountLabel: nameBy[e.owner] || e.accountLabel }))); setWithStatus(r.calendars || []); })
      .catch((e) => { if (alive) { setWithEvents([]); notify((e && e.message) || 'Não consegui ler a agenda dessas pessoas.', { tone: 'error' }); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withKey, rangeKey]);
  function changeWith(list) {
    const used = new Set(list.filter((p) => p.color).map((p) => p.color));
    const free = ['#E67C73', '#8E24AA', '#0B8043', '#F4511E', '#3F51B5', '#795548'].filter((c) => !used.has(c));
    setWithPeople(list.map((p) => (p.color ? p : { ...p, color: free.shift() || '#616161' })));
  }
  function toggleSide() { setSideOpen((v) => { try { window.localStorage.setItem(SIDE_KEY, v ? '0' : '1'); } catch { /* vale nesta visita */ } return !v; }); }
  async function changeTeam(list) {
    setTeam(list);
    try { const r = await apiPut('/api/agenda/team', { subscriptions: list }); setTeam(r.subscriptions || []); setReloadTick((n) => n + 1); } catch (e) { notify((e && e.message) || 'Não foi possível salvar as agendas.', { tone: 'error' }); setReloadTick((n) => n + 1); }
  }
  async function changeAccountColor(a, color) {
    setAccounts((list) => list.map((x) => (x.id === a.id ? { ...x, color } : x)));
    setEvents((list) => list.map((e) => (e.account === a.id && !e.colorId ? { ...e, color } : e)));
    try { await apiPatch(a.id === 'principal' ? '/api/agenda/accounts/principal' : `/api/agenda/accounts/${encodeURIComponent(a.id)}`, { color }); } catch (e) { notify((e && e.message) || 'Não foi possível salvar a cor.', { tone: 'error' }); setReloadTick((n) => n + 1); }
  }
  function onCreate(kind) {
    if (kind === 'event') setNewEvent(defaultSlot());
    else setCreating(kind);
  }
  async function runSearch(e) {
    e.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) return;
    setSearch({ q, results: [], loading: true, error: '' });
    try { const r = await apiGet(`/api/agenda/search?q=${encodeURIComponent(q)}`); setSearch({ q, results: r.events || [], loading: false, error: '' }); } catch (err) { setSearch({ q, results: [], loading: false, error: (err && err.message) || 'Não consegui buscar agora.' }); }
  }
  function openSearchResult(ev) {
    setSearch(null);
    if (ev.start) setAnchorDate(new Date(String(ev.start).length === 10 ? `${ev.start}T12:00:00` : ev.start));
    if (viewMode === 'month') setViewMode('week');
    setDetailId(ev.id);
  }

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

  const visibleEvents = useMemo(() => [
    ...events.filter((e) => !e.account || !hidden.has(e.account)),
    ...withEvents.filter((w) => !events.some((e) => e.source === 'team' && e.owner === w.owner)),
  ], [events, hidden, withEvents]);
  const myEvents = useMemo(() => visibleEvents.filter((e) => !NOT_MINE.has(e.source)), [visibleEvents]);
  // Compromissos seus que se sobrepõem (em qualquer agenda sua; agenda de colega e tarefa não contam).
  const conflicts = useMemo(() => findConflicts(myEvents), [myEvents]);
  // Na grade, a bolinha vermelha só marca choque de verdade: compromisso aceito com outro aceito (convite sem resposta não conta).
  const hasClash = (ev) => rsvpOf(ev) === 'accepted' && (conflicts.get(ev.id) || []).some((o) => rsvpOf(o) === 'accepted');
  const writableAccounts = accounts.filter((a) => !a.readOnly && a.status !== 'error' && (a.id !== 'principal' || a.connected));
  const extraConnected = accounts.some((a) => a.id !== 'principal');

  // O que a grade desenha: sem as agendas escondidas e, se a pessoa pediu, sem os convites sem resposta e/ou recusados.
  const shownEvents = useMemo(() => visibleEvents.filter((ev) => {
    const r = rsvpOf(ev);
    if (!show.declined && r === 'declined') return false;
    if (!show.pending && isPendingRsvp(r)) return false;
    return true;
  }), [visibleEvents, show]);
  const eventsByDay = useMemo(() => Object.fromEntries(eventsPerDay(shownEvents, daysInView)), [shownEvents, daysInView]);

  // Resumo do dia (aceitos, tempo ocupado, livre) — só com eventos com horário; recusados/pendentes não ocupam.
  const prefs = useMemo(() => loadPrefs(), []);
  const dayStats = useMemo(() => {
    const out = {};
    for (const day of daysInView) {
      const key = isoDateOnly(day);
      const list = myEvents.filter((e) => !e.allDay && isoDateOnly(new Date(e.start)) === key).map((e) => ({ ...e, startDate: new Date(e.start), endDate: new Date(e.end) }));
      if (list.length) out[key] = summarizeDay(list, key, { start: prefs.workStart, end: prefs.workEnd, lunchStart: prefs.lunchStart, lunchEnd: prefs.lunchEnd });
    }
    return out;
  }, [myEvents, daysInView, prefs]);

  // Título na grade (sem "?" ou "✕": a resposta aparece no desenho do bloco, como no Google) e o texto para leitor de tela.
  function eventLabel(ev) {
    if (hideDetails) return ev.status === 'cancelled' ? 'Ocupado (cancelado)' : 'Ocupado';
    if (ev.source === 'gtask') return `${ev.done ? '☑' : '☐'} ${ev.title || '(sem título)'}`;
    return ev.title || '(sem título)';
  }
  function eventAria(ev) {
    const r = rsvpOf(ev);
    const extra = [ev.status === 'cancelled' && 'cancelado', isPendingRsvp(r) && (r === 'tentative' ? 'talvez' : 'sem resposta'), r === 'declined' && 'recusado', !hideDetails && hasClash(ev) && 'choca com outro compromisso'].filter(Boolean);
    return `${eventLabel(ev)}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  }
  // Dica ao passar o mouse: resposta ao convite + descrição.
  function eventTip(ev) {
    if (hideDetails) return '';
    const r = rsvpOf(ev);
    const head = CAL_SOURCES.has(ev.source) && ev.source !== 'ical' ? `${RSVP_META[r].label}${r === 'accepted' && ev.myResponse === 'organizer' ? ' (evento seu)' : ''}${ev.organizer ? ` · convite de ${ev.organizer}` : ''}` : '';
    const clash = (conflicts.get(ev.id) || []).map((o) => `⚠ Choca com: ${o.title}${o.accountLabel ? ` (${o.accountLabel})` : ''}`);
    return [ev.accountLabel ? `Agenda: ${ev.accountLabel}` : '', head, ...clash, ev.description].filter(Boolean).join('\n');
  }

  function openEvent(ev) {
    if (ev.source === 'xflow_ticket' && ev.link) { window.location.hash = ev.link; return; }
    if (ev.source === 'gtask' && !hideDetails) { setTaskOpen(ev); return; }
    if (ev.source === 'team' && !hideDetails) { setTeamOpen(ev); return; }
    if (CAL_SOURCES.has(ev.source) && !hideDetails) setDetailId(ev.id);
  }

  function pickSlot(day, minutes) {
    setNewEvent({ date: isoDateOnly(day), time: `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}` });
  }
  const detailEv = detailId ? events.find((e) => e.id === detailId) : null;

  return (
    <div style={S.page}>
      <div className="agd-top" style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>Agenda</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name}</div>
          </div>
        </div>
        <div className="agd-actions">
          <div className="agd-showgrp" role="group" aria-label="Mostrar na grade">
            <span className="agd-showlbl">Mostrar:</span>
            <button type="button" className={`agd-tog${show.pending ? ' on' : ''}`} aria-pressed={show.pending} onClick={() => toggleShow('pending')} title="Convites que você ainda não respondeu ou marcou como talvez (aparecem com contorno)">
              Sem resposta
            </button>
            <button type="button" className={`agd-tog${show.declined ? ' on' : ''}`} aria-pressed={show.declined} onClick={() => toggleShow('declined')} title="Convites que você recusou (aparecem riscados)">
              Recusados
            </button>
          </div>
          <button
            type="button" className={`agd-tog${hideDetails ? ' hide' : ''}`}
            title="Troca entre ver os títulos reais dos compromissos ou só 'Ocupado' — pra apresentar sua disponibilidade sem expor com quem/sobre o quê"
            onClick={() => setHideDetails((v) => !v)}
          >
            {hideDetails ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />} {hideDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
          </button>
          <div className="agd-seg">
            <Segmented
              label="Visualização da agenda" value={viewMode} onChange={setViewMode}
              options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]}
            />
          </div>
          {!sideOpen && <Button className="agd-new" variant="primary" icon={Plus} onClick={() => setNewEvent(defaultSlot())}>Novo compromisso</Button>}
        </div>
      </div>

      <div className="agd-nav">
        <button type="button" className="agd-ic" aria-label={sideOpen ? 'Esconder o menu da agenda' : 'Mostrar o menu da agenda'} title={sideOpen ? 'Esconder o menu' : 'Menu: criar, mini-calendário, reunião com, agendas'} aria-expanded={sideOpen} onClick={toggleSide}><Menu size={18} aria-hidden="true" /></button>
        <button type="button" className="agd-ic" aria-label="Período anterior" title="Período anterior" onClick={goPrev}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="agd-tog agd-today" onClick={goToday}>Hoje</button>
        <button type="button" className="agd-ic" aria-label="Próximo período" title="Próximo período" onClick={goNext}><ChevronRight size={18} aria-hidden="true" /></button>
        <div className="agd-nav-label" aria-live="polite">{rangeLabel(viewMode, anchorDate)}</div>
        {loaded && <RefreshCw size={12} aria-hidden="true" style={{ color: 'var(--text-6)', marginLeft: 4 }} />}
        <form className="agd-searchbox" role="search" onSubmit={runSearch}>
          <Search size={15} aria-hidden="true" />
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar na agenda" aria-label="Buscar compromissos na agenda" maxLength={120} />
          {searchQ && <button type="button" className="agd-ic" aria-label="Limpar a busca" title="Limpar" onClick={() => { setSearchQ(''); setSearch(null); }}><X size={14} aria-hidden="true" /></button>}
        </form>
      </div>
      <div className="agd-pad" style={{ paddingTop: 10 }}><BusyBar active={!loaded} /></div>

      <div className={`agd-body${sideOpen ? ' side-open' : ''}`}>
      {sideOpen && (
        <AgendaSidebar
          anchorDate={anchorDate} rangeStart={rangeStart} rangeEnd={rangeEnd}
          onPickDate={(d) => { setAnchorDate(d); setSearch(null); if (isMobile) setSideOpen(false); }}
          onCreate={onCreate} accounts={accounts} hidden={hidden} onToggleAccount={toggleHidden} onAccountColor={changeAccountColor} onManageAccounts={() => setShowAccounts(true)}
          team={team} teamStatus={[...teamStatus, ...withStatus]} onTeamChange={changeTeam} withPeople={withPeople} onWithChange={changeWith}
          onScheduleWith={() => setNewEvent({ ...defaultSlot(), guests: withPeople.map((p) => p.email) })} colors={PICK_COLORS} onBooking={() => setShowBooking(true)}
        />
      )}
      <div className="agd-main" style={{ paddingTop: 10, paddingBottom: 24 }}>
        {isMobile && viewMode === 'day' && (
          <div className="agd-mob-only" style={{ marginBottom: 10 }}>
            <Segmented
              label="Como ver o dia" value={dayLayout} onChange={setDayLayout}
              options={[{ value: 'list', label: 'Lista' }, { value: 'grid', label: 'Horários' }]}
            />
          </div>
        )}
        {accounts.length > 1 && !sideOpen && (
          <div className="agd-filter" role="group" aria-label="Agendas mostradas">
            {accounts.map((a) => {
              const off = hidden.has(a.id) || a.calendarEnabled === false;
              return (
                <button
                  key={a.id} type="button" className={`agd-fchip${off ? ' off' : ''}${a.status === 'error' ? ' err' : ''}`} aria-pressed={!off}
                  title={a.status === 'error' ? `${a.label}: ${a.error}` : a.calendarEnabled === false ? `${a.label}: desligada em Minhas agendas` : `${off ? 'Mostrar' : 'Esconder'} ${a.label}`}
                  onClick={() => (a.calendarEnabled === false ? setShowAccounts(true) : toggleHidden(a.id))}
                >
                  <span className="agd-acc-dot" style={{ background: a.color }} aria-hidden="true" />{a.label}{a.status === 'error' ? ' ⚠' : ''}
                </button>
              );
            })}
          </div>
        )}
        {connected === false && !extraConnected && (
          <div style={{ marginBottom: 14 }}>
            <Callout
              tone="info" icon={Link2} title="Seu Google Calendar ainda não está conectado"
              action={<a className="ui-btn primary sm" href="/api/google/oauth/start">Conectar Google Calendar</a>}
            >
              As TASKs e atividades do PRICETAX já aparecem abaixo, mas os compromissos do Google não.
            </Callout>
          </div>
        )}
        {loadError && <div style={{ marginBottom: 14 }}><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar a agenda">{loadError}</Callout></div>}
        {!loadError && warnings.length > 0 && <div style={{ marginBottom: 14 }}><Callout tone="warn" icon={AlertTriangle} title="Parte da agenda não carregou">{warnings.join(' ')}</Callout></div>}
        {loaded && !loadError && events.length === 0 && (
          <div style={{ marginBottom: 14 }}>
            <Callout icon={CalendarDays} title="Nenhum compromisso neste período">Use as setas para ver outra semana ou troque a visualização.</Callout>
          </div>
        )}

        {search ? (
          <SearchResults q={search.q} results={search.results} loading={search.loading} error={search.error} onBack={() => setSearch(null)} onOpen={openSearchResult} />
        ) : viewMode === 'month' ? (
          <MonthGrid daysInView={daysInView} eventsByDay={eventsByDay} anchorDate={anchorDate} hideDetails={hideDetails} eventLabel={eventLabel} eventTip={eventTip} onOpenEvent={openEvent} onPickDay={(d) => { setAnchorDate(d); setViewMode('day'); }} />
        ) : isMobile && viewMode === 'day' && dayLayout === 'list' ? (
          <DayList day={daysInView[0]} eventsByDay={eventsByDay} dayStats={dayStats} hideDetails={hideDetails} eventLabel={eventLabel} eventAria={eventAria} onOpenEvent={openEvent} />
        ) : (
          <WeekGrid daysInView={daysInView} events={shownEvents} dayStats={dayStats} hideDetails={hideDetails} hasClash={hasClash} eventLabel={eventLabel} eventAria={eventAria} eventTip={eventTip} onOpenEvent={openEvent} onPickSlot={pickSlot} />
        )}

        {!search && viewMode !== 'month' && !(isMobile && viewMode === 'day' && dayLayout === 'list') && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-5)' }}>Dica: {isMobile ? 'toque' : 'clique'} num horário livre da grade para criar um compromisso nele.</div>}

        <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(SOURCE_META).filter(([key]) => key !== 'google' || accounts.length <= 1).map(([key, meta]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-5)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, display: 'inline-block' }} />
              {meta.label}
            </div>
          ))}
          <div className="agd-leg"><span className="agd-sw" style={{ background: '#5B8DEF' }} /> Aceito</div>
          <div className="agd-leg"><span className="agd-sw" style={{ border: '1.5px solid #5B8DEF', background: 'var(--bg-1)' }} /> Sem resposta / talvez</div>
          <div className="agd-leg" style={{ opacity: 0.7 }}><span className="agd-sw" style={{ border: '1.5px solid #5B8DEF', background: 'var(--bg-1)' }} /> <s>Recusado</s></div>
          <div className="agd-leg"><Ban size={12} aria-hidden="true" /> Cancelado</div>
          <div className="agd-leg"><span className="agd-clash-dot" aria-hidden="true" /> Choca com outro compromisso</div>
        </div>
      </div>
      </div>

      {showBooking && <BookingDialog onClose={() => setShowBooking(false)} />}
      {creating === 'task' && <TaskModal initialDate={isoDateOnly(anchorDate)} onClose={() => setCreating(null)} onDone={() => { setCreating(null); setReloadTick((n) => n + 1); }} />}
      {creating === 'away' && <AwayModal initialDate={isoDateOnly(anchorDate)} onClose={() => setCreating(null)} onDone={() => { setCreating(null); setReloadTick((n) => n + 1); }} />}
      {taskOpen && <TaskDetail task={taskOpen} onClose={() => setTaskOpen(null)} onChanged={() => setReloadTick((n) => n + 1)} />}
      {teamOpen && <TeamEventDetail ev={teamOpen} onClose={() => setTeamOpen(null)} onSchedule={(email) => { setTeamOpen(null); setNewEvent({ ...defaultSlot(), guests: [email] }); }} />}
      {newEvent && (
        <NewEventModal
          initial={newEvent} connected={connected} accounts={writableAccounts} events={visibleEvents} onClose={() => setNewEvent(null)}
          onCreated={() => { setNewEvent(null); setReloadTick((n) => n + 1); }}
        />
      )}
      {detailId && !editing && (
        <EventDetailModal
          key={detailId} id={detailId} initial={detailEv} conflicts={detailEv ? conflicts.get(detailEv.id) : null} onClose={() => setDetailId(null)} onRespond={respond} respondBusy={respondingId === detailId}
          onEdit={(ev) => setEditing(ev)} onChanged={() => setReloadTick((n) => n + 1)}
        />
      )}
      {showAccounts && <AccountsDialog onClose={() => setShowAccounts(false)} onChanged={() => setReloadTick((n) => n + 1)} />}
      {editing && (
        <NewEventModal
          event={editing} connected={connected} accounts={writableAccounts} events={visibleEvents} onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); setReloadTick((n) => n + 1); }}
        />
      )}
    </div>
  );
}

// Só o que abre algo vira botão para teclado/leitor de tela (TASK do XFlow com link; compromisso do Google com detalhes visíveis).
function openable(ev, hideDetails) {
  return (ev.source === 'xflow_ticket' && !!ev.link) || ((CAL_SOURCES.has(ev.source) || NOT_MINE.has(ev.source)) && !hideDetails);
}

// Desenho do bloco como no Google: aceito = cheio na cor da agenda (texto preto ou branco conforme o fundo); sem resposta/talvez =
// contorno na cor, fundo da tela; recusado = contorno, apagado e riscado; cancelado = riscado.
function blockStyle(ev) {
  const c = colorOf(ev);
  const r = rsvpOf(ev);
  if (r === 'declined') return { background: 'var(--bg-1)', border: `1px solid ${c}`, color: 'var(--text-3)', opacity: 0.6, textDecoration: 'line-through' };
  if (ev.source === 'gtask') return { background: 'var(--bg-1)', border: `1.5px solid ${c}`, color: 'var(--text-1)', ...(ev.done ? { opacity: 0.6, textDecoration: 'line-through' } : {}) };
  if (isPendingRsvp(r)) return { background: 'var(--bg-1)', border: `1.5px solid ${c}`, color: 'var(--text-1)' };
  return { background: c, border: `1px solid ${c}`, color: inkOn(c), ...(ev.status === 'cancelled' ? { opacity: 0.55, textDecoration: 'line-through' } : {}) };
}

function WeekGrid({ daysInView, events, dayStats, hideDetails, hasClash, eventLabel, eventAria, eventTip, onOpenEvent, onPickSlot }) {
  const scrollRef = useRef(null);
  const cols = `56px repeat(${daysInView.length}, minmax(0, 1fr))`;
  const now = new Date();
  const todayKey = isoDateOnly(now);
  const top = useMemo(() => layoutTopRow(events, daysInView), [events, daysInView]);
  const segs = useMemo(() => timedSegments(events, daysInView), [events, daysInView]);
  const firstKey = isoDateOnly(daysInView[0]);

  // Abre rolada nas 7h (ou um pouco antes do primeiro compromisso, se houver algum mais cedo), como o Google.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let earliest = 7 * 60;
    for (const list of segs.values()) for (const x of list) earliest = Math.min(earliest, x.startMin);
    el.scrollTop = Math.max(0, (earliest / 60 - 0.5) * PX_PER_HOUR);
    // só ao trocar de período: a recarga de 1 em 1 minuto não mexe na rolagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, daysInView.length]);

  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * PX_PER_HOUR;
  const openProps = (ev, label) => (openable(ev, hideDetails) ? { ...activate(() => onOpenEvent(ev)), 'aria-label': label } : { onClick: () => onOpenEvent(ev) });

  return (
    <div className="agd-frame">
      <div className="agd-scroll agd-vscroll" ref={scrollRef}>
        <div className="agd-grid" style={{ '--cols': daysInView.length }}>
          <div className="agd-sticky">
            <div style={{ display: 'grid', gridTemplateColumns: cols }}>
              <div className="agd-hours" />
              {daysInView.map((d) => {
                const key = isoDateOnly(d);
                const st = !hideDetails && dayStats[key];
                return (
                  <div key={key} className="agd-dayhead">
                    <div className={`agd-dow${key === todayKey ? ' today' : ''}`}>{WEEKDAY_LABEL[d.getDay()]}</div>
                    <div className={`agd-dnum${key === todayKey ? ' today' : ''}`}>{d.getDate()}</div>
                    {st && (
                      <div className="agd-dstat" title={`Aceitos: ${st.confirmed} (${fmtDur(st.confirmedMin)}). Sem resposta/talvez: ${st.pending}. Recusados: ${st.declined}. Livre no expediente (${hhmm(st.work.start)}–${hhmm(st.work.end)}): ${fmtDur(st.freeMin)}${st.pending ? `; se aceitar tudo: ${fmtDur(st.freeIfAllMin)}` : ''}.`}>
                        livre {fmtDur(st.freeMin)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="agd-toprow" style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${Math.max(1, top.rows)}, ${TOP_ROW_PX}px)` }}>
              <div className="agd-hours agd-toplbl" style={{ gridRow: '1 / -1' }}>Dia todo</div>
              {daysInView.map((d, i) => <div key={isoDateOnly(d)} className="agd-topcell" style={{ gridColumn: i + 2, gridRow: '1 / -1' }} />)}
              {top.bars.map((b) => (
                <div
                  key={`${b.ev.id}-${b.col}`} data-ev="1" className={`agd-bar${b.cutLeft ? ' cut-l' : ''}${b.cutRight ? ' cut-r' : ''}`}
                  {...openProps(b.ev, eventAria(b.ev))} title={eventTip(b.ev)}
                  style={{ gridColumn: `${b.col + 2} / span ${b.span}`, gridRow: b.row + 1, ...blockStyle(b.ev) }}
                >
                  {eventLabel(b.ev)}{!b.ev.allDay && !hideDetails ? <span className="agd-bar-time">, {hm(new Date(b.ev.start).getHours() * 60 + new Date(b.ev.start).getMinutes())}</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols, position: 'relative' }}>
            <div className="agd-hours">
              <div style={{ position: 'relative', height: GRID_HEIGHT }}>
                {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                  <div key={h} className="agd-hlabel" style={{ top: h * PX_PER_HOUR }}>{pad2(h)}:00</div>
                ))}
              </div>
            </div>
            {daysInView.map((d) => {
              const key = isoDateOnly(d);
              const list = segs.get(key) || [];
              // Recusado não ocupa o seu tempo: fica apagado ATRÁS, com a largura toda, fora da divisão em colunas.
              const behind = list.filter((x) => rsvpOf(x.ev) === 'declined');
              const placed = layoutDay(list.filter((x) => rsvpOf(x.ev) !== 'declined'));
              return (
                <div
                  key={key} className="agd-daycol" style={{ height: GRID_HEIGHT }}
                  onClick={(e) => {
                    if (e.target.closest('[data-ev]')) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    onPickSlot(d, Math.min(24 * 60 - 30, Math.floor(((y / PX_PER_HOUR) * 60) / 30) * 30));
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => <div key={h} className="agd-hline" style={{ top: h * PX_PER_HOUR }} />)}
                  {key === todayKey && <div className="agd-now" style={{ top: nowTop }} aria-hidden="true" />}
                  {[...behind.map((x) => ({ ...x, a: x.startMin, b: Math.max(x.endMin, x.startMin + 20), col: 0, cols: 1, colSpan: 1, back: true })), ...placed].map((x) => {
                    const ev = x.ev;
                    const topPx = (x.a / 60) * PX_PER_HOUR;
                    const h = Math.max(18, ((x.b - x.a) / 60) * PX_PER_HOUR - 2);
                    const w = 100 / x.cols;
                    const when = `${hm(x.startMin)}–${hm(x.endMin)}`;
                    const short = h < 34;
                    return (
                      <div
                        key={`${ev.id}-${key}`} data-ev="1" className={`agd-block${x.back ? ' back' : ''}`}
                        {...openProps(ev, `${when} ${eventAria(ev)}`)} title={[when, eventTip(ev)].filter(Boolean).join('\n')}
                        style={{ top: topPx, height: h, left: `calc(${x.col * w}% + 1px)`, width: `calc(${x.colSpan * w}% - 3px)`, zIndex: x.back ? 1 : 2 + x.col, ...blockStyle(ev) }}
                      >
                        {short ? (
                          <div className="agd-b-one"><b>{eventLabel(ev)}</b>{!hideDetails && <>, {hm(x.startMin)}</>}</div>
                        ) : (
                          <>
                            <div className="agd-b-title" style={{ WebkitLineClamp: h > 70 ? 3 : 2 }}>{eventLabel(ev)}</div>
                            {!hideDetails && <div className="agd-b-time">{when}</div>}
                            {!hideDetails && h > 64 && ev.location && <div className="agd-b-time">{ev.location}</div>}
                          </>
                        )}
                        {!hideDetails && hasClash(ev) && !x.back && <span className="agd-clash-dot" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Celular, visão Dia: os compromissos como cartões empilhados (hora, título, origem, resposta ao convite). Tocar abre o detalhe.
function DayList({ day, eventsByDay, dayStats, hideDetails, eventLabel, eventAria, onOpenEvent }) {
  const key = isoDateOnly(day);
  const allDay = eventsByDay[key]?.allDay || [];
  const timed = [...(eventsByDay[key]?.timed || [])].sort((a, b) => a.startMin - b.startMin);
  const st = dayStats[key];
  if (!allDay.length && !timed.length) return null;
  const card = (ev, when) => {
    const r = rsvpOf(ev);
    const pending = isPendingRsvp(r);
    const color = colorOf(ev);
    const sub = hideDetails ? '' : [ev.accountLabel || SOURCE_META[ev.source]?.label, ev.location].filter(Boolean).join(' · ');
    const props = openable(ev, hideDetails) ? { ...activate(() => onOpenEvent(ev)), 'aria-label': `${when} ${eventAria(ev)}` } : {};
    return (
      <div
        key={ev.id} {...props}
        className={`agd-card${pending ? ' pending' : ''}${r === 'declined' ? ' declined' : ''}${ev.status === 'cancelled' ? ' cancelled' : ''}`}
        style={{ '--c': color }}
      >
        <div className="agd-card-top">
          <span>{when}</span>
          {!hideDetails && CAL_SOURCES.has(ev.source) && (pending || r === 'declined') && <span className="agd-card-tag" style={{ color: RSVP_META[r].color }}>{RSVP_META[r].label}</span>}
        </div>
        <div className="agd-card-title">{eventLabel(ev)}</div>
        {sub && <div className="agd-card-sub">{sub}</div>}
      </div>
    );
  };
  return (
    <div className="agd-list">
      {!hideDetails && st && (
        <div className="agd-day-sum">
          {st.confirmed} aceit{st.confirmed === 1 ? 'o' : 'os'} ({fmtDur(st.confirmedMin)}) · livre {fmtDur(st.freeMin)} no seu expediente ({hhmm(st.work.start)}–{hhmm(st.work.end)}){st.pending ? ` · ${st.pending} sem resposta` : ''}
        </div>
      )}
      {allDay.map((ev) => card(ev, 'Dia todo'))}
      {timed.map((ev) => card(ev, `${hhmm(ev.startMin)}–${hhmm(ev.endMin)}`))}
    </div>
  );
}

function MonthGrid({ daysInView, eventsByDay, anchorDate, hideDetails, eventLabel, eventTip, onOpenEvent, onPickDay }) {
  const currentMonth = anchorDate.getMonth();
  const today = isoDateOnly(new Date());
  const weeks = [];
  for (let i = 0; i < daysInView.length; i += 7) weeks.push(daysInView.slice(i, i + 7));

  return (
    <div className="agd-frame">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--border-1)' }}>
        {daysInView.slice(0, 7).map((d) => <div key={d.getDay()} className="agd-dow" style={{ padding: '8px', textAlign: 'center' }}>{WEEKDAY_LABEL[d.getDay()]}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: wi < weeks.length - 1 ? '1px solid var(--border-1)' : 'none' }}>
          {week.map((d) => {
            const key = isoDateOnly(d);
            const dayEvents = [...(eventsByDay[key]?.allDay || []), ...(eventsByDay[key]?.timed || [])];
            const dimmed = d.getMonth() !== currentMonth;
            return (
              <div
                key={key} className="agd-m-cell"
                {...activate(() => onPickDay(d))}
                aria-label={`${d.getDate()} de ${MONTH_LABEL[d.getMonth()].toLowerCase()}: ${dayEvents.length === 0 ? 'sem compromissos' : dayEvents.length === 1 ? '1 compromisso' : `${dayEvents.length} compromissos`}. Abrir o dia`}
                style={{ borderLeft: '1px solid var(--border-1)', padding: 5, cursor: 'pointer', opacity: dimmed ? 0.45 : 1 }}
              >
                <div className={`agd-m-num${key === today ? ' today' : ''}`}>{d.getDate()}</div>
                {dayEvents.length > 0 && (
                  <div className="agd-m-dots" aria-hidden="true">
                    {dayEvents.slice(0, 4).map((ev) => <span key={ev.id} className="agd-m-dot" style={{ background: colorOf(ev) }} />)}
                    {dayEvents.length > 4 && <span className="agd-m-more">+{dayEvents.length - 4}</span>}
                  </div>
                )}
                <div className="agd-m-evs">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id} className={`agd-m-ev${ev.allDay || ev.startMin === undefined ? ' bar' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onOpenEvent(ev); }} title={eventTip(ev)}
                      style={ev.allDay || ev.startMin === undefined ? blockStyle(ev) : { textDecoration: rsvpOf(ev) === 'declined' || ev.status === 'cancelled' ? 'line-through' : 'none', opacity: rsvpOf(ev) === 'declined' ? 0.6 : 1 }}
                    >
                      {!(ev.allDay || ev.startMin === undefined) && <span className={`agd-m-dot2${isPendingRsvp(rsvpOf(ev)) ? ' hollow' : ''}`} style={{ '--c': colorOf(ev) }} aria-hidden="true" />}
                      {!(ev.allDay || ev.startMin === undefined) && !hideDetails && <span className="agd-m-time">{hm(ev.startMin)}</span>}
                      <span className="agd-m-title">{eventLabel(ev)}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div className="agd-m-more2">+{dayEvents.length - 3} mais</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
