// Reuniões (2026-09, pedido do Rafael) — central de acompanhamento de
// reuniões por empresa: nome, data/horário (passada ou futura),
// participantes, transcrição completa, resumo, decisões e uma lista de
// atividades/próximos passos com responsável, prazo e status próprios
// (não são atividades do cronograma — array `project.meetings`, à parte
// de `project.activities`). Mesmo padrão de mutação/autosave/soft-delete
// do resto do app — ver PROJECT_CONTEXT.md §13a.

import React, { useState } from 'react';
import { Mic, Plus, X, Trash2, Undo2, Clock, Users, CalendarDays, ChevronDown, FileText } from 'lucide-react';
import { S, fmtDate, useIsMobile, useAutosaveTimestamp, ConfirmDiscardModal, savedStatusLabel, SidePanel, STATUS_META, STATUS_ORDER } from '../App.jsx';

const MEETINGS_CSS = `
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
`;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function actionItemsSummary(items) {
  const active = (items || []).filter((it) => !it.deleted);
  if (active.length === 0) return null;
  const done = active.filter((it) => it.status === 'concluido').length;
  return `${done}/${active.length} concluída${active.length === 1 ? '' : 's'}`;
}

export function MeetingsView({ meetings, team, pid, onAdd, onOpen, showTrash, onShowTrash, onHideTrash, onRestore }) {
  const isMobile = useIsMobile();
  const today = todayIso();
  const active = (meetings || []).filter((m) => !m.deleted);
  const trashed = (meetings || []).filter((m) => m.deleted);

  const upcoming = active.filter((m) => m.date && m.date > today).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  const past = active.filter((m) => !m.date || m.date <= today).sort((a, b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`));

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
          <button style={S.primaryBtn} onClick={onAdd}><Plus size={15} /> Nova reunião</button>
        </div>
      </div>

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
    </div>
  );
}

export function MeetingDetailModal({ meeting: m, team, pid, onClose, updateMeeting, deleteMeeting, toggleParticipant, addParticipant, addActionItem, updateActionItem, deleteActionItem }) {
  const isMobile = useIsMobile();
  const [participantDraft, setParticipantDraft] = useState('');
  const lastSavedAt = useAutosaveTimestamp(m);
  const hasDraft = !!participantDraft.trim();
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (hasDraft) setShowGuard(true); else onClose(); }
  function submitParticipant() {
    if (!participantDraft.trim()) return;
    addParticipant(pid, m.id, participantDraft);
    setParticipantDraft('');
  }

  const activeItems = (m.actionItems || []).filter((it) => !it.deleted);

  return (
    <div className="no-print mtg-view" style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={requestClose}>
      <style>{MEETINGS_CSS}</style>
      <div style={{ ...S.detailBox, ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.detailTopLeft}>
            <span style={{ ...S.detailPhaseTag }}><Mic size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Reunião</span>
            <span style={{ fontSize: 11, color: hasDraft ? '#ff9f40' : 'var(--text-6)' }}>{savedStatusLabel(hasDraft, lastSavedAt)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={S.iconBtnGhost} title="Excluir reunião" onClick={() => deleteMeeting(pid, m.id)}><Trash2 size={16} /></button>
            <button style={S.iconBtnGhost} onClick={requestClose}><X size={20} /></button>
          </div>
        </div>

        <input
          type="text"
          value={m.title}
          onChange={(e) => updateMeeting(pid, m.id, { title: e.target.value })}
          onBlur={() => updateMeeting(pid, m.id, {}, `Reunião renomeada: "${m.title}"`)}
          style={S.detailTitleInput}
        />

        <div style={S.detailGrid}>
          <div style={{ ...S.detailMain, ...(isMobile ? S.detailMainMobile : null) }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={S.subSectionLabel}>Data</div>
                <input type="date" value={m.date || ''} onChange={(e) => updateMeeting(pid, m.id, { date: e.target.value }, `Data da reunião alterada: "${m.title}"`)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.subSectionLabel}>Horário (opcional)</div>
                <input type="time" value={m.time || ''} onChange={(e) => updateMeeting(pid, m.id, { time: e.target.value })} onBlur={() => updateMeeting(pid, m.id, {}, `Horário da reunião alterado: "${m.title}"`)} />
              </div>
            </div>

            <div style={S.subSectionLabel}>Participantes</div>
            <div style={S.participantChips}>
              {team.map((mem) => {
                const activeChip = (m.participants || []).includes(mem.name);
                return (
                  <button
                    key={mem.id}
                    type="button"
                    style={{ ...S.participantChip, ...(activeChip ? S.participantChipActive : {}) }}
                    onClick={() => toggleParticipant(pid, m.id, mem.name)}
                  >
                    {mem.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input type="text" value={participantDraft} onChange={(e) => setParticipantDraft(e.target.value)} placeholder="Adicionar participante externo..." onKeyDown={(e) => e.key === 'Enter' && submitParticipant()} />
              <button style={S.iconBtn} onClick={submitParticipant}><Plus size={14} /></button>
            </div>

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={12} style={{ verticalAlign: -2 }} />Transcrição completa
            </div>
            <textarea
              value={m.transcript || ''}
              onChange={(e) => updateMeeting(pid, m.id, { transcript: e.target.value })}
              onBlur={() => updateMeeting(pid, m.id, {}, `Transcrição atualizada: "${m.title}"`)}
              rows={8}
              placeholder="Cole aqui a transcrição completa da reunião..."
              style={{ fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
            />

            <div style={S.subSectionLabel}>Resumo</div>
            <textarea
              value={m.summary || ''}
              onChange={(e) => updateMeeting(pid, m.id, { summary: e.target.value })}
              onBlur={() => updateMeeting(pid, m.id, {}, `Resumo atualizado: "${m.title}"`)}
              rows={3}
              placeholder="O que foi discutido, em poucas linhas..."
              style={{ resize: 'vertical' }}
            />

            <div style={S.subSectionLabel}>Decisões tomadas</div>
            <textarea
              value={m.decisions || ''}
              onChange={(e) => updateMeeting(pid, m.id, { decisions: e.target.value })}
              onBlur={() => updateMeeting(pid, m.id, {}, `Decisões atualizadas: "${m.title}"`)}
              rows={3}
              placeholder="O que ficou definido nesta reunião..."
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
            <div style={S.subSectionLabel}>Atividades e próximos passos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeItems.length === 0 && <div style={S.emptyMuted}>Nenhuma atividade definida ainda.</div>}
              {activeItems.map((it) => (
                <div key={it.id} style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="text" value={it.title}
                      onChange={(e) => updateActionItem(pid, m.id, it.id, { title: e.target.value })}
                      style={{ flex: 1, fontWeight: 700, textDecoration: it.status === 'concluido' ? 'line-through' : 'none', opacity: it.status === 'concluido' ? .6 : 1 }}
                    />
                    <button style={S.iconBtnGhost} onClick={() => deleteActionItem(pid, m.id, it.id)}><X size={13} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <select value={it.responsible || ''} onChange={(e) => updateActionItem(pid, m.id, it.id, { responsible: e.target.value })} style={{ flex: 1 }} title="Responsável">
                      <option value="">Sem responsável</option>
                      {team.map((mem) => <option key={mem.id} value={mem.name}>{mem.name}</option>)}
                    </select>
                    <input type="date" value={it.dueDate || ''} onChange={(e) => updateActionItem(pid, m.id, it.id, { dueDate: e.target.value })} style={{ width: 130, flexShrink: 0 }} title="Prazo" />
                  </div>
                  <select
                    value={it.status || 'nao-iniciado'}
                    onChange={(e) => updateActionItem(pid, m.id, it.id, { status: e.target.value })}
                    style={{ marginTop: 6, color: STATUS_META[it.status || 'nao-iniciado'].color }}
                  >
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button style={{ ...S.addSubBtn, marginTop: 8 }} onClick={() => addActionItem(pid, m.id)}><Plus size={12} /> Atividade</button>
          </div>
        </div>
      </div>

      {showGuard && (
        <ConfirmDiscardModal
          onDiscard={() => { setParticipantDraft(''); setShowGuard(false); onClose(); }}
          onCancel={() => setShowGuard(false)}
        />
      )}
    </div>
  );
}
