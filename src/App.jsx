import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Upload, Clock, LayoutGrid, Columns3, Building2, X, FileSpreadsheet, FileText, Settings, GripVertical, CalendarDays, List, Mic, LogOut, UserCog, Sun, Moon, Undo2, Bell, MoreHorizontal, ListChecks, Globe, Pause, Bug, Gauge, Home, Sparkles, Briefcase, FolderOpen } from 'lucide-react';

import { loadXlsx } from './lib/xlsxLoader.js';
import { lazyRetry } from './lib/lazyRetry.jsx';



import { apiGet, apiPost, apiPatch, apiDelete } from './lib/api.js';

import { buildActivityOptions, taskCountsByActivity, applySuggestionsToMeetings, NO_ACTIVITY } from './meetings/ActivityLink.jsx';


import DailyCards from './daily/DailyCards.jsx';

import { useWelcomeSetup } from './daily/useWelcomeSetup.jsx';
import pricetaxLogoBranco from './assets/brand/pricetax-logo-branco.png';
import pricetaxLogoPreto from './assets/brand/pricetax-logo-preto.png';
import { MeetingsView, todoStatusMeta } from './meetings/Meetings.jsx';
import { MeetingDetailModal, MeetingPrintReport, PublicMeetingScreen } from './meetings/MeetingDetail.jsx';
import { ProjectAssistant } from './assistant/ProjectAssistant.jsx';
import RenataHome from './assistant/RenataHome.jsx';
import RenataAgendaBriefing from './agenda/RenataAgendaBriefing.jsx';


import { readFileAsAttachment } from './ui/ComposeBox.jsx';
import ModuleShell from './shell/ModuleShell.jsx';
import { DialogOverlay } from './ui/dialog.jsx';
import { DialogHost, notify, askConfirm, pushToastCompat, dismissToast as dismissToastGlobal } from './ui/dialogs.jsx';
import { useHistoryValue, readHistoryValue, withoutLayer } from './lib/nav.js';

import { loadNotifPrefs, resetNotifPrefs, useNotifPrefs, visibleNotifications, requestNotifSettings, hiddenTodaySources } from './lib/notifPrefs.js';
import NotificationPrefs from './shell/NotificationPrefs.jsx';


import { pathForTag, modeForPath, modeForTag, pathForMode, canOpenMode } from './lib/routes.js';
import { setRecentsUser, recordRecent, getRecents, loadLastWorkspace, saveLastWorkspace } from './lib/recents.js';
import TodayPanel from './today/TodayPanel.jsx';
import WeekSummary from './today/WeekSummary.jsx';
import ContinueStrip from './today/ContinueStrip.jsx';
import { buildTodayItems, addDaysIso } from './today/todayItems.js';

import SafeBoundary from './ui/SafeBoundary.jsx';


import { setCardStatusInBoard, setCardDueDateInBoard, findCard } from './today/boardActions.js';
// CRM (2026-09-20, PROJECT_CONTEXT.md §54): módulo grande e opcional — carregado só quando alguém abre o CRM.
const CrmScreen = lazyRetry(() => import('./crm/CrmScreen.jsx'));
// Code-splitting (2026-10-16): módulos inteiros e o editor de texto saem do pacote principal e só são baixados quando usados.
const XFlowScreen = lazyRetry(() => import('./xflow/XFlow.jsx'));
const AgendaScreen = lazyRetry(() => import('./agenda/Agenda.jsx'));
const MacroOverviewScreen = lazyRetry(() => import('./macro/MacroOverview.jsx'));
const KnowledgeCenterScreen = lazyRetry(() => import('./knowledge/KnowledgeCenter.jsx'));
const PareceresScreen = lazyRetry(() => import('./pareceres/Pareceres.jsx'));
const ModelosScreen = lazyRetry(() => import('./modelos/Modelos.jsx'));
const TodoBoardView = lazyRetry(() => import('./meetings/TodoBoard.jsx').then((m) => ({ default: m.TodoBoardView })));
// Telas pesadas movidas para src/screens/ (2026-10-16): só baixam quando alguém abre a tela correspondente.
const UsersManagementScreen = lazyRetry(() => import('./screens/AdminScreens.jsx').then((m) => ({ default: m.UsersManagementScreen })));
const SuperAdminScreen = lazyRetry(() => import('./screens/AdminScreens.jsx').then((m) => ({ default: m.SuperAdminScreen })));
const CompanySelectorScreen = lazyRetry(() => import('./screens/AdminScreens.jsx').then((m) => ({ default: m.CompanySelectorScreen })));
const MyProfileModal = lazyRetry(() => import('./screens/AdminScreens.jsx').then((m) => ({ default: m.MyProfileModal })));
const PersonalBoardScreen = lazyRetry(() => import('./screens/PersonalBoard.jsx').then((m) => ({ default: m.PersonalBoardScreen })));
const PublicBoardScreen = lazyRetry(() => import('./screens/PersonalBoard.jsx').then((m) => ({ default: m.PublicBoardScreen })));
const TableView = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.TableView })));
const PhasesView = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.PhasesView })));
const KanbanView = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.KanbanView })));
const TimelineView = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.TimelineView })));
const ResumoView = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.ResumoView })));
const ActivityDetailModal = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.ActivityDetailModal })));
const PrintReport = lazyRetry(() => import('./screens/CompanyViews.jsx').then((m) => ({ default: m.PrintReport })));

const LOCAL_PREFS_KEY = 'pricetax-cronograma-prefs-v1';
const THEME_KEY = 'pricetax-cronograma-theme';

export function BrandLogo({ theme, style }) {
  return <img src={theme === 'light' ? pricetaxLogoPreto : pricetaxLogoBranco} alt="PriceTax" style={style} />;
}

export function ThemeToggleBtn({ theme, onToggle, style }) {
  return (
    <button style={style || S.iconBtnGhost} title={theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'} onClick={onToggle}>
      {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

export const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#e2574c', '#b98af5', '#ff9f40'];

export const ROLE_META = {
  master: { label: 'PRICETAX Master', color: '#F5C400' },
  pricetax: { label: 'PRICETAX', color: '#3ea6ff' },
  cliente: { label: 'Cliente', color: '#3ecf6e' },
};


export const STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: 'var(--text-4)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  'em-andamento': { label: 'Em andamento', color: '#F5C400', bg: 'rgba(245,196,0,.14)', border: 'rgba(245,196,0,.5)' },
  'pausado': { label: 'Pausado', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  'concluido': { label: 'Concluído', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
};
export const STATUS_ORDER = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
export const COMPANY_STATUS_META = {
  ativo: { label: 'Ativo', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
  pausado: { label: 'Pausado', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
};
export const CLIENT_TYPE_META = {
  diagnostico: { label: 'Diagnóstico', short: 'Diagnóstico', color: '#3ea6ff', bg: 'rgba(62,166,255,.14)', border: 'rgba(62,166,255,.5)' },
  'diagnostico-consultoria': { label: 'Diagnóstico e Consultoria Contínua', short: 'Consultoria Contínua', color: '#9b7af5', bg: 'rgba(155,122,245,.14)', border: 'rgba(155,122,245,.5)' },
  'poc-demo': { label: 'POC / Demonstração', short: 'POC/Demo', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
};
export const CLIENT_TYPE_ORDER = ['diagnostico', 'diagnostico-consultoria', 'poc-demo'];
const DELETE_CONFIRM_PHRASE = 'Excluir';
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const PRIORITY_META = {
  alta: { label: 'Alta', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  media: { label: 'Média', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  baixa: { label: 'Baixa', color: 'var(--text-5)', bg: 'var(--border-1)', border: 'var(--border-3)' },
};
export const PRIORITY_ORDER = ['alta', 'media', 'baixa'];


export const CARD_STATUS_META = {
  'nao-iniciada': { label: 'Não iniciada', color: 'var(--text-5)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  'em-andamento': { label: 'Em andamento', color: '#3ea6ff', bg: 'rgba(62,166,255,.16)', border: 'rgba(62,166,255,.5)' },
  pausada: { label: 'Pausada', color: '#ff9f40', bg: 'rgba(255,159,64,.16)', border: 'rgba(255,159,64,.5)' },
  concluida: { label: 'Concluída', color: '#3ecf6e', bg: 'rgba(62,207,110,.16)', border: 'rgba(62,207,110,.5)' },
};

export const COLUMN_COLOR_META = {
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


function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


export function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
export function genShareToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36); }

export function todayISOStr() { return toISODate(startOfDay(new Date())); }

// Breakpoints únicos do app — não crie outros. MOBILE_BP = celular (layout empilhado/cards).
// TABLET_BP = ponto em que sidebars/painéis fixos deixam de caber confortavelmente ao lado do conteúdo.
const MOBILE_BP = 768;

export function useMediaQuery(query) {
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

export function useIsMobile() { return useMediaQuery(`(max-width: ${MOBILE_BP - 1}px)`); }

// Guarda de "alterações não salvas" — padrão único reusado em todo modal de
// formulário-rascunho (useDirtyForm) e em todo modal autosave-por-campo
// (useAutosaveTimestamp), pra nunca fechar e perder informação em silêncio.
// currentValue precisa ser algo serializável (objeto/string) — comparado por
// JSON.stringify contra o snapshot do primeiro render.
export function useDirtyForm(currentValue) {
  const initialRef = useRef(currentValue);
  const isDirty = JSON.stringify(currentValue) !== JSON.stringify(initialRef.current);
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e) { e.preventDefault(); e.returnValue = ''; }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
  return isDirty;
}

// Campo de texto com autosave DEBOUNCED, não por tecla (2026-09-17, bug
// real relatado pelo Rafael: "escrevo 3-4 letras e o texto é apagado por
// um fantasma"). Causa raiz: nos modais de autosave-por-campo, CADA tecla
// disparava a função de update do pai, que sobe até o estado no topo do
// componente App inteiro (~9000 linhas, sem memoização) e refaz o render
// da árvore inteira (inclusive a tabela por baixo do modal) — em projetos
// com mais atividades isso trava visivelmente a digitação: o valor real já
// está correto por baixo (confirmado lendo o DOM direto), mas a TELA demora
// a repintar, dando a impressão de que a letra digitada sumiu.
//
// Aqui o campo fica 100% local (responsivo, sem NENHUM custo do re-render
// pesado do app) e só propaga o valor pro resto do sistema (e daí pro
// autosave de verdade) `delayMs` depois da última tecla — a MESMA
// sensação de "salva sozinho" pro usuário, sem travar a digitação.
// `externalValue` (ex.: `a.title`) ainda resincroniza o campo quando muda
// por outro motivo que não foi o nosso próprio commit (ex.: sincronização
// de atividade de grupo, ou outra pessoa editando ao mesmo tempo).
export function useDebouncedField(externalValue, commit, delayMs = 300) {
  const [draft, setDraft] = useState(externalValue);
  const lastCommittedRef = useRef(externalValue);
  const timerRef = useRef(null);
  useEffect(() => {
    if (externalValue !== lastCommittedRef.current) {
      lastCommittedRef.current = externalValue;
      setDraft(externalValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalValue]);
  function onChange(v) {
    setDraft(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastCommittedRef.current = v;
      commit(v);
    }, delayMs);
  }
  // Cancela o debounce e commita AGORA (usado no onBlur do campo, e antes
  // de fechar o modal) — nunca deixa uma tecla digitada por último
  // esperando o timer se o usuário já saiu do campo/da tela.
  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (draft !== lastCommittedRef.current) { lastCommittedRef.current = draft; commit(draft); }
  }
  // Cancela o debounce SEM commitar — usado só por "Sair sem salvar", que
  // já reverte o valor de verdade por fora (updateActivity com o valor
  // original), então aqui só precisa parar o timer e voltar o campo local.
  function reset(value) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    lastCommittedRef.current = value;
    setDraft(value);
  }
  return { draft, onChange, flush, reset };
}


// record = a prop vinda do pai (activity/ticket/card) que já muda sozinha
// toda vez que um autosave de campo grava — não precisa instrumentar cada
// handler individual, só observa o resultado.
export function useAutosaveTimestamp(record) {
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const snapRef = useRef(JSON.stringify(record));
  useEffect(() => {
    const snap = JSON.stringify(record);
    if (snap !== snapRef.current) {
      snapRef.current = snap;
      setLastSavedAt(new Date());
    }
  }, [record]);
  return lastSavedAt;
}

export function ConfirmDiscardModal({ onSaveAndExit, onDiscard, onCancel, saving }) {
  return (
    <DialogOverlay style={{ ...S.detailOverlay, zIndex: 200 }} onClose={onCancel} history={false}>
      <div style={{ ...S.detailBox, width: 'min(420px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Você tem alterações não salvas</div>
        <div style={{ ...S.fieldHint, marginTop: 8, fontSize: 12.5 }}>Deseja salvar antes de sair?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          {onSaveAndExit && (
            <button title={saving ? 'Aguarde terminar de salvar' : undefined} style={{ ...S.primaryBtn, justifyContent: 'center' }} onClick={onSaveAndExit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar e sair'}
            </button>
          )}
          <button title={saving ? 'Aguarde terminar de salvar' : undefined} style={{ ...S.iconBtn, justifyContent: 'center' }} onClick={onDiscard} disabled={saving}>Sair sem salvar</button>
          <button style={{ ...S.iconBtnGhost, justifyContent: 'center' }} onClick={onCancel}>Continuar editando</button>
        </div>
      </div>
    </DialogOverlay>
  );
}


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


export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y) return '—';
  return `${d}/${m}/${y}`;
}
export function fmtTs(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}


// Grupo Empresarial: o Master é sua própria raiz de grupo (isGroupMaster=true,
// sem precisar de groupId apontando pra si mesmo); filhas têm company.groupId = id do Master.
function groupRootId(company, ownId) {
  if (!company) return null;
  return company.isGroupMaster ? ownId : (company.groupId || null);
}
export function groupMembers(projects, rootId) {
  if (!rootId) return [];
  return projects.filter((p) => groupRootId(p.company, p.id) === rootId);
}

export function parseDate(iso) { return new Date(iso + 'T00:00:00'); }
export function toISODate(d) { return d.toISOString().slice(0, 10); }
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function calcDeadline(startISO, durationDays) {
  const n = Number(durationDays);
  if (!startISO || !n) return '';
  let d = addDays(parseDate(startISO), n - 1);
  const dow = d.getDay();
  if (dow === 6) d = addDays(d, 2);
  else if (dow === 0) d = addDays(d, 1);
  return toISODate(d);
}
function fmtYearLabel(d) { return String(d.getFullYear()); }


export function sortActivities(list) {
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

// Extraído do .map() de "Áreas e responsáveis" (tela de configurações da
// empresa) pra poder usar useDebouncedField por linha sem violar Rules of
// Hooks — mesmo bug de digitação do PROJECT_CONTEXT.md §45/§46. onCommit
// recebe o valor recém-digitado do campo que perdeu o foco (não lê de volta
// o estado do projeto, que ainda pode não ter propagado o commit debounced).
function AreaRow({ row, onUpdate, onCommit, onRemove }) {
  const areaField = useDebouncedField(row.area, (v) => onUpdate({ area: v }));
  const nameField = useDebouncedField(row.name, (v) => onUpdate({ name: v }));
  const emailField = useDebouncedField(row.email, (v) => onUpdate({ email: v }));
  function flushAndCommit(field, key) {
    field.flush();
    onCommit({ [key]: field.draft });
  }
  return (
    <div style={S.areaRow}>
      <input type="text" value={areaField.draft} onChange={(e) => areaField.onChange(e.target.value)} onBlur={() => flushAndCommit(areaField, 'area')} placeholder="Área (ex: Compras)" style={{ marginBottom: 5 }} />
      <input type="text" value={nameField.draft} onChange={(e) => nameField.onChange(e.target.value)} onBlur={() => flushAndCommit(nameField, 'name')} placeholder="Nome do responsável" style={{ marginBottom: 5 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="email" value={emailField.draft} onChange={(e) => emailField.onChange(e.target.value)} onBlur={() => flushAndCommit(emailField, 'email')} placeholder="email@cliente.com.br" />
        <button aria-label="Remover responsável" title="Remover responsável" style={S.iconBtnGhost} onClick={onRemove}><Trash2 aria-hidden="true" size={13} /></button>
      </div>
    </div>
  );
}

// Extraído do .map() de "Fases" (SidePanel de fases do projeto) pelo mesmo
// motivo do AreaRow acima. O log de "Fase renomeada"/"Descrição alterada"
// usa o draft local (nameField.draft) em vez de p.name/p.sub das props —
// essas só atualizam a cada 300ms de pausa, então no blur imediato após
// digitar rápido a prop ainda pode estar desatualizada.
function PhaseRow({ p, dragPhaseId, setDragPhaseId, reorderPhase, updatePhase, deletePhase, addLog, phasesEditingProjectId, canDelete }) {
  const nameField = useDebouncedField(p.name, (v) => updatePhase(p.id, { name: v }));
  const subField = useDebouncedField(p.sub, (v) => updatePhase(p.id, { sub: v }));
  return (
    <div
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
        <input type="text" value={nameField.draft} onChange={(e) => nameField.onChange(e.target.value)} onBlur={() => { nameField.flush(); addLog(phasesEditingProjectId, `Fase renomeada: "${nameField.draft}"`); }} placeholder="Nome da fase" />
        <input type="text" value={subField.draft} onChange={(e) => subField.onChange(e.target.value)} onBlur={() => { subField.flush(); addLog(phasesEditingProjectId, `Descrição da fase "${nameField.draft}" alterada`); }} placeholder="Descrição curta" style={{ marginTop: 6, opacity: .85 }} />
      </div>
      <button style={S.iconBtnGhost} onClick={() => deletePhase(p.id)} disabled={!canDelete} title={!canDelete ? 'Deixe pelo menos uma fase' : 'Excluir fase'}>
        <Trash2 size={14} color={!canDelete ? 'var(--text-8)' : 'var(--text-5)'} />
      </button>
    </div>
  );
}

const SHELL_MODES = [
  { key: 'company', label: 'Empresas', icon: Building2 },
  { key: 'personal', label: 'Gestão de Atividades', icon: Columns3 },
  { key: 'xflow', label: 'XFlow', icon: Bug },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'macro', label: 'Visão Geral', icon: Globe },
  { key: 'knowledge', label: 'Conhecimento', icon: Sparkles },
  { key: 'crm', label: 'CRM', icon: Briefcase },
  { key: 'pareceres', label: 'Pareceres', icon: FileText },
  { key: 'modelos', label: 'Modelos', icon: FolderOpen },
  { key: 'users', label: 'Usuários', icon: UserCog },
];

// Abas do workspace de empresa; as 3 primeiras só existem para UMA empresa (a visão de várias não as tem).
const COMPANY_VIEW_IDS = ['resumo', 'meetings', 'todo', 'timeline', 'table', 'phases', 'kanban'];
const SINGLE_ONLY_VIEWS = ['resumo', 'meetings', 'todo'];

function AppScreens({ shellRef, bump }) {
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
  const [userAccess, setUserAccess] = useState({});
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [companySelectionConfirmed, setCompanySelectionConfirmed] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(null);
  const [personalBoard, setPersonalBoard] = useState(null);
  const [personalBoardLoaded, setPersonalBoardLoaded] = useState(false);
  const [personalBoardSaveState, setPersonalBoardSaveState] = useState('idle');
  const personalBoardSaveTimer = useRef(null);
  const lastGoodPersonalBoardRef = useRef(null);
  const personalBoardVersionRef = useRef('');
  const personalBoardBusyRef = useRef(false);
  const [phasesEditingProjectId, setPhasesEditingProjectId] = useState(null);
  const [usersLog, setUsersLog] = useState([]);
  const [loginError, setLoginError] = useState(null);
  const [usersPanelError, setUsersPanelError] = useState('');
  const saveTimers = useRef({});
  const pendingProjectData = useRef({});
  // Conta PATCHs de projeto em voo (enviados, ainda sem resposta) — junto com saveTimers (agendado,
  // ainda nem enviado), cobre as 2 janelas em que existe edição local que o servidor ainda não tem.
  // Usado só por reloadProjects pra nunca sobrescrever um projeto nessas janelas (ver bug de
  // 2026-09-29 abaixo).
  const inFlightProjectSaves = useRef({});
  const { toasts: appToasts, pushToast: pushAppToast, pushUndoToast: pushAppUndoToast, dismissToast: dismissAppToast } = useToasts();

  const [view, setView] = useState(() => readHistoryValue('companyView', 'table'));
  useHistoryValue('companyView', view, setView, 'table');
  const [todoFocusMeetingId, setTodoFocusMeetingId] = useState(null);
  const [todoFocusActivityId, setTodoFocusActivityId] = useState(null);
  const [meetingToPrint, setMeetingToPrint] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingXflowOpen, setPendingXflowOpen] = useState(null);
  const [pendingPersonalOpen, setPendingPersonalOpen] = useState(null); // {boardId, colId, cardId} vindo da busca global
  const [pendingCrmOpen, setPendingCrmOpen] = useState(null); // {companyId, dealId} vindo de uma notificação do CRM
  const [pendingParecerOpen, setPendingParecerOpen] = useState(null); // id do parecer vindo de uma notificação de menção
  const [pendingModeloOpen, setPendingModeloOpen] = useState(null); // id do modelo vindo de uma notificação de menção
  const [renataHome, setRenataHome] = useState(null); // {question, n}: painel da RENATA geral (barra do topo / busca)
  const [renataProjectId, setRenataProjectId] = useState(null); // RENATA de uma empresa aberta a partir da geral
  const [pendingTodoOpen, setPendingTodoOpen] = useState(null); // {pid, meetingId, itemId}: abre o drawer da tarefa dentro da reunião (notificação 'todo' / "Hoje")
  setRecentsUser(currentUser ? currentUser.id : '');
  const [showSettings, setShowSettings] = useState(false);
  const [showPhases, setShowPhases] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showOrgAdmin, setShowOrgAdmin] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [orgAdminError, setOrgAdminError] = useState('');
  const [actingOrg, setActingOrg] = useState(null);
  const lastScope = actingOrg ? actingOrg.id : '';
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [cloningProject, setCloningProject] = useState(null);
  const [showGroupActivityModal, setShowGroupActivityModal] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [profileTab, setProfileTab] = useState('perfil');
  const [dailyReload, setDailyReload] = useState(0);
  const openProfile = (tab) => { setProfileTab(tab || 'perfil'); setShowMyProfile(true); };
  const [googleConnectResult, setGoogleConnectResult] = useState(null);
  const [openActivityId, setOpenActivityId] = useState(null);
  const [openMeetingId, setOpenMeetingId] = useState(null);
  const [showMeetingsTrash, setShowMeetingsTrash] = useState(false);
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

  // Histórico do navegador — Nível 1 (2026-08): troca de módulo (Empresas/
  // Gestão de Atividades/XFlow/Usuários/Organizações). Nível 2 (2026-08):
  // sub-navegação dentro do módulo Empresas (seletor de empresas ↔
  // workspace confirmado — "company:select" vs "company"); XFlow e Gestão
  // de Atividades têm o próprio Nível 2 local (viewMode/Arquivados/Lixeira
  // e página do quadro), ver PROJECT_CONTEXT.md §9. Nunca view interna,
  // filtro, nem modal de edição. Não muda a URL (app não tem roteador,
  // exceção única é /quadro/:token resolvida por regex antes de qualquer
  // coisa aqui); pushState só carrega um "navTag" no state pra o botão
  // Voltar do navegador saber pra onde ir.
  function locationTag(mode, users, orgAdmin, selected) {
    if (!mode) return 'gate';
    if (mode === 'xflow') return 'xflow';
    if (mode === 'agenda') return 'agenda';
    if (mode === 'macro') return 'macro';
    if (mode === 'crm') return 'crm';
    if (mode === 'personal') return 'personal';
    if (mode === 'users') return 'users';
    if (mode === 'knowledge') return 'knowledge';
    if (mode === 'pareceres') return 'pareceres';
    if (mode === 'modelos') return 'modelos';
    if (users) return 'company:users';
    if (orgAdmin) return 'company:orgadmin';
    if (selected === false) return 'company:select';
    return 'company';
  }
  function pushLocation(tag) {
    try { window.history.pushState({ navTag: tag }, '', pathForTag(tag)); } catch (e) { /* ignora (ex.: sandbox) */ }
  }
  // Ao abrir "Empresas" vindo de outro módulo/início, restaura a última seleção de empresas desta pessoa (se ainda existir
  // e ela puder abrir) e pula o seletor; "Trocar empresas" (goToCompanySelector) continua levando ao seletor, sem restaurar.
  function restoreLastCompanies() {
    if (companySelectionConfirmed || !currentUser || !currentUser.companiesAccess || projects.length < 2) return false;
    if (currentUser.isSuperAdmin && !actingOrg) return false;
    const saved = loadLastWorkspace(lastScope);
    const valid = saved ? saved.ids.filter((id) => projects.some((p) => p.id === id)) : [];
    if (!valid.length) return false;
    setSelectedProjectIds(valid);
    setCompanySelectionConfirmed(true);
    const wanted = saved.view && COMPANY_VIEW_IDS.includes(saved.view) ? saved.view : view;
    const nextView = valid.length > 1 && SINGLE_ONLY_VIEWS.includes(wanted) ? 'table' : wanted;
    if (nextView !== view) setView(nextView);
    return true;
  }
  function goToWorkspace(mode, opts) {
    const restored = mode === 'company' && workspaceMode !== 'company' && !(opts && opts.noRestore) ? restoreLastCompanies() : false;
    setShowUsers(false);
    setShowOrgAdmin(false);
    setWorkspaceMode(mode);
    pushLocation(locationTag(mode, false, false, mode === 'company' ? (companySelectionConfirmed || restored) : true));
    const m = mode && SHELL_MODES.find((x) => x.key === mode);
    if (m) recordRecent({ kind: 'module', id: mode, label: m.label });
  }
  // Abre uma empresa (ou várias) direto, sem passar pelo seletor nem restaurar a seleção antiga.
  function openCompanyWorkspace(ids) {
    goToWorkspace('company', { noRestore: true });
    confirmCompanySelection(ids);
  }
  function goToUsers(open) {
    setShowUsers(open);
    if (open) setShowOrgAdmin(false);
    pushLocation(locationTag('company', open, false));
  }
  function goToOrgAdmin(open) {
    setShowOrgAdmin(open);
    if (open) setShowUsers(false);
    pushLocation(locationTag('company', false, open));
  }
  function goToCompanySelector() {
    setCompanySelectionConfirmed(false);
    pushLocation('company:select');
  }
  function confirmCompanySelection(ids) {
    setSelectedProjectIds(ids);
    setCompanySelectionConfirmed(true);
    if (ids.length > 1 && SINGLE_ONLY_VIEWS.includes(view)) setView('table');
    saveLastWorkspace(lastScope, { ids });
    if (ids.length === 1) {
      const p = projects.find((x) => x.id === ids[0]);
      if (p) recordRecent({ kind: 'company', id: p.id, label: p.company.nomeFantasia || p.company.name || 'Sem nome', hint: p.company.cnpj || '' });
    }
    pushLocation('company');
  }
  function applyLocationTag(tag) {
    if (tag === 'company:users') { setWorkspaceMode('company'); setShowUsers(true); setShowOrgAdmin(false); }
    else if (tag === 'company:orgadmin') { setWorkspaceMode('company'); setShowOrgAdmin(true); setShowUsers(false); }
    else if (tag === 'company:select') { setWorkspaceMode('company'); setShowUsers(false); setShowOrgAdmin(false); setCompanySelectionConfirmed(false); }
    else if (tag === 'company') { setWorkspaceMode('company'); setShowUsers(false); setShowOrgAdmin(false); setCompanySelectionConfirmed(true); }
    else if (tag === 'personal') { setWorkspaceMode('personal'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'xflow') { setWorkspaceMode('xflow'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'agenda') { setWorkspaceMode('agenda'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'macro') { setWorkspaceMode('macro'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'crm') { setWorkspaceMode('crm'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'users') { setWorkspaceMode('users'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'knowledge') { setWorkspaceMode('knowledge'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'pareceres') { setWorkspaceMode('pareceres'); setShowUsers(false); setShowOrgAdmin(false); }
    else if (tag === 'modelos') { setWorkspaceMode('modelos'); setShowUsers(false); setShowOrgAdmin(false); }
    else { setWorkspaceMode(null); setShowUsers(false); setShowOrgAdmin(false); }
  }
  // Nível 3 (2026-08): abrir ActivityDetailModal empilha em cima do state
  // atual (preserva navTag/etc., só soma detailActivity) — Voltar fecha o
  // modal em vez de sair do site. Fechar pelo X/overlay chama
  // closeActivityDetail() (que faz history.back() se foi aberto via push),
  // não limpa o estado direto — assim front/back ficam sincronizados. Não
  // cobre o caso de apertar Voltar físico com edição não salva (o
  // ConfirmDiscardModal só intercepta fechamento pelo X — ver
  // PROJECT_CONTEXT.md §9).
  function openActivityDetail(pid, id) {
    setOpenActivityId({ pid, id });
    {
      const pr = projects.find((x) => x.id === pid);
      const ac = pr && pr.activities.find((x) => x.id === id);
      if (ac && ac.title !== 'Nova atividade') recordRecent({ kind: 'activity', id: `${pid}/${id}`, label: ac.title || '(sem título)', hint: pr.company.nomeFantasia || pr.company.name || '' });
    }
    markNotificationsReadForTarget({ kind: 'activity', projectId: pid, activityId: id });
    try {
      const cur = window.history.state || {};
      window.history.pushState({ ...withoutLayer(cur), detailActivity: { pid, id } }, '', window.location.href);
    } catch (e) { /* ignora */ }
  }
  function closeActivityDetail() {
    try {
      if (window.history.state && window.history.state.detailActivity) { window.history.back(); return; }
    } catch (e) { /* ignora */ }
    setOpenActivityId(null);
  }
  function openMeetingDetail(pid, id) {
    setOpenMeetingId({ pid, id });
    {
      const pr = projects.find((x) => x.id === pid);
      const mt = pr && (pr.meetings || []).find((x) => x.id === id);
      if (mt && mt.title !== 'Nova reunião') recordRecent({ kind: 'meeting', id: `${pid}/${id}`, label: mt.title || '(sem título)', hint: pr.company.nomeFantasia || pr.company.name || '' });
    }
    try {
      const cur = window.history.state || {};
      window.history.pushState({ ...withoutLayer(cur), detailMeeting: { pid, id } }, '', window.location.href);
    } catch (e) { /* ignora */ }
  }
  // Criar atividade/reunião já grava o registro e abre o modal (decisão antiga: editar direto). Se a pessoa fecha sem
  // preencher nada, o registro vazio ficaria sobrando — então ele é descartado (só se continua intocado).
  const prevOpenActRef = useRef(null);
  const prevOpenMtgRef = useRef(null);
  function isUntouchedNewActivity(a, project) {
    const firstMember = project && project.team && project.team[0] && project.team[0].name;
    return !a.deleted && a.title === 'Nova atividade' && !a.desc && !a.date && !a.endDate && !a.notes && !a.transcript && !a.durationDays
      && !a.priority && (a.status || 'nao-iniciado') === 'nao-iniciado' && a.responsible === (firstMember || 'PRICETAX')
      && !(a.subactivities || []).length && !(a.attachments || []).length && !(a.comments || []).length && !(a.links || []).length;
  }
  function isUntouchedNewMeeting(m) {
    return !m.deleted && m.title === 'Nova reunião' && m.date === todayISOStr() && !m.time && !m.transcript && !m.summary && !m.decisions
      && !(m.participants || []).length && !(m.actionItems || []).some((it) => !it.deleted);
  }
  useEffect(() => {
    const prev = prevOpenActRef.current;
    prevOpenActRef.current = openActivityId;
    if (!prev || (openActivityId && openActivityId.id === prev.id)) return;
    const project = projects.find((p) => p.id === prev.pid);
    const a = project && project.activities.find((x) => x.id === prev.id);
    if (!a || !isUntouchedNewActivity(a, project)) return;
    mutateProject(prev.pid, (p) => ({ ...p, activities: p.activities.filter((x) => !(x.id === prev.id && isUntouchedNewActivity(x, p))) }));
  }, [openActivityId]);
  useEffect(() => {
    const prev = prevOpenMtgRef.current;
    prevOpenMtgRef.current = openMeetingId;
    if (!prev || (openMeetingId && openMeetingId.id === prev.id)) return;
    const project = projects.find((p) => p.id === prev.pid);
    const m = project && (project.meetings || []).find((x) => x.id === prev.id);
    if (!m || !isUntouchedNewMeeting(m)) return;
    mutateProject(prev.pid, (p) => ({ ...p, meetings: (p.meetings || []).filter((x) => !(x.id === prev.id && isUntouchedNewMeeting(x))) }));
  }, [openMeetingId]);

  function closeMeetingDetail() {
    try {
      if (window.history.state && window.history.state.detailMeeting) { window.history.back(); return; }
    } catch (e) { /* ignora */ }
    setOpenMeetingId(null);
  }
  // Extraído numa função (em vez de inline em cada branch de render) porque
  // a Visão Geral (§23) também precisa montar esse mesmo modal — editar uma
  // atividade a partir de lá tem que abrir o ActivityDetailModal de verdade,
  // não uma cópia, senão a edição não reflete no resto do app.
  // Da lista "Tarefas de reunião" do detalhe da atividade: fecha o detalhe SEM history.back() (o popstate reaplicaria o módulo anterior e
  // desfaria a navegação, que pode vir da Visão Geral) e leva à tarefa na reunião de origem ou à aba Tarefas filtrada pela atividade.
  function leaveActivityDetailFor(pid) {
    if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return false; }
    try { const { detailActivity, ...rest } = withoutLayer(window.history.state || {}); window.history.replaceState(rest, '', window.location.href); } catch (e) { /* ignora */ }
    setOpenActivityId(null);
    if (workspaceMode !== 'company' || selectedProjectIds.length !== 1 || selectedProjectIds[0] !== pid) openCompanyWorkspace([pid]);
    return true;
  }
  function openLinkedTask(pid, meetingId, itemId) {
    if (!leaveActivityDetailFor(pid)) return;
    setView('meetings');
    setPendingTodoOpen({ pid, meetingId, itemId });
    openMeetingDetail(pid, meetingId);
  }
  function openActivityTasks(pid, activityId) {
    if (!leaveActivityDetailFor(pid)) return;
    setView('todo');
    setTodoFocusActivityId(activityId);
  }
  function renderActivityDetailModal() {
    if (!openActivityId) return null;
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
        groupChildren={project.company.isGroupMaster ? groupMembers(projects, project.id).filter((p) => p.id !== project.id).map((p) => ({ id: p.id, name: p.company.nomeFantasia || p.company.name || 'Sem nome' })) : []}
        onClose={closeActivityDetail}
        updateActivity={updateActivity}
        flushProjectSave={() => flushProjectSave(project.id)}
        deleteActivity={async (tPid, id) => { if (await deleteActivity(tPid, id)) closeActivityDetail(); }}
        addSub={addSub}
        updateSub={updateSub}
        deleteSub={deleteSub}
        reorderSub={reorderSub}
        addAttachments={addAttachments}
        removeAttachment={removeAttachment}
        addComment={addComment}
        removeComment={removeComment}
        updateComment={updateComment}
        addLink={addLink}
        removeLink={removeLink}
        toggleParticipant={toggleParticipant}
        meetings={project.meetings}
        onOpenLinkedTask={(meetingId, itemId) => openLinkedTask(project.id, meetingId, itemId)}
        onOpenLinkedTasks={() => openActivityTasks(project.id, activity.id)}
      />
    );
  }
  function renderMeetingDetailModal() {
    if (!openMeetingId) return null;
    const project = projects.find((p) => p.id === openMeetingId.pid);
    const meeting = project && (project.meetings || []).find((m) => m.id === openMeetingId.id);
    if (!project || !meeting) return null;
    return (
      <MeetingDetailModal
        meeting={meeting}
        team={project.team}
        externalContacts={project.externalContacts || []}
        clientName={project.company && project.company.name}
        pid={project.id}
        currentUser={currentUser}
        log={project.log || []}
        pushUndoToast={pushAppUndoToast}
        onClose={closeMeetingDetail}
        updateMeeting={updateMeeting}
        flushProjectSave={() => flushProjectSave(project.id)}
        deleteMeeting={async (tPid, id) => { if (await deleteMeeting(tPid, id)) closeMeetingDetail(); }}
        toggleParticipant={toggleMeetingParticipant}
        addParticipant={addMeetingParticipantFreeText}
        addActionItem={addMeetingActionItem}
        updateActionItem={updateMeetingActionItem}
        deleteActionItem={deleteMeetingActionItem}
        duplicateActionItem={duplicateActionItem}
        activityOptions={buildActivityOptions(project.activities, project.phases)}
        onLinkActivity={canLinkTasks ? linkTaskToActivity : undefined}
        addSubtask={addTodoSubtask}
        toggleSubtask={toggleTodoSubtask}
        deleteSubtask={deleteTodoSubtask}
        addComment={addTodoComment}
        updateComment={updateTodoComment}
        deleteComment={deleteTodoComment}
        addAttachment={addTodoAttachment}
        deleteAttachment={deleteTodoAttachment}
        onViewActivities={(meetingId) => { closeMeetingDetail(); setView('todo'); setTodoFocusMeetingId(meetingId); }}
        onSetShareVisibility={(visibility) => toggleMeetingShare(project.id, meeting.id, visibility)}
        onRegenerateShareLink={() => regenerateMeetingShareLink(project.id, meeting.id)}
        onExportPdf={() => exportMeetingPdf(meeting, project.company && project.company.name)}
        initialOpenItemId={pendingTodoOpen && pendingTodoOpen.pid === project.id && pendingTodoOpen.meetingId === meeting.id ? pendingTodoOpen.itemId : null}
        onInitialOpenItemConsumed={() => setPendingTodoOpen(null)}
      />
    );
  }
  useEffect(() => {
    try { window.history.replaceState({ navTag: locationTag(workspaceMode, showUsers, showOrgAdmin, companySelectionConfirmed) }, '', window.location.href); } catch (e) { /* ignora */ }
    function onPopState(e) {
      // Entrada sem navTag (ex.: aberta direto por favorito): o endereço diz o módulo.
      applyLocationTag((e.state && e.state.navTag) || modeForPath(window.location.pathname) || 'gate');
      setOpenActivityId((e.state && e.state.detailActivity) || null);
      setOpenMeetingId((e.state && e.state.detailMeeting) || null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Central de Notificações (2026-08) — carrega ao logar e faz polling (sem
  // websocket na stack, ver PROJECT_CONTEXT.md §9) pra contador ficar
  // "dinâmico" (pedido do Rafael) sem precisar recarregar a página. Estado
  // mora aqui (não em cada tela) porque as 3 abas (Empresas/Gestão de
  // Atividades/XFlow) precisam mostrar o MESMO contador/lista — só App()
  // fica montado o tempo todo, sobrevivendo à troca de workspaceMode.
  useEffect(() => {
    if (!currentUser) { setNotifications([]); resetNotifPrefs(); return; }
    let cancelled = false;
    function load() {
      apiGet('/api/notifications').then((res) => { if (!cancelled) setNotifications(res.notifications); }).catch(() => {});
    }
    loadNotifPrefs();
    load();
    const interval = setInterval(load, 45000);
    window.addEventListener('notifications:refresh', load);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener('notifications:refresh', load); };
  }, [currentUser?.id]);

  async function markNotificationRead(id, read) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
    try { await apiPatch(`/api/notifications/${id}`, { read }); } catch (e) { /* próximo poll corrige */ }
  }
  async function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await apiPost('/api/notifications/read-all'); } catch (e) { /* próximo poll corrige */ }
  }
  async function markNotificationsReadForTarget(target) {
    try { await apiPost('/api/notifications/mark-read-for-target', target); } catch (e) { /* ignora */ }
    setNotifications((prev) => prev.map((n) => {
      const t = n.target || {};
      if (t.kind !== target.kind) return n;
      if (target.ticketId && t.ticketId !== target.ticketId) return n;
      if (target.activityId && t.activityId !== target.activityId) return n;
      return { ...n, read: true };
    }));
  }
  // Igual acima, mas só localmente — usado quando o servidor JÁ marcou
  // como lida como efeito colateral de outra rota (o POST .../view do
  // XFlow já faz isso no visualizar-TASK), então só falta refletir na tela
  // sem bater a rota de novo.
  function markTicketNotificationsReadLocally(ticketId) {
    setNotifications((prev) => prev.map((n) => (
      n.target && n.target.kind === 'xflow_ticket' && n.target.ticketId === ticketId ? { ...n, read: true } : n
    )));
  }
  // Clicar numa notificação leva pro lugar exato (regra do Rafael: abrir o
  // painel sozinho NÃO marca como lida — só isso aqui, que é o usuário de
  // fato acessando a ocorrência, ou o botão explícito "marcar como lida").
  // Toda notificação navega (Onda 5, §81): cada `target.kind` que o servidor cria tem caminho aqui — xflow_ticket, activity,
  // todo, crm_activity, parecer, modelo. Alvo que sumiu (atividade/reunião/tarefa excluída) ou módulo sem acesso avisa em
  // vez de deixar a tela em branco; notificação sem alvo vai ao módulo mais provável pelo prefixo do tipo.
  function goToNotificationTarget(n) {
    const t = (n && n.target) || {};
    setShowNotifications(false);
    const gone = () => notify('Este item não existe mais.', { tone: 'error' });
    const enter = (mode) => {
      if (!canOpenMode(mode, currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return false; }
      if (workspaceMode !== mode) goToWorkspace(mode);
      return true;
    };
    if (t.kind === 'xflow_ticket') {
      if (!enter('xflow')) return;
      setPendingXflowOpen(t.ticketId);
    } else if (t.kind === 'activity') {
      const pr = projects.find((x) => x.id === t.projectId);
      const ac = pr && (pr.activities || []).find((x) => x.id === t.activityId && !x.deleted);
      if (!ac) { gone(); return; }
      if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
      openCompanyWorkspace([t.projectId]);
      openActivityDetail(t.projectId, t.activityId);
    } else if (t.kind === 'todo') {
      const pr = projects.find((x) => x.id === t.projectId);
      const mt = pr && (pr.meetings || []).find((x) => x.id === t.meetingId && !x.deleted);
      const it = mt && (mt.actionItems || []).find((x) => x.id === t.itemId && !x.deleted);
      if (!it) { gone(); return; }
      if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
      markNotificationRead(n.id, true);
      openCompanyWorkspace([t.projectId]);
      setView('meetings');
      setPendingTodoOpen({ pid: t.projectId, meetingId: t.meetingId, itemId: t.itemId });
      openMeetingDetail(t.projectId, t.meetingId);
    } else if (t.kind === 'crm_activity') {
      if (!enter('crm')) return;
      markNotificationsReadForTarget({ kind: 'crm_activity', activityId: t.activityId });
      setPendingCrmOpen({ companyId: t.companyId, dealId: t.dealId || null });
    } else if (t.kind === 'parecer') {
      if (!enter('pareceres')) return;
      markNotificationRead(n.id, true);
      setPendingParecerOpen(t.id);
    } else if (t.kind === 'modelo') {
      if (!enter('modelos')) return;
      markNotificationRead(n.id, true);
      setPendingModeloOpen(t.id);
    } else {
      const prefix = String((n && n.type) || '').split('_')[0];
      const mode = { xflow: 'xflow', crm: 'crm', parecer: 'pareceres', modelo: 'modelos', activity: 'company', todo: 'company' }[prefix];
      if (n && n.id) markNotificationRead(n.id, true);
      if (mode) enter(mode);
      else notify('Esta notificação não aponta para um item específico.');
    }
  }

  function withActingOrg(path, orgIdOverride) {
    const org = orgIdOverride || (actingOrg && actingOrg.id);
    if (!org) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}asOrg=${encodeURIComponent(org)}`;
  }

  // `background=true` é o "BIP" de sincronização (poll a cada 6s, linha ~950) recarregando sozinho
  // porque outro usuário mudou algo — nunca o carregamento inicial de fato.
  //
  // Bug real relatado pela Amanda (2026-09-29): criar uma atividade numa reunião e, ~2s depois,
  // digitar o nome dela, o texto digitado sumia sozinho. Causa: o poll de sincronização roda numa
  // agenda própria (a cada 6s, independente do que o usuário está fazendo) e, ao notar que ESTE
  // MESMO usuário acabou de salvar algo (criar a atividade já dispara um PATCH), chamava
  // reloadProjects() — que sobrescrevia `projects` inteiro com a resposta do servidor. Se isso
  // acontecesse enquanto a edição do NOME ainda estava só localmente (aguardando o debounce de
  // 500ms de persistProjectDebounced, ou já enviada mas sem resposta ainda), o servidor devolvia
  // uma foto de ANTES dela terminar de digitar — e essa foto apagava o que ela via na tela.
  // Corrigido nunca sobrescrevendo, numa recarga em background, um projeto que ainda tem edição
  // local pendente (`saveTimers`, agendada) ou em voo (`inFlightProjectSaves`, já enviada mas sem
  // resposta) — os dois únicos jeitos de "o servidor ainda não sabe o que eu digitei".
  async function reloadProjects(opts) {
    const background = !!(opts && opts.background);
    try {
      const res = await apiGet(withActingOrg('/api/projects'));
      const fresh = res.projects.map(normalizeProject);
      if (!background) { setProjects(fresh); return; }
      setProjects((prev) => fresh.map((p) => {
        const pending = saveTimers.current[p.id] || inFlightProjectSaves.current[p.id];
        if (!pending) return p;
        const local = prev.find((x) => x.id === p.id);
        return local || p;
      }));
    } catch (e) {
      console.error('Falha ao carregar projetos', e);
      // Falha no poll silencioso não pode apagar o que já está na tela — só o carregamento
      // inicial (sem dado nenhum ainda) cai pra lista vazia.
      if (!background) setProjects([]);
    } finally {
      setProjectsLoaded(true);
    }
  }

  useEffect(() => {
    if (!currentUser) { setProjects([]); setProjectsLoaded(false); return; }
    setProjectsLoaded(false);
    reloadProjects();
  }, [currentUser?.id, actingOrg?.id]);

  // "BIP" de sincronização entre usuários (2026-09-10, pedido do Rafael:
  // "Amanda concluindo lá, conclui aqui também") — poll barato
  // (só id+updatedAt, nunca o JSONB inteiro) a cada poucos segundos; só
  // recarrega a lista completa (reloadProjects, já existente) quando
  // alguma empresa realmente mudou desde a última checagem. Sem
  // WebSocket/infra nova de propósito, mesmo espírito de "não introduzir
  // infra desnecessária" já usado nas decisões do Assistente do Projeto.
  const knownProjectVersionsRef = useRef(new Map());
  useEffect(() => {
    if (!currentUser) return;
    knownProjectVersionsRef.current = new Map();
    let cancelled = false;
    let timer = null;

    async function poll() {
      try {
        const res = await apiGet(withActingOrg('/api/projects/versions'));
        if (cancelled) return;
        const versions = res.versions || [];
        let changed = false;
        versions.forEach((v) => {
          const prev = knownProjectVersionsRef.current.get(v.id);
          if (prev !== undefined && prev !== v.updatedAt) changed = true;
          knownProjectVersionsRef.current.set(v.id, v.updatedAt);
        });
        if (changed) reloadProjects({ background: true });
      } catch (e) {
        // Silencioso de propósito — é só um heartbeat, uma falha
        // pontual (rede instável, etc.) não deve virar erro visível.
      }
      if (!cancelled) timer = setTimeout(poll, 6000);
    }

    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [currentUser?.id, actingOrg?.id]);

  // Aviso de "nova versão" (2026-09-29) — descoberto ao investigar um relatório da Amanda de bug
  // "corrigido" que continuou acontecendo: um deploy troca o JS servido, mas quem já está com a
  // aba aberta continua rodando o bundle ANTIGO, na memória, indefinidamente — nada nesse app
  // recarrega uma sessão em andamento sozinho. Sem isso, toda correção fica invisível pra quem
  // não fechar e reabrir a aba, e o suporte vira "vc atualizou a página?" às cegas. Checa o
  // `index.html` de verdade (não cacheado) de tempos em tempos e, se o JS referenciado mudou,
  // mostra um toast persistente com "Atualizar agora" (dado real, sem timer arriscando adivinhar
  // "quando" o usuário está no meio de algo).
  useEffect(() => {
    const currentScript = document.querySelector('script[type="module"][src*="/assets/"]');
    const currentSrc = currentScript && currentScript.getAttribute('src');
    if (!currentSrc) return undefined; // dev (Vite sem build) não serve assets com hash — nada a comparar
    let cancelled = false;
    let notified = false;
    async function check() {
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const html = await res.text();
        if (cancelled || notified) return;
        const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
        if (m && m[1] && m[1] !== currentSrc) {
          notified = true;
          pushAppToast({
            message: 'Uma nova versão do Cronograma está disponível.',
            actionLabel: 'Atualizar agora',
            onAction: () => window.location.reload(),
            ttlMs: 0,
          });
        }
      } catch (e) { /* falha pontual de rede — tenta de novo no próximo ciclo */ }
    }
    check();
    const timer = setInterval(check, 4 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Auto-atualização da memória da RENATA ao entrar numa empresa
  // (2026-09-10, pedido do Rafael: "não esqueça de fazer essa
  // atualização toda vez que o usuário logar e entrar") — dispara
  // silenciosamente (sem mensagem no chat, diferente do botão manual
  // "Reindexar memória") assim que `selectedProjectIds` vira UMA empresa
  // só (entrar no workspace dela, não a visão geral com várias
  // selecionadas). Throttlado por sessão de navegador (Set em useRef,
  // mesmo espírito do "BIP" acima) pra não checar de novo a cada troca
  // de aba dentro da mesma empresa.
  // Fase 6 (2026-09-10, redução de custo): antes disso chamava
  // /reindex direto, reprocessando embedding de TUDO toda vez — mesmo
  // sem nada ter mudado (syncProjectMemoryFromDiff já mantém a memória
  // atualizada em tempo real a cada edição salva). Agora consulta antes
  // o endpoint barato /reindex-needed (só leitura no Postgres, sem
  // custo de IA) e só chama /reindex de verdade quando ele confirma que
  // falta alguma coisa de verdade.
  const autoReindexedRef = useRef(new Set());
  useEffect(() => {
    if (!currentUser || selectedProjectIds.length !== 1) return;
    const pid = selectedProjectIds[0];
    if (autoReindexedRef.current.has(pid)) return;
    autoReindexedRef.current.add(pid);
    apiGet(`/api/assistant/reindex-needed?projectId=${pid}`)
      .then((res) => {
        if (!res.needed) return;
        return apiPost('/api/assistant/reindex', { projectId: pid });
      })
      .catch((e) => {
        console.error('Auto-atualização da memória da RENATA falhou', e);
      });
  }, [selectedProjectIds.join(','), currentUser?.id]);

  useEffect(() => {
    if (!projectsLoaded || !currentUser || !currentUser.companiesAccess || projects.length > 1) return;
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
        personalBoardVersionRef.current = res.updatedAt || '';
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

  useEffect(() => {
    if (!currentUser) return undefined;
    const storageKey = `ptx-first-use:${currentUser.id}`;
    const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
    let doneDay = '';
    try { doneDay = window.localStorage.getItem(storageKey) || ''; } catch (e) { /* sem storage */ }
    let inFlight = false;
    let retryAt = 0;
    function onUse() {
      if (inFlight || Date.now() < retryAt) return;
      const today = dayOf.format(new Date());
      if (today === doneDay) return;
      inFlight = true;
      apiPost('/api/activity/ping', {})
        .then(() => {
          doneDay = today;
          try { window.localStorage.setItem(storageKey, today); } catch (e) { /* sem storage */ }
        })
        .catch(() => { retryAt = Date.now() + 60000; })
        .finally(() => { inFlight = false; });
    }
    window.addEventListener('pointerdown', onUse, true);
    window.addEventListener('keydown', onUse, true);
    return () => {
      window.removeEventListener('pointerdown', onUse, true);
      window.removeEventListener('keydown', onUse, true);
    };
  }, [currentUser?.id]);

  // Pré-carrega, quando o navegador está ocioso, os dois pedaços de uso mais comum (editor de texto do cartão e a lista de tarefas das reuniões),
  // para a primeira abertura não mostrar "Carregando…". Respeita o "economizar dados" do navegador.
  useEffect(() => {
    if (!currentUser) return undefined;
    const run = () => {
      try {
        if (navigator.connection && navigator.connection.saveData) return;
        import('./ui/RichNote.jsx').catch(() => {});
        import('./meetings/TodoBoard.jsx').catch(() => {});
      } catch (e) { /* ignora: é só otimização */ }
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 8000 });
      return () => window.cancelIdleCallback && window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 4000);
    return () => clearTimeout(t);
  }, [currentUser?.id]);

  // Link permanente por TASK do XFlow (2026-08, pedido do Rafael): um link
  // tipo ".../#30" precisa cair direto dentro do XFlow (não só no gate),
  // pra XFlowScreen então abrir a TASK #30 específica (ver hashOpenDone lá).
  // Precisa rodar DEPOIS do efeito logo acima (que reseta workspaceMode pra
  // null a cada troca de currentUser) — senão o reset ganha e desfaz esse
  // goToWorkspace('xflow'), porque os dois dependem de currentUser e efeitos
  // rodam na ordem em que aparecem no componente. Só dispara uma vez: se
  // disparasse de novo a cada render, qualquer troca de módulo posterior
  // pro usuário voltaria pro XFlow enquanto o hash antigo ainda estivesse
  // na URL.
  // Abertura direta por endereço (favorito/link, 2026-10-05): /gestao-atividades, /agenda, /crm… Roda UMA vez por
  // sessão de página, depois que o usuário existe e DEPOIS do efeito que zera o módulo na troca de usuário (mesma
  // razão do hash do XFlow abaixo). Sem acesso ao módulo, volta pra "/" em vez de abrir uma tela vazia. Não empilha
  // histórico (replaceState): o Voltar do navegador sai do site, como em qualquer favorito.
  const initialPathDone = useRef(false);
  useEffect(() => {
    if (initialPathDone.current || !currentUser) return;
    initialPathDone.current = true;
    if (/^#\d+$/.test(window.location.hash)) return;
    const mode = modeForPath(window.location.pathname);
    if (!mode) {
      // Endereço que não é de módulo nenhum: limpa pra "/". EXCETO os links públicos (/quadro/:token e
      // /reuniao/:token): os hooks rodam antes do `return` que desenha a tela pública, então reescrever a URL aqui
      // faria o link de quem está logado abrir a tela inicial em vez do quadro/reunião compartilhado.
      const p = window.location.pathname;
      if (p !== '/' && !/^\/(quadro|reuniao)\//.test(p)) { try { window.history.replaceState({ navTag: 'gate' }, '', '/'); } catch (e) { /* ignora */ } }
      return;
    }
    try {
      if (canOpenMode(mode, currentUser)) {
        if (mode === 'company') restoreCompanyPending.current = true;
        setWorkspaceMode(mode);
        window.history.replaceState({ navTag: modeForTag(mode) }, '', pathForMode(mode));
      } else {
        window.history.replaceState({ navTag: 'gate' }, '', '/');
      }
    } catch (e) { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Última aba da empresa e, ao abrir "Empresas" direto por endereço (/empresas), a última seleção — por pessoa
  // (localStorage, src/lib/recents.js). Só restaura o que ainda existe e que a pessoa pode abrir.
  const savedViewApplied = useRef(false);
  useEffect(() => {
    if (!projectsLoaded || !currentUser || savedViewApplied.current) return;
    savedViewApplied.current = true;
    const saved = loadLastWorkspace(lastScope);
    if (saved && saved.view && COMPANY_VIEW_IDS.includes(saved.view) && readHistoryValue('companyView', null) === null) setView(saved.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded, currentUser?.id]);
  const restoreCompanyPending = useRef(false);
  useEffect(() => {
    if (!restoreCompanyPending.current || !projectsLoaded || !currentUser || workspaceMode !== 'company') return;
    restoreCompanyPending.current = false;
    restoreLastCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded, workspaceMode, currentUser?.id]);
  useEffect(() => {
    if (!currentUser || !companySelectionConfirmed || !projectsLoaded) return;
    saveLastWorkspace(lastScope, { view });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companySelectionConfirmed, projectsLoaded]);

  const hashXflowNavDone = useRef(false);
  useEffect(() => {
    if (hashXflowNavDone.current || !currentUser) return;
    hashXflowNavDone.current = true;
    if (/^#\d+$/.test(window.location.hash) && currentUser.xflowRole) goToWorkspace('xflow');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Volta do OAuth do Google Calendar (2026-08) — a ida-e-volta pro Google
  // descarrega a página inteira, então não dá pra manter "Meu perfil"
  // aberto durante a autorização; a única forma de mostrar o resultado é
  // reabrir sozinho quando a URL já chega com o hash marcador que
  // server/google.js usa no redirect final.
  const hashGoogleDone = useRef(false);
  useEffect(() => {
    if (hashGoogleDone.current || !currentUser) return;
    hashGoogleDone.current = true;
    if (window.location.hash === '#google-calendar-connected') {
      setGoogleConnectResult('connected');
      if (currentUser.onboardingDone) openProfile('agenda');
      try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); } catch (e) { /* ignora */ }
    } else if (window.location.hash === '#google-calendar-error') {
      setGoogleConnectResult('error');
      if (currentUser.onboardingDone) openProfile('agenda');
      try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); } catch (e) { /* ignora */ }
    }
  }, [currentUser]);

  useWelcomeSetup(currentUser, (saved) => {
    setCurrentUser((u) => (u ? { ...u, onboardingDone: true } : u));
    if (saved) setDailyReload((k) => k + 1);
  });

  // "Adicionar ao meu quadro" na página pública (/quadro/:token) deixa um
  // marcador em sessionStorage e volta pra "/": abre a Gestão de Atividades
  // direto; PersonalBoardScreen é quem consome (e apaga) o marcador.
  useEffect(() => {
    if (!currentUser || !personalBoardLoaded) return;
    let flag = null;
    try { flag = window.sessionStorage.getItem('pb-open-linked'); } catch (e) { /* ignora */ }
    if (!flag) return;
    if (currentUser.personalAccess) goToWorkspace('personal');
    else { try { window.sessionStorage.removeItem('pb-open-linked'); } catch (e) { /* ignora */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, personalBoardLoaded]);

  function persistPersonalBoardDebounced(board) {
    if (personalBoardSaveTimer.current) clearTimeout(personalBoardSaveTimer.current);
    personalBoardBusyRef.current = true;
    setPersonalBoardSaveState('saving');
    personalBoardSaveTimer.current = setTimeout(() => {
      personalBoardSaveTimer.current = null;
      apiPatch('/api/personal-board', { board, baseUpdatedAt: personalBoardVersionRef.current })
        .then((res) => {
          const edited = !!personalBoardSaveTimer.current;
          if (res && res.merged && res.board && !edited) {
            // Uma atividade criada pela API de conectividade (§80) estava fora do que o painel conhecia: o servidor a devolveu ao quadro.
            setPersonalBoard(res.board);
            lastGoodPersonalBoardRef.current = res.board;
            personalBoardVersionRef.current = res.updatedAt || personalBoardVersionRef.current;
          } else {
            lastGoodPersonalBoardRef.current = board;
            // Com edição nova pendente, mantém a versão antiga: o próximo salvamento será mesclado de novo.
            if (!(res && res.merged)) personalBoardVersionRef.current = (res && res.updatedAt) || personalBoardVersionRef.current;
          }
          if (!edited) personalBoardBusyRef.current = false;
          setPersonalBoardSaveState('saved');
        })
        .catch((e) => {
          console.error('Falha ao salvar Gestão de Atividades', e);
          if (!personalBoardSaveTimer.current) personalBoardBusyRef.current = false;
          setPersonalBoardSaveState('error');
          setPersonalBoard(lastGoodPersonalBoardRef.current);
        });
    }, 500);
  }

  // Outra origem pode alterar o quadro (a API de conectividade, §80; o quadro público). Consulta só o carimbo e recarrega o quadro
  // quando mudou — e só se não há edição local pendente, para nunca sobrescrever o que a pessoa acabou de digitar.
  useEffect(() => {
    if (!currentUser || !currentUser.personalAccess || !personalBoardLoaded) return undefined;
    let stop = false;
    async function check() {
      if (stop || document.hidden || personalBoardBusyRef.current) return;
      try {
        const v = await apiGet('/api/personal-board/version');
        if (stop || !v || !v.updatedAt || v.updatedAt === personalBoardVersionRef.current || personalBoardBusyRef.current) return;
        const res = await apiGet('/api/personal-board');
        if (stop || personalBoardBusyRef.current) return;
        setPersonalBoard(res.board);
        lastGoodPersonalBoardRef.current = res.board;
        personalBoardVersionRef.current = res.updatedAt || '';
      } catch { /* sem rede: tenta no próximo ciclo */ }
    }
    const timer = setInterval(check, 12000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [currentUser?.id, currentUser?.personalAccess, personalBoardLoaded]);

  function mutatePersonalBoard(updater) {
    setPersonalBoard((prev) => {
      const next = updater(prev);
      persistPersonalBoardDebounced(next);
      return next;
    });
  }

  useEffect(() => {
    if ((showUsers || workspaceMode === 'users') && currentUser && currentUser.role === 'master') {
      loadUsers();
    }
  }, [showUsers, workspaceMode, currentUser?.id, actingOrg?.id]);

  useEffect(() => {
    if (currentUser && currentUser.isSuperAdmin) {
      loadOrganizations();
    }
  }, [currentUser?.id]);

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

  async function handleChangePasswordAndLogin(username, currentPassword, newPassword) {
    try {
      const res = await apiPost('/api/auth/change-password-login', { username, currentPassword, newPassword });
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
    setActingOrg(null);
    try { window.history.replaceState({ navTag: 'gate' }, '', '/'); } catch (e) { /* ignora */ }
  }

  async function updateMyAvatar(avatar) {
    const res = await apiPatch('/api/auth/me', { avatar });
    setCurrentUser(res.user);
    setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
  }

  // Marca pid como "em voo" (PATCH enviado, sem resposta ainda) enquanto `promise` não resolve —
  // reloadProjects usa isso (junto com saveTimers) pra nunca sobrescrever um projeto que o
  // servidor ainda não confirmou ter recebido.
  function trackInFlightSave(pid, promise) {
    inFlightProjectSaves.current[pid] = (inFlightProjectSaves.current[pid] || 0) + 1;
    const clear = () => {
      const n = (inFlightProjectSaves.current[pid] || 1) - 1;
      if (n <= 0) delete inFlightProjectSaves.current[pid]; else inFlightProjectSaves.current[pid] = n;
    };
    promise.then(clear, clear);
    return promise;
  }

  function persistProjectDebounced(pid, projectData) {
    pendingProjectData.current[pid] = projectData;
    if (saveTimers.current[pid]) clearTimeout(saveTimers.current[pid]);
    saveTimers.current[pid] = setTimeout(() => {
      delete saveTimers.current[pid];
      const data = pendingProjectData.current[pid];
      delete pendingProjectData.current[pid];
      trackInFlightSave(pid, apiPatch(`/api/projects/${pid}`, { project: data })).catch((e) => {
        console.error('Falha ao salvar projeto', e);
        pushAppToast({ message: 'Não foi possível salvar a última alteração. Verifique sua conexão.', ttlMs: 8000 });
      });
    }, 500);
  }

  // Força o PATCH pendente a sair AGORA em vez de esperar o debounce de
  // 500ms — usado antes de fechar um modal (X/overlay) que tem edição de
  // campo autosave, pra garantir que a última tecla digitada realmente
  // chegou no servidor antes do usuário sair da tela (2026-09-16, bug
  // real relatado pelo Rafael: fechar rápido demais podia dar a
  // impressão de que a edição "não salvou"). Devolve uma Promise pra quem
  // chama poder aguardar antes de fechar de fato.
  function flushProjectSave(pid) {
    if (!saveTimers.current[pid]) return Promise.resolve();
    clearTimeout(saveTimers.current[pid]);
    delete saveTimers.current[pid];
    const data = pendingProjectData.current[pid];
    delete pendingProjectData.current[pid];
    if (!data) return Promise.resolve();
    return trackInFlightSave(pid, apiPatch(`/api/projects/${pid}`, { project: data })).catch((e) => {
      console.error('Falha ao salvar projeto', e);
      pushAppToast({ message: 'Não foi possível salvar a última alteração. Verifique sua conexão.', ttlMs: 8000 });
      throw e;
    });
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

  // Casca única (§81, Onda 1): cada render publica em shellRef o que a barra do topo precisa; a barra só re-renderiza
  // quando a assinatura muda (os callbacks são lidos na hora do clique, então nunca ficam velhos).
  const shellSigRef = useRef('');
  useEffect(() => {
    const sig = shellRef.current ? shellRef.current.sig : '';
    if (sig !== shellSigRef.current) { shellSigRef.current = sig; bump(); }
  });
  shellRef.current = null;

  const publicBoardMatch = window.location.pathname.match(/^\/quadro\/([A-Za-z0-9_-]+)/);
  if (publicBoardMatch) {
    return <React.Suspense fallback={<LoadingScreen theme={theme} />}><PublicBoardScreen token={publicBoardMatch[1]} theme={theme} onToggleTheme={toggleTheme} /></React.Suspense>;
  }

  const publicMeetingMatch = window.location.pathname.match(/^\/reuniao\/([A-Za-z0-9_-]+)/);
  if (publicMeetingMatch) {
    return <PublicMeetingScreen token={publicMeetingMatch[1]} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!sessionChecked) {
    return <LoadingScreen theme={theme} />;
  }

  if (!currentUser) {
    return <LoginGate onLogin={handleLogin} onChangePasswordAndLogin={handleChangePasswordAndLogin} loginError={loginError} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!projectsLoaded) {
    return <LoadingScreen theme={theme} />;
  }

  const hasCompanies = currentUser.companiesAccess;
  const hasPersonal = currentUser.personalAccess;
  const hasXflow = !!currentUser.xflowRole;
  const hasAgenda = true; // universal — todo usuário logado tem uma agenda própria pra conectar
  // Visão Geral Empresas (2026-08) — cronograma consolidado de TODAS as
  // empresas da org, então só faz sentido pra quem já enxerga todas (não
  // pra quem tem acesso restrito a um CNPJ específico — vazaria dado de
  // cliente que ele não deveria ver).
  const hasMacro = hasCompanies && currentUser.allCompaniesAccess;
  // Central de Conhecimento (Fase 8, 2026-09-11) — governança da
  // memória da RENATA, área PRICETAX-only (decisão confirmada com o
  // Rafael): 'cliente' nunca vê esta área, mesmo tendo acesso a
  // empresas — segue exatamente a regra já usada em requireMasterOrPricetax
  // no backend (server/knowledge.js), sem criar uma role nova.
  const hasKnowledge = currentUser.role === 'master' || currentUser.role === 'pricetax';
  // Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório
  // de PDFs pra sócios/colaboradores. Mesma regra de visibilidade da Central
  // de Conhecimento (master/pricetax, nunca 'cliente') — decisão confirmada
  // com o Rafael.
  const hasPareceres = currentUser.role === 'master' || currentUser.role === 'pricetax';
  const hasModelos = hasPareceres;
  // CRM (2026-09-20): master/super admin sempre; demais só com crm_role definido em "Usuários"; 'cliente' nunca (regra vem pronta do servidor em crmAccess).
  const hasCrm = !!currentUser.crmAccess;
  const availableModes = [hasCompanies && 'company', hasPersonal && 'personal', hasXflow && 'xflow', hasAgenda && 'agenda', hasMacro && 'macro', hasKnowledge && 'knowledge', hasPareceres && 'pareceres', hasModelos && 'modelos', hasCrm && 'crm'].filter(Boolean);
  const effectiveMode = workspaceMode || (availableModes.length === 1 ? availableModes[0] : null);
  // Home = tela "Olá, Nome" (WorkspaceGateScreen). Só faz sentido oferecer o
  // atalho se houver mais de 1 workspace pra escolher — com só 1, a tela
  // inicial nem existe (auto-seleciona direto), então "ir pra Home" voltaria
  // pro mesmo lugar sem fazer nada.
  const goHome = availableModes.length > 1 ? () => goToWorkspace(null) : null;

  const shellModeKeys = [...availableModes, currentUser.role === 'master' && 'users'].filter(Boolean);
  const shellModes = SHELL_MODES.filter((m) => shellModeKeys.includes(m.key));
  const shellCurrent = (showUsers || effectiveMode === 'users') && currentUser.role === 'master' ? 'users' : effectiveMode;
  // Itens da busca global (Ctrl+K), dos recentes e dos favoritos. `kind`+`rid` identificam o item de forma estável (é só isso
  // que os recentes/favoritos guardam); `run` é reconstruído aqui a cada vez, a partir dos dados atuais.
  function buildSearchItems() {
    const items = shellModes.map((m) => ({ id: `m-${m.key}`, kind: 'module', rid: m.key, group: 'Ir para', label: m.label, icon: m.icon, run: () => goToWorkspace(m.key) }));
    if (hasCompanies) {
      for (const p of projects) {
        const name = p.company.nomeFantasia || p.company.name || 'Sem nome';
        const openCompany = () => openCompanyWorkspace([p.id]);
        items.push({ id: `c-${p.id}`, kind: 'company', rid: p.id, group: 'Empresas', label: name, hint: p.company.cnpj || '', icon: Building2, run: openCompany });
        for (const a of p.activities || []) {
          if (a.deleted) continue;
          items.push({ id: `a-${p.id}-${a.id}`, kind: 'activity', rid: `${p.id}/${a.id}`, group: 'Atividades', label: a.title || '(sem título)', hint: name, keywords: a.responsible || '', icon: ListChecks, run: () => { openCompany(); openActivityDetail(p.id, a.id); } });
        }
        for (const m of p.meetings || []) {
          if (m.deleted) continue;
          items.push({ id: `r-${p.id}-${m.id}`, kind: 'meeting', rid: `${p.id}/${m.id}`, group: 'Reuniões', label: m.title || '(sem título)', hint: name, icon: Mic, run: () => { openCompany(); setView('meetings'); openMeetingDetail(p.id, m.id); } });
        }
      }
    }
    if (hasPersonal && personalBoard) {
      for (const b of personalBoard.boards || []) {
        for (const col of b.columns || []) {
          for (const cd of col.cards || []) {
            if (cd.deleted || cd.archived) continue;
            items.push({ id: `p-${cd.id}`, kind: 'card', rid: cd.id, group: 'Meu quadro', label: cd.title || '(sem título)', hint: b.name, icon: Columns3, run: () => { setPendingPersonalOpen({ boardId: b.id, colId: col.id, cardId: cd.id }); goToWorkspace('personal'); } });
          }
        }
      }
    }
    return items;
  }

  // "Hoje" da tela inicial (Onda 5, §81): resolver em 1 clique. Tudo passa pelos mesmos caminhos de gravação das telas
  // (mutatePersonalBoard / updateActivity / updateMeetingActionItem) e devolve um aviso com Desfazer.
  const todayCardLabel = (st) => (CARD_STATUS_META[st] || CARD_STATUS_META['nao-iniciada']).label;
  function todayGone() { notify('Este item não existe mais.', { tone: 'error' }); }
  function todayComplete(item) {
    const userName = currentUser.name;
    if (item.source === 'card') {
      const found = findCard(personalBoard, item.ref);
      if (!found) { todayGone(); return; }
      const prevStatus = found.card.status || (found.card.completed ? 'concluida' : 'nao-iniciada');
      const apply = (status) => mutatePersonalBoard((prev) => setCardStatusInBoard(prev, item.ref, status, { userName, nowIso: new Date().toISOString(), labelOf: todayCardLabel }));
      apply('concluida');
      notify(`Tarefa "${found.card.title}" concluída.`, { undo: () => apply(prevStatus === 'concluida' ? 'em-andamento' : prevStatus) });
    } else if (item.source === 'activity') {
      const pr = projects.find((x) => x.id === item.ref.pid);
      const a = pr && pr.activities.find((x) => x.id === item.ref.id && !x.deleted);
      if (!a) { todayGone(); return; }
      const prevStatus = a.status || 'nao-iniciado';
      const set = (st) => updateActivity(item.ref.pid, item.ref.id, { status: st }, `Status alterado em "${a.title}": ${STATUS_META[st].label}`);
      set('concluido');
      notify(`Atividade "${a.title}" concluída.`, { undo: () => set(prevStatus) });
    } else if (item.source === 'todo') {
      const { item: it } = findActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId);
      if (!it || it.deleted) { todayGone(); return; }
      const prevStatus = it.status || 'nao-iniciado';
      updateMeetingActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId, { status: 'concluida' });
      notify(`Tarefa "${it.title}" concluída.`, { undo: () => updateMeetingActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId, { status: prevStatus }) });
    }
  }
  function todayPostpone(item) {
    const tomorrow = addDaysIso(todayISOStr(), 1);
    const userName = currentUser.name;
    if (item.source === 'card') {
      const found = findCard(personalBoard, item.ref);
      if (!found) { todayGone(); return; }
      const prevDue = found.card.dueDate || '';
      const apply = (d) => mutatePersonalBoard((prev) => setCardDueDateInBoard(prev, item.ref, d, { userName, nowIso: new Date().toISOString(), fmt: fmtDate }));
      apply(tomorrow);
      notify(`Tarefa "${found.card.title}" adiada para amanhã.`, { undo: () => apply(prevDue) });
    } else if (item.source === 'activity') {
      const pr = projects.find((x) => x.id === item.ref.pid);
      const a = pr && pr.activities.find((x) => x.id === item.ref.id && !x.deleted);
      if (!a) { todayGone(); return; }
      // O prazo da atividade é `endDate || date`: com Fim definido adia o Fim; só com Início, adia o Início (e o Fim junto, como o campo Início faz).
      let patch;
      if (a.endDate) patch = a.date && a.date > tomorrow ? { date: tomorrow, endDate: tomorrow } : { endDate: tomorrow };
      else patch = { date: tomorrow, endDate: a.durationDays ? calcDeadline(tomorrow, a.durationDays) : tomorrow };
      const back = {};
      Object.keys(patch).forEach((k) => { back[k] = a[k] || ''; });
      const msg = (pa) => ('endDate' in pa && !('date' in pa) ? `Fim alterado em "${a.title}": ${pa.endDate ? fmtDate(pa.endDate) : 'sem data'}` : `Início alterado em "${a.title}": ${pa.date ? fmtDate(pa.date) : 'sem data'}`);
      updateActivity(item.ref.pid, item.ref.id, patch, msg(patch));
      notify(`Atividade "${a.title}" adiada para amanhã.`, { undo: () => updateActivity(item.ref.pid, item.ref.id, back, msg(back)) });
    } else if (item.source === 'todo') {
      const { item: it } = findActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId);
      if (!it || it.deleted) { todayGone(); return; }
      const prevDue = it.dueDate || '';
      updateMeetingActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId, { dueDate: tomorrow });
      notify(`Tarefa "${it.title}" adiada para amanhã.`, { undo: () => updateMeetingActionItem(item.ref.pid, item.ref.meetingId, item.ref.itemId, { dueDate: prevDue }) });
    }
  }
  function todayOpen(item) {
    if (item.source === 'card') {
      if (!canOpenMode('personal', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
      setPendingPersonalOpen({ boardId: item.ref.boardId, colId: item.ref.colId, cardId: item.ref.cardId });
      goToWorkspace('personal');
      return;
    }
    if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
    if (item.source === 'activity') {
      openCompanyWorkspace([item.ref.pid]);
      openActivityDetail(item.ref.pid, item.ref.id);
    } else if (item.source === 'todo' || item.source === 'meeting') {
      openCompanyWorkspace([item.ref.pid]);
      setView('meetings');
      if (item.source === 'todo') setPendingTodoOpen({ pid: item.ref.pid, meetingId: item.ref.meetingId, itemId: item.ref.itemId });
      openMeetingDetail(item.ref.pid, item.ref.meetingId);
    }
  }
  const todayActions = {
    complete: todayComplete,
    postpone: todayPostpone,
    open: todayOpen,
    openMeeting: (m) => todayOpen({ source: 'meeting', ref: m.ref }),
    openNotification: goToNotificationTarget,
    markNotificationRead,
    openAllNotifications: () => setShowNotifications(true),
    markAllNotificationsRead: () => markAllNotificationsRead(),
  };
  // "Continuar de onde parou": só o que ainda existe, com o rótulo atual; itens concretos antes dos módulos.
  function buildContinueItems() {
    const byKey = new Map(buildSearchItems().map((i) => [`${i.kind}:${i.rid}`, i]));
    const live = getRecents().map((r) => byKey.get(`${r.kind}:${r.id}`)).filter(Boolean).map((i) => ({ kind: i.kind, id: i.rid, label: i.label, hint: i.kind === 'module' ? '' : (i.hint || ''), run: i.run }));
    return [...live.filter((i) => i.kind !== 'module'), ...live.filter((i) => i.kind === 'module')].slice(0, 4);
  }
  shellRef.current = {
    sig: [currentUser.id, currentUser.avatar, currentUser.name, shellCurrent, shellModeKeys.join(','), theme, showNotifications, showMyProfile, profileTab, googleConnectResult ? 1 : 0, renataHome ? renataHome.n : 0, renataProjectId || '',
      notifications.map((n) => `${n.id}${n.read ? 1 : 0}`).join(',')].join('|'),
    user: currentUser, current: shellCurrent, modes: shellModes, theme, notifications, showNotifications,
    onGo: (k) => goToWorkspace(k),
    onHome: goHome ? () => goToWorkspace(null) : null,
    getSearchItems: buildSearchItems,
    onToggleNotifications: () => setShowNotifications((v) => !v),
    onOpenNotification: goToNotificationTarget, onMarkNotificationRead: markNotificationRead, onMarkAllNotificationsRead: markAllNotificationsRead,
    onOpenProfile: () => openProfile('perfil'),
    onOpenRenata: (question) => setRenataHome({ question: String(question || ''), n: Date.now() }),
    onToggleTheme: toggleTheme, onLogout: handleLogout,
    renataNode: (
      <>
        {renataHome && (
          <RenataHome
            key={renataHome.n}
            userId={currentUser.id}
            userName={currentUser.name}
            canSweep={currentUser.role === 'master' || currentUser.role === 'pricetax'}
            initialQuestion={renataHome.question}
            projects={projects.map((p) => ({ id: p.id, name: p.company.nomeFantasia || p.company.name || 'Sem nome' }))}
            onClose={() => setRenataHome(null)}
            onOpenCompany={(pid) => { setRenataHome(null); setTimeout(() => setRenataProjectId(pid), 160); }}
          />
        )}
        {renataProjectId && (() => {
          const rp = projects.find((p) => p.id === renataProjectId);
          if (!rp) return null;
          return (
            <ProjectAssistant
              key={renataProjectId}
              projectId={rp.id}
              projectName={rp.company.nomeFantasia || rp.company.name}
              view="resumo"
              defaultOpen
              onClosed={() => setRenataProjectId(null)}
              onOpenMeeting={(id) => { setRenataProjectId(null); setTimeout(() => { openCompanyWorkspace([rp.id]); setView('meetings'); openMeetingDetail(rp.id, id); }, 160); }}
              onReloadProjects={reloadProjects}
              onOpenAgenda={() => { setRenataProjectId(null); setTimeout(() => goToWorkspace('agenda'), 160); }}
              canStudyPareceres={currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax'}
            />
          );
        })()}
      </>
    ),
    profileNode: showMyProfile ? (
      <React.Suspense fallback={null}>
      <MyProfileModal
        user={currentUser}
        initialTab={profileTab}
        onDailySaved={() => setDailyReload((k) => k + 1)}
        googleConnectResult={googleConnectResult}
        onClose={() => { setShowMyProfile(false); setGoogleConnectResult(null); }}
        onAvatar={updateMyAvatar}
      />
      </React.Suspense>
    ) : null,
  };

  // Limites de erro (2026-10-16): uma tela que falha ao desenhar vira um aviso no lugar dela, com "Voltar ao início", e não mais o app em branco.
  // O estado do AppScreens (projetos, quadro, rascunhos) é preservado; só a tela que falhou é descartada. resetKey = a própria tela.
  const guard = (key, label, node) => (
    <SafeBoundary resetKey={key} label={label} where={key} actions={availableModes.length > 1 ? [{ label: 'Voltar ao início', onClick: () => goToWorkspace(null) }] : undefined}><React.Suspense fallback={<LoadingScreen theme={theme} />}>{node}</React.Suspense></SafeBoundary>
  );
  const guardModal = (key, label, onClose, node) => (
    <SafeBoundary variant="floating" resetKey={key} label={label} where={key.split(':')[0]} actions={[{ label: 'Fechar', onClick: onClose }]}><React.Suspense fallback={null}>{node}</React.Suspense></SafeBoundary>
  );

  if (availableModes.length === 0) {
    shellRef.current = null;
    return <NoAccessScreen user={currentUser} onLogout={handleLogout} onHome={availableModes.length > 0 ? () => goToWorkspace(null) : null} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!effectiveMode) {
    return guard('gate', 'a tela inicial', (
      <>
      <WorkspaceGateScreen
        user={currentUser}
        personalBoard={personalBoard}
        onPickCompany={hasCompanies ? () => goToWorkspace('company') : undefined}
        onPickPersonal={hasPersonal ? () => goToWorkspace('personal') : undefined}
        onPickXFlow={hasXflow ? () => goToWorkspace('xflow') : undefined}
        onPickAgenda={hasAgenda ? () => goToWorkspace('agenda') : undefined}
        onPickMacro={hasMacro ? () => goToWorkspace('macro') : undefined}
        onPickKnowledge={hasKnowledge ? () => goToWorkspace('knowledge') : undefined}
        onPickPareceres={hasPareceres ? () => goToWorkspace('pareceres') : undefined}
        onPickModelos={hasModelos ? () => goToWorkspace('modelos') : undefined}
        onPickCrm={hasCrm ? () => goToWorkspace('crm') : undefined}
        onPickUsers={currentUser.role === 'master' ? () => goToWorkspace('users') : undefined}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenProfile={() => openProfile('perfil')}
        onConfigureDaily={() => openProfile('dia')}
        dailyReload={dailyReload}
        projects={projects}
        notifications={notifications}
        todayIso={todayISOStr()}
        todayActions={todayActions}
        showWeek={hasPersonal}
        onOpenStats={hasPersonal ? () => { setPendingPersonalOpen({ stats: true }); goToWorkspace('personal'); } : undefined}
        continueItems={buildContinueItems()}
      />
      </>
    ));
  }

  if (effectiveMode === 'xflow') {
    return guard('xflow', 'o XFlow', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
      <XFlowScreen
        currentUser={currentUser}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onGoCompany={hasCompanies ? () => goToWorkspace('company') : null}
        onGoPersonal={hasPersonal ? () => goToWorkspace('personal') : null}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        notifications={notifications} showNotifications={showNotifications} onToggleNotifications={() => setShowNotifications((v) => !v)}
        onOpenNotification={goToNotificationTarget} onMarkNotificationRead={markNotificationRead} onMarkAllNotificationsRead={markAllNotificationsRead}
        pendingOpenTicketId={pendingXflowOpen} onPendingOpenConsumed={() => setPendingXflowOpen(null)}
        onTicketViewed={markTicketNotificationsReadLocally}
      />
      </React.Suspense>
    ));
  }

  if (effectiveMode === 'personal') {
    if (!personalBoardLoaded || !personalBoard) {
      return <PersonalBoardSkeleton theme={theme} />;
    }
    return guard('personal', 'a Gestão de Atividades', (
      <PersonalBoardScreen
        board={personalBoard}
        onMutate={mutatePersonalBoard}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onGoCompany={hasCompanies ? () => goToWorkspace('company') : null}
        onGoXFlow={hasXflow ? () => goToWorkspace('xflow') : null}
        currentUser={currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        pendingOpen={pendingPersonalOpen} onPendingOpenConsumed={() => setPendingPersonalOpen(null)}
        todayMeetings={buildTodayItems({ projects, personalBoard: null, user: currentUser, todayIso: todayISOStr() }).meetings}
        saveState={personalBoardSaveState}
        notifications={notifications} showNotifications={showNotifications} onToggleNotifications={() => setShowNotifications((v) => !v)}
        onOpenNotification={goToNotificationTarget} onMarkNotificationRead={markNotificationRead} onMarkAllNotificationsRead={markAllNotificationsRead}
      />
    ));
  }

  if (effectiveMode === 'agenda') {
    return guard('agenda', 'a Agenda', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
      <AgendaScreen
        currentUser={currentUser}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onGoCompany={hasCompanies ? () => goToWorkspace('company') : null}
        onGoPersonal={hasPersonal ? () => goToWorkspace('personal') : null}
        onGoXFlow={hasXflow ? () => goToWorkspace('xflow') : null}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        notifications={notifications} showNotifications={showNotifications} onToggleNotifications={() => setShowNotifications((v) => !v)}
        onOpenNotification={goToNotificationTarget} onMarkNotificationRead={markNotificationRead} onMarkAllNotificationsRead={markAllNotificationsRead}
      />
      </React.Suspense>
    ));
  }

  if (effectiveMode === 'macro') {
    return guard('macro', 'a Visão Geral', (
      <>
        <React.Suspense fallback={<LoadingScreen theme={theme} />}>
        <MacroOverviewScreen
          currentUser={currentUser}
          onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
          onGoCompany={hasCompanies ? () => goToWorkspace('company') : null}
          onGoPersonal={hasPersonal ? () => goToWorkspace('personal') : null}
          onGoXFlow={hasXflow ? () => goToWorkspace('xflow') : null}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          notifications={notifications} showNotifications={showNotifications} onToggleNotifications={() => setShowNotifications((v) => !v)}
          onOpenNotification={goToNotificationTarget} onMarkNotificationRead={markNotificationRead} onMarkAllNotificationsRead={markAllNotificationsRead}
          onOpenActivity={openActivityDetail}
          onOpenTodo={(pid, meetingId, itemId) => {
            if (!canOpenMode('company', currentUser)) { notify('Você não tem acesso a este módulo.', { tone: 'error' }); return; }
            openCompanyWorkspace([pid]);
            setView('meetings');
            setPendingTodoOpen({ pid, meetingId, itemId });
            openMeetingDetail(pid, meetingId);
          }}
          activityModalOpen={!!openActivityId}
        />
        </React.Suspense>
        {guardModal(openActivityId ? `activity-detail:${openActivityId.pid}:${openActivityId.id}` : 'activity-detail:', 'o detalhe da atividade', closeActivityDetail, renderActivityDetailModal())}
      </>
    ));
  }

  if (effectiveMode === 'knowledge') {
    return guard('knowledge', 'a Central de Conhecimento', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
      <KnowledgeCenterScreen
        currentUser={currentUser}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateToMeeting={(pid, meetingId) => {
          setWorkspaceMode('company');
          setCompanySelectionConfirmed(true);
          setSelectedProjectIds([pid]);
          setView('meetings');
          openMeetingDetail(pid, meetingId);
        }}
      />
      </React.Suspense>
    ));
  }

  if (effectiveMode === 'crm') {
    return guard('crm', 'o CRM', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
        <CrmScreen
          currentUser={currentUser}
          onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          notifications={notifications} showNotifications={showNotifications} onToggleNotifications={() => setShowNotifications((v) => !v)}
          onOpenNotification={goToNotificationTarget} onMarkNotificationRead={markNotificationRead} onMarkAllNotificationsRead={markAllNotificationsRead}
          pendingOpen={pendingCrmOpen} onPendingOpenConsumed={() => setPendingCrmOpen(null)}
          onOpenProject={(projectId) => openCompanyWorkspace([projectId])}
        />
      </React.Suspense>
    ));
  }

  if (effectiveMode === 'modelos') {
    return guard('modelos', 'os Modelos de documentos', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
      <ModelosScreen
        currentUser={currentUser}
        pendingOpenId={pendingModeloOpen}
        onPendingOpenConsumed={() => setPendingModeloOpen(null)}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      </React.Suspense>
    ));
  }

  if (effectiveMode === 'pareceres') {
    return guard('pareceres', 'os Pareceres', (
      <React.Suspense fallback={<LoadingScreen theme={theme} />}>
      <PareceresScreen
        currentUser={currentUser}
        pendingOpenId={pendingParecerOpen}
        onPendingOpenConsumed={() => setPendingParecerOpen(null)}
        onExit={availableModes.length > 1 ? () => goToWorkspace(null) : null}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      </React.Suspense>
    ));
  }

  const registeredProjects = projects.filter((p) => p.company.cnpj);
  const canPickCompanies = currentUser.companiesAccess && projects.length > 1;

  if (canPickCompanies && currentUser.isSuperAdmin && !actingOrg && !companySelectionConfirmed) {
    return guard('orgs', 'a escolha de organização', (
      <SuperAdminScreen
        organizations={organizations}
        error={orgAdminError}
        onClose={() => goToWorkspace(null)}
        closeLabel="Voltar"
        onLogout={handleLogout}
        onCreate={createOrganization}
        onSetStatus={updateOrganizationStatus}
        onEnter={enterOrganization}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    ));
  }

  if ((showUsers || effectiveMode === 'users') && currentUser.role === 'master') {
    return guard('users', 'a gestão de usuários', (
      <UsersManagementScreen
        users={users}
        access={userAccess}
        currentUser={currentUser}
        registeredProjects={registeredProjects}
        usersPanelError={usersPanelError}
        organizations={organizations}
        onClose={effectiveMode === 'users' ? () => goToWorkspace(null) : () => goToUsers(false)}
        closeLabel={effectiveMode === 'users' ? 'Voltar ao início' : undefined}
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
    ));
  }

  if (canPickCompanies && !companySelectionConfirmed) {
    return guard('company-picker', 'a escolha de empresas', (
      <>
        <CompanySelectorScreen
          projects={projects}
          initialSelected={selectedProjectIds}
          onConfirm={confirmCompanySelection}
          onLogout={handleLogout}
          onCreateNew={() => setShowCreateCompany(true)}
          onUpdateCompany={updateCompanyFields}
          onDeleteCompany={deleteCompany}
          onCloneCompany={(p) => setCloningProject(p)}
          onGoPersonal={hasPersonal ? () => goToWorkspace('personal') : undefined}
          onGoUsers={currentUser.role === 'master' ? () => goToUsers(true) : undefined}
          onGoXFlow={hasXflow ? () => goToWorkspace('xflow') : undefined}
          onGoAgenda={hasAgenda ? () => goToWorkspace('agenda') : undefined}
          onGoHome={goHome}
          actingOrg={actingOrg}
          onSwitchOrg={currentUser.isSuperAdmin ? exitOrganization : undefined}
          theme={theme}
          onToggleTheme={toggleTheme}
          currentUser={currentUser}
          onOpenProfile={() => openProfile('perfil')}
        />
        {showCreateCompany && (
          <CreateCompanyModal
            isSuperAdmin={currentUser.isSuperAdmin}
            organizations={organizations}
            projects={projects}
            onClose={() => setShowCreateCompany(false)}
            onCreate={async (company) => {
              await handleCreateCompanyPayload(company);
              setShowCreateCompany(false);
            }}
          />
        )}
        {cloningProject && (
          <CreateCompanyModal
            cloneSource={cloningProject}
            isSuperAdmin={currentUser.isSuperAdmin}
            organizations={organizations}
            projects={projects}
            onClose={() => setCloningProject(null)}
            onCreate={async (company) => {
              const { id, crossOrg, orgName } = await cloneCompany(cloningProject.id, company);
              if (!crossOrg) setSelectedProjectIds((prev) => [...prev, id]);
              setCloningProject(null);
              if (crossOrg) notify(`Empresa clonada na organização "${orgName}".`, { tone: 'success' });
            }}
          />
        )}
        <ToastStack toasts={appToasts} onDismiss={dismissAppToast} />
      </>
    ));
  }

  if (showOrgAdmin && currentUser.isSuperAdmin) {
    return guard('org-admin', 'a administração de organizações', (
      <SuperAdminScreen
        organizations={organizations}
        error={orgAdminError}
        onClose={() => goToOrgAdmin(false)}
        onCreate={createOrganization}
        onSetStatus={updateOrganizationStatus}
        onEnter={enterOrganization}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    ));
  }

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));
  const isMulti = selectedProjects.length > 1;
  const activeProject = selectedProjects.length === 1 ? selectedProjects[0] : null;
  const selectedGroupRoots = isMulti ? selectedProjects.map((p) => groupRootId(p.company, p.id)) : [];
  const isGroupView = isMulti && selectedGroupRoots.every((r) => r && r === selectedGroupRoots[0]);

  if (!activeProject && !isMulti) {
    return <NoAccessScreen user={currentUser} onLogout={handleLogout} onHome={availableModes.length > 0 ? () => goToWorkspace(null) : null} theme={theme} onToggleTheme={toggleTheme} />;
  }

  const pid = activeProject ? activeProject.id : null;

  function addLog(targetPid, action) {
    mutateProject(targetPid, (p) => p, action);
  }

  function updateActivity(targetPid, id, patch, logMsg) {
    const sourceProject = projects.find((p) => p.id === targetPid);
    const sourceActivity = sourceProject && sourceProject.activities.find((a) => a.id === id);

    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), logMsg, id);

    // Atividade de grupo: título/descrição/datas/fase/obrigatoriedade ficam sincronizados
    // entre as cópias irmãs; status/responsável/comentários/etc. continuam independentes.
    if (sourceActivity && sourceActivity.groupActivityId) {
      const GROUP_SYNC_FIELDS = ['title', 'desc', 'date', 'endDate', 'durationDays', 'phase', 'required'];
      const syncPatch = {};
      let hasSyncField = false;
      GROUP_SYNC_FIELDS.forEach((f) => {
        if (Object.prototype.hasOwnProperty.call(patch, f)) { syncPatch[f] = patch[f]; hasSyncField = true; }
      });
      if (hasSyncField) {
        projects.forEach((p) => {
          if (p.id === targetPid) return;
          const sibling = p.activities.find((a) => a.groupActivityId === sourceActivity.groupActivityId);
          if (sibling) {
            mutateProject(p.id, (pr) => ({ ...pr, activities: pr.activities.map((a) => (a.id === sibling.id ? { ...a, ...syncPatch } : a)) }), 'Sincronizado do grupo', sibling.id);
          }
        });
      }
    }
  }

  function addActivity(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = { id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '', responsible: (project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [], date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false };
    mutateProject(targetPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade criada: "${na.title}"`, na.id);
    // Sem isso, a atividade nasce lá no final da lista (ordenada por
    // data/mês) e "some" pro usuário — pedido do Rafael pra já abrir
    // direto pra edição, sem precisar caçar ela na lista depois.
    openActivityDetail(targetPid, na.id);
  }

  // Atividade "de grupo" (v2): registro único no projeto do Master, marcado com
  // as empresas-filhas envolvidas (involvedCompanyIds vazio = "Geral do Grupo").
  // Substitui o mecanismo antigo de cópia por empresa (groupActivityId) — cópias
  // já existentes continuam funcionando via o bloco de sync em updateActivity().
  function addGroupWideActivity(masterPid, involvedCompanyIds) {
    const project = projects.find((p) => p.id === masterPid);
    if (!project) return;
    const activities = project.activities;
    const nextMonth = activities.length ? Math.max(...activities.map((a) => a.month)) + 1 : 1;
    const phasesList = project.phases;
    const defaultPhaseId = phasesList.length ? phasesList[phasesList.length - 1].id : 1;
    const na = {
      id: uid('act'), month: nextMonth, phase: defaultPhaseId, title: 'Nova atividade', desc: '',
      responsible: (project.team[0] && project.team[0].name) || 'PRICETAX', priority: '', participants: [],
      date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false, subactivities: [],
      notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
      involvedCompanyIds: involvedCompanyIds || [],
    };
    mutateProject(masterPid, (p) => ({ ...p, activities: [...p.activities, na] }), `Atividade de grupo criada: "${na.title}"`, na.id);
    openActivityDetail(masterPid, na.id);
  }

  async function deleteActivity(targetPid, id) {
    const project = projects.find((p) => p.id === targetPid);
    const a = project && project.activities.find((x) => x.id === id);
    if (!a) return false;
    const okDelete = await askConfirm({ title: 'Excluir atividade?', message: `Para excluir "${a.title}", digite "${DELETE_CONFIRM_PHRASE}" abaixo.`, confirmLabel: 'Excluir', danger: true, requireText: DELETE_CONFIRM_PHRASE });
    if (!okDelete) return false;
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
    if (sub) pushAppUndoToast(`Subatividade "${sub.title}" excluída.`, () => restoreSub(targetPid, actId, subId), 8000);
  }

  // Remoção de item de lista dentro da atividade (anexo, comentário, link): guarda o item e a posição para o "Desfazer" devolver no lugar.
  function undoReinsert(targetPid, actId, field, item, index) {
    mutateProject(targetPid, (p) => ({
      ...p,
      activities: p.activities.map((a) => {
        if (a.id !== actId) return a;
        const list = [...(a[field] || [])];
        if (list.some((x) => x.id === item.id)) return a;
        list.splice(Math.min(index, list.length), 0, item);
        return { ...a, [field]: list };
      }),
    }), undefined, actId);
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

  async function addAttachments(targetPid, actId, files) {
    for (const file of files || []) {
      const att = await readFileAsAttachment(file, MAX_ATTACHMENT_BYTES);
      if (!att) continue;
      const project = projects.find((p) => p.id === targetPid);
      const act = project && project.activities.find((a) => a.id === actId);
      mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: [...(a.attachments || []), att] }) }), `Anexo adicionado em "${act ? act.title : ''}": ${att.name}`, actId);
    }
  }

  function addAttachment(targetPid, actId, file) {
    if (file) addAttachments(targetPid, actId, [file]);
  }

  function removeAttachment(targetPid, actId, attId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const att = act && (act.attachments || []).find((x) => x.id === attId);
    const attIdx = act ? (act.attachments || []).findIndex((x) => x.id === attId) : -1;
    if (att) pushAppUndoToast(`Anexo "${att.name || 'arquivo'}" removido.`, () => undoReinsert(targetPid, actId, 'attachments', att, attIdx), 8000);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, attachments: (a.attachments || []).filter((x) => x.id !== attId) }) }), att ? `Anexo removido em "${act.title}": ${att.name}` : undefined, actId);
  }

  function addComment(targetPid, actId, text, mentionIds, attachments, links) {
    const v = (text || '').trim();
    const atts = attachments || [];
    const lks = links || [];
    // Comentário só de anexo/link (sem texto) é válido — pedido do
    // Rafael pra dar pra mandar só um print/PDF/link sem precisar
    // escrever nada junto.
    if (!v && !atts.length && !lks.length) return;
    const c = {
      id: uid('cm'), text: v, ts: new Date().toISOString(), author: currentUser ? currentUser.name : '', authorId: currentUser ? currentUser.id : '',
      mentions: mentionIds && mentionIds.length ? mentionIds : [], attachments: atts, links: lks,
    };
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: [...(a.comments || []), c] }) }), `Comentário adicionado em "${act ? act.title : ''}"`, actId);
  }

  function removeComment(targetPid, actId, commentId) {
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const cm = act && (act.comments || []).find((c) => c.id === commentId);
    const cmIdx = act ? (act.comments || []).findIndex((c) => c.id === commentId) : -1;
    if (cm) pushAppUndoToast('Comentário removido.', () => undoReinsert(targetPid, actId, 'comments', cm, cmIdx), 8000);
    mutateProject(targetPid, (p) => ({ ...p, activities: p.activities.map((a) => a.id !== actId ? a : { ...a, comments: (a.comments || []).filter((c) => c.id !== commentId) }) }), undefined, actId);
  }

  function updateComment(targetPid, actId, commentId, text) {
    const v = (text || '').trim();
    const project = projects.find((p) => p.id === targetPid);
    const act = project && project.activities.find((a) => a.id === actId);
    const cur = act && (act.comments || []).find((c) => c.id === commentId);
    if (!v && !(cur && ((cur.attachments || []).length || (cur.links || []).length))) return;
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
    const lIdx = act ? (act.links || []).findIndex((x) => x.id === linkId) : -1;
    if (l) pushAppUndoToast(`Link "${l.label}" removido.`, () => undoReinsert(targetPid, actId, 'links', l, lIdx), 8000);
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

  // Reuniões (2026-09) — mesmo padrão de mutação das atividades
  // (mutateProject + soft-delete pra item de primeira classe, hard-delete
  // pra sub-item leve tipo attachment/link), num array próprio
  // `project.meetings` — não é atividade do cronograma, não deveria
  // aparecer nem contar em nenhuma métrica/filtro de atividade existente.
  function addMeeting(targetPid) {
    const project = projects.find((p) => p.id === targetPid);
    if (!project) return;
    const nm = {
      id: uid('mtg'), title: 'Nova reunião', date: todayISOStr(), time: '',
      participants: [], transcript: '', summary: '', decisions: '', actionItems: [],
      createdAt: new Date().toISOString(), deleted: false, deletedAt: '', deletedBy: '',
    };
    mutateProject(targetPid, (p) => ({ ...p, meetings: [...(p.meetings || []), nm] }), `Reunião criada: "${nm.title}"`);
    openMeetingDetail(targetPid, nm.id);
  }

  function updateMeeting(targetPid, meetingId, patch, logMsg) {
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((m) => (m.id === meetingId ? { ...m, ...patch } : m)),
    }), logMsg);
  }

  // Compartilhar reunião por link público, só-leitura — mesmo padrão de
  // token do quadro pessoal (genShareToken, gerado no cliente), mas sem
  // rota PATCH pública: quem recebe o link só visualiza.
  function toggleMeetingShare(targetPid, meetingId, visibility) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    const patch = { shareVisibility: visibility };
    if (visibility === 'public' && !m.shareToken) patch.shareToken = genShareToken();
    updateMeeting(targetPid, meetingId, patch, visibility === 'public' ? `Reunião "${m.title}" tornada pública por link` : `Reunião "${m.title}" tornada privada`);
  }

  function regenerateMeetingShareLink(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    updateMeeting(targetPid, meetingId, { shareToken: genShareToken() }, `Link público da reunião "${m.title}" regenerado (link anterior invalidado)`);
  }

  async function deleteMeeting(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return false;
    const okDelete = await askConfirm({ title: 'Excluir reunião?', message: `Para excluir "${m.title}", digite "${DELETE_CONFIRM_PHRASE}" abaixo.`, confirmLabel: 'Excluir', danger: true, requireText: DELETE_CONFIRM_PHRASE });
    if (!okDelete) return false;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, deleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser ? currentUser.name : '' } : x)),
    }), `Reunião excluída: "${m.title}"`);
    return true;
  }

  function restoreMeeting(targetPid, meetingId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, deleted: false, deletedAt: '', deletedBy: '' } : x)),
    }), m ? `Reunião restaurada: "${m.title}"` : undefined);
  }

  function toggleMeetingParticipant(targetPid, meetingId, name) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m) return;
    const has = (m.participants || []).includes(name);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, participants: has ? (x.participants || []).filter((n) => n !== name) : [...(x.participants || []), name] } : x)),
    }), `${has ? 'Participante removido' : 'Participante adicionado'} na reunião "${m.title}": ${name}`);
  }

  // Contato externo (cliente/fornecedor) fica salvo em project.externalContacts
  // pra reaparecer como sugestão nas próximas reuniões dessa empresa — não
  // precisa retypar nome/e-mail toda vez. Mesmo padrão JSONB de team/meetings,
  // sem tabela relacional nova (é sempre escopado a UMA empresa).
  function addMeetingParticipantFreeText(targetPid, meetingId, name, email) {
    const v = (name || '').trim();
    if (!v) return;
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    if (!m || (m.participants || []).includes(v)) return;
    const emailTrim = (email || '').trim();
    mutateProject(targetPid, (p) => {
      const contacts = p.externalContacts || [];
      const existing = contacts.find((c) => c.name.toLowerCase() === v.toLowerCase());
      const nextContacts = existing
        ? (emailTrim && !existing.email ? contacts.map((c) => (c.id === existing.id ? { ...c, email: emailTrim } : c)) : contacts)
        : [...contacts, { id: uid('ctt'), name: v, email: emailTrim, createdAt: new Date().toISOString() }];
      return {
        ...p,
        externalContacts: nextContacts,
        meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, participants: [...(x.participants || []), v] } : x)),
      };
    }, `Participante adicionado na reunião "${m.title}": ${v}`);
  }

  function addMeetingActionItem(targetPid, meetingId, overrides) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    const item = {
      id: uid('mai'), title: 'Nova tarefa', responsible: '', owner: 'pricetax', dueDate: '', status: 'nao-iniciado', deleted: false,
      subtitle: '', notes: '', subtasks: [], comments: [], attachments: [],
      createdBy: currentUser ? currentUser.name : '', createdAt: new Date().toISOString(),
      ...(overrides || {}),
    };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, actionItems: [...(x.actionItems || []), item] } : x)),
    }), m ? `Tarefa adicionada na reunião "${m.title}"` : undefined, item.id);
    return item.id;
  }

  // Gera uma frase legível a partir do diff — reaproveita o mesmo
  // mecanismo de log/histórico já usado pelas atividades de cronograma
  // (activityId + project.log), agora passando o id do item de TO_DO.
  function describeActionItemChange(item, patch) {
    const who = currentUser ? currentUser.name : 'Alguém';
    const parts = [];
    if ('status' in patch && patch.status !== item.status) {
      parts.push(`status de "${todoStatusMeta(item.status).label}" para "${todoStatusMeta(patch.status).label}"`);
    }
    if ('responsible' in patch && (patch.responsible || '') !== (item.responsible || '')) {
      parts.push(`responsável de "${item.responsible || 'sem responsável'}" para "${patch.responsible || 'sem responsável'}"`);
    }
    if ('dueDate' in patch && (patch.dueDate || '') !== (item.dueDate || '')) {
      parts.push(`prazo de "${item.dueDate ? fmtDate(item.dueDate) : 'sem prazo'}" para "${patch.dueDate ? fmtDate(patch.dueDate) : 'sem prazo'}"`);
    }
    if ('owner' in patch && patch.owner !== item.owner) {
      const label = (o) => (o === 'cliente' ? 'cliente' : 'PRICETAX');
      parts.push(`o lado responsável de "${label(item.owner)}" para "${label(patch.owner)}"`);
    }
    if ('title' in patch && patch.title !== item.title) parts.push('o título');
    if ('subtitle' in patch && (patch.subtitle || '') !== (item.subtitle || '')) parts.push('o contexto');
    if ('notes' in patch && (patch.notes || '') !== (item.notes || '')) parts.push('a descrição');
    if (!parts.length) return null;
    return `${who} alterou ${parts.join(', ')}`;
  }

  function findActionItem(targetPid, meetingId, itemId) {
    const project = projects.find((p) => p.id === targetPid);
    const m = project && (project.meetings || []).find((x) => x.id === meetingId);
    const item = m && (m.actionItems || []).find((it) => it.id === itemId);
    return { m, item };
  }

  function updateMeetingActionItem(targetPid, meetingId, itemId, patch) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const logMsg = item ? describeActionItemChange(item, patch) : null;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) })),
    }), logMsg || undefined, itemId);
  }

  function deleteMeetingActionItem(targetPid, meetingId, itemId) {
    const { m, item } = findActionItem(targetPid, meetingId, itemId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, deleted: true } : it)) })),
    }), item ? `Tarefa removida na reunião "${m.title}": ${item.title}` : undefined);
    if (item) pushAppUndoToast(`Tarefa "${item.title}" excluída.`, () => updateMeetingActionItem(targetPid, meetingId, itemId, { deleted: false }), 8000);
  }

  function duplicateActionItem(targetPid, meetingId, itemId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    if (!item) return;
    const copy = {
      ...item, id: uid('mai'), title: `${item.title} (cópia)`, status: 'nao-iniciado',
      subtasks: (item.subtasks || []).map((s) => ({ ...s, id: uid('sub'), done: false })),
      comments: [], attachments: [],
      createdBy: currentUser ? currentUser.name : '', createdAt: new Date().toISOString(),
    };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id === meetingId ? { ...x, actionItems: [...(x.actionItems || []), copy] } : x)),
    }), `${currentUser ? currentUser.name : 'Alguém'} duplicou a tarefa "${item.title}"`, copy.id);
    return copy.id;
  }

  // Vínculo tarefa → atividade do cronograma (Fase 1, docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). `value`: id da atividade, NO_ACTIVITY ("nenhuma se
  // aplica") ou '' (limpar). O campo vai junto do projeto (autosave); a decisão humana também vai pro livro-razão (aprendizado), sem bloquear.
  // "Sugerir atividades" para as tarefas pendentes de vínculo (Fase 3): grava antes, pede ao servidor, aplica só como SUGESTÃO (a pessoa confirma).
  async function requestTaskSuggestions(targetPid) {
    try {
      await flushProjectSave(targetPid);
      const r = await apiPost('/api/task-links/suggest', { projectId: targetPid });
      const sugg = (r && r.suggestions) || {};
      const project = projects.find((p) => p.id === targetPid);
      const applied = applySuggestionsToMeetings((project && project.meetings) || [], sugg).count;
      if (applied > 0) {
        mutateProject(targetPid, (p) => ({ ...p, meetings: applySuggestionsToMeetings(p.meetings || [], sugg).meetings }),
          `${currentUser ? currentUser.name : 'Alguém'} pediu sugestões da RENATA: ${applied} tarefa${applied === 1 ? '' : 's'} com atividade do cronograma sugerida (a confirmar)`);
      }
      const rest = r && r.remaining > 0 ? ` Restam ${r.remaining} tarefas: clique de novo para continuar.` : '';
      notify(applied > 0 ? `A RENATA sugeriu a atividade de ${applied} de ${r.considered} tarefas. Revise e confirme.${rest}` : `A RENATA não achou atividade com segurança para essas ${r.considered} tarefas.${rest}`, { tone: applied > 0 ? 'success' : 'info', ttlMs: 8000 });
    } catch (e) {
      notify((e && e.message) || 'Não foi possível pedir as sugestões agora.', { tone: 'error' });
    }
  }
  const canLinkTasks = !!currentUser && (currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax');
  function linkTaskToActivity(targetPid, meetingId, itemId, value) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const project = projects.find((p) => p.id === targetPid);
    if (!item || !project) return;
    const who = currentUser ? currentUser.name : 'Alguém';
    const act = value && value !== NO_ACTIVITY ? (project.activities || []).find((a) => a.id === value && !a.deleted) : null;
    if (value && value !== NO_ACTIVITY && !act) return;
    const now = new Date().toISOString();
    const sug = item.activityLink && item.activityLink.status === 'suggested' ? item.activityLink : null; // sugestão da RENATA ainda pendente
    const base = { confirmedBy: who, confirmedAt: now, source: sug ? 'sugestao' : 'manual', ...(sug ? { suggestedId: sug.suggestedId, confidence: sug.confidence } : {}) };
    const patch = !value
      ? { activityId: '', activityLink: null }
      : act
        ? { activityId: act.id, activityLink: { status: 'confirmed', ...base } }
        : { activityId: '', activityLink: { status: 'none', ...base } };
    const suggestedTitle = sug ? ((project.activities || []).find((a) => a.id === sug.suggestedId) || {}).title : '';
    const logMsg = !value ? (sug ? `${who} dispensou a sugestão de atividade da tarefa "${item.title}"` : `${who} removeu o vínculo da tarefa "${item.title}" com o cronograma`)
      : act ? (sug && act.id === sug.suggestedId ? `${who} confirmou a sugestão da RENATA: tarefa "${item.title}" na atividade "${act.title}"`
        : sug ? `${who} trocou a sugestão da RENATA${suggestedTitle ? ` ("${suggestedTitle}")` : ''}: tarefa "${item.title}" vinculada à atividade "${act.title}"`
          : `${who} vinculou a tarefa "${item.title}" à atividade "${act.title}"`)
        : `${who} marcou que nenhuma atividade do cronograma se aplica à tarefa "${item.title}"`;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) })),
    }), logMsg, itemId);
    if (value) {
      apiPost('/api/task-links', {
        projectId: targetPid, taskId: itemId, decision: act ? 'escolheu' : 'nenhuma', activityId: act ? act.id : undefined,
        suggestedActivityId: sug ? sug.suggestedId : undefined, confidence: sug ? sug.confidence : undefined, source: sug ? (sug.source || 'ia') : 'manual',
      }).catch(() => {});
    }
  }

  function addTodoSubtask(targetPid, meetingId, itemId, title) {
    const v = (title || '').trim();
    if (!v) return;
    const sub = { id: uid('sub'), title: v, done: false };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, subtasks: [...(it.subtasks || []), sub] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} adicionou a subtarefa "${v}"`, itemId);
  }

  function toggleTodoSubtask(targetPid, meetingId, itemId, subId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const sub = item && (item.subtasks || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, subtasks: (it.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) })) })),
    }), sub ? `${currentUser ? currentUser.name : 'Alguém'} marcou a subtarefa "${sub.title}" como ${sub.done ? 'não concluída' : 'concluída'}` : undefined, itemId);
  }

  function deleteTodoSubtask(targetPid, meetingId, itemId, subId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const sub = item && (item.subtasks || []).find((s) => s.id === subId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, subtasks: (it.subtasks || []).filter((s) => s.id !== subId) })) })),
    }), sub ? `${currentUser ? currentUser.name : 'Alguém'} removeu a subtarefa "${sub.title}"` : undefined, itemId);
  }

  function addTodoComment(targetPid, meetingId, itemId, text, attachments, links) {
    const v = (text || '').trim();
    const atts = attachments || [];
    const lks = links || [];
    if (!v && !atts.length && !lks.length) return;
    const comment = { id: uid('tc'), text: v, ts: new Date().toISOString(), user: currentUser ? currentUser.name : '', userId: currentUser ? currentUser.id : null, ...(atts.length ? { attachments: atts } : {}), ...(lks.length ? { links: lks } : {}) };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, comments: [...(it.comments || []), comment] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} comentou`, itemId);
  }

  function updateTodoComment(targetPid, meetingId, itemId, commentId, text) {
    const v = (text || '').trim();
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const cur = item && (item.comments || []).find((c) => c.id === commentId);
    if (!v && !(cur && ((cur.attachments || []).length || (cur.links || []).length))) return;
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, comments: (it.comments || []).map((c) => (c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c)) })) })),
    }), undefined, itemId);
  }

  function deleteTodoComment(targetPid, meetingId, itemId, commentId) {
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, comments: (it.comments || []).filter((c) => c.id !== commentId) })) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} removeu um comentário`, itemId);
  }

  function addTodoAttachment(targetPid, meetingId, itemId, fileMeta) {
    const att = { id: uid('att'), name: fileMeta.name, size: fileMeta.size, type: fileMeta.type, dataUrl: fileMeta.dataUrl, addedBy: currentUser ? currentUser.name : '', addedAt: new Date().toISOString() };
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id === itemId ? { ...it, attachments: [...(it.attachments || []), att] } : it)) })),
    }), `${currentUser ? currentUser.name : 'Alguém'} anexou o arquivo "${fileMeta.name}"`, itemId);
  }

  function deleteTodoAttachment(targetPid, meetingId, itemId, attId) {
    const { item } = findActionItem(targetPid, meetingId, itemId);
    const att = item && (item.attachments || []).find((a) => a.id === attId);
    mutateProject(targetPid, (p) => ({
      ...p,
      meetings: (p.meetings || []).map((x) => (x.id !== meetingId ? x : { ...x, actionItems: (x.actionItems || []).map((it) => (it.id !== itemId ? it : { ...it, attachments: (it.attachments || []).filter((a) => a.id !== attId) })) })),
    }), att ? `${currentUser ? currentUser.name : 'Alguém'} removeu o anexo "${att.name}"` : undefined, itemId);
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

  function commitAreaRow(id, overrides) {
    const found = activeProject && (activeProject.company.areas || []).find((r) => r.id === id);
    if (!found) return;
    const row = { ...found, ...(overrides || {}) };
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

  // Responsável padrão de empresa nova = quem cadastrou (equipe PRICETAX), exceto quando cadastra em OUTRA organização.
  function withDefaultOwner(companyBody, orgId) {
    const currentOrg = actingOrg ? actingOrg.id : currentUser.orgId;
    const staff = currentUser && (currentUser.role === 'master' || currentUser.role === 'pricetax');
    if (!staff || (orgId && orgId !== currentOrg) || (Array.isArray(companyBody.ownerIds) && companyBody.ownerIds.length)) return companyBody;
    return { ...companyBody, ownerIds: [currentUser.id], principalOwnerId: currentUser.id };
  }

  async function createCompany(company) {
    const { orgId, ...rawBody } = company;
    const companyBody = withDefaultOwner(rawBody, orgId);
    const res = await apiPost(withActingOrg('/api/projects', orgId), { company: companyBody });
    const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
    const crossOrg = !!orgId && orgId !== currentOrgId;
    if (!crossOrg) {
      setProjects((prev) => [...prev, normalizeProject(res.project)]);
    }
    const org = orgId && organizations.find((o) => o.id === orgId);
    return { id: res.project.id, crossOrg, orgName: org ? org.name : null };
  }

  async function createCompanyGroup({ master, children, groupName }) {
    const masterRes = await createCompany({ ...master, isGroupMaster: true, groupName });
    const masterId = masterRes.id;
    const childIds = [];
    for (const child of children) {
      const childRes = await createCompany({ ...child, groupId: masterId });
      childIds.push(childRes.id);
    }
    return { ids: [masterId, ...childIds], crossOrg: masterRes.crossOrg, orgName: masterRes.orgName };
  }

  async function handleCreateCompanyPayload(payload) {
    if (payload && payload.structureType === 'grupo') {
      const { ids, crossOrg, orgName } = await createCompanyGroup(payload);
      if (!crossOrg) {
        setSelectedProjectIds((prev) => [...prev, ...ids]);
        // Tela de seleção de empresas mantém seleção própria (Set local) que não
        // resincroniza sozinha após o mount — confirmar aqui garante que o usuário
        // caia direto na visão consolidada do grupo recém-criado (sem isso, ficaria
        // preso na tela de seleção com os checkboxes desatualizados).
        setCompanySelectionConfirmed(true);
        pushLocation('company');
      }
      if (crossOrg) notify(`Grupo cadastrado na organização "${orgName}".`, { tone: 'success' });
      return;
    }
    const { id, crossOrg, orgName } = await createCompany(payload);
    if (!crossOrg) setSelectedProjectIds((prev) => [...prev, id]);
    if (crossOrg) notify(`Empresa cadastrada na organização "${orgName}".`, { tone: 'success' });
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
      clientDateConfirmed: false,
      subactivities: (a.subactivities || []).filter((s) => !s.deleted).map((s) => ({ ...s, id: uid('s'), done: false, date: shift(s.date) })),
    }));

    const team = source.team.map((m) => ({ ...m, id: uid('team') }));

    const { orgId, ...rawBody } = company;
    const companyBody = withDefaultOwner(rawBody, orgId);
    const res = await apiPost(withActingOrg('/api/projects', orgId), {
      company: companyBody,
      activities,
      phases: source.phases,
      team,
      log: [{ ts: new Date().toISOString(), action: `Cronograma clonado a partir de "${source.company.name || 'empresa sem nome'}"`, user: currentUser ? currentUser.name : '' }],
    });
    const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
    const crossOrg = !!orgId && orgId !== currentOrgId;
    if (!crossOrg) {
      setProjects((prev) => [...prev, normalizeProject(res.project)]);
    }
    const org = orgId && organizations.find((o) => o.id === orgId);
    return { id: res.project.id, crossOrg, orgName: org ? org.name : null };
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
    if (statusChanging && nextStatus === 'pausado') {
      pushAppUndoToast(`"${label}" pausada e arquivada: some da lista principal (veja em "Pausadas e arquivadas") e as atividades em andamento foram pausadas junto.`, () => updateCompanyFields(pid, { status: 'ativo', resumeDate: '' }), 8000);
    }
  }

  async function loadUsers() {
    try {
      const res = await apiGet(withActingOrg('/api/users'));
      setUsers(res.users);
      setUserAccess(res.access || {});
      setUsersPanelError('');
    } catch (e) {
      setUsersPanelError(e.message);
    }
  }

  async function addUser(draft) {
    const { orgId, ...body } = draft;
    try {
      const res = await apiPost(withActingOrg('/api/users', orgId), body);
      const currentOrgId = actingOrg ? actingOrg.id : currentUser.orgId;
      if (!orgId || orgId === currentOrgId) {
        setUsers((prev) => [...prev, res.user]);
      }
      const org = orgId && organizations.find((o) => o.id === orgId);
      addUsersLog(`Usuário criado: ${res.user.name}${org ? ` (organização ${org.name})` : ''}`);
      setUsersPanelError('');
      return { crossOrg: !!orgId && orgId !== currentOrgId, orgName: org ? org.name : null };
    } catch (e) {
      return { error: e.message || 'Não foi possível criar o usuário.' };
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
    const toUsers = workspaceMode === 'users';
    setActingOrg({ id: org.id, name: org.displayName || org.name });
    setShowOrgAdmin(false);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
    setWorkspaceMode(toUsers ? 'users' : 'company');
    pushLocation(toUsers ? 'users' : 'company:select');
  }

  function exitOrganization() {
    setActingOrg(null);
    setCompanySelectionConfirmed(false);
    setSelectedProjectIds([]);
    pushLocation('company:select');
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
    if (id === currentUser.id) return 'Você não pode remover a si mesmo.';
    const target = users.find((u) => u.id === id);
    const masters = users.filter((u) => u.role === 'master');
    if (target && target.role === 'master' && masters.length <= 1) return 'Este é o único administrador (Master). Crie outro antes de remover este.';
    try {
      await apiDelete(`/api/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (target) addUsersLog(`Usuário removido: ${target.name}`);
      return '';
    } catch (e) {
      return e.message || 'Não foi possível remover o usuário.';
    }
  }

  async function exportExcel() {
    let XLSX;
    try { XLSX = await loadXlsx(); } catch (e) { notify('Não foi possível preparar a planilha agora. Recarregue a página e tente de novo.', { tone: 'error' }); return; }
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
    const prevTitle = document.title;
    const companyLabel = isMulti ? 'visao-geral' : (activeProject.company.nomeFantasia || activeProject.company.name || 'cronograma');
    document.title = `Relatorio PRICETAX - ${companyLabel} - ${fmtDate(todayISOStr())}`;
    window.print();
    document.title = prevTitle;
  }

  function exportMeetingPdf(meeting, companyName) {
    const prevTitle = document.title;
    document.title = `Reuniao PRICETAX - ${meeting.title || 'sem-titulo'} - ${fmtDate(meeting.date || todayISOStr())}`;
    setMeetingToPrint({ meeting, companyName });
    setTimeout(() => {
      window.print();
      document.title = prevTitle;
      setMeetingToPrint(null);
    }, 50);
  }

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
  const groupInfo = isGroupView ? {
    masterId: selectedGroupRoots[0],
    children: selectedProjects.filter((p) => p.id !== selectedGroupRoots[0]).map((p) => ({ id: p.id, name: p.company.nomeFantasia || p.company.name || 'Sem nome' })),
  } : null;

  // Ações secundárias do topbar — mesma lista de condições usada pelos botões desktop (linha a linha
  // logo abaixo), só que declarativa, para poder ser renderizada também dentro do menu "Mais" no mobile
  // sem duplicar a lógica de onClick/visibilidade.
  // "Abrir no CRM" (Onda 5): acha a empresa do CRM vinculada a este projeto e abre a ficha dela.
  async function openProjectInCrm() {
    if (!activeProject) return;
    try {
      const r = await apiGet(`/api/crm/companies/by-project/${encodeURIComponent(activeProject.id)}`);
      setPendingCrmOpen({ companyId: r.company.id, dealId: null });
      goToWorkspace('crm');
    } catch (e) {
      notify(e && e.status === 404 ? 'Esta empresa ainda não está no CRM.' : (e && e.message) || 'Não foi possível abrir o CRM.', { tone: e && e.status === 404 ? 'info' : 'error' });
    }
  }

  const moreMenuItems = [
    !isMulti && { icon: Settings, label: 'Empresa', onClick: () => setShowSettings(true) },
    !isMulti && currentUser.crmAccess && { icon: Briefcase, label: 'Abrir no CRM', onClick: () => openProjectInCrm() },
    canPickCompanies && { icon: Building2, label: 'Trocar empresas', onClick: () => goToCompanySelector() },
    (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Plus, label: 'Cadastrar empresa', onClick: () => setShowCreateCompany(true) },
    currentUser.isSuperAdmin && { icon: Building2, label: 'Organizações', onClick: () => goToOrgAdmin(true) },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: LayoutGrid, label: 'Fases', onClick: () => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); } },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Clock, label: `Log (${(activeProject.log || []).length})`, onClick: () => setShowLog(true) },
    !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && { icon: Trash2, label: 'Lixeira', onClick: () => setShowTrash(true) },
    { icon: FileSpreadsheet, label: 'Excel', onClick: exportExcel },
    { icon: FileText, label: 'PDF', onClick: exportPdf },
  ].filter(Boolean);

  return (
    <div className="page-root" style={S.page}>
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
          body, .page-root { background:#0B0E1A !important; color:#FFFFFF !important; }
          * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        }
      `}</style>

      {actingOrg && (
        <div className="no-print acting-org-banner" style={S.actingOrgBanner}>
          <Building2 size={13} /> Super Admin — visualizando como <strong>{actingOrg.name}</strong>
          <button style={S.actingOrgExitBtn} onClick={exitOrganization}>Sair da organização</button>
        </div>
      )}

      <div className="no-print t44" style={S.topbar}>
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
              {!isMobile && currentUser.crmAccess && <button style={S.iconBtn} onClick={openProjectInCrm} title="Abrir esta empresa no CRM"><Briefcase size={15} /> Abrir no CRM</button>}
            </>
          )}
          {!isMobile && canPickCompanies && (
            <button style={S.iconBtn} onClick={() => goToCompanySelector()}><Building2 size={15} /> Trocar empresas</button>
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
          {!isMobile && currentUser.isSuperAdmin && <button style={S.iconBtn} onClick={() => goToOrgAdmin(true)}><Building2 size={15} /> Organizações</button>}
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
          {isGroupView ? (
            <button style={S.primaryBtn} onClick={() => setShowGroupActivityModal(true)}><Plus size={15} /> Nova atividade</button>
          ) : isMulti ? (
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
        </div>
      </div>

      <div className="no-print t44" style={S.tabs}>
        {[
          !isMulti && { id: 'resumo', label: 'Resumo', icon: Gauge },
          !isMulti && { id: 'meetings', label: 'Reuniões', icon: Mic },
          !isMulti && { id: 'todo', label: 'Tarefas', icon: ListChecks },
          { id: 'timeline', label: 'Gantt', icon: CalendarDays },
          { id: 'table', label: 'Tabela', icon: List },
          { id: 'phases', label: 'Fases', icon: LayoutGrid },
          { id: 'kanban', label: 'Quadro', icon: Columns3 },
        ].filter(Boolean).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setView(t.id)} style={{ ...S.tab, ...(view === t.id ? S.tabActive : {}) }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <main className="no-print" style={{ ...S.main, ...(isMobile ? { padding: `14px 12px ${isMulti ? 0 : 64}px 12px` } : null) }}>
        <SafeBoundary resetKey={`company:${view}:${isMulti ? 'multi' : (activeProject ? activeProject.id : '')}`} label="esta aba" where="company-view" actions={isMulti && view === 'table' ? undefined : (view === 'table' ? [{ label: 'Ir para o Resumo', onClick: () => setView('resumo') }] : [{ label: 'Ir para a Tabela', onClick: () => setView('table') }])}>
        <React.Suspense fallback={<div style={S.emptyMuted}>Carregando…</div>}>
        {!isMulti && view === 'resumo' && (
          <ResumoView
            activities={activitiesSorted}
            orderMap={orderMap}
            phases={activeProject.phases}
            pid={activeProject.id}
            openDetail={openActivityDetail}
            companyColor={activeProject.company.color}
            taskCounts={taskCountsByActivity(activeProject.meetings)}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}
        {!isMulti && view === 'meetings' && (
          <MeetingsView
            meetings={activeProject.meetings || []}
            team={activeProject.team}
            pid={activeProject.id}
            companyName={activeProject.company.nomeFantasia || activeProject.company.name || ''}
            canDossier={!!currentUser && (currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax')}
            onAdd={() => addMeeting(activeProject.id)}
            onOpen={(id) => openMeetingDetail(activeProject.id, id)}
            showTrash={showMeetingsTrash}
            onShowTrash={() => setShowMeetingsTrash(true)}
            onHideTrash={() => setShowMeetingsTrash(false)}
            onRestore={(id) => restoreMeeting(activeProject.id, id)}
            onReloadProjects={reloadProjects}
          />
        )}
        {!isMulti && view === 'todo' && (
          <React.Suspense fallback={<div style={S.emptyMuted}>Carregando…</div>}>
          <TodoBoardView
            meetings={activeProject.meetings || []}
            team={activeProject.team}
            externalContacts={activeProject.externalContacts || []}
            clientName={activeProject.company && activeProject.company.name}
            pid={activeProject.id}
            currentUser={currentUser}
            log={activeProject.log || []}
            pushUndoToast={pushAppUndoToast}
            focusMeetingId={todoFocusMeetingId}
            onClearFocusMeeting={() => setTodoFocusMeetingId(null)}
            focusActivityId={todoFocusActivityId}
            onClearFocusActivity={() => setTodoFocusActivityId(null)}
            activityOptions={buildActivityOptions(activeProject.activities, activeProject.phases)}
            onLinkActivity={canLinkTasks ? linkTaskToActivity : undefined}
            onSuggestLinks={canLinkTasks ? () => requestTaskSuggestions(activeProject.id) : undefined}
            onOpenMeeting={(id) => { setView('meetings'); openMeetingDetail(activeProject.id, id); }}
            onAddItem={(meetingId, overrides) => addMeetingActionItem(activeProject.id, meetingId, overrides)}
            updateActionItem={updateMeetingActionItem}
            deleteActionItem={deleteMeetingActionItem}
            duplicateActionItem={duplicateActionItem}
            addSubtask={addTodoSubtask}
            toggleSubtask={toggleTodoSubtask}
            deleteSubtask={deleteTodoSubtask}
            addComment={addTodoComment}
            updateComment={updateTodoComment}
            deleteComment={deleteTodoComment}
            addAttachment={addTodoAttachment}
            deleteAttachment={deleteTodoAttachment}
          />
          </React.Suspense>
        )}
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
            openDetail={openActivityDetail}
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
            openDetail={openActivityDetail}
            companyColor={activeProject.company.color}
            taskCounts={taskCountsByActivity(activeProject.meetings)}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}
        {!isMulti && view === 'phases' && (
          <PhasesView activities={activitiesSorted} orderMap={orderMap} phases={activeProject.phases} pid={activeProject.id} updateActivity={updateActivity} openDetail={openActivityDetail} companyColor={activeProject.company.color} />
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
            openDetail={openActivityDetail}
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
              openDetail={openActivityDetail}
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
            openDetail={openActivityDetail}
            multiMode
            groupInfo={groupInfo}
          />
        )}
        {isMulti && view === 'phases' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <PhasesView activities={perCompanySorted[p.id]} orderMap={perCompanyOrderMap[p.id]} phases={p.phases} pid={p.id} updateActivity={updateActivity} openDetail={openActivityDetail} companyColor={p.company.color} />
            <button style={{ ...S.iconBtn, marginTop: 8 }} onClick={() => addActivity(p.id)}><Plus size={14} /> Nova atividade em {p.company.name || 'empresa'}</button>
          </div>
        ))}
        {isMulti && view === 'kanban' && (
          <KanbanView
            activities={multiActivities}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            openDetail={openActivityDetail}
            multiMode
            groupInfo={groupInfo}
          />
        )}
        </React.Suspense>
        </SafeBoundary>
      </main>

      <React.Suspense fallback={null}>
        <PrintReport projects={isMulti ? selectedProjects : [activeProject]} generatedAt={fmtDate(todayISOStr())} />
      </React.Suspense>
      {meetingToPrint && <MeetingPrintReport meeting={meetingToPrint.meeting} companyName={meetingToPrint.companyName} />}

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
              <AreaRow
                key={row.id} row={row}
                onUpdate={(patch) => updateAreaRow(row.id, patch)}
                onCommit={(overrides) => commitAreaRow(row.id, overrides)}
                onRemove={() => removeAreaRow(row.id)}
              />
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
                      <button aria-label="Remover membro" title="Remover membro" style={S.chipX} onClick={() => removeMember(m.id)}><X aria-hidden="true" size={13} /></button>
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
              <button aria-label="Adicionar membro" title="Adicionar membro" style={S.iconBtn} onClick={addMember}><Plus aria-hidden="true" size={14} /></button>
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
              <button title={!linkUserId ? 'Escolha um usuário para vincular' : undefined}
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
                <PhaseRow
                  key={p.id} p={p}
                  dragPhaseId={dragPhaseId} setDragPhaseId={setDragPhaseId}
                  reorderPhase={reorderPhase} updatePhase={updatePhase} deletePhase={deletePhase}
                  addLog={addLog} phasesEditingProjectId={phasesEditingProjectId}
                  canDelete={target.phases.length > 1}
                />
              ))}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addPhase}><Plus size={14} /> Nova fase</button>
          </SidePanel>
        );
      })()}

      {guardModal(openActivityId ? `activity-detail:${openActivityId.pid}:${openActivityId.id}` : 'activity-detail:', 'o detalhe da atividade', closeActivityDetail, renderActivityDetailModal())}
      {guardModal(openMeetingId ? `meeting-detail:${openMeetingId.pid}:${openMeetingId.id}` : 'meeting-detail:', 'o detalhe da reunião', closeMeetingDetail, renderMeetingDetailModal())}

      {showCreateCompany && (
        <CreateCompanyModal
          isSuperAdmin={currentUser.isSuperAdmin}
          organizations={organizations}
          projects={projects}
          onClose={() => setShowCreateCompany(false)}
          onCreate={async (company) => {
            await handleCreateCompanyPayload(company);
            setShowCreateCompany(false);
          }}
        />
      )}


      {showGroupActivityModal && (
        <GroupActivityCompaniesModal
          groupChildren={selectedProjects.filter((p) => p.id !== selectedGroupRoots[0]).map((p) => ({ id: p.id, name: p.company.nomeFantasia || p.company.name || 'Sem nome' }))}
          onClose={() => setShowGroupActivityModal(false)}
          onCreate={(involvedCompanyIds) => addGroupWideActivity(selectedGroupRoots[0], involvedCompanyIds)}
        />
      )}

      <ToastStack toasts={appToasts} onDismiss={dismissAppToast} />

      {!isMulti && (() => {
        const openMeeting = openMeetingId && openMeetingId.pid === activeProject.id
          ? (activeProject.meetings || []).find((m) => m.id === openMeetingId.id)
          : null;
        return (
          <ProjectAssistant
            projectId={activeProject.id}
            projectName={activeProject.company && (activeProject.company.nomeFantasia || activeProject.company.name)}
            view={view}
            openMeetingId={openMeeting ? openMeeting.id : null}
            openMeetingTitle={openMeeting ? openMeeting.title : null}
            openMeetingDate={openMeeting ? openMeeting.date : null}
            onOpenMeeting={(id) => { setView('meetings'); openMeetingDetail(activeProject.id, id); }}
            onReloadProjects={reloadProjects}
            onOpenAgenda={() => goToWorkspace('agenda')}
            canStudyPareceres={currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax'}
          />
        );
      })()}
      {/* A RENATA agora aparece em todas as abas de UMA empresa: no celular o botão fica menor e o conteúdo ganha folga embaixo para ele não cobrir o último botão/linha. */}
      {!isMulti && <style>{'@media (max-width: 768px) { .asst-fab { bottom: 12px !important; right: 12px !important; padding: 9px 13px !important; font-size: 12px !important; } }'}</style>}
    </div>
  );
}

export function LoadingScreen({ theme }) {
  return (
    <div className="page-root" style={S.page}>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <BrandLogo theme={theme} style={S.loginLogo} />
          <div style={S.loginSub}>Carregando...</div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ value, onChange, placeholder, autoComplete, label }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} aria-label={label || placeholder} autoComplete={autoComplete} style={{ paddingRight: 72 }} />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setVisible((v) => !v)}
        className="login-eye"
        style={{ position: 'absolute', right: 2, top: 0, bottom: 0, minWidth: 64, padding: '0 8px', background: 'transparent', border: 'none', borderRadius: 6, color: 'var(--text-5)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}

function LoginGate({ onLogin, onChangePasswordAndLogin, loginError, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login');
  const [showForgot, setShowForgot] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next) {
    setMode(next);
    setShowForgot(false);
    setLocalError('');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    if (mode === 'login') {
      if (!username || !password) return;
      setSubmitting(true);
      await onLogin(username, password);
      setSubmitting(false);
      return;
    }
    setLocalError('');
    if (!username || !currentPassword || !newPassword) { setLocalError('Preencha usuário, senha atual e nova senha.'); return; }
    if (newPassword.length < 4) { setLocalError('A nova senha precisa ter pelo menos 4 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setLocalError('A confirmação não confere com a nova senha.'); return; }
    setSubmitting(true);
    await onChangePasswordAndLogin(username, currentPassword, newPassword);
    setSubmitting(false);
  }

  return (
    <div className="page-root" style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=password] {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:9px 10px; font-size:14px; width:100%; min-height:44px;
        }
        input[type=text]:focus, input[type=password]:focus { outline:none; border-color:#F5C400; box-shadow:0 0 0 2px rgba(245,196,0,.35); }
        .login-eye:focus-visible, .login-link:focus-visible { outline:2px solid #F5C400; outline-offset:2px; }
      `}</style>
      <div style={S.themeToggleCorner}>
        <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
      </div>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <BrandLogo theme={theme} style={S.loginLogo} />
          <div style={S.loginEyebrow}>Painel PRICETAX</div>
          <h1 style={S.loginTitle}>{mode === 'login' ? 'Entrar' : 'Trocar senha'}</h1>
          <p style={S.loginSub}>
            {mode === 'login' ? 'Use seu usuário e senha para acessar o painel.' : 'Informe seu usuário, a senha atual e a nova senha. Você já entra em seguida.'}
          </p>
          {loginError && <div style={S.loginBlockedMsg} role="alert">{loginError.message}</div>}
          {localError && <div style={S.loginBlockedMsg} role="alert">{localError}</div>}
          {mode === 'login' ? (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" aria-label="Usuário" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" autoComplete="current-password" />
              <button title={submitting ? 'Aguarde terminar de entrar' : undefined} type="submit" style={{ ...S.primaryBtn, minHeight: 44 }} disabled={submitting}>{submitting ? 'Entrando...' : 'Entrar'}</button>
            </form>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" aria-label="Usuário" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <PasswordField value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Senha atual" autoComplete="current-password" />
              <PasswordField value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova senha" autoComplete="new-password" />
              <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar nova senha" autoComplete="new-password" />
              <button title={submitting ? 'Aguarde terminar de trocar a senha' : undefined} type="submit" style={{ ...S.primaryBtn, minHeight: 44 }} disabled={submitting}>{submitting ? 'Trocando...' : 'Trocar senha e entrar'}</button>
            </form>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 18px', marginTop: 10 }}>
            <button
              type="button"
              className="login-link"
              onClick={() => switchMode(mode === 'login' ? 'changePassword' : 'login')}
              style={S.loginLinkBtn}
            >
              {mode === 'login' ? 'Trocar senha' : 'Voltar para o login'}
            </button>
            {mode === 'login' && (
              <button type="button" className="login-link" aria-expanded={showForgot} onClick={() => setShowForgot((v) => !v)} style={S.loginLinkBtn}>
                Esqueci a senha
              </button>
            )}
          </div>
          {mode === 'login' && showForgot && (
            <div role="status" style={S.loginForgotNote}>
              Peça a um administrador da PRICETAX para redefinir a sua senha (Gestão de Usuários › Redefinir senha). Ele define uma nova senha para você; com ela você entra e pode trocar por uma sua em &quot;Trocar senha&quot; (aqui no login) ou em Meu perfil › Alterar senha.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function CreateCompanyModal({ onClose, onCreate, cloneSource, isSuperAdmin, organizations, projects }) {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(null);
  const [form, setForm] = useState({ name: '', nomeFantasia: '', color: PHASE_COLORS[0], logo: '', clientType: '', orgId: '', structureType: 'individual', groupName: '' });
  const [children, setChildren] = useState([]);
  const [linkGroupId, setLinkGroupId] = useState('');
  const isMobile = useIsMobile();
  const isGroup = form.structureType === 'grupo' && !cloneSource;
  const availableGroups = (projects || []).filter((p) => p.company.isGroupMaster);
  const isDirty = useDirtyForm({ cnpj, form, children, linkGroupId });
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }

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

  function addChildRow() {
    setChildren((prev) => [...prev, { id: uid('child'), cnpj: '', name: '', nomeFantasia: '', fetched: null, loading: false, error: '' }]);
  }
  function removeChildRow(id) {
    setChildren((prev) => prev.filter((c) => c.id !== id));
  }
  function updateChildCnpj(id, value) {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, cnpj: value } : c)));
  }
  async function buscarChild(id) {
    const child = children.find((c) => c.id === id);
    if (!child || !child.cnpj.trim()) return;
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, loading: true, error: '' } : c)));
    try {
      const res = await apiPost('/api/cnpj/lookup', { cnpj: child.cnpj });
      if (res.erro) {
        setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, loading: false, error: res.erro } : c)));
      } else {
        setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, loading: false, fetched: res, name: res.razaoSocial || '', nomeFantasia: res.nomeFantasia || '' } : c)));
      }
    } catch (e) {
      setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, loading: false, error: e.message } : c)));
    }
  }

  function buildCompanyPayload(base, fetchedData) {
    return {
      cnpj: (fetchedData && fetchedData.cnpjFormatado) || base.cnpj,
      name: base.name,
      nomeFantasia: base.nomeFantasia,
      clientType: form.clientType,
      color: form.color,
      logo: base.logo || '',
      orgId: form.orgId,
      regimeTributario: fetchedData ? fetchedData.regimeTributario : '',
      porte: fetchedData ? fetchedData.porte : '',
      uf: fetchedData ? fetchedData.uf : '',
      municipio: fetchedData ? fetchedData.municipio : '',
      cnaePrincipal: fetchedData ? fetchedData.cnaePrincipal : '',
      descricaoCnae: fetchedData ? fetchedData.descricaoCnae : '',
      cnaesSecundarios: fetchedData ? fetchedData.cnaesSecundarios : [],
      qsa: fetchedData ? fetchedData.qsa : [],
    };
  }

  async function submit() {
    if (!form.name.trim()) { setError('Preencha a razão social antes de continuar.'); return; }
    if (!form.clientType) { setError('Selecione o tipo de cliente antes de continuar.'); return; }
    setError('');
    setSaving(true);
    try {
      if (isGroup) {
        const validChildren = children.filter((c) => c.name.trim());
        await onCreate({
          structureType: 'grupo',
          groupName: form.groupName.trim() || form.name,
          master: buildCompanyPayload({ cnpj, name: form.name, nomeFantasia: form.nomeFantasia, logo: form.logo }, fetched),
          children: validChildren.map((c) => buildCompanyPayload(c, c.fetched)),
        });
      } else {
        const payload = buildCompanyPayload({ cnpj, name: form.name, nomeFantasia: form.nomeFantasia, logo: form.logo }, fetched);
        if (linkGroupId) payload.groupId = linkGroupId;
        await onCreate(payload);
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <DialogOverlay style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif", ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose}>
      <style>{`
        input[type=text], input[type=email], input[type=password], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
        }
        input[type=text]:focus, input[type=email]:focus, input[type=password]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
      `}</style>
      <div className="t44" style={{ ...S.detailBox, width: 'min(560px, 100%)', height: 'auto', maxHeight: '88vh', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{cloneSource ? 'Clonar empresa' : 'Cadastrar empresa'}</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>

        {cloneSource && (
          <div style={{ ...S.fieldHint, marginBottom: 12 }}>
            As atividades de <strong>{cloneSource.company.name || 'empresa de origem'}</strong> serão copiadas para essa nova empresa. A primeira atividade passará a começar em {fmtDate(toISODate(addDays(parseDate(todayISOStr()), 10)))}, e as demais serão recalculadas a partir daí, mantendo exatamente o mesmo espaçamento entre elas.
          </div>
        )}

        {!cloneSource && (
          <>
            <div style={S.subSectionLabel}>Tipo de estrutura</div>
            <div style={S.priorityPickerRow}>
              <button
                type="button"
                style={{ ...S.priorityPickerChip, color: '#3ea6ff', background: form.structureType === 'individual' ? 'rgba(62,166,255,.14)' : 'transparent', borderColor: form.structureType === 'individual' ? 'rgba(62,166,255,.5)' : 'var(--border-3)' }}
                onClick={() => setForm((f) => ({ ...f, structureType: 'individual' }))}
              >
                Empresa Individual
              </button>
              <button
                type="button"
                style={{ ...S.priorityPickerChip, color: '#9b7af5', background: form.structureType === 'grupo' ? 'rgba(155,122,245,.14)' : 'transparent', borderColor: form.structureType === 'grupo' ? 'rgba(155,122,245,.5)' : 'var(--border-3)' }}
                onClick={() => setForm((f) => ({ ...f, structureType: 'grupo' }))}
              >
                Grupo Empresarial
              </button>
            </div>
            <div style={{ ...S.fieldHint, marginBottom: 12 }}>
              {form.structureType === 'grupo'
                ? 'Um CNPJ Master com várias empresas do mesmo grupo econômico vinculadas a ele.'
                : 'Uma única empresa/CNPJ, com dados totalmente isolados das demais.'}
            </div>
          </>
        )}

        {isGroup && (
          <>
            <div style={S.subSectionLabel}>Nome do grupo</div>
            <input type="text" value={form.groupName} onChange={(e) => setForm((f) => ({ ...f, groupName: e.target.value }))} placeholder={form.name || 'Nome do grupo empresarial'} />
          </>
        )}

        {!isGroup && !cloneSource && !form.orgId && availableGroups.length > 0 && (
          <>
            <div style={S.subSectionLabel}>Vincular a um grupo existente (opcional)</div>
            <select value={linkGroupId} onChange={(e) => setLinkGroupId(e.target.value)}>
              <option value="">Não vincular — empresa avulsa</option>
              {availableGroups.map((g) => <option key={g.id} value={g.id}>{g.company.groupName || g.company.name}</option>)}
            </select>
            <div style={{ ...S.fieldHint, marginBottom: 12 }}>
              Já cadastra essa empresa como filial do grupo escolhido, sem precisar editar depois.
            </div>
          </>
        )}

        {isSuperAdmin && (
          <>
            <div style={S.subSectionLabel}>Organização (base)</div>
            <select value={form.orgId} onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}>
              <option value="">Sua organização atual</option>
              {(organizations || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div style={{ ...S.fieldHint, marginBottom: 12 }}>Define em qual base essa empresa vai entrar.</div>
          </>
        )}

        <div style={S.subSectionLabel}>{isGroup ? 'CNPJ Master' : 'CNPJ'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <button title={loading ? 'Aguarde terminar a busca' : undefined} style={{ ...S.iconBtn, flexShrink: 0 }} onClick={buscar} disabled={loading}>
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

            {isGroup && (
              <>
                <div style={{ ...S.subSectionLabel, marginTop: 18 }}>Empresas do grupo (filiais)</div>
                <div style={S.fieldHint}>
                  Adicione o CNPJ de cada empresa que pertence a este grupo — nome e dados são
                  buscados na Receita. Elas herdam o tipo de cliente e a cor do grupo; dá pra
                  ajustar individualmente depois, na tela da própria empresa. Pode deixar sem
                  nenhuma e adicionar depois também.
                </div>
                {children.map((c) => (
                  <div key={c.id} style={{ ...S.accessBlock, marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={c.cnpj}
                          onChange={(e) => updateChildCnpj(c.id, e.target.value)}
                          placeholder="00.000.000/0000-00"
                          onKeyDown={(e) => e.key === 'Enter' && buscarChild(c.id)}
                        />
                      </div>
                      <button title={c.loading ? 'Aguarde terminar a busca' : undefined} style={{ ...S.iconBtn, flexShrink: 0 }} onClick={() => buscarChild(c.id)} disabled={c.loading}>
                        {c.loading ? 'Buscando...' : 'Buscar dados'}
                      </button>
                      <button aria-label="Remover empresa da lista" title="Remover empresa da lista" style={S.iconBtnGhost} onClick={() => removeChildRow(c.id)}><X aria-hidden="true" size={16} /></button>
                    </div>
                    {c.error && <div style={{ ...S.loginBlockedMsg, marginTop: 8 }}>{c.error}</div>}
                    {(c.name || c.nomeFantasia) && (
                      <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700 }}>{c.nomeFantasia || c.name}</div>
                    )}
                  </div>
                ))}
                <button style={{ ...S.iconBtn, marginTop: 10 }} onClick={addChildRow}><Plus size={14} /> Adicionar empresa</button>
              </>
            )}

            <button title={saving ? 'Aguarde terminar de criar' : undefined} style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={saving}>
              {saving
                ? (cloneSource ? 'Clonando...' : (isGroup ? 'Criando grupo...' : 'Criando...'))
                : (cloneSource ? 'Clonar empresa' : (isGroup ? 'Criar grupo' : 'Criar empresa'))}
            </button>
          </>
        )}
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={form.name.trim() && form.clientType ? submit : undefined}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
          saving={saving}
        />
      )}
    </DialogOverlay>
  );
}

export function UserAvatar({ user, size = 32 }) {
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


export function TeamLinkBadge({ link, companyName }) {
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


function GroupActivityCompaniesModal({ groupChildren, onCreate, onClose }) {
  const [involvedIds, setInvolvedIds] = useState(() => new Set());
  const isMobile = useIsMobile();
  const isDirty = useDirtyForm(Array.from(involvedIds));
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }

  function toggle(id) {
    setInvolvedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirm() {
    onCreate(Array.from(involvedIds));
    onClose();
  }

  return (
    <DialogOverlay style={{ ...S.detailOverlay, fontFamily: "'Inter', sans-serif", ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose}>
      <div className="t44" style={{ ...S.detailBox, width: 'min(440px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Nova atividade do grupo</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>

        <div style={S.subSectionLabel}>Empresas envolvidas</div>
        <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 8 }}>
          Deixe tudo desmarcado para uma demanda geral do grupo, sem empresa específica.
        </div>
        {groupChildren.map((c) => (
          <label key={c.id} style={S.cnpjCheckRow}>
            <input type="checkbox" checked={involvedIds.has(c.id)} onChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}

        <button style={{ ...S.primaryBtn, marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={confirm}>
          Criar atividade
        </button>
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={confirm}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
        />
      )}
    </DialogOverlay>
  );
}


function WorkspaceGateScreen({ user, personalBoard, onPickCompany, onPickPersonal, onPickXFlow, onPickAgenda, onPickMacro, onPickKnowledge, onPickPareceres, onPickModelos, onPickCrm, onPickUsers, onLogout, theme, onToggleTheme, onOpenProfile, onConfigureDaily, dailyReload, projects, notifications, todayIso, todayActions, showWeek, onOpenStats, continueItems }) {
  const todayPrefs = useNotifPrefs();
  const overdueNow = useMemo(() => buildTodayItems({ projects, personalBoard, user, todayIso, hiddenSources: hiddenTodaySources(todayPrefs.todaySources) }).overdue.length, [projects, personalBoard, user, todayIso, todayPrefs.todaySources]);
  const gateGroups = [
    { id: 'diario', title: 'Trabalho diário', items: [
      onPickPersonal && { id: 'personal', Icon: Columns3, title: 'Gestão de Atividades', desc: 'Seu quadro pessoal de tarefas e prazos.', onPick: onPickPersonal },
      onPickAgenda && { id: 'agenda', Icon: CalendarDays, title: 'Agenda', desc: 'Seus compromissos e horários livres.', onPick: onPickAgenda },
      onPickXFlow && { id: 'xflow', Icon: Bug, title: 'XFlow', desc: 'TASKs dos produtos internos, do relato à validação.', onPick: onPickXFlow },
    ] },
    { id: 'clientes', title: 'Clientes', items: [
      onPickCompany && { id: 'company', Icon: Building2, title: 'Empresas', desc: 'Cronograma de reforma tributária de cada empresa.', onPick: onPickCompany },
      onPickMacro && { id: 'macro', Icon: Globe, title: 'Visão Geral', desc: 'Entregas e reuniões de todas as empresas, por data.', onPick: onPickMacro },
      onPickCrm && { id: 'crm', Icon: Briefcase, title: 'CRM', desc: 'Contatos e negócios, do primeiro contato ao projeto.', onPick: onPickCrm },
    ] },
    { id: 'conhecimento', title: 'Conhecimento', items: [
      onPickKnowledge && { id: 'knowledge', Icon: Sparkles, title: 'Conhecimento', desc: 'O que a RENATA aprendeu e onde usou.', onPick: onPickKnowledge },
      onPickPareceres && { id: 'pareceres', Icon: FileText, title: 'Pareceres PRICETAX', desc: 'Pareceres em PDF para compartilhar, com comentários.', onPick: onPickPareceres },
      onPickModelos && { id: 'modelos', Icon: FolderOpen, title: 'Modelos de documentos', desc: 'Contratos, propostas e planilhas prontos.', onPick: onPickModelos },
    ] },
    { id: 'admin', title: 'Administração', items: [
      onPickUsers && { id: 'users', Icon: UserCog, title: 'Gestão de Usuários', desc: 'Acessos, permissões e senhas.', onPick: onPickUsers },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length > 0);
  return (
    <div className="page-root" style={S.page}>
      <div style={S.companySelectorWrap}>
        <div style={S.companySelectorHeader}>
          <BrandLogo theme={theme} style={{ ...S.loginLogo, marginBottom: 0 }} />
        </div>
        <h1 style={{ ...S.loginTitle, marginBottom: 14 }}>Olá, {(user.name || '').split(' ')[0] || user.username}</h1>

        <DailyCards onConfigure={onConfigureDaily} reloadKey={dailyReload} />

        <TodayPanel projects={projects} personalBoard={personalBoard} user={user} notifications={notifications} todayIso={todayIso} actions={todayActions} />
        {showWeek && <WeekSummary overdueNow={overdueNow} onOpenStats={onOpenStats} />}

        {/* O quadro pessoal NÃO vai para a RENATA aqui: o painel "Hoje" acima já lista os cartões atrasados/de hoje com ações. */}
        <RenataAgendaBriefing user={user} onOpenAgenda={onPickAgenda} personalBoard={null} onOpenPersonal={onPickPersonal} />

        <ContinueStrip items={continueItems} onOpen={(it) => it.run()} />

        <p style={{ ...S.loginSub, marginBottom: 14 }}>Onde você quer trabalhar agora? Dá pra trocar a qualquer momento.</p>

        <style>{`
          .gate-card:hover { border-color: #F5C400 !important; }
          .gate-card:focus-visible { outline: 2px solid #F5C400; outline-offset: 2px; }
        `}</style>
        {gateGroups.map((g) => (
          <section key={g.id} aria-labelledby={`gate-grp-${g.id}`} style={S.gateGroup}>
            <h2 id={`gate-grp-${g.id}`} style={S.gateGroupTitle}>{g.title}</h2>
            <div style={S.gateGrid}>
              {g.items.map((it) => (
                <button key={it.id} className="gate-card" style={S.gateCard} onClick={it.onPick}>
                  <it.Icon size={22} color="#F5C400" aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span style={S.gateCardText}>
                    <span style={S.gateCardTitle}>{it.title}</span>
                    <span style={S.gateCardDesc}>{it.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}


// Avisos: desde a Onda 2 todos vão para o MESMO empilhamento global (src/ui/dialogs.jsx, <DialogHost />). Esta API existe
// para o código antigo; o novo usa notify() direto.
export function useToasts() {
  return {
    toasts: [],
    pushToast: pushToastCompat,
    pushUndoToast: (message, undoFn, ttlMs = 6000) => notify(message, { undo: undoFn, ttlMs }),
    dismissToast: dismissToastGlobal,
  };
}

export function ToastStack() { return null; }


function PersonalBoardSkeleton({ theme }) {
  return (
    <div className="page-root" style={S.page}>
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


function NoAccessScreen({ user, onLogout, onHome, theme, onToggleTheme }) {
  const hasAnyAccess = user.companiesAccess || user.personalAccess || !!user.xflowRole;
  const title = hasAnyAccess ? 'Nenhuma empresa liberada' : 'Nenhum acesso liberado';
  const message = hasAnyAccess
    ? `${user.name}, você ainda não tem acesso a nenhuma empresa (ou a empresa que você abriu não existe mais). Para ver uma empresa, peça para um PRICETAX Master liberar o CNPJ correspondente em "Usuários".`
    : `${user.name}, você ainda não tem acesso a nenhum módulo. Peça para um PRICETAX Master liberar o acesso em "Usuários".`;
  return (
    <div className="page-root" style={S.page}>
      <div style={S.themeToggleCorner}>
        <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
      </div>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <span style={{ ...S.roleTag, color: ROLE_META[user.role].color, borderColor: ROLE_META[user.role].color }}>{ROLE_META[user.role].label}</span>
          <h1 style={S.loginTitle}>{title}</h1>
          <p style={S.loginSub}>{message}</p>
          {onHome && <button style={{ ...S.primaryBtn, marginRight: 8 }} onClick={onHome}><Home size={14} /> Voltar ao início</button>}
          <button style={onHome ? S.iconBtn : S.primaryBtn} onClick={onLogout}><LogOut size={14} /> Trocar de usuário</button>
        </div>
      </div>
    </div>
  );
}

export function SidePanel({ title, onClose, width, children }) {
  const isMobile = useIsMobile();
  return (
    <DialogOverlay className="no-print" style={S.overlay} onClose={onClose}>
      <div style={{ ...S.panel, ...(width ? { width } : null), ...(isMobile ? S.panelMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}>{title}</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={onClose}><X aria-hidden="true" size={16} /></button>
        </div>
        <div style={S.panelBody}>{children}</div>
      </div>
    </DialogOverlay>
  );
}

// Central de Notificações (2026-08) — componente compartilhado, usado nas
// 3 telas (Empresas em App(), Gestão de Atividades em PersonalBoardScreen,
// XFlow em XflowScreen) via o mesmo estado/lista levantados em App(), pra
// contador e lista serem sempre os mesmos independente de onde o usuário
// está navegando. Abrir o painel NÃO marca nada como lido (regra
// explícita do Rafael) — só marca ao clicar em "marcar como lida", "marcar
// todas como lidas", ou ao efetivamente abrir a TASK/atividade referida
// (isso acontece no callback `onOpenItem`, fora daqui).
export function NotificationBell({ notifications: allNotifications, show, onToggle, onOpenItem, onMarkRead, onMarkAllRead }) {
  const prefs = useNotifPrefs();
  const notifications = visibleNotifications(allNotifications, prefs.categories);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (show) { setSettings(prefs.wantSettings); requestNotifSettings(false); }
  }, [show]);
  const unreadCount = notifications.filter((n) => !n.read).length;
  return (
    <div style={{ position: 'relative' }}>
      <button style={{ ...S.iconBtnGhost, position: 'relative' }} title="Notificações" onClick={onToggle}>
        <Bell size={16} />
        {unreadCount > 0 && <span style={S.mentionBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {show && (
        <DialogOverlay className="no-print" style={S.overlay} onClose={onToggle}>
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}>{settings ? 'O que ver no Hoje' : (unreadCount > 0 ? `${unreadCount} notifica${unreadCount === 1 ? 'ção' : 'ções'}` : 'Notificações')}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {!settings && unreadCount > 0 && <button style={S.filterClearBtn} onClick={onMarkAllRead}>Marcar todas como lidas</button>}
                <button style={S.filterClearBtn} aria-pressed={settings} onClick={() => setSettings((v) => !v)}>{settings ? 'Voltar às notificações' : 'Escolher o que ver'}</button>
                <button aria-label="Fechar notificações" title="Fechar notificações" style={S.iconBtnGhost} onClick={onToggle}><X aria-hidden="true" size={16} /></button>
              </div>
            </div>
            <div style={S.panelBody}>
              {settings && <NotificationPrefs />}
              {!settings && notifications.length === 0 && <div style={S.emptyMuted}>{allNotifications.length > 0 || prefs.categories.some((c) => c.muted) ? 'Nenhuma notificação das categorias que você escolheu ver.' : 'Nenhuma notificação ainda.'}</div>}
              {!settings && notifications.map((n) => (
                <div key={n.id} style={{ ...S.mentionRow, ...(n.read ? null : S.notificationUnread) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpenItem(n)}>
                      <div style={S.logTs}>{n.actorName ? `${n.actorName} · ` : ''}{fmtTs(n.createdAt)}</div>
                      <div style={S.mentionActivity}>{n.title}</div>
                      <div style={S.mentionText}>{n.body}</div>
                    </div>
                    <button
                      style={{ ...S.filterClearBtn, whiteSpace: 'nowrap' }}
                      onClick={(e) => { e.stopPropagation(); onMarkRead(n.id, !n.read); }}
                    >
                      {n.read ? 'Marcar não lida' : 'Marcar lida'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}


export const S = {
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
  tab: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-1)', color: 'var(--text-4)', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer' },
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
  mobileIconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-3)', cursor: 'pointer' },
  monthBadgeSm: { fontSize: 10.5, fontWeight: 800, background: '#F5C400', color: '#111', padding: '3px 7px', borderRadius: 5 },
  subCounter: { fontSize: 11, color: 'var(--text-6)', marginTop: 4 },
  subToggleBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 6 },
  pillSelect: { borderRadius: 999, padding: '5px 10px', fontWeight: 700, fontSize: 11.5, border: '1px solid' },
  prazoInput: { width: 46, flexShrink: 0, textAlign: 'center', padding: '6px 2px', fontSize: 12 },
  moreFieldsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 },
  rowMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'transparent', border: '1px solid transparent', borderRadius: 8, color: 'var(--text-4)', cursor: 'pointer', padding: 0, flexShrink: 0 },
  rowMenu: { position: 'fixed', zIndex: 2000, background: 'var(--bg-2)', border: '1px solid var(--border-3)', borderRadius: 10, padding: 6, boxShadow: '0 8px 28px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column' },
  rowMenuItem: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 36, textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },
  rowMenuCheck: { display: 'inline-flex', width: 14, height: 14, alignItems: 'center', justifyContent: 'center', color: '#F5C400', flexShrink: 0 },
  actionsCell: { width: 84, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
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
  // Aba do quadro: a inativa fica "afundada" (sem fundo, texto apagado) e a
  // ativa "sobe" (fundo de cartão, texto forte, barra amarela grossa no topo)
  // — antes as duas tinham quase o mesmo fundo e só um fio de 1px diferenciava
  // (2026-09-20, Rafael não conseguia ver em qual quadro estava). Só
  // propriedades longhand: misturar `border` com `borderBottomColor` deixava
  // resíduo de estilo entre trocas de aba (aviso do React).
  personalTab: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', color: 'var(--text-5)', borderWidth: '1px 1px 0 1px', borderStyle: 'solid', borderColor: 'transparent', borderRadius: '8px 8px 0 0', padding: '8px 6px 7px 12px', cursor: 'pointer', boxShadow: 'none', fontWeight: 700 },
  personalTabActive: { background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--border-2)', boxShadow: 'inset 0 3px 0 #F5C400', fontWeight: 800 },
  personalTabInput: { background: 'transparent', border: 'none', color: 'inherit', fontSize: 12.5, fontWeight: 'inherit', width: 110, padding: 0 },
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
  personalActiveFilters: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 20px 10px', maxWidth: '100%' },
  personalFilterChip: { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', background: 'rgba(245,196,0,.14)', border: '1px solid rgba(245,196,0,.5)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', minHeight: 30 },
  personalColHidden: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, color: 'var(--text-5)', padding: '6px 4px 2px', lineHeight: 1.4 },
  personalColHiddenBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: 'var(--text-2)', textDecoration: 'underline', cursor: 'pointer' },
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
  mentionRow: { padding: '10px 10px', borderBottom: '1px solid var(--border-1)', cursor: 'pointer', borderRadius: 8 },
  mentionActivity: { fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginTop: 3 },
  mentionText: { fontSize: 12, color: 'var(--text-4)', marginTop: 3, lineHeight: 1.4 },
  notificationUnread: { background: 'rgba(245,196,0,.09)', borderLeft: '3px solid #F5C400', paddingLeft: 7 },

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
  loginLinkBtn: { background: 'transparent', border: 'none', color: 'var(--text-5)', fontSize: 12.5, cursor: 'pointer', textAlign: 'center', textDecoration: 'underline', minHeight: 44, padding: '0 6px' },
  loginForgotNote: { background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 4 },
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
  companySelectorWrap: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 24px 40px', position: 'relative', zIndex: 1 },
  companySelectorHeader: { width: 'min(1240px, 96%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  companyHeaderShortcut: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 999, cursor: 'pointer' },
  companyActingOrgRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#F5C400', marginTop: -12, marginBottom: 22 },
  companySwitchOrgBtn: { background: 'transparent', border: '1px solid rgba(245,196,0,.5)', color: '#F5C400', fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, cursor: 'pointer' },
  companySearchWrap: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 },
  companySearchInput: { flex: 1, background: 'transparent', border: 'none', padding: 0, fontSize: 14 },
  companyFilterRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  companyFilterSelect: { flex: '0 1 300px', minWidth: 160, maxWidth: 320 },
  gateGroup: { width: 'min(760px, 100%)', marginBottom: 18 },
  gateGroupTitle: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-5)', margin: '0 0 8px' },
  gateGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 10 },
  gateCard: { textAlign: 'left', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px', minHeight: 56, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-1)', fontFamily: "'Inter', sans-serif", transition: 'border-color .12s' },
  gateCardText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  gateCardTitle: { fontSize: 14, fontWeight: 800 },
  gateCardDesc: { fontSize: 12, color: 'var(--text-5)', lineHeight: 1.4 },
  companyEmptyState: { width: 'min(1240px, 96%)', textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-3)', borderRadius: 12 },
  companyPanel: { width: 'min(1240px, 96%)', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 22, padding: '22px 26px', boxShadow: '0 10px 40px rgba(40,32,8,.06)' },
  companySelectAllRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-1)' },
  companyList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 2 },
  companyCard: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '8px 16px 8px 8px', transition: 'background .12s' },
  // Overrides aplicados via spread condicional (isMobile ? S.xMobile : {}) — o card vira um bloco
  // empilhado em vez da linha horizontal do desktop; nenhuma chave acima é alterada.
  companyCardMobile: { flexWrap: 'wrap', alignItems: 'stretch', padding: '10px 12px' },
  companyCardMain: { flex: '1 1 280px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', cursor: 'pointer' },
  companyCardMainMobile: { flex: '1 1 100%' },
  companyCardActions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  companyCardActionsMobile: { flex: '1 1 100%', justifyContent: 'flex-end', borderTop: '1px solid var(--border-2)', paddingTop: 8, marginTop: 4, opacity: 1 },
  companyCardLogo: { width: 46, height: 46, borderRadius: 11, objectFit: 'cover', border: '1px solid var(--border-3)', flexShrink: 0 },
  companyCardLogoEmpty: { width: 46, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyCardNameRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  companyCardName: { fontSize: 15.5, fontWeight: 800, color: 'var(--text-1)' },
  companyCardSecondary: { fontSize: 12, color: 'var(--text-4)', marginTop: 1 },
  companyCardCnpj: { fontSize: 12.5, color: 'var(--text-4)', marginTop: 1 },
  companyCardProgress: { display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 176px', padding: '4px 10px', borderLeft: '1px solid var(--border-2)' },
  companyCardProgressMobile: { flex: '1 1 45%', borderLeft: 'none', borderTop: '1px solid var(--border-2)', paddingTop: 8 },
  companyCardDonutWrap: { position: 'relative', width: 46, height: 46, flexShrink: 0 },
  companyCardDonutLabel: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-1)' },
  companyCardProgressText: { fontSize: 12, color: 'var(--text-5)', lineHeight: 1.3 },
  companyCardProgressNum: { fontSize: 14, fontWeight: 800, color: 'var(--text-1)' },
  companyCardNext: { flex: '1 1 200px', minWidth: 0, padding: '4px 10px', borderLeft: '1px solid var(--border-2)' },
  companyCardNextMobile: { flex: '1 1 45%', borderLeft: 'none', borderTop: '1px solid var(--border-2)', paddingTop: 8 },
  companyCardNextLabel: { fontSize: 10.5, fontWeight: 700, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: .4 },
  companyCardNextTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  companyCardNextDate: { fontSize: 12.5, marginTop: 1 },
};

// Raiz: a barra única (ModuleShell) fica fora das telas, que continuam sendo devolvidas por AppScreens.
const AppScreensMemo = React.memo(AppScreens);

function ShellHost({ shellRef }) {
  const p = shellRef.current;
  if (!p) return null;
  const call = (name) => (...args) => (shellRef.current && shellRef.current[name] ? shellRef.current[name](...args) : undefined);
  return (
    <>
      <ModuleShell
        user={p.user} current={p.current} modes={p.modes} theme={p.theme}
        onGo={call('onGo')} onHome={p.onHome ? call('onHome') : null} getSearchItems={call('getSearchItems')}
        notifications={p.notifications} showNotifications={p.showNotifications}
        onToggleNotifications={call('onToggleNotifications')} onOpenNotification={call('onOpenNotification')}
        onMarkNotificationRead={call('onMarkNotificationRead')} onMarkAllNotificationsRead={call('onMarkAllNotificationsRead')}
        onOpenProfile={call('onOpenProfile')} onOpenRenata={call('onOpenRenata')} onToggleTheme={call('onToggleTheme')} onLogout={call('onLogout')}
      />
      {p.profileNode}
      {p.renataNode}
    </>
  );
}

// Alvo de toque >= 44 px no celular: opt-in por contêiner (className="t44"), para não inflar ícones minúsculos de listas densas.
const TOUCH_CSS = '@media (max-width: 767px) { .t44 button, .t44 select, .t44 textarea, .t44 input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]) { min-height: 44px; } .t44 button { min-width: 44px; } .t44 label { min-height: 28px; } .t44 + * button, .acting-org-banner button { min-height: 44px; } .asst-fab { min-height: 44px; } }';

export default function App() {
  const shellRef = useRef(null);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  return (
    <>
      <style>{TOUCH_CSS}</style>
      <ShellHost shellRef={shellRef} />
      <SafeBoundary variant="page" label="o sistema" where="app-screens">
        <AppScreensMemo shellRef={shellRef} bump={bump} />
      </SafeBoundary>
      <DialogHost />
    </>
  );
}
