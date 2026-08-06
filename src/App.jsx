import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Download, Upload, Clock, LayoutGrid, Columns3, Building2,
  Users, X, Check, ChevronDown, FileSpreadsheet, FileText, Settings,
  GripVertical, CalendarDays, List, Pencil, Maximize2, Send, MessageSquare, Mic,
  LogOut, UserCog, AlertTriangle, Sun, Moon, Copy, Undo2, Bell, Link2, History
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
const DELETE_CONFIRM_PHRASE = 'Excluir';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const PRIORITY_META = {
  alta: { label: 'Alta', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  media: { label: 'Média', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  baixa: { label: 'Baixa', color: 'var(--text-5)', bg: 'var(--border-1)', border: 'var(--border-3)' },
};
const PRIORITY_ORDER = ['alta', 'media', 'baixa'];

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

function todayISOStr() { return toISODate(startOfDay(new Date())); }

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

function isPricetaxTeamMember(member) {
  if (!member) return false;
  if (member.role === 'master' || member.role === 'pricetax') return true;
  if (!member.role && member.name && member.name.trim().toUpperCase() === 'PRICETAX') return true;
  return false;
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
  const personalBoardSaveTimer = useRef(null);
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

  useEffect(() => {
    if (!currentUser) { setProjects([]); setProjectsLoaded(false); return; }
    (async () => {
      try {
        const res = await apiGet('/api/projects');
        setProjects(res.projects.map(normalizeProject));
      } catch (e) {
        console.error('Falha ao carregar projetos', e);
        setProjects([]);
      } finally {
        setProjectsLoaded(true);
      }
    })();
  }, [currentUser?.id]);

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
      } catch (e) {
        console.error('Falha ao carregar Gestão de Atividades', e);
        setPersonalBoard({ boards: [] });
      } finally {
        setPersonalBoardLoaded(true);
      }
    })();
  }, [currentUser?.id]);

  function persistPersonalBoardDebounced(board) {
    if (personalBoardSaveTimer.current) clearTimeout(personalBoardSaveTimer.current);
    personalBoardSaveTimer.current = setTimeout(() => {
      apiPatch('/api/personal-board', { board }).catch((e) => console.error('Falha ao salvar Gestão de Atividades', e));
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
  }, [showUsers, currentUser?.id]);

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

  if (!sessionChecked) {
    return <LoadingScreen theme={theme} />;
  }

  if (!currentUser) {
    return <LoginGate onLogin={handleLogin} loginError={loginError} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!projectsLoaded) {
    return <LoadingScreen theme={theme} />;
  }

  if (!workspaceMode) {
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

  if (workspaceMode === 'personal') {
    if (!personalBoardLoaded || !personalBoard) {
      return <LoadingScreen theme={theme} />;
    }
    return (
      <PersonalBoardScreen
        board={personalBoard}
        onMutate={mutatePersonalBoard}
        onExit={() => setWorkspaceMode('company')}
        currentUser={currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
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

  function findDateConflict(targetPid, id, newDate) {
    const targetProject = projects.find((p) => p.id === targetPid);
    const targetActivity = targetProject && targetProject.activities.find((a) => a.id === id);
    if (!targetProject || !targetActivity) return null;
    const targetMember = targetProject.team.find((m) => m.name === targetActivity.responsible);
    if (!isPricetaxTeamMember(targetMember)) return null;
    const targetKey = targetMember.userId || `name:${targetMember.name}`;

    for (const project of projects) {
      if (project.id === targetPid) continue;
      for (const act of project.activities) {
        if (act.id === id || act.date !== newDate) continue;
        const member = project.team.find((m) => m.name === act.responsible);
        if (!isPricetaxTeamMember(member)) continue;
        const key = member.userId || `name:${member.name}`;
        if (key === targetKey) return { project, activity: act, member: targetMember };
      }
    }
    return null;
  }

  function updateActivity(targetPid, id, patch, logMsg) {
    if (patch.date && (currentUser.role === 'master' || currentUser.role === 'pricetax')) {
      const conflict = findDateConflict(targetPid, id, patch.date);
      if (conflict) {
        window.alert(
          `Não é possível remarcar para ${fmtDate(patch.date)}: ${conflict.member.name} já está escalado(a) pela PRICETAX para "${conflict.activity.title}" na empresa "${conflict.project.company.name || 'sem nome'}" nessa mesma data.\n\nSó dá pra confirmar essa mudança se o responsável dessa atividade pela PRICETAX for outra pessoa ou outra equipe.`
        );
        return;
      }
    }
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
    const res = await apiPost('/api/projects', { company });
    setProjects((prev) => [...prev, normalizeProject(res.project)]);
    return res.project.id;
  }

  async function cloneCompany(sourceId, company) {
    const source = projects.find((p) => p.id === sourceId);
    if (!source) throw new Error('Empresa de origem não encontrada.');

    const sourceDates = source.activities.map((a) => a.date).filter(Boolean);
    const anchor = sourceDates.length ? sourceDates.reduce((min, d) => (d < min ? d : min)) : null;
    const deltaDays = anchor ? Math.round((parseDate(todayISOStr()) - parseDate(anchor)) / 86400000) : 0;
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
      subactivities: (a.subactivities || []).filter((s) => !s.deleted).map((s) => ({ ...s, id: uid('s'), done: false })),
    }));

    const team = source.team.map((m) => ({ ...m, id: uid('team') }));

    const res = await apiPost('/api/projects', {
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
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, ...patch } }), `Dados da empresa "${label}" atualizados`);
  }

  async function loadUsers() {
    try {
      const res = await apiGet('/api/users');
      setUsers(res.users);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function addUser(draft) {
    try {
      const res = await apiPost('/api/users', draft);
      setUsers((prev) => [...prev, res.user]);
      addUsersLog(`Usuário criado: ${res.user.name}`);
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
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
    _companyName: p.company.name || 'Empresa sem nome',
    _companyColor: p.company.color || '#F5C400',
    _companyLogo: p.company.logo || '',
    _phases: p.phases,
    _team: p.team,
    _order: perCompanyOrderMap[p.id][a.id],
  }))) : [];

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
                      {p.company.name || 'Sem nome'}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoImg} /> : <div style={S.logoPlaceholder}><Building2 size={18} color={activeProject.company.color || '#F5C400'} /></div>}
              <div>
                <div style={S.brandName}>{activeProject.company.name || 'Cliente não cadastrado'}</div>
                <div style={S.brandCnpj}>{activeProject.company.cnpj ? `CNPJ ${activeProject.company.cnpj}` : 'CNPJ não informado'}</div>
              </div>
              <button style={S.iconBtn} onClick={() => setShowSettings(true)}><Settings size={15} /> Empresa</button>
            </>
          )}
          {canPickCompanies && (
            <button style={S.iconBtn} onClick={() => setCompanySelectionConfirmed(false)}><Building2 size={15} /> Trocar empresas</button>
          )}
          <button style={S.iconBtn} onClick={() => setWorkspaceMode('personal')}><Columns3 size={15} /> Gestão de Atividades</button>
        </div>
        <div style={S.actionsRow}>
          {(currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowCreateCompany(true)}><Plus size={15} /> Cadastrar empresa</button>
          )}
          {currentUser.role === 'master' && <button style={S.iconBtn} onClick={() => setShowUsers(true)}><UserCog size={15} /> Usuários</button>}
          {!isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); }}><LayoutGrid size={15} /> Fases</button>
          )}
          {!isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowLog(true)}><Clock size={15} /> Log ({(activeProject.log || []).length})</button>
          )}
          {!isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowTrash(true)}><Trash2 size={15} /> Lixeira ({activeProject.activities.filter((a) => a.deleted).length + activeProject.activities.reduce((n, a) => n + (a.deleted ? 0 : (a.subactivities || []).filter((s) => s.deleted).length), 0)})</button>
          )}
          <button style={S.iconBtn} onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
          <button style={S.iconBtn} onClick={exportPdf}><FileText size={15} /> PDF</button>
          {isMulti ? (
            <select
              style={{ ...S.iconBtn, cursor: 'pointer', appearance: 'auto' }}
              value=""
              onChange={(e) => { if (e.target.value) addActivity(e.target.value); e.target.value = ''; }}
            >
              <option value="">+ Nova atividade em...</option>
              {selectedProjects.map((p) => <option key={p.id} value={p.id}>{p.company.name || 'Sem nome'}</option>)}
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
            <button style={S.userAvatarBtn} title="Meu perfil" onClick={() => setShowMyProfile(true)}>
              <UserAvatar user={currentUser} size={26} />
            </button>
            <span style={{ ...S.roleTag, color: ROLE_META[currentUser.role].color, borderColor: ROLE_META[currentUser.role].color }}>{ROLE_META[currentUser.role].label}</span>
            <span style={S.userName}>{currentUser.name}</span>
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

      <main style={S.main}>
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
            <div style={S.settingsLabel}>CNPJ</div>
            <input type="text" value={activeProject.company.cnpj} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, cnpj: v } })); }} onBlur={() => addLog(pid, `CNPJ atualizado: ${activeProject.company.cnpj}`)} placeholder="00.000.000/0000-00" />
            <div style={S.fieldHint}>Alterar o CNPJ não atualiza sozinho quem já tem acesso — ajuste em "Usuários" se precisar.</div>
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
          <div style={S.usersTableHeaderRow}>
            <div style={{ ...S.th, flex: 2 }}>Nome / Usuário</div>
            <div style={{ ...S.th, flex: 2 }}>E-mail</div>
            <div style={{ ...S.th, width: 148 }}>Perfil</div>
            <div style={{ ...S.th, width: 100 }}>Status</div>
            <div style={{ ...S.th, width: 110 }}>Licença até</div>
            <div style={{ ...S.th, width: 80, textAlign: 'right' }}>Ações</div>
          </div>
          {filtered.map((u) => (
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
  const [draft, setDraft] = useState({ username: '', password: '', name: '', role: 'cliente', avatar: '' });

  function submit() {
    if (!draft.username || !draft.password || !draft.name) return;
    onCreate(draft);
  }

  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(440px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(520px, 100%)', height: 'auto', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
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
  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(420px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
  const [form, setForm] = useState({ name: '', nomeFantasia: '', color: PHASE_COLORS[0], logo: '' });

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
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        cnpj: (fetched && fetched.cnpjFormatado) || cnpj,
        name: form.name,
        nomeFantasia: form.nomeFantasia,
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
    <div style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif" }} onClick={onClose}>
      <style>{`
        input[type=text], input[type=email], input[type=password], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
      `}</style>
      <div style={{ ...S.detailBox, width: 'min(560px, 100%)', height: 'auto', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{cloneSource ? 'Clonar empresa' : 'Cadastrar empresa'}</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        {cloneSource && (
          <div style={{ ...S.fieldHint, marginBottom: 12 }}>
            As atividades de <strong>{cloneSource.company.name || 'empresa de origem'}</strong> serão copiadas para essa nova empresa. As datas serão recalculadas a partir de hoje ({fmtDate(todayISOStr())}), mantendo o mesmo prazo entre cada atividade.
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

            <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={saving || !form.name.trim()}>
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
  const [form, setForm] = useState({ name: c.name || '', nomeFantasia: c.nomeFantasia || '', color: c.color || PHASE_COLORS[0], logo: c.logo || '' });
  const [saving, setSaving] = useState(false);

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
    <div style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif" }} onClick={onClose}>
      <style>{`
        input[type=text], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus { outline:none; border-color:#F5C400; }
      `}</style>
      <div style={{ ...S.detailBox, width: 'min(480px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

function CompanySelectorScreen({ projects, initialSelected, onConfirm, onLogout, onCreateNew, onUpdateCompany, onDeleteCompany, onCloneCompany, theme, onToggleTheme }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [editingProject, setEditingProject] = useState(null);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === projects.length ? new Set() : new Set(projects.map((p) => p.id))));
  }

  function handleDelete(e, p) {
    e.stopPropagation();
    const name = p.company.name || 'esta empresa';
    if (window.confirm(`Excluir "${name}" e todo o cronograma dela? Essa ação não pode ser desfeita.`)) {
      onDeleteCompany(p.id);
    }
  }

  const allChecked = projects.length > 0 && selected.size === projects.length;

  return (
    <div style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=checkbox]{ accent-color:#F5C400; width:16px; height:16px; }
      `}</style>
      <div style={S.companySelectorWrap}>
        <div style={S.companySelectorHeader}>
          <BrandLogo theme={theme} style={{ ...S.loginLogo, marginBottom: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            <label style={S.companySelectAllRow}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              Selecionar todas ({projects.length})
            </label>
            <div style={S.companyList}>
              {projects.map((p) => {
                const isSelected = selected.has(p.id);
                const accent = p.company.color || '#F5C400';
                return (
                  <div key={p.id} style={{ ...S.companyCard, borderLeft: `3px solid ${isSelected ? accent : 'var(--border-2)'}` }}>
                    <label style={S.companyCardMain}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} />
                      {p.company.logo ? <img src={p.company.logo} alt="" style={S.companyCardLogo} /> : <div style={{ ...S.companyCardLogoEmpty, background: p.company.color || 'var(--bg-4)' }}><Building2 size={16} color="#111" /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.companyCardName}>{p.company.name || 'Empresa sem nome'}</div>
                        <div style={S.companyCardCnpj}>{p.company.cnpj || 'CNPJ não informado'}</div>
                      </div>
                    </label>
                    <div style={S.companyCardActions}>
                      <button style={S.iconBtnGhost} title="Clonar atividades para uma nova empresa" onClick={(e) => { e.stopPropagation(); onCloneCompany(p); }}><Copy size={14} /></button>
                      <button style={S.iconBtnGhost} title="Editar empresa" onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}><Pencil size={14} /></button>
                      <button style={S.iconBtnGhost} title="Excluir empresa" onClick={(e) => handleDelete(e, p)}><Trash2 size={14} color="#e2574c" /></button>
                      <span style={{ ...S.companyColorDot, background: accent }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 12 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar nova empresa</button>
          </div>
        )}

        {projects.length > 0 && (
          <button style={{ ...S.primaryBtn, marginTop: 16, width: 'min(640px, 100%)', justifyContent: 'center' }} disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
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

function PersonalBoardScreen({ board, onMutate, onExit, currentUser, onLogout, theme, onToggleTheme }) {
  const [activeBoardId, setActiveBoardId] = useState(board.boards[0] ? board.boards[0].id : null);
  const [dragBoardId, setDragBoardId] = useState(null);
  const [dragColId, setDragColId] = useState(null);
  const [dragCard, setDragCard] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);

  useEffect(() => {
    if (!board.boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(board.boards[0] ? board.boards[0].id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.boards.map((b) => b.id).join(',')]);

  const activeBoard = board.boards.find((b) => b.id === activeBoardId) || null;

  function addBoard() {
    const nb = { id: uid('board'), name: 'Nova página', columns: [{ id: uid('col'), name: 'A fazer', cards: [] }] };
    onMutate((prev) => ({ ...prev, boards: [...prev.boards, nb] }));
    setActiveBoardId(nb.id);
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

  function reorderBoard(fromId, toId) {
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

  function addColumn() {
    if (!activeBoard) return;
    const nc = { id: uid('col'), name: 'Nova coluna', cards: [] };
    const bid = activeBoard.id;
    onMutate((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id === bid ? { ...b, columns: [...b.columns, nc] } : b)) }));
  }

  function renameColumn(colId, name) {
    const bid = activeBoard.id;
    onMutate((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id !== bid ? b : { ...b, columns: b.columns.map((c) => (c.id === colId ? { ...c, name } : c)) })) }));
  }

  function deleteColumn(colId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    if (!col) return;
    if (col.cards.length > 0 && !window.confirm(`Excluir a coluna "${col.name}" e ${col.cards.length} tarefa(s) dentro dela?`)) return;
    const bid = activeBoard.id;
    onMutate((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id !== bid ? b : { ...b, columns: b.columns.filter((c) => c.id !== colId) })) }));
  }

  function reorderColumn(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const bid = activeBoard.id;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== bid) return b;
        const list = b.columns.slice();
        const fromIdx = list.findIndex((x) => x.id === fromId);
        const toIdx = list.findIndex((x) => x.id === toId);
        if (fromIdx === -1 || toIdx === -1) return b;
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...b, columns: list };
      }),
    }));
  }

  function addCard(colId) {
    const nc = { id: uid('card'), title: 'Nova tarefa', desc: '', createdAt: new Date().toISOString() };
    const bid = activeBoard.id;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== bid ? b : { ...b, columns: b.columns.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, nc] } : c)) })),
    }));
    setExpandedCard(nc.id);
  }

  function updateCard(colId, cardId, patch) {
    const bid = activeBoard.id;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== bid ? b : { ...b, columns: b.columns.map((c) => (c.id !== colId ? c : { ...c, cards: c.cards.map((cd) => (cd.id === cardId ? { ...cd, ...patch } : cd)) })) })),
    }));
  }

  function deleteCard(colId, cardId) {
    const bid = activeBoard.id;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== bid ? b : { ...b, columns: b.columns.map((c) => (c.id !== colId ? c : { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) })) })),
    }));
  }

  function moveCard(cardId, fromColId, toColId) {
    if (!fromColId || fromColId === toColId) return;
    const bid = activeBoard.id;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== bid) return b;
        let moved = null;
        const columns = b.columns.map((c) => {
          if (c.id !== fromColId) return c;
          moved = c.cards.find((cd) => cd.id === cardId) || null;
          return { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) };
        });
        if (!moved) return b;
        return { ...b, columns: columns.map((c) => (c.id === toColId ? { ...c, cards: [...c.cards, moved] } : c)) };
      }),
    }));
  }

  return (
    <div style={S.page}>
      <div className="no-print" style={S.topbar}>
        <div style={S.brandRow}>
          <div style={S.logoPlaceholder}><Columns3 size={18} color="#F5C400" /></div>
          <div>
            <div style={S.brandName}>Gestão de Atividades</div>
            <div style={S.brandCnpj}>{currentUser.name}</div>
          </div>
          <button style={S.iconBtn} onClick={onExit}><Building2 size={15} /> Ir para Empresas</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>
        </div>
      </div>

      <div style={S.personalTabs}>
        {board.boards.map((b) => (
          <div
            key={b.id}
            draggable
            onDragStart={() => setDragBoardId(b.id)}
            onDragEnd={() => setDragBoardId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { reorderBoard(dragBoardId, b.id); setDragBoardId(null); }}
            onClick={() => setActiveBoardId(b.id)}
            style={{ ...S.personalTab, ...(b.id === activeBoardId ? S.personalTabActive : {}) }}
          >
            <input value={b.name} onChange={(e) => renameBoard(b.id, e.target.value)} style={S.personalTabInput} />
            <button style={S.chipX} onClick={(e) => { e.stopPropagation(); deleteBoard(b.id); }}><X size={11} /></button>
          </div>
        ))}
        <button style={S.iconBtnGhost} onClick={addBoard} title="Nova página"><Plus size={16} /></button>
      </div>

      {!activeBoard && (
        <div style={S.emptyMuted}>Nenhuma página ainda. Clique no + acima pra criar a primeira.</div>
      )}

      {activeBoard && (
        <div style={S.personalBoardArea}>
          {activeBoard.columns.map((col) => (
            <div
              key={col.id}
              style={S.personalCol}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragCard) moveCard(dragCard.cardId, dragCard.colId, col.id); setDragCard(null); }}
            >
              <div
                style={S.personalColHead}
                draggable
                onDragStart={() => setDragColId(col.id)}
                onDragEnd={() => setDragColId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); reorderColumn(dragColId, col.id); setDragColId(null); }}
              >
                <GripVertical size={13} color="var(--text-8)" />
                <input value={col.name} onChange={(e) => renameColumn(col.id, e.target.value)} style={S.personalColNameInput} />
                <span style={S.kanbanCount}>{col.cards.length}</span>
                <button style={S.iconBtnGhost} onClick={() => deleteColumn(col.id)}><Trash2 size={12} /></button>
              </div>

              {col.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDragCard({ colId: col.id, cardId: card.id })}
                  onDragEnd={() => setDragCard(null)}
                  style={S.personalCard}
                  onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      value={card.title}
                      onChange={(e) => updateCard(col.id, card.id, { title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      style={S.personalCardTitle}
                    />
                    <button style={S.chipX} onClick={(e) => { e.stopPropagation(); deleteCard(col.id, card.id); }}><X size={12} /></button>
                  </div>
                  {expandedCard === card.id && (
                    <textarea
                      value={card.desc || ''}
                      onChange={(e) => updateCard(col.id, card.id, { desc: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Descrição, anotações..."
                      rows={3}
                      style={{ ...S.notesArea, marginTop: 8 }}
                    />
                  )}
                </div>
              ))}
              <button style={S.addSubBtn} onClick={() => addCard(col.id)}><Plus size={12} /> Tarefa</button>
            </div>
          ))}
          <button style={S.personalAddCol} onClick={addColumn}><Plus size={14} /> Nova coluna</button>
        </div>
      )}
    </div>
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
  return (
    <div className="no-print" style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
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

function ActivityDetailModal({ activity: a, orderMap, phases, team, log, companyName, currentUser, pid, onClose, updateActivity, deleteActivity, addSub, updateSub, deleteSub, reorderSub, addAttachment, removeAttachment, addComment, removeComment, addLink, removeLink, toggleParticipant }) {
  const [commentDraft, setCommentDraft] = useState('');
  const [pendingMentions, setPendingMentions] = useState([]);
  const [dragSubId, setDragSubId] = useState(null);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
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

  return (
    <div className="no-print" style={S.detailOverlay} onClick={onClose}>
      <div style={S.detailBox} onClick={(e) => e.stopPropagation()}>
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
          <div style={S.detailMain}>
            <div style={S.subSectionLabel}>Descrição</div>
            <textarea value={a.desc} onChange={(e) => updateActivity(pid, a.id, { desc: e.target.value })} onBlur={() => updateActivity(pid, a.id, {}, `Descrição alterada em "${a.title}"`)} rows={2} style={S.notesArea} />

            <div style={S.subSectionLabel}>Observações</div>
            <textarea value={a.notes || ''} onChange={(e) => updateActivity(pid, a.id, { notes: e.target.value })} onBlur={() => updateActivity(pid, a.id, {}, `Observação alterada em "${a.title}"`)} rows={3} placeholder="Comentários, contexto, decisões desta atividade..." style={S.notesArea} />

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

            <div style={S.subSectionLabel}><Mic size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Transcrição de reunião</div>
            <textarea
              value={a.transcript || ''}
              onChange={(e) => updateActivity(pid, a.id, { transcript: e.target.value })}
              onBlur={() => updateActivity(pid, a.id, {}, `Transcrição de reunião atualizada em "${a.title}"`)}
              rows={6}
              placeholder="Cole aqui a transcrição da reunião..."
              style={{ ...S.notesArea, fontFamily: 'monospace', fontSize: 11.5 }}
            />

            <div style={S.subSectionLabel}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários {(a.comments || []).length > 0 ? `(${(a.comments || []).length})` : ''}</div>
            <div style={S.commentThread}>
              {(a.comments || []).length === 0 && <div style={S.emptyMuted}>Nenhum comentário ainda.</div>}
              {(a.comments || []).map((c) => (
                <div key={c.id} style={S.commentBubble}>
                  <div style={S.commentText}>{renderCommentText(c.text, team)}</div>
                  <div style={S.commentMeta}>
                    <span>{c.author ? `${c.author} · ` : ''}{fmtTs(c.ts)}</span>
                    <button style={S.commentDel} onClick={() => removeComment(pid, a.id, c.id)}><X size={11} /></button>
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

          <div style={S.detailSide}>
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
            {(a.subactivities || []).filter((s) => !s.deleted).map((s) => (
              <div
                key={s.id}
                style={{ ...S.subRowWrap, ...(dragSubId === s.id ? { opacity: .4 } : {}) }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { reorderSub(pid, a.id, dragSubId, s.id); setDragSubId(null); }}
              >
                <div style={S.subRow}>
                  <div draggable onDragStart={() => setDragSubId(s.id)} onDragEnd={() => setDragSubId(null)} style={S.subDragHandle} title="Arraste para reordenar">
                    <GripVertical size={13} color="var(--text-8)" />
                  </div>
                  <input type="checkbox" checked={s.done} onChange={(e) => updateSub(pid, a.id, s.id, { done: e.target.checked })} />
                  <input type="text" value={s.title} onChange={(e) => updateSub(pid, a.id, s.id, { title: e.target.value })} style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                  <button style={S.iconBtnGhost} onClick={() => deleteSub(pid, a.id, s.id)}><X size={13} /></button>
                </div>
                <div style={S.subMetaRow}>
                  <select value={s.responsible || ''} onChange={(e) => updateSub(pid, a.id, s.id, { responsible: e.target.value })} style={S.subMiniField} title="Responsável da subatividade">
                    <option value="">Sem responsável</option>
                    {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="date" value={s.date || ''} onChange={(e) => updateSub(pid, a.id, s.id, { date: e.target.value })} style={S.subMiniField} title="Prazo da subatividade" />
                </div>
              </div>
            ))}
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
    <div style={S.tableLayout}>
      <div style={S.filterSidebar}>
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

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.tableWrap}>
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

                {isOpen && (
                  <div style={S.subPanel}>
                    {subs.map((s) => (
                      <div
                        key={s.id}
                        style={{ ...S.subRowWrap, ...(dragSub && dragSub.subId === s.id ? { opacity: .4 } : {}) }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (dragSub && dragSub.actId === a.id) reorderSub(rowPid, a.id, dragSub.subId, s.id); setDragSub(null); }}
                      >
                        <div style={S.subRow}>
                          <div draggable onDragStart={() => setDragSub({ actId: a.id, subId: s.id })} onDragEnd={() => setDragSub(null)} style={S.subDragHandle} title="Arraste para reordenar">
                            <GripVertical size={13} color="var(--text-8)" />
                          </div>
                          <input type="checkbox" checked={s.done} onChange={(e) => updateSub(rowPid, a.id, s.id, { done: e.target.checked })} />
                          <input type="text" value={s.title} onChange={(e) => updateSub(rowPid, a.id, s.id, { title: e.target.value })} style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                          <button style={S.iconBtnGhost} onClick={() => deleteSub(rowPid, a.id, s.id)}><X size={13} /></button>
                        </div>
                        <div style={S.subMetaRow}>
                          <select value={s.responsible || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { responsible: e.target.value })} style={S.subMiniField} title="Responsável da subatividade">
                            <option value="">Sem responsável</option>
                            {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                          <input type="date" value={s.date || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { date: e.target.value })} style={S.subMiniField} title="Prazo da subatividade" />
                        </div>
                      </div>
                    ))}
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
    <div style={S.kanbanBoard}>
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const items = activities.filter((a) => a.status === status);
        return (
          <div key={status} style={S.kanbanCol} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(status)}>
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
  page: { background: 'var(--bg-page)', color: 'var(--text-1)', fontFamily: "'Inter', sans-serif", minHeight: '100vh', paddingBottom: 40, position: 'relative' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 24px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-2)' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12 },
  logoImg: { width: 38, height: 38, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-3)' },
  logoPlaceholder: { width: 38, height: 38, borderRadius: 8, background: 'var(--bg-4)', border: '1px solid var(--border-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontWeight: 700, fontSize: 14 },
  brandCnpj: { fontSize: 11.5, color: 'var(--text-5)' },
  projectSwitch: { fontWeight: 700, fontSize: 13, background: 'var(--bg-4)', border: '1px solid var(--border-3)', color: 'var(--text-1)', borderRadius: 6, padding: '4px 8px', maxWidth: 260 },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-4)', border: '1px solid var(--border-3)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' },
  iconBtnGhost: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', padding: 4 },
  mentionBadge: { position: 'absolute', top: -3, right: -5, background: '#e2574c', color: '#fff', fontSize: 9.5, fontWeight: 800, borderRadius: 999, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#F5C400', border: 'none', color: '#111', fontSize: 12.5, fontWeight: 800, padding: '7px 13px', borderRadius: 7, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, padding: '14px 24px 0 24px' },
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
  loginWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
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
  filterSidebar: { width: 200, flexShrink: 0, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 },
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
  monthBadgeSm: { fontSize: 10.5, fontWeight: 800, background: '#F5C400', color: '#111', padding: '3px 7px', borderRadius: 5 },
  subCounter: { fontSize: 11, color: 'var(--text-6)', marginTop: 4 },
  subToggleBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 6 },
  pillSelect: { borderRadius: 999, padding: '5px 10px', fontWeight: 700, fontSize: 11.5, border: '1px solid' },
  prazoInput: { width: 46, flexShrink: 0, textAlign: 'center', padding: '6px 2px', fontSize: 12 },
  actionsCell: { width: 60, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  subPanel: { padding: '4px 14px 14px 60px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-page)' },
  subRow: { display: 'flex', alignItems: 'center', gap: 8 },
  subRowWrap: { display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0', borderBottom: '1px solid var(--border-1)' },
  subDragHandle: { display: 'flex', alignItems: 'center', cursor: 'grab', flexShrink: 0 },
  subMetaRow: { display: 'flex', gap: 6, paddingLeft: 21 },
  subMiniField: { flex: 1, fontSize: 10.5, padding: '3px 5px' },
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
  kanbanCol: { background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 12, minHeight: 200 },
  kanbanColHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800, marginBottom: 12, color: 'var(--text-2)' },
  kanbanDot: { width: 8, height: 8, borderRadius: '50%' },
  kanbanCount: { marginLeft: 'auto', fontSize: 11, color: 'var(--text-6)', background: 'var(--border-1)', padding: '1px 7px', borderRadius: 999 },
  kanbanCard: { background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 11px', marginBottom: 9, cursor: 'grab' },

  personalTabs: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px 0', flexWrap: 'wrap' },
  personalTab: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: '8px 8px 0 0', padding: '7px 6px 7px 12px', cursor: 'pointer' },
  personalTabActive: { background: 'var(--bg-1)', borderBottomColor: 'var(--bg-1)', boxShadow: '0 -1px 0 #F5C400 inset' },
  personalTabInput: { background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 12.5, fontWeight: 700, width: 110, padding: 0 },
  personalBoardArea: { display: 'flex', gap: 16, padding: '16px 24px 32px', overflowX: 'auto', alignItems: 'flex-start' },
  personalCol: { background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 12, minWidth: 270, width: 270, flexShrink: 0 },
  personalColHead: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, marginBottom: 12, color: 'var(--text-2)', cursor: 'grab' },
  personalColNameInput: { background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 800, padding: 0, flex: 1, minWidth: 0 },
  personalCard: { background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 10px', marginBottom: 9, cursor: 'grab' },
  personalCardTitle: { background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 12.5, fontWeight: 600, padding: 0, flex: 1, minWidth: 0 },
  personalAddCol: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px dashed var(--border-3)', color: 'var(--text-4)', fontSize: 12, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', minWidth: 160, height: 'fit-content', flexShrink: 0 },
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
  detailBox: { width: 'min(980px, 100%)', height: '92vh', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 14, overflowY: 'auto', padding: '20px 28px 32px 28px' },
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
  companySelectorWrap: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px' },
  companySelectorHeader: { width: 'min(680px, 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  workspaceChoices: { display: 'flex', gap: 16, width: 'min(680px, 100%)', flexWrap: 'wrap' },
  workspaceCard: { flex: '1 1 260px', textAlign: 'left', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '24px 22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-1)', fontFamily: "'Inter', sans-serif", transition: 'border-color .12s' },
  workspaceCardTitle: { fontSize: 16, fontWeight: 800, marginTop: 4 },
  workspaceCardDesc: { fontSize: 12.5, color: 'var(--text-5)', lineHeight: 1.5 },
  companyEmptyState: { width: 'min(680px, 100%)', textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-3)', borderRadius: 12 },
  companyPanel: { width: 'min(680px, 100%)', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 14, padding: 18 },
  companySelectAllRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-1)' },
  companyList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '46vh', overflowY: 'auto', paddingRight: 2 },
  companyCard: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '4px 14px 4px 4px', transition: 'background .12s' },
  companyCardMain: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', cursor: 'pointer' },
  companyCardActions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  companyCardLogo: { width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-3)', flexShrink: 0 },
  companyCardLogoEmpty: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyCardName: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' },
  companyCardCnpj: { fontSize: 11.5, color: 'var(--text-5)', marginTop: 1 },
};
