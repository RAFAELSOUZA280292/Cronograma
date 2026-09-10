// Assistente do Projeto (2026-09, Fase 2 do Assistente Inteligente de
// Projetos) — botão flutuante + painel lateral, integrado às abas
// Reuniões e Atividades (App.jsx decide quando montar este componente).
// Conversa contínua por usuário+empresa (server/assistant.js), sempre
// com fonte citável — nunca mostra uma resposta sem indicar de onde
// veio, e mostra explicitamente quando não há evidência suficiente.
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, ThumbsUp, ThumbsDown, Trash2, Mic, Loader2, Check, Ban } from 'lucide-react';
import { fmtDate, useIsMobile } from '../App.jsx';
import { apiGet, apiPost } from '../lib/api.js';

const ASSISTANT_CSS = `
  .asst-fab { position:fixed; bottom:22px; right:22px; z-index:90; display:flex; align-items:center; gap:8px; background:#F5C400; color:#111; border:none; border-radius:999px; padding:12px 18px; font-weight:800; font-size:13px; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.3); }
  .asst-fab:hover { filter:brightness(1.05); }
  .asst-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:90; display:flex; justify-content:flex-end; }
  .asst-panel { width:420px; max-width:94vw; height:100%; background:var(--bg-1); border-left:1px solid var(--border-2); display:flex; flex-direction:column; }
  .asst-panel.mobile { width:100vw; max-width:100vw; }
  .asst-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border-1); }
  .asst-head-title { display:flex; align-items:center; gap:8px; font-weight:800; font-size:14.5px; color:var(--text-1); }
  .asst-head-sub { font-size:11px; color:var(--text-6); margin-top:1px; }
  .asst-head-actions { display:flex; align-items:center; gap:4px; }
  .asst-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:14px; }
  .asst-empty { text-align:center; color:var(--text-6); font-size:12.5px; padding:24px 12px; }
  .asst-msg-row { display:flex; }
  .asst-msg-row.user { justify-content:flex-end; }
  .asst-msg-bubble { max-width:88%; border-radius:12px; padding:10px 13px; font-size:13px; line-height:1.5; white-space:pre-wrap; }
  .asst-msg-row.user .asst-msg-bubble { background:#F5C400; color:#111; border-bottom-right-radius:3px; }
  .asst-msg-row.assistant .asst-msg-bubble { background:var(--bg-3); color:var(--text-2); border-bottom-left-radius:3px; }
  .asst-msg-row.assistant.no-evidence .asst-msg-bubble { background:var(--bg-2); border:1px dashed var(--border-3); color:var(--text-5); font-style:italic; }
  .asst-sources { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
  .asst-source-chip { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:999px; padding:3px 8px; cursor:pointer; }
  .asst-source-chip:hover { color:var(--text-2); border-color:var(--border-3); }
  .asst-feedback { display:flex; gap:4px; margin-top:6px; }
  .asst-feedback button { background:transparent; border:none; cursor:pointer; color:var(--text-6); padding:2px; display:flex; }
  .asst-feedback button.active { color:#F5C400; }
  .asst-action-card { margin-top:8px; max-width:88%; background:var(--bg-2); border:1px solid rgba(245,196,0,.4); border-radius:10px; padding:10px 12px; font-size:12px; }
  .asst-action-card-title { font-weight:800; color:var(--text-1); margin-bottom:4px; display:flex; align-items:center; gap:6px; }
  .asst-action-card-body { color:var(--text-4); line-height:1.5; }
  .asst-action-card-buttons { display:flex; gap:8px; margin-top:8px; }
  .asst-action-btn { display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; border-radius:7px; padding:6px 11px; cursor:pointer; border:1px solid; }
  .asst-action-confirm { background:#F5C400; border-color:#F5C400; color:#111; }
  .asst-action-reject { background:transparent; border-color:var(--border-3); color:var(--text-4); }
  .asst-action-btn:disabled { opacity:.55; cursor:default; }
  .asst-action-status { margin-top:8px; font-size:11.5px; font-weight:700; display:flex; align-items:center; gap:5px; }
  .asst-action-status.executed { color:#3ecf6e; }
  .asst-action-status.rejected { color:var(--text-6); }
  .asst-suggestions { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 10px; }
  .asst-suggestion-chip { font-size:11.5px; font-weight:600; color:var(--text-4); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:5px 10px; cursor:pointer; }
  .asst-suggestion-chip:hover { border-color:var(--border-3); color:var(--text-2); }
  .asst-footer { display:flex; gap:8px; padding:12px 16px 16px; border-top:1px solid var(--border-1); }
  .asst-footer textarea { flex:1; resize:none; font-family:inherit; font-size:12.5px; padding:8px 10px; max-height:90px; }
  .asst-send-btn { background:#F5C400; border:none; border-radius:8px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#111; flex-shrink:0; }
  .asst-send-btn:disabled { opacity:.5; cursor:default; }
  .asst-thinking { display:flex; align-items:center; gap:6px; color:var(--text-6); font-size:12px; }
  @keyframes asst-spin { to { transform:rotate(360deg); } }
  .asst-spin { animation:asst-spin 1s linear infinite; }
`;

function actionCardMeta(action) {
  if (action.type === 'reschedule_activity') {
    return {
      title: 'Ação proposta: reagendar atividade',
      body: `"${action.activityTitle}" — de ${action.currentDate ? fmtDate(action.currentDate) : 'sem data'} para ${fmtDate(action.newDate)}`,
      doneLabel: 'Atividade reagendada',
    };
  }
  return {
    title: 'Ação proposta: criar pendência',
    body: `"${action.title}"${action.meetingTitle ? ` — reunião: ${action.meetingTitle}` : ''}${action.responsible ? ` — responsável: ${action.responsible}` : ''}${action.dueDate ? ` — prazo: ${fmtDate(action.dueDate)}` : ''}`,
    doneLabel: 'Pendência criada',
  };
}

function baseSuggestions(view, hasOpenMeeting) {
  if (hasOpenMeeting) {
    return ['Mostrar decisões', 'Mostrar compromissos', 'Quem participou desta reunião?', 'Comparar com reunião anterior'];
  }
  if (view === 'todo') {
    return ['Pendências do cliente', 'Pendências da nossa equipe', 'Principais riscos', 'O que cobrar na próxima reunião?'];
  }
  return ['Resuma a última reunião', 'Decisões recentes', 'Assuntos recorrentes', 'Principais riscos'];
}

export function ProjectAssistant({ projectId, projectName, view, openMeetingId, openMeetingTitle, openMeetingDate, onOpenMeeting, onReloadProjects }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [decidingActionId, setDecidingActionId] = useState(null);
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
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: question }]);
    setSending(true);
    try {
      const res = await apiPost('/api/assistant/ask', { projectId, question, context: context() });
      setMessages((prev) => [...prev, res.message]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Não consegui responder agora. Tente de novo em alguns instantes.', sources: [], hasEvidence: false }]);
    } finally {
      setSending(false);
    }
  }

  function clearConversation() {
    apiPost(`/api/assistant/conversation/clear?projectId=${projectId}`).catch(() => {});
    setMessages([]);
  }

  function giveFeedback(messageId, feedback) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    apiPost(`/api/assistant/messages/${messageId}/feedback`, { projectId, feedback }).catch(() => {});
  }

  async function decideAction(messageId, decision) {
    if (decidingActionId) return;
    setDecidingActionId(messageId);
    try {
      await apiPost(`/api/assistant/messages/${messageId}/action`, { projectId, decision });
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
          <Sparkles size={16} /> Assistente do Projeto
        </button>
      )}
      {open && (
        <div className="asst-overlay" onClick={() => setOpen(false)}>
          <div className={`asst-panel ${isMobile ? 'mobile' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="asst-head">
              <div>
                <div className="asst-head-title"><Sparkles size={16} color="#F5C400" /> Assistente do Projeto</div>
                <div className="asst-head-sub">{projectName}</div>
              </div>
              <div className="asst-head-actions">
                <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', display: 'flex' }} title="Limpar conversa" onClick={clearConversation}><Trash2 size={16} /></button>
                <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', display: 'flex' }} onClick={() => setOpen(false)}><X size={20} /></button>
              </div>
            </div>

            <div className="asst-body" ref={bodyRef}>
              {loaded && messages.length === 0 && (
                <div className="asst-empty">
                  Pergunte qualquer coisa sobre o histórico deste projeto — reuniões, decisões, atividades, participantes. Toda resposta baseada em dado real vem com a fonte.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`asst-msg-row ${m.role} ${m.role === 'assistant' && m.hasEvidence === false ? 'no-evidence' : ''}`}>
                  <div>
                    <div className="asst-msg-bubble">{m.content}</div>
                    {m.role === 'assistant' && (m.sources || []).length > 0 && (
                      <div className="asst-sources">
                        {m.sources.map((s, i) => (
                          <button key={i} type="button" className="asst-source-chip" onClick={() => onOpenMeeting && onOpenMeeting(s.meetingId)}>
                            <Mic size={10} /> {s.meetingTitle}{s.meetingDate ? ` · ${fmtDate(s.meetingDate)}` : ''}{s.timeRef ? ` · ${s.timeRef}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.role === 'assistant' && m.proposedAction && (
                      <div className="asst-action-card">
                        {m.actionStatus === 'pending' && (() => {
                          const meta = actionCardMeta(m.proposedAction);
                          return (
                            <>
                              <div className="asst-action-card-title"><Sparkles size={13} color="#F5C400" /> {meta.title}</div>
                              <div className="asst-action-card-body">{meta.body}</div>
                              <div className="asst-action-card-buttons">
                                <button type="button" className="asst-action-btn asst-action-confirm" disabled={decidingActionId === m.id} onClick={() => decideAction(m.id, 'confirm')}><Check size={13} /> Confirmar</button>
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
                    {m.role === 'assistant' && !String(m.id).startsWith('err-') && (
                      <div className="asst-feedback">
                        <button type="button" className={m.feedback === 'up' ? 'active' : ''} onClick={() => giveFeedback(m.id, 'up')}><ThumbsUp size={12} /></button>
                        <button type="button" className={m.feedback === 'down' ? 'active' : ''} onClick={() => giveFeedback(m.id, 'down')}><ThumbsDown size={12} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="asst-thinking"><Loader2 size={13} className="asst-spin" /> Pensando...</div>
              )}
            </div>

            {!sending && (
              <div className="asst-suggestions">
                {baseSuggestions(view, !!openMeetingId).map((s) => (
                  <button key={s} type="button" className="asst-suggestion-chip" onClick={() => send(s)}>{s}</button>
                ))}
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
