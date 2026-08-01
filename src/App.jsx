import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Download, Upload, Clock, LayoutGrid, Columns3, Building2,
  Users, X, Check, ChevronDown, FileSpreadsheet, FileText, Settings,
  GripVertical, CalendarDays, List, Pencil, Maximize2, Send, MessageSquare, Mic,
  LogOut, UserCog
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost, apiPatch, apiDelete } from './lib/api.js';
import pricetaxLogoBranco from './assets/brand/pricetax-logo-branco.png';

const LOCAL_PREFS_KEY = 'pricetax-cronograma-prefs-v1';

const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#e2574c', '#b98af5', '#ff9f40'];

const ROLE_META = {
  master: { label: 'PRICETAX Master', color: '#F5C400' },
  pricetax: { label: 'PRICETAX', color: '#3ea6ff' },
  cliente: { label: 'Cliente', color: '#3ecf6e' },
};

const STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: '#9a9a9a', bg: '#262626', border: '#3a3a3a' },
  'em-andamento': { label: 'Em andamento', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  'concluido': { label: 'Concluído', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
};
const STATUS_ORDER = ['nao-iniciado', 'em-andamento', 'concluido'];

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

function todayISOStr() { return toISODate(startOfDay(new Date())); }

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
  let d = addDays(parseDate(startISO), n);
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
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [companySelectionConfirmed, setCompanySelectionConfirmed] = useState(false);
  const [phasesEditingProjectId, setPhasesEditingProjectId] = useState(null);
  const [usersLog, setUsersLog] = useState([]);
  const [loginError, setLoginError] = useState(null);
  const [usersPanelError, setUsersPanelError] = useState('');
  const saveTimers = useRef({});

  const [view, setView] = useState('table');
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [openActivityId, setOpenActivityId] = useState(null);
  const [newMember, setNewMember] = useState('');
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
    if (!currentUser) { setProjects([]); setProjectsLoaded(false); return; }
    (async () => {
      try {
        const res = await apiGet('/api/projects');
        setProjects(res.projects);
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
    if (showUsers && currentUser && currentUser.role === 'master') {
      loadUsers();
    }
  }, [showUsers, currentUser?.id]);

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

  function persistProjectDebounced(pid, projectData) {
    if (saveTimers.current[pid]) clearTimeout(saveTimers.current[pid]);
    saveTimers.current[pid] = setTimeout(() => {
      apiPatch(`/api/projects/${pid}`, { project: projectData }).catch((e) => console.error('Falha ao salvar projeto', e));
    }, 500);
  }

  function mutateProject(pid, updater, logMsg) {
    setProjects((prev) => {
      let saved = null;
      const nextArr = prev.map((p) => {
        if (p.id !== pid) return p;
        let next = updater(p);
        if (logMsg) next = { ...next, log: [{ ts: new Date().toISOString(), action: logMsg }, ...(next.log || [])].slice(0, 300) };
        saved = next;
        return next;
      });
      if (saved) persistProjectDebounced(pid, saved);
      return nextArr;
    });
  }

  if (!sessionChecked) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <LoginGate onLogin={handleLogin} loginError={loginError} />;
  }

  if (!projectsLoaded) {
    return <LoadingScreen />;
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
      />
    );
  }

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));
  const isMulti = selectedProjects.length > 1;
  const activeProject = selectedProjects.length === 1 ? selectedProjects[0] : null;

  if (!activeProject && !isMulti) {
    return <NoAccessScreen user={currentUser} onLogout={handleLogout} />;
  }

  const pid = activeProject ? activeProject.id : null;

  function addLog(targetPid, action) {
    mutateProject(targetPid, (p) => p, action);
  }

  function updateActivity(targetPid, id, patch, logMsg) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), logMsg);
  }

  function addActivity(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = { id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '', responsible: project.team[0] || 'PRICETAX', date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [], comments: [], transcript: '' };
    mutateProject(targetPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade criada: "${na.title}"`);
  }

  function deleteActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.filter((x) => x.id !== id) }), a ? `Atividade removida: "${a.title}"` : undefined);
  }

  function addSub(targetPid, actId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: [...(a.subactivities || []), { id: uid('s'), title: 'Nova subatividade', done: false }] }) }), act ? `Subatividade adicionada em "${act.title}"` : undefined);
    setExpanded((e) => ({ ...e, [actId]: true }));
  }

  function updateSub(targetPid, actId, subId, patch) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, ...patch } : s) }) }));
  }

  function deleteSub(targetPid, actId, subId) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).filter((s) => s.id !== subId) }) }));
  }

  function addAttachment(targetPid, actId, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const att = { id: uid('att'), name: file.name, size: file.size, dataUrl: reader.result };
      const project = projects.find((p) => p.id === targetPid);
      const act = project && project.activities.find((a) => a.id === actId);
      mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: [...(a.attachments || []), att] }) }), `Anexo adicionado em "${act ? act.title : ''}": ${file.name}`);
    };
    reader.readAsDataURL(file);
  }

  function removeAttachment(targetPid, actId, attId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const att = act && (act.attachments || []).find((x) => x.id === attId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: (a.attachments || []).filter((x) => x.id !== attId) }) }), att ? `Anexo removido em "${act.title}": ${att.name}` : undefined);
  }

  function addComment(targetPid, actId, text) {
    const v = (text || '').trim();
    if (!v) return;
    const c = { id: uid('cm'), text: v, ts: new Date().toISOString() };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: [...(a.comments || []), c] }) }), `Comentário adicionado em "${act ? act.title : ''}"`);
  }

  function removeComment(targetPid, actId, commentId) {
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }) }));
  }

  function addMember() {
    const v = newMember.trim();
    if (!v || !activeProject || activeProject.team.includes(v)) return;
    mutateProject(pid, (p) => ({ ...p, team: [...p.team, v] }), `Responsável adicionado à equipe: ${v}`);
    setNewMember('');
  }

  function removeMember(name) {
    mutateProject(pid, (p) => ({ ...p, team: p.team.filter((m) => m !== name) }), `Responsável removido da equipe: ${name}`);
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
    if (row.name && !activeProject.team.includes(row.name)) {
      mutateProject(pid, (p) => ({ ...p, team: [...p.team, row.name] }));
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
    setProjects((prev) => [...prev, res.project]);
    return res.project.id;
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
        Subatividades: (a.subactivities || []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(' | '),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 22 }, { wch: 6 }, { wch: 22 }, { wch: 26 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 50 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
      XLSX.writeFile(wb, 'cronograma-visao-geral.xlsx');
      selectedProjects.forEach((p) => addLog(p.id, 'Cronograma exportado para Excel (visão geral)'));
      return;
    }
    const activities = activeProject.activities;
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
      Subatividades: (a.subactivities || []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(' | '),
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

  const activitiesSorted = activeProject ? sortActivities(activeProject.activities) : [];
  const orderMap = buildOrderMap(activitiesSorted);

  const perCompanySorted = {};
  const perCompanyOrderMap = {};
  if (isMulti) {
    selectedProjects.forEach((p) => {
      const sorted = sortActivities(p.activities);
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
        input[type=text], input[type=date], input[type=email], input[type=password], select, textarea {
          background:#1c1c1c; border:1px solid #333; color:#eee; border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }
        ::-webkit-scrollbar{ height:8px; width:8px; }
        ::-webkit-scrollbar-thumb{ background:#333; border-radius:4px; }
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
                    <span key={p.id} style={{ ...S.multiCompanyChip, borderColor: p.company.color || '#333' }}>
                      <span style={{ ...S.companyColorDot, background: p.company.color || '#555' }} />
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
        </div>
        <div style={S.actionsRow}>
          {(currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowCreateCompany(true)}><Plus size={15} /> Cadastrar empresa</button>
          )}
          {currentUser.role === 'master' && <button style={S.iconBtn} onClick={() => setShowUsers(true)}><UserCog size={15} /> Usuários</button>}
          {!isMulti && (
            <button style={S.iconBtn} onClick={() => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); }}><LayoutGrid size={15} /> Fases</button>
          )}
          {!isMulti && (
            <button style={S.iconBtn} onClick={() => setShowLog(true)}><Clock size={15} /> Log ({(activeProject.log || []).length})</button>
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
          <div style={S.userBadge}>
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
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
          />
        )}
        {!isMulti && view === 'phases' && (
          <PhasesView activities={activitiesSorted} orderMap={orderMap} phases={activeProject.phases} pid={activeProject.id} updateActivity={updateActivity} openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })} />
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
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })}
            multiMode
          />
        )}
        {isMulti && view === 'phases' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <PhasesView activities={perCompanySorted[p.id]} orderMap={perCompanyOrderMap[p.id]} phases={p.phases} pid={p.id} updateActivity={updateActivity} openDetail={(tPid, id) => setOpenActivityId({ pid: tPid, id })} />
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

      {showLog && activeProject && (
        <SidePanel title="Log de alterações" onClose={() => setShowLog(false)}>
          {(activeProject.log || []).length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
          {(activeProject.log || []).map((l, i) => (
            <div key={i} style={S.logRow}>
              <div style={S.logTs}>{fmtTs(l.ts)}</div>
              <div style={S.logAction}>{l.action}</div>
            </div>
          ))}
        </SidePanel>
      )}

      {showSettings && activeProject && (
        <SidePanel title="Empresa e equipe" onClose={() => setShowSettings(false)}>
          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Logotipo do cliente</div>
            <div style={S.logoRow}>
              {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoPreview} /> : <div style={S.logoPreviewEmpty}><Building2 size={22} color="#666" /></div>}
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
            <div style={S.memberList}>
              {activeProject.team.map((m) => (
                <div key={m} style={S.memberChip}>
                  <span>{m}</span>
                  <button style={S.chipX} onClick={() => removeMember(m)}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div style={S.memberAddRow}>
              <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nome do responsável" onKeyDown={(e) => e.key === 'Enter' && addMember()} />
              <button style={S.iconBtn} onClick={addMember}><Plus size={14} /></button>
            </div>
          </div>
        </SidePanel>
      )}

      {showPhases && (() => {
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
                    <GripVertical size={15} color="#666" />
                  </div>
                  <input type="color" value={p.color} onChange={(e) => updatePhase(p.id, { color: e.target.value }, `Cor da fase "${p.name}" alterada`)} style={S.colorInput} />
                  <div style={{ flex: 1 }}>
                    <input type="text" value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} onBlur={() => addLog(phasesEditingProjectId, `Fase renomeada: "${p.name}"`)} placeholder="Nome da fase" />
                    <input type="text" value={p.sub} onChange={(e) => updatePhase(p.id, { sub: e.target.value })} onBlur={() => addLog(phasesEditingProjectId, `Descrição da fase "${p.name}" alterada`)} placeholder="Descrição curta" style={{ marginTop: 6, opacity: .85 }} />
                  </div>
                  <button style={S.iconBtnGhost} onClick={() => deletePhase(p.id)} disabled={target.phases.length <= 1} title={target.phases.length <= 1 ? 'Deixe pelo menos uma fase' : 'Excluir fase'}>
                    <Trash2 size={14} color={target.phases.length <= 1 ? '#444' : '#888'} />
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
            pid={project.id}
            onClose={() => setOpenActivityId(null)}
            updateActivity={updateActivity}
            deleteActivity={(tPid, id) => { deleteActivity(tPid, id); setOpenActivityId(null); }}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            addComment={addComment}
            removeComment={removeComment}
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
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={S.page}>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <img src={pricetaxLogoBranco} alt="PriceTax" style={S.loginLogo} />
          <div style={S.loginSub}>Carregando...</div>
        </div>
      </div>
    </div>
  );
}

function LoginGate({ onLogin, loginError }) {
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
          background:#1c1c1c; border:1px solid #333; color:#eee; border-radius:6px;
          padding:9px 10px; font-size:13px; width:100%;
        }
        input[type=text]:focus, input[type=password]:focus { outline:none; border-color:#F5C400; }
      `}</style>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <img src={pricetaxLogoBranco} alt="PriceTax" style={S.loginLogo} />
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
          background:#1c1c1c; border:1px solid #333; color:#eee; border-radius:6px;
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
        <div style={{ display: 'flex', gap: 8 }}>
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
              <div style={{ flex: 2, minWidth: 0 }}>
                <div style={S.usersRowName}>{u.name}</div>
                <div style={S.usersRowUsername}>{u.username}</div>
              </div>
              <div style={S.usersRowEmail}>{u.email || '—'}</div>
              <div style={{ width: 148 }}>
                <span style={{ ...S.roleTag, color: ROLE_META[u.role].color, borderColor: ROLE_META[u.role].color }}>{ROLE_META[u.role].label}</span>
              </div>
              <div style={{ width: 100 }}>
                {u.blocked ? <span style={S.usersStatusBlocked}>Bloqueado</span> : <span style={S.usersStatusActive}>Ativo</span>}
              </div>
              <div style={{ width: 110, fontSize: 12.5, color: isExpiredNotYetFlagged(u) ? '#e2574c' : '#bbb' }}>
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
                  {u.blocked ? <Check size={14} color="#3ecf6e" /> : <Trash2 size={14} color={u.id === currentUser.id ? '#444' : '#e2574c'} />}
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
  const [draft, setDraft] = useState({ username: '', password: '', name: '', role: 'cliente' });

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
          <div style={{ fontSize: 17, fontWeight: 800 }}>{u.name}</div>
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
          <Trash2 size={13} color={isSelf ? '#444' : '#888'} /> {isSelf ? ' (é você)' : ' Remover usuário'}
        </button>
      </div>
    </div>
  );
}

function CreateCompanyModal({ onClose, onCreate }) {
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
          background:#1c1c1c; border:1px solid #333; color:#eee; border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
      `}</style>
      <div style={{ ...S.detailBox, width: 'min(560px, 100%)', height: 'auto', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Cadastrar empresa</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

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
              {form.logo ? <img src={form.logo} alt="logo" style={S.logoPreview} /> : <div style={S.logoPreviewEmpty}><Building2 size={22} color="#666" /></div>}
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
              {saving ? 'Criando...' : 'Criar empresa'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CompanyBadge({ name, color, logo, small }) {
  return (
    <div style={small ? S.companyBadgeSmall : S.companyBadge}>
      {logo ? <img src={logo} alt="" style={S.companyBadgeLogo} /> : <span style={{ ...S.companyColorDot, background: color || '#555' }} />}
      <span style={S.companyBadgeName}>{name}</span>
    </div>
  );
}

function CompanySectionHeader({ project, onEditPhases }) {
  const c = project.company;
  return (
    <div style={S.companySectionHeader}>
      {c.logo ? <img src={c.logo} alt="" style={S.companySectionLogo} /> : <div style={{ ...S.companySectionLogoEmpty, background: c.color || '#1c1c1c' }}><Building2 size={16} color="#111" /></div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.companySectionName}>{c.name || 'Empresa sem nome'}</div>
        <div style={S.companySectionCnpj}>{c.cnpj || 'CNPJ não informado'}</div>
      </div>
      <span style={{ ...S.companyColorDot, background: c.color || '#555' }} />
      <button style={S.iconBtnGhost} title="Editar fases desta empresa" onClick={onEditPhases}><LayoutGrid size={14} /></button>
    </div>
  );
}

function CompanySelectorScreen({ projects, initialSelected, onConfirm, onLogout, onCreateNew }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));

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
          <img src={pricetaxLogoBranco} alt="PriceTax" style={{ ...S.loginLogo, marginBottom: 0 }} />
          <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={16} /></button>
        </div>
        <h1 style={S.loginTitle}>Quais empresas você quer acompanhar?</h1>
        <p style={S.loginSub}>Escolha uma, várias, ou marque "Selecionar todas" pra ter a visão geral. Dá pra trocar depois clicando em "Trocar empresas".</p>

        {projects.length === 0 ? (
          <div style={S.companyEmptyState}>
            <div style={S.emptyMuted}>Nenhuma empresa cadastrada ainda.</div>
            <button style={{ ...S.primaryBtn, marginTop: 12 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar empresa</button>
          </div>
        ) : (
          <>
            <label style={S.companySelectAllRow}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              Selecionar todas ({projects.length})
            </label>
            <div style={S.companyList}>
              {projects.map((p) => (
                <label key={p.id} style={{ ...S.companyCard, borderColor: selected.has(p.id) ? (p.company.color || '#F5C400') : '#2c2c2c' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  {p.company.logo ? <img src={p.company.logo} alt="" style={S.companyCardLogo} /> : <div style={{ ...S.companyCardLogoEmpty, background: p.company.color || '#1c1c1c' }}><Building2 size={16} color="#111" /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.companyCardName}>{p.company.name || 'Empresa sem nome'}</div>
                    <div style={S.companyCardCnpj}>{p.company.cnpj || 'CNPJ não informado'}</div>
                  </div>
                  <span style={{ ...S.companyColorDot, background: p.company.color || '#555' }} />
                </label>
              ))}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 10 }} onClick={onCreateNew}><Plus size={14} /> Cadastrar nova empresa</button>
            <button style={{ ...S.primaryBtn, marginTop: 16, width: '100%', justifyContent: 'center' }} disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
              Continuar {selected.size > 0 ? `(${selected.size} selecionada${selected.size === 1 ? '' : 's'})` : ''}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NoAccessScreen({ user, onLogout }) {
  return (
    <div style={S.page}>
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

function ActivityDetailModal({ activity: a, orderMap, phases, team, pid, onClose, updateActivity, deleteActivity, addSub, updateSub, deleteSub, addAttachment, removeAttachment, addComment, removeComment }) {
  const [commentDraft, setCommentDraft] = useState('');
  const phase = phases.find((p) => p.id === a.phase);

  function submitComment() {
    if (!commentDraft.trim()) return;
    addComment(pid, a.id, commentDraft);
    setCommentDraft('');
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
                  <div style={S.commentText}>{c.text}</div>
                  <div style={S.commentMeta}>
                    <span>{fmtTs(c.ts)}</span>
                    <button style={S.commentDel} onClick={() => removeComment(pid, a.id, c.id)}><X size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div style={S.commentInputRow}>
              <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Escreva um comentário..." rows={2} style={{ flex: 1 }} />
              <button style={S.primaryBtn} onClick={submitComment}><Send size={14} /></button>
            </div>
          </div>

          <div style={S.detailSide}>
            <div style={S.subSectionLabel}>Fase</div>
            <select value={a.phase} onChange={(e) => { const id = Number(e.target.value); updateActivity(pid, a.id, { phase: id }, `Fase alterada em "${a.title}": ${phases.find((p) => p.id === id)?.name}`); }}>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div style={S.subSectionLabel}>Responsável</div>
            <select value={a.responsible} onChange={(e) => updateActivity(pid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)}>
              {team.map((m) => <option key={m} value={m}>{m}</option>)}
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
            {(a.subactivities || []).map((s) => (
              <div key={s.id} style={S.subRow}>
                <input type="checkbox" checked={s.done} onChange={(e) => updateSub(pid, a.id, s.id, { done: e.target.checked })} />
                <input type="text" value={s.title} onChange={(e) => updateSub(pid, a.id, s.id, { title: e.target.value })} style={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                <button style={S.iconBtnGhost} onClick={() => deleteSub(pid, a.id, s.id)}><X size={13} /></button>
              </div>
            ))}
            <button style={S.addSubBtn} onClick={() => addSub(pid, a.id)}><Plus size={12} /> Subatividade</button>

            <div style={S.subSectionLabel}>Anexos {(a.attachments || []).length > 0 ? `(${(a.attachments || []).length})` : ''}</div>
            <div style={S.attachList}>
              {(a.attachments || []).map((att) => (
                <div key={att.id} style={S.attachRow}>
                  <a href={att.dataUrl} download={att.name} style={S.attachLink}>{att.name}</a>
                  <span style={S.attachSize}>{att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
                  <button style={S.iconBtnGhost} onClick={() => removeAttachment(pid, a.id, att.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
            <label htmlFor={`file-detail-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
            <input id={`file-detail-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(pid, a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />

            <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c', borderColor: '#4a2422' }} onClick={() => deleteActivity(pid, a.id)}><Trash2 size={14} /> Excluir atividade</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableView({ activities, orderMap, phases, team, pid, expanded, setExpanded, updateActivity, deleteActivity, addSub, updateSub, deleteSub, addAttachment, removeAttachment, openDetail, multiMode }) {
  const [dragActId, setDragActId] = useState(null);

  function reorderActivityByDrop(fromId, toId) {
    const list = activities;
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
    <div style={S.tableWrap}>
      <div style={S.tableHeaderRow}>
        <div style={{ ...S.th, width: 20 }}></div>
        <div style={{ ...S.th, width: 68 }}></div>
        <div style={{ ...S.th, width: 46 }}>Ordem</div>
        {multiMode && <div style={{ ...S.th, width: 150 }}>Empresa</div>}
        <div style={{ ...S.th, flex: 2 }}>Atividade</div>
        <div style={{ ...S.th, width: 140 }}>Fase</div>
        <div style={{ ...S.th, width: 130 }}>Responsável</div>
        <div style={{ ...S.th, width: 105 }}>Início</div>
        <div style={{ ...S.th, width: 70 }}>Prazo</div>
        <div style={{ ...S.th, width: 105 }}>Fim</div>
        <div style={{ ...S.th, width: 70, textAlign: 'center' }}>Obrig.</div>
        <div style={{ ...S.th, width: 150 }}>Status</div>
        <div style={{ ...S.th, width: 40 }}></div>
      </div>

      {activities.map((a) => {
        const rowPid = pid || a._pid;
        const rowPhases = phases || a._phases;
        const rowTeam = team || a._team;
        const rowOrder = orderMap ? orderMap[a.id] : a._order;
        const isOpen = !!expanded[`${rowPid}-${a.id}`];
        const doneSubs = (a.subactivities || []).filter((s) => s.done).length;
        return (
          <div
            key={`${rowPid}-${a.id}`}
            style={{ ...S.tableGroup, ...(dragActId === a.id ? S.tableRowDragging : {}) }}
            onDragOver={(e) => { if (!multiMode) e.preventDefault(); }}
            onDrop={() => {
              if (!multiMode && dragActId && dragActId !== a.id) reorderActivityByDrop(dragActId, a.id);
              setDragActId(null);
            }}
          >
            <div style={S.tableRow}>
              <div
                style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: multiMode ? 'default' : 'grab', opacity: multiMode ? 0.25 : 1, flexShrink: 0 }}
                draggable={!multiMode}
                onDragStart={() => setDragActId(a.id)}
                onDragEnd={() => setDragActId(null)}
                title={multiMode ? undefined : 'Arraste para reordenar (ajusta a data de início)'}
              >
                <GripVertical size={14} color="#666" />
              </div>
              <button style={S.expandBtn} onClick={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: !e[`${rowPid}-${a.id}`] }))}>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
              </button>
              <button style={S.expandBtn} title="Abrir em tela cheia" onClick={() => openDetail(rowPid, a.id)}>
                <Maximize2 size={13} />
              </button>
              <div style={{ width: 46 }}><span style={S.monthBadgeSm}>#{rowOrder}</span></div>
              {multiMode && (
                <div style={{ width: 150 }}>
                  <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} />
                </div>
              )}
              <div style={{ flex: 2, minWidth: 0 }}>
                <input type="text" value={a.title} onChange={(e) => updateActivity(rowPid, a.id, { title: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Título alterado: "${a.title}"`)} />
                <input type="text" value={a.desc} onChange={(e) => updateActivity(rowPid, a.id, { desc: e.target.value })} onBlur={() => updateActivity(rowPid, a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 4, opacity: .8 }} />
                {(a.subactivities || []).length > 0 && <div style={S.subCounter}>{doneSubs}/{(a.subactivities || []).length} subatividades concluídas</div>}
              </div>
              <div style={{ width: 140 }}>
                <select
                  value={a.phase}
                  onChange={(e) => {
                    const newPhaseId = Number(e.target.value);
                    const phaseName = rowPhases.find((p) => p.id === newPhaseId)?.name || '';
                    updateActivity(rowPid, a.id, { phase: newPhaseId }, `Fase alterada em "${a.title}": ${phaseName}`);
                  }}
                  style={{ color: rowPhases.find((p) => p.id === a.phase)?.color }}
                >
                  {rowPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ width: 130 }}>
                <select value={a.responsible} onChange={(e) => updateActivity(rowPid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)}>
                  {rowTeam.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: 105 }}>
                <input type="date" value={a.date} onChange={(e) => {
                  const v = e.target.value;
                  const patch = { date: v };
                  if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
                  else if (!a.endDate || a.endDate < v) patch.endDate = v;
                  updateActivity(rowPid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                }} />
              </div>
              <div style={{ width: 70 }}>
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
              <div style={{ width: 105 }}>
                <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(rowPid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
              </div>
              <div style={{ width: 70, textAlign: 'center' }}>
                <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(rowPid, a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} />
              </div>
              <div style={{ width: 150 }}>
                <select value={a.status} onChange={(e) => updateActivity(rowPid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ color: STATUS_META[a.status].color }}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div style={{ width: 40 }}>
                <button style={S.iconBtnGhost} onClick={() => deleteActivity(rowPid, a.id)}><Trash2 size={14} /></button>
              </div>
            </div>

            {isOpen && (
              <div style={S.subPanel}>
                {(a.subactivities || []).map((s) => (
                  <div key={s.id} style={S.subRow}>
                    <input type="checkbox" checked={s.done} onChange={(e) => updateSub(rowPid, a.id, s.id, { done: e.target.checked })} />
                    <input type="text" value={s.title} onChange={(e) => updateSub(rowPid, a.id, s.id, { title: e.target.value })} style={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                    <button style={S.iconBtnGhost} onClick={() => deleteSub(rowPid, a.id, s.id)}><X size={13} /></button>
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
  );
}

function PhasesView({ activities, orderMap, phases, pid, updateActivity, openDetail }) {
  function cycleStatus(a) {
    const rowPid = pid || a._pid;
    const idx = STATUS_ORDER.indexOf(a.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateActivity(rowPid, a.id, { status: next }, `Status alterado em "${a.title}": ${STATUS_META[next].label}`);
  }
  return (
    <div>
      {phases.map((p) => (
        <section key={p.id} style={S.phaseSection}>
          <div style={S.phaseHead}>
            <div style={{ ...S.phaseNum, color: p.color }}>0{p.id}</div>
            <div>
              <div style={S.phaseTitle}>{p.name}</div>
              <div style={S.phaseSub}>{p.sub}</div>
            </div>
          </div>
          {activities.filter((a) => a.phase === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((a) => {
            const rowPid = pid || a._pid;
            const rowOrder = orderMap ? orderMap[a.id] : a._order;
            return (
              <div key={a.id} style={{ ...S.phaseRow, cursor: 'pointer' }} onClick={() => openDetail(rowPid, a.id)}>
                <div style={{ ...S.monthBadge, background: p.color }}>#{rowOrder}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.phaseActTitle}>{a.title}{a.required && <span style={S.reqDot} title="Obrigatória" />}</div>
                  <div style={S.phaseActDesc}>{a.desc}</div>
                </div>
                <div style={S.phaseOwner}>{a.responsible}</div>
                <div style={S.phaseDate}>{fmtDate(a.date)}{a.endDate && a.endDate !== a.date ? ` – ${fmtDate(a.endDate)}` : ''}</div>
                <StatusPill status={a.status} onClick={(e) => { e.stopPropagation(); cycleStatus(a); }} />
              </div>
            );
          })}
        </section>
      ))}
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
                    <GripVertical size={13} color="#555" />
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
  page: { background: '#111', color: '#eee', fontFamily: "'Inter', sans-serif", minHeight: '100vh', paddingBottom: 40 },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '18px 24px', borderBottom: '1px solid #262626', background: '#151515' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12 },
  logoImg: { width: 38, height: 38, borderRadius: 8, objectFit: 'cover', border: '1px solid #333' },
  logoPlaceholder: { width: 38, height: 38, borderRadius: 8, background: '#1c1c1c', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontWeight: 700, fontSize: 14 },
  brandCnpj: { fontSize: 11.5, color: '#888' },
  projectSwitch: { fontWeight: 700, fontSize: 13, background: '#1c1c1c', border: '1px solid #333', color: '#eee', borderRadius: 6, padding: '4px 8px', maxWidth: 260 },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#1c1c1c', border: '1px solid #333', color: '#ddd', fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' },
  iconBtnGhost: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 4 },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#F5C400', border: 'none', color: '#111', fontSize: 12.5, fontWeight: 800, padding: '7px 13px', borderRadius: 7, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, padding: '14px 24px 0 24px' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid #262626', color: '#999', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer' },
  tabActive: { background: '#181818', color: '#F5C400', borderColor: '#333', borderBottomColor: '#181818' },
  main: { padding: '20px 24px 0 24px' },
  hint: { fontSize: 11.5, color: '#5f5f5f', textAlign: 'center', marginTop: 24 },

  userBadge: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6, paddingLeft: 12, borderLeft: '1px solid #2c2c2c' },
  roleTag: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' },
  userName: { fontSize: 12.5, fontWeight: 600, color: '#ddd' },

  // login
  loginWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginBox: { width: 'min(520px, 100%)' },
  loginLogo: { height: 34, marginBottom: 18 },
  loginEyebrow: { fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#F5C400', marginBottom: 10 },
  loginTitle: { fontSize: 26, fontWeight: 900, marginBottom: 8 },
  loginSub: { fontSize: 13, color: '#999', lineHeight: 1.6, marginBottom: 24 },
  loginList: { display: 'flex', flexDirection: 'column', gap: 10 },
  loginCard: { textAlign: 'left', background: '#181818', border: '1px solid #2c2c2c', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  loginName: { fontSize: 15, fontWeight: 700, color: '#eee' },
  loginMeta: { fontSize: 12, color: '#888' },

  // table view
  tableWrap: { border: '1px solid #262626', borderRadius: 10, overflow: 'hidden' },
  tableHeaderRow: { display: 'flex', gap: 12, padding: '10px 14px', background: '#181818', borderBottom: '1px solid #262626' },
  th: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#888' },
  tableGroup: { borderBottom: '1px solid #222' },
  tableRowDragging: { opacity: .4 },
  tableRow: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: '#141414' },
  expandBtn: { width: 30, background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', paddingTop: 6 },
  monthBadgeSm: { fontSize: 10.5, fontWeight: 800, background: '#F5C400', color: '#111', padding: '3px 7px', borderRadius: 5 },
  subCounter: { fontSize: 11, color: '#777', marginTop: 4 },
  subPanel: { padding: '4px 14px 14px 60px', display: 'flex', flexDirection: 'column', gap: 6, background: '#121212' },
  subRow: { display: 'flex', alignItems: 'center', gap: 8 },
  addSubBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px dashed #3a3a3a', color: '#999', fontSize: 11.5, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', width: 'fit-content', marginTop: 4 },
  subSectionLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#888', marginTop: 14, marginBottom: 6 },
  notesArea: { resize: 'vertical', minHeight: 60, lineHeight: 1.5 },
  attachList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 },
  attachRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a1a', border: '1px solid #262626', borderRadius: 6, padding: '6px 9px' },
  attachLink: { fontSize: 12, color: '#F5C400', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  attachSize: { fontSize: 10.5, color: '#777', flexShrink: 0 },

  // phases view
  phaseSection: { marginBottom: 40 },
  phaseHead: { display: 'flex', gap: 14, alignItems: 'baseline', borderBottom: '1px solid #262626', paddingBottom: 14, marginBottom: 16 },
  phaseNum: { fontSize: 30, fontWeight: 900, lineHeight: 1 },
  phaseTitle: { fontSize: 17, fontWeight: 800 },
  phaseSub: { fontSize: 12.5, color: '#888', marginTop: 2 },
  phaseRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: '#181818', border: '1px solid #262626', borderRadius: 9, marginBottom: 9 },
  monthBadge: { fontSize: 12, fontWeight: 900, color: '#111', width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  phaseActTitle: { fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 },
  reqDot: { width: 6, height: 6, borderRadius: '50%', background: '#e2574c', display: 'inline-block' },
  phaseActDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  phaseOwner: { fontSize: 12, fontWeight: 700, color: '#ccc', width: 110, flexShrink: 0 },
  phaseDate: { fontSize: 12, color: '#aaa', width: 90, flexShrink: 0 },
  statusPill: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', padding: '7px 11px', borderRadius: 999, border: '1px solid', textAlign: 'center', width: 128, flexShrink: 0 },

  // kanban
  kanbanBoard: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  kanbanCol: { background: '#161616', border: '1px solid #262626', borderRadius: 10, padding: 12, minHeight: 200 },
  kanbanColHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800, marginBottom: 12, color: '#ddd' },
  kanbanDot: { width: 8, height: 8, borderRadius: '50%' },
  kanbanCount: { marginLeft: 'auto', fontSize: 11, color: '#777', background: '#222', padding: '1px 7px', borderRadius: 999 },
  kanbanCard: { background: '#1e1e1e', border: '1px solid #2c2c2c', borderRadius: 8, padding: '10px 11px', marginBottom: 9, cursor: 'grab' },
  kanbanCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  kanbanCardTitle: { fontSize: 12.5, fontWeight: 700, marginBottom: 5 },
  kanbanCardMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#8a8a8a' },
  kanbanAdd: { display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', width: '100%', background: 'transparent', border: '1px dashed #333', color: '#888', fontSize: 11.5, padding: '8px', borderRadius: 6, cursor: 'pointer' },

  // timeline
  timelineToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  granularityGroup: { display: 'flex', background: '#181818', border: '1px solid #2c2c2c', borderRadius: 8, padding: 3, gap: 2 },
  granBtn: { background: 'transparent', border: 'none', color: '#999', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' },
  granBtnActive: { background: '#F5C400', color: '#111' },
  navGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: { background: '#1c1c1c', border: '1px solid #333', color: '#ddd', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 15, lineHeight: 1 },
  navLabel: { fontSize: 12.5, fontWeight: 700, color: '#ccc', textTransform: 'capitalize', minWidth: 160, textAlign: 'center' },
  navToday: { background: 'transparent', border: '1px solid #333', color: '#999', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' },
  timelineLaneDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  ganttScroll: { overflowX: 'auto', paddingBottom: 10 },
  ganttGrid: { display: 'grid', position: 'relative', columnGap: 0, rowGap: 0 },
  ganttCornerCell: { position: 'sticky', left: 0, background: '#111', borderBottom: '1px solid #262626', zIndex: 3 },
  ganttColHeader: { fontSize: 10.5, color: '#888', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #262626', borderLeft: '1px solid #1c1c1c' },
  ganttPhaseRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, color: '#ccc', background: '#171717', padding: '0 12px', borderTop: '1px solid #262626', borderBottom: '1px solid #262626', position: 'sticky', left: 0, overflow: 'hidden' },
  ganttLabelCell: { position: 'sticky', left: 0, background: '#141414', borderBottom: '1px solid #232323', borderRight: '1px solid #262626', padding: '5px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, overflow: 'hidden' },
  ganttLabelTitle: { fontSize: 11.5, fontWeight: 700, color: '#e8e8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 },
  ganttLabelMeta: { fontSize: 10, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 },
  ganttBarWrap: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #1c1c1c', padding: '6px 3px', overflow: 'hidden' },
  ganttBar: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%', border: '1px solid', borderRadius: 6, padding: '0 8px', overflow: 'hidden' },
  ganttBarDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  ganttBarTitle: { fontSize: 10.5, fontWeight: 700, color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  ganttTodayLine: { position: 'absolute', top: 0, width: 2, background: '#e2574c', zIndex: 4, pointerEvents: 'none' },
  noDateBlock: { marginTop: 20, paddingTop: 16, borderTop: '1px solid #262626' },
  noDateLabel: { fontSize: 11.5, fontWeight: 700, color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.03em' },
  noDateList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  noDateChip: { fontSize: 11.5, background: '#1c1c1c', border: '1px solid #2e2e2e', color: '#bbb', padding: '5px 10px', borderRadius: 999 },

  // panels
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 },
  detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 },
  detailBox: { width: 'min(980px, 100%)', height: '92vh', background: '#141414', border: '1px solid #2c2c2c', borderRadius: 14, overflowY: 'auto', padding: '20px 28px 32px 28px' },
  detailTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  detailTopLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  detailPhaseTag: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#bbb' },
  detailTitleInput: { fontSize: 22, fontWeight: 800, background: 'transparent', border: 'none', color: '#fff', padding: '4px 0', marginBottom: 18, borderBottom: '1px solid #262626', borderRadius: 0, width: '100%' },
  detailGrid: { display: 'flex', gap: 28, flexWrap: 'wrap' },
  detailMain: { flex: 2, minWidth: 340, display: 'flex', flexDirection: 'column' },
  detailSide: { flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column' },
  commentThread: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 260, overflowY: 'auto' },
  commentBubble: { background: '#1c1c1c', border: '1px solid #262626', borderRadius: 8, padding: '9px 11px' },
  commentText: { fontSize: 12.5, color: '#e6e6e6', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  commentMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10.5, color: '#777' },
  commentDel: { background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', display: 'flex' },
  commentInputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  panel: { width: 360, maxWidth: '92vw', height: '100%', background: '#161616', borderLeft: '1px solid #2c2c2c', overflowY: 'auto' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px', borderBottom: '1px solid #262626', position: 'sticky', top: 0, background: '#161616' },
  panelTitle: { fontWeight: 800, fontSize: 14.5 },
  panelBody: { padding: '18px' },
  emptyMuted: { fontSize: 12.5, color: '#777' },
  logRow: { padding: '9px 0', borderBottom: '1px solid #232323' },
  logTs: { fontSize: 10.5, color: '#7a7a7a' },
  logAction: { fontSize: 12.5, color: '#e0e0e0', marginTop: 2 },

  settingsBlock: { marginBottom: 20 },
  areaRow: { background: '#1a1a1a', border: '1px solid #262626', borderRadius: 8, padding: 10, marginBottom: 8 },
  settingsLabel: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#999', marginBottom: 8 },
  fieldHint: { fontSize: 11, color: '#6f6f6f', marginTop: 5, lineHeight: 1.4 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10 },
  logoPreview: { width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #333' },
  logoPreviewEmpty: { width: 48, height: 48, borderRadius: 8, background: '#1c1c1c', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  memberList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  memberChip: { display: 'flex', alignItems: 'center', gap: 6, background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 999, padding: '5px 6px 5px 11px', fontSize: 12 },
  chipX: { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex' },
  memberAddRow: { display: 'flex', gap: 6 },
  phaseEditRow: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #232323' },
  phaseEditRowDragging: { opacity: .4 },
  phaseDragHandle: { display: 'flex', alignItems: 'center', cursor: 'grab', paddingTop: 8, flexShrink: 0 },
  colorInput: { width: 34, height: 34, padding: 0, border: '1px solid #333', borderRadius: 6, background: 'transparent', cursor: 'pointer', flexShrink: 0 },

  // users panel
  userEditCard: { background: '#1a1a1a', border: '1px solid #262626', borderRadius: 8, padding: 12, marginBottom: 10 },
  cnpjCheckList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
  cnpjCheckRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#ddd' },
  accessBlock: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #262626' },
  expireWarning: { marginTop: 10, background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f0a49e', lineHeight: 1.5 },
  renewBtn: { display: 'block', marginTop: 8, background: '#e2574c', border: 'none', color: '#fff', fontWeight: 700, fontSize: 11.5, padding: '6px 11px', borderRadius: 6, cursor: 'pointer' },
  loginBlockedMsg: { background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#f0a49e', marginBottom: 16 },
  loginBlockedTag: { fontSize: 10, fontWeight: 800, color: '#e2574c', border: '1px solid #e2574c', borderRadius: 999, padding: '2px 7px' },

  // users management screen
  usersHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '20px 24px', borderBottom: '1px solid #262626', background: '#151515' },
  usersHeaderIcon: { width: 40, height: 40, borderRadius: 10, background: '#1c1c1c', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usersHeaderTitle: { fontSize: 19, fontWeight: 800 },
  usersHeaderSub: { fontSize: 12.5, color: '#999', marginTop: 2 },
  usersStatsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, padding: '20px 24px 0 24px' },
  usersStatCard: { background: '#161616', border: '1px solid #262626', borderRadius: 10, padding: '14px 16px' },
  usersStatValue: { fontSize: 26, fontWeight: 900, color: '#eee', lineHeight: 1.2 },
  usersStatLabel: { fontSize: 11.5, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 },
  usersFilterRow: { display: 'flex', gap: 10, padding: '20px 24px 0 24px', flexWrap: 'wrap' },
  usersTableOuter: { padding: '16px 24px 32px 24px' },
  usersTableWrap: { border: '1px solid #262626', borderRadius: 10, overflow: 'hidden' },
  usersTableHeaderRow: { display: 'flex', gap: 12, padding: '10px 16px', background: '#181818', borderBottom: '1px solid #262626' },
  usersTableRow: { display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #202020', background: '#141414', cursor: 'pointer' },
  usersRowName: { fontSize: 13, fontWeight: 700, color: '#eee' },
  usersRowUsername: { fontSize: 11.5, color: '#888', marginTop: 2 },
  usersRowEmail: { flex: 2, minWidth: 0, fontSize: 12.5, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  usersStatusActive: { fontSize: 11, fontWeight: 700, color: '#3ecf6e', background: 'rgba(62,207,110,.12)', border: '1px solid rgba(62,207,110,.4)', borderRadius: 999, padding: '3px 9px' },
  usersStatusBlocked: { fontSize: 11, fontWeight: 700, color: '#e2574c', background: 'rgba(226,87,76,.12)', border: '1px solid rgba(226,87,76,.4)', borderRadius: 999, padding: '3px 9px' },

  // cnpj lookup
  cnpjFetchGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12.5, color: '#ddd' },
  cnpjListRow: { fontSize: 12.5, color: '#ccc', padding: '4px 0', borderBottom: '1px solid #202020' },

  // multi-company view
  multiCompanyChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  multiCompanyChip: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#ccc', border: '1px solid #333', borderRadius: 999, padding: '2px 8px 2px 6px' },
  companyColorDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  companyBadge: { display: 'flex', alignItems: 'center', gap: 6 },
  companyBadgeSmall: { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 },
  companyBadgeLogo: { width: 16, height: 16, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  companyBadgeName: { fontSize: 11.5, fontWeight: 700, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  companySection: { marginBottom: 36, border: '1px solid #262626', borderRadius: 10, overflow: 'hidden' },
  companySectionHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#181818', borderBottom: '1px solid #262626' },
  companySectionLogo: { width: 30, height: 30, borderRadius: 7, objectFit: 'cover', border: '1px solid #333', flexShrink: 0 },
  companySectionLogoEmpty: { width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companySectionName: { fontSize: 13.5, fontWeight: 800, color: '#eee' },
  companySectionCnpj: { fontSize: 11, color: '#888', marginTop: 1 },

  // company selector screen
  companySelectorWrap: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px' },
  companySelectorHeader: { width: 'min(640px, 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  companyEmptyState: { width: 'min(640px, 100%)', textAlign: 'center', padding: '40px 20px', border: '1px dashed #333', borderRadius: 12 },
  companySelectAllRow: { width: 'min(640px, 100%)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#ccc', marginBottom: 12 },
  companyList: { width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '46vh', overflowY: 'auto' },
  companyCard: { display: 'flex', alignItems: 'center', gap: 10, background: '#181818', border: '1px solid #2c2c2c', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' },
  companyCardLogo: { width: 32, height: 32, borderRadius: 8, objectFit: 'cover', border: '1px solid #333', flexShrink: 0 },
  companyCardLogoEmpty: { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyCardName: { fontSize: 13, fontWeight: 700, color: '#eee' },
  companyCardCnpj: { fontSize: 11, color: '#888', marginTop: 1 },
};
