// Reuniões (2026-09, pedido do Rafael) — central de acompanhamento de
// reuniões por empresa: nome, data/horário (passada ou futura),
// participantes, transcrição completa, resumo, decisões e uma lista de
// atividades/próximos passos com responsável, prazo e status próprios
// (não são atividades do cronograma — array `project.meetings`, à parte
// de `project.activities`). Mesmo padrão de mutação/autosave/soft-delete
// do resto do app — ver PROJECT_CONTEXT.md §13a.

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Plus, X, Trash2, Undo2, Clock, Users, CalendarDays, ChevronDown, FileText, Sparkles, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { S, fmtDate, fmtTs, useIsMobile, SidePanel } from '../App.jsx';
import { apiGet, apiPost } from '../lib/api.js';

export const MEETINGS_CSS = `
  .mtg-view input[type=text], .mtg-view input[type=date], .mtg-view input[type=time],
  .mtg-view select, .mtg-view textarea {
    background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
    padding:8px 10px; font-size:12.5px; width:100%; font-family:'Inter', sans-serif;
  }
  .mtg-view input:focus, .mtg-view select:focus, .mtg-view textarea:focus { outline:none; border-color:#F5C400; }
  .mtg-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:14px 16px; cursor:pointer; transition:border-color .12s; }
  .mtg-card:hover { border-color:var(--border-3); }
  .mtg-badge { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .mtg-badge-done { color:#3ecf6e; background:rgba(62,207,110,.14); border:1px solid rgba(62,207,110,.5); }
  .mtg-badge-upcoming { color:#3ea6ff; background:rgba(62,166,255,.14); border:1px solid rgba(62,166,255,.5); }
  .mtg-section-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); margin:18px 0 8px; }
  .mtg-section-title:first-child { margin-top:0; }
  .mtg-sub-row { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; background:var(--bg-2); border:1px solid var(--border-1); font-size:12px; }
  .mtg-sub-status { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; flex-shrink:0; }
  .mtg-sub-pending, .mtg-sub-processing { color:#3ea6ff; background:rgba(62,166,255,.14); border:1px solid rgba(62,166,255,.5); }
  .mtg-sub-done { color:#3ecf6e; background:rgba(62,207,110,.14); border:1px solid rgba(62,207,110,.5); }
  .mtg-sub-failed { color:#e2574c; background:rgba(226,87,76,.14); border:1px solid rgba(226,87,76,.5); }
  @keyframes mtg-spin { to { transform: rotate(360deg); } }
  .mtg-spin { animation: mtg-spin 1s linear infinite; }
`;

const SUBMISSION_STATUS_META = {
  pending: { label: 'Na fila', className: 'mtg-sub-pending' },
  processing: { label: 'Processando…', className: 'mtg-sub-processing' },
  done: { label: 'Concluída', className: 'mtg-sub-done' },
  failed: { label: 'Falhou', className: 'mtg-sub-failed' },
};

// Status do TO_DO da reunião (2026-09, pedido do Rafael) — próprio, não
// reaproveita o STATUS_META de atividade: aqui é uma mistura de urgência e
// andamento ("urgente", "não é relevante"), que não faz sentido no ciclo de
// vida de uma atividade normal do cronograma.
export const TODO_STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: 'var(--text-4)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  urgente: { label: 'Urgente', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  'em-andamento': { label: 'Em andamento', color: '#3ea6ff', bg: 'rgba(62,166,255,.14)', border: 'rgba(62,166,255,.5)' },
  pausada: { label: 'Pausada', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  concluida: { label: 'Concluída', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
  'nao-relevante': { label: 'Não é relevante', color: 'var(--text-6)', bg: 'var(--border-1)', border: 'var(--border-3)' },
};
// "Não iniciado" é o estado de nascimento de todo item novo (manual ou
// extraído por IA) — por isso vem primeiro na ordem e é o fallback padrão.
export const TODO_STATUS_ORDER = ['nao-iniciado', 'urgente', 'em-andamento', 'pausada', 'concluida', 'nao-relevante'];
export const todoStatusMeta = (s) => TODO_STATUS_META[s] || TODO_STATUS_META['nao-iniciado'];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function actionItemsSummary(items) {
  const active = (items || []).filter((it) => !it.deleted);
  if (active.length === 0) return null;
  const done = active.filter((it) => it.status === 'concluida').length;
  return `${done}/${active.length} concluída${active.length === 1 ? '' : 's'}`;
}

export function MeetingsView({ meetings, team, pid, onAdd, onOpen, showTrash, onShowTrash, onHideTrash, onRestore, onReloadProjects }) {
  const isMobile = useIsMobile();
  const today = todayIso();
  const active = (meetings || []).filter((m) => !m.deleted);
  const trashed = (meetings || []).filter((m) => m.deleted);

  const upcoming = active.filter((m) => m.date && m.date > today).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  // Cronológica crescente (mais antiga primeiro) — não depende de quando a
  // reunião foi cadastrada no sistema, só da data real dela (pedido do
  // Rafael: registrar hoje uma reunião de uma data passada não pode
  // bagunçar a ordem, tem que continuar refletindo a data de verdade).
  const past = active.filter((m) => !m.date || m.date <= today).sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  // Snapshot vivo de `meetings` — lido dentro do polling sem precisar recriar
  // o efeito (e reiniciar o timer) toda vez que a lista de reuniões muda.
  const meetingsRef = useRef(meetings);
  useEffect(() => { meetingsRef.current = meetings; }, [meetings]);
  // Evita recarregar de novo pela mesma submissão já tratada.
  const reloadedForRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function load() {
      try {
        const res = await apiGet(`/api/meeting-inbox?projectId=${pid}`);
        if (cancelled) return;
        const list = res.submissions || [];
        setSubmissions(list);
        // Recarrega se a submissão terminou (`done`) mas a reunião ainda não
        // está na lista local — cobre tanto "acabou de terminar" quanto "já
        // tinha terminado antes da tela montar" (processamento rápido demais
        // pra pegar o status intermediário 'processing'), sem depender de
        // comparar com o status anterior.
        const toReload = list.filter((s) => s.status === 'done' && s.meetingId
          && !reloadedForRef.current.has(s.id)
          && !(meetingsRef.current || []).some((m) => m.id === s.meetingId));
        if (toReload.length > 0) {
          toReload.forEach((s) => reloadedForRef.current.add(s.id));
          if (onReloadProjects) onReloadProjects();
        }
        const stillWorking = list.some((s) => s.status === 'pending' || s.status === 'processing');
        if (stillWorking && !cancelled) timer = setTimeout(load, 4000);
      } catch (e) {
        console.error('Falha ao carregar envios de transcrição', e);
      }
    }

    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pid]);

  async function handleRetry(id) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'pending', errorMessage: '' } : s)));
    try {
      await apiPost(`/api/meeting-inbox/${id}/retry`);
    } catch (e) {
      setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'failed', errorMessage: e.message } : s)));
    }
  }

  function handleSubmitted(submission) {
    setSubmissions((prev) => [submission, ...prev]);
    setShowSubmitModal(false);
  }

  function renderCard(m) {
    const isUpcoming = m.date && m.date > today;
    const summary = actionItemsSummary(m.actionItems);
    return (
      <div key={m.id} className="mtg-card" onClick={() => onOpen(m.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{m.title || 'Reunião sem título'}</div>
          <span className={`mtg-badge ${isUpcoming ? 'mtg-badge-upcoming' : 'mtg-badge-done'}`}>{isUpcoming ? 'Programada' : 'Realizada'}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: 'var(--text-5)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={12} /> {m.date ? fmtDate(m.date) : 'Sem data'}{m.time ? ` às ${m.time}` : ''}</span>
          {(m.participants || []).length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {(m.participants || []).join(', ')}</span>
          )}
          {summary && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={12} /> {summary}</span>}
        </div>
        {m.summary && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-3)', opacity: .85 }}>{m.summary.length > 180 ? `${m.summary.slice(0, 180)}…` : m.summary}</div>}
      </div>
    );
  }

  return (
    <div className="mtg-view">
      <style>{MEETINGS_CSS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>Reuniões</div>
          <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 2 }}>O que foi discutido, o que foi decidido, e o que ainda está pendente.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.iconBtn} onClick={onShowTrash}><Trash2 size={14} /> Lixeira{trashed.length > 0 ? ` (${trashed.length})` : ''}</button>
          <button style={S.iconBtn} onClick={() => setShowSubmitModal(true)}><Sparkles size={14} /> Enviar transcrição</button>
          <button style={S.primaryBtn} onClick={onAdd}><Plus size={15} /> Nova reunião</button>
        </div>
      </div>

      {(() => {
        // Uma vez concluída com sucesso, a transcrição já virou uma reunião
        // de verdade na lista abaixo — a entrada some daqui pra não ficar
        // registrada pra sempre na tela (inclusive se a reunião gerada for
        // apagada depois). Continua visível enquanto está na fila,
        // processando, ou se falhou (precisa de retry).
        const visibleSubmissions = submissions.filter((s) => s.status !== 'done');
        if (visibleSubmissions.length === 0) return null;
        return (
        <>
          <div className="mtg-section-title">Transcrições enviadas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {visibleSubmissions.map((s) => {
              const meta = SUBMISSION_STATUS_META[s.status] || SUBMISSION_STATUS_META.pending;
              const working = s.status === 'pending' || s.status === 'processing';
              return (
                <div key={s.id} className="mtg-sub-row">
                  <span className={`mtg-sub-status ${meta.className}`}>
                    {working && <Loader2 size={11} className="mtg-spin" />}
                    {s.status === 'failed' && <AlertTriangle size={11} />}
                    {meta.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-3)' }}>{s.submittedByName} · {fmtTs(s.createdAt)}</div>
                    {s.status === 'failed' && s.errorMessage && (
                      <div style={{ color: '#e2574c', marginTop: 2, fontSize: 11.5 }}>{s.errorMessage}</div>
                    )}
                  </div>
                  {s.status === 'failed' && (
                    <button style={S.iconBtnGhost} title="Tentar novamente" onClick={() => handleRetry(s.id)}><RefreshCw size={14} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </>
        );
      })()}

      {active.length === 0 && (
        <div style={S.emptyMuted}>Nenhuma reunião registrada ainda. Clique em "Nova reunião" para começar.</div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="mtg-section-title">Programadas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{upcoming.map(renderCard)}</div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="mtg-section-title">Realizadas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{past.map(renderCard)}</div>
        </>
      )}

      {showTrash && (
        <SidePanel title="Lixeira de reuniões" onClose={onHideTrash}>
          {trashed.length === 0 && <div style={S.emptyMuted}>Nenhuma reunião na lixeira.</div>}
          {trashed.map((m) => (
            <div key={m.id} style={{ ...S.logRow, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{m.title || 'Reunião sem título'}</div>
                <div style={S.logTs}>{m.date ? fmtDate(m.date) : 'Sem data'} · excluída{m.deletedBy ? ` por ${m.deletedBy}` : ''}</div>
              </div>
              <button style={S.iconBtnGhost} title="Restaurar" onClick={() => onRestore(m.id)}><Undo2 size={14} /></button>
            </div>
          ))}
        </SidePanel>
      )}

      {showSubmitModal && (
        <TranscriptSubmitModal pid={pid} onClose={() => setShowSubmitModal(false)} onSubmitted={handleSubmitted} />
      )}
    </div>
  );
}

function TranscriptSubmitModal({ pid, onClose, onSubmitted }) {
  const [transcript, setTranscript] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const text = transcript.trim();
    if (!text) { setError('Cole a transcrição antes de enviar.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await apiPost('/api/meeting-inbox', { projectId: pid, transcript: text, date, time });
      onSubmitted({
        id: res.submissionId,
        status: 'pending',
        errorMessage: '',
        meetingId: '',
        createdAt: new Date().toISOString(),
        processedAt: null,
        submittedByName: 'Você',
      });
    } catch (e) {
      setError(e.message || 'Falha ao enviar a transcrição.');
      setSending(false);
    }
  }

  return (
    <div className="mtg-view" style={{ ...S.detailOverlay, zIndex: 120 }} onClick={sending ? undefined : onClose}>
      <style>{MEETINGS_CSS}</style>
      <div style={{ ...S.detailBox, width: 'min(620px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} /> Enviar transcrição
            </div>
            <div style={{ ...S.fieldHint, fontSize: 12, marginTop: 4 }}>
              Cole a transcrição completa da reunião — o painel identifica participantes, resumo, decisões e atividades automaticamente e cria a reunião pra você.
            </div>
          </div>
          <button style={S.iconBtnGhost} onClick={sending ? undefined : onClose}><X size={20} /></button>
        </div>

        <div style={S.subSectionLabel}>Transcrição</div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={12}
          placeholder="Cole aqui a transcrição completa da reunião..."
          style={{ fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
          disabled={sending}
          autoFocus
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Data (se souber)</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={sending} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Horário (se souber)</div>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={sending} />
          </div>
        </div>

        {error && <div style={{ color: '#e2574c', fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button style={S.iconBtn} onClick={onClose} disabled={sending}>Cancelar</button>
          <button style={S.primaryBtn} onClick={handleSubmit} disabled={sending}>
            {sending ? <Loader2 size={14} className="mtg-spin" /> : <Sparkles size={14} />}
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
