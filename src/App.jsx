import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Trash2, Download, Upload, Clock, LayoutGrid, Columns3, Building2,
  Users, X, Check, ChevronDown, FileSpreadsheet, FileText, Settings,
  GripVertical, CalendarDays, List, Pencil, Maximize2, Send, MessageSquare, Mic,
  LogOut, UserCog, AlertTriangle, Sun, Moon, Copy, Undo2, Bell, Link2, History,
  MoreHorizontal, Search, Tag, ListChecks, Palette, ArrowLeftRight, LayoutList, SlidersHorizontal,
  Globe, Lock, RefreshCw, Pause, Play,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { apiGet, apiPost, apiPatch, apiDelete } from './lib/api.js';
import pricetaxLogoBranco from './assets/brand/pricetax-logo-branco.png';
import pricetaxLogoPreto from './assets/brand/pricetax-logo-preto.png';

const LOCAL_PREFS_KEY = 'pricetax-cronograma-prefs-v1';
const THEME_KEY = 'pricetax-cronograma-theme';
const MENTIONS_SEEN_KEY = 'pricetax-cronograma-mentions-seen';

function BrandLogo({ theme, style }) {
  return <img src={theme === 'light' ? pricetaxLogoPreto : pricetaxLogoBranco} alt="PriceTax" style={style} />;
}

function ThemeToggleBtn({ theme, onToggle, style }) {
  return (
    <button style={style || S.iconBtnGhost} title={theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'} onClick={onToggle}>
      {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#e2574c', '#b98af5', '#ff9f40'];

const ROLE_META = {
  master: { label: 'PRICETAX Master', color: '#F5C400' },
  pricetax: { label: 'PRICETAX', color: '#3ea6ff' },
  cliente: { label: 'Cliente', color: '#3ecf6e' },
};

const AVATAR_EMOJIS = [
  '😀', '😎', '🙂', '🤓', '🧐', '😊', '🤝', '💼',
  '🎯', '📊', '📈', '🚀', '⭐', '🔥', '💡', '🎓',
  '🦁', '🐼', '🦊', '🐧', '🐢', '🦉', '🐝', '🐱',
  '☕', '🌵', '🍀', '🎧', '🧩', '🛠️', '🧠', '🏆',
];

const STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: 'var(--text-4)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  'em-andamento': { label: 'Em andamento', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  'pausado': { label: 'Pausado', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  'concluido': { label: 'Concluído', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
};
const STATUS_ORDER = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
const COMPANY_STATUS_META = {
  ativo: { label: 'Ativo', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
  pausado: { label: 'Pausado', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
};
const CLIENT_TYPE_META = {
  diagnostico: { label: 'Diagnóstico', short: 'Diagnóstico', color: '#3ea6ff', bg: 'rgba(62,166,255,.14)', border: 'rgba(62,166,255,.5)' },
  'diagnostico-consultoria': { label: 'Diagnóstico e Consultoria Contínua', short: 'Consultoria Contínua', color: '#9b7af5', bg: 'rgba(155,122,245,.14)', border: 'rgba(155,122,245,.5)' },
};
const CLIENT_TYPE_ORDER = ['diagnostico', 'diagnostico-consultoria'];
const DELETE_CONFIRM_PHRASE = 'Excluir';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const PRIORITY_META = {
  alta: { label: 'Alta', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  media: { label: 'Média', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  baixa: { label: 'Baixa', color: 'var(--text-5)', bg: 'var(--border-1)', border: 'var(--border-3)' },
};
const PRIORITY_ORDER = ['alta', 'media', 'baixa'];

const SUB_ROW_CSS = `
  .sub-row-card { transition:border-color .12s, box-shadow .12s; }
  .sub-row-card:hover { border-color:var(--border-3); box-shadow:0 1px 5px rgba(0,0,0,.10); }
  .sub-row-card .sub-drag-handle { opacity:.3; transition:opacity .12s; }
  .sub-row-card:hover .sub-drag-handle { opacity:.9; }
  .sub-row-card .sub-del-btn { opacity:.4; transition:opacity .12s, color .12s; }
  .sub-row-card:hover .sub-del-btn { opacity:1; }
  .sub-row-card .sub-del-btn:hover { color:#e5484d; }
  .sub-row-card .sub-title-input { background:transparent; border:1px solid transparent; padding:4px 6px; font-size:13px; border-radius:5px; }
  .sub-row-card .sub-title-input:hover { background:var(--bg-3); }
  .sub-row-card .sub-title-input:focus { background:var(--bg-4); border-color:#F5C400; }
  .sub-row-card .sub-meta-select, .sub-row-card .sub-meta-date {
    font-size:11px; padding:4px 7px; border-radius:6px; background:var(--bg-3); border:1px solid var(--border-1); color:var(--text-4);
  }
  .sub-row-card .sub-meta-select:hover, .sub-row-card .sub-meta-date:hover { color:var(--text-2); border-color:var(--border-3); }
  .sub-row-card input[type=checkbox] { width:16px; height:16px; cursor:pointer; flex-shrink:0; }
`;

const CARD_PRIORITY_META = {
  urgente: { label: 'Urgente', color: '#e2574c', bg: 'rgba(226,87,76,.16)', border: 'rgba(226,87,76,.5)' },
  alta: { label: 'Alta', color: '#ff9f40', bg: 'rgba(255,159,64,.16)', border: 'rgba(255,159,64,.5)' },
  media: { label: 'Média', color: '#F5C400', bg: 'rgba(245,196,0,.16)', border: 'rgba(245,196,0,.5)' },
  baixa: { label: 'Baixa', color: '#3ea6ff', bg: 'rgba(62,166,255,.16)', border: 'rgba(62,166,255,.5)' },
};
const CARD_PRIORITY_ORDER = ['urgente', 'alta', 'media', 'baixa'];

const CARD_STATUS_META = {
  'nao-iniciada': { label: 'Não iniciada', color: 'var(--text-5)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  'em-andamento': { label: 'Em andamento', color: '#3ea6ff', bg: 'rgba(62,166,255,.16)', border: 'rgba(62,166,255,.5)' },
  pausada: { label: 'Pausada', color: '#ff9f40', bg: 'rgba(255,159,64,.16)', border: 'rgba(255,159,64,.5)' },
  concluida: { label: 'Concluída', color: '#3ecf6e', bg: 'rgba(62,207,110,.16)', border: 'rgba(62,207,110,.5)' },
};
const CARD_STATUS_ORDER = ['nao-iniciada', 'em-andamento', 'pausada', 'concluida'];
function cardStatusOf(card) {
  return card.status || (card.completed ? 'concluida' : 'nao-iniciada');
}

const COLUMN_COLOR_META = {
  gray: { label: 'Cinza', bg: 'var(--pcol-gray-bg)', text: 'var(--pcol-gray-text)', container: 'var(--pcol-gray-container)' },
  blue: { label: 'Azul', bg: 'var(--pcol-blue-bg)', text: 'var(--pcol-blue-text)', container: 'var(--pcol-blue-container)' },
  green: { label: 'Verde', bg: 'var(--pcol-green-bg)', text: 'var(--pcol-green-text)', container: 'var(--pcol-green-container)' },
  yellow: { label: 'Amarelo', bg: 'var(--pcol-yellow-bg)', text: 'var(--pcol-yellow-text)', container: 'var(--pcol-yellow-container)' },
  orange: { label: 'Laranja', bg: 'var(--pcol-orange-bg)', text: 'var(--pcol-orange-text)', container: 'var(--pcol-orange-container)' },
  red: { label: 'Vermelho', bg: 'var(--pcol-red-bg)', text: 'var(--pcol-red-text)', container: 'var(--pcol-red-container)' },
  pink: { label: 'Rosa', bg: 'var(--pcol-pink-bg)', text: 'var(--pcol-pink-text)', container: 'var(--pcol-pink-container)' },
  purple: { label: 'Roxo', bg: 'var(--pcol-purple-bg)', text: 'var(--pcol-purple-text)', container: 'var(--pcol-purple-container)' },
  brown: { label: 'Marrom', bg: 'var(--pcol-brown-bg)', text: 'var(--pcol-brown-text)', container: 'var(--pcol-brown-container)' },
};
const COLUMN_COLOR_ORDER = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'brown'];

const CARD_DELETE_CONFIRM_PHRASE = 'Excluir';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function dueDateTone(card) {
  if (!card.dueDate || card.completed) return 'none';
  const today = todayISOStr();
  if (card.dueDate < today) return 'overdue';
  if (card.dueDate === today) return 'today';
  const soon = toISODate(addDays(parseDate(today), 3));
  if (card.dueDate <= soon) return 'soon';
  return 'normal';
}

function daysSinceCardMovement(card) {
  const ref = card.updatedAt || card.createdAt;
  if (!ref) return 0;
  const then = new Date(ref).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}
function staleTone(days) {
  if (days >= 7) return 'critical';
  if (days >= 3) return 'warn';
  return 'fresh';
}
function fmtDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
function genShareToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36); }

function todayISOStr() { return toISODate(startOfDay(new Date())); }

// Breakpoints únicos do app — não crie outros. MOBILE_BP = celular (layout empilhado/cards).
// TABLET_BP = ponto em que sidebars/painéis fixos deixam de caber confortavelmente ao lado do conteúdo.
const MOBILE_BP = 768;
const TABLET_BP = 1024;

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    handler(mq);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', handler); else mq.removeListener(handler); };
  }, [query]);
  return matches;
}

function useIsMobile() { return useMediaQuery(`(max-width: ${MOBILE_BP - 1}px)`); }
function useIsCompact() { return useMediaQuery(`(max-width: ${TABLET_BP - 1}px)`); }

function normalizeTeam(team, teamLinks) {
  return (team || []).map((m) => {
    if (typeof m !== 'string') return m;
    const link = (teamLinks || {})[m];
    return { id: uid('team'), name: m, area: '', userId: link ? link.userId : null, username: null, role: link ? link.role : null };
  });
}

function normalizeProject(p) {
  return { ...p, team: normalizeTeam(p.team, p.company && p.company.teamLinks) };
}


function isExpiredNotYetFlagged(user) {
  return !user.blocked && !!user.expiresAt && user.expiresAt < todayISOStr();
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y) return '—';
  return `${d}/${m}/${y}`;
}
function fmtTs(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function parseDate(iso) { return new Date(iso + 'T00:00:00'); }
function toISODate(d) { return d.toISOString().slice(0, 10); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function calcDeadline(startISO, durationDays) {
  const n = Number(durationDays);
  if (!startISO || !n) return '';
  let d = addDays(parseDate(startISO), n - 1);
  const dow = d.getDay();
  if (dow === 6) d = addDays(d, 2);
  else if (dow === 0) d = addDays(d, 1);
  return toISODate(d);
}
function dayAfter(iso) {
  let d = addDays(parseDate(iso), 1);
  const dow = d.getDay();
  if (dow === 6) d = addDays(d, 2);
  else if (dow === 0) d = addDays(d, 1);
  return toISODate(d);
}
function dayBefore(iso) {
  let d = addDays(parseDate(iso), -1);
  const dow = d.getDay();
  if (dow === 0) d = addDays(d, -2);
  else if (dow === 6) d = addDays(d, -1);
  return toISODate(d);
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return addDays(addMonths(startOfMonth(d), 1), -1); }
function startOfWeek(d) { const x = startOfDay(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; return addDays(x, diff); }
function fmtDayLabel(d) { return String(d.getDate()).padStart(2, '0'); }
function fmtDayFull(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmtMonthYearLabel(d) { return `${MONTH_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`; }
function fmtYearLabel(d) { return String(d.getFullYear()); }
function fmtWeekLabel(d) { return `sem. ${fmtDayFull(d)}`; }
function fmtMonthTitle(d) { const m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']; return `${m[d.getMonth()]} de ${d.getFullYear()}`; }

function buildTimelineColumns(granularity, activities, windowAnchor) {
  const dated = [];
  activities.forEach((a) => {
    if (a.date) dated.push(parseDate(a.date));
    if (a.endDate) dated.push(parseDate(a.endDate));
  });
  if (granularity === 'mes' || granularity === 'ano') {
    if (dated.length === 0) return [];
    const min = new Date(Math.min(...dated));
    const max = new Date(Math.max(...dated));
    const cols = [];
    if (granularity === 'mes') {
      let cur = startOfMonth(min);
      const end = startOfMonth(max);
      while (cur <= end) { cols.push({ key: toISODate(cur).slice(0, 7), start: cur, end: endOfMonth(cur), label: fmtMonthYearLabel(cur) }); cur = addMonths(cur, 1); }
    } else {
      for (let y = min.getFullYear(); y <= max.getFullYear(); y++) {
        const start = new Date(y, 0, 1);
        cols.push({ key: String(y), start, end: new Date(y, 11, 31), label: String(y) });
      }
    }
    return cols;
  }
  if (granularity === 'dia') {
    const start = startOfMonth(windowAnchor);
    const end = endOfMonth(windowAnchor);
    const cols = []; let cur = start;
    while (cur <= end) { cols.push({ key: toISODate(cur), start: cur, end: cur, label: fmtDayLabel(cur) }); cur = addDays(cur, 1); }
    return cols;
  }
  if (granularity === 'semana') {
    let cur = startOfWeek(addMonths(startOfMonth(windowAnchor), -1));
    const end = addMonths(windowAnchor, 2);
    const cols = [];
    while (cur <= end) { const wEnd = addDays(cur, 6); cols.push({ key: toISODate(cur), start: cur, end: wEnd, label: fmtWeekLabel(cur) }); cur = addDays(cur, 7); }
    return cols;
  }
  return [];
}

function colIndexFor(iso, columns) {
  if (!iso) return null;
  const d = parseDate(iso);
  for (let i = 0; i < columns.length; i++) {
    if (d >= columns[i].start && d <= columns[i].end) return i;
  }
  if (columns.length && d < columns[0].start) return 0;
  if (columns.length && d > columns[columns.length - 1].end) return columns.length - 1;
  return null;
}

function fractionInColumn(iso, col) {
  if (!iso || !col) return 0;
  const d = parseDate(iso);
  const span = (col.end - col.start) + 86400000;
  const pos = d - col.start;
  return Math.min(1, Math.max(0, pos / span));
}

function sortActivities(list) {
  return list.slice().sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.month - b.month;
  });
}

function buildOrderMap(sortedList) {
  const map = {};
  sortedList.forEach((a, i) => { map[a.id] = i + 1; });
  return map;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignora */ }
  }, [theme]);
  function toggleTheme() { setTheme((t) => (t === 'light' ? 'dark' : 'light')); }
  const isMobile = useIsMobile();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [companySelectionConfirmed, setCompanySelectionConfirmed] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(null);
  const [personalBoard, setPersonalBoard] = useState(null);
  const [personalBoardLoaded, setPersonalBoardLoaded] = useState(false);
  const [personalBoardSaveState, setPersonalBoardSaveState] = useState('idle');
  const personalBoardSaveTimer = useRef(null);
  const lastGoodPersonalBoardRef = useRef(null);
  const [phasesEditingProjectId, setPhasesEditingProjectId] = useState(null);
  const [usersLog, setUsersLog] = useState([]);
  const [loginError, setLoginError] = useState(null);
  const [usersPanelError, setUsersPanelError] = useState('');
  const saveTimers = useRef({});

  const [view, setView] = useState('table');
  const [showLog, setShowLog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionsSeenAt, setMentionsSeenAt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showOrgAdmin, setShowOrgAdmin] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [orgAdminError, setOrgAdminError] = useState('');
  const [actingOrg, setActingOrg] = useState(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [cloningProject, setCloningProject] = useState(null);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [openActivityId, setOpenActivityId] = useState(null);
  const [newMember, setNewMember] = useState('');
  const [teamCandidates, setTeamCandidates] = useState([]);
  const [linkUserId, setLinkUserId] = useState('');
  const [linkArea, setLinkArea] = useState('');
  const [expanded, setExpanded] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragPhaseId, setDragPhaseId] = useState(null);
  const [granularity, setGranularity] = useState('mes');
  const [windowAnchor, setWindowAnchor] = useState(new Date());
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_PREFS_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs.usersLog) setUsersLog(prefs.usersLog);
      }
    } catch (e) { /* nada salvo ainda */ }

    (async () => {
      try {
        const res = await apiGet('/api/auth/me');
        setCurrentUser(res.user);
      } catch (e) {
        setCurrentUser(null);
      } finally {
        setSessionChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ usersLog })); }
    catch (e) { /* ignora */ }
  }, [usersLog]);

  useEffect(() => {
    if (!currentUser) { setMentionsSeenAt(''); return; }
    try {
      const raw = JSON.parse(window.localStorage.getItem(MENTIONS_SEEN_KEY) || '{}');
      setMentionsSeenAt(raw[currentUser.username] || '');
    } catch (e) { setMentionsSeenAt(''); }
  }, [currentUser?.id]);

  function markMentionsSeen() {
    const now = new Date().toISOString();
    setMentionsSeenAt(now);
    try {
      const raw = JSON.parse(window.localStorage.getItem(MENTIONS_SEEN_KEY) || '{}');
      raw[currentUser.username] = now;
      window.localStorage.setItem(MENTIONS_SEEN_KEY, JSON.stringify(raw));
    } catch (e) { /* ignora */ }
  }

  function withActingOrg(path) {
    if (!actingOrg) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}asOrg=${encodeURIComponent(actingOrg.id)}`;
  }

  useEffect(() => {
    if (!currentUser) { setProjects([]); setProjectsLoaded(false); return; }
    setProjectsLoaded(false);
    (async () => {
      try {
        const res = await apiGet(withActingOrg('/api/projects'));
        setProjects(res.projects.map(normalizeProject));
      } catch (e) {
        console.error('Falha ao carregar projetos', e);
        setProjects([]);
      } finally {
        setProjectsLoaded(true);
      }
    })();
  }, [currentUser?.id, actingOrg?.id]);

  useEffect(() => {
    if (!projectsLoaded || !currentUser || currentUser.role !== 'cliente') return;
    setSelectedProjectIds(projects.map((p) => p.id));
    setCompanySelectionConfirmed(true);
  }, [projectsLoaded, currentUser?.id]);

  useEffect(() => {
    setWorkspaceMode(null);
    if (!currentUser) { setPersonalBoard(null); setPersonalBoardLoaded(false); return; }
    setPersonalBoardLoaded(false);
    (async () => {
      try {
        const res = await apiGet('/api/personal-board');
        setPersonalBoard(res.board);
        lastGoodPersonalBoardRef.current = res.board;
        setPersonalBoardSaveState('idle');
      } catch (e) {
        console.error('Falha ao carregar Gestão de Atividades', e);
        setPersonalBoard({ boards: [] });
        lastGoodPersonalBoardRef.current = { boards: [] };
      } finally {
        setPersonalBoardLoaded(true);
      }
    })();
  }, [currentUser?.id]);

  function persistPersonalBoardDebounced(board) {
    if (personalBoardSaveTimer.current) clearTimeout(personalBoardSaveTimer.current);
    setPersonalBoardSaveState('saving');
    personalBoardSaveTimer.current = setTimeout(() => {
      apiPatch('/api/personal-board', { board })
        .then(() => {
          lastGoodPersonalBoardRef.current = board;
          setPersonalBoardSaveState('saved');
        })
        .catch((e) => {
          console.error('Falha ao salvar Gestão de Atividades', e);
          setPersonalBoardSaveState('error');
          setPersonalBoard(lastGoodPersonalBoardRef.current);
        });
    }, 500);
  }

  function mutatePersonalBoard(updater) {
    setPersonalBoard((prev) => {
      const next = updater(prev);
      persistPersonalBoardDebounced(next);
      return next;
    });
  }

  useEffect(() => {
    if (showUsers && currentUser && currentUser.role === 'master') {
      loadUsers();
    }
  }, [showUsers, currentUser?.id, actingOrg?.id]);

  useEffect(() => {
    if (showOrgAdmin && currentUser && currentUser.isSuperAdmin) {
      loadOrganizations();
    }
  }, [showOrgAdmin, currentUser?.id]);

  useEffect(() => {
    if (!showSettings || selectedProjectIds.length !== 1) { setTeamCandidates([]); return; }
    apiGet(`/api/projects/${selectedProjectIds[0]}/team-candidates`)
      .then((res) => setTeamCandidates(res.users))
      .catch(() => setTeamCandidates([]));
  }, [showSettings, selectedProjectIds.join(',')]);

  function addUsersLog(action) {
    setUsersLog((l) => [{ ts: new Date().toISOString(), action }, ...l].slice(0, 300));
  }

  async function handleLogin(username, password) {
    try {
      const res = await apiPost('/api/auth/login', { username, password });
      setLoginError(null);
      setCurrentUser(res.user);
    } catch (e) {
      setLoginError({ message: e.message });
    }
  }

  async function handleLogout() {
    try { await apiPost('/api/auth/logout'); } catch (e) { /* ignora */ }
    setCurrentUser(null);
    setProjects([]);
    setProjectsLoaded(false);
    setSelectedProjectIds([]);
    setCompanySelectionConfirmed(false);
  }

  async function updateMyAvatar(avatar) {
    const res = await apiPatch('/api/auth/me', { avatar });
    setCurrentUser(res.user);
    setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
  }

  function persistProjectDebounced(pid, projectData) {
    if (saveTimers.current[pid]) clearTimeout(saveTimers.current[pid]);
    saveTimers.current[pid] = setTimeout(() => {
      apiPatch(`/api/projects/${pid}`, { project: projectData }).catch((e) => console.error('Falha ao salvar projeto', e));
    }, 500);
  }

  function mutateProject(pid, updater, logMsg, activityId) {
    setProjects((prev) => {
      let saved = null;
      const nextArr = prev.map((p) => {
        if (p.id !== pid) return p;
        let next = updater(p);
        if (logMsg) next = { ...next, log: [{ ts: new Date().toISOString(), action: logMsg, user: currentUser ? currentUser.name : '', activityId: activityId || null }, ...(next.log || [])].slice(0, 300) };
        saved = next;
        return next;
      });
      if (saved) persistProjectDebounced(pid, saved);
      return nextArr;
    });
  }

  const publicBoardMatch = window.location.pathname.match(/^\/quadro\/([A-Za-z0-9_-]+)/);
  if (publicBoardMatch) {
    return <PublicBoardScreen token={publicBoardMatch[1]} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!sessionChecked) {
    return <LoadingScreen theme={theme} />;
  }

  if (!currentUser) {
    return <LoginGate onLogin={handleLogin} loginError={loginError} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!projectsLoaded) {
    return <LoadingScreen theme={theme} />;
  }

  if (!workspaceMode && !currentUser.personalOnly) {
    return (
      <WorkspaceGateScreen
        user={currentUser}
        onPickCompany={() => setWorkspaceMode('company')}
        onPickPersonal={() => setWorkspaceMode('personal')}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (workspaceMode === 'personal' || currentUser.personalOnly) {
    if (!personalBoardLoaded || !personalBoard) {
      return <PersonalBoardSkeleton theme={theme} />;
    }
    return (
      <PersonalBoardScreen
        board={personalBoard}
        onMutate={mutatePersonalBoard}
        onExit={currentUser.personalOnly ? null : () => setWorkspaceMode('company')}
        currentUser={currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        saveState={personalBoardSaveState}
      />
    );
  }

  const registeredProjects = projects.filter((p) => p.company.cnpj);
  const canPickCompanies = currentUser.role === 'master' || currentUser.role === 'pricetax';

  if (canPickCompanies && !companySelectionConfirmed) {
    return (
      <>
        <CompanySelectorScreen
          projects={projects}
          initialSelected={selectedProjectIds}
          onConfirm={(ids) => { setSelectedProjectIds(ids); setCompanySelectionConfirmed(true); }}
          onLogout={handleLogout}
          onCreateNew={() => setShowCreateCompany(true)}
          onUpdateCompany={updateCompanyFields}
          onDeleteCompany={deleteCompany}
          onCloneCompany={(p) => setCloningProject(p)}
          onGoPersonal={() => setWorkspaceMode('personal')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {showCreateCompany && (
          <CreateCompanyModal
            onClose={() => setShowCreateCompany(false)}
            onCreate={async (company) => {
              const newId = await createCompany(company);
              setSelectedProjectIds((prev) => [...prev, newId]);
              setShowCreateCompany(false);
            }}
          />
        )}
        {cloningProject && (
          <CreateCompanyModal
            cloneSource={cloningProject}
            onClose={() => setCloningProject(null)}
            onCreate={async (company) => {
              const newId = await cloneCompany(cloningProject.id, company);
              setSelectedProjectIds((prev) => [...prev, newId]);
              setCloningProject(null);
            }}
          />
        )}
      </>
    );
  }

  if (showUsers && currentUser.role === 'master') {
    return (
      <UsersManagementScreen
        users={users}
        currentUser={currentUser}
        registeredProjects={registeredProjects}
        usersPanelError={usersPanelError}
        onClose={() => setShowUsers(false)}
        onCreateUser={addUser}
        onUpdateUser={updateUser}
        onToggleBlock={toggleUserBlock}
        onRenew={renewUser}
        onResetPassword={resetUserPassword}
        onDeleteUser={deleteUser}
        onToggleCnpj={toggleUserCnpj}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (showOrgAdmin && currentUser.isSuperAdmin) {
    return (
      <SuperAdminScreen
        organizations={organizations}
        error={orgAdminError}
        onClose={() => setShowOrgAdmin(false)}
        onCreate={createOrganization}
        onSetStatus={updateOrganizationStatus}
        onEnter={enterOrganization}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));
  const isMulti = selectedProjects.length > 1;
  const activeProject = selectedProjects.length === 1 ? selectedProjects[0] : null;

  if (!activeProject && !isMulti) {
    return <NoAccessScreen user={currentUser} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />;
  }

  const pid = activeProject ? activeProject.id : null;

  function addLog(targetPid, action) {
    mutateProject(targetPid, (p) => p, action);
  }

  function updateActivity(targetPid, id, patch, logMsg) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), logMsg, id);
  }

  function addActivity(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = { id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '', responsible: (project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [], date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [], comments: [], links: [], transcript: '' };
    mutateProject(targetPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade criada: "${na.title}"`, na.id);
  }

  function deleteActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    if (!a) return false;
    const typed = window.prompt(`Para excluir "${a.title}", digite "${DELETE_CONFIRM_PHRASE}" abaixo:`);
    if (typed !== DELETE_CONFIRM_PHRASE) return false;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((x) => (x.id === id ? { ...x, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : x)),
    }), `Atividade excluída: "${a.title}"`, id);
    return true;
  }

  function restoreActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((x) => (x.id === id ? { ...x, deleted: false, deletedAt: '', deletedBy: '' } : x)),
    }), a ? `Atividade restaurada: "${a.title}"` : undefined, id);
  }

  function addSub(targetPid, actId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: [...(a.subactivities || []), { id: uid('s'), title: 'Nova subatividade', done: false, responsible: '', date: '' }] }) }), act ? `Subatividade adicionada em "${act.title}"` : undefined, actId);
    setExpanded((e) => ({ ...e, [actId]: true }));
  }

  function updateSub(targetPid, actId, subId, patch) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, ...patch } : s) }) }), undefined, actId);
  }

  function deleteSub(targetPid, actId, subId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const sub = act && (act.subactivities || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : s),
      }),
    }), sub ? `Subatividade excluída em "${act.title}": ${sub.title}` : undefined, actId);
  }

  function restoreSub(targetPid, actId, subId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const sub = act && (act.subactivities || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, deleted: false, deletedAt: '', deletedBy: '' } : s),
      }),
    }), sub ? `Subatividade restaurada em "${act.title}": ${sub.title}` : undefined, actId);
  }

  function reorderSub(targetPid, actId, fromId, toId) {
    if (!fromId || fromId === toId) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => {
        if (a.id !== actId) return a;
        const list = (a.subactivities || []).slice();
        const fromIdx = list.findIndex((s) => s.id === fromId);
        const toIdx = list.findIndex((s) => s.id === toId);
        if (fromIdx === -1 || toIdx === -1) return a;
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...a, subactivities: list };
      }),
    }), undefined, actId);
  }

  function addAttachment(targetPid, actId, file) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      window.alert(`"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite por arquivo é ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const att = { id: uid('att'), name: file.name, size: file.size, type: file.type || '', dataUrl: reader.result };
      const project = projects.find((p) => p.id === targetPid);
      const act = project && project.activities.find((a) => a.id === actId);
      mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: [...(a.attachments || []), att] }) }), `Anexo adicionado em "${act ? act.title : ''}": ${file.name}`, actId);
    };
    reader.readAsDataURL(file);
  }

  function removeAttachment(targetPid, actId, attId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const att = act && (act.attachments || []).find((x) => x.id === attId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: (a.attachments || []).filter((x) => x.id !== attId) }) }), att ? `Anexo removido em "${act.title}": ${att.name}` : undefined, actId);
  }

  function addComment(targetPid, actId, text, mentionIds) {
    const v = (text || '').trim();
    if (!v) return;
    const c = { id: uid('cm'), text: v, ts: new Date().toISOString(), author: currentUser ? currentUser.name : '', authorId: currentUser ? currentUser.id : '', mentions: mentionIds && mentionIds.length ? mentionIds : [] };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: [...(a.comments || []), c] }) }), `Comentário adicionado em "${act ? act.title : ''}"`, actId);
  }

  function removeComment(targetPid, actId, commentId) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }) }), undefined, actId);
  }

  function updateComment(targetPid, actId, commentId, text) {
    const v = (text || '').trim();
    if (!v) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : {
        ...a,
        comments: (a.comments || []).map((c) => c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c),
      }),
    }), undefined, actId);
  }

  function addLink(targetPid, actId, link) {
    if (!link || !link.url || !link.url.trim()) return;
    const url = /^https?:\/\//i.test(link.url.trim()) ? link.url.trim() : `https://${link.url.trim()}`;
    const l = { id: uid('lnk'), label: (link.label || '').trim() || url, url };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, links: [...(a.links || []), l] }) }), act ? `Link adicionado em "${act.title}": ${l.label}` : undefined, actId);
  }

  function removeLink(targetPid, actId, linkId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const l = act && (act.links || []).find((x) => x.id === linkId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, links: (a.links || []).filter((x) => x.id !== linkId) }) }), l ? `Link removido em "${act.title}": ${l.label}` : undefined, actId);
  }

  function toggleParticipant(targetPid, actId, name) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    if (!act) return;
    const has = (act.participants || []).includes(name);
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => a.id !== actId ? a : { ...a, participants: has ? (a.participants || []).filter((n) => n !== name) : [...(a.participants || []), name] }),
    }), `${has ? 'Participante removido' : 'Participante adicionado'} em "${act.title}": ${name}`, actId);
  }

  function addMember() {
    const v = newMember.trim();
    if (!v || !activeProject || activeProject.team.some((m) => m.name === v)) return;
    mutateProject(pid, (p) => ({ ...p, team: [...p.team, { id: uid('team'), name: v, area: '', userId: null, username: null, role: null }] }), `Responsável adicionado à equipe: ${v}`);
    setNewMember('');
  }

  function removeMember(id) {
    const target = activeProject && activeProject.team.find((m) => m.id === id);
    mutateProject(pid, (p) => ({ ...p, team: p.team.filter((m) => m.id !== id) }), target ? `Responsável removido da equipe: ${target.name}` : undefined);
  }

  function linkMember(user, area) {
    if (!activeProject || activeProject.team.some((m) => m.userId === user.id)) return;
    const origin = user.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX';
    mutateProject(pid, (p) => ({
      ...p,
      team: [...p.team, { id: uid('team'), name: user.name, area: area || '', userId: user.id, username: user.username, role: user.role }],
    }), `Responsável vinculado à equipe: ${user.name} (${origin})${area ? ` — área: ${area}` : ''}`);
  }

  function updateMemberArea(id, area) {
    mutateProject(pid, (p) => ({ ...p, team: p.team.map((m) => (m.id === id ? { ...m, area } : m)) }));
  }

  function commitMemberArea(id) {
    const m = activeProject && activeProject.team.find((t) => t.id === id);
    if (m) addLog(pid, `Área de "${m.name}" definida como: ${m.area || '(vazio)'}`);
  }

  function addAreaRow() {
    const row = { id: uid('area'), area: '', name: '', email: '' };
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: [...(p.company.areas || []), row] } }));
  }

  function updateAreaRow(id, patch) {
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: (p.company.areas || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
  }

  function commitAreaRow(id) {
    const row = activeProject && (activeProject.company.areas || []).find((r) => r.id === id);
    if (!row) return;
    addLog(pid, `Área cadastrada: ${row.area || '(sem nome)'} — ${row.name || 'sem responsável'}${row.email ? ` <${row.email}>` : ''}`);
    if (row.name && !activeProject.team.some((m) => m.name === row.name)) {
      mutateProject(pid, (p) => ({ ...p, team: [...p.team, { id: uid('team'), name: row.name, area: row.area || '', userId: null, username: null, role: null }] }));
    }
  }

  function removeAreaRow(id) {
    const row = activeProject && (activeProject.company.areas || []).find((r) => r.id === id);
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: (p.company.areas || []).filter((r) => r.id !== id) } }), row ? `Área removida: ${row.area || '(sem nome)'}` : undefined);
  }

  function addPhase() {
    const target = projects.find((p) => p.id === phasesEditingProjectId);
    if (!target) return;
    const phasesList = target.phases;
    const nextId = phasesList.length ? Math.max(...phasesList.map((p2) => p2.id)) + 1 : 1;
    const color = PHASE_COLORS[phasesList.length % PHASE_COLORS.length];
    const np = { id: nextId, name: 'Nova fase', sub: '', color };
    mutateProject(phasesEditingProjectId, (p) => ({ ...p, phases: [...p.phases, np] }), `Fase criada: "${np.name}"`);
  }

  function updatePhase(id, patch, logMsg) {
    mutateProject(phasesEditingProjectId, (p) => ({ ...p, phases: p.phases.map((ph) => (ph.id === id ? { ...ph, ...patch } : ph)) }), logMsg);
  }

  function deletePhase(id) {
    const target = projects.find((p) => p.id === phasesEditingProjectId);
    if (!target || target.phases.length <= 1) return;
    const p0 = target.phases.find((x) => x.id === id);
    const fallback = target.phases.find((x) => x.id !== id);
    mutateProject(phasesEditingProjectId, (p) => ({
      ...p,
      activities: p.activities.map((a) => (a.phase === id ? { ...a, phase: fallback.id } : a)),
      phases: p.phases.filter((x) => x.id !== id),
    }), p0 ? `Fase removida: "${p0.name}" (atividades movidas para "${fallback.name}")` : undefined);
  }

  function reorderPhase(fromId, toId) {
    if (fromId === toId) return;
    mutateProject(phasesEditingProjectId, (p) => {
      const list = p.phases.slice();
      const fromIdx = list.findIndex((x) => x.id === fromId);
      const toIdx = list.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return p;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...p, phases: list };
    }, `Ordem das fases alterada`);
  }

  function handleLogoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      mutateProject(pid, (p) => ({ ...p, company: { ...p.company, logo: reader.result } }), 'Logotipo do cliente atualizado');
    };
    reader.readAsDataURL(file);
  }

  async function createCompany(company) {
    const res = await apiPost(withActingOrg('/api/projects'), { company });
    setProjects((prev) => [...prev, normalizeProject(res.project)]);
    return res.project.id;
  }

  async function cloneCompany(sourceId, company) {
    const source = projects.find((p) => p.id === sourceId);
    if (!source) throw new Error('Empresa de origem não encontrada.');

    const sourceDates = source.activities.map((a) => a.date).filter(Boolean);
    const anchor = sourceDates.length ? sourceDates.reduce((min, d) => (d < min ? d : min)) : null;
    const newAnchor = toISODate(addDays(parseDate(todayISOStr()), 10));
    const deltaDays = anchor ? Math.round((parseDate(newAnchor) - parseDate(anchor)) / 86400000) : 0;
    const shift = (iso) => (iso ? toISODate(addDays(parseDate(iso), deltaDays)) : iso);

    const activities = source.activities.map((a) => ({
      ...a,
      id: uid('m'),
      date: shift(a.date),
      endDate: shift(a.endDate),
      status: 'nao-iniciado',
      notes: '',
      attachments: [],
      comments: [],
      transcript: '',
      subactivities: (a.subactivities || []).filter((s) => !s.deleted).map((s) => ({ ...s, id: uid('s'), done: false, date: shift(s.date) })),
    }));

    const team = source.team.map((m) => ({ ...m, id: uid('team') }));

    const res = await apiPost(withActingOrg('/api/projects'), {
      company,
      activities,
      phases: source.phases,
      team,
      log: [{ ts: new Date().toISOString(), action: `Cronograma clonado a partir de "${source.company.name || 'empresa sem nome'}"`, user: currentUser ? currentUser.name : '' }],
    });
    setProjects((prev) => [...prev, normalizeProject(res.project)]);
    return res.project.id;
  }

  async function deleteCompany(id) {
    await apiDelete(`/api/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjectIds((prev) => prev.filter((pid) => pid !== id));
  }

  function updateCompanyFields(pid, patch) {
    const target = projects.find((p) => p.id === pid);
    const label = patch.name || (target && target.company.name) || 'empresa';
    const prevStatus = target ? (target.company.status || 'ativo') : 'ativo';
    const nextStatus = patch.status !== undefined ? patch.status : prevStatus;
    const statusChanging = patch.status !== undefined && nextStatus !== prevStatus;
    mutateProject(pid, (p) => {
      let activities = p.activities;
      if (statusChanging && nextStatus === 'pausado') {
        // Pausa em cascata: guarda o status anterior de cada atividade ativa (não concluída,
        // não excluída, ainda não pausada individualmente) pra poder restaurar exatamente ao retomar.
        activities = p.activities.map((a) => (
          a.deleted || a.status === 'pausado' || a.status === 'concluido'
            ? a
            : { ...a, statusBeforePause: a.status || 'nao-iniciado', status: 'pausado' }
        ));
      } else if (statusChanging && nextStatus === 'ativo') {
        activities = p.activities.map((a) => (
          a.statusBeforePause ? { ...a, status: a.statusBeforePause, statusBeforePause: '' } : a
        ));
      }
      return { ...p, company: { ...p.company, ...patch }, activities };
    }, statusChanging
      ? `Status da empresa alterado para: ${COMPANY_STATUS_META[nextStatus].label}${nextStatus === 'pausado' ? ' — atividades em andamento pausadas' : ' — atividades pausadas retomadas'}`
      : `Dados da empresa "${label}" atualizados`);
  }

  async function loadUsers() {
    try {
      const res = await apiGet(withActingOrg('/api/users'));
      setUsers(res.users);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function addUser(draft) {
    try {
      const res = await apiPost(withActingOrg('/api/users'), draft);
      setUsers((prev) => [...prev, res.user]);
      addUsersLog(`Usuário criado: ${res.user.name}`);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function loadOrganizations() {
    try {
      const res = await apiGet('/api/organizations');
      setOrganizations(res.organizations);
      setOrgAdminError('');
    } catch (e) {
      setOrgAdminError(e.message);
    }
  }

  async function createOrganization(data) {
    try {
      const res = await apiPost('/api/organizations', data);
      setOrganizations((prev) => [...prev, { ...res.organization, userCount: 0, projectCount: 0 }]);
      setOrgAdminError('');
      return res.organization;
    } catch (e) {
      setOrgAdminError(e.message);
      return null;
    }
  }

  async function updateOrganizationStatus(id, status) {
    try {
      const res = await apiPatch(`/api/organizations/${id}`, { status });
      setOrganizations((prev) => prev.map((o) => (o.id === id ? res.organization : o)));
      setOrgAdminError('');
    } catch (e) {
      setOrgAdminError(e.message);
    }
  }

  function enterOrganization(org) {
    setActingOrg({ id: org.id, name: org.displayName || org.name });
    setShowOrgAdmin(false);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
    setWorkspaceMode('company');
  }

  function exitOrganization() {
    setActingOrg(null);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
  }

  async function updateUser(id, patch) {
    try {
      const res = await apiPatch(`/api/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.user : u)));
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function toggleUserBlock(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const nextBlocked = !u.blocked;
    try {
      const res = await apiPost(`/api/users/${id}/block`, { blocked: nextBlocked, blockReason: u.blockReason });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
      addUsersLog(nextBlocked ? `Usuário bloqueado: ${u.name}` : `Usuário desbloqueado: ${u.name}`);
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function renewUser(id, days) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    try {
      const res = await apiPost(`/api/users/${id}/renew`, { days: days || 30 });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
      addUsersLog(`Acesso renovado: ${u.name} até ${fmtDate(res.user.expiresAt)}`);
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function toggleUserCnpj(id, cnpj) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const has = (u.allowedCnpjs || []).includes(cnpj);
    const nextList = has ? u.allowedCnpjs.filter((c) => c !== cnpj) : [...(u.allowedCnpjs || []), cnpj];
    try {
      const res = await apiPatch(`/api/users/${id}`, { allowedCnpjs: nextList });
      setUsers((prev) => prev.map((x) => (x.id === id ? res.user : x)));
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function resetUserPassword(id, newPassword) {
    try {
      await apiPost(`/api/users/${id}/reset-password`, { newPassword });
      const u = users.find((x) => x.id === id);
      addUsersLog(`Senha redefinida: ${u ? u.name : id}`);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function deleteUser(id) {
    if (id === currentUser.id) return;
    const target = users.find((u) => u.id === id);
    const masters = users.filter((u) => u.role === 'master');
    if (target && target.role === 'master' && masters.length <= 1) return;
    try {
      await apiDelete(`/api/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (target) addUsersLog(`Usuário removido: ${target.name}`);
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  function exportExcel() {
    if (isMulti) {
      const rows = multiActivities.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((a) => ({
        Empresa: a._companyName,
        Nº: a._order,
        Fase: (a._phases.find((p) => p.id === a.phase) || {}).name || '',
        Atividade: a.title,
        Descrição: a.desc,
        Responsável: a.responsible,
        Início: fmtDate(a.date),
        Fim: fmtDate(a.endDate || a.date),
        Obrigatória: a.required ? 'Sim' : 'Não',
        Status: STATUS_META[a.status]?.label || a.status,
        Subatividades: (a.subactivities || []).filter((s) => !s.deleted).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(' | '),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 22 }, { wch: 6 }, { wch: 22 }, { wch: 26 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 50 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
      XLSX.writeFile(wb, 'cronograma-visao-geral.xlsx');
      selectedProjects.forEach((p) => addLog(p.id, 'Cronograma exportado para Excel (visão geral)'));
      return;
    }
    const activities = activeProject.activities.filter((a) => !a.deleted);
    const rows = activities.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((a) => ({
      Nº: orderMap[a.id],
      Fase: activeProject.phases.find((p) => p.id === a.phase)?.name || '',
      Atividade: a.title,
      Descrição: a.desc,
      Responsável: a.responsible,
      Início: fmtDate(a.date),
      Fim: fmtDate(a.endDate || a.date),
      Obrigatória: a.required ? 'Sim' : 'Não',
      Status: STATUS_META[a.status]?.label || a.status,
      Subatividades: (a.subactivities || []).filter((s) => !s.deleted).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(' | '),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 26 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
    const fname = `cronograma-${(activeProject.company.name || 'reforma-tributaria').toLowerCase().replace(/\s+/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fname);
    addLog(pid, 'Cronograma exportado para Excel');
  }

  function exportPdf() {
    if (isMulti) selectedProjects.forEach((p) => addLog(p.id, 'Cronograma exportado para PDF (visão geral)'));
    else addLog(pid, 'Cronograma exportado para PDF');
    window.print();
  }

  const myMentions = [];
  projects.forEach((p) => {
    (p.activities || []).forEach((a) => {
      if (a.deleted) return;
      (a.comments || []).forEach((c) => {
        if ((c.mentions || []).includes(currentUser.id)) {
          myMentions.push({ pid: p.id, companyName: p.company.name || 'Empresa sem nome', activityId: a.id, activityTitle: a.title, commentId: c.id, text: c.text, ts: c.ts, author: c.author || '' });
        }
      });
    });
  });
  myMentions.sort((x, y) => (y.ts || '').localeCompare(x.ts || ''));
  const unreadMentionsCount = myMentions.filter((m) => m.ts > mentionsSeenAt).length;

  const activitiesSorted = activeProject ? sortActivities(activeProject.activities.filter((a) => !a.deleted)) : [];
  const orderMap = buildOrderMap(activitiesSorted);

  const perCompanySorted = {};
  const perCompanyOrderMap = {};
  if (isMulti) {
    selectedProjects.forEach((p) => {
      const sorted = sortActivities(p.activities.filter((a) => !a.deleted));
      perCompanySorted[p.id] = sorted;
      perCompanyOrderMap[p.id] = buildOrderMap(sorted);
    });
  }
  const multiActivities = isMulti ? selectedProjects.flatMap((p) => perCompanySorted[p.id].map((a) => ({
    ...a,
    _pid: p.id,
    _companyName: p.company.nomeFantasia || p.company.name || 'Empresa sem nome',
    _companyColor: p.company.color || '#F5C400',
    _companyLogo: p.company.logo || '',
    _phases: p.phases,
    _team: p.team,
    _order: perCompanyOrderMap[p.id][a.id],
  }))) : [];

  // Ações secundárias do topbar — mesma lista de condições usada pelos botões desktop (linha a linha
  // logo abaixo), só que declarativa, para poder ser renderizada também dentro do menu "Mais" no mobile
  // sem duplicar a lógica de onClick/visibilidade.
  const moreMenuItems = [
    !isMulti && { icon: Settings, label: 'Empresa', onClick: () => setShowSettings(true) },
    canPickCompanies && { icon: Building2, label: 'Trocar empresas', onClick: () => setCompanySelectionConfirmed(false) },
    { icon: Columns3, label: 'Gestão de Atividades', onClick: () => setWorkspaceMode('personal') },
    (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Plus, label: 'Cadastrar empresa', onClick: () => setShowCreateCompany(true) },
    currentUser.role === 'master' && { icon: UserCog, label: 'Usuários', onClick: () => setShowUsers(true) },
    currentUser.isSuperAdmin && { icon: Building2, label: 'Organizações', onClick: () => setShowOrgAdmin(true) },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: LayoutGrid, label: 'Fases', onClick: () => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); } },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Clock, label: `Log (${(activeProject.log || []).length})`, onClick: () => setShowLog(true) },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Trash2, label: 'Lixeira', onClick: () => setShowTrash(true) },
    { icon: FileSpreadsheet, label: 'Excel', onClick: exportExcel },
    { icon: FileText, label: 'PDF', onClick: exportPdf },
  ].filter(Boolean);

  return (
    <div style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], input[type=number], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, input[type=number]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }
        ::-webkit-scrollbar{ height:8px; width:8px; }
        ::-webkit-scrollbar-thumb{ background:var(--border-3); border-radius:4px; }
        @media print {
          .no-print { display:none !important; }
          body, .page-root { background:#fff !important; color:#111 !important; }
        }
      `}</style>

      {actingOrg && (
        <div className="no-print" style={S.actingOrgBanner}>
          <Building2 size={13} /> Super Admin — visualizando como <strong>{actingOrg.name}</strong>
          <button style={S.actingOrgExitBtn} onClick={exitOrganization}>Sair da organização</button>
        </div>
      )}

      <div className="no-print" style={S.topbar}>
        <div style={S.brandRow}>
          {isMulti ? (
            <>
              <div style={S.logoPlaceholder}><LayoutGrid size={18} color="#F5C400" /></div>
              <div>
                <div style={S.brandName}>Visão geral — {selectedProjects.length} empresas</div>
                <div style={S.multiCompanyChips}>
                  {selectedProjects.map((p) => (
                    <span key={p.id} style={{ ...S.multiCompanyChip, borderColor: p.company.color || 'var(--border-3)' }}>
                      <span style={{ ...S.companyColorDot, background: p.company.color || 'var(--text-8)' }} />
                      {p.company.nomeFantasia || p.company.name || 'Sem nome'}
                      {p.company.clientType && CLIENT_TYPE_META[p.company.clientType] ? ` · ${CLIENT_TYPE_META[p.company.clientType].short}` : ''}
                      {(p.company.status || 'ativo') === 'pausado' ? ' ⏸' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoImg} /> : <div style={S.logoPlaceholder}><Building2 size={18} color={activeProject.company.color || '#F5C400'} /></div>}
              <div>
                <div style={S.brandNameRow}>
                  <div style={S.brandName}>{activeProject.company.nomeFantasia || activeProject.company.name || 'Cliente não cadastrado'}</div>
                  {activeProject.company.clientType && CLIENT_TYPE_META[activeProject.company.clientType] && (
                    <span style={{ ...S.companyStatusPill, color: CLIENT_TYPE_META[activeProject.company.clientType].color, background: CLIENT_TYPE_META[activeProject.company.clientType].bg, borderColor: CLIENT_TYPE_META[activeProject.company.clientType].border }}>
                      {CLIENT_TYPE_META[activeProject.company.clientType].label}
                    </span>
                  )}
                  {(activeProject.company.status || 'ativo') === 'pausado' && (
                    <span style={{ ...S.companyStatusPill, display: 'inline-flex', alignItems: 'center', gap: 4, color: COMPANY_STATUS_META.pausado.color, background: COMPANY_STATUS_META.pausado.bg, borderColor: COMPANY_STATUS_META.pausado.border }}>
                      <Pause size={10} /> Pausado{activeProject.company.resumeDate ? ` · retoma ${fmtDate(activeProject.company.resumeDate)}` : ''}
                    </span>
                  )}
                </div>
                {activeProject.company.nomeFantasia && activeProject.company.name && activeProject.company.nomeFantasia !== activeProject.company.name && (
                  <div style={S.brandSecondary}>{activeProject.company.name}</div>
                )}
                <div style={S.brandCnpj}>
                  {activeProject.company.cnpj ? `CNPJ ${activeProject.company.cnpj}` : 'CNPJ não informado'}
                  {activeProject.company.regimeTributario ? ` · ${activeProject.company.regimeTributario}` : ''}
                </div>
              </div>
              {!isMobile && <button style={S.iconBtn} onClick={() => setShowSettings(true)}><Settings size={15} /> Empresa</button>}
            </>
          )}
          {!isMobile && canPickCompanies && (
            <button style={S.iconBtn} onClick={() => setCompanySelectionConfirmed(false)}><Building2 size={15} /> Trocar empresas</button>
          )}
          {!isMobile && (
            <button style={S.iconBtn} onClick={() => setWorkspaceMode('personal')}><Columns3 size={15} /> Gestão de Atividades</button>
          )}
        </div>
        <div style={S.actionsRow}>
          {isMobile && moreMenuItems.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button style={S.iconBtn} onClick={() => setShowMoreMenu((v) => !v)}><MoreHorizontal size={15} /> Mais</button>
              {showMoreMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setShowMoreMenu(false)} />
                  <div style={{ ...S.dropdownMenu, left: 0, right: 'auto' }}>
                    {moreMenuItems.map((item, i) => (
                      <button key={i} style={S.dropdownItem} onClick={() => { setShowMoreMenu(false); item.onClick(); }}>
                        <item.icon size={14} /> {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {!isMobile && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowCreateCompany(true)}><Plus size={15} /> Cadastrar empresa</button>
          )}
          {!isMobile && currentUser.role === 'master' && <button style={S.iconBtn} onClick={() => setShowUsers(true)}><UserCog size={15} /> Usuários</button>}
          {!isMobile && currentUser.isSuperAdmin && <button style={S.iconBtn} onClick={() => setShowOrgAdmin(true)}><Building2 size={15} /> Organizações</button>}
          {!isMobile && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); }}><LayoutGrid size={15} /> Fases</button>
          )}
          {!isMobile && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowLog(true)}><Clock size={15} /> Log ({(activeProject.log || []).length})</button>
          )}
          {!isMobile && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowTrash(true)}><Trash2 size={15} /> Lixeira ({activeProject.activities.filter((a) => a.deleted).length + activeProject.activities.reduce((n, a) => n + (a.deleted ? 0 : (a.subactivities || []).filter((s) => s.deleted).length), 0)})</button>
          )}
          {!isMobile && <button style={S.iconBtn} onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>}
          {!isMobile && <button style={S.iconBtn} onClick={exportPdf}><FileText size={15} /> PDF</button>}
          {isMulti ? (
            <select
              style={{ ...S.iconBtn, cursor: 'pointer', appearance: 'auto' }}
              value=""
              onChange={(e) => { if (e.target.value) addActivity(e.target.value); e.target.value = ''; }}
            >
              <option value="">+ Nova atividade em...</option>
              {selectedProjects.map((p) => <option key={p.id} value={p.id}>{p.company.nomeFantasia || p.company.name || 'Sem nome'}</option>)}
            </select>
          ) : (
            <button style={S.primaryBtn} onClick={() => addActivity(activeProject.id)}><Plus size={15} /> Nova atividade</button>
          )}
          <button
            style={{ ...S.iconBtnGhost, position: 'relative' }}
            title="Menções"
            onClick={() => { setShowMentions(true); markMentionsSeen(); }}
          >
            <Bell size={16} />
            {unreadMentionsCount > 0 && <span style={S.mentionBadge}>{unreadMentionsCount > 9 ? '9+' : unreadMentionsCount}</span>}
          </button>
          <ThemeToggleBtn theme={theme} onToggle={toggleTheme} />
          <div style={S.userBadge}>
            <button style={S.userAvatarBtn} title={`Meu perfil — ${currentUser.name}`} onClick={() => setShowMyProfile(true)}>
              <UserAvatar user={currentUser} size={26} />
            </button>
            {!isMobile && <span style={{ ...S.roleTag, color: ROLE_META[currentUser.role].color, borderColor: ROLE_META[currentUser.role].color }}>{ROLE_META[currentUser.role].label}</span>}
            {!isMobile && <span style={S.userName}>{currentUser.name}</span>}
            <button style={S.iconBtnGhost} title="Sair" onClick={handleLogout}><LogOut size={15} /></button>
          </div>
        </div>
      </div>

      <div className="no-print" style={S.tabs}>
        {[
          { id: 'timeline', label: 'Gantt', icon: CalendarDays },
          { id: 'table', label: 'Tabela', icon: List },
          { id: 'phases', label: 'Fases', icon: LayoutGrid },
          { id: 'kanban', label: 'Quadro', icon: Columns3 },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setView(t.id)} style={{ ...S.tab, ...(view === t.id ? S.tabActive : {}) }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <main style={{ ...S.main, ...(isMobile ? { padding: '14px 12px 0 12px' } : null) }}>
        {!isMulti && view === 'timeline' && (
          <TimelineView
            activities={activitiesSorted}
            phases={activeProject.phases}
            granularity={granularity}
            setGranularity={setGranularity}
            windowAnchor={windowAnchor}
            setWindowAnchor={setWindowAnchor}
            pid={activeProject.id}
            updateActivity={updateActivity}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
          />
        )}
        {!isMulti && view === 'table' && (
          <TableView
            activities={activitiesSorted}
            orderMap={orderMap}
            phases={activeProject.phases}
            team={activeProject.team}
            pid={activeProject.id}
            expanded={expanded}
            setExpanded={setExpanded}
            updateActivity={updateActivity}
            deleteActivity={deleteActivity}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            reorderSub={reorderSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
            companyColor={activeProject.company.color}
          />
        )}
        {!isMulti && view === 'phases' && (
          <PhasesView activities={activitiesSorted} orderMap={orderMap} phases={activeProject.phases} pid={activeProject.id} updateActivity={updateActivity} openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })} companyColor={activeProject.company.color} />
        )}
        {!isMulti && view === 'kanban' && (
          <KanbanView
            activities={activitiesSorted}
            orderMap={orderMap}
            phases={activeProject.phases}
            pid={activeProject.id}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            addActivity={() => addActivity(activeProject.id)}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
          />
        )}

        {isMulti && view === 'timeline' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <TimelineView
              activities={perCompanySorted[p.id]}
              phases={p.phases}
              granularity={granularity}
              setGranularity={setGranularity}
              windowAnchor={windowAnchor}
              setWindowAnchor={setWindowAnchor}
              pid={p.id}
              updateActivity={updateActivity}
              openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
            />
          </div>
        ))}
        {isMulti && view === 'table' && (
          <TableView
            activities={multiActivities}
            expanded={expanded}
            setExpanded={setExpanded}
            updateActivity={updateActivity}
            deleteActivity={deleteActivity}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            reorderSub={reorderSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
            multiMode
          />
        )}
        {isMulti && view === 'phases' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <PhasesView activities={perCompanySorted[p.id]} orderMap={perCompanyOrderMap[p.id]} phases={p.phases} pid={p.id} updateActivity={updateActivity} openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })} companyColor={p.company.color} />
            <button style={{ ...S.iconBtn, marginTop: 8 }} onClick={() => addActivity(p.id)}><Plus size={14} /> Nova atividade em {p.company.name || 'empresa'}</button>
          </div>
        ))}
        {isMulti && view === 'kanban' && (
          <KanbanView
            activities={multiActivities}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
            multiMode
          />
        )}
      </main>

      <div className="no-print" style={S.hint}>
        Alterações são salvas automaticamente e registradas no log. {isMulti ? `Você está vendo a visão geral de ${selectedProjects.length} empresas.` : `Você está vendo o projeto de ${activeProject.company.name || 'um cliente sem nome cadastrado'}.`}
      </div>

      {showLog && activeProject && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
        <SidePanel title="Log de alterações" onClose={() => setShowLog(false)}>
          {(activeProject.log || []).length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
          {(activeProject.log || []).map((l, i) => (
            <div key={i} style={S.logRow}>
              <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
              <div style={S.logAction}>{l.action}</div>
            </div>
          ))}
        </SidePanel>
      )}

      {showTrash && activeProject && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (() => {
        const trashItems = [
          ...activeProject.activities.filter((a) => a.deleted).map((a) => ({ kind: 'activity', id: a.id, title: a.title, deletedAt: a.deletedAt, deletedBy: a.deletedBy })),
          ...activeProject.activities.flatMap((a) => a.deleted ? [] : (a.subactivities || []).filter((s) => s.deleted).map((s) => ({ kind: 'sub', id: s.id, activityId: a.id, title: s.title, parentTitle: a.title, deletedAt: s.deletedAt, deletedBy: s.deletedBy }))),
        ].sort((x, y) => (y.deletedAt || '').localeCompare(x.deletedAt || ''));
        return (
          <SidePanel title="Lixeira" onClose={() => setShowTrash(false)}>
            {trashItems.length === 0 && <div style={S.emptyMuted}>Nada excluído.</div>}
            {trashItems.map((item) => (
              <div key={`${item.kind}-${item.id}`} style={S.trashRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.trashTitle}>
                    {item.title}
                    {item.kind === 'sub' && <span style={S.trashParent}> — subatividade de "{item.parentTitle}"</span>}
                  </div>
                  <div style={S.logTs}>Excluída em {fmtTs(item.deletedAt)}{item.deletedBy ? ` · ${item.deletedBy}` : ''}</div>
                </div>
                <button
                  style={S.iconBtn}
                  onClick={() => item.kind === 'activity' ? restoreActivity(activeProject.id, item.id) : restoreSub(activeProject.id, item.activityId, item.id)}
                >
                  <Undo2 size={14} /> Restaurar
                </button>
              </div>
            ))}
          </SidePanel>
        );
      })()}

      {showMentions && (
        <SidePanel title="Menções" onClose={() => setShowMentions(false)}>
          {myMentions.length === 0 && <div style={S.emptyMuted}>Ninguém te mencionou ainda.</div>}
          {myMentions.map((m) => (
            <div
              key={m.commentId}
              style={S.mentionRow}
              onClick={() => { setOpenActivityId({ pid: m.pid, id: m.activityId }); setShowMentions(false); }}
            >
              <div style={S.logTs}>{m.author || 'Alguém'} · {fmtTs(m.ts)}</div>
              <div style={S.mentionActivity}>{m.activityTitle} <span style={{ opacity: .6 }}>— {m.companyName}</span></div>
              <div style={S.mentionText}>{m.text}</div>
            </div>
          ))}
        </SidePanel>
      )}

      {showSettings && activeProject && (
        <SidePanel title="Empresa e equipe" onClose={() => setShowSettings(false)}>
          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Logotipo do cliente</div>
            <div style={S.logoRow}>
              {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoPreview} /> : <div style={S.logoPreviewEmpty}><Building2 size={22} color="var(--text-7)" /></div>}
              <button style={S.iconBtn} onClick={() => fileInputRef.current && fileInputRef.current.click()}><Upload size={14} /> Enviar logo</button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            </div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Cor master da empresa</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={activeProject.company.color || '#F5C400'} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, color: v } }), 'Cor da empresa atualizada'); }} style={S.colorInput} />
              <div style={S.fieldHint}>Usada pra identificar essa empresa quando várias estiverem selecionadas na visão geral.</div>
            </div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Nome da empresa</div>
            <input type="text" value={activeProject.company.name} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, name: v } })); }} onBlur={() => addLog(pid, `Nome da empresa atualizado: ${activeProject.company.name}`)} placeholder="Razão social" />
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Nome fantasia</div>
            <input type="text" value={activeProject.company.nomeFantasia || ''} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, nomeFantasia: v } })); }} onBlur={() => addLog(pid, `Nome fantasia atualizado: ${activeProject.company.nomeFantasia}`)} placeholder="Nome fantasia" />
            <div style={S.fieldHint}>Usado como identificação principal da empresa nas telas e listagens.</div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Tipo de cliente</div>
            <select
              value={activeProject.company.clientType || ''}
              onChange={(e) => {
                const v = e.target.value;
                mutateProject(pid, (p) => ({ ...p, company: { ...p.company, clientType: v } }), `Tipo de cliente alterado para: ${v ? CLIENT_TYPE_META[v].label : 'não definido'}`);
              }}
            >
              <option value="">Não definido</option>
              {CLIENT_TYPE_ORDER.map((t) => <option key={t} value={t}>{CLIENT_TYPE_META[t].label}</option>)}
            </select>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>CNPJ</div>
            <input type="text" value={activeProject.company.cnpj} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, cnpj: v } })); }} onBlur={() => addLog(pid, `CNPJ atualizado: ${activeProject.company.cnpj}`)} placeholder="00.000.000/0000-00" />
            <div style={S.fieldHint}>Alterar o CNPJ não atualiza sozinho quem já tem acesso — ajuste em "Usuários" se precisar.</div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Status da empresa</div>
            <select
              value={activeProject.company.status || 'ativo'}
              onChange={(e) => {
                const v = e.target.value;
                updateCompanyFields(pid, { status: v, resumeDate: v === 'ativo' ? '' : activeProject.company.resumeDate });
              }}
            >
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
            </select>
            {activeProject.company.status === 'pausado' && (
              <div style={{ marginTop: 8 }}>
                <div style={S.fieldHint}>Previsão de retomada (opcional)</div>
                <input
                  type="date"
                  value={activeProject.company.resumeDate || ''}
                  onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, resumeDate: v } })); }}
                  onBlur={() => addLog(pid, `Previsão de retomada atualizada: ${fmtDate(activeProject.company.resumeDate)}`)}
                />
              </div>
            )}
          </div>

          {(activeProject.company.nomeFantasia || activeProject.company.regimeTributario) && (
            <div style={S.settingsBlock}>
              <div style={S.settingsLabel}>Dados da Receita Federal</div>
              <div style={S.cnpjFetchGrid}>
                <div><div style={S.fieldHint}>Nome fantasia</div><strong>{activeProject.company.nomeFantasia || '—'}</strong></div>
                <div><div style={S.fieldHint}>Regime tributário</div><strong>{activeProject.company.regimeTributario || '—'}</strong></div>
                <div><div style={S.fieldHint}>Porte</div><strong>{activeProject.company.porte || '—'}</strong></div>
                <div><div style={S.fieldHint}>UF / Município</div><strong>{[activeProject.company.uf, activeProject.company.municipio].filter(Boolean).join(' — ') || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><div style={S.fieldHint}>CNAE principal</div><strong>{activeProject.company.cnaePrincipal ? `${activeProject.company.cnaePrincipal} — ${activeProject.company.descricaoCnae}` : '—'}</strong></div>
              </div>

              {(activeProject.company.cnaesSecundarios || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.fieldHint}>CNAEs secundários</div>
                  {activeProject.company.cnaesSecundarios.map((c) => (
                    <div key={c.codigo} style={S.cnpjListRow}>{c.codigo} — {c.descricao}</div>
                  ))}
                </div>
              )}

              {(activeProject.company.qsa || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.fieldHint}>Quadro societário</div>
                  {activeProject.company.qsa.map((s, i) => (
                    <div key={i} style={S.cnpjListRow}>{s.nome} <span style={{ opacity: .6 }}>— {s.qualificacao}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Áreas e responsáveis do cliente</div>
            {(activeProject.company.areas || []).map((row) => (
              <div key={row.id} style={S.areaRow}>
                <input type="text" value={row.area} onChange={(e) => updateAreaRow(row.id, { area: e.target.value })} onBlur={() => commitAreaRow(row.id)} placeholder="Área (ex: Compras)" style={{ marginBottom: 5 }} />
                <input type="text" value={row.name} onChange={(e) => updateAreaRow(row.id, { name: e.target.value })} onBlur={() => commitAreaRow(row.id)} placeholder="Nome do responsável" style={{ marginBottom: 5 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="email" value={row.email} onChange={(e) => updateAreaRow(row.id, { email: e.target.value })} onBlur={() => commitAreaRow(row.id)} placeholder="email@cliente.com.br" />
                  <button style={S.iconBtnGhost} onClick={() => removeAreaRow(row.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addAreaRow}><Plus size={14} /> Nova área</button>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Equipe / responsáveis</div>
            <div style={S.fieldHint}>Cada responsável pode ser só um nome/área genérica, ou pode estar vinculado a um usuário real do sistema — aí dá pra ver o login dele, se é PRICETAX ou {activeProject.company.name || 'do cliente'}, e em qual área ele atua.</div>
            <div style={{ marginTop: 10 }}>
              {activeProject.team.map((m) => {
                const candidate = teamCandidates.find((c) => c.id === m.userId);
                const username = m.username || (candidate && candidate.username) || '';
                const empresa = m.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX';
                return (
                  <div key={m.id} style={S.teamCard}>
                    <div style={S.teamCardTop}>
                      <div style={S.teamCardName}>{m.name}</div>
                      <TeamLinkBadge link={m} companyName={activeProject.company.name} />
                      <button style={S.chipX} onClick={() => removeMember(m.id)}><X size={13} /></button>
                    </div>
                    {m.role && (
                      <div style={S.teamCardMeta}>{empresa}{username ? ` — usuário: ${username}` : ' — sem login próprio'}</div>
                    )}
                    <input
                      type="text"
                      value={m.area}
                      onChange={(e) => updateMemberArea(m.id, e.target.value)}
                      onBlur={() => commitMemberArea(m.id)}
                      placeholder="Área (ex: Financeiro)"
                      style={S.teamAreaInput}
                    />
                  </div>
                );
              })}
            </div>
            <div style={S.memberAddRow}>
              <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nome ou área genérica (sem login)" onKeyDown={(e) => e.key === 'Enter' && addMember()} />
              <button style={S.iconBtn} onClick={addMember}><Plus size={14} /></button>
            </div>
            <div style={{ ...S.fieldHint, marginTop: 10 }}>Ou vincule um usuário já cadastrado no sistema:</div>
            <div style={S.linkUserRow}>
              <select value={linkUserId} onChange={(e) => setLinkUserId(e.target.value)}>
                <option value="">Selecione o usuário...</option>
                {teamCandidates.filter((u) => !activeProject.team.some((m) => m.userId === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX'}</option>
                ))}
              </select>
              <input type="text" value={linkArea} onChange={(e) => setLinkArea(e.target.value)} placeholder="Área em que ele atua (ex: Financeiro)" />
              <button
                style={{ ...S.iconBtn, justifyContent: 'center' }}
                disabled={!linkUserId}
                onClick={() => {
                  const u = teamCandidates.find((c) => c.id === linkUserId);
                  if (!u) return;
                  linkMember(u, linkArea.trim());
                  setLinkUserId('');
                  setLinkArea('');
                }}
              >
                <Plus size={14} /> Vincular
              </button>
            </div>
          </div>
        </SidePanel>
      )}

      {showPhases && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (() => {
        const target = projects.find((p) => p.id === phasesEditingProjectId);
        if (!target) return null;
        return (
          <SidePanel title={`Fases — ${target.company.name || 'projeto'}`} onClose={() => setShowPhases(false)}>
            <div style={S.emptyMuted}>As fases agrupam as atividades nas visões Gantt, Fases e no Quadro. Cada uma tem nome, cor e uma linha de descrição.</div>
            <div style={{ marginTop: 16 }}>
              {target.phases.map((p) => (
                <div
                  key={p.id}
                  style={{ ...S.phaseEditRow, ...(dragPhaseId === p.id ? S.phaseEditRowDragging : {}) }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { reorderPhase(dragPhaseId, p.id); setDragPhaseId(null); }}
                >
                  <div
                    style={S.phaseDragHandle}
                    title="Arraste para reordenar"
                    draggable
                    onDragStart={() => setDragPhaseId(p.id)}
                    onDragEnd={() => setDragPhaseId(null)}
                  >
                    <GripVertical size={15} color="var(--text-7)" />
                  </div>
                  <input type="color" value={p.color} onChange={(e) => updatePhase(p.id, { color: e.target.value }, `Cor da fase "${p.name}" alterada`)} style={S.colorInput} />
                  <div style={{ flex: 1 }}>
                    <input type="text" value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} onBlur={() => addLog(phasesEditingProjectId, `Fase renomeada: "${p.name}"`)} placeholder="Nome da fase" />
                    <input type="text" value={p.sub} onChange={(e) => updatePhase(p.id, { sub: e.target.value })} onBlur={() => addLog(phasesEditingProjectId, `Descrição da fase "${p.name}" alterada`)} placeholder="Descrição curta" style={{ marginTop: 6, opacity: .85 }} />
                  </div>
                  <button style={S.iconBtnGhost} onClick={() => deletePhase(p.id)} disabled={target.phases.length <= 1} title={target.phases.length <= 1 ? 'Deixe pelo menos uma fase' : 'Excluir fase'}>
                    <Trash2 size={14} color={target.phases.length <= 1 ? 'var(--text-8)' : 'var(--text-5)'} />
                  </button>
                </div>
              ))}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addPhase}><Plus size={14} /> Nova fase</button>
          </SidePanel>
        );
      })()}

      {openActivityId && (() => {
        const project = projects.find((p) => p.id === openActivityId.pid);
        const activity = project && project.activities.find((a) => a.id === openActivityId.id);
        if (!project || !activity) return null;
        const om = buildOrderMap(sortActivities(project.activities));
        return (
          <ActivityDetailModal
            activity={activity}
            orderMap={om}
            phases={project.phases}
            team={project.team}
            log={project.log}
            companyName={project.company.name}
            currentUser={currentUser}
            pid={project.id}
            onClose={() => setOpenActivityId(null)}
            updateActivity={updateActivity}
            deleteActivity={(tPid, id) => { if (deleteActivity(tPid, id)) setOpenActivityId(null); }}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            reorderSub={reorderSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            addComment={addComment}
            removeComment={removeComment}
            updateComment={updateComment}
            addLink={addLink}
            removeLink={removeLink}
            toggleParticipant={toggleParticipant}
          />
        );
      })()}

      {showCreateCompany && (
        <CreateCompanyModal
          onClose={() => setShowCreateCompany(false)}
          onCreate={async (company) => {
            const newId = await createCompany(company);
            setSelectedProjectIds((prev) => [...prev, newId]);
            setShowCreateCompany(false);
          }}
        />
      )}

      {showMyProfile && (
        <MyProfileModal
          user={currentUser}
          onClose={() => setShowMyProfile(false)}
          onSave={async (avatar) => { await updateMyAvatar(avatar); setShowMyProfile(false); }}
        />
      )}
    </div>
  );
}

function LoadingScreen({ theme }) {
  return (
    <div style={S.page}>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <BrandLogo theme={theme} style={S.loginLogo} />
          <div style={S.loginSub}>Carregando...</div>
        </div>
      </div>
    </div>
  );
}

function LoginGate({ onLogin, loginError, theme, onToggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username || !password || submitting) return;
    setSubmitting(true);
    await onLogin(username, password);
    setSubmitting(false);
  }

  return (
    <div style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=password] {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:9px 10px; font-size:13px; width:100%;
        }
        input[type=text]:focus, input[type=password]:focus { outline:none; border-color:#F5C400; }
      `}</style>
      <div style={S.themeToggleCorner}>
        <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
      </div>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <BrandLogo theme={theme} style={S.loginLogo} />
          <div style={S.loginEyebrow}>Cronograma de Reforma Tributária</div>
          <h1 style={S.loginTitle}>Entrar</h1>
          <p style={S.loginSub}>Use seu usuário e senha para acessar o cronograma.</p>
          {loginError && (
            <div style={S.loginBlockedMsg}>{loginError.message}</div>
          )}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" autoComplete="username" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" autoComplete="current-password" />
            <button type="submit" style={S.primaryBtn} disabled={submitting}>{submitting ? 'Entrando...' : 'Entrar'}</button>
          </form>
        </div>
      </div>
    </div>
  );
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

function SuperAdminScreen({ organizations, error, onClose, onCreate, onSetStatus, onEnter, theme, onToggleTheme }) {
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
    <div style={S.page}>
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
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} style={S.iconBtn} />
          <button style={S.primaryBtn} onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> Nova organização</button>
          <button style={S.iconBtn} onClick={onClose}><X size={14} /> Voltar ao cronograma</button>
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
          <button style={{ ...S.primaryBtn, marginTop: 10 }} onClick={submitCreate} disabled={creating}>
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

function UsersManagementScreen({
  users, currentUser, registeredProjects, usersPanelError,
  onClose, onCreateUser, onUpdateUser, onToggleBlock, onRenew, onResetPassword, onDeleteUser, onToggleCnpj,
  theme, onToggleTheme,
}) {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isMobile = useIsMobile();

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
    <div style={S.page}>
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
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} style={S.iconBtn} />
          <button style={S.primaryBtn} onClick={() => setShowCreate(true)}><Plus size={14} /> Novo usuário</button>
          <button style={S.iconBtn} onClick={onClose}><X size={14} /> Voltar ao cronograma</button>
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
              <div style={{ width: 80, display: 'flex', gap: 2, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button style={S.iconBtnGhost} title="Editar" onClick={() => setEditingId(u.id)}><Pencil size={14} /></button>
                <button
                  style={S.iconBtnGhost}
                  title={u.blocked ? 'Desbloquear' : 'Bloquear'}
                  onClick={() => onToggleBlock(u.id)}
                  disabled={u.id === currentUser.id}
                >
                  {u.blocked ? <Check size={14} color="#3ecf6e" /> : <Trash2 size={14} color={u.id === currentUser.id ? 'var(--text-8)' : '#e2574c'} />}
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
              <div style={S.usersMobileActionsRow} onClick={(e) => e.stopPropagation()}>
                <button style={S.mobileIconBtn} title="Editar" onClick={() => setEditingId(u.id)}><Pencil size={16} /></button>
                <button
                  style={S.mobileIconBtn}
                  title={u.blocked ? 'Desbloquear' : 'Bloquear'}
                  onClick={() => onToggleBlock(u.id)}
                  disabled={u.id === currentUser.id}
                >
                  {u.blocked ? <Check size={16} color="#3ecf6e" /> : <Trash2 size={16} color={u.id === currentUser.id ? 'var(--text-8)' : '#e2574c'} />}
                </button>
              </div>
            </div>
            )
          ))}
          {filtered.length === 0 && <div style={{ ...S.emptyMuted, padding: 24 }}>Nenhum usuário encontrado.</div>}
        </div>
      </div>

      {showCreate && (
        <NewUserModal onCreate={(draft) => { onCreateUser(draft); setShowCreate(false); }} onClose={() => setShowCreate(false)} />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          currentUser={currentUser}
          registeredProjects={registeredProjects}
          onClose={() => setEditingId(null)}
          onUpdate={onUpdateUser}
          onToggleBlock={onToggleBlock}
          onRenew={onRenew}
          onResetPassword={onResetPassword}
          onToggleCnpj={onToggleCnpj}
          onDelete={(id) => { onDeleteUser(id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

function NewUserModal({ onCreate, onClose }) {
  const [draft, setDraft] = useState({ username: '', password: '', name: '', role: 'cliente', avatar: '', personalOnly: false });
  const isMobile = useIsMobile();

  function submit() {
    if (!draft.username || !draft.password || !draft.name) return;
    onCreate(draft);
  }

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(440px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Novo usuário</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
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
        <div style={S.subSectionLabel}>Senha inicial</div>
        <input type="password" value={draft.password} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} placeholder="Senha inicial" />
        <div style={S.subSectionLabel}>Avatar (opcional)</div>
        <AvatarPicker value={draft.avatar} onChange={(avatar) => setDraft((d) => ({ ...d, avatar }))} />
        <label style={{ ...S.cnpjCheckRow, marginTop: 14 }}>
          <input type="checkbox" checked={draft.personalOnly} onChange={(e) => setDraft((d) => ({ ...d, personalOnly: e.target.checked }))} />
          Acesso apenas à Gestão de Atividades (sem acesso a Empresas)
        </label>
        <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit}><Plus size={14} /> Criar usuário</button>
      </div>
    </div>
  );
}

function EditUserModal({ user: u, currentUser, registeredProjects, onClose, onUpdate, onToggleBlock, onRenew, onResetPassword, onToggleCnpj, onDelete }) {
  const isSelf = u.id === currentUser.id;
  const [draftName, setDraftName] = useState(u.name);
  const [draftUsername, setDraftUsername] = useState(u.username);
  const [draftEmail, setDraftEmail] = useState(u.email);
  const [draftBlockReason, setDraftBlockReason] = useState(u.blockReason || '');
  const isMobile = useIsMobile();

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(520px, 100%)', height: 'auto', maxHeight: '88vh', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserAvatar user={u} size={30} />
            <div style={{ fontSize: 17, fontWeight: 800 }}>{u.name}</div>
          </div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
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

        {u.role === 'cliente' && (
          <div style={{ marginTop: 12 }}>
            <div style={S.fieldHint}>CNPJ do cliente que este usuário enxerga</div>
            <select value={u.cnpj} onChange={(e) => onUpdate(u.id, { cnpj: e.target.value })}>
              <option value="">— selecione o CNPJ —</option>
              {registeredProjects.map((p) => <option key={p.id} value={p.company.cnpj}>{p.company.name || 'Sem nome'} — {p.company.cnpj}</option>)}
            </select>
          </div>
        )}

        {u.role === 'pricetax' && (
          <div style={{ marginTop: 12 }}>
            <div style={S.fieldHint}>Clientes liberados para este usuário</div>
            {registeredProjects.length === 0 && <div style={S.emptyMuted}>Nenhum cliente com CNPJ cadastrado ainda.</div>}
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
          </div>
        )}

        {u.role === 'master' && <div style={{ ...S.fieldHint, marginTop: 12 }}>Vê todos os projetos, sem precisar liberar nada.</div>}

        <div style={{ marginTop: 12 }}>
          <label style={S.cnpjCheckRow}>
            <input type="checkbox" checked={!!u.personalOnly} onChange={(e) => onUpdate(u.id, { personalOnly: e.target.checked })} />
            Acesso apenas à Gestão de Atividades (sem acesso a Empresas)
          </label>
          {u.personalOnly && (
            <div style={S.fieldHint}>Ao entrar, este usuário vai direto para o quadro pessoal — não vê a tela de empresas.</div>
          )}
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

        <button style={{ ...S.iconBtnGhost, marginTop: 14 }} onClick={() => onDelete(u.id)} disabled={isSelf}>
          <Trash2 size={13} color={isSelf ? 'var(--text-8)' : 'var(--text-5)'} /> {isSelf ? ' (é você)' : ' Remover usuário'}
        </button>
      </div>
    </div>
  );
}

function MyProfileModal({ user, onClose, onSave }) {
  const [avatar, setAvatar] = useState(user.avatar || '');
  const isMobile = useIsMobile();
  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(420px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Meu perfil</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={S.myProfilePreview}>
          <UserAvatar user={{ ...user, avatar }} size={64} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{user.name}</div>
            <span style={{ ...S.roleTag, color: ROLE_META[user.role].color, borderColor: ROLE_META[user.role].color }}>{ROLE_META[user.role].label}</span>
          </div>
        </div>

        <div style={S.subSectionLabel}>Escolha seu avatar</div>
        <AvatarPicker value={avatar} onChange={setAvatar} />

        <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={() => onSave(avatar)}>
          Salvar
        </button>
      </div>
    </div>
  );
}

function CreateCompanyModal({ onClose, onCreate, cloneSource }) {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(null);
  const [form, setForm] = useState({ name: '', nomeFantasia: '', color: PHASE_COLORS[0], logo: '', clientType: '' });
  const isMobile = useIsMobile();

  function handleLogoPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  async function buscar() {
    if (!cnpj.trim()) return;
    setLoading(true);
    setError('');
    setFetched(null);
    try {
      const res = await apiPost('/api/cnpj/lookup', { cnpj });
      if (res.erro) {
        setError(res.erro);
        setForm((f) => ({ ...f, name: '', nomeFantasia: '' }));
      } else {
        setFetched(res);
        setForm((f) => ({ ...f, name: res.razaoSocial || '', nomeFantasia: res.nomeFantasia || '' }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!form.name.trim() || !form.clientType) return;
    setSaving(true);
    try {
      await onCreate({
        cnpj: (fetched && fetched.cnpjFormatado) || cnpj,
        name: form.name,
        nomeFantasia: form.nomeFantasia,
        clientType: form.clientType,
        color: form.color,
        logo: form.logo,
        regimeTributario: fetched ? fetched.regimeTributario : '',
        porte: fetched ? fetched.porte : '',
        uf: fetched ? fetched.uf : '',
        municipio: fetched ? fetched.municipio : '',
        cnaePrincipal: fetched ? fetched.cnaePrincipal : '',
        descricaoCnae: fetched ? fetched.descricaoCnae : '',
        cnaesSecundarios: fetched ? fetched.cnaesSecundarios : [],
        qsa: fetched ? fetched.qsa : [],
      });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif", ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <style>{`
        input[type=text], input[type=email], input[type=password], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
      `}</style>
      <div style={{ ...S.detailBox, width: 'min(560px, 100%)', height: 'auto', maxHeight: '88vh', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{cloneSource ? 'Clonar empresa' : 'Cadastrar empresa'}</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        {cloneSource && (
          <div style={{ ...S.fieldHint, marginBottom: 12 }}>
            As atividades de <strong>{cloneSource.company.name || 'empresa de origem'}</strong> serão copiadas para essa nova empresa. A primeira atividade passará a começar em {fmtDate(toISODate(addDays(parseDate(todayISOStr()), 10)))}, e as demais serão recalculadas a partir daí, mantendo exatamente o mesmo espaçamento entre elas.
          </div>
        )}

        <div style={S.subSectionLabel}>CNPJ</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <button style={{ ...S.iconBtn, flexShrink: 0 }} onClick={buscar} disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar dados'}
          </button>
        </div>
        <div style={S.fieldHint}>Buscamos automaticamente na Receita Federal: razão social, nome fantasia, regime tributário, porte, CNAEs e sócios.</div>

        {error && <div style={{ ...S.loginBlockedMsg, marginTop: 12 }}>{error}</div>}

        {(fetched || error) && (
          <>
            <div style={S.subSectionLabel}>Razão social</div>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Razão social" />

            <div style={S.subSectionLabel}>Nome fantasia</div>
            <input type="text" value={form.nomeFantasia} onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value }))} placeholder="Nome fantasia" />

            <div style={S.subSectionLabel}>Tipo de cliente</div>
            <div style={S.priorityPickerRow}>
              {CLIENT_TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  style={{ ...S.priorityPickerChip, color: CLIENT_TYPE_META[t].color, background: form.clientType === t ? CLIENT_TYPE_META[t].bg : 'transparent', borderColor: form.clientType === t ? CLIENT_TYPE_META[t].border : 'var(--border-3)' }}
                  onClick={() => setForm((f) => ({ ...f, clientType: t }))}
                >
                  {CLIENT_TYPE_META[t].label}
                </button>
              ))}
            </div>
            {!form.clientType && <div style={{ ...S.fieldHint, color: '#e2574c', marginTop: 4 }}>Selecione o tipo de cliente pra continuar.</div>}

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Cor master da empresa</div>
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

            {fetched && (
              <div style={S.accessBlock}>
                <div style={S.settingsLabel}>Dados da Receita</div>
                <div style={S.cnpjFetchGrid}>
                  <div><div style={S.fieldHint}>Regime tributário</div><strong>{fetched.regimeTributario}</strong></div>
                  <div><div style={S.fieldHint}>Porte</div><strong>{fetched.porte || '—'}</strong></div>
                  <div><div style={S.fieldHint}>UF / Município</div><strong>{[fetched.uf, fetched.municipio].filter(Boolean).join(' — ') || '—'}</strong></div>
                  <div><div style={S.fieldHint}>CNAE principal</div><strong>{fetched.cnaePrincipal ? `${fetched.cnaePrincipal} — ${fetched.descricaoCnae}` : '—'}</strong></div>
                </div>

                {fetched.cnaesSecundarios && fetched.cnaesSecundarios.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={S.fieldHint}>CNAEs secundários</div>
                    {fetched.cnaesSecundarios.map((c) => (
                      <div key={c.codigo} style={S.cnpjListRow}>{c.codigo} — {c.descricao}</div>
                    ))}
                  </div>
                )}

                {fetched.qsa && fetched.qsa.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={S.fieldHint}>Quadro societário</div>
                    {fetched.qsa.map((s, i) => (
                      <div key={i} style={S.cnpjListRow}>{s.nome} <span style={{ opacity: .6 }}>— {s.qualificacao}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={saving || !form.name.trim() || !form.clientType}>
              {saving ? (cloneSource ? 'Clonando...' : 'Criando...') : (cloneSource ? 'Clonar empresa' : 'Criar empresa')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 32 }) {
  const color = ROLE_META[user.role]?.color || 'var(--text-5)';
  const initial = (user.name || user.username || '?').slice(0, 1).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: user.avatar ? 'var(--bg-4)' : `${color}2a`,
      border: `1px solid ${color}55`,
      fontSize: size * 0.55,
      fontWeight: 800,
      color,
    }}>
      {user.avatar || initial}
    </div>
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

function CompanyBadge({ name, color, logo, small }) {
  return (
    <div style={small ? S.companyBadgeSmall : S.companyBadge}>
      {logo ? <img src={logo} alt="" style={S.companyBadgeLogo} /> : <span style={{ ...S.companyColorDot, background: color || 'var(--text-8)' }} />}
      <span style={S.companyBadgeName}>{name}</span>
    </div>
  );
}

function TeamLinkBadge({ link, companyName }) {
  if (!link || !link.role) return null;
  const isClient = link.role === 'cliente';
  const color = isClient ? '#3ecf6e' : '#3ea6ff';
  const label = isClient ? (companyName || 'Cliente') : 'PRICETAX';
  return <span style={{ ...S.teamLinkBadge, color, borderColor: `${color}55`, background: `${color}1a` }}>{label}</span>;
}

function CompanySectionHeader({ project, onEditPhases }) {
  const c = project.company;
  return (
    <div style={S.companySectionHeader}>
      {c.logo ? <img src={c.logo} alt="" style={S.companySectionLogo} /> : <div style={{ ...S.companySectionLogoEmpty, background: c.color || 'var(--bg-4)' }}><Building2 size={16} color="#111" /></div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.companySectionName}>{c.name || 'Empresa sem nome'}</div>
        <div style={S.companySectionCnpj}>{c.cnpj || 'CNPJ não informado'}</div>
      </div>
      <span style={{ ...S.companyColorDot, background: c.color || 'var(--text-8)' }} />
      <button style={S.iconBtnGhost} title="Editar fases desta empresa" onClick={onEditPhases}><LayoutGrid size={14} /></button>
    </div>
  );
}

function EditCompanyModal({ project, onClose, onSave }) {
  const c = project.company;
  const [form, setForm] = useState({ name: c.name || '', nomeFantasia: c.nomeFantasia || '', color: c.color || PHASE_COLORS[0], logo: c.logo || '', status: c.status || 'ativo', resumeDate: c.resumeDate || '', clientType: c.clientType || '' });
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

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

  return (
    <div style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif", ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <style>{`
        input[type=text], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus { outline:none; border-color:#F5C400; }
      `}</style>
      <div style={{ ...S.detailBox, width: 'min(480px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Editar empresa</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
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

        <div style={S.subSectionLabel}>Status da empresa</div>
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

        <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={saving || !form.name.trim()}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

function CompanySelectorScreen({ projects, initialSelected, onConfirm, onLogout, onCreateNew, onUpdateCompany, onDeleteCompany, onCloneCompany, onGoPersonal, theme, onToggleTheme }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [editingProject, setEditingProject] = useState(null);
  const [search, setSearch] = useState('');
  const isMobile = useIsMobile();

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const term = search.trim().toLowerCase();
  const filteredProjects = term
    ? projects.filter((p) => {
        const c = p.company;
        return [c.nomeFantasia, c.name, c.cnpj].filter(Boolean).some((v) => v.toLowerCase().includes(term));
      })
    : projects;

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

  function handleDelete(e, p) {
    e.stopPropagation();
    const name = p.company.name || 'esta empresa';
    if (window.confirm(`Excluir "${name}" e todo o cronograma dela? Essa ação não pode ser desfeita.`)) {
      onDeleteCompany(p.id);
    }
  }

  const allChecked = filteredProjects.length > 0 && filteredProjects.every((p) => selected.has(p.id));

  return (
    <div style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=checkbox]{ accent-color:#F5C400; width:16px; height:16px; }
        .company-card .company-card-actions { opacity: .4; transition: opacity .12s; }
        .company-card:hover .company-card-actions { opacity: 1; }
      `}</style>
      <div style={S.companySelectorWrap}>
        <div style={S.companySelectorHeader}>
          <BrandLogo theme={theme} style={{ ...S.loginLogo, marginBottom: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onGoPersonal && (
              <button style={S.companyHeaderShortcut} onClick={onGoPersonal} title="Ir para o seu quadro pessoal de tarefas">
                <Columns3 size={14} /> Gestão de Atividades
              </button>
            )}
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
            <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <h1 style={S.loginTitle}>Quais empresas você quer acompanhar?</h1>
        <p style={S.loginSub}>Escolha uma, várias, ou marque "Selecionar todas" pra ter a visão geral. Dá pra trocar depois clicando em "Trocar empresas".</p>

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
            <label style={S.companySelectAllRow}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              {term ? `Selecionar todas as encontradas (${filteredProjects.length})` : `Selecionar todas (${projects.length})`}
            </label>
            {filteredProjects.length === 0 && (
              <div style={S.emptyMuted}>Nenhuma empresa encontrada para "{search}".</div>
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
                return (
                  <div key={p.id} className="company-card" style={{ ...S.companyCard, ...(isMobile ? S.companyCardMobile : null), borderLeft: `3px solid ${isPaused ? COMPANY_STATUS_META.pausado.color : isSelected ? accent : 'var(--border-2)'}`, ...(isPaused ? { opacity: .78 } : {}) }}>
                    <label style={{ ...S.companyCardMain, ...(isMobile ? S.companyCardMainMobile : null) }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} />
                      {p.company.logo ? <img src={p.company.logo} alt="" style={S.companyCardLogo} /> : <div style={{ ...S.companyCardLogoEmpty, background: p.company.color || 'var(--bg-4)' }}><Building2 size={16} color="#111" /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.companyCardNameRow}>
                          <div
                            style={{ ...S.companyCardName, cursor: 'pointer' }}
                            title="Duplo clique para entrar direto nessa empresa"
                            onDoubleClick={(e) => { e.preventDefault(); onConfirm([p.id]); }}
                          >
                            {p.company.nomeFantasia || p.company.name || 'Empresa sem nome'}
                          </div>
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
                      </div>
                    </label>
                    <div style={{ ...S.companyCardProgress, ...(isMobile ? S.companyCardProgressMobile : null) }}>
                      <div style={S.companyCardDonutWrap}>
                        <svg viewBox="0 0 32 32" width="34" height="34">
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
                        title={isPaused ? 'Retomar projeto (1 clique) — reativa as atividades pausadas' : 'Pausar projeto (1 clique) — pausa todas as atividades em andamento'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateCompany(p.id, isPaused ? { status: 'ativo', resumeDate: '' } : { status: 'pausado' });
                        }}
                      >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button style={S.iconBtnGhost} title="Clonar atividades para uma nova empresa" onClick={(e) => { e.stopPropagation(); onCloneCompany(p); }}><Copy size={14} /></button>
                      <button style={S.iconBtnGhost} title="Editar empresa" onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}><Pencil size={14} /></button>
                      <button style={S.iconBtnGhost} title="Excluir empresa" onClick={(e) => handleDelete(e, p)}><Trash2 size={14} color="#e2574c" /></button>
                    </div>
                    <span style={{ ...S.companyColorDot, background: accent }} />
                  </div>
                );
              })}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 12 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar nova empresa</button>
          </div>
        )}

        {projects.length > 0 && (
          <button style={{ ...S.primaryBtn, marginTop: 16, width: 'min(1240px, 96%)', justifyContent: 'center' }} disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
            Continuar {selected.size > 0 ? `(${selected.size} selecionada${selected.size === 1 ? '' : 's'})` : ''}
          </button>
        )}
      </div>

      {editingProject && (
        <EditCompanyModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={async (patch) => onUpdateCompany(editingProject.id, patch)}
        />
      )}
    </div>
  );
}

function WorkspaceGateScreen({ user, onPickCompany, onPickPersonal, onLogout, theme, onToggleTheme }) {
  return (
    <div style={S.page}>
      <div style={S.companySelectorWrap}>
        <div style={S.companySelectorHeader}>
          <BrandLogo theme={theme} style={{ ...S.loginLogo, marginBottom: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
            <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <h1 style={S.loginTitle}>Olá, {(user.name || '').split(' ')[0] || user.username}</h1>
        <p style={S.loginSub}>Onde você quer trabalhar agora? Dá pra trocar a qualquer momento.</p>

        <div style={S.workspaceChoices}>
          <button style={S.workspaceCard} onClick={onPickCompany}>
            <Building2 size={26} color="#F5C400" />
            <div style={S.workspaceCardTitle}>Empresas</div>
            <div style={S.workspaceCardDesc}>Cronogramas de reforma tributária das empresas que você acompanha.</div>
          </button>
          <button style={S.workspaceCard} onClick={onPickPersonal}>
            <Columns3 size={26} color="#F5C400" />
            <div style={S.workspaceCardTitle}>Gestão de Atividades</div>
            <div style={S.workspaceCardDesc}>Seu quadro pessoal — organize tarefas, compromissos e pendências, sem vincular a nenhuma empresa.</div>
          </button>
        </div>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridade' },
  { value: 'dueDate', label: 'Prazo' },
  { value: 'createdAt', label: 'Data de criação' },
  { value: 'updatedAt', label: 'Última atualização' },
  { value: 'name', label: 'Nome' },
];

function sortCards(cards, mode) {
  if (!mode || mode === 'manual') return cards;
  const list = cards.slice();
  const priorityRank = (c) => { const i = CARD_PRIORITY_ORDER.indexOf(c.priority); return i === -1 ? CARD_PRIORITY_ORDER.length : i; };
  if (mode === 'priority') return list.sort((a, b) => priorityRank(a) - priorityRank(b));
  if (mode === 'dueDate') return list.sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'));
  if (mode === 'createdAt') return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (mode === 'updatedAt') return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (mode === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return list;
}

function cardMatchesFilters(card, { search, priority, dueBucket, tags, status }) {
  if (status) {
    const cardStat = cardStatusOf(card);
    if (status === 'nao-concluida' && cardStat === 'concluida') return false;
    if (status !== 'nao-concluida' && cardStat !== status) return false;
  }
  if (priority && priority.length && !priority.includes(card.priority || '')) return false;
  if (tags && tags.length && !tags.every((t) => (card.tags || []).includes(t))) return false;
  if (dueBucket) {
    const tone = dueDateTone(card);
    if (dueBucket === 'overdue' && tone !== 'overdue') return false;
    if (dueBucket === 'today' && tone !== 'today') return false;
    if (dueBucket === 'week' && tone !== 'today' && tone !== 'soon') return false;
    if (dueBucket === 'none' && card.dueDate) return false;
  }
  if (search) {
    const q = search.toLowerCase();
    const hay = `${card.title} ${card.desc || ''} ${(card.tags || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  function dismissToast(id) { setToasts((t) => t.filter((x) => x.id !== id)); }
  function pushToast({ message, actionLabel, onAction, ttlMs = 5000 }) {
    const id = uid('toast');
    setToasts((t) => [...t, { id, message, actionLabel, onAction }]);
    if (ttlMs) setTimeout(() => dismissToast(id), ttlMs);
    return id;
  }
  function pushUndoToast(message, undoFn, ttlMs = 6000) {
    return pushToast({ message, actionLabel: 'Desfazer', onAction: undoFn, ttlMs });
  }
  return { toasts, pushToast, pushUndoToast, dismissToast };
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div style={S.toastStack}>
      {toasts.map((t) => (
        <div key={t.id} style={S.toast}>
          <span>{t.message}</span>
          {t.actionLabel && <button style={S.toastAction} onClick={() => { t.onAction && t.onAction(); onDismiss(t.id); }}>{t.actionLabel}</button>}
          <button style={S.chipX} onClick={() => onDismiss(t.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

function FadingSavedBadge() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return <span style={S.saveStateBadge}>Salvo</span>;
}

function PersonalBoardSkeleton({ theme }) {
  return (
    <div style={S.page}>
      <div className="no-print" style={S.topbar}>
        <div style={S.brandRow}>
          <div style={S.logoPlaceholder}><Columns3 size={18} color="#F5C400" /></div>
          <div style={{ ...S.skeletonBlock, width: 160, height: 16 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, padding: '16px 24px' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...S.personalCol, width: 300 }}>
            <div style={{ ...S.skeletonBlock, width: '60%', height: 14, marginBottom: 14 }} />
            {[0, 1].map((j) => <div key={j} style={{ ...S.skeletonBlock, height: 52, marginBottom: 9, borderRadius: 8 }} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorSwatchGrid({ value, onChange }) {
  return (
    <div style={S.colorSwatchGrid}>
      <button title="Sem cor" style={{ ...S.colorSwatch, background: 'transparent', border: '1px dashed var(--border-3)' }} onClick={() => onChange('')} />
      {COLUMN_COLOR_ORDER.map((key) => (
        <button key={key} title={COLUMN_COLOR_META[key].label} style={{ ...S.colorSwatch, background: COLUMN_COLOR_META[key].bg, borderColor: COLUMN_COLOR_META[key].text, ...(value === key ? { boxShadow: `0 0 0 2px ${COLUMN_COLOR_META[key].text}` } : {}) }} onClick={() => onChange(key)} />
      ))}
    </div>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div style={S.priorityPickerRow}>
      <button style={{ ...S.priorityPickerChip, ...(value === '' ? S.priorityPickerChipActive : {}) }} onClick={() => onChange('')}>Sem prioridade</button>
      {CARD_PRIORITY_ORDER.map((p) => (
        <button
          key={p}
          style={{ ...S.priorityPickerChip, color: CARD_PRIORITY_META[p].color, background: value === p ? CARD_PRIORITY_META[p].bg : 'transparent', borderColor: value === p ? CARD_PRIORITY_META[p].border : 'var(--border-3)' }}
          onClick={() => onChange(p)}
        >
          {CARD_PRIORITY_META[p].label}
        </button>
      ))}
    </div>
  );
}

function StatusPicker({ value, onChange }) {
  return (
    <div style={S.priorityPickerRow}>
      {CARD_STATUS_ORDER.map((s) => (
        <button
          key={s}
          style={{ ...S.priorityPickerChip, color: CARD_STATUS_META[s].color, background: value === s ? CARD_STATUS_META[s].bg : 'transparent', borderColor: value === s ? CARD_STATUS_META[s].border : 'var(--border-3)' }}
          onClick={() => onChange(s)}
        >
          {CARD_STATUS_META[s].label}
        </button>
      ))}
    </div>
  );
}

function TagEditor({ tags, onChange, suggestions }) {
  const [draft, setDraft] = useState('');
  function commit() {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft('');
  }
  return (
    <div>
      <div style={S.tagEditorChips}>
        {tags.map((t) => (
          <span key={t} style={S.personalCardTag}>
            {t} <button style={S.chipX} onClick={() => onChange(tags.filter((x) => x !== t))}><X size={10} /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } if (e.key === 'Escape') setDraft(''); }}
          onBlur={commit}
          placeholder="+ tag"
          list="personal-tag-suggestions"
          style={S.tagEditorInput}
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <datalist id="personal-tag-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      )}
    </div>
  );
}

function PersonalColumnMenu({ column, canMoveLeft, canMoveRight, onClose, onAddCard, onRename, onColorChange, onToggleHideCompleted, onMoveLeft, onMoveRight, onDuplicate, onSortNow, onDelete }) {
  const [mode, setMode] = useState('root');
  return (
    <div style={S.dropdownMenu} onClick={(e) => e.stopPropagation()}>
      {mode === 'root' && (
        <>
          <button style={S.dropdownItem} onClick={() => { onAddCard(); onClose(); }}><Plus size={13} /> Adicionar atividade</button>
          <button style={S.dropdownItem} onClick={() => { onRename(); onClose(); }}><Pencil size={13} /> Renomear</button>
          <button style={S.dropdownItem} onClick={() => setMode('color')}><Palette size={13} /> Alterar cor</button>
          <button style={S.dropdownItem} onClick={() => setMode('sort')}><ArrowLeftRight size={13} /> Ordenar</button>
          <button style={{ ...S.dropdownItem, opacity: canMoveLeft ? 1 : .4 }} disabled={!canMoveLeft} onClick={() => { onMoveLeft(); onClose(); }}>← Mover para esquerda</button>
          <button style={{ ...S.dropdownItem, opacity: canMoveRight ? 1 : .4 }} disabled={!canMoveRight} onClick={() => { onMoveRight(); onClose(); }}>→ Mover para direita</button>
          <button style={S.dropdownItem} onClick={() => { onDuplicate(); onClose(); }}><Copy size={13} /> Duplicar coluna</button>
          <label style={S.dropdownItem}>
            <input type="checkbox" checked={!!column.hideCompleted} onChange={onToggleHideCompleted} /> Ocultar concluídas
          </label>
          <div style={S.dropdownDivider} />
          <button style={{ ...S.dropdownItem, color: '#e2574c' }} onClick={() => { onDelete(); onClose(); }}><Trash2 size={13} /> Excluir coluna</button>
        </>
      )}
      {mode === 'color' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          <ColorSwatchGrid value={column.color} onChange={(c) => { onColorChange(c); onClose(); }} />
        </>
      )}
      {mode === 'sort' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {SORT_OPTIONS.map((opt) => (
            <button key={opt.value} style={S.dropdownItem} onClick={() => { onSortNow(opt.value); onClose(); }}>{opt.label}</button>
          ))}
        </>
      )}
    </div>
  );
}

function PersonalCardMenu({ card, otherColumns, onClose, onOpen, onSetPriority, onSetStatus, onToggleComplete, onMoveTo, onDuplicate, onDelete }) {
  const [mode, setMode] = useState('root');
  const status = cardStatusOf(card);
  return (
    <div style={S.dropdownMenu} onClick={(e) => e.stopPropagation()}>
      {mode === 'root' && (
        <>
          <button style={S.dropdownItem} onClick={() => { onOpen(); onClose(); }}><Maximize2 size={13} /> Abrir atividade</button>
          <button style={S.dropdownItem} onClick={() => setMode('move')}><ArrowLeftRight size={13} /> Mover para...</button>
          <button style={S.dropdownItem} onClick={() => setMode('status')}><Clock size={13} /> Alterar status</button>
          <button style={S.dropdownItem} onClick={() => setMode('priority')}><AlertTriangle size={13} /> Alterar prioridade</button>
          <button style={S.dropdownItem} onClick={() => { onToggleComplete(); onClose(); }}><Check size={13} /> {card.completed ? 'Reabrir' : 'Marcar como concluída'}</button>
          <button style={S.dropdownItem} onClick={() => { onDuplicate(); onClose(); }}><Copy size={13} /> Duplicar</button>
          <div style={S.dropdownDivider} />
          <button style={{ ...S.dropdownItem, color: '#e2574c' }} onClick={() => { onDelete(); onClose(); }}><Trash2 size={13} /> Excluir</button>
        </>
      )}
      {mode === 'status' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {CARD_STATUS_ORDER.map((s) => (
            <button key={s} style={{ ...S.dropdownItem, color: CARD_STATUS_META[s].color, fontWeight: s === status ? 700 : 400 }} onClick={() => { onSetStatus(s); onClose(); }}>{CARD_STATUS_META[s].label}</button>
          ))}
        </>
      )}
      {mode === 'move' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {otherColumns.length === 0 && <div style={{ ...S.emptyMuted, padding: '4px 10px' }}>Nenhuma outra coluna.</div>}
          {otherColumns.map((c) => (
            <button key={c.id} style={S.dropdownItem} onClick={() => { onMoveTo(c.id); onClose(); }}>{c.name}</button>
          ))}
        </>
      )}
      {mode === 'priority' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          <button style={S.dropdownItem} onClick={() => { onSetPriority(''); onClose(); }}>Sem prioridade</button>
          {CARD_PRIORITY_ORDER.map((p) => (
            <button key={p} style={{ ...S.dropdownItem, color: CARD_PRIORITY_META[p].color }} onClick={() => { onSetPriority(p); onClose(); }}>{CARD_PRIORITY_META[p].label}</button>
          ))}
        </>
      )}
    </div>
  );
}

function PersonalCard({ card, columnId, disabled, readOnly, otherColumns, onOpen, onToggleComplete, onDelete, onDuplicate, onSetPriority, onSetStatus, onMoveTo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: 'card', columnId }, disabled: disabled || readOnly });
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const tone = dueDateTone(card);
  const doneCount = (card.checklist || []).filter((i) => i.done).length;
  const priorityMeta = card.priority ? CARD_PRIORITY_META[card.priority] : null;
  const status = cardStatusOf(card);
  const showStatusBadge = status === 'em-andamento' || status === 'pausada';
  const staleDays = daysSinceCardMovement(card);
  const stale = staleTone(staleDays);
  const showStaleBadge = !card.completed;
  const hasMeta = !!priorityMeta || showStatusBadge || !!card.dueDate || (card.comments || []).length > 0 || (card.checklist || []).length > 0 || showStaleBadge;

  return (
    <div
      ref={setNodeRef}
      className="pb-card"
      style={{ ...S.personalCard, ...style, ...(disabled || readOnly ? {} : { cursor: 'grab', touchAction: 'none' }), ...(card.completed ? S.personalCardDone : {}) }}
      {...attributes}
      {...(readOnly ? {} : listeners)}
      onClick={onOpen}
    >
      <div style={S.personalCardTop}>
        <button className="pb-check" style={S.personalCardCheck} onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggleComplete(); }} title={card.completed ? 'Reabrir' : 'Marcar como concluída'}>
          {card.completed ? <Check size={13} /> : <span style={S.personalCardCheckEmpty} />}
        </button>
        <div style={{ ...S.personalCardTitleText, ...(card.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>{card.title}</div>
        {!readOnly && (
          <div style={{ position: 'relative' }}>
            <button style={S.iconBtnGhost} onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}><MoreHorizontal size={13} /></button>
            {menuOpen && (
              <PersonalCardMenu
                card={card}
                otherColumns={otherColumns}
                onClose={() => setMenuOpen(false)}
                onOpen={onOpen}
                onSetPriority={onSetPriority}
                onSetStatus={onSetStatus}
                onToggleComplete={onToggleComplete}
                onMoveTo={onMoveTo}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </div>
      {hasMeta && (
        <div style={S.personalCardMeta}>
          {showStatusBadge && <span style={{ ...S.personalCardBadge, color: CARD_STATUS_META[status].color, background: CARD_STATUS_META[status].bg }}>{CARD_STATUS_META[status].label}</span>}
          {priorityMeta && <span style={{ ...S.personalCardBadge, color: priorityMeta.color, background: priorityMeta.bg }}>● {priorityMeta.label}</span>}
          {card.dueDate && (
            <span style={{ ...S.personalCardBadge, ...(tone === 'overdue' ? S.dueOverdue : tone === 'today' ? S.dueToday : tone === 'soon' ? S.dueSoon : {}) }}>
              📅 {fmtDate(card.dueDate)}
            </span>
          )}
          {(card.comments || []).length > 0 && <span style={S.personalCardBadge}>💬 {card.comments.length}</span>}
          {(card.checklist || []).length > 0 && <span style={S.personalCardBadge}>✓ {doneCount}/{card.checklist.length}</span>}
          {showStaleBadge && (
            <span
              title={`Sem movimentação há ${staleDays} dia${staleDays === 1 ? '' : 's'} (última: ${fmtDateOnly(card.updatedAt || card.createdAt)})`}
              style={{ ...S.personalCardBadge, ...(stale === 'critical' ? S.dueOverdue : stale === 'warn' ? S.dueSoon : {}) }}
            >
              ⏱ {staleDays}d
            </span>
          )}
        </div>
      )}
      {(card.tags || []).length > 0 && (
        <div style={S.personalCardTags}>
          {card.tags.slice(0, 3).map((t) => <span key={t} style={S.personalCardTag}>{t}</span>)}
          {card.tags.length > 3 && <span style={S.personalCardTag}>+{card.tags.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

function PersonalColumn({
  column, cardsToRender, totalVisibleCount, dragDisabled, readOnly, canMoveLeft, canMoveRight, otherColumns,
  onAddCard, onOpenCard, onToggleComplete, onDeleteCard, onDuplicateCard, onSetPriority, onSetStatus, onMoveCardTo,
  onRenameColumn, onColorChange, onToggleHideCompleted, onMoveLeft, onMoveRight, onDuplicateColumn, onSortColumnNow, onDeleteColumn,
}) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const nameInputRef = useRef(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: 'column' }, disabled: readOnly });
  const { setNodeRef: setDropRef } = useDroppable({ id: `coldrop-${column.id}`, data: { type: 'coldrop', columnId: column.id } });
  const isMobile = useIsMobile();
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, ...(isMobile ? S.personalColMobile : null) };
  const colorMeta = column.color ? COLUMN_COLOR_META[column.color] : null;
  const cardIds = cardsToRender.map((c) => c.id);

  function submitQuickAdd() {
    const t = draft.trim();
    if (t) {
      onAddCard(column.id, t);
      setDraft('');
      if (inputRef.current) inputRef.current.focus();
    } else {
      setShowQuickAdd(false);
    }
  }

  return (
    <div ref={setNodeRef} style={{ ...S.personalCol, background: colorMeta ? colorMeta.container : 'var(--pcol-default-container)', ...style }}>
      <div {...(readOnly ? {} : { ...attributes, ...listeners })} style={{ ...S.personalColHead, ...(readOnly ? {} : { cursor: 'grab', touchAction: 'none' }) }}>
        {!readOnly && <span style={S.personalColGrip}><GripVertical size={13} color="var(--text-8)" /></span>}
        <div style={{ ...S.personalColTag, background: colorMeta ? colorMeta.bg : 'transparent' }}>
          <input
            ref={nameInputRef}
            value={column.name}
            readOnly={readOnly}
            onChange={(e) => onRenameColumn(column.id, e.target.value)}
            style={{ ...S.personalColNameInput, color: colorMeta ? colorMeta.text : 'var(--text-2)' }}
          />
        </div>
        <span style={S.kanbanCount}>{totalVisibleCount}</span>
        {!readOnly && (
          <div style={{ position: 'relative' }}>
            <button style={S.iconBtnGhost} onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal size={14} /></button>
            {menuOpen && (
              <PersonalColumnMenu
                column={column}
                canMoveLeft={canMoveLeft}
                canMoveRight={canMoveRight}
                onClose={() => setMenuOpen(false)}
                onAddCard={() => setShowQuickAdd(true)}
                onRename={() => nameInputRef.current && nameInputRef.current.focus()}
                onColorChange={(color) => onColorChange(column.id, color)}
                onToggleHideCompleted={() => onToggleHideCompleted(column.id)}
                onMoveLeft={onMoveLeft}
                onMoveRight={onMoveRight}
                onDuplicate={onDuplicateColumn}
                onSortNow={onSortColumnNow}
                onDelete={onDeleteColumn}
              />
            )}
          </div>
        )}
      </div>

      <div ref={setDropRef} style={S.personalColBody}>
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cardsToRender.map((card) => (
            <PersonalCard
              key={card.id}
              card={card}
              columnId={column.id}
              disabled={dragDisabled}
              readOnly={readOnly}
              otherColumns={otherColumns}
              onOpen={() => onOpenCard(column.id, card.id)}
              onToggleComplete={() => onToggleComplete(column.id, card.id)}
              onDelete={() => onDeleteCard(column.id, card.id)}
              onDuplicate={() => onDuplicateCard(column.id, card.id)}
              onSetPriority={(p) => onSetPriority(column.id, card.id, p)}
              onSetStatus={(s) => onSetStatus(column.id, card.id, s)}
              onMoveTo={(targetColId) => onMoveCardTo(column.id, card.id, targetColId)}
            />
          ))}
        </SortableContext>
        {cardsToRender.length === 0 && <div style={S.personalColEmpty}>Nenhuma tarefa aqui.</div>}
      </div>

      {!readOnly && (showQuickAdd ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(); }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setShowQuickAdd(false); }
          }}
          onBlur={() => { if (!draft.trim()) setShowQuickAdd(false); }}
          placeholder="Digite o nome da atividade..."
          style={S.personalQuickAddInput}
        />
      ) : (
        <button className="pb-addbtn" style={{ ...S.personalAddCard, color: colorMeta ? colorMeta.text : 'var(--text-5)' }} onClick={() => setShowQuickAdd(true)}><Plus size={12} /> Nova atividade</button>
      ))}
    </div>
  );
}

function PersonalCardDetailModal({ card, columnName, boardName, allTags, currentUserId, readOnly, onClose, onUpdate, onDelete, onToggleComplete, onSetStatus, onAddComment, onUpdateComment, onRemoveComment, onAddChecklistItem, onToggleChecklistItem, onRemoveChecklistItem }) {
  const [commentDraft, setCommentDraft] = useState('');
  const [checklistDraft, setChecklistDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submitComment() {
    if (!commentDraft.trim()) return;
    onAddComment(commentDraft);
    setCommentDraft('');
  }
  function submitChecklist() {
    if (!checklistDraft.trim()) return;
    onAddChecklistItem(checklistDraft);
    setChecklistDraft('');
  }

  const doneCount = (card.checklist || []).filter((i) => i.done).length;
  const isMobile = useIsMobile();
  const staleDays = daysSinceCardMovement(card);
  const stale = staleTone(staleDays);

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(760px, 100%)', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.fieldHint}>{boardName} / {columnName}</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        {readOnly && (
          <div style={{ ...S.fieldHint, background: 'var(--bg-3)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
            👁️ Somente visualização — você está vendo pelo link público
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 10 }}>
          <span style={S.fieldHint}>Criada em: {fmtDateOnly(card.createdAt)}</span>
          <span style={S.fieldHint}>Última movimentação: {fmtDateOnly(card.updatedAt || card.createdAt)}</span>
          {!card.completed && (
            <span style={{ ...S.fieldHint, fontWeight: 700, color: stale === 'critical' ? '#e2574c' : stale === 'warn' ? '#ff9f40' : 'var(--text-6)' }}>
              ⏱ Parada há {staleDays} dia{staleDays === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div style={{ pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? .85 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button style={S.personalCardCheck} onClick={onToggleComplete} title={card.completed ? 'Reabrir' : 'Marcar como concluída'}>
              {card.completed ? <Check size={16} /> : <span style={S.personalCardCheckEmptyLg} />}
            </button>
            <input
              value={card.title}
              readOnly={readOnly}
              onChange={(e) => onUpdate({ title: e.target.value })}
              onBlur={() => onUpdate({}, 'Título atualizado')}
              style={{ ...S.personalDetailTitleInput, ...(card.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}
            />
          </div>

          <div>
            <div style={S.fieldHint}>Status</div>
            <StatusPicker value={cardStatusOf(card)} onChange={onSetStatus} />
          </div>

          <div style={S.cardPropsGrid}>
            <div>
              <div style={S.fieldHint}>Prioridade</div>
              <PriorityPicker value={card.priority || ''} onChange={(p) => onUpdate({ priority: p }, `Prioridade alterada: ${card.priority ? CARD_PRIORITY_META[card.priority].label : 'sem prioridade'} → ${p ? CARD_PRIORITY_META[p].label : 'sem prioridade'}`)} />
            </div>
            <div>
              <div style={S.fieldHint}>Prazo</div>
              <input type="date" value={card.dueDate || ''} onChange={(e) => onUpdate({ dueDate: e.target.value }, e.target.value ? `Prazo alterado: ${fmtDate(e.target.value)}` : 'Prazo removido')} />
            </div>
          </div>

          <div style={S.subSectionLabel}><Tag size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Tags</div>
          <TagEditor tags={card.tags || []} onChange={(tags) => onUpdate({ tags }, 'Tags atualizadas')} suggestions={allTags} />

          <div style={S.subSectionLabel}>Descrição</div>
          <textarea
            value={card.desc || ''}
            readOnly={readOnly}
            onChange={(e) => onUpdate({ desc: e.target.value })}
            onBlur={() => onUpdate({}, 'Descrição atualizada')}
            rows={6}
            placeholder="Descrição, anotações..."
            style={{ ...S.notesArea, minHeight: 120, fontSize: 13.5, padding: '10px 12px' }}
          />

          <div style={S.subSectionLabel}><ListChecks size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Checklist {card.checklist && card.checklist.length > 0 ? `(${doneCount}/${card.checklist.length})` : ''}</div>
          <div style={S.checklistList}>
            {(card.checklist || []).map((item) => (
              <div key={item.id} style={S.checklistRow}>
                <input type="checkbox" checked={item.done} onChange={() => onToggleChecklistItem(item.id)} />
                <span style={{ flex: 1, ...(item.done ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>{item.text}</span>
                <button style={S.chipX} onClick={() => onRemoveChecklistItem(item.id)}><X size={12} /></button>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div style={S.commentInputRow}>
              <input
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitChecklist(); } }}
                placeholder="Adicionar item..."
                style={{ flex: 1 }}
              />
              <button style={S.iconBtn} onClick={submitChecklist}><Plus size={13} /></button>
            </div>
          )}
        </div>

        <div style={{ ...S.subSectionLabel, marginTop: 18 }}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários {(card.comments || []).length > 0 ? `(${card.comments.length})` : ''}</div>
        <div style={S.commentThread}>
          {(card.comments || []).length === 0 && <div style={S.emptyMuted}>Nenhum comentário ainda.</div>}
          {[...(card.comments || [])].reverse().map((c) => {
            const isOwn = c.authorId === currentUserId;
            return (
              <div key={c.id} style={S.commentBubble}>
                <div style={S.commentAuthorRow}>
                  <span style={S.commentAvatar}>{initials(c.author)}</span>
                  <span style={S.commentAuthorName}>{c.author}</span>
                  <span style={S.commentAuthorTs}>{fmtTs(c.ts)}{c.editedAt ? ' · editado' : ''}</span>
                </div>
                {editingCommentId === c.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} style={{ flex: 1 }} autoFocus />
                    <button style={S.iconBtn} onClick={() => { onUpdateComment(c.id, editingCommentText); setEditingCommentId(null); }}><Check size={13} /></button>
                    <button style={S.iconBtnGhost} onClick={() => setEditingCommentId(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <div style={S.commentText}>{c.text}</div>
                )}
                {!readOnly && isOwn && editingCommentId !== c.id && (
                  <div style={S.commentMeta}>
                    <span />
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button style={S.commentDel} onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text); }}><Pencil size={11} /></button>
                      <button style={S.commentDel} onClick={() => onRemoveComment(c.id)}><X size={11} /></button>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <div style={S.commentInputRow}>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitComment(); } }}
              placeholder="Escreva um comentário... (Cmd/Ctrl+Enter para enviar)"
              rows={2}
              style={{ flex: 1 }}
            />
            <button style={S.primaryBtn} onClick={submitComment}><Send size={14} /></button>
          </div>
        )}

        <div style={{ ...S.subSectionLabel, marginTop: 18 }}><History size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Histórico</div>
        <div style={S.historyList}>
          {(card.history || []).length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
          {(card.history || []).map((l, i) => (
            <div key={i} style={S.logRow}>
              <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
              <div style={S.logAction}>{l.action}</div>
            </div>
          ))}
        </div>

        {!readOnly && <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c' }} onClick={onDelete}><Trash2 size={14} /> Excluir tarefa</button>}
      </div>
    </div>
  );
}

function PersonalListView({ board, filterFn, onOpenCard, onToggleComplete, readOnly }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  const rows = useMemo(() => {
    const flat = [];
    board.columns.forEach((col, colIdx) => {
      col.cards.forEach((cd) => {
        if (cd.deleted) return;
        if (!filterFn(cd)) return;
        flat.push({ ...cd, _colId: col.id, _colName: col.name, _colIdx: colIdx });
      });
    });
    if (!sortKey) return flat;
    const cmp = {
      title: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
      column: (a, b) => a._colIdx - b._colIdx,
      priority: (a, b) => {
        const rank = (c) => { const i = CARD_PRIORITY_ORDER.indexOf(c.priority); return i === -1 ? 99 : i; };
        return rank(a) - rank(b);
      },
      dueDate: (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'),
      updatedAt: (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''),
    }[sortKey];
    return cmp ? flat.slice().sort((a, b) => cmp(a, b) * sortDir) : flat;
  }, [board, filterFn, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  }

  return (
    <div style={S.personalListWrap}>
      <table style={S.personalListTable}>
        <thead>
          <tr>
            <th style={S.personalListTh}></th>
            <th style={S.personalListTh} onClick={() => toggleSort('title')}>Título</th>
            <th style={S.personalListTh} onClick={() => toggleSort('column')}>Coluna</th>
            <th style={S.personalListTh}>Status</th>
            <th style={S.personalListTh} onClick={() => toggleSort('priority')}>Prioridade</th>
            <th style={S.personalListTh} onClick={() => toggleSort('dueDate')}>Prazo</th>
            <th style={S.personalListTh}>Tags</th>
            <th style={S.personalListTh} onClick={() => toggleSort('updatedAt')}>Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = dueDateTone(r);
            const priorityMeta = r.priority ? CARD_PRIORITY_META[r.priority] : null;
            return (
              <tr key={r.id} style={S.personalListRow} onClick={() => onOpenCard(r._colId, r.id)}>
                <td style={S.personalListTd}><input type="checkbox" checked={r.completed} disabled={readOnly} onClick={(e) => e.stopPropagation()} onChange={() => onToggleComplete(r._colId, r.id)} /></td>
                <td style={{ ...S.personalListTd, ...(r.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>{r.title}</td>
                <td style={S.personalListTd}>{r._colName}</td>
                <td style={S.personalListTd}><span style={{ color: CARD_STATUS_META[cardStatusOf(r)].color }}>{CARD_STATUS_META[cardStatusOf(r)].label}</span></td>
                <td style={S.personalListTd}>{priorityMeta ? <span style={{ color: priorityMeta.color }}>{priorityMeta.label}</span> : '—'}</td>
                <td style={{ ...S.personalListTd, ...(tone === 'overdue' ? S.dueOverdue : tone === 'today' ? S.dueToday : {}) }}>{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                <td style={S.personalListTd}>{(r.tags || []).join(', ') || '—'}</td>
                <td style={S.personalListTd}>{r.updatedAt ? fmtTs(r.updatedAt) : '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={S.emptyMuted}>Nenhum resultado com os filtros atuais.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReassignCardsModal({ column, otherColumns, onConfirm, onCancel }) {
  const [targetColId, setTargetColId] = useState(otherColumns[0] ? otherColumns[0].id : '');
  const [alsoDelete, setAlsoDelete] = useState(false);
  const activeCount = column.cards.filter((c) => !c.deleted).length;
  const isMobile = useIsMobile();
  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onCancel}>
      <div style={{ ...S.detailBox, width: 'min(460px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Excluir coluna "{column.name}"</div>
          <button style={S.iconBtnGhost} onClick={onCancel}><X size={18} /></button>
        </div>
        <div style={S.fieldHint}>Esta coluna tem {activeCount} tarefa(s). Para onde deseja movê-las?</div>
        <select value={targetColId} onChange={(e) => setTargetColId(e.target.value)} style={{ marginTop: 10 }}>
          {otherColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5 }}>
          <input type="checkbox" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} />
          Excluir as tarefas também (vão para a Lixeira)
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button style={S.iconBtn} onClick={onCancel}>Cancelar</button>
          <button style={S.primaryBtn} onClick={() => onConfirm(targetColId, alsoDelete)} disabled={!targetColId}>Mover e excluir coluna</button>
        </div>
      </div>
    </div>
  );
}

function PersonalTrashPanel({ trashItems, onClose, onRestore, onHardDelete }) {
  return (
    <SidePanel title="Lixeira" onClose={onClose}>
      {trashItems.length === 0 && <div style={S.emptyMuted}>Nada excluído.</div>}
      {trashItems.map((item) => (
        <div key={item.card.id} style={S.trashRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.trashTitle}>{item.card.title}</div>
            <div style={S.trashParent}>{item.card.deletedFromBoardName || item.boardName} — coluna "{item.card.deletedFromColumnName || '—'}"</div>
            <div style={S.logTs}>Excluída em {fmtTs(item.card.deletedAt)}{item.card.deletedBy ? ` · ${item.card.deletedBy}` : ''}</div>
          </div>
          <button style={S.iconBtn} onClick={() => onRestore(item)}><Undo2 size={14} /> Restaurar</button>
          <button style={S.iconBtnGhost} onClick={() => onHardDelete(item)}><Trash2 size={14} color="#e2574c" /></button>
        </div>
      ))}
    </SidePanel>
  );
}

function BoardShareModal({ board, onClose, onSetVisibility, onRegenerateLink }) {
  const [copied, setCopied] = useState(false);
  const isPublic = board.visibility === 'public';
  const publicUrl = isPublic && board.shareToken ? `${window.location.origin}/quadro/${board.shareToken}` : '';

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.subSectionLabel}>Visibilidade da página "{board.name}"</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <label style={S.cnpjCheckRow}>
            <input type="radio" name="board-visibility" checked={!isPublic} onChange={() => onSetVisibility('private')} />
            <Lock size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Privado — só você pode ver e editar
          </label>
          <label style={S.cnpjCheckRow}>
            <input type="radio" name="board-visibility" checked={isPublic} onChange={() => onSetVisibility('public')} />
            <Globe size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Público por link — qualquer pessoa com o link pode ver
          </label>
        </div>
        {isPublic && (
          <>
            <div style={{ ...S.fieldHint, marginTop: 12, lineHeight: 1.5 }}>
              Quem tiver o link e <b>não estiver logado</b> só consegue visualizar (não pode criar, editar, mover, comentar ou excluir nada).
              Quem <b>estiver logado</b> na plataforma pode colaborar normalmente, e cada ação fica registrada no histórico do quadro.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={publicUrl} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
              <button style={S.primaryBtn} onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar link'}</button>
            </div>
            <button
              className="pb-ghost"
              style={{ ...S.pbGhostBtn, marginTop: 10 }}
              onClick={() => { if (window.confirm('Gerar um novo link público? O link atual deixará de funcionar imediatamente.')) onRegenerateLink(); }}
            >
              <RefreshCw size={13} /> Gerar novo link
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BoardActivityLogModal({ board, onClose }) {
  const feed = useMemo(() => {
    const items = [];
    (board.log || []).forEach((l) => items.push({ ts: l.ts, user: l.user, action: l.action }));
    (board.columns || []).forEach((c) => (c.cards || []).forEach((cd) => (cd.history || []).forEach((h) => {
      items.push({ ts: h.ts, user: h.user, action: `"${cd.title}" — ${h.action}` });
    })));
    return items.sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 300);
  }, [board]);

  return (
    <SidePanel title={`Histórico do quadro "${board.name}"`} onClose={onClose}>
      {feed.length === 0 && <div style={S.emptyMuted}>Nenhuma atividade registrada ainda.</div>}
      {feed.map((l, i) => (
        <div key={i} style={S.logRow}>
          <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
          <div style={S.logAction}>{l.action}</div>
        </div>
      ))}
    </SidePanel>
  );
}

function PersonalBoardScreen({ board, onMutate, onExit, currentUser, onLogout, theme, onToggleTheme, saveState, publicMode, readOnly, publicOwnerName }) {
  const [activeBoardId, setActiveBoardId] = useState(board.boards[0] ? board.boards[0].id : null);
  const [dragBoardId, setDragBoardId] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [reassignColumn, setReassignColumn] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ priority: [], dueBucket: '', tags: [], status: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const activeFilterCount = (filters.status ? 1 : 0) + (filters.priority.length > 0 ? 1 : 0) + (filters.dueBucket ? 1 : 0);
  const [activeDragItem, setActiveDragItem] = useState(null);
  const { toasts, pushUndoToast, dismissToast } = useToasts();
  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    if (!board.boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(board.boards[0] ? board.boards[0].id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.boards.map((b) => b.id).join(',')]);

  const activeBoard = board.boards.find((b) => b.id === activeBoardId) || null;
  const viewPrefs = (activeBoard && activeBoard.viewPrefs) || { view: 'kanban', sortMode: 'manual' };

  function mutateBoardTree(bid, updater, logMsg) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== bid) return b;
        let next = updater(b);
        if (logMsg && next.visibility === 'public') {
          next = { ...next, log: [{ ts: new Date().toISOString(), action: logMsg, user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
        }
        return next;
      }),
    }));
  }
  function mutateColumnTree(bid, colId, updater, logMsg) {
    mutateBoardTree(bid, (b) => ({ ...b, columns: b.columns.map((c) => (c.id !== colId ? c : updater(c))) }), logMsg);
  }
  function mutateCardTree(bid, colId, cardId, updater, logMsg) {
    mutateColumnTree(bid, colId, (c) => ({ ...c, cards: c.cards.map((cd) => (cd.id !== cardId ? cd : updater(cd))) }), logMsg);
  }

  // ---- boards (pages) ----
  function addBoard() {
    const nb = { id: uid('board'), name: 'Nova página', visibility: 'private', shareToken: '', log: [], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: [{ id: uid('col'), name: 'A fazer', color: '', hideCompleted: false, cards: [] }] };
    onMutate((prev) => ({ ...prev, boards: [...prev.boards, nb] }));
    setActiveBoardId(nb.id);
  }
  function setBoardVisibility(boardId, visibility) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== boardId) return b;
        const next = { ...b, visibility, shareToken: visibility === 'public' && !b.shareToken ? genShareToken() : b.shareToken };
        const msg = visibility === 'public' ? 'Quadro tornado público por link' : 'Quadro tornado privado';
        return { ...next, log: [{ ts: new Date().toISOString(), action: msg, user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
      }),
    }));
  }
  function regenerateShareLink(boardId) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== boardId) return b;
        const next = { ...b, shareToken: genShareToken() };
        return { ...next, log: [{ ts: new Date().toISOString(), action: 'Link público regenerado (link anterior invalidado)', user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
      }),
    }));
  }
  function renameBoard(boardId, name) {
    onMutate((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id === boardId ? { ...b, name } : b)) }));
  }
  function deleteBoard(boardId) {
    const b = board.boards.find((x) => x.id === boardId);
    if (!b) return;
    if (!window.confirm(`Excluir a página "${b.name}" e tudo dentro dela? Essa ação não pode ser desfeita.`)) return;
    onMutate((prev) => ({ ...prev, boards: prev.boards.filter((x) => x.id !== boardId) }));
  }
  function reorderBoards(fromId, toId) {
    if (!fromId || fromId === toId) return;
    onMutate((prev) => {
      const list = prev.boards.slice();
      const fromIdx = list.findIndex((x) => x.id === fromId);
      const toIdx = list.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...prev, boards: list };
    });
  }
  function setViewPrefs(patch) {
    if (!activeBoard || readOnly) return;
    mutateBoardTree(activeBoard.id, (b) => ({ ...b, viewPrefs: { ...(b.viewPrefs || {}), ...patch } }));
  }

  // ---- columns ----
  function addColumn() {
    if (!activeBoard) return;
    const nc = { id: uid('col'), name: 'Nova coluna', color: '', hideCompleted: false, cards: [] };
    mutateBoardTree(activeBoard.id, (b) => ({ ...b, columns: [...b.columns, nc] }), 'Coluna criada: "Nova coluna"');
  }
  function renameColumn(colId, name) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, name }));
  }
  function setColumnColor(colId, color) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, color }));
  }
  function toggleColumnHideCompleted(colId) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, hideCompleted: !c.hideCompleted }));
  }
  function reorderColumns(fromId, toId) {
    if (!fromId || fromId === toId || !activeBoard) return;
    mutateBoardTree(activeBoard.id, (b) => {
      const fromIdx = b.columns.findIndex((x) => x.id === fromId);
      const toIdx = b.columns.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return b;
      return { ...b, columns: arrayMove(b.columns, fromIdx, toIdx) };
    });
  }
  function moveColumn(colId, dir) {
    const list = activeBoard.columns;
    const idx = list.findIndex((c) => c.id === colId);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= list.length) return;
    reorderColumns(colId, list[newIdx].id);
  }
  function duplicateColumn(colId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    if (!col) return;
    const now = new Date().toISOString();
    const clone = {
      ...col,
      id: uid('col'),
      name: `${col.name} (cópia)`,
      cards: col.cards.filter((cd) => !cd.deleted).map((cd) => ({
        ...cd, id: uid('card'), comments: [],
        history: [{ ts: now, action: 'Tarefa duplicada', user: currentUser.name }],
        createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
      })),
    };
    mutateBoardTree(activeBoard.id, (b) => {
      const list = b.columns.slice();
      const idx = list.findIndex((c) => c.id === colId);
      list.splice(idx + 1, 0, clone);
      return { ...b, columns: list };
    });
  }
  function sortColumnNow(colId, mode) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, cards: sortCards(c.cards, mode) }));
  }
  function requestDeleteColumn(colId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    if (!col) return;
    if (activeBoard.columns.length <= 1) {
      window.alert('Esta é a única coluna da página. Crie outra coluna antes de excluir esta.');
      return;
    }
    const activeCount = col.cards.filter((cd) => !cd.deleted).length;
    if (activeCount === 0) {
      if (!window.confirm(`Excluir a coluna "${col.name}"?`)) return;
      mutateBoardTree(activeBoard.id, (b) => ({ ...b, columns: b.columns.filter((c) => c.id !== colId) }), `Coluna excluída: "${col.name}"`);
      return;
    }
    setReassignColumn(col);
  }
  function confirmDeleteColumn(targetColId, alsoDeleteCards) {
    const col = reassignColumn;
    if (!col || !activeBoard) return;
    const now = new Date().toISOString();
    mutateBoardTree(activeBoard.id, (b) => {
      const cardsToMove = col.cards.map((cd) => {
        if (cd.deleted || !alsoDeleteCards) return cd;
        return {
          ...cd, deleted: true, deletedAt: now, deletedBy: currentUser.name,
          deletedFromColumnId: col.id, deletedFromColumnName: col.name,
          deletedFromBoardId: activeBoard.id, deletedFromBoardName: activeBoard.name,
        };
      });
      const withoutCol = b.columns.filter((c) => c.id !== col.id);
      return { ...b, columns: withoutCol.map((c) => (c.id === targetColId ? { ...c, cards: [...c.cards, ...cardsToMove] } : c)) };
    }, `Coluna excluída: "${col.name}"`);
    setReassignColumn(null);
  }

  // ---- cards ----
  function addCard(colId, title) {
    const t = (title || '').trim();
    if (!t || !activeBoard) return;
    const now = new Date().toISOString();
    const nc = {
      id: uid('card'), title: t, desc: '',
      status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [],
      completed: false, completedAt: '', completedBy: '',
      comments: [], history: [{ ts: now, action: 'Tarefa criada', user: currentUser.name }],
      deleted: false, deletedAt: '', deletedBy: '',
      deletedFromColumnId: '', deletedFromColumnName: '', deletedFromBoardId: '', deletedFromBoardName: '',
      createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
    };
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, cards: [...c.cards, nc] }), `Tarefa criada: "${t}"`);
  }
  function updateCard(colId, cardId, patch, historyMsg) {
    const now = new Date().toISOString();
    const cardBefore = findCardById(cardId);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => {
      const next = { ...cd, ...patch, updatedAt: now, updatedBy: currentUser.name };
      if (historyMsg) next.history = [{ ts: now, action: historyMsg, user: currentUser.name }, ...(cd.history || [])].slice(0, 200);
      return next;
    }, historyMsg && cardBefore ? `"${cardBefore.title}" — ${historyMsg}` : null);
  }
  function setCardStatus(colId, cardId, status) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    const wasCompleted = !!card.completed;
    const willComplete = status === 'concluida';
    const oldLabel = CARD_STATUS_META[cardStatusOf(card)].label;
    updateCard(colId, cardId, {
      status,
      completed: willComplete,
      completedAt: willComplete ? (wasCompleted ? card.completedAt : now) : '',
      completedBy: willComplete ? (wasCompleted ? card.completedBy : currentUser.name) : '',
    }, `Status alterado: ${oldLabel} → ${CARD_STATUS_META[status].label}`);
  }
  function undoDeleteCard(colId, cardId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, deleted: false, deletedAt: '', deletedBy: '' }));
  }
  function deleteCard(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, deleted: true, deletedAt: now, deletedBy: currentUser.name,
      deletedFromColumnId: col.id, deletedFromColumnName: col.name,
      deletedFromBoardId: activeBoard.id, deletedFromBoardName: activeBoard.name,
      history: [{ ts: now, action: 'Tarefa excluída', user: currentUser.name }, ...(cd.history || [])].slice(0, 200),
    }), `Tarefa excluída: "${card.title}"`);
    pushUndoToast(`Tarefa "${card.title}" excluída.`, () => undoDeleteCard(colId, cardId));
    setOpenCard((prev) => (prev && prev.cardId === cardId ? null : prev));
  }
  function toggleCardComplete(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const willComplete = !card.completed;
    setCardStatus(colId, cardId, willComplete ? 'concluida' : 'em-andamento');
    pushUndoToast(
      willComplete ? `Tarefa "${card.title}" concluída.` : `Tarefa "${card.title}" reaberta.`,
      () => toggleCardComplete(colId, cardId)
    );
  }
  function duplicateCard(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    const clone = {
      ...card, id: uid('card'), title: `${card.title} (cópia)`, comments: [],
      history: [{ ts: now, action: 'Tarefa duplicada', user: currentUser.name }],
      status: 'nao-iniciada', completed: false, completedAt: '', completedBy: '',
      createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
    };
    mutateColumnTree(activeBoard.id, colId, (c) => {
      const idx = c.cards.findIndex((cd) => cd.id === cardId);
      const cards = c.cards.slice();
      cards.splice(idx + 1, 0, clone);
      return { ...c, cards };
    });
  }
  function moveCardToIndex(cardId, fromColId, toColId, toIndex) {
    if (!fromColId || !toColId || !activeBoard) return;
    const now = new Date().toISOString();
    let moved = null;
    const cardBeforeMove = fromColId !== toColId ? findCardById(cardId) : null;
    const fromColNameOuter = (activeBoard.columns.find((c) => c.id === fromColId) || {}).name || '';
    const toColNameOuter = (activeBoard.columns.find((c) => c.id === toColId) || {}).name || '';
    const moveLogMsg = cardBeforeMove ? `"${cardBeforeMove.title}" movida de "${fromColNameOuter}" para "${toColNameOuter}"` : null;
    mutateBoardTree(activeBoard.id, (b) => {
      if (fromColId === toColId) {
        return {
          ...b,
          columns: b.columns.map((c) => {
            if (c.id !== fromColId) return c;
            const fromIndex = c.cards.findIndex((cd) => cd.id === cardId);
            if (fromIndex === -1) return c;
            moved = c.cards[fromIndex];
            const clampedTo = (toIndex === null || toIndex === undefined) ? c.cards.length - 1 : Math.min(toIndex, c.cards.length - 1);
            return { ...c, cards: arrayMove(c.cards, fromIndex, clampedTo) };
          }),
        };
      }
      const toColName = (b.columns.find((c) => c.id === toColId) || {}).name || '';
      let fromColName = '';
      const columns = b.columns.map((c) => {
        if (c.id !== fromColId) return c;
        moved = c.cards.find((cd) => cd.id === cardId) || null;
        fromColName = c.name;
        return { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) };
      });
      if (!moved) return b;
      const stamped = {
        ...moved, updatedAt: now, updatedBy: currentUser.name,
        history: [{ ts: now, action: `Movida de "${fromColName}" para "${toColName}"`, user: currentUser.name }, ...(moved.history || [])].slice(0, 200),
      };
      return {
        ...b,
        columns: columns.map((c) => {
          if (c.id !== toColId) return c;
          const cards = c.cards.slice();
          const insertAt = (toIndex === null || toIndex === undefined) ? cards.length : Math.min(toIndex, cards.length);
          cards.splice(insertAt, 0, stamped);
          return { ...c, cards };
        }),
      };
    }, moveLogMsg);
    if (fromColId !== toColId && moved) {
      const movedTitle = moved.title;
      pushUndoToast(`Tarefa "${movedTitle}" movida para outra coluna.`, () => moveCardToIndex(cardId, toColId, fromColId, null));
    }
  }

  // ---- comments ----
  function addCardComment(colId, cardId, text) {
    const v = (text || '').trim();
    if (!v) return;
    const now = new Date().toISOString();
    const c = { id: uid('cm'), text: v, ts: now, author: currentUser.name, authorId: currentUser.id };
    const cardBefore = findCardById(cardId);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, comments: [...(cd.comments || []), c], updatedAt: now, updatedBy: currentUser.name,
      history: [{ ts: now, action: 'Comentário adicionado', user: currentUser.name }, ...(cd.history || [])].slice(0, 200),
    }), cardBefore ? `Comentário em "${cardBefore.title}"` : null);
  }
  function updateCardComment(colId, cardId, commentId, text) {
    const v = (text || '').trim();
    if (!v) return;
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, comments: (cd.comments || []).map((c) => (c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c)),
    }));
  }
  function removeCardComment(colId, cardId, commentId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, comments: (cd.comments || []).filter((c) => c.id !== commentId) }));
  }

  // ---- checklist ----
  function addChecklistItem(colId, cardId, text) {
    const v = (text || '').trim();
    if (!v) return;
    const item = { id: uid('chk'), text: v, done: false };
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: [...(cd.checklist || []), item], updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function toggleChecklistItem(colId, cardId, itemId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function removeChecklistItem(colId, cardId, itemId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).filter((i) => i.id !== itemId), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }

  // ---- trash (cross-board) ----
  const trashItems = useMemo(() => {
    const items = [];
    for (const b of board.boards) {
      for (const c of b.columns) {
        for (const cd of c.cards) {
          if (cd.deleted) items.push({ boardId: b.id, boardName: b.name, colId: c.id, card: cd });
        }
      }
    }
    return items.sort((a, b) => (b.card.deletedAt || '').localeCompare(a.card.deletedAt || ''));
  }, [board]);

  function restoreTrashedCard(item) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== item.boardId) return b;
        const originalColExists = b.columns.some((c) => c.id === item.card.deletedFromColumnId);
        const targetColId = originalColExists ? item.card.deletedFromColumnId : item.colId;
        let removed = null;
        const withoutCard = b.columns.map((c) => {
          if (c.id !== item.colId) return c;
          removed = c.cards.find((cd) => cd.id === item.card.id);
          return { ...c, cards: c.cards.filter((cd) => cd.id !== item.card.id) };
        });
        if (!removed) return b;
        const restored = { ...removed, deleted: false, deletedAt: '', deletedBy: '' };
        return { ...b, columns: withoutCard.map((c) => (c.id === targetColId ? { ...c, cards: [...c.cards, restored] } : c)) };
      }),
    }));
  }
  function hardDeleteTrashedCard(item) {
    const typed = window.prompt(`Para excluir definitivamente "${item.card.title}", digite "${CARD_DELETE_CONFIRM_PHRASE}" abaixo:`);
    if (typed !== CARD_DELETE_CONFIRM_PHRASE) return;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== item.boardId ? b : {
        ...b,
        columns: b.columns.map((c) => (c.id !== item.colId ? c : { ...c, cards: c.cards.filter((cd) => cd.id !== item.card.id) })),
      })),
    }));
  }

  // ---- drag and drop ----
  function findCardById(id) {
    if (!activeBoard) return null;
    for (const c of activeBoard.columns) {
      const found = c.cards.find((cd) => cd.id === id);
      if (found) return found;
    }
    return null;
  }
  function handleDragStart(event) {
    const { active } = event;
    if (active.data.current?.type === 'column') {
      const col = activeBoard.columns.find((c) => c.id === active.id);
      setActiveDragItem(col ? { type: 'column', column: col } : null);
    } else {
      const card = findCardById(active.id);
      setActiveDragItem(card ? { type: 'card', card } : null);
    }
  }
  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);
    if (!over || !activeBoard) return;
    if (active.data.current?.type === 'column') {
      if (active.id !== over.id) reorderColumns(active.id, over.id);
      return;
    }
    const fromColId = active.data.current?.columnId;
    if (!fromColId) return;
    let toColId, toIndex = null;
    if (over.data.current?.type === 'card') {
      toColId = over.data.current.columnId;
      const toCol = activeBoard.columns.find((c) => c.id === toColId);
      toIndex = toCol ? toCol.cards.findIndex((cd) => cd.id === over.id) : null;
    } else if (over.data.current?.type === 'coldrop') {
      toColId = over.data.current.columnId;
    } else if (over.data.current?.type === 'column') {
      toColId = over.id;
    } else {
      toColId = fromColId;
    }
    if (fromColId === toColId && toIndex !== null) {
      const col = activeBoard.columns.find((c) => c.id === fromColId);
      const fromIndex = col ? col.cards.findIndex((cd) => cd.id === active.id) : -1;
      if (fromIndex === toIndex) return;
    }
    moveCardToIndex(active.id, fromColId, toColId, toIndex);
  }

  // ---- filters ----
  const allTags = useMemo(() => {
    if (!activeBoard) return [];
    const set = new Set();
    activeBoard.columns.forEach((c) => c.cards.forEach((cd) => (cd.tags || []).forEach((t) => set.add(t))));
    return [...set];
  }, [activeBoard]);

  function cardMatches(card) {
    return cardMatchesFilters(card, { search, priority: filters.priority, dueBucket: filters.dueBucket, tags: filters.tags, status: filters.status });
  }

  const columnIds = activeBoard ? activeBoard.columns.map((c) => c.id) : [];

  return (
    <div style={S.page}>
      <style>{`
        @keyframes personalSkeletonPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], input[type=number], select, textarea {
          background:var(--bg-3); border:1px solid var(--border-2); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, input[type=number]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }

        :root {
          --pb-shadow-soft: 0 1px 2px rgba(15,15,15,.04);
          --pb-shadow-hover: 0 2px 8px rgba(15,15,15,.16);
          --pb-shadow-drag: 0 8px 20px rgba(15,15,15,.24);
          --pcol-gray-bg: rgba(255,255,255,.06); --pcol-gray-text: var(--text-3); --pcol-gray-container: rgba(255,255,255,.03);
          --pcol-brown-bg: rgba(160,120,90,.22); --pcol-brown-text: #c9a488; --pcol-brown-container: rgba(160,120,90,.08);
          --pcol-orange-bg: rgba(217,115,13,.20); --pcol-orange-text: #e8a463; --pcol-orange-container: rgba(217,115,13,.07);
          --pcol-yellow-bg: rgba(203,145,47,.20); --pcol-yellow-text: #e0b968; --pcol-yellow-container: rgba(203,145,47,.07);
          --pcol-green-bg: rgba(68,131,97,.22); --pcol-green-text: #7fc79c; --pcol-green-container: rgba(68,131,97,.08);
          --pcol-blue-bg: rgba(51,126,169,.22); --pcol-blue-text: #7ec2e8; --pcol-blue-container: rgba(51,126,169,.08);
          --pcol-purple-bg: rgba(144,101,176,.22); --pcol-purple-text: #c6a4e0; --pcol-purple-container: rgba(144,101,176,.08);
          --pcol-pink-bg: rgba(193,76,138,.22); --pcol-pink-text: #ea9dc4; --pcol-pink-container: rgba(193,76,138,.08);
          --pcol-red-bg: rgba(212,76,71,.22); --pcol-red-text: #f08f8a; --pcol-red-container: rgba(212,76,71,.08);
          --pcol-default-container: rgba(255,255,255,.02);
        }
        html[data-theme="light"] {
          --pb-shadow-soft: 0 1px 2px rgba(15,15,15,.04);
          --pb-shadow-hover: 0 2px 6px rgba(15,15,15,.06);
          --pb-shadow-drag: 0 8px 20px rgba(15,15,15,.10);
          --pcol-gray-bg: #EDECE9; --pcol-gray-text: #55534E; --pcol-gray-container: #F7F7F6;
          --pcol-brown-bg: #EEE0DA; --pcol-brown-text: #64473A; --pcol-brown-container: #F8F2EF;
          --pcol-orange-bg: #FADEC9; --pcol-orange-text: #D9730D; --pcol-orange-container: #FDF2E8;
          --pcol-yellow-bg: #FDECC8; --pcol-yellow-text: #CB912F; --pcol-yellow-container: #FEF9EB;
          --pcol-green-bg: #DBEDDB; --pcol-green-text: #448361; --pcol-green-container: #EFF8EF;
          --pcol-blue-bg: #D3E5EF; --pcol-blue-text: #337EA9; --pcol-blue-container: #EFF5F9;
          --pcol-purple-bg: #E8DEEE; --pcol-purple-text: #9065B0; --pcol-purple-container: #F6F2F9;
          --pcol-pink-bg: #F5E0E9; --pcol-pink-text: #C14C8A; --pcol-pink-container: #FBF2F6;
          --pcol-red-bg: #FFE2DD; --pcol-red-text: #D44C47; --pcol-red-container: #FFF3F1;
          --pcol-default-container: #F7F7F5;
        }
        .pb-card { transition: box-shadow .14s ease, transform .14s ease; }
        .pb-card:hover { box-shadow: var(--pb-shadow-hover); transform: translateY(-1px); }
        .pb-check { transition: background .12s ease; }
        .pb-check:hover { background: var(--bg-3); }
        .pb-ghost { transition: background .12s ease, border-color .12s ease; }
        .pb-ghost:hover { background: var(--bg-3); }
        .pb-addbtn { transition: background .12s ease, color .12s ease; }
        .pb-addbtn:hover { background: var(--bg-3); color: var(--text-2); }
      `}</style>
      <div className="no-print" style={S.topbar}>
        <div style={S.brandRow}>
          <div style={S.logoPlaceholder}><Columns3 size={18} color="#F5C400" /></div>
          <div>
            <div style={S.brandName}>Gestão de Atividades</div>
            <div style={S.brandCnpj}>{publicMode ? (publicOwnerName ? `Quadro de ${publicOwnerName}` : 'Quadro compartilhado') : currentUser.name}</div>
          </div>
          {onExit && <button className="pb-ghost" style={S.pbGhostBtn} onClick={onExit}><Building2 size={15} /> Ir para Empresas</button>}
          {!readOnly && <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowTrash(true)}><Trash2 size={15} /> Lixeira{trashItems.length > 0 ? ` (${trashItems.length})` : ''}</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveState === 'saving' && <span style={S.saveStateBadge}>Salvando…</span>}
          {saveState === 'saved' && <FadingSavedBadge />}
          {saveState === 'error' && <span style={{ ...S.saveStateBadge, color: '#e2574c' }}>Falha ao salvar — desfeito</span>}
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      {publicMode ? (
        <div style={S.personalTabs}>
          <div style={{ ...S.personalTab, ...S.personalTabActive, cursor: 'default' }}>
            <span style={S.personalTabInput}>{activeBoard ? activeBoard.name : ''}</span>
            <span style={S.publicBadge}><Globe size={11} /> Público por link</span>
          </div>
          {readOnly && <div style={{ ...S.fieldHint, alignSelf: 'center', marginLeft: 8 }}>Somente visualização — <a href="/" style={{ color: '#F5C400' }}>faça login</a> para colaborar</div>}
        </div>
      ) : (
        <div style={S.personalTabs}>
          {board.boards.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragBoardId(b.id)}
              onDragEnd={() => setDragBoardId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { reorderBoards(dragBoardId, b.id); setDragBoardId(null); }}
              onClick={() => setActiveBoardId(b.id)}
              style={{ ...S.personalTab, ...(b.id === activeBoardId ? S.personalTabActive : {}) }}
            >
              <input value={b.name} onChange={(e) => renameBoard(b.id, e.target.value)} style={S.personalTabInput} />
              {b.visibility === 'public' && <span style={S.publicBadge}><Globe size={11} /></span>}
              <button style={S.chipX} onClick={(e) => { e.stopPropagation(); deleteBoard(b.id); }}><X size={11} /></button>
            </div>
          ))}
          <button style={S.iconBtnGhost} onClick={addBoard} title="Nova página"><Plus size={16} /></button>
        </div>
      )}

      {activeBoard && (
        <div style={S.personalToolbar}>
          <div style={S.personalViewToggle}>
            <button style={{ ...S.personalViewToggleBtn, ...(viewPrefs.view !== 'list' ? S.personalViewToggleBtnActive : {}) }} onClick={() => setViewPrefs({ view: 'kanban' })}><Columns3 size={13} /> Quadro</button>
            <button style={{ ...S.personalViewToggleBtn, ...(viewPrefs.view === 'list' ? S.personalViewToggleBtnActive : {}) }} onClick={() => setViewPrefs({ view: 'list' })}><LayoutList size={13} /> Lista</button>
          </div>
          <div style={S.personalSearchWrap}>
            <Search size={13} color="var(--text-6)" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." style={S.personalSearchInput} />
          </div>
          <button
            className="pb-ghost"
            style={{ ...S.pbGhostBtn, ...(showFilters ? S.pbGhostBtnActive : {}) }}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {!publicMode && (
            <button className="pb-ghost" style={{ ...S.pbGhostBtn, ...(activeBoard.visibility === 'public' ? { color: '#3ea6ff', borderColor: '#3ea6ff' } : {}) }} onClick={() => setShowShareModal(true)}>
              {activeBoard.visibility === 'public' ? <Globe size={13} /> : <Lock size={13} />} {activeBoard.visibility === 'public' ? 'Público por link' : 'Compartilhar'}
            </button>
          )}
          {activeBoard.visibility === 'public' && !readOnly && (
            <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowActivityLog(true)}><History size={13} /> Histórico</button>
          )}
          {showFilters && (
            <>
              <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={S.personalFilterSelect}>
                <option value="">Todo status</option>
                <option value="nao-concluida">Ocultar concluídas</option>
                {CARD_STATUS_ORDER.map((s) => <option key={s} value={s}>{CARD_STATUS_META[s].label}</option>)}
              </select>
              <select value={filters.priority[0] || ''} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value ? [e.target.value] : [] }))} style={S.personalFilterSelect}>
                <option value="">Toda prioridade</option>
                {CARD_PRIORITY_ORDER.map((p) => <option key={p} value={p}>{CARD_PRIORITY_META[p].label}</option>)}
              </select>
              <select value={filters.dueBucket} onChange={(e) => setFilters((f) => ({ ...f, dueBucket: e.target.value }))} style={S.personalFilterSelect}>
                <option value="">Todo prazo</option>
                <option value="overdue">Vencido</option>
                <option value="today">Hoje</option>
                <option value="week">Próximos dias</option>
                <option value="none">Sem prazo</option>
              </select>
            </>
          )}
          <select value={viewPrefs.sortMode || 'manual'} onChange={(e) => setViewPrefs({ sortMode: e.target.value })} style={S.personalFilterSelect}>
            <option value="manual">Ordem manual</option>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      )}

      {!activeBoard && (
        <div style={S.emptyMuted}>Nenhuma página ainda. Clique no + acima pra criar a primeira.</div>
      )}

      {activeBoard && viewPrefs.view !== 'list' && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div style={S.personalBoardArea}>
              {activeBoard.columns.map((col, idx) => {
                const visible = sortCards(
                  col.cards.filter((cd) => !cd.deleted && !(col.hideCompleted && cd.completed) && cardMatches(cd)),
                  viewPrefs.sortMode
                );
                return (
                  <PersonalColumn
                    key={col.id}
                    column={col}
                    cardsToRender={visible}
                    totalVisibleCount={visible.length}
                    dragDisabled={(viewPrefs.sortMode || 'manual') !== 'manual'}
                    readOnly={readOnly}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < activeBoard.columns.length - 1}
                    otherColumns={activeBoard.columns.filter((c) => c.id !== col.id)}
                    onAddCard={addCard}
                    onOpenCard={(colId, cardId) => setOpenCard({ colId, cardId })}
                    onToggleComplete={toggleCardComplete}
                    onDeleteCard={deleteCard}
                    onDuplicateCard={duplicateCard}
                    onSetPriority={(colId, cardId, p) => {
                      const prevCard = findCardById(cardId);
                      const prevLabel = prevCard && prevCard.priority ? CARD_PRIORITY_META[prevCard.priority].label : 'sem prioridade';
                      updateCard(colId, cardId, { priority: p }, `Prioridade alterada: ${prevLabel} → ${p ? CARD_PRIORITY_META[p].label : 'sem prioridade'}`);
                    }}
                    onSetStatus={setCardStatus}
                    onMoveCardTo={(colId, cardId, targetColId) => moveCardToIndex(cardId, colId, targetColId, null)}
                    onRenameColumn={renameColumn}
                    onColorChange={setColumnColor}
                    onToggleHideCompleted={toggleColumnHideCompleted}
                    onMoveLeft={() => moveColumn(col.id, -1)}
                    onMoveRight={() => moveColumn(col.id, 1)}
                    onDuplicateColumn={() => duplicateColumn(col.id)}
                    onSortColumnNow={(mode) => sortColumnNow(col.id, mode)}
                    onDeleteColumn={() => requestDeleteColumn(col.id)}
                  />
                );
              })}
              {!readOnly && <button className="pb-addbtn" style={S.personalAddCol} onClick={addColumn}><Plus size={14} /> Nova coluna</button>}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDragItem && activeDragItem.type === 'card' && (
              <div style={{ ...S.personalCard, boxShadow: 'var(--pb-shadow-drag)', opacity: .92 }}>
                <div style={S.personalCardTop}>
                  <span style={S.personalCardCheckEmpty} />
                  <div style={S.personalCardTitleText}>{activeDragItem.card.title}</div>
                </div>
              </div>
            )}
            {activeDragItem && activeDragItem.type === 'column' && (
              <div style={{ ...S.personalCol, background: 'var(--bg-1)', border: '1px solid var(--border-1)', boxShadow: 'var(--pb-shadow-drag)', opacity: .92 }}>
                <div style={S.personalColHead}>{activeDragItem.column.name}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {activeBoard && viewPrefs.view === 'list' && (
        <PersonalListView board={activeBoard} filterFn={cardMatches} onOpenCard={(colId, cardId) => setOpenCard({ colId, cardId })} onToggleComplete={toggleCardComplete} readOnly={readOnly} />
      )}

      {openCard && activeBoard && (() => {
        const col = activeBoard.columns.find((c) => c.id === openCard.colId);
        const card = col && col.cards.find((cd) => cd.id === openCard.cardId);
        if (!card) return null;
        return (
          <PersonalCardDetailModal
            card={card}
            columnName={col.name}
            boardName={activeBoard.name}
            allTags={allTags}
            currentUserId={currentUser.id}
            readOnly={readOnly}
            onClose={() => setOpenCard(null)}
            onUpdate={(patch, historyMsg) => updateCard(col.id, card.id, patch, historyMsg)}
            onDelete={() => { deleteCard(col.id, card.id); setOpenCard(null); }}
            onToggleComplete={() => toggleCardComplete(col.id, card.id)}
            onSetStatus={(s) => setCardStatus(col.id, card.id, s)}
            onAddComment={(text) => addCardComment(col.id, card.id, text)}
            onUpdateComment={(id, text) => updateCardComment(col.id, card.id, id, text)}
            onRemoveComment={(id) => removeCardComment(col.id, card.id, id)}
            onAddChecklistItem={(text) => addChecklistItem(col.id, card.id, text)}
            onToggleChecklistItem={(id) => toggleChecklistItem(col.id, card.id, id)}
            onRemoveChecklistItem={(id) => removeChecklistItem(col.id, card.id, id)}
          />
        );
      })()}

      {reassignColumn && activeBoard && (
        <ReassignCardsModal
          column={reassignColumn}
          otherColumns={activeBoard.columns.filter((c) => c.id !== reassignColumn.id)}
          onConfirm={confirmDeleteColumn}
          onCancel={() => setReassignColumn(null)}
        />
      )}

      {showTrash && (
        <PersonalTrashPanel trashItems={trashItems} onClose={() => setShowTrash(false)} onRestore={restoreTrashedCard} onHardDelete={hardDeleteTrashedCard} />
      )}

      {showShareModal && activeBoard && (
        <BoardShareModal
          board={activeBoard}
          onClose={() => setShowShareModal(false)}
          onSetVisibility={(v) => setBoardVisibility(activeBoard.id, v)}
          onRegenerateLink={() => regenerateShareLink(activeBoard.id)}
        />
      )}

      {showActivityLog && activeBoard && (
        <BoardActivityLogModal board={activeBoard} onClose={() => setShowActivityLog(false)} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function PublicBoardScreen({ token, theme, onToggleTheme }) {
  const [state, setState] = useState({ loading: true, error: '', board: null, canEdit: false, ownerName: '' });
  const [viewerUser, setViewerUser] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const saveTimer = useRef(null);
  const lastGoodRef = useRef(null);

  useEffect(() => {
    (async () => {
      let me = null;
      try { me = await apiGet('/api/auth/me'); } catch (e) { me = null; }
      if (me && me.user) setViewerUser(me.user);
      try {
        const res = await apiGet(`/api/public-board/${token}`);
        setState({ loading: false, error: '', board: res.board, canEdit: !!res.canEdit, ownerName: res.ownerName || '' });
        lastGoodRef.current = res.board;
      } catch (e) {
        setState({ loading: false, error: e.message || 'Link inválido.', board: null, canEdit: false, ownerName: '' });
      }
    })();
  }, [token]);

  function persistDebounced(nextBoard) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(() => {
      apiPatch(`/api/public-board/${token}`, { board: nextBoard })
        .then(() => { lastGoodRef.current = nextBoard; setSaveState('saved'); })
        .catch(() => { setSaveState('error'); setState((s) => ({ ...s, board: lastGoodRef.current })); });
    }, 500);
  }
  function mutateBoard(updater) {
    setState((prev) => {
      const nextWrapped = updater({ boards: [prev.board] });
      const nextBoard = nextWrapped.boards[0];
      persistDebounced(nextBoard);
      return { ...prev, board: nextBoard };
    });
  }

  if (state.loading) return <LoadingScreen theme={theme} />;

  if (state.error || !state.board) {
    return (
      <div style={S.page}>
        <div style={S.loginWrap}>
          <div style={S.loginBox}>
            <h1 style={S.loginTitle}>Link indisponível</h1>
            <p style={S.loginSub}>{state.error || 'Este link não existe mais ou o quadro deixou de ser público.'}</p>
            <a href="/" style={S.primaryBtn}>Ir para o início</a>
          </div>
        </div>
      </div>
    );
  }

  const wrappedBoard = { boards: [state.board] };
  const viewer = viewerUser || { id: null, name: 'Visitante' };

  return (
    <PersonalBoardScreen
      board={wrappedBoard}
      onMutate={mutateBoard}
      onExit={null}
      currentUser={viewer}
      onLogout={viewerUser ? () => { apiPost('/api/auth/logout').finally(() => { window.location.href = '/'; }); } : null}
      theme={theme}
      onToggleTheme={onToggleTheme}
      saveState={state.canEdit ? saveState : 'idle'}
      publicMode
      readOnly={!state.canEdit}
      publicOwnerName={state.ownerName}
    />
  );
}

function NoAccessScreen({ user, onLogout, theme, onToggleTheme }) {
  return (
    <div style={S.page}>
      <div style={S.themeToggleCorner}>
        <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
      </div>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <span style={{ ...S.roleTag, color: ROLE_META[user.role].color, borderColor: ROLE_META[user.role].color }}>{ROLE_META[user.role].label}</span>
          <h1 style={S.loginTitle}>Nenhum projeto liberado</h1>
          <p style={S.loginSub}>{user.name}, você ainda não tem acesso a nenhum cliente. Peça para um PRICETAX Master liberar o CNPJ correspondente em "Usuários".</p>
          <button style={S.primaryBtn} onClick={onLogout}><LogOut size={14} /> Trocar de usuário</button>
        </div>
      </div>
    </div>
  );
}

function SidePanel({ title, onClose, children }) {
  const isMobile = useIsMobile();
  return (
    <div className="no-print" style={S.overlay} onClick={onClose}>
      <div style={{ ...S.panel, ...(isMobile ? S.panelMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}>{title}</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={S.panelBody}>{children}</div>
      </div>
    </div>
  );
}

function StatusPill({ status, onClick }) {
  const meta = STATUS_META[status] || STATUS_META['nao-iniciado'];
  return (
    <div
      onClick={onClick}
      style={{ ...S.statusPill, color: meta.color, background: meta.bg, borderColor: meta.border, cursor: onClick ? 'pointer' : 'default' }}
    >
      {meta.label}
    </div>
  );
}

function renderCommentText(text, teamList) {
  const names = teamList.filter((m) => m.userId).map((m) => m.name).sort((x, y) => y.length - x.length);
  if (!names.length) return text;
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  const parts = text.split(pattern);
  return parts.map((part, i) => (names.some((n) => part === `@${n}`) ? <span key={i} style={S.mentionTag}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));
}

function ActivityDetailModal({ activity: a, orderMap, phases, team, log, companyName, currentUser, pid, onClose, updateActivity, deleteActivity, addSub, updateSub, deleteSub, reorderSub, addAttachment, removeAttachment, addComment, removeComment, updateComment, addLink, removeLink, toggleParticipant }) {
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [pendingMentions, setPendingMentions] = useState([]);
  const [dragSubId, setDragSubId] = useState(null);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [showNotesBox, setShowNotesBox] = useState(!!a.notes);
  const [showTranscriptBox, setShowTranscriptBox] = useState(!!a.transcript);
  const phase = phases.find((p) => p.id === a.phase);
  const mentionCandidates = team.filter((m) => m.userId);
  const activityHistory = (log || []).filter((l) => l.activityId === a.id);

  function insertMention(m) {
    setCommentDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${m.name} `);
    setPendingMentions((prev) => (prev.includes(m.userId) ? prev : [...prev, m.userId]));
  }

  function submitComment() {
    if (!commentDraft.trim()) return;
    addComment(pid, a.id, commentDraft, pendingMentions);
    setCommentDraft('');
    setPendingMentions([]);
  }

  function submitLink() {
    if (!linkUrlDraft.trim()) return;
    addLink(pid, a.id, { label: linkLabelDraft, url: linkUrlDraft });
    setLinkLabelDraft('');
    setLinkUrlDraft('');
  }

  const isMobile = useIsMobile();

  return (
    <div className="no-print" style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <style>{SUB_ROW_CSS}</style>
      <div style={{ ...S.detailBox, ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.detailTopLeft}>
            <span style={{ ...S.monthBadgeSm, background: phase?.color }}>#{orderMap[a.id]}</span>
            <span style={S.detailPhaseTag}><span style={{ ...S.timelineLaneDot, background: phase?.color }} />{phase?.name}</span>
          </div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={20} /></button>
        </div>

        <input
          type="text"
          value={a.title}
          onChange={(e) => updateActivity(pid, a.id, { title: e.target.value })}
          onBlur={() => updateActivity(pid, a.id, {}, `Título alterado: "${a.title}"`)}
          style={S.detailTitleInput}
        />

        <div style={S.detailGrid}>
          <div style={{ ...S.detailMain, ...(isMobile ? S.detailMainMobile : null) }}>
            <div style={S.subSectionLabel}>Descrição</div>
            <textarea value={a.desc} onChange={(e) => updateActivity(pid, a.id, { desc: e.target.value })} onBlur={() => updateActivity(pid, a.id, {}, `Descrição alterada em "${a.title}"`)} rows={2} style={S.notesArea} />

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              Observações
              {!showNotesBox && <button style={S.iconBtnGhost} onClick={() => setShowNotesBox('focus')} title="Adicionar observação"><Plus size={12} /></button>}
            </div>
            {!!showNotesBox && (
              <textarea value={a.notes || ''} onChange={(e) => updateActivity(pid, a.id, { notes: e.target.value })} onBlur={() => updateActivity(pid, a.id, {}, `Observação alterada em "${a.title}"`)} rows={3} placeholder="Comentários, contexto, decisões desta atividade..." style={S.notesArea} autoFocus={showNotesBox === 'focus'} />
            )}

            <div style={S.subSectionLabel}><Link2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Links {(a.links || []).length > 0 ? `(${(a.links || []).length})` : ''}</div>
            <div style={S.attachList}>
              {(a.links || []).map((l) => (
                <div key={l.id} style={S.attachRow}>
                  <a href={l.url} target="_blank" rel="noreferrer" style={S.attachLink}>{l.label}</a>
                  <button style={S.iconBtnGhost} onClick={() => removeLink(pid, a.id, l.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={linkLabelDraft} onChange={(e) => setLinkLabelDraft(e.target.value)} placeholder="Nome do link (opcional)" style={{ flex: 1 }} />
              <input type="text" value={linkUrlDraft} onChange={(e) => setLinkUrlDraft(e.target.value)} placeholder="https://..." style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && submitLink()} />
              <button style={S.iconBtn} onClick={submitLink}><Plus size={14} /></button>
            </div>

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={12} style={{ verticalAlign: -2 }} />Transcrição de reunião
              {!showTranscriptBox && <button style={S.iconBtnGhost} onClick={() => setShowTranscriptBox('focus')} title="Adicionar transcrição"><Plus size={12} /></button>}
            </div>
            {!!showTranscriptBox && (
              <textarea
                value={a.transcript || ''}
                onChange={(e) => updateActivity(pid, a.id, { transcript: e.target.value })}
                onBlur={() => updateActivity(pid, a.id, {}, `Transcrição de reunião atualizada em "${a.title}"`)}
                rows={6}
                placeholder="Cole aqui a transcrição da reunião..."
                style={{ ...S.notesArea, fontFamily: 'monospace', fontSize: 11.5 }}
                autoFocus={showTranscriptBox === 'focus'}
              />
            )}

            <div style={S.subSectionLabel}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários {(a.comments || []).length > 0 ? `(${(a.comments || []).length})` : ''}</div>
            <div style={S.commentThread}>
              {(a.comments || []).length === 0 && <div style={S.emptyMuted}>Nenhum comentário ainda.</div>}
              {[...(a.comments || [])].reverse().map((c) => (
                <div key={c.id} style={S.commentBubble}>
                  {editingCommentId === c.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { updateComment(pid, a.id, c.id, editingCommentText); setEditingCommentId(null); }
                          if (e.key === 'Escape') setEditingCommentId(null);
                        }}
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <button style={S.iconBtn} onClick={() => { updateComment(pid, a.id, c.id, editingCommentText); setEditingCommentId(null); }}><Check size={13} /></button>
                      <button style={S.iconBtnGhost} onClick={() => setEditingCommentId(null)}><X size={13} /></button>
                    </div>
                  ) : (
                    <div style={S.commentText}>{renderCommentText(c.text, team)}</div>
                  )}
                  <div style={S.commentMeta}>
                    <span>{c.author ? `${c.author} · ` : ''}{fmtTs(c.ts)}{c.editedAt ? ' · editado' : ''}</span>
                    {editingCommentId !== c.id && (
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button style={S.commentDel} onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text); }}><Pencil size={11} /></button>
                        <button style={S.commentDel} onClick={() => removeComment(pid, a.id, c.id)}><X size={11} /></button>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {mentionCandidates.length > 0 && (
              <select
                value=""
                onChange={(e) => { const m = mentionCandidates.find((x) => x.userId === e.target.value); if (m) insertMention(m); }}
                style={{ marginBottom: 6 }}
              >
                <option value="">@ Mencionar alguém...</option>
                {mentionCandidates.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            )}
            <div style={S.commentInputRow}>
              <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Escreva um comentário... use @ pra mencionar alguém" rows={2} style={{ flex: 1 }} />
              <button style={S.primaryBtn} onClick={submitComment}><Send size={14} /></button>
            </div>

            <div style={{ ...S.subSectionLabel, marginTop: 18 }}><History size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Histórico desta atividade</div>
            <div style={S.historyList}>
              {activityHistory.length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
              {activityHistory.map((l, i) => (
                <div key={i} style={S.logRow}>
                  <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
                  <div style={S.logAction}>{l.action}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...S.detailSide, ...(isMobile ? S.detailSideMobile : null) }}>
            <div style={S.subSectionLabel}>Fase</div>
            <select value={a.phase} onChange={(e) => { const id = Number(e.target.value); updateActivity(pid, a.id, { phase: id }, `Fase alterada em "${a.title}": ${phases.find((p) => p.id === id)?.name}`); }}>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div style={S.subSectionLabel}>Responsável</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={a.responsible} onChange={(e) => updateActivity(pid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1 }}>
                {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <TeamLinkBadge link={team.find((m) => m.name === a.responsible)} companyName={companyName} />
            </div>
            {(() => {
              const rm = team.find((m) => m.name === a.responsible);
              return rm && rm.area ? <div style={{ ...S.fieldHint, marginTop: 4 }}>Área: {rm.area}</div> : null;
            })()}

            <div style={S.subSectionLabel}>Participantes</div>
            <div style={S.participantChips}>
              {team.filter((m) => m.name !== a.responsible).map((m) => {
                const active = (a.participants || []).includes(m.name);
                return (
                  <button
                    key={m.id}
                    type="button"
                    style={{ ...S.participantChip, ...(active ? S.participantChipActive : {}) }}
                    onClick={() => toggleParticipant(pid, a.id, m.name)}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            <div style={S.subSectionLabel}>Prioridade</div>
            <select
              value={a.priority || ''}
              onChange={(e) => updateActivity(pid, a.id, { priority: e.target.value }, `Prioridade alterada em "${a.title}": ${e.target.value ? PRIORITY_META[e.target.value].label : 'sem prioridade'}`)}
              style={{ color: a.priority ? PRIORITY_META[a.priority].color : undefined }}
            >
              <option value="">Sem prioridade</option>
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>

            <div style={S.subSectionLabel}>Início</div>
            <input type="date" value={a.date} onChange={(e) => {
              const v = e.target.value;
              const patch = { date: v };
              if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
              else if (!a.endDate || a.endDate < v) patch.endDate = v;
              updateActivity(pid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
            }} />

            <div style={S.subSectionLabel}>Prazo (dias)</div>
            <input
              type="number"
              min={1}
              placeholder="Ex.: 15"
              value={a.durationDays || ''}
              onChange={(e) => {
                const v = e.target.value;
                const patch = { durationDays: v ? Number(v) : '' };
                if (v && a.date) patch.endDate = calcDeadline(a.date, v);
                updateActivity(pid, a.id, patch);
              }}
              onBlur={() => updateActivity(pid, a.id, {}, `Prazo alterado em "${a.title}": ${a.durationDays ? a.durationDays + ' dias' : 'sem prazo definido'}`)}
            />

            <div style={S.subSectionLabel}>Fim</div>
            <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(pid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(pid, a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} /> Obrigatória
            </div>

            <div style={S.subSectionLabel}>Status</div>
            <select value={a.status} onChange={(e) => updateActivity(pid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ color: STATUS_META[a.status].color }}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>

            <div style={S.subSectionLabel}>Subatividades</div>
            <div style={S.subList}>
              {(a.subactivities || []).filter((s) => !s.deleted).map((s) => (
                <div
                  key={s.id}
                  className="sub-row-card"
                  style={{ ...S.subRowWrap, ...(dragSubId === s.id ? { opacity: .4 } : {}) }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { reorderSub(pid, a.id, dragSubId, s.id); setDragSubId(null); }}
                >
                  <div style={S.subRow}>
                    <div className="sub-drag-handle" draggable onDragStart={() => setDragSubId(s.id)} onDragEnd={() => setDragSubId(null)} style={S.subDragHandle} title="Arraste para reordenar">
                      <GripVertical size={13} color="var(--text-8)" />
                    </div>
                    <input type="checkbox" checked={s.done} onChange={(e) => updateSub(pid, a.id, s.id, { done: e.target.checked })} />
                    <input type="text" className="sub-title-input" value={s.title} onChange={(e) => updateSub(pid, a.id, s.id, { title: e.target.value })} style={{ ...S.subTitleInput, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                    <button className="sub-del-btn" style={S.iconBtnGhost} onClick={() => deleteSub(pid, a.id, s.id)}><X size={13} /></button>
                  </div>
                  <div style={S.subMetaRow}>
                    <select className="sub-meta-select" value={s.responsible || ''} onChange={(e) => updateSub(pid, a.id, s.id, { responsible: e.target.value })} style={S.subMetaSelect} title="Responsável da subatividade">
                      <option value="">Sem responsável</option>
                      {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                    <input type="date" className="sub-meta-date" value={s.date || ''} onChange={(e) => updateSub(pid, a.id, s.id, { date: e.target.value })} style={S.subMetaDate} title="Prazo da subatividade" />
                  </div>
                </div>
              ))}
            </div>
            <button style={S.addSubBtn} onClick={() => addSub(pid, a.id)}><Plus size={12} /> Subatividade</button>

            <div style={S.subSectionLabel}>Anexos {(a.attachments || []).length > 0 ? `(${(a.attachments || []).length})` : ''}</div>
            <div style={S.attachList}>
              {(a.attachments || []).map((att) => (
                <div key={att.id} style={S.attachRow}>
                  {att.type && att.type.startsWith('image/') && <img src={att.dataUrl} alt={att.name} style={S.attachThumb} />}
                  <a href={att.dataUrl} download={att.name} style={S.attachLink}>{att.name}</a>
                  <span style={S.attachSize}>{att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
                  <button style={S.iconBtnGhost} onClick={() => removeAttachment(pid, a.id, att.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div style={S.fieldHint}>Limite de {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB por arquivo.</div>
            <label htmlFor={`file-detail-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
            <input id={`file-detail-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(pid, a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />

            <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c', borderColor: 'rgba(226,87,76,.35)' }} onClick={() => deleteActivity(pid, a.id)}><Trash2 size={14} /> Excluir atividade</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableView({ activities, orderMap, phases, team, pid, expanded, setExpanded, updateActivity, deleteActivity, addSub, updateSub, deleteSub, reorderSub, addAttachment, removeAttachment, openDetail, multiMode, companyColor }) {
  const isMobile = useIsMobile();
  const isCompact = useIsCompact();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [dragSub, setDragSub] = useState(null);
  const [dragActId, setDragActId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragMetaRef = useRef({ orderIds: [], rects: {} });
  const dragOverIdRef = useRef(null);
  const rowElRefs = useRef({});
  const [filterPhase, setFilterPhase] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  function phaseOf(a) {
    const rp = phases || a._phases;
    return rp && rp.find((p) => p.id === a.phase);
  }

  const phaseOptions = [];
  const seenPhaseNames = new Set();
  activities.forEach((a) => {
    const po = phaseOf(a);
    if (po && !seenPhaseNames.has(po.name)) { seenPhaseNames.add(po.name); phaseOptions.push(po); }
  });
  const respOptions = Array.from(new Set(activities.map((a) => a.responsible).filter(Boolean)));

  const filtered = activities.filter((a) => {
    if (filterPhase && phaseOf(a)?.name !== filterPhase) return false;
    if (filterResp && a.responsible !== filterResp) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterPriority && (a.priority || '') !== filterPriority) return false;
    return true;
  });
  const filtersActive = !!(filterPhase || filterResp || filterStatus || filterPriority);

  useEffect(() => {
    if (!dragActId) return;
    function onMove(e) {
      const meta = dragMetaRef.current;
      setDragOffsetY(e.clientY - meta.startY);
      let bestId = dragActId;
      let bestDist = Infinity;
      meta.orderIds.forEach((id) => {
        const r = meta.rects[id];
        if (!r) return;
        const mid = r.top + r.height / 2;
        const dist = Math.abs(e.clientY - mid);
        if (dist < bestDist) { bestDist = dist; bestId = id; }
      });
      dragOverIdRef.current = bestId;
      setDragOverId(bestId);
    }
    function onUp() {
      const toId = dragOverIdRef.current;
      if (toId && toId !== dragActId) reorderActivityByDrop(dragActId, toId);
      setDragActId(null);
      setDragOverId(null);
      setDragOffsetY(0);
      dragOverIdRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActId]);

  function startRowDrag(e, id) {
    if (multiMode) return;
    e.preventDefault();
    const orderIds = filtered.map((x) => x.id);
    const rects = {};
    orderIds.forEach((rid) => {
      const el = rowElRefs.current[rid];
      if (el) {
        const r = el.getBoundingClientRect();
        rects[rid] = { top: r.top, height: r.height };
      }
    });
    dragMetaRef.current = { orderIds, rects, startY: e.clientY };
    dragOverIdRef.current = id;
    setDragActId(id);
    setDragOverId(id);
    setDragOffsetY(0);
  }

  function reorderActivityByDrop(fromId, toId) {
    const list = filtered;
    const fromIdx = list.findIndex((x) => x.id === fromId);
    const toIdx = list.findIndex((x) => x.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const dragged = list[fromIdx];
    const withoutDragged = list.filter((x) => x.id !== fromId);
    const targetIdx = withoutDragged.findIndex((x) => x.id === toId);
    const insertAt = fromIdx < toIdx ? targetIdx + 1 : targetIdx;
    const prev = insertAt > 0 ? withoutDragged[insertAt - 1] : null;
    const next = insertAt < withoutDragged.length ? withoutDragged[insertAt] : null;

    let newDate = dragged.date;
    if (prev && prev.date) newDate = dayAfter(prev.endDate || prev.date);
    else if (next && next.date) newDate = dayBefore(next.date);
    if (!newDate) return;

    const oldDate = dragged.date;
    const oldEnd = dragged.endDate || dragged.date;
    let newEnd;
    if (dragged.durationDays) {
      newEnd = calcDeadline(newDate, dragged.durationDays);
    } else if (oldDate && oldEnd) {
      const spanDays = Math.round((parseDate(oldEnd) - parseDate(oldDate)) / 86400000);
      newEnd = toISODate(addDays(parseDate(newDate), spanDays));
    } else {
      newEnd = newDate;
    }
    updateActivity(pid, dragged.id, { date: newDate, endDate: newEnd }, `Atividade "${dragged.title}" reordenada: novo início ${fmtDate(newDate)}`);
  }

  return (
    <div style={{ ...S.tableLayout, ...(isCompact ? S.tableLayoutCompact : null) }}>
      <style>{SUB_ROW_CSS}</style>
      {isCompact && (
        <button style={S.filterToggleBtn} onClick={() => setShowMobileFilters((v) => !v)}>
          <SlidersHorizontal size={14} /> Filtros{filtersActive ? ' •' : ''} {showMobileFilters ? '▲' : '▼'}
        </button>
      )}
      {(!isCompact || showMobileFilters) && (
      <div style={{ ...S.filterSidebar, ...(isCompact ? S.filterSidebarCompact : null) }}>
        <div style={S.filterSidebarTitle}>Filtros rápidos</div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Fase</div>
          <select style={S.filterSelect} value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
            <option value="">Todas as fases</option>
            {phaseOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Responsável</div>
          <select style={S.filterSelect} value={filterResp} onChange={(e) => setFilterResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {respOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Status</div>
          <select style={S.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Prioridade</div>
          <select style={S.filterSelect} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">Todas as prioridades</option>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>
        {filtersActive && (
          <button style={S.filterClearBtn} onClick={() => { setFilterPhase(''); setFilterResp(''); setFilterStatus(''); setFilterPriority(''); }}>
            Limpar filtros
          </button>
        )}
      </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.tableWrap}>
          {!isMobile && (
          <div style={S.tableHeaderRow}>
            <div style={{ ...S.th, width: 20 }}></div>
            <div style={{ ...S.th, width: 46 }}>#</div>
            {multiMode && <div style={{ ...S.th, width: 150 }}>Empresa</div>}
            <div style={{ ...S.th, flex: 2, minWidth: 260 }}>Atividade</div>
            <div style={{ ...S.th, width: 130 }}>Fase</div>
            <div style={{ ...S.th, width: 170 }}>Responsável</div>
            <div style={{ ...S.th, width: 250 }}>Prazos</div>
            <div style={{ ...S.th, width: 60, textAlign: 'center' }}>Obrig.</div>
            <div style={{ ...S.th, width: 140 }}>Status</div>
            <div style={{ ...S.th, width: 60 }}></div>
          </div>
          )}

          {filtered.length === 0 && (
            <div style={S.tableEmptyState}>Nenhuma atividade encontrada com esses filtros.</div>
          )}

          {filtered.map((a) => {
            const rowPid = pid || a._pid;
            const rowPhases = phases || a._phases;
            const rowTeam = team || a._team;
            const rowAccent = companyColor || a._companyColor || '#F5C400';
            const rowOrder = orderMap ? orderMap[a.id] : a._order;
            const isOpen = !!expanded[`${rowPid}-${a.id}`];
            const subs = (a.subactivities || []).filter((s) => !s.deleted);
            const doneSubs = subs.filter((s) => s.done).length;
            const phaseColor = phaseOf(a)?.color || 'var(--text-5)';
            const isDragging = dragActId === a.id;

            let rowShift = 0;
            if (dragActId && !isDragging) {
              const meta = dragMetaRef.current;
              const fromIdx = meta.orderIds.indexOf(dragActId);
              const hoverIdx = meta.orderIds.indexOf(dragOverId);
              const idx = meta.orderIds.indexOf(a.id);
              const draggedHeight = (meta.rects[dragActId] && meta.rects[dragActId].height) || 0;
              if (fromIdx !== -1 && hoverIdx !== -1 && idx !== -1) {
                if (hoverIdx >= fromIdx && idx > fromIdx && idx <= hoverIdx) rowShift = -draggedHeight;
                else if (hoverIdx < fromIdx && idx < fromIdx && idx >= hoverIdx) rowShift = draggedHeight;
              }
            }

            return (
              <div
                key={`${rowPid}-${a.id}`}
                ref={(el) => { rowElRefs.current[a.id] = el; }}
                style={{
                  ...S.tableGroup,
                  borderLeft: `3px solid ${rowAccent}`,
                  position: 'relative',
                  transform: isDragging ? `translateY(${dragOffsetY}px)` : (rowShift ? `translateY(${rowShift}px)` : undefined),
                  transition: isDragging ? 'none' : 'transform .15s ease',
                  zIndex: isDragging ? 5 : undefined,
                  ...(isDragging ? S.tableRowDragging : {}),
                }}
              >
                {!isMobile && (
                <div style={S.tableRow}>
                  <div
                    style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: multiMode ? 'default' : (isDragging ? 'grabbing' : 'grab'), opacity: multiMode ? 0.25 : 1, flexShrink: 0 }}
                    onMouseDown={(e) => startRowDrag(e, a.id)}
                    title={multiMode ? undefined : 'Arraste para reordenar (ajusta a data de início)'}
                  >
                    <GripVertical size={14} color="var(--text-7)" />
                  </div>
                  <div style={{ width: 46, paddingTop: 6 }}><span style={S.monthBadgeSm}>#{rowOrder}</span></div>
                  {multiMode && (
                    <div style={{ width: 150 }}>
                      <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} />
                    </div>
                  )}
                  <div style={{ flex: 2, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.priority && <span title={`Prioridade ${PRIORITY_META[a.priority].label}`} style={{ ...S.priorityDot, background: PRIORITY_META[a.priority].color }} />}
                      <input type="text" value={a.title} onChange={(e) => updateActivity(rowPid, a.id, { title: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Título alterado: "${a.title}"`)} style={{ flex: 1 }} />
                    </div>
                    <input type="text" value={a.desc} onChange={(e) => updateActivity(rowPid, a.id, { desc: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 4, opacity: .8 }} />
                    <button
                      style={S.subToggleBtn}
                      onClick={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: !e[`${rowPid}-${a.id}`] }))}
                    >
                      <ChevronDown size={11} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                      {subs.length > 0 ? `${doneSubs}/${subs.length} subatividades` : 'Detalhes'}
                    </button>
                  </div>
                  <div style={{ width: 130 }}>
                    <select
                      value={a.phase}
                      onChange={(e) => {
                        const newPhaseId = Number(e.target.value);
                        const phaseName = rowPhases.find((p) => p.id === newPhaseId)?.name || '';
                        updateActivity(rowPid, a.id, { phase: newPhaseId }, `Fase alterada em "${a.title}": ${phaseName}`);
                      }}
                      style={{ ...S.pillSelect, background: `${phaseColor}22`, borderColor: `${phaseColor}66`, color: phaseColor }}
                    >
                      {rowPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 170, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...S.avatarDot, background: rowAccent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                    <select value={a.responsible} onChange={(e) => updateActivity(rowPid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1, minWidth: 0 }}>
                      {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 250, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="date" style={{ width: 96, flexShrink: 0 }} value={a.date} onChange={(e) => {
                      const v = e.target.value;
                      const patch = { date: v };
                      if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
                      else if (!a.endDate || a.endDate < v) patch.endDate = v;
                      updateActivity(rowPid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                    }} />
                    <input
                      type="number"
                      min={1}
                      placeholder="dias"
                      title="Prazo em dias"
                      value={a.durationDays || ''}
                      style={S.prazoInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        const patch = { durationDays: v ? Number(v) : '' };
                        if (v && a.date) patch.endDate = calcDeadline(a.date, v);
                        updateActivity(rowPid, a.id, patch);
                      }}
                      onBlur={() => updateActivity(rowPid, a.id, {}, `Prazo alterado em "${a.title}": ${a.durationDays ? a.durationDays + ' dias' : 'sem prazo definido'}`)}
                    />
                    <input type="date" style={{ width: 96, flexShrink: 0 }} value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(rowPid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
                  </div>
                  <div style={{ width: 60, textAlign: 'center' }}>
                    <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(rowPid, a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} />
                  </div>
                  <div style={{ width: 140 }}>
                    <select value={a.status} onChange={(e) => updateActivity(rowPid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ ...S.pillSelect, background: STATUS_META[a.status].bg, borderColor: STATUS_META[a.status].border, color: STATUS_META[a.status].color }}>
                      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  </div>
                  <div style={S.actionsCell}>
                    <button style={S.iconBtnGhost} title="Abrir em tela cheia" onClick={() => openDetail(rowPid, a.id)}><Maximize2 size={13} /></button>
                    <button style={S.iconBtnGhost} onClick={() => deleteActivity(rowPid, a.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                )}

                {isMobile && (
                  <div style={S.mobileActCard}>
                    <div style={S.mobileActTopRow}>
                      <span style={S.monthBadgeSm}>#{rowOrder}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {a.priority && <span title={`Prioridade ${PRIORITY_META[a.priority].label}`} style={{ ...S.priorityDot, background: PRIORITY_META[a.priority].color, flexShrink: 0 }} />}
                          <input type="text" value={a.title} onChange={(e) => updateActivity(rowPid, a.id, { title: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Título alterado: "${a.title}"`)} style={{ flex: 1, fontWeight: 700 }} />
                        </div>
                        {multiMode && <div style={{ marginTop: 6 }}><CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} /></div>}
                        <input type="text" value={a.desc} onChange={(e) => updateActivity(rowPid, a.id, { desc: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 6, opacity: .8 }} />
                      </div>
                    </div>

                    <div style={S.mobileFieldGroup}>
                      <div>
                        <div style={S.mobileFieldLabel}>Fase</div>
                        <select
                          value={a.phase}
                          onChange={(e) => {
                            const newPhaseId = Number(e.target.value);
                            const phaseName = rowPhases.find((p) => p.id === newPhaseId)?.name || '';
                            updateActivity(rowPid, a.id, { phase: newPhaseId }, `Fase alterada em "${a.title}": ${phaseName}`);
                          }}
                          style={{ ...S.pillSelect, background: `${phaseColor}22`, borderColor: `${phaseColor}66`, color: phaseColor }}
                        >
                          {rowPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={S.mobileFieldLabel}>Responsável</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...S.avatarDot, background: rowAccent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                          <select value={a.responsible} onChange={(e) => updateActivity(rowPid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1, minWidth: 0 }}>
                            {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <div style={S.mobileFieldLabel}>Status</div>
                        <select value={a.status} onChange={(e) => updateActivity(rowPid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ ...S.pillSelect, background: STATUS_META[a.status].bg, borderColor: STATUS_META[a.status].border, color: STATUS_META[a.status].color }}>
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={S.mobileFieldLabel}>Início</div>
                          <input type="date" value={a.date} onChange={(e) => {
                            const v = e.target.value;
                            const patch = { date: v };
                            if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
                            else if (!a.endDate || a.endDate < v) patch.endDate = v;
                            updateActivity(rowPid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                          }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={S.mobileFieldLabel}>Fim</div>
                          <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(rowPid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
                        </div>
                      </div>
                      <div>
                        <div style={S.mobileFieldLabel}>Prazo (dias)</div>
                        <input
                          type="number"
                          min={1}
                          placeholder="dias"
                          value={a.durationDays || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            const patch = { durationDays: v ? Number(v) : '' };
                            if (v && a.date) patch.endDate = calcDeadline(a.date, v);
                            updateActivity(rowPid, a.id, patch);
                          }}
                          onBlur={() => updateActivity(rowPid, a.id, {}, `Prazo alterado em "${a.title}": ${a.durationDays ? a.durationDays + ' dias' : 'sem prazo definido'}`)}
                        />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
                        <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(rowPid, a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} /> Obrigatória
                      </label>
                    </div>

                    <div style={S.mobileActionsRow}>
                      <button
                        style={S.subToggleBtn}
                        onClick={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: !e[`${rowPid}-${a.id}`] }))}
                      >
                        <ChevronDown size={11} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                        {subs.length > 0 ? `${doneSubs}/${subs.length} subatividades` : 'Detalhes'}
                      </button>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={S.mobileIconBtn} title="Abrir em tela cheia" onClick={() => openDetail(rowPid, a.id)}><Maximize2 size={16} /></button>
                        <button style={S.mobileIconBtn} onClick={() => deleteActivity(rowPid, a.id)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div style={S.subPanel}>
                    <div style={S.subList}>
                      {subs.map((s) => (
                        <div
                          key={s.id}
                          className="sub-row-card"
                          style={{ ...S.subRowWrap, ...(dragSub && dragSub.subId === s.id ? { opacity: .4 } : {}) }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragSub && dragSub.actId === a.id) reorderSub(rowPid, a.id, dragSub.subId, s.id); setDragSub(null); }}
                        >
                          <div style={S.subRow}>
                            <div className="sub-drag-handle" draggable onDragStart={() => setDragSub({ actId: a.id, subId: s.id })} onDragEnd={() => setDragSub(null)} style={S.subDragHandle} title="Arraste para reordenar">
                              <GripVertical size={13} color="var(--text-8)" />
                            </div>
                            <input type="checkbox" checked={s.done} onChange={(e) => updateSub(rowPid, a.id, s.id, { done: e.target.checked })} />
                            <input type="text" className="sub-title-input" value={s.title} onChange={(e) => updateSub(rowPid, a.id, s.id, { title: e.target.value })} style={{ ...S.subTitleInput, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                            <button className="sub-del-btn" style={S.iconBtnGhost} onClick={() => deleteSub(rowPid, a.id, s.id)}><X size={13} /></button>
                          </div>
                          <div style={S.subMetaRow}>
                            <select className="sub-meta-select" value={s.responsible || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { responsible: e.target.value })} style={S.subMetaSelect} title="Responsável da subatividade">
                              <option value="">Sem responsável</option>
                              {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                            </select>
                            <input type="date" className="sub-meta-date" value={s.date || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { date: e.target.value })} style={S.subMetaDate} title="Prazo da subatividade" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button style={S.addSubBtn} onClick={() => addSub(rowPid, a.id)}><Plus size={12} /> Subatividade</button>

                    <div style={S.subSectionLabel}>Observações</div>
                    <textarea
                      value={a.notes || ''}
                      onChange={(e) => updateActivity(rowPid, a.id, { notes: e.target.value })}
                      onBlur={() => updateActivity(rowPid, a.id, {}, `Observação alterada em "${a.title}"`)}
                      placeholder="Comentários, contexto, decisões desta atividade..."
                      rows={3}
                      style={S.notesArea}
                    />

                    <div style={S.subSectionLabel}>Anexos {(a.attachments || []).length > 0 ? `(${(a.attachments || []).length})` : ''}</div>
                    <div style={S.attachList}>
                      {(a.attachments || []).map((att) => (
                        <div key={att.id} style={S.attachRow}>
                          <a href={att.dataUrl} download={att.name} style={S.attachLink}>{att.name}</a>
                          <span style={S.attachSize}>{att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
                          <button style={S.iconBtnGhost} onClick={() => removeAttachment(rowPid, a.id, att.id)}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                    <label htmlFor={`file-${rowPid}-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
                    <input id={`file-${rowPid}-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(rowPid, a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PhasesView({ activities, orderMap, phases, pid, updateActivity, openDetail, companyColor }) {
  const accent = companyColor || '#F5C400';
  const [collapsed, setCollapsed] = useState({});
  function toggle(id) { setCollapsed((c) => ({ ...c, [id]: !c[id] })); }

  function cycleStatus(a) {
    const rowPid = pid || a._pid;
    const idx = STATUS_ORDER.indexOf(a.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateActivity(rowPid, a.id, { status: next }, `Status alterado em "${a.title}": ${STATUS_META[next].label}`);
  }

  const todayISO = toISODate(startOfDay(new Date()));
  const isOverdue = (a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < todayISO;

  const total = activities.length;
  const doneCount = activities.filter((a) => a.status === 'concluido').length;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = activities.filter(isOverdue).length;
  const collaborators = new Set(activities.map((a) => a.responsible).filter(Boolean));
  const ends = activities.map((a) => a.endDate || a.date).filter(Boolean);
  const lastEnd = ends.length ? ends.reduce((mx, d) => (d > mx ? d : mx)) : null;
  const daysRemaining = lastEnd ? Math.max(0, Math.round((parseDate(lastEnd) - parseDate(todayISO)) / 86400000)) : 0;
  const statusCounts = STATUS_ORDER.reduce((acc, s) => { acc[s] = activities.filter((a) => a.status === s).length; return acc; }, {});
  const maxStatusCount = Math.max(1, ...STATUS_ORDER.map((s) => statusCounts[s]));
  const circumference = 2 * Math.PI * 32;

  return (
    <div>
      <div style={S.phasesSummaryCard}>
        <div style={S.phasesSummaryDonutWrap}>
          <svg viewBox="0 0 80 80" width="72" height="72">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border-1)" strokeWidth="9" />
            <circle
              cx="40" cy="40" r="32" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progressPct / 100)}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div style={S.phasesSummaryDonutLabel}>{progressPct}%</div>
        </div>
        <div style={S.phasesSummaryMid}>
          <div style={S.phasesSummaryTitle}>Progresso Geral do Projeto</div>
          <div style={S.phasesSummaryStatBars}>
            {STATUS_ORDER.map((s) => (
              <div
                key={s}
                title={`${STATUS_META[s].label}: ${statusCounts[s]}`}
                style={{ ...S.phasesSummaryBar, background: STATUS_META[s].color, height: Math.max(5, (statusCounts[s] / maxStatusCount) * 36) }}
              />
            ))}
          </div>
        </div>
        <div style={S.phasesSummaryStats}>
          <div>
            <div style={S.phasesSummaryStatNum}>{daysRemaining}</div>
            <div style={S.phasesSummaryStatLabel}>Dias restantes</div>
          </div>
          <div>
            <div style={{ ...S.phasesSummaryStatNum, color: overdueCount ? '#e2574c' : 'var(--text-1)' }}>{overdueCount}</div>
            <div style={S.phasesSummaryStatLabel}>Em atraso</div>
          </div>
          <div>
            <div style={S.phasesSummaryStatNum}>{collaborators.size}</div>
            <div style={S.phasesSummaryStatLabel}>Colaboradores</div>
          </div>
        </div>
      </div>

      {phases.map((p) => {
        const phaseActs = activities.filter((a) => a.phase === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const phaseDone = phaseActs.filter((a) => a.status === 'concluido').length;
        const phasePct = phaseActs.length ? Math.round((phaseDone / phaseActs.length) * 100) : 0;
        const isCollapsed = !!collapsed[p.id];
        return (
          <section key={p.id} style={{ ...S.phaseSection, borderLeft: `3px solid ${accent}` }}>
            <div style={S.phaseHead2} onClick={() => toggle(p.id)}>
              <div style={{ ...S.phaseNum, color: p.color }}>0{p.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.phaseTitle}>{p.name}</div>
                <div style={S.phaseSub}>{p.sub}</div>
              </div>
              <div style={S.phaseProgressWrap}>
                <div style={S.phaseProgressTrack}>
                  <div style={{ ...S.phaseProgressFill, width: `${phasePct}%`, background: p.color }} />
                </div>
                <div style={S.phaseProgressPct}>{phasePct}%</div>
              </div>
              <ChevronDown size={16} style={{ color: 'var(--text-5)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s', flexShrink: 0 }} />
            </div>

            {!isCollapsed && (
              <div style={S.phaseCardGrid}>
                {phaseActs.map((a) => {
                  const rowPid = pid || a._pid;
                  const rowOrder = orderMap ? orderMap[a.id] : a._order;
                  const overdue = isOverdue(a);
                  return (
                    <div
                      key={a.id}
                      style={{ ...S.phaseCard, borderColor: overdue ? '#e2574c66' : 'var(--border-1)', borderLeft: `3px solid ${overdue ? '#e2574c' : accent}` }}
                      onClick={() => openDetail(rowPid, a.id)}
                    >
                      <div style={S.phaseCardTop}>
                        <span style={{ ...S.monthBadgeSm, background: p.color }}>#{rowOrder}</span>
                        <div style={S.phaseActTitle}>{a.title}{a.required && <span style={S.reqDot} title="Obrigatória" />}</div>
                        {overdue && <span title="Atrasada" style={S.phaseWarnIcon}><AlertTriangle size={13} /></span>}
                        <StatusPill status={a.status} onClick={(e) => { e.stopPropagation(); cycleStatus(a); }} />
                      </div>
                      {a.desc && <div style={S.phaseActDesc}>{a.desc}</div>}
                      <div style={S.phaseCardFooter}>
                        <div style={S.phaseCardOwner}>
                          <span style={{ ...S.avatarDot, background: accent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                          {a.responsible}
                        </div>
                        <div style={S.phaseDate}>{fmtDate(a.date)}{a.endDate && a.endDate !== a.date ? ` – ${fmtDate(a.endDate)}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KanbanView({ activities, orderMap, phases, pid, dragId, setDragId, updateActivity, addActivity, openDetail, multiMode }) {
  const isMobile = useIsMobile();
  function keyPid(a) { return pid || a._pid; }
  function onDrop(status) {
    if (!dragId) return;
    const a = activities.find((x) => x.id === dragId.id && keyPid(x) === dragId.pid);
    if (a && a.status !== status) {
      updateActivity(dragId.pid, a.id, { status }, `Status alterado em "${a.title}": ${STATUS_META[status].label}`);
    }
    setDragId(null);
  }
  return (
    <div style={{ ...S.kanbanBoard, ...(isMobile ? S.kanbanBoardMobile : null) }}>
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const items = activities.filter((a) => a.status === status);
        return (
          <div key={status} style={{ ...S.kanbanCol, ...(isMobile ? S.kanbanColMobile : null) }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(status)}>
            <div style={S.kanbanColHead}>
              <span style={{ ...S.kanbanDot, background: meta.color }} />
              <span>{meta.label}</span>
              <span style={S.kanbanCount}>{items.length}</span>
            </div>
            {items.map((a) => {
              const rowPid = keyPid(a);
              const rowPhases = phases && phases.length ? phases : a._phases;
              const phase = rowPhases && rowPhases.find((p) => p.id === a.phase);
              const rowOrder = orderMap && orderMap[a.id] ? orderMap[a.id] : a._order;
              return (
                <div key={`${rowPid}-${a.id}`} draggable onDragStart={() => setDragId({ pid: rowPid, id: a.id })} onClick={() => openDetail(rowPid, a.id)} style={S.kanbanCard}>
                  <div style={S.kanbanCardTop}>
                    <span style={{ ...S.monthBadgeSm, background: phase?.color }}>#{rowOrder}</span>
                    <GripVertical size={13} color="var(--text-8)" />
                  </div>
                  {multiMode && <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} small />}
                  <div style={S.kanbanCardTitle}>{a.title}</div>
                  <div style={S.kanbanCardMeta}>
                    <span>{a.responsible}</span>
                    <span>{fmtDate(a.date)}</span>
                  </div>
                </div>
              );
            })}
            {status === 'nao-iniciado' && addActivity && (
              <button style={S.kanbanAdd} onClick={addActivity}><Plus size={13} /> Nova atividade</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const GANTT_DAYS_PER_COL = { dia: 1, semana: 7, mes: 30.4368, ano: 365.25 };

function TimelineView({ activities, phases, granularity, setGranularity, windowAnchor, setWindowAnchor, pid, updateActivity, openDetail }) {
  const columns = buildTimelineColumns(granularity, activities, windowAnchor);
  const noDate = activities.filter((a) => !a.date);
  const windowed = granularity === 'dia' || granularity === 'semana';

  function nav(dir) {
    if (granularity === 'dia') setWindowAnchor((d) => addMonths(d, dir));
    else if (granularity === 'semana') setWindowAnchor((d) => addMonths(d, dir * 3));
  }

  const LABEL_W = 216;
  const colW = granularity === 'dia' ? 34 : granularity === 'semana' ? 70 : granularity === 'ano' ? 120 : 92;
  const totalW = LABEL_W + columns.length * colW;
  const daysPerCol = GANTT_DAYS_PER_COL[granularity] || 30.4368;

  const [dragBar, setDragBar] = useState(null);

  useEffect(() => {
    if (!dragBar) return;
    function onMove(e) {
      setDragBar((d) => (d ? { ...d, offsetPx: e.clientX - d.startX } : d));
    }
    function onUp(e) {
      setDragBar((d) => {
        if (d) {
          const pxMoved = e.clientX - d.startX;
          if (Math.abs(pxMoved) < 4) {
            openDetail(pid, d.id);
          } else {
            const deltaDays = Math.round((pxMoved / colW) * daysPerCol);
            if (deltaDays !== 0) {
              const newDate = toISODate(addDays(parseDate(d.origDate), deltaDays));
              const newEnd = toISODate(addDays(parseDate(d.origEndDate), deltaDays));
              updateActivity(pid, d.id, { date: newDate, endDate: newEnd }, `Atividade "${d.title}" reagendada no Gantt: ${fmtDate(newDate)} – ${fmtDate(newEnd)}`);
            }
          }
        }
        return null;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragBar, colW, daysPerCol, pid, updateActivity, openDetail]);

  const rows = [];
  let r = 1;
  phases.forEach((p) => {
    rows.push({ type: 'phase', row: r, phase: p });
    r++;
    const acts = activities.filter((a) => a.phase === p.id && a.date).sort((x, y) => x.date.localeCompare(y.date));
    acts.forEach((a) => {
      const sIdx = colIndexFor(a.date, columns);
      const eIdx = colIndexFor(a.endDate || a.date, columns);
      if (sIdx === null) return;
      rows.push({ type: 'bar', row: r, act: a, phase: p, sIdx, eIdx: Math.max(sIdx, eIdx === null ? sIdx : eIdx) });
      r++;
    });
  });
  const totalRows = r - 1;

  const todayISO = toISODate(startOfDay(new Date()));
  const todayColIdx = colIndexFor(todayISO, columns);
  const todayLeft = todayColIdx === null ? null : LABEL_W + todayColIdx * colW + fractionInColumn(todayISO, columns[todayColIdx]) * colW;

  return (
    <div>
      <div className="no-print" style={S.timelineToolbar}>
        <div style={S.granularityGroup}>
          {[{ id: 'dia', l: 'Dia' }, { id: 'semana', l: 'Semana' }, { id: 'mes', l: 'Mês' }, { id: 'ano', l: 'Ano' }].map((g) => (
            <button key={g.id} onClick={() => setGranularity(g.id)} style={{ ...S.granBtn, ...(granularity === g.id ? S.granBtnActive : {}) }}>{g.l}</button>
          ))}
        </div>
        {windowed && (
          <div style={S.navGroup}>
            <button style={S.navBtn} onClick={() => nav(-1)}>‹</button>
            <span style={S.navLabel}>{granularity === 'dia' ? fmtMonthTitle(windowAnchor) : `${fmtMonthTitle(addMonths(windowAnchor, -1))} — ${fmtMonthTitle(addMonths(windowAnchor, 1))}`}</span>
            <button style={S.navBtn} onClick={() => nav(1)}>›</button>
            <button style={S.navToday} onClick={() => setWindowAnchor(new Date())}>Hoje</button>
          </div>
        )}
      </div>

      {columns.length === 0 ? (
        <div style={S.emptyMuted}>Nenhuma atividade com data cadastrada para exibir no Gantt.</div>
      ) : (
        <div style={S.ganttScroll}>
          <div style={{ ...S.ganttGrid, width: totalW, gridTemplateColumns: `${LABEL_W}px repeat(${columns.length}, ${colW}px)`, gridTemplateRows: `32px repeat(${totalRows}, 46px)` }}>
            <div style={{ gridRow: 1, gridColumn: 1, ...S.ganttCornerCell }} />
            {columns.map((c, i) => (
              <div key={c.key} style={{ gridRow: 1, gridColumn: i + 2, ...S.ganttColHeader }}>{c.label}</div>
            ))}

            {rows.map((row) => row.type === 'phase' ? (
              <div key={'ph' + row.phase.id} style={{ gridRow: row.row + 1, gridColumn: `1 / -1`, ...S.ganttPhaseRow }}>
                <span style={{ ...S.timelineLaneDot, background: row.phase.color }} />
                {row.phase.name}
              </div>
            ) : (
              <React.Fragment key={row.act.id}>
                <div style={{ gridRow: row.row + 1, gridColumn: 1, ...S.ganttLabelCell }}>
                  <div style={S.ganttLabelTitle}>{row.act.title}</div>
                  <div style={S.ganttLabelMeta}>{row.act.responsible}</div>
                </div>
                <div style={{ gridRow: row.row + 1, gridColumn: `${row.sIdx + 2} / ${row.eIdx + 3}`, ...S.ganttBarWrap }}>
                  <div
                    className="no-print"
                    style={{
                      ...S.ganttBar,
                      background: STATUS_META[row.act.status].bg,
                      borderColor: row.phase.color,
                      cursor: dragBar && dragBar.id === row.act.id ? 'grabbing' : 'grab',
                      position: 'relative',
                      transform: dragBar && dragBar.id === row.act.id ? `translateX(${dragBar.offsetPx}px)` : undefined,
                      boxShadow: dragBar && dragBar.id === row.act.id ? '0 6px 16px rgba(0,0,0,.5)' : undefined,
                      zIndex: dragBar && dragBar.id === row.act.id ? 5 : undefined,
                      userSelect: 'none',
                    }}
                    title={`${row.act.title}\n${fmtDate(row.act.date)} – ${fmtDate(row.act.endDate || row.act.date)}\nClique para abrir · arraste para reagendar`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDragBar({ id: row.act.id, title: row.act.title, startX: e.clientX, origDate: row.act.date, origEndDate: row.act.endDate || row.act.date, offsetPx: 0 });
                    }}
                  >
                    <span style={{ ...S.ganttBarDot, background: STATUS_META[row.act.status].color }} />
                    <span style={S.ganttBarTitle}>{row.act.title}</span>
                  </div>
                </div>
              </React.Fragment>
            ))}

            {todayLeft !== null && (
              <div style={{ ...S.ganttTodayLine, left: todayLeft, height: 32 + totalRows * 46 }} />
            )}
          </div>
        </div>
      )}

      {noDate.length > 0 && (
        <div style={S.noDateBlock}>
          <div style={S.noDateLabel}>Sem data definida ({noDate.length})</div>
          <div style={S.noDateList}>
            {noDate.map((a) => <span key={a.id} style={S.noDateChip}>{a.title}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page: { background: 'var(--bg-page)', color: 'var(--text-1)', fontFamily: "'Inter', sans-serif", minHeight: '100dvh', paddingBottom: 40, position: 'relative' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 24px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-2)' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  logoImg: { width: 38, height: 38, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-3)' },
  logoPlaceholder: { width: 38, height: 38, borderRadius: 8, background: 'var(--bg-4)', border: '1px solid var(--border-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  brandNameRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  brandName: { fontWeight: 700, fontSize: 14 },
  brandSecondary: { fontSize: 11.5, color: 'var(--text-5)', marginTop: 1 },
  brandCnpj: { fontSize: 11.5, color: 'var(--text-5)' },
  companyStatusPill: { fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 999, border: '1px solid' },
  companyStatusPillSm: { fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, border: '1px solid', flexShrink: 0 },
  actingOrgBanner: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#F5C400', background: 'rgba(245,196,0,.12)', borderBottom: '1px solid rgba(245,196,0,.3)', padding: '7px 20px' },
  actingOrgExitBtn: { marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(245,196,0,.5)', color: '#F5C400', fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer' },
  projectSwitch: { fontWeight: 700, fontSize: 13, background: 'var(--bg-4)', border: '1px solid var(--border-3)', color: 'var(--text-1)', borderRadius: 6, padding: '4px 8px', maxWidth: 260 },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-4)', border: '1px solid var(--border-3)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' },
  iconBtnGhost: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', padding: 4 },
  mentionBadge: { position: 'absolute', top: -3, right: -5, background: '#e2574c', color: '#fff', fontSize: 9.5, fontWeight: 800, borderRadius: 999, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#F5C400', border: 'none', color: '#111', fontSize: 12.5, fontWeight: 800, padding: '7px 13px', borderRadius: 7, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, padding: '14px 24px 0 24px', overflowX: 'auto' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-4)', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer' },
  tabActive: { background: 'var(--bg-3)', color: '#F5C400', borderColor: 'var(--border-3)', borderBottomColor: 'var(--bg-3)' },
  main: { padding: '20px 24px 0 24px' },
  hint: { fontSize: 11.5, color: 'var(--text-7)', textAlign: 'center', marginTop: 24 },

  userBadge: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6, paddingLeft: 12, borderLeft: '1px solid var(--border-2)' },
  userAvatarBtn: { background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', lineHeight: 0 },
  themeToggleCorner: { position: 'absolute', top: 24, right: 24 },
  roleTag: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' },
  userName: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' },

  // login
  loginWrap: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginBox: { width: 'min(520px, 100%)' },
  loginLogo: { height: 34, marginBottom: 18 },
  loginEyebrow: { fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#F5C400', marginBottom: 10 },
  loginTitle: { fontSize: 26, fontWeight: 900, marginBottom: 8 },
  loginSub: { fontSize: 13, color: 'var(--text-4)', lineHeight: 1.6, marginBottom: 24 },
  loginList: { display: 'flex', flexDirection: 'column', gap: 10 },
  loginCard: { textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  loginName: { fontSize: 15, fontWeight: 700, color: 'var(--text-1)' },
  loginMeta: { fontSize: 12, color: 'var(--text-5)' },

  // table view
  tableLayout: { display: 'flex', gap: 18, alignItems: 'flex-start' },
  tableLayoutCompact: { flexDirection: 'column' },
  filterSidebar: { width: 200, flexShrink: 0, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 },
  filterSidebarCompact: { width: '100%', position: 'static' },
  filterToggleBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-3)', border: '1px solid var(--border-2)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', width: '100%', justifyContent: 'center' },
  filterSidebarTitle: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-5)' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  filterLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-4)' },
  filterSelect: { fontSize: 12 },
  filterClearBtn: { fontSize: 11, fontWeight: 700, color: '#F5C400', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 },
  tableEmptyState: { padding: '24px 16px', textAlign: 'center', color: 'var(--text-6)', fontSize: 12.5, background: 'var(--bg-1)' },
  tableWrap: { border: '1px solid var(--border-1)', borderRadius: 10, overflowX: 'auto', overflowY: 'hidden' },
  tableHeaderRow: { display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-3)', borderBottom: '1px solid var(--border-1)' },
  th: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-5)' },
  tableGroup: { borderBottom: '1px solid var(--border-1)' },
  tableRowDragging: { opacity: .96, boxShadow: '0 10px 24px rgba(0,0,0,.55)' },
  tableRow: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--bg-1)' },
  // Layout alternativo em card usado só quando isMobile — mesma linha de dados do tableRow,
  // reorganizada em coluna única porque uma linha horizontal de ~10 campos não cabe num celular.
  mobileActCard: { display: 'flex', flexDirection: 'column', gap: 12, padding: '14px', background: 'var(--bg-1)' },
  mobileActTopRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  mobileFieldGroup: { display: 'flex', flexDirection: 'column', gap: 12 },
  mobileFieldLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-5)', marginBottom: 4 },
  mobileActionsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingTop: 10, borderTop: '1px solid var(--border-1)' },
  mobileIconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-3)', cursor: 'pointer' },
  monthBadgeSm: { fontSize: 10.5, fontWeight: 800, background: '#F5C400', color: '#111', padding: '3px 7px', borderRadius: 5 },
  subCounter: { fontSize: 11, color: 'var(--text-6)', marginTop: 4 },
  subToggleBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 6 },
  pillSelect: { borderRadius: 999, padding: '5px 10px', fontWeight: 700, fontSize: 11.5, border: '1px solid' },
  prazoInput: { width: 46, flexShrink: 0, textAlign: 'center', padding: '6px 2px', fontSize: 12 },
  actionsCell: { width: 60, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  subPanel: { padding: '4px 14px 14px 60px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-page)' },
  subList: { display: 'flex', flexDirection: 'column', gap: 6 },
  subRowWrap: { display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 8px 7px 5px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border-1)' },
  subRow: { display: 'flex', alignItems: 'center', gap: 7 },
  subMetaRow: { display: 'flex', gap: 6, paddingLeft: 34 },
  subDragHandle: { display: 'flex', alignItems: 'center', cursor: 'grab', flexShrink: 0 },
  subTitleInput: { flex: 1, minWidth: 60 },
  subMetaSelect: { flex: '0 1 160px', minWidth: 0 },
  subMetaDate: { flex: '0 1 130px', minWidth: 0 },
  addSubBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px dashed var(--border-3)', color: 'var(--text-4)', fontSize: 11.5, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', width: 'fit-content', marginTop: 4 },
  subSectionLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-5)', marginTop: 14, marginBottom: 6 },
  notesArea: { resize: 'vertical', minHeight: 60, lineHeight: 1.5 },
  attachList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 },
  attachRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-4)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '6px 9px' },
  attachThumb: { width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  attachLink: { fontSize: 12, color: '#F5C400', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  attachSize: { fontSize: 10.5, color: 'var(--text-6)', flexShrink: 0 },
  mentionTag: { color: '#F5C400', fontWeight: 700 },
  historyList: { display: 'flex', flexDirection: 'column', maxHeight: 220, overflowY: 'auto', marginBottom: 10 },
  participantChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  participantChip: { fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--border-3)', background: 'var(--bg-4)', color: 'var(--text-4)', cursor: 'pointer' },
  participantChipActive: { borderColor: '#F5C400', color: '#F5C400', background: 'rgba(245,196,0,.12)' },

  // phases view
  phasesSummaryCard: { display: 'flex', alignItems: 'center', gap: 26, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '18px 24px', marginBottom: 28, flexWrap: 'wrap' },
  phasesSummaryDonutWrap: { position: 'relative', width: 72, height: 72, flexShrink: 0 },
  phasesSummaryDonutLabel: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--text-1)' },
  phasesSummaryMid: { flex: 1, minWidth: 180 },
  phasesSummaryTitle: { fontSize: 13, fontWeight: 800, color: 'var(--text-2)', marginBottom: 10 },
  phasesSummaryStatBars: { display: 'flex', alignItems: 'flex-end', gap: 5, height: 36 },
  phasesSummaryBar: { width: 11, borderRadius: 3 },
  phasesSummaryStats: { display: 'flex', gap: 30, flexShrink: 0 },
  phasesSummaryStatNum: { fontSize: 22, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1 },
  phasesSummaryStatLabel: { fontSize: 10.5, color: 'var(--text-5)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.03em', whiteSpace: 'nowrap' },

  phaseSection: { marginBottom: 32, paddingLeft: 14, borderRadius: 4 },
  phaseHead: { display: 'flex', gap: 14, alignItems: 'baseline', borderBottom: '1px solid var(--border-1)', paddingBottom: 14, marginBottom: 16 },
  phaseHead2: { display: 'flex', gap: 14, alignItems: 'center', borderBottom: '1px solid var(--border-1)', paddingBottom: 14, marginBottom: 16, cursor: 'pointer' },
  phaseNum: { fontSize: 26, fontWeight: 900, lineHeight: 1, flexShrink: 0 },
  phaseTitle: { fontSize: 16, fontWeight: 800 },
  phaseSub: { fontSize: 12, color: 'var(--text-5)', marginTop: 2 },
  phaseProgressWrap: { display: 'flex', alignItems: 'center', gap: 8, width: 140, flexShrink: 0 },
  phaseProgressTrack: { flex: 1, height: 6, background: 'var(--border-1)', borderRadius: 999, overflow: 'hidden' },
  phaseProgressFill: { height: '100%', borderRadius: 999 },
  phaseProgressPct: { fontSize: 11.5, fontWeight: 800, color: 'var(--text-3)', width: 32, textAlign: 'right', flexShrink: 0 },
  phaseCardGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  phaseCard: { background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 9, padding: '13px 14px', cursor: 'pointer' },
  phaseCardTop: { display: 'flex', alignItems: 'center', gap: 8 },
  phaseCardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  phaseCardOwner: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  phaseWarnIcon: { color: '#e2574c', display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatarDot: { width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#111', flexShrink: 0 },
  priorityDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  phaseRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 9, marginBottom: 9 },
  monthBadge: { fontSize: 12, fontWeight: 900, color: '#111', width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  phaseActTitle: { fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  reqDot: { width: 6, height: 6, borderRadius: '50%', background: '#e2574c', display: 'inline-block', flexShrink: 0 },
  phaseActDesc: { fontSize: 12, color: 'var(--text-4)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  phaseOwner: { fontSize: 12, fontWeight: 700, color: 'var(--text-3)', width: 110, flexShrink: 0 },
  phaseDate: { fontSize: 11.5, color: 'var(--text-4)', flexShrink: 0, whiteSpace: 'nowrap' },
  statusPill: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', padding: '5px 9px', borderRadius: 999, border: '1px solid', textAlign: 'center', flexShrink: 0, whiteSpace: 'nowrap' },

  // kanban
  kanbanBoard: { display: 'grid', gridTemplateColumns: `repeat(${STATUS_ORDER.length}, 1fr)`, gap: 16 },
  // No celular a grade de 4 colunas fica espremida demais — vira uma fileira com rolagem
  // horizontal (mesmo padrão do Quadro pessoal), cada coluna com largura mínima confortável.
  kanbanBoardMobile: { display: 'flex', overflowX: 'auto', gridTemplateColumns: 'none' },
  kanbanCol: { background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 12, minHeight: 200 },
  kanbanColMobile: { minWidth: '82vw', flexShrink: 0 },
  kanbanColHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800, marginBottom: 12, color: 'var(--text-2)' },
  kanbanDot: { width: 8, height: 8, borderRadius: '50%' },
  kanbanCount: { marginLeft: 'auto', fontSize: 11, color: 'var(--text-6)', background: 'var(--border-1)', padding: '1px 7px', borderRadius: 999 },
  kanbanCard: { background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 11px', marginBottom: 9, cursor: 'grab' },

  personalTabs: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px 0', flexWrap: 'wrap' },
  personalTab: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: '8px 8px 0 0', padding: '7px 6px 7px 12px', cursor: 'pointer' },
  personalTabActive: { background: 'var(--bg-1)', borderBottomColor: 'var(--bg-1)', boxShadow: '0 -1px 0 #F5C400 inset' },
  personalTabInput: { background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 12.5, fontWeight: 700, width: 110, padding: 0 },
  publicBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: '#3ea6ff', background: 'rgba(62,166,255,.14)', borderRadius: 5, padding: '2px 6px', marginLeft: 4 },
  personalToolbar: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-1)' },
  personalViewToggle: { display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: 2, gap: 2 },
  personalViewToggleBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' },
  personalViewToggleBtnActive: { background: 'var(--bg-3)', color: 'var(--text-1)' },
  personalSearchWrap: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '5px 10px', minWidth: 180 },
  personalSearchInput: { background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 12, padding: 0, flex: 1, minWidth: 0 },
  personalFilterSelect: { fontSize: 11.5, padding: '5px 8px', borderRadius: 8, width: 'auto', flexShrink: 0 },
  personalBoardArea: { display: 'flex', gap: 16, padding: '16px 24px 32px', overflowX: 'auto', alignItems: 'flex-start' },
  personalCol: { border: 'none', borderRadius: 14, padding: 10, minWidth: 300, width: 300, flexShrink: 0, transition: 'background .16s ease' },
  // No celular cada coluna ocupa quase a largura toda da tela (padrão Trello mobile: rola
  // horizontalmente uma coluna por vez, com uma pequena borda da próxima aparecendo).
  personalColMobile: { minWidth: '86vw', width: '86vw' },
  personalColHead: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 650, marginBottom: 10, color: 'var(--text-2)', padding: '4px 2px' },
  personalColTag: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, padding: '3px 9px', borderRadius: 6 },
  personalColGrip: { display: 'flex', cursor: 'grab', flexShrink: 0, opacity: .5 },
  personalColNameInput: { background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 650, padding: 0, flex: 1, minWidth: 0 },
  personalColBody: { minHeight: 12 },
  personalColEmpty: { fontSize: 11.5, color: 'var(--text-7)', padding: '10px 4px', textAlign: 'center' },
  personalQuickAddInput: { width: '100%', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, marginTop: 2 },
  personalCard: { background: 'var(--bg-1)', border: 'none', borderRadius: 8, padding: '10px 12px', marginBottom: 8, boxShadow: 'var(--pb-shadow-soft)' },
  personalCardDone: { opacity: .72 },
  personalCardTop: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  personalCardCheck: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: '50%', border: '1.5px solid var(--border-2)', background: 'transparent', color: '#3ecf6e', cursor: 'pointer', flexShrink: 0, marginTop: 1, padding: 0 },
  personalCardCheckEmpty: { display: 'block', width: 9, height: 9 },
  personalCardCheckEmptyLg: { display: 'block', width: 12, height: 12 },
  personalCardTitleText: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', flex: 1, minWidth: 0, lineHeight: 1.4, wordBreak: 'break-word' },
  personalCardMeta: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  personalCardBadge: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-5)', background: 'var(--border-1)', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' },
  dueOverdue: { color: '#e2574c', background: 'rgba(226,87,76,.14)' },
  dueToday: { color: '#F5C400', background: 'rgba(245,196,0,.18)' },
  dueSoon: { color: '#ff9f40', background: 'rgba(255,159,64,.14)' },
  personalCardTags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  personalCardTag: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--text-4)', background: 'var(--border-1)', padding: '2px 7px', borderRadius: 5 },
  personalAddCol: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 12, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', minWidth: 160, height: 'fit-content', flexShrink: 0 },
  personalAddCard: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 11.5, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', width: 'fit-content', marginTop: 4 },
  pbGhostBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' },
  pbGhostBtnActive: { background: 'var(--bg-3)', color: 'var(--text-1)', borderColor: 'var(--border-2)' },

  dropdownMenu: { position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 8, padding: 4, minWidth: 200, boxShadow: 'var(--pb-shadow-drag)', display: 'flex', flexDirection: 'column' },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%' },
  dropdownDivider: { height: 1, background: 'var(--border-1)', margin: '4px 0' },
  colorSwatchGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: '6px 8px' },
  colorSwatch: { width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border-3)', cursor: 'pointer', padding: 0 },

  priorityPickerRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  priorityPickerChip: { fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border-3)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer' },
  priorityPickerChipActive: { background: 'var(--border-1)', color: 'var(--text-1)' },

  tagEditorChips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  tagEditorInput: { fontSize: 12, padding: '4px 8px', borderRadius: 6, width: 90 },

  checklistList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, marginBottom: 8 },
  checklistRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' },

  personalDetailTitleInput: { flex: 1, fontSize: 20, fontWeight: 800, background: 'transparent', border: 'none', color: 'var(--text-1)', padding: 0 },
  cardPropsGrid: { display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, marginTop: 14 },

  commentAuthorRow: { display: 'flex', alignItems: 'center', gap: 8 },
  commentAvatar: { width: 22, height: 22, borderRadius: '50%', background: 'var(--border-2)', color: 'var(--text-2)', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentAuthorName: { fontSize: 12, fontWeight: 700, color: 'var(--text-1)' },
  commentAuthorTs: { fontSize: 10.5, color: 'var(--text-6)', marginLeft: 'auto' },

  personalListWrap: { padding: '16px 24px 32px', overflowX: 'auto' },
  personalListTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  personalListTh: { textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-6)', padding: '8px 10px', borderBottom: '1px solid var(--border-2)', cursor: 'pointer', whiteSpace: 'nowrap' },
  personalListRow: { cursor: 'pointer' },
  personalListTd: { padding: '9px 10px', borderBottom: '1px solid var(--border-1)', color: 'var(--text-2)', whiteSpace: 'nowrap' },

  saveStateBadge: { fontSize: 11, color: 'var(--text-6)', marginRight: 4 },
  toastStack: { position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 80 },
  toast: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-2)', boxShadow: 'var(--pb-shadow-drag)', minWidth: 220, maxWidth: 'calc(100vw - 40px)' },
  toastAction: { background: 'transparent', border: 'none', color: '#F5C400', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' },

  skeletonBlock: { background: 'var(--border-1)', borderRadius: 6, animation: 'personalSkeletonPulse 1.4s ease-in-out infinite' },
  kanbanCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  kanbanCardTitle: { fontSize: 12.5, fontWeight: 700, marginBottom: 5 },
  kanbanCardMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-5)' },
  kanbanAdd: { display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', width: '100%', background: 'transparent', border: '1px dashed var(--border-3)', color: 'var(--text-5)', fontSize: 11.5, padding: '8px', borderRadius: 6, cursor: 'pointer' },

  // timeline
  timelineToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  granularityGroup: { display: 'flex', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: 3, gap: 2 },
  granBtn: { background: 'transparent', border: 'none', color: 'var(--text-4)', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' },
  granBtnActive: { background: '#F5C400', color: '#111' },
  navGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: { background: 'var(--bg-4)', border: '1px solid var(--border-3)', color: 'var(--text-2)', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 15, lineHeight: 1 },
  navLabel: { fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'capitalize', minWidth: 160, textAlign: 'center' },
  navToday: { background: 'transparent', border: '1px solid var(--border-3)', color: 'var(--text-4)', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' },
  timelineLaneDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  ganttScroll: { overflowX: 'auto', paddingBottom: 10 },
  ganttGrid: { display: 'grid', position: 'relative', columnGap: 0, rowGap: 0 },
  ganttCornerCell: { position: 'sticky', left: 0, background: 'var(--bg-page)', borderBottom: '1px solid var(--border-1)', zIndex: 3 },
  ganttColHeader: { fontSize: 10.5, color: 'var(--text-5)', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border-1)', borderLeft: '1px solid var(--bg-4)' },
  ganttPhaseRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, color: 'var(--text-3)', background: 'var(--bg-3)', padding: '0 12px', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)', position: 'sticky', left: 0, overflow: 'hidden' },
  ganttLabelCell: { position: 'sticky', left: 0, background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)', borderRight: '1px solid var(--border-1)', padding: '5px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, overflow: 'hidden' },
  ganttLabelTitle: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 },
  ganttLabelMeta: { fontSize: 10, color: 'var(--text-5)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 },
  ganttBarWrap: { display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--bg-4)', padding: '6px 3px', overflow: 'hidden' },
  ganttBar: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%', border: '1px solid', borderRadius: 6, padding: '0 8px', overflow: 'hidden' },
  ganttBarDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  ganttBarTitle: { fontSize: 10.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  ganttTodayLine: { position: 'absolute', top: 0, width: 2, background: '#e2574c', zIndex: 4, pointerEvents: 'none' },
  noDateBlock: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-1)' },
  noDateLabel: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.03em' },
  noDateList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  noDateChip: { fontSize: 11.5, background: 'var(--bg-4)', border: '1px solid var(--border-2)', color: 'var(--text-3)', padding: '5px 10px', borderRadius: 999 },

  // panels
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 },
  detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 },
  detailOverlayMobile: { padding: 0, alignItems: 'stretch' },
  detailBox: { width: 'min(980px, 100%)', height: '92vh', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 14, overflowY: 'auto', padding: '20px 28px 32px 28px' },
  // Aplicado via spread condicional (isMobile ? S.detailBoxMobile : {}) nos ~9 modais que usam detailBox —
  // não altera detailBox em si, então o desktop fica byte-a-byte igual.
  detailBoxMobile: {
    width: '100%', maxWidth: '100%', height: '100dvh', maxHeight: '100dvh', borderRadius: 0,
    padding: 'calc(14px + var(--safe-top)) 16px calc(20px + var(--safe-bottom)) 16px',
  },
  detailMainMobile: { minWidth: '100%' },
  detailSideMobile: { minWidth: '100%' },
  detailTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  detailTopLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  detailPhaseTag: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-3)' },
  detailTitleInput: { fontSize: 22, fontWeight: 800, background: 'transparent', border: 'none', color: 'var(--text-1)', padding: '4px 0', marginBottom: 18, borderBottom: '1px solid var(--border-1)', borderRadius: 0, width: '100%' },
  detailGrid: { display: 'flex', gap: 28, flexWrap: 'wrap' },
  detailMain: { flex: 2, minWidth: 340, display: 'flex', flexDirection: 'column' },
  detailSide: { flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column' },
  commentThread: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 260, overflowY: 'auto' },
  commentBubble: { background: 'var(--bg-4)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '9px 11px' },
  commentText: { fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  commentMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10.5, color: 'var(--text-6)' },
  commentDel: { background: 'transparent', border: 'none', color: 'var(--text-7)', cursor: 'pointer', display: 'flex' },
  commentInputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  panel: { width: 360, maxWidth: '92vw', height: '100%', background: 'var(--bg-2)', borderLeft: '1px solid var(--border-2)', overflowY: 'auto' },
  panelMobile: { width: '100vw', maxWidth: '100vw' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px', borderBottom: '1px solid var(--border-1)', position: 'sticky', top: 0, background: 'var(--bg-2)' },
  panelTitle: { fontWeight: 800, fontSize: 14.5 },
  panelBody: { padding: '18px' },
  emptyMuted: { fontSize: 12.5, color: 'var(--text-6)' },
  logRow: { padding: '9px 0', borderBottom: '1px solid var(--border-1)' },
  logTs: { fontSize: 10.5, color: 'var(--text-6)' },
  logAction: { fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 },
  trashRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-1)' },
  trashTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-2)' },
  trashParent: { fontSize: 11.5, fontWeight: 400, color: 'var(--text-5)' },
  mentionRow: { padding: '10px 0', borderBottom: '1px solid var(--border-1)', cursor: 'pointer' },
  mentionActivity: { fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginTop: 3 },
  mentionText: { fontSize: 12, color: 'var(--text-4)', marginTop: 3, lineHeight: 1.4 },

  settingsBlock: { marginBottom: 20 },
  areaRow: { background: 'var(--bg-4)', border: '1px solid var(--border-1)', borderRadius: 8, padding: 10, marginBottom: 8 },
  settingsLabel: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-4)', marginBottom: 8 },
  fieldHint: { fontSize: 11, color: 'var(--text-7)', marginTop: 5, lineHeight: 1.4 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10 },
  logoPreview: { width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-3)' },
  logoPreviewEmpty: { width: 48, height: 48, borderRadius: 8, background: 'var(--bg-4)', border: '1px solid var(--border-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chipX: { background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', display: 'flex' },
  memberAddRow: { display: 'flex', gap: 6, marginTop: 10 },
  teamLinkBadge: { fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, padding: '2px 6px', borderRadius: 999, border: '1px solid', lineHeight: 1.4, whiteSpace: 'nowrap' },
  teamCard: { border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, background: 'var(--bg-3)' },
  teamCardTop: { display: 'flex', alignItems: 'center', gap: 6 },
  teamCardName: { fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  teamCardMeta: { fontSize: 11, color: 'var(--text-5)', marginTop: 3 },
  teamAreaInput: { marginTop: 6, width: '100%', fontSize: 12, padding: '5px 7px' },
  linkUserRow: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
  phaseEditRow: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-1)' },
  phaseEditRowDragging: { opacity: .4 },
  phaseDragHandle: { display: 'flex', alignItems: 'center', cursor: 'grab', paddingTop: 8, flexShrink: 0 },
  colorInput: { width: 34, height: 34, padding: 0, border: '1px solid var(--border-3)', borderRadius: 6, background: 'transparent', cursor: 'pointer', flexShrink: 0 },
  myProfilePreview: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border-1)' },
  avatarPickerGrid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginTop: 4 },
  avatarPickerBtn: { width: 34, height: 34, borderRadius: 8, background: 'var(--bg-4)', border: '1px solid var(--border-3)', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
  avatarPickerBtnActive: { borderColor: '#F5C400', background: 'rgba(245,196,0,.14)' },

  // users panel
  userEditCard: { background: 'var(--bg-4)', border: '1px solid var(--border-1)', borderRadius: 8, padding: 12, marginBottom: 10 },
  cnpjCheckList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
  cnpjCheckRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' },
  accessBlock: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-1)' },
  expireWarning: { marginTop: 10, background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f0a49e', lineHeight: 1.5 },
  renewBtn: { display: 'block', marginTop: 8, background: '#e2574c', border: 'none', color: '#fff', fontWeight: 700, fontSize: 11.5, padding: '6px 11px', borderRadius: 6, cursor: 'pointer' },
  loginBlockedMsg: { background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#f0a49e', marginBottom: 16 },
  loginBlockedTag: { fontSize: 10, fontWeight: 800, color: '#e2574c', border: '1px solid #e2574c', borderRadius: 999, padding: '2px 7px' },

  // users management screen
  usersHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '20px 24px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-2)' },
  usersHeaderIcon: { width: 40, height: 40, borderRadius: 10, background: 'var(--bg-4)', border: '1px solid var(--border-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usersHeaderTitle: { fontSize: 19, fontWeight: 800 },
  usersHeaderSub: { fontSize: 12.5, color: 'var(--text-4)', marginTop: 2 },
  usersStatsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, padding: '20px 24px 0 24px' },
  usersStatCard: { background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '14px 16px' },
  usersStatValue: { fontSize: 26, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2 },
  usersStatLabel: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 },
  usersFilterRow: { display: 'flex', gap: 10, padding: '20px 24px 0 24px', flexWrap: 'wrap' },
  usersTableOuter: { padding: '16px 24px 32px 24px' },
  usersTableWrap: { border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' },
  usersTableHeaderRow: { display: 'flex', gap: 12, padding: '10px 16px', background: 'var(--bg-3)', borderBottom: '1px solid var(--border-1)' },
  usersTableRow: { display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)', cursor: 'pointer' },
  usersMobileRow: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)', cursor: 'pointer' },
  usersMobileBadgeRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  usersMobileActionsRow: { display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border-1)' },
  usersRowName: { fontSize: 13, fontWeight: 700, color: 'var(--text-1)' },
  usersRowUsername: { fontSize: 11.5, color: 'var(--text-5)', marginTop: 2 },
  usersRowEmail: { flex: 2, minWidth: 0, fontSize: 12.5, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  usersStatusActive: { fontSize: 11, fontWeight: 700, color: '#3ecf6e', background: 'rgba(62,207,110,.12)', border: '1px solid rgba(62,207,110,.4)', borderRadius: 999, padding: '3px 9px' },
  usersStatusBlocked: { fontSize: 11, fontWeight: 700, color: '#e2574c', background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 999, padding: '3px 9px' },

  // cnpj lookup
  cnpjFetchGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12.5, color: 'var(--text-2)' },
  cnpjListRow: { fontSize: 12.5, color: 'var(--text-3)', padding: '4px 0', borderBottom: '1px solid var(--border-1)' },

  // multi-company view
  multiCompanyChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  multiCompanyChip: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', border: '1px solid var(--border-3)', borderRadius: 999, padding: '2px 8px 2px 6px' },
  companyColorDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  companyBadge: { display: 'flex', alignItems: 'center', gap: 6 },
  companyBadgeSmall: { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 },
  companyBadgeLogo: { width: 16, height: 16, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  companyBadgeName: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  companySection: { marginBottom: 36, border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' },
  companySectionHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg-3)', borderBottom: '1px solid var(--border-1)' },
  companySectionLogo: { width: 30, height: 30, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border-3)', flexShrink: 0 },
  companySectionLogoEmpty: { width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companySectionName: { fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' },
  companySectionCnpj: { fontSize: 11, color: 'var(--text-5)', marginTop: 1 },

  // company selector screen
  companySelectorWrap: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px' },
  companySelectorHeader: { width: 'min(1240px, 96%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  companyHeaderShortcut: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 999, cursor: 'pointer' },
  companySearchWrap: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 },
  companySearchInput: { flex: 1, background: 'transparent', border: 'none', padding: 0, fontSize: 13 },
  workspaceChoices: { display: 'flex', gap: 16, width: 'min(680px, 100%)', flexWrap: 'wrap' },
  workspaceCard: { flex: '1 1 260px', textAlign: 'left', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '24px 22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-1)', fontFamily: "'Inter', sans-serif", transition: 'border-color .12s' },
  workspaceCardTitle: { fontSize: 16, fontWeight: 800, marginTop: 4 },
  workspaceCardDesc: { fontSize: 12.5, color: 'var(--text-5)', lineHeight: 1.5 },
  companyEmptyState: { width: 'min(1240px, 96%)', textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-3)', borderRadius: 12 },
  companyPanel: { width: 'min(1240px, 96%)', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 14, padding: 18 },
  companySelectAllRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-1)' },
  companyList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 2 },
  companyCard: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '4px 14px 4px 4px', transition: 'background .12s' },
  // Overrides aplicados via spread condicional (isMobile ? S.xMobile : {}) — o card vira um bloco
  // empilhado em vez da linha horizontal do desktop; nenhuma chave acima é alterada.
  companyCardMobile: { flexWrap: 'wrap', alignItems: 'stretch', padding: '10px 12px' },
  companyCardMain: { flex: '1 1 280px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', cursor: 'pointer' },
  companyCardMainMobile: { flex: '1 1 100%' },
  companyCardActions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  companyCardActionsMobile: { flex: '1 1 100%', justifyContent: 'flex-end', borderTop: '1px solid var(--border-2)', paddingTop: 8, marginTop: 4, opacity: 1 },
  companyCardLogo: { width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-3)', flexShrink: 0 },
  companyCardLogoEmpty: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyCardNameRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  companyCardName: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' },
  companyCardSecondary: { fontSize: 11, color: 'var(--text-5)', marginTop: 1 },
  companyCardCnpj: { fontSize: 11.5, color: 'var(--text-5)', marginTop: 1 },
  companyCardProgress: { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 150px', padding: '4px 10px', borderLeft: '1px solid var(--border-2)' },
  companyCardProgressMobile: { flex: '1 1 45%', borderLeft: 'none', borderTop: '1px solid var(--border-2)', paddingTop: 8 },
  companyCardDonutWrap: { position: 'relative', width: 34, height: 34, flexShrink: 0 },
  companyCardDonutLabel: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, color: 'var(--text-1)' },
  companyCardProgressText: { fontSize: 11, color: 'var(--text-5)', lineHeight: 1.3 },
  companyCardProgressNum: { fontSize: 12, fontWeight: 700, color: 'var(--text-2)' },
  companyCardNext: { flex: '1 1 200px', minWidth: 0, padding: '4px 10px', borderLeft: '1px solid var(--border-2)' },
  companyCardNextMobile: { flex: '1 1 45%', borderLeft: 'none', borderTop: '1px solid var(--border-2)', paddingTop: 8 },
  companyCardNextLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-6)', textTransform: 'uppercase', letterSpacing: .3 },
  companyCardNextTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  companyCardNextDate: { fontSize: 11, marginTop: 1 },
};
