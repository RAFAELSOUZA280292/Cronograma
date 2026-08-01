import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Download, Upload, Clock, LayoutGrid, Columns3, Building2,
  Users, X, Check, ChevronDown, FileSpreadsheet, FileText, Settings,
  GripVertical, CalendarDays, List, Pencil, Maximize2, Send, MessageSquare, Mic,
  LogOut, UserCog
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storage } from './lib/storage.js';

const STORAGE_KEY = 'pricetax-cronograma-multiprojeto-v1';
const OLD_STORAGE_KEY = 'pricetax-cronograma-reforma-v1';

const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#e2574c', '#b98af5', '#ff9f40'];

const ROLE_META = {
  master: { label: 'PRICETAX Master', color: '#F5C400' },
  pricetax: { label: 'PRICETAX', color: '#3ea6ff' },
  cliente: { label: 'Cliente', color: '#3ecf6e' },
};

function defaultPhases() {
  return [
    { id: 1, name: 'Leitura Real', sub: 'Captura dos documentos e devolução do número geral', color: '#F5C400' },
    { id: 2, name: 'Mão na Massa por Área', sub: 'Cada mês traduz o número em decisão de uma área', color: '#3ea6ff' },
    { id: 3, name: 'Consolidação', sub: 'Sistemas ajustados, pendências fechadas, ciclo encerrado', color: '#3ecf6e' },
  ];
}

const STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: '#9a9a9a', bg: '#262626', border: '#3a3a3a' },
  'em-andamento': { label: 'Em andamento', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  'concluido': { label: 'Concluído', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
};
const STATUS_ORDER = ['nao-iniciado', 'em-andamento', 'concluido'];

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

function defaultTeam() {
  return ['PRICETAX', 'Compras', 'Comercial', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'Controladoria', 'TI', 'Diretoria', 'Todas'];
}

function normalizeActivity(a) {
  return {
    subactivities: [],
    notes: '',
    attachments: [],
    comments: [],
    transcript: '',
    endDate: a && a.date ? a.date : '',
    required: false,
    ...a,
  };
}

function defaultActivities() {
  return [
    { id: 'm1', month: 1, phase: 1, title: 'Kickoff único no cliente', desc: 'Mapeamento + captura de documentos + validação inicial, tudo em uma só visita', responsible: 'PRICETAX', date: '2026-08-07', endDate: '2026-08-11', status: 'nao-iniciado', required: true, notes: '', attachments: [],
      subactivities: [
        { id: uid('s'), title: 'Mapear processos e sistemas', done: false },
        { id: uid('s'), title: 'Coletar documentos fiscais', done: false },
        { id: uid('s'), title: 'Validar dados coletados', done: false },
      ] },
    { id: 'm2', month: 2, phase: 1, title: 'Retorno com o número geral', desc: 'Impacto real em preço de compra, preço de venda, DRE e caixa', responsible: 'PRICETAX', date: '2026-09-18', endDate: '2026-09-18', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm3', month: 3, phase: 2, title: 'Compras', desc: 'Fornecedores que vão subir e descer de preço, item por item', responsible: 'Compras', date: '2026-10-16', endDate: '2026-10-16', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm4', month: 4, phase: 2, title: 'Vendas', desc: 'Novos preços de venda por produto, cliente e canal', responsible: 'Comercial', date: '2026-11-13', endDate: '2026-11-13', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm5', month: 5, phase: 2, title: 'Financeiro', desc: 'Nota de débito, nota de crédito, adaptação da área financeira e do caixa', responsible: 'Financeiro', date: '2026-12-11', endDate: '2026-12-11', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm6', month: 6, phase: 2, title: 'Fiscal / Tributário', desc: 'cClassTrib e CST — coincide com a virada da CBS plena', responsible: 'Fiscal', date: '2027-01-15', endDate: '2027-01-15', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm7', month: 7, phase: 2, title: 'Jurídico', desc: 'Contratos e cláusulas de repactuação', responsible: 'Jurídico', date: '2027-02-12', endDate: '2027-02-12', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm8', month: 8, phase: 2, title: 'Logística', desc: 'Malha, centros de distribuição e rotas', responsible: 'Logística', date: '2027-03-12', endDate: '2027-03-12', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm9', month: 9, phase: 2, title: 'Controladoria', desc: 'DRE reformada e indicadores executivos', responsible: 'Controladoria', date: '2027-04-09', endDate: '2027-04-09', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm10', month: 10, phase: 3, title: 'Adaptação de sistemas', desc: 'Parametrização e homologação final do ERP', responsible: 'TI', date: '2027-05-14', endDate: '2027-05-14', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm11', month: 11, phase: 3, title: 'Tira-dúvidas geral', desc: 'Todas as áreas juntas para fechar pendências soltas', responsible: 'Todas', date: '2027-06-11', endDate: '2027-06-11', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [] },
    { id: 'm12', month: 12, phase: 3, title: 'Encerramento', desc: 'Retrospectiva do ano e plano do Ano 2', responsible: 'Diretoria', date: '2027-07-09', endDate: '2027-07-09', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
  ];
}

function blankProject() {
  return {
    id: uid('proj'),
    company: { cnpj: '', name: '', logo: '', areas: [] },
    phases: defaultPhases(),
    activities: defaultActivities().map(normalizeActivity),
    team: defaultTeam(),
    log: [],
  };
}

function defaultProjects() {
  const p = blankProject();
  p.company = { cnpj: '12.345.678/0001-90', name: 'Empresa Demonstração', logo: '', areas: [] };
  return [p];
}

function defaultUsers(demoCnpj) {
  return [
    { id: 'u-master', name: 'Rafael Souza', email: '', role: 'master', cnpj: '', allowedCnpjs: [], blocked: false, blockReason: '', expiresAt: '' },
    { id: 'u-pricetax', name: 'Equipe PRICETAX', email: '', role: 'pricetax', cnpj: '', allowedCnpjs: demoCnpj ? [demoCnpj] : [], blocked: false, blockReason: '', expiresAt: '' },
    { id: 'u-cliente', name: 'Usuário do cliente', email: '', role: 'cliente', cnpj: demoCnpj || '', allowedCnpjs: [], blocked: false, blockReason: '', expiresAt: '' },
  ];
}

function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'master') return true;
  const cnpj = project.company && project.company.cnpj;
  if (!cnpj) return false;
  if (user.role === 'pricetax') return (user.allowedCnpjs || []).includes(cnpj);
  if (user.role === 'cliente') return user.cnpj === cnpj;
  return false;
}

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

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState(() => defaultUsers('12.345.678/0001-90'));
  const [projects, setProjects] = useState(defaultProjects());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [usersLog, setUsersLog] = useState([]);
  const [loginError, setLoginError] = useState(null);

  const [view, setView] = useState('table');
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [openActivityId, setOpenActivityId] = useState(null);
  const [newMember, setNewMember] = useState('');
  const [expanded, setExpanded] = useState({});
  const [dragId, setDragId] = useState(null);
  const [granularity, setGranularity] = useState('mes');
  const [windowAnchor, setWindowAnchor] = useState(new Date());
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.users && data.users.length) setUsers(data.users);
          if (data.projects && data.projects.length) {
            setProjects(data.projects.map((p) => ({ ...p, activities: (p.activities || []).map(normalizeActivity) })));
          }
          if (data.currentUserId) setCurrentUserId(data.currentUserId);
          if (data.usersLog) setUsersLog(data.usersLog);
          if (data.activeProjectId) setActiveProjectId(data.activeProjectId);
        } else {
          const oldRes = await storage.get(OLD_STORAGE_KEY);
          if (oldRes && oldRes.value) {
            const old = JSON.parse(oldRes.value);
            const migrated = {
              id: uid('proj'),
              company: { areas: [], cnpj: '', name: '', logo: '', ...(old.company || {}) },
              phases: (old.phases && old.phases.length) ? old.phases : defaultPhases(),
              activities: (old.activities || []).map(normalizeActivity),
              team: old.team && old.team.length ? old.team : defaultTeam(),
              log: old.log || [],
            };
            setProjects([migrated]);
            const mUsers = defaultUsers(migrated.company.cnpj);
            setUsers(mUsers);
          }
        }
      } catch (e) { /* nada salvo ainda */ }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    try { await storage.set(STORAGE_KEY, JSON.stringify(next)); }
    catch (e) { console.error('Falha ao salvar', e); }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist({ users, projects, currentUserId, activeProjectId, usersLog });
  }, [users, projects, currentUserId, activeProjectId, usersLog, loaded, persist]);

  function addUsersLog(action) {
    setUsersLog((l) => [{ ts: new Date().toISOString(), action }, ...l].slice(0, 300));
  }

  function attemptLogin(userId) {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    if (isExpiredNotYetFlagged(u)) {
      setUsers((prev) => prev.map((x) => (x.id === userId ? { ...x, blocked: true, blockReason: 'Acesso expirado' } : x)));
      addUsersLog(`Login bloqueado por expiração: ${u.name}`);
      setLoginError({ userId, message: 'Acesso expirado. Fale com um PRICETAX Master para renovar.' });
      return;
    }
    if (u.blocked) {
      setLoginError({ userId, message: u.blockReason || 'Acesso bloqueado. Fale com um PRICETAX Master.' });
      return;
    }
    setLoginError(null);
    setCurrentUserId(userId);
  }

  function mutateProject(pid, updater, logMsg) {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      let next = updater(p);
      if (logMsg) next = { ...next, log: [{ ts: new Date().toISOString(), action: logMsg }, ...(next.log || [])].slice(0, 300) };
      return next;
    }));
  }

  const currentUser = users.find((u) => u.id === currentUserId) || null;
  const visibleProjects = currentUser ? projects.filter((p) => canAccessProject(currentUser, p)) : [];
  const effectiveProjectId = visibleProjects.find((p) => p.id === activeProjectId) ? activeProjectId : (visibleProjects[0] && visibleProjects[0].id);
  const activeProject = projects.find((p) => p.id === effectiveProjectId) || null;

  if (!currentUser) {
    return <LoginGate users={users} onSelect={attemptLogin} loginError={loginError} />;
  }

  if (!activeProject) {
    return <NoAccessScreen user={currentUser} onLogout={() => setCurrentUserId(null)} />;
  }

  const pid = activeProject.id;

  function addLog(action) {
    mutateProject(pid, (p) => p, action);
  }

  function updateActivity(id, patch, logMsg) {
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), logMsg);
  }

  function addActivity() {
    const activities = activeProject.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = activeProject.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = { id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '', responsible: activeProject.team[0] || 'PRICETAX', date: '', endDate: '', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [], comments: [], transcript: '' };
    mutateProject(pid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade criada: "${na.title}"`);
  }

  function deleteActivity(id) {
    const a = activeProject.activities.find((x) => x.id === id);
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.filter((x) => x.id !== id) }), a ? `Atividade removida: "${a.title}"` : undefined);
  }

  function addSub(actId) {
    const act = activeProject.activities.find((a) => a.id === actId);
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: [...(a.subactivities || []), { id: uid('s'), title: 'Nova subatividade', done: false }] }) }), act ? `Subatividade adicionada em "${act.title}"` : undefined);
    setExpanded((e) => ({ ...e, [actId]: true }));
  }

  function updateSub(actId, subId, patch) {
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).map((s) => s.id === subId ? { ...s, ...patch } : s) }) }));
  }

  function deleteSub(actId, subId) {
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, subactivities: (a.subactivities || []).filter((s) => s.id !== subId) }) }));
  }

  function addAttachment(actId, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const att = { id: uid('att'), name: file.name, size: file.size, dataUrl: reader.result };
      const act = activeProject.activities.find((a) => a.id === actId);
      mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: [...(a.attachments || []), att] }) }), `Anexo adicionado em "${act ? act.title : ''}": ${file.name}`);
    };
    reader.readAsDataURL(file);
  }

  function removeAttachment(actId, attId) {
    const act = activeProject.activities.find((a) => a.id === actId);
    const att = act && (act.attachments || []).find((x) => x.id === attId);
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: (a.attachments || []).filter((x) => x.id !== attId) }) }), att ? `Anexo removido em "${act.title}": ${att.name}` : undefined);
  }

  function addComment(actId, text) {
    const v = (text || '').trim();
    if (!v) return;
    const c = { id: uid('cm'), text: v, ts: new Date().toISOString() };
    const act = activeProject.activities.find((a) => a.id === actId);
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: [...(a.comments || []), c] }) }), `Comentário adicionado em "${act ? act.title : ''}"`);
  }

  function removeComment(actId, commentId) {
    mutateProject(pid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }) }));
  }

  function addMember() {
    const v = newMember.trim();
    if (!v || activeProject.team.includes(v)) return;
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
    const row = (activeProject.company.areas || []).find((r) => r.id === id);
    if (!row) return;
    addLog(`Área cadastrada: ${row.area || '(sem nome)'} — ${row.name || 'sem responsável'}${row.email ? ` <${row.email}>` : ''}`);
    if (row.name && !activeProject.team.includes(row.name)) {
      mutateProject(pid, (p) => ({ ...p, team: [...p.team, row.name] }));
    }
  }

  function removeAreaRow(id) {
    const row = (activeProject.company.areas || []).find((r) => r.id === id);
    mutateProject(pid, (p) => ({ ...p, company: { ...p.company, areas: (p.company.areas || []).filter((r) => r.id !== id) } }), row ? `Área removida: ${row.area || '(sem nome)'}` : undefined);
  }

  function addPhase() {
    const phasesList = activeProject.phases;
    const nextId = phasesList.length ? Math.max(...phasesList.map((p2) => p2.id)) + 1 : 1;
    const color = PHASE_COLORS[phasesList.length % PHASE_COLORS.length];
    const np = { id: nextId, name: 'Nova fase', sub: '', color };
    mutateProject(pid, (p) => ({ ...p, phases: [...p.phases, np] }), `Fase criada: "${np.name}"`);
  }

  function updatePhase(id, patch, logMsg) {
    mutateProject(pid, (p) => ({ ...p, phases: p.phases.map((ph) => (ph.id === id ? { ...ph, ...patch } : ph)) }), logMsg);
  }

  function deletePhase(id) {
    if (activeProject.phases.length <= 1) return;
    const p0 = activeProject.phases.find((x) => x.id === id);
    const fallback = activeProject.phases.find((x) => x.id !== id);
    mutateProject(pid, (p) => ({
      ...p,
      activities: p.activities.map((a) => (a.phase === id ? { ...a, phase: fallback.id } : a)),
      phases: p.phases.filter((x) => x.id !== id),
    }), p0 ? `Fase removida: "${p0.name}" (atividades movidas para "${fallback.name}")` : undefined);
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

  function addProject() {
    const np = blankProject();
    setProjects((prev) => [...prev, np]);
    setActiveProjectId(np.id);
  }

  function addUser() {
    const nu = { id: uid('user'), name: 'Novo usuário', email: '', role: 'cliente', cnpj: '', allowedCnpjs: [], blocked: false, blockReason: '', expiresAt: '' };
    setUsers((prev) => [...prev, nu]);
    addUsersLog(`Usuário criado: ${nu.name}`);
  }

  function updateUser(id, patch) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  function toggleUserBlock(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const nextBlocked = !u.blocked;
    setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, blocked: nextBlocked, blockReason: nextBlocked ? (x.blockReason || 'Bloqueado manualmente') : '' } : x)));
    addUsersLog(nextBlocked ? `Usuário bloqueado: ${u.name}` : `Usuário desbloqueado: ${u.name}`);
  }

  function renewUser(id, days) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const newDate = toISODate(addDays(startOfDay(new Date()), days || 30));
    setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, expiresAt: newDate, blocked: false, blockReason: '' } : x)));
    addUsersLog(`Acesso renovado: ${u.name} até ${fmtDate(newDate)}`);
  }

  function toggleUserCnpj(id, cnpj) {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      const has = (u.allowedCnpjs || []).includes(cnpj);
      return { ...u, allowedCnpjs: has ? u.allowedCnpjs.filter((c) => c !== cnpj) : [...(u.allowedCnpjs || []), cnpj] };
    }));
  }

  function deleteUser(id) {
    if (id === currentUserId) return;
    const target = users.find((u) => u.id === id);
    const masters = users.filter((u) => u.role === 'master');
    if (target && target.role === 'master' && masters.length <= 1) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (target) addUsersLog(`Usuário removido: ${target.name}`);
  }

  function exportExcel() {
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
    addLog('Cronograma exportado para Excel');
  }

  function exportPdf() {
    addLog('Cronograma exportado para PDF');
    window.print();
  }

  const activitiesSorted = activeProject.activities.slice().sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.month - b.month;
  });
  const orderMap = {};
  activitiesSorted.forEach((a, i) => { orderMap[a.id] = i + 1; });

  const registeredProjects = projects.filter((p) => p.company.cnpj);

  return (
    <div style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], select, textarea {
          background:#1c1c1c; border:1px solid #333; color:#eee; border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, select:focus, textarea:focus {
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
          {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoImg} /> : <div style={S.logoPlaceholder}><Building2 size={18} color="#F5C400" /></div>}
          <div>
            {visibleProjects.length > 1 ? (
              <select value={activeProject.id} onChange={(e) => setActiveProjectId(e.target.value)} style={S.projectSwitch}>
                {visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.company.name || 'Cliente sem nome'}{p.company.cnpj ? ` — ${p.company.cnpj}` : ''}</option>)}
              </select>
            ) : (
              <div style={S.brandName}>{activeProject.company.name || 'Cliente não cadastrado'}</div>
            )}
            <div style={S.brandCnpj}>{activeProject.company.cnpj ? `CNPJ ${activeProject.company.cnpj}` : 'CNPJ não informado'}</div>
          </div>
          <button style={S.iconBtn} onClick={() => setShowSettings(true)}><Settings size={15} /> Empresa</button>
        </div>
        <div style={S.actionsRow}>
          {currentUser.role === 'master' && <button style={S.iconBtn} onClick={addProject}><Plus size={15} /> Novo projeto</button>}
          {currentUser.role === 'master' && <button style={S.iconBtn} onClick={() => setShowUsers(true)}><UserCog size={15} /> Usuários</button>}
          <button style={S.iconBtn} onClick={() => setShowPhases(true)}><LayoutGrid size={15} /> Fases</button>
          <button style={S.iconBtn} onClick={() => setShowLog(true)}><Clock size={15} /> Log ({(activeProject.log || []).length})</button>
          <button style={S.iconBtn} onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
          <button style={S.iconBtn} onClick={exportPdf}><FileText size={15} /> PDF</button>
          <button style={S.primaryBtn} onClick={addActivity}><Plus size={15} /> Nova atividade</button>
          <div style={S.userBadge}>
            <span style={{ ...S.roleTag, color: ROLE_META[currentUser.role].color, borderColor: ROLE_META[currentUser.role].color }}>{ROLE_META[currentUser.role].label}</span>
            <span style={S.userName}>{currentUser.name}</span>
            <button style={S.iconBtnGhost} title="Sair" onClick={() => setCurrentUserId(null)}><LogOut size={15} /></button>
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
        {view === 'timeline' && (
          <TimelineView
            activities={activitiesSorted}
            phases={activeProject.phases}
            granularity={granularity}
            setGranularity={setGranularity}
            windowAnchor={windowAnchor}
            setWindowAnchor={setWindowAnchor}
          />
        )}
        {view === 'table' && (
          <TableView
            activities={activitiesSorted}
            orderMap={orderMap}
            phases={activeProject.phases}
            team={activeProject.team}
            expanded={expanded}
            setExpanded={setExpanded}
            updateActivity={updateActivity}
            deleteActivity={deleteActivity}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={setOpenActivityId}
          />
        )}
        {view === 'phases' && <PhasesView activities={activitiesSorted} orderMap={orderMap} phases={activeProject.phases} updateActivity={updateActivity} openDetail={setOpenActivityId} />}
        {view === 'kanban' && (
          <KanbanView
            activities={activitiesSorted}
            orderMap={orderMap}
            phases={activeProject.phases}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            addActivity={addActivity}
            openDetail={setOpenActivityId}
          />
        )}
      </main>

      <div className="no-print" style={S.hint}>Alterações são salvas automaticamente e registradas no log. Você está vendo o projeto de {activeProject.company.name || 'um cliente sem nome cadastrado'}.</div>

      {showLog && (
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

      {showSettings && (
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
            <div style={S.settingsLabel}>Nome da empresa</div>
            <input type="text" value={activeProject.company.name} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, name: v } })); }} onBlur={() => addLog(`Nome da empresa atualizado: ${activeProject.company.name}`)} placeholder="Razão social" />
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>CNPJ</div>
            <input type="text" value={activeProject.company.cnpj} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, cnpj: v } })); }} onBlur={() => addLog(`CNPJ atualizado: ${activeProject.company.cnpj}`)} placeholder="00.000.000/0000-00" />
            <div style={S.fieldHint}>Alterar o CNPJ não atualiza sozinho quem já tem acesso — ajuste em "Usuários" se precisar.</div>
          </div>

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

      {showPhases && (
        <SidePanel title="Fases do projeto" onClose={() => setShowPhases(false)}>
          <div style={S.emptyMuted}>As fases agrupam as atividades nas visões Gantt, Fases e no Quadro. Cada uma tem nome, cor e uma linha de descrição.</div>
          <div style={{ marginTop: 16 }}>
            {activeProject.phases.map((p) => (
              <div key={p.id} style={S.phaseEditRow}>
                <input type="color" value={p.color} onChange={(e) => updatePhase(p.id, { color: e.target.value }, `Cor da fase "${p.name}" alterada`)} style={S.colorInput} />
                <div style={{ flex: 1 }}>
                  <input type="text" value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} onBlur={() => addLog(`Fase renomeada: "${p.name}"`)} placeholder="Nome da fase" />
                  <input type="text" value={p.sub} onChange={(e) => updatePhase(p.id, { sub: e.target.value })} onBlur={() => addLog(`Descrição da fase "${p.name}" alterada`)} placeholder="Descrição curta" style={{ marginTop: 6, opacity: .85 }} />
                </div>
                <button style={S.iconBtnGhost} onClick={() => deletePhase(p.id)} disabled={activeProject.phases.length <= 1} title={activeProject.phases.length <= 1 ? 'Deixe pelo menos uma fase' : 'Excluir fase'}>
                  <Trash2 size={14} color={activeProject.phases.length <= 1 ? '#444' : '#888'} />
                </button>
              </div>
            ))}
          </div>
          <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addPhase}><Plus size={14} /> Nova fase</button>
        </SidePanel>
      )}

      {showUsers && currentUser.role === 'master' && (
        <SidePanel title="Usuários e permissões" onClose={() => setShowUsers(false)}>
          <div style={S.emptyMuted}>Master vê tudo. PRICETAX vê só os clientes marcados abaixo. Cliente vê só o projeto do CNPJ vinculado a ele.</div>
          <div style={{ marginTop: 16 }}>
            {users.map((u) => (
              <div key={u.id} style={S.userEditCard}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={u.name} onChange={(e) => updateUser(u.id, { name: e.target.value })} placeholder="Nome" />
                  <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })} style={{ width: 150, flexShrink: 0 }}>
                    <option value="master">Master</option>
                    <option value="pricetax">PRICETAX</option>
                    <option value="cliente">Cliente</option>
                  </select>
                </div>
                <input type="email" value={u.email} onChange={(e) => updateUser(u.id, { email: e.target.value })} placeholder="email@pricetax.com.br" style={{ marginTop: 6 }} />

                {u.role === 'cliente' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={S.fieldHint}>CNPJ do cliente que este usuário enxerga</div>
                    <select value={u.cnpj} onChange={(e) => updateUser(u.id, { cnpj: e.target.value })}>
                      <option value="">— selecione o CNPJ —</option>
                      {registeredProjects.map((p) => <option key={p.id} value={p.company.cnpj}>{p.company.name || 'Sem nome'} — {p.company.cnpj}</option>)}
                    </select>
                  </div>
                )}

                {u.role === 'pricetax' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={S.fieldHint}>Clientes liberados para este usuário</div>
                    {registeredProjects.length === 0 && <div style={S.emptyMuted}>Nenhum cliente com CNPJ cadastrado ainda.</div>}
                    <div style={S.cnpjCheckList}>
                      {registeredProjects.map((p) => (
                        <label key={p.id} style={S.cnpjCheckRow}>
                          <input type="checkbox" checked={(u.allowedCnpjs || []).includes(p.company.cnpj)} onChange={() => toggleUserCnpj(u.id, p.company.cnpj)} />
                          {p.company.name || 'Sem nome'} <span style={{ opacity: .6 }}>— {p.company.cnpj}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {u.role === 'master' && <div style={{ ...S.fieldHint, marginTop: 8 }}>Vê todos os projetos, sem precisar liberar nada.</div>}

                <div style={S.accessBlock}>
                  <div style={S.settingsLabel}>Acesso</div>
                  <label style={S.cnpjCheckRow}>
                    <input type="checkbox" checked={!!u.blocked} onChange={() => toggleUserBlock(u.id)} disabled={u.id === currentUserId} />
                    Bloqueado
                  </label>
                  {u.blocked && (
                    <input type="text" value={u.blockReason || ''} onChange={(e) => updateUser(u.id, { blockReason: e.target.value })} placeholder="Motivo do bloqueio" style={{ marginTop: 6 }} />
                  )}
                  <div style={{ marginTop: 8 }}>
                    <div style={S.fieldHint}>Expira em (opcional — em branco nunca expira)</div>
                    <input type="date" value={u.expiresAt || ''} onChange={(e) => updateUser(u.id, { expiresAt: e.target.value })} />
                  </div>
                  {isExpiredNotYetFlagged(u) && (
                    <div style={S.expireWarning}>
                      <strong>Validade vencida em {fmtDate(u.expiresAt)}.</strong> Este usuário vai ser bloqueado sozinho na próxima tentativa de entrar.
                      <button style={S.renewBtn} onClick={() => renewUser(u.id, 30)}>Renovar por +30 dias</button>
                    </div>
                  )}
                </div>

                <button style={{ ...S.iconBtnGhost, marginTop: 8 }} onClick={() => deleteUser(u.id)} disabled={u.id === currentUserId}>
                  <Trash2 size={13} color={u.id === currentUserId ? '#444' : '#888'} /> {u.id === currentUserId ? ' (é você)' : ' Remover usuário'}
                </button>
              </div>
            ))}
          </div>
          <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addUser}><Plus size={14} /> Novo usuário</button>

          <div style={{ ...S.settingsBlock, marginTop: 28, paddingTop: 16, borderTop: '1px solid #262626' }}>
            <div style={S.settingsLabel}>Histórico de usuários</div>
            {usersLog.length === 0 && <div style={S.emptyMuted}>Nenhuma ação registrada ainda.</div>}
            {usersLog.map((l, i) => (
              <div key={i} style={S.logRow}>
                <div style={S.logTs}>{fmtTs(l.ts)}</div>
                <div style={S.logAction}>{l.action}</div>
              </div>
            ))}
          </div>
        </SidePanel>
      )}

      {openActivityId && activeProject.activities.find((a) => a.id === openActivityId) && (
        <ActivityDetailModal
          activity={activeProject.activities.find((a) => a.id === openActivityId)}
          orderMap={orderMap}
          phases={activeProject.phases}
          team={activeProject.team}
          onClose={() => setOpenActivityId(null)}
          updateActivity={updateActivity}
          deleteActivity={(id) => { deleteActivity(id); setOpenActivityId(null); }}
          addSub={addSub}
          updateSub={updateSub}
          deleteSub={deleteSub}
          addAttachment={addAttachment}
          removeAttachment={removeAttachment}
          addComment={addComment}
          removeComment={removeComment}
        />
      )}
    </div>
  );
}

function LoginGate({ users, onSelect, loginError }) {
  return (
    <div style={S.page}>
      <style>{`* { box-sizing: border-box; } input, select, textarea, button { font-family: 'Inter', sans-serif; }`}</style>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <div style={S.loginEyebrow}>PRICETAX · Cronograma de Reforma Tributária</div>
          <h1 style={S.loginTitle}>Entrar como</h1>
          <p style={S.loginSub}>Escolha o usuário para simular o acesso. Isto separa o que cada papel vê — não é um login protegido por senha.</p>
          {loginError && (
            <div style={S.loginBlockedMsg}>{loginError.message}</div>
          )}
          <div style={S.loginList}>
            {users.map((u) => (
              <button key={u.id} style={S.loginCard} onClick={() => onSelect(u.id)}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ ...S.roleTag, color: ROLE_META[u.role].color, borderColor: ROLE_META[u.role].color }}>{ROLE_META[u.role].label}</span>
                  {u.blocked && <span style={S.loginBlockedTag}>Bloqueado</span>}
                </div>
                <div style={S.loginName}>{u.name}</div>
                <div style={S.loginMeta}>
                  {u.role === 'cliente' && (u.cnpj ? `CNPJ ${u.cnpj}` : 'CNPJ não vinculado ainda')}
                  {u.role === 'pricetax' && `${(u.allowedCnpjs || []).length} cliente(s) liberado(s)`}
                  {u.role === 'master' && 'Acesso a todos os projetos'}
                  {u.expiresAt && !u.blocked && ` · válido até ${fmtDate(u.expiresAt)}`}
                </div>
              </button>
            ))}
          </div>
        </div>
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

function ActivityDetailModal({ activity: a, orderMap, phases, team, onClose, updateActivity, deleteActivity, addSub, updateSub, deleteSub, addAttachment, removeAttachment, addComment, removeComment }) {
  const [commentDraft, setCommentDraft] = useState('');
  const phase = phases.find((p) => p.id === a.phase);

  function submitComment() {
    if (!commentDraft.trim()) return;
    addComment(a.id, commentDraft);
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
          onChange={(e) => updateActivity(a.id, { title: e.target.value })}
          onBlur={() => updateActivity(a.id, {}, `Título alterado: "${a.title}"`)}
          style={S.detailTitleInput}
        />

        <div style={S.detailGrid}>
          <div style={S.detailMain}>
            <div style={S.subSectionLabel}>Descrição</div>
            <textarea value={a.desc} onChange={(e) => updateActivity(a.id, { desc: e.target.value })} onBlur={() => updateActivity(a.id, {}, `Descrição alterada em "${a.title}"`)} rows={2} style={S.notesArea} />

            <div style={S.subSectionLabel}>Observações</div>
            <textarea value={a.notes || ''} onChange={(e) => updateActivity(a.id, { notes: e.target.value })} onBlur={() => updateActivity(a.id, {}, `Observação alterada em "${a.title}"`)} rows={3} placeholder="Comentários, contexto, decisões desta atividade..." style={S.notesArea} />

            <div style={S.subSectionLabel}><Mic size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Transcrição de reunião</div>
            <textarea
              value={a.transcript || ''}
              onChange={(e) => updateActivity(a.id, { transcript: e.target.value })}
              onBlur={() => updateActivity(a.id, {}, `Transcrição de reunião atualizada em "${a.title}"`)}
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
                    <button style={S.commentDel} onClick={() => removeComment(a.id, c.id)}><X size={11} /></button>
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
            <select value={a.phase} onChange={(e) => { const id = Number(e.target.value); updateActivity(a.id, { phase: id }, `Fase alterada em "${a.title}": ${phases.find((p) => p.id === id)?.name}`); }}>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div style={S.subSectionLabel}>Responsável</div>
            <select value={a.responsible} onChange={(e) => updateActivity(a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)}>
              {team.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <div style={S.subSectionLabel}>Início</div>
            <input type="date" value={a.date} onChange={(e) => { const v = e.target.value; const patch = { date: v }; if (!a.endDate || a.endDate < v) patch.endDate = v; updateActivity(a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`); }} />

            <div style={S.subSectionLabel}>Fim</div>
            <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} /> Obrigatória
            </div>

            <div style={S.subSectionLabel}>Status</div>
            <select value={a.status} onChange={(e) => updateActivity(a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ color: STATUS_META[a.status].color }}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>

            <div style={S.subSectionLabel}>Subatividades</div>
            {(a.subactivities || []).map((s) => (
              <div key={s.id} style={S.subRow}>
                <input type="checkbox" checked={s.done} onChange={(e) => updateSub(a.id, s.id, { done: e.target.checked })} />
                <input type="text" value={s.title} onChange={(e) => updateSub(a.id, s.id, { title: e.target.value })} style={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                <button style={S.iconBtnGhost} onClick={() => deleteSub(a.id, s.id)}><X size={13} /></button>
              </div>
            ))}
            <button style={S.addSubBtn} onClick={() => addSub(a.id)}><Plus size={12} /> Subatividade</button>

            <div style={S.subSectionLabel}>Anexos {(a.attachments || []).length > 0 ? `(${(a.attachments || []).length})` : ''}</div>
            <div style={S.attachList}>
              {(a.attachments || []).map((att) => (
                <div key={att.id} style={S.attachRow}>
                  <a href={att.dataUrl} download={att.name} style={S.attachLink}>{att.name}</a>
                  <span style={S.attachSize}>{att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
                  <button style={S.iconBtnGhost} onClick={() => removeAttachment(a.id, att.id)}><X size={12} /></button>
                </div>
              ))}
            </div>
            <label htmlFor={`file-detail-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
            <input id={`file-detail-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />

            <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c', borderColor: '#4a2422' }} onClick={() => deleteActivity(a.id)}><Trash2 size={14} /> Excluir atividade</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableView({ activities, orderMap, phases, team, expanded, setExpanded, updateActivity, deleteActivity, addSub, updateSub, deleteSub, addAttachment, removeAttachment, openDetail }) {
  return (
    <div style={S.tableWrap}>
      <div style={S.tableHeaderRow}>
        <div style={{ ...S.th, width: 68 }}></div>
        <div style={{ ...S.th, width: 46 }}>Ordem</div>
        <div style={{ ...S.th, flex: 2 }}>Atividade</div>
        <div style={{ ...S.th, width: 140 }}>Fase</div>
        <div style={{ ...S.th, width: 130 }}>Responsável</div>
        <div style={{ ...S.th, width: 105 }}>Início</div>
        <div style={{ ...S.th, width: 105 }}>Fim</div>
        <div style={{ ...S.th, width: 70, textAlign: 'center' }}>Obrig.</div>
        <div style={{ ...S.th, width: 150 }}>Status</div>
        <div style={{ ...S.th, width: 40 }}></div>
      </div>

      {activities.map((a) => {
        const isOpen = !!expanded[a.id];
        const doneSubs = (a.subactivities || []).filter((s) => s.done).length;
        return (
          <div key={a.id} style={S.tableGroup}>
            <div style={S.tableRow}>
              <button style={S.expandBtn} onClick={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
              </button>
              <button style={S.expandBtn} title="Abrir em tela cheia" onClick={() => openDetail(a.id)}>
                <Maximize2 size={13} />
              </button>
              <div style={{ width: 46 }}><span style={S.monthBadgeSm}>#{orderMap[a.id]}</span></div>
              <div style={{ flex: 2, minWidth: 0 }}>
                <input type="text" value={a.title} onChange={(e) => updateActivity(a.id, { title: e.target.value })} onBlur={() => updateActivity(a.id, {}, `Título alterado: "${a.title}"`)} />
                <input type="text" value={a.desc} onChange={(e) => updateActivity(a.id, { desc: e.target.value })} onBlur={() => updateActivity(a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 4, opacity: .8 }} />
                {(a.subactivities || []).length > 0 && <div style={S.subCounter}>{doneSubs}/{(a.subactivities || []).length} subatividades concluídas</div>}
              </div>
              <div style={{ width: 140 }}>
                <select
                  value={a.phase}
                  onChange={(e) => {
                    const newPhaseId = Number(e.target.value);
                    const phaseName = phases.find((p) => p.id === newPhaseId)?.name || '';
                    updateActivity(a.id, { phase: newPhaseId }, `Fase alterada em "${a.title}": ${phaseName}`);
                  }}
                  style={{ color: phases.find((p) => p.id === a.phase)?.color }}
                >
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ width: 130 }}>
                <select value={a.responsible} onChange={(e) => updateActivity(a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)}>
                  {team.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: 105 }}>
                <input type="date" value={a.date} onChange={(e) => {
                  const v = e.target.value;
                  const patch = { date: v };
                  if (!a.endDate || a.endDate < v) patch.endDate = v;
                  updateActivity(a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                }} />
              </div>
              <div style={{ width: 105 }}>
                <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
              </div>
              <div style={{ width: 70, textAlign: 'center' }}>
                <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} />
              </div>
              <div style={{ width: 150 }}>
                <select value={a.status} onChange={(e) => updateActivity(a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ color: STATUS_META[a.status].color }}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div style={{ width: 40 }}>
                <button style={S.iconBtnGhost} onClick={() => deleteActivity(a.id)}><Trash2 size={14} /></button>
              </div>
            </div>

            {isOpen && (
              <div style={S.subPanel}>
                {(a.subactivities || []).map((s) => (
                  <div key={s.id} style={S.subRow}>
                    <input type="checkbox" checked={s.done} onChange={(e) => updateSub(a.id, s.id, { done: e.target.checked })} />
                    <input type="text" value={s.title} onChange={(e) => updateSub(a.id, s.id, { title: e.target.value })} style={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                    <button style={S.iconBtnGhost} onClick={() => deleteSub(a.id, s.id)}><X size={13} /></button>
                  </div>
                ))}
                <button style={S.addSubBtn} onClick={() => addSub(a.id)}><Plus size={12} /> Subatividade</button>

                <div style={S.subSectionLabel}>Observações</div>
                <textarea
                  value={a.notes || ''}
                  onChange={(e) => updateActivity(a.id, { notes: e.target.value })}
                  onBlur={() => updateActivity(a.id, {}, `Observação alterada em "${a.title}"`)}
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
                      <button style={S.iconBtnGhost} onClick={() => removeAttachment(a.id, att.id)}><X size={12} /></button>
                    </div>
                  ))}
                </div>
                <label htmlFor={`file-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
                <input id={`file-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhasesView({ activities, orderMap, phases, updateActivity, openDetail }) {
  function cycleStatus(a) {
    const idx = STATUS_ORDER.indexOf(a.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateActivity(a.id, { status: next }, `Status alterado em "${a.title}": ${STATUS_META[next].label}`);
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
          {activities.filter((a) => a.phase === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((a) => (
            <div key={a.id} style={{ ...S.phaseRow, cursor: 'pointer' }} onClick={() => openDetail(a.id)}>
              <div style={{ ...S.monthBadge, background: p.color }}>#{orderMap[a.id]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.phaseActTitle}>{a.title}{a.required && <span style={S.reqDot} title="Obrigatória" />}</div>
                <div style={S.phaseActDesc}>{a.desc}</div>
              </div>
              <div style={S.phaseOwner}>{a.responsible}</div>
              <div style={S.phaseDate}>{fmtDate(a.date)}{a.endDate && a.endDate !== a.date ? ` – ${fmtDate(a.endDate)}` : ''}</div>
              <StatusPill status={a.status} onClick={(e) => { e.stopPropagation(); cycleStatus(a); }} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function KanbanView({ activities, orderMap, phases, dragId, setDragId, updateActivity, addActivity, openDetail }) {
  function onDrop(status) {
    if (!dragId) return;
    const a = activities.find((x) => x.id === dragId);
    if (a && a.status !== status) {
      updateActivity(dragId, { status }, `Status alterado em "${a.title}": ${STATUS_META[status].label}`);
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
              const phase = phases.find((p) => p.id === a.phase);
              return (
                <div key={a.id} draggable onDragStart={() => setDragId(a.id)} onClick={() => openDetail(a.id)} style={S.kanbanCard}>
                  <div style={S.kanbanCardTop}>
                    <span style={{ ...S.monthBadgeSm, background: phase?.color }}>#{orderMap[a.id]}</span>
                    <GripVertical size={13} color="#555" />
                  </div>
                  <div style={S.kanbanCardTitle}>{a.title}</div>
                  <div style={S.kanbanCardMeta}>
                    <span>{a.responsible}</span>
                    <span>{fmtDate(a.date)}</span>
                  </div>
                </div>
              );
            })}
            {status === 'nao-iniciado' && (
              <button style={S.kanbanAdd} onClick={addActivity}><Plus size={13} /> Nova atividade</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({ activities, phases, granularity, setGranularity, windowAnchor, setWindowAnchor }) {
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
                  <div style={{ ...S.ganttBar, background: STATUS_META[row.act.status].bg, borderColor: row.phase.color }}>
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
  roleTag: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid', borderRadius: 999, padding: '3px 8px' },
  userName: { fontSize: 12.5, fontWeight: 600, color: '#ddd' },

  // login
  loginWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginBox: { width: 'min(520px, 100%)' },
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
};
