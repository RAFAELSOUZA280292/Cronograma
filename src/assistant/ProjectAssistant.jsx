// RENATA — Assistente do Projeto (2026-09, Fase 2 do Assistente
// Inteligente de Projetos; nome "RENATA" adotado 2026-09-10, ver
// PROJECT_CONTEXT.md §27; redesign visual + resposta estruturada na
// Fase 5, mesma data — ver §34) — botão flutuante + painel lateral,
// integrado às abas Reuniões e Atividades (App.jsx decide quando montar
// este componente). Conversa contínua por usuário+empresa
// (server/assistant.js), sempre com fonte citável — nunca mostra uma
// resposta sem indicar de onde veio, e mostra explicitamente quando não
// há evidência suficiente.
import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, X, Send, ThumbsUp, ThumbsDown, Trash2, Mic, Loader2, Check, Ban, RefreshCw, CalendarDays,
  AlertTriangle, FileText, TrendingUp, Lightbulb, History, ListChecks, CalendarCheck, Users, GitCompare,
  ClipboardList, Bell, ArrowRight, BookOpen, HelpCircle, Repeat, MessageSquare,
} from 'lucide-react';
import { fmtDate, useIsMobile } from '../App.jsx';
import { apiGet, apiPost } from '../lib/api.js';

const ASSISTANT_CSS = `
  .asst-fab { position:fixed; bottom:22px; right:22px; z-index:90; display:flex; align-items:center; gap:8px; background:#F5C400; color:#111; border:none; border-radius:999px; padding:12px 18px; font-weight:800; font-size:13px; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.3); }
  .asst-fab:hover { filter:brightness(1.05); }
  .asst-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:90; display:flex; justify-content:flex-end; }
  .asst-panel { width:460px; max-width:94vw; height:100%; background:var(--bg-1); border-left:1px solid var(--border-2); display:flex; flex-direction:column; }
  .asst-panel.mobile { width:100vw; max-width:100vw; }
  .asst-head { display:flex; align-items:flex-start; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border-1); flex-shrink:0; }
  .asst-head-title { display:flex; align-items:center; gap:7px; font-weight:800; font-size:14.5px; color:var(--text-1); letter-spacing:.01em; }
  .asst-head-project { font-size:11.5px; font-weight:700; color:var(--text-4); text-transform:uppercase; letter-spacing:.04em; margin-top:3px; }
  .asst-head-sub { font-size:11px; color:var(--text-6); margin-top:2px; }
  .asst-head-actions { display:flex; align-items:center; gap:2px; margin-top:1px; }
  .asst-head-actions button { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:6px; border-radius:7px; }
  .asst-head-actions button:hover:not(:disabled) { background:var(--bg-3); color:var(--text-2); }
  .asst-head-actions button:disabled { cursor:default; opacity:.5; }
  .asst-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:16px; }
  .asst-empty { text-align:center; color:var(--text-6); font-size:12.5px; padding:24px 12px; }
  .asst-msg-row { display:flex; }
  .asst-msg-row.user { justify-content:flex-end; }
  .asst-user-msg { max-width:86%; display:flex; flex-direction:column; align-items:flex-end; }
  .asst-msg-bubble { max-width:100%; border-radius:14px; padding:10px 13px; font-size:13px; line-height:1.55; white-space:pre-wrap; }
  .asst-msg-bubble.user { background:linear-gradient(180deg,#FFD84D,#F5C400); color:#1a1204; border-bottom-right-radius:4px; font-weight:600; }
  .asst-msg-bubble.plain { background:var(--bg-3); color:var(--text-2); border-bottom-left-radius:4px; }
  .asst-user-meta { display:flex; align-items:center; gap:3px; font-size:10px; color:var(--text-6); margin-top:4px; padding-right:2px; }
  .asst-assistant-msg { max-width:92%; }
  .asst-assistant-head { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
  .asst-assistant-icon { width:20px; height:20px; border-radius:50%; background:rgba(245,196,0,.16); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .asst-assistant-name { font-size:11.5px; font-weight:800; color:var(--text-1); }
  .asst-assistant-time { font-size:10px; color:var(--text-6); }
  .asst-intro { font-size:13px; line-height:1.55; color:var(--text-2); margin-bottom:8px; }
  .asst-assistant-msg.no-evidence .asst-intro { padding:10px 13px; border-radius:12px; background:var(--bg-2); border:1px dashed var(--border-3); color:var(--text-5); font-style:italic; margin-bottom:0; }
  .asst-section { background:var(--bg-2); border-radius:11px; padding:11px 12px; margin-top:8px; border:1px solid var(--border-1); }
  .asst-section-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .asst-section-icon { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .asst-section-title { font-size:12.5px; font-weight:800; color:var(--text-1); }
  .asst-section-content { font-size:12.5px; line-height:1.6; color:var(--text-3); }
  .asst-section-list { margin:2px 0 0; padding-left:17px; }
  .asst-section-list li { font-size:12.5px; line-height:1.6; color:var(--text-3); margin-bottom:3px; }
  .asst-section-warning .asst-section-icon { background:rgba(226,87,76,.13); color:#e2574c; }
  .asst-section-warning { border-color:rgba(226,87,76,.3); }
  .asst-section-facts .asst-section-icon { background:rgba(91,141,239,.14); color:#5b8def; }
  .asst-section-impact .asst-section-icon { background:rgba(61,207,110,.14); color:#3ecf6e; }
  .asst-section-recommendation .asst-section-icon { background:rgba(155,109,255,.15); color:#9b6dff; }
  .asst-section-recommendation { border-color:rgba(155,109,255,.28); }
  .asst-section-timeline .asst-section-icon { background:rgba(150,150,150,.16); color:var(--text-4); }
  .asst-timeline { margin-top:4px; padding-left:14px; border-left:2px solid var(--border-2); display:flex; flex-direction:column; gap:10px; }
  .asst-timeline-item { position:relative; }
  .asst-timeline-dot { position:absolute; left:-19px; top:3px; width:8px; height:8px; border-radius:50%; background:#F5C400; }
  .asst-timeline-date { font-size:11px; font-weight:800; color:var(--text-1); }
  .asst-timeline-desc { font-size:12px; color:var(--text-4); line-height:1.5; }
  .asst-sources { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
  .asst-source-chip { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:999px; padding:3px 8px; cursor:pointer; }
  .asst-source-chip:hover { color:var(--text-2); border-color:var(--border-3); }
  .asst-insights { margin-top:10px; }
  .asst-insights-label { display:flex; align-items:center; gap:4px; font-size:10px; font-weight:800; color:var(--text-6); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
  .asst-insights-row { display:flex; flex-wrap:wrap; gap:6px; }
  .asst-insight-chip { background:rgba(245,196,0,.1); border:1px solid rgba(245,196,0,.4); color:var(--text-2); border-radius:999px; padding:5px 11px; font-size:11.5px; font-weight:700; cursor:pointer; }
  .asst-insight-chip:hover { background:rgba(245,196,0,.18); }
  .asst-feedback { display:flex; gap:4px; margin-top:8px; }
  .asst-feedback button { background:transparent; border:none; cursor:pointer; color:var(--text-6); padding:2px; display:flex; }
  .asst-feedback button.active { color:#F5C400; }
  .asst-action-card { margin-top:8px; background:var(--bg-2); border:1px solid rgba(245,196,0,.4); border-radius:10px; padding:10px 12px; font-size:12px; }
  .asst-action-card.danger { border-color:rgba(226,87,76,.5); background:rgba(226,87,76,.06); }
  .asst-action-card-title { font-weight:800; color:var(--text-1); margin-bottom:4px; display:flex; align-items:center; gap:6px; }
  .asst-action-card-body { color:var(--text-4); line-height:1.5; white-space:pre-wrap; }
  .asst-action-card-buttons { display:flex; gap:8px; margin-top:8px; }
  .asst-action-btn { display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; border-radius:7px; padding:6px 11px; cursor:pointer; border:1px solid; }
  .asst-action-confirm { background:#F5C400; border-color:#F5C400; color:#111; }
  .asst-action-confirm.danger { background:#e2574c; border-color:#e2574c; color:#fff; }
  .asst-action-reject { background:transparent; border-color:var(--border-3); color:var(--text-4); }
  .asst-action-btn:disabled { opacity:.55; cursor:default; }
  .asst-action-status { margin-top:8px; font-size:11.5px; font-weight:700; display:flex; align-items:center; gap:5px; }
  .asst-action-status.executed { color:#3ecf6e; }
  .asst-action-status.rejected { color:var(--text-6); }
  .asst-knowledge-type-chip { display:inline-flex; align-items:center; font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:6px; padding:2px 7px; margin-bottom:5px; }
  .asst-scope-label { font-size:10.5px; font-weight:700; color:var(--text-6); margin-top:8px; margin-bottom:5px; }
  .asst-scope-row { display:flex; flex-wrap:wrap; gap:6px; }
  .asst-scope-pill { font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid var(--border-3); background:transparent; color:var(--text-4); cursor:pointer; }
  .asst-scope-pill.active { background:#F5C400; border-color:#F5C400; color:#111; }
  .asst-suggestions { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; flex-shrink:0; }
  .asst-suggestion-chip { display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:var(--text-4); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:5px 11px 5px 9px; cursor:pointer; }
  .asst-suggestion-chip:hover { border-color:var(--border-3); color:var(--text-2); }
  .asst-footer { display:flex; gap:8px; padding:12px 16px 16px; border-top:1px solid var(--border-1); flex-shrink:0; }
  .asst-footer textarea { flex:1; resize:none; font-family:inherit; font-size:12.5px; padding:9px 12px; max-height:90px; border-radius:10px; }
  .asst-send-btn { background:#F5C400; border:none; border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#111; flex-shrink:0; }
  .asst-send-btn:disabled { opacity:.5; cursor:default; }
  .asst-thinking { display:flex; align-items:center; gap:6px; color:var(--text-6); font-size:12px; }
  @keyframes asst-spin { to { transform:rotate(360deg); } }
  .asst-spin { animation:asst-spin 1s linear infinite; }
`;

// Interpreta só **negrito** (a única sintaxe de markdown que o prompt da
// RENATA é instruído a usar) — nunca mostra a sintaxe crua na tela.
function renderInlineBold(text) {
  if (!text) return null;
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  ));
}

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

const SECTION_META = {
  warning: { icon: AlertTriangle, cls: 'warning' },
  facts: { icon: FileText, cls: 'facts' },
  impact: { icon: TrendingUp, cls: 'impact' },
  recommendation: { icon: Lightbulb, cls: 'recommendation' },
  timeline: { icon: History, cls: 'timeline' },
};

function SectionCard({ section }) {
  const meta = SECTION_META[section.type] || SECTION_META.facts;
  const Icon = meta.icon;
  return (
    <div className={`asst-section asst-section-${meta.cls}`}>
      <div className="asst-section-head">
        <span className="asst-section-icon"><Icon size={13} /></span>
        <span className="asst-section-title">{section.title}</span>
      </div>
      {section.content && <div className="asst-section-content">{renderInlineBold(section.content)}</div>}
      {(section.items || []).length > 0 && (
        section.type === 'timeline' ? (
          <div className="asst-timeline">
            {section.items.map((item, i) => {
              const sepIdx = item.indexOf(' — ');
              const date = sepIdx > -1 ? item.slice(0, sepIdx) : null;
              const desc = sepIdx > -1 ? item.slice(sepIdx + 3) : item;
              return (
                <div className="asst-timeline-item" key={i}>
                  <span className="asst-timeline-dot" />
                  {date && <div className="asst-timeline-date">{date}</div>}
                  <div className="asst-timeline-desc">{renderInlineBold(desc)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="asst-section-list">
            {section.items.map((item, i) => <li key={i}>{renderInlineBold(item)}</li>)}
          </ul>
        )
      )}
    </div>
  );
}

// Fase 7.1 (pedido do Rafael: "conhecimento organizacional precisa de
// confirmação explícita") — a IA sugere um escopo, mas quem decide de
// fato é o usuário, escolhendo entre estas 3 pills antes de confirmar
// (ver `decideAction`, que manda a escolha em `overrides.scope`).
// Tipos de ação com escopo editável (3 pills) — save_knowledge_fact
// (Fase 7.1) e flag_knowledge_conflict (registro de conflito percebido
// pela própria RENATA, ver server/knowledgeFacts.js `saveConflictPair`)
// compartilham o mesmo seletor de escopo.
const KNOWLEDGE_ACTION_TYPES = ['save_knowledge_fact', 'flag_knowledge_conflict'];

const SCOPE_OPTIONS = [
  { value: 'conversation', label: 'Só esta conversa' },
  { value: 'project', label: 'Este projeto' },
  { value: 'org', label: 'Toda a PRICETAX' },
];

function actionCardMeta(action) {
  if (action.type === 'delete_meeting_todo') {
    return {
      title: 'Ação proposta: excluir pendência',
      body: `"${action.todoTitle}"${action.meetingTitle ? ` — reunião: ${action.meetingTitle}` : ''}`,
      doneLabel: 'Pendência excluída',
    };
  }
  if (action.type === 'reschedule_activity') {
    return {
      title: 'Ação proposta: reagendar atividade',
      body: `"${action.activityTitle}" — de ${action.currentDate ? fmtDate(action.currentDate) : 'sem data'} para ${fmtDate(action.newDate)}`,
      doneLabel: 'Atividade reagendada',
    };
  }
  if (action.type === 'create_schedule_activity') {
    return {
      title: 'Ação proposta: criar atividade no cronograma',
      body: `"${action.title}"${action.phaseName ? ` — fase: ${action.phaseName}` : ''}${action.responsible ? ` — responsável: ${action.responsible}` : ''}${action.dueDate ? ` — prazo: ${fmtDate(action.dueDate)}` : ''}`,
      doneLabel: 'Atividade criada no cronograma',
    };
  }
  if (action.type === 'delete_schedule_activity') {
    return {
      title: 'Ação proposta: excluir atividade do cronograma',
      body: `"${action.activityTitle}" — isso afeta o cronograma oficial do projeto.`,
      doneLabel: 'Atividade excluída do cronograma',
      danger: true,
    };
  }
  if (action.type === 'create_calendar_event') {
    return {
      title: 'Ação proposta: marcar no Google Calendar',
      body: `"${action.title}" — ${action.dueDate ? fmtDate(action.dueDate) : 'sem data'}${action.startTime ? ` às ${action.startTime}` : ''}`,
      doneLabel: 'Evento criado no Google Calendar',
    };
  }
  if (action.type === 'save_knowledge_fact') {
    return {
      title: 'Ação proposta: lembrar este fato',
      body: `"${action.content}"`,
      doneLabel: 'Fato registrado',
    };
  }
  if (action.type === 'flag_knowledge_conflict') {
    return {
      title: 'Ação proposta: registrar conflito',
      body: `Versão A: "${action.content}"\nVersão B (contradiz): "${action.conflictingContent}"`,
      doneLabel: 'Conflito registrado',
    };
  }
  return {
    title: 'Ação proposta: criar pendência',
    body: `"${action.title}"${action.meetingTitle ? ` — reunião: ${action.meetingTitle}` : ''}${action.responsible ? ` — responsável: ${action.responsible}` : ''}${action.dueDate ? ` — prazo: ${fmtDate(action.dueDate)}` : ''}`,
    doneLabel: 'Pendência criada',
  };
}

const SUGGESTION_ICONS = {
  'Mostrar decisões': ListChecks,
  'Mostrar compromissos': CalendarCheck,
  'Quem participou desta reunião?': Users,
  'Comparar com reunião anterior': GitCompare,
  'Pendências em aberto': ClipboardList,
  'Quem ficou responsável por quê?': Users,
  'Principais riscos': AlertTriangle,
  'O que precisa da minha atenção?': Bell,
  'Resuma a última reunião': FileText,
  'O que mudou desde a reunião anterior?': GitCompare,
  'Próximos passos': ArrowRight,
  'Legislação relacionada': BookOpen,
  'Pendências do cliente': ClipboardList,
  'Pendências da nossa equipe': ClipboardList,
  'O que cobrar na próxima reunião?': HelpCircle,
  'Decisões recentes': ListChecks,
  'Assuntos recorrentes': Repeat,
};
function suggestionIcon(label) { return SUGGESTION_ICONS[label] || MessageSquare; }

function baseSuggestions(view, hasOpenMeeting) {
  if (hasOpenMeeting) {
    return ['Mostrar decisões', 'Mostrar compromissos', 'Quem participou desta reunião?', 'Comparar com reunião anterior'];
  }
  if (view === 'todo') {
    return ['Pendências em aberto', 'Quem ficou responsável por quê?', 'Principais riscos', 'O que precisa da minha atenção?'];
  }
  return ['Resuma a última reunião', 'O que mudou desde a reunião anterior?', 'Próximos passos', 'Legislação relacionada'];
}

export function ProjectAssistant({ projectId, projectName, view, openMeetingId, openMeetingTitle, openMeetingDate, onOpenMeeting, onReloadProjects, onOpenAgenda }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [decidingActionId, setDecidingActionId] = useState(null);
  const [reindexing, setReindexing] = useState(false);
  const [scopeOverrides, setScopeOverrides] = useState({});
  const bodyRef = useRef(null);

  useEffect(() => { setLoaded(false); setMessages([]); }, [projectId]);

  useEffect(() => {
    if (!open || loaded || !projectId) return;
    apiGet(`/api/assistant/conversation?projectId=${projectId}`)
      .then((res) => { setMessages(res.messages || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [open, loaded, projectId]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  function context() {
    return { view, meetingId: openMeetingId || null, meetingTitle: openMeetingTitle || null, meetingDate: openMeetingDate || null };
  }

  async function send(text) {
    const question = (text || input).trim();
    if (!question || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: question, createdAt: new Date().toISOString() }]);
    setSending(true);
    try {
      const res = await apiPost('/api/assistant/ask', { projectId, question, context: context() });
      setMessages((prev) => [...prev, res.message]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Não consegui responder agora. Tente de novo em alguns instantes.', sources: [], hasEvidence: false, createdAt: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  function clearConversation() {
    apiPost(`/api/assistant/conversation/clear?projectId=${projectId}`).catch(() => {});
    setMessages([]);
  }

  async function handleReindex() {
    if (reindexing) return;
    setReindexing(true);
    try {
      const res = await apiPost('/api/assistant/reindex', { projectId });
      setMessages((prev) => [...prev, {
        id: `local-reindex-${Date.now()}`, role: 'assistant',
        content: `Memória reindexada: ${res.meetingsIndexed} reunião(ões), ${res.chunksCreated} trecho(s) atualizados. Já pode perguntar de novo.`,
        sources: [], hasEvidence: null, createdAt: new Date().toISOString(),
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: `err-reindex-${Date.now()}`, role: 'assistant', content: 'Não consegui reindexar agora. Tente de novo em alguns instantes.', sources: [], hasEvidence: false, createdAt: new Date().toISOString() }]);
    } finally {
      setReindexing(false);
    }
  }

  function giveFeedback(messageId, feedback) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    apiPost(`/api/assistant/messages/${messageId}/feedback`, { projectId, feedback }).catch(() => {});
  }

  function currentScope(m) {
    return scopeOverrides[m.id] || (m.proposedAction && m.proposedAction.scope) || 'project';
  }

  async function decideAction(messageId, decision) {
    if (decidingActionId) return;
    setDecidingActionId(messageId);
    try {
      const msg = messages.find((m) => m.id === messageId);
      const body = { projectId, decision };
      if (decision === 'confirm' && msg && msg.proposedAction && KNOWLEDGE_ACTION_TYPES.includes(msg.proposedAction.type)) {
        body.overrides = { scope: currentScope(msg) };
      }
      await apiPost(`/api/assistant/messages/${messageId}/action`, body);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, actionStatus: decision === 'confirm' ? 'executed' : 'rejected' } : m)));
      // A ação confirmada muda project.data direto no servidor (fora do
      // fluxo normal de mutateProject/autosave) — precisa recarregar pra
      // a pendência nova aparecer na tela sem precisar sair e voltar.
      if (decision === 'confirm' && onReloadProjects) onReloadProjects();
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, actionError: e.message || 'Não consegui concluir agora.' } : m)));
    } finally {
      setDecidingActionId(null);
    }
  }

  if (!projectId) return null;

  return (
    <>
      <style>{ASSISTANT_CSS}</style>
      {!open && (
        <button type="button" className="asst-fab" onClick={() => setOpen(true)}>
          <Sparkles size={16} /> RENATA
        </button>
      )}
      {open && (
        <div className="asst-overlay" onClick={() => setOpen(false)}>
          <div className={`asst-panel ${isMobile ? 'mobile' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="asst-head">
              <div>
                <div className="asst-head-title"><Sparkles size={16} color="#F5C400" /> RENATA</div>
                <div className="asst-head-project">{projectName}</div>
                <div className="asst-head-sub">Sua assistente de conhecimento do projeto</div>
              </div>
              <div className="asst-head-actions">
                {onOpenAgenda && (
                  <button type="button" title="Abrir a Agenda" onClick={onOpenAgenda}><CalendarDays size={16} /></button>
                )}
                <button type="button" disabled={reindexing} title="Atualizar contexto da RENATA" onClick={handleReindex}><RefreshCw size={16} className={reindexing ? 'asst-spin' : ''} /></button>
                <button type="button" title="Limpar esta conversa" onClick={clearConversation}><Trash2 size={16} /></button>
                <button type="button" title="Fechar assistente" onClick={() => setOpen(false)}><X size={20} /></button>
              </div>
            </div>

            <div className="asst-body" ref={bodyRef}>
              {loaded && messages.length === 0 && (
                <div className="asst-empty">
                  Sou a RENATA, assistente de execução e gestão de projetos da PRICETAX. Pergunte qualquer coisa sobre o histórico deste projeto — reuniões, decisões, atividades, participantes. Toda resposta baseada em dado real vem com a fonte.
                </div>
              )}
              {messages.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="asst-msg-row user">
                      <div className="asst-user-msg">
                        <div className="asst-msg-bubble user">{m.content}</div>
                        <div className="asst-user-meta">{fmtTime(m.createdAt)} <Check size={10} /></div>
                      </div>
                    </div>
                  );
                }
                const noEvidence = m.hasEvidence === false;
                return (
                  <div key={m.id} className="asst-msg-row assistant">
                    <div className={`asst-assistant-msg ${noEvidence ? 'no-evidence' : ''}`}>
                      <div className="asst-assistant-head">
                        <span className="asst-assistant-icon"><Sparkles size={11} color="#F5C400" /></span>
                        <span className="asst-assistant-name">RENATA</span>
                        <span className="asst-assistant-time">{fmtTime(m.createdAt)}</span>
                      </div>

                      {m.structured ? (
                        <>
                          <div className="asst-intro">{renderInlineBold(m.structured.introduction)}</div>
                          {!noEvidence && (m.structured.sections || []).map((s, i) => <SectionCard key={i} section={s} />)}
                          {!noEvidence && (m.structured.insights || []).length > 0 && (
                            <div className="asst-insights">
                              <div className="asst-insights-label"><Sparkles size={10} color="#F5C400" /> Insights rápidos</div>
                              <div className="asst-insights-row">
                                {m.structured.insights.map((ins, i) => (
                                  <button key={i} type="button" className="asst-insight-chip" onClick={() => send(ins)}>{ins}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="asst-msg-bubble plain">{renderInlineBold(m.content)}</div>
                      )}

                      {(m.sources || []).length > 0 && (
                        <div className="asst-sources">
                          {m.sources.map((s, i) => (
                            <button key={i} type="button" className="asst-source-chip" onClick={() => onOpenMeeting && onOpenMeeting(s.meetingId)}>
                              <Mic size={10} /> {s.meetingTitle}{s.meetingDate ? ` · ${fmtDate(s.meetingDate)}` : ''}{s.timeRef ? ` · ${s.timeRef}` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.proposedAction && (
                        <div className={`asst-action-card ${actionCardMeta(m.proposedAction).danger ? 'danger' : ''}`}>
                          {m.actionStatus === 'pending' && (() => {
                            const meta = actionCardMeta(m.proposedAction);
                            const isFact = KNOWLEDGE_ACTION_TYPES.includes(m.proposedAction.type);
                            return (
                              <>
                                <div className="asst-action-card-title"><Sparkles size={13} color="#F5C400" /> {meta.title}</div>
                                {isFact && m.proposedAction.knowledgeType && (
                                  <div className="asst-knowledge-type-chip">{m.proposedAction.knowledgeType}</div>
                                )}
                                <div className="asst-action-card-body">{meta.body}</div>
                                {isFact && (
                                  <>
                                    <div className="asst-scope-label">Vale para:</div>
                                    <div className="asst-scope-row">
                                      {SCOPE_OPTIONS.map((opt) => (
                                        <button
                                          key={opt.value} type="button"
                                          className={`asst-scope-pill ${currentScope(m) === opt.value ? 'active' : ''}`}
                                          onClick={() => setScopeOverrides((prev) => ({ ...prev, [m.id]: opt.value }))}
                                        >{opt.label}</button>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <div className="asst-action-card-buttons">
                                  <button type="button" className={`asst-action-btn asst-action-confirm ${meta.danger ? 'danger' : ''}`} disabled={decidingActionId === m.id} onClick={() => decideAction(m.id, 'confirm')}><Check size={13} /> Confirmar</button>
                                  <button type="button" className="asst-action-btn asst-action-reject" disabled={decidingActionId === m.id} onClick={() => decideAction(m.id, 'reject')}><Ban size={13} /> Cancelar</button>
                                </div>
                                {m.actionError && <div style={{ color: '#e2574c', marginTop: 6, fontSize: 11 }}>{m.actionError}</div>}
                              </>
                            );
                          })()}
                          {m.actionStatus === 'executed' && <div className="asst-action-status executed"><Check size={13} /> {actionCardMeta(m.proposedAction).doneLabel}</div>}
                          {m.actionStatus === 'rejected' && <div className="asst-action-status rejected"><Ban size={13} /> Ação cancelada</div>}
                        </div>
                      )}
                      {!String(m.id).startsWith('err-') && (
                        <div className="asst-feedback">
                          <button type="button" className={m.feedback === 'up' ? 'active' : ''} onClick={() => giveFeedback(m.id, 'up')}><ThumbsUp size={12} /></button>
                          <button type="button" className={m.feedback === 'down' ? 'active' : ''} onClick={() => giveFeedback(m.id, 'down')}><ThumbsDown size={12} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {sending && (
                <div className="asst-thinking"><Loader2 size={13} className="asst-spin" /> Pensando...</div>
              )}
            </div>

            {!sending && (
              <div className="asst-suggestions">
                {baseSuggestions(view, !!openMeetingId).map((s) => {
                  const Icon = suggestionIcon(s);
                  return (
                    <button key={s} type="button" className="asst-suggestion-chip" onClick={() => send(s)}><Icon size={12} /> {s}</button>
                  );
                })}
              </div>
            )}

            <div className="asst-footer">
              <textarea
                rows={1} value={input} placeholder="Pergunte qualquer coisa sobre este projeto..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button type="button" className="asst-send-btn" disabled={!input.trim() || sending} onClick={() => send()}><Send size={16} /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
