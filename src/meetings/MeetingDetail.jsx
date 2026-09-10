// Tela de detalhe de uma Reunião — redesign 2026-09 ("AI Meeting
// Workspace"). Substitui o antigo MeetingDetailModal (formulário denso
// de textareas) por uma experiência de leitura em blocos, edição só sob
// demanda, e uma coluna de atividades usando os MESMOS componentes da
// aba Atividades (ActivityRow/TodoDrawer) — ver PROJECT_CONTEXT.md.
// Nenhum dado novo de verdade: tudo que já existia (transcrição, resumo,
// decisões, participantes, TO_DO) continua no mesmo lugar/mesma função;
// isto é só a camada visual + as extensões combinadas (compartilhar,
// exportar, transcrição em 3 modos).
import React, { useState } from 'react';
import {
  Mic, Plus, X, Trash2, Share2, Download, Pencil, Copy, Lock, Globe,
  FileText, FileDown, Calendar, Clock, Building2, Users, ListChecks, ChevronDown,
} from 'lucide-react';
import { S, fmtDate, useIsMobile, useAutosaveTimestamp, ConfirmDiscardModal, savedStatusLabel } from '../App.jsx';
import { apiGet } from '../lib/api.js';
import { TODO_STATUS_META, todoStatusMeta } from './Meetings.jsx';
import { ActivityRow, ACTIVITY_ROW_CSS } from './ActivityRow.jsx';
import { TodoDrawer } from './TodoDrawer.jsx';
import { TranscriptView } from './TranscriptView.jsx';
import { initials, avatarColor } from './todoUtils.js';
import { buildMeetingText, downloadTextFile } from './meetingUtils.js';

const MEETING_DETAIL_CSS = `
  .mtg2-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:flex-start; justify-content:center; z-index:60; overflow-y:auto; padding:24px 16px; }
  .mtg2-page { width:min(1320px, 100%); background:var(--bg-page); border-radius:14px; padding:0; }
  .mtg2-header { padding:22px 26px 0; }
  .mtg2-eyebrow { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--text-4); margin-bottom:8px; }
  .mtg2-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .mtg2-title { font-size:24px; font-weight:800; color:var(--text-1); width:100%; resize:none; overflow:hidden; border:1px solid transparent; background:transparent; border-radius:8px; padding:4px 6px; font-family:inherit; line-height:1.3; }
  .mtg2-title:hover { background:var(--bg-3); }
  .mtg2-title:focus { background:var(--bg-1); border-color:var(--border-3); outline:none; }
  .mtg2-subtitle { font-size:12.5px; color:var(--text-5); margin:4px 0 14px; }
  .mtg2-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .mtg2-meta-card { display:flex; flex-wrap:wrap; gap:0; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; margin:0 26px 20px; overflow:hidden; }
  .mtg2-meta-item { flex:1 1 160px; display:flex; align-items:center; gap:10px; padding:14px 16px; border-right:1px solid var(--border-1); min-width:150px; }
  .mtg2-meta-item:last-child { border-right:none; }
  .mtg2-meta-icon { color:var(--text-5); flex-shrink:0; }
  .mtg2-meta-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-6); }
  .mtg2-meta-value { font-size:13.5px; font-weight:700; color:var(--text-1); }
  .mtg2-meta-value input { font-size:13.5px; font-weight:700; padding:2px 4px; }
  .mtg2-body { display:grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 0.9fr); gap:20px; padding:0 26px 26px; align-items:start; }
  .mtg2-body.mobile { grid-template-columns: 1fr; }
  .mtg2-main { display:flex; flex-direction:column; gap:18px; min-width:0; }
  .mtg2-side { position:sticky; top:24px; max-height:calc(100vh - 48px); overflow-y:auto; display:flex; flex-direction:column; gap:0; }
  .mtg2-body.mobile .mtg2-side { position:static; max-height:none; }
  .mtg2-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:18px; }
  .mtg2-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .mtg2-card-title { display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px; color:var(--text-1); }
  .mtg2-edit-btn { display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--text-5); background:transparent; border:1px solid var(--border-2); border-radius:7px; padding:5px 10px; cursor:pointer; }
  .mtg2-edit-btn:hover { color:var(--text-2); border-color:var(--border-3); }
  .mtg2-read-text { font-size:13.5px; line-height:1.65; color:var(--text-2); white-space:pre-wrap; }
  .mtg2-decision-item { display:flex; gap:10px; padding:8px 0; border-top:1px solid var(--border-1); }
  .mtg2-decision-item:first-child { border-top:none; }
  .mtg2-decision-num { width:22px; height:22px; border-radius:999px; background:rgba(62,207,110,.14); color:#3ecf6e; font-weight:800; font-size:11.5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .mtg2-decision-text { font-size:13.5px; line-height:1.55; color:var(--text-2); }
  .mtg2-empty { font-size:12.5px; color:var(--text-6); display:flex; flex-direction:column; gap:8px; align-items:flex-start; }
  .mtg2-participants-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .mtg2-participants-more { font-size:11px; font-weight:700; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:4px 10px; cursor:pointer; }
  .mtg2-activities-head { padding:18px 18px 0; }
  .mtg2-activities-list { padding:10px 18px 18px; display:flex; flex-direction:column; gap:8px; }
  .mtg2-share-visibility { display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text-2); padding:8px 0; cursor:pointer; }
  .mtg2-more-menu { position:absolute; top:110%; right:0; z-index:30; background:var(--bg-1); border:1px solid var(--border-2); border-radius:10px; padding:6px; width:220px; box-shadow:0 8px 24px rgba(0,0,0,.35); }
  .mtg2-more-item { display:flex; align-items:center; gap:8px; width:100%; background:transparent; border:none; color:var(--text-2); font-size:12.5px; padding:8px 10px; border-radius:7px; cursor:pointer; text-align:left; }
  .mtg2-more-item:hover { background:var(--bg-3); }
`;

function EditableTextCard({ icon, title, value, placeholder, emptyMessage, onSave, renderRead }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  function startEdit() { setDraft(value || ''); setEditing(true); }
  function commit() { setEditing(false); if ((value || '') !== draft) onSave(draft); }
  return (
    <div className="mtg2-card">
      <div className="mtg2-card-head">
        <div className="mtg2-card-title">{icon}{title}</div>
        {!editing && <button type="button" className="mtg2-edit-btn" onClick={startEdit}><Pencil size={12} /> Editar</button>}
      </div>
      {editing ? (
        <textarea
          autoFocus value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={5}
          style={{ width: '100%', resize: 'vertical', fontSize: 13.5, lineHeight: 1.5 }}
        />
      ) : value ? (
        renderRead ? renderRead(value) : <div className="mtg2-read-text">{value}</div>
      ) : (
        <div className="mtg2-empty">
          {emptyMessage}
          <button type="button" className="mtg2-edit-btn" onClick={startEdit}><Pencil size={12} /> Escrever</button>
        </div>
      )}
    </div>
  );
}

function DecisionsRead(text) {
  const items = text.split('\n').map((l) => l.replace(/^\s*\d+[).]\s*/, '').trim()).filter(Boolean);
  if (items.length <= 1) return <div className="mtg2-read-text">{text}</div>;
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="mtg2-decision-item">
          <div className="mtg2-decision-num">{i + 1}</div>
          <div className="mtg2-decision-text">{it}</div>
        </div>
      ))}
    </div>
  );
}

function MeetingShareModal({ meeting, onClose, onSetVisibility, onRegenerateLink }) {
  const [copied, setCopied] = useState(false);
  const isPublic = meeting.shareVisibility === 'public';
  const publicUrl = isPublic && meeting.shareToken ? `${window.location.origin}/reuniao/${meeting.shareToken}` : '';
  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }
  return (
    <div style={S.detailOverlay} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(480px, 100%)', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.subSectionLabel}>Compartilhar "{meeting.title}"</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>
        <label className="mtg2-share-visibility">
          <input type="radio" name="meeting-visibility" checked={!isPublic} onChange={() => onSetVisibility('private')} />
          <Lock size={13} /> Privado — só quem tem acesso à empresa pode ver
        </label>
        <label className="mtg2-share-visibility">
          <input type="radio" name="meeting-visibility" checked={isPublic} onChange={() => onSetVisibility('public')} />
          <Globe size={13} /> Público por link — qualquer pessoa com o link pode ver (só leitura)
        </label>
        {isPublic && (
          <>
            <div style={{ ...S.fieldHint, marginTop: 10, lineHeight: 1.5 }}>
              Quem tiver o link consegue só <b>visualizar</b> resumo, decisões, transcrição e atividades — não pode editar nem excluir nada.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={publicUrl} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
              <button style={S.primaryBtn} onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar link'}</button>
            </div>
            <button type="button" style={{ ...S.iconBtn, marginTop: 8 }} onClick={onRegenerateLink}>Gerar novo link (invalida o anterior)</button>
          </>
        )}
      </div>
    </div>
  );
}

export function MeetingDetailModal({
  meeting: m, team, externalContacts, clientName, pid, currentUser, log, pushUndoToast,
  onClose, updateMeeting, deleteMeeting, toggleParticipant, addParticipant,
  addActionItem, updateActionItem, deleteActionItem, duplicateActionItem,
  addSubtask, toggleSubtask, deleteSubtask, addComment, deleteComment, addAttachment, deleteAttachment,
  onViewActivities, onSetShareVisibility, onRegenerateShareLink, onExportPdf,
}) {
  const isMobile = useIsMobile();
  const [participantDraft, setParticipantDraft] = useState('');
  const [participantEmailDraft, setParticipantEmailDraft] = useState('');
  const lastSavedAt = useAutosaveTimestamp(m);
  const hasDraft = !!(participantDraft.trim() || participantEmailDraft.trim());
  const [showGuard, setShowGuard] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [openItemId, setOpenItemId] = useState(null);
  const [openFocusComment, setOpenFocusComment] = useState(false);

  function requestClose() { if (hasDraft) setShowGuard(true); else onClose(); }
  function submitParticipant() {
    if (!participantDraft.trim()) return;
    addParticipant(pid, m.id, participantDraft, participantEmailDraft);
    setParticipantDraft(''); setParticipantEmailDraft('');
  }
  function handleParticipantNameChange(v) {
    setParticipantDraft(v);
    const known = (externalContacts || []).find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    if (known) setParticipantEmailDraft(known.email || '');
  }

  const activeItems = (m.actionItems || []).filter((it) => !it.deleted);
  const doneCount = activeItems.filter((it) => it.status === 'concluida').length;
  const pendingCount = activeItems.filter((it) => it.status !== 'concluida' && it.status !== 'nao-relevante').length;
  const responsavelSuggestions = Array.from(new Set([
    ...(team || []).map((t) => t.name),
    ...(externalContacts || []).map((c) => c.name),
    ...(m.participants || []),
  ].filter(Boolean)));

  const personParticipants = (m.participants || []).filter((name) => !team.some((mem) => mem.name === name));
  const visiblePersons = showAllParticipants ? personParticipants : personParticipants.slice(0, 6);
  const hiddenCount = personParticipants.length - visiblePersons.length;

  const openItem = openItemId ? activeItems.find((it) => it.id === openItemId) : null;

  function exportText() {
    downloadTextFile(`reuniao-${(m.title || 'sem-titulo').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`, buildMeetingText(m, clientName));
    setShowMoreMenu(false);
  }

  return (
    <div className="no-print mtg-view mtg2-overlay" onClick={requestClose}>
      <style>{MEETING_DETAIL_CSS}</style>
      <style>{ACTIVITY_ROW_CSS}</style>
      <div className="mtg2-page" onClick={(e) => e.stopPropagation()}>
        <div className="mtg2-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mtg2-eyebrow"><Mic size={13} /> Reunião</div>
            <button style={S.iconBtnGhost} onClick={requestClose}><X size={20} /></button>
          </div>
          <div className="mtg2-title-row">
            <div style={{ flex: '1 1 400px', minWidth: 0 }}>
              <textarea
                className="mtg2-title" value={m.title} rows={1}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                onChange={(e) => updateMeeting(pid, m.id, { title: e.target.value })}
                onBlur={() => updateMeeting(pid, m.id, {}, `Reunião renomeada: "${m.title}"`)}
              />
              <div className="mtg2-subtitle">
                A IA da PRICETAX organizou o conteúdo desta reunião para você.
                {' · '}<span style={{ color: hasDraft ? '#ff9f40' : 'var(--text-6)' }}>{savedStatusLabel(hasDraft, lastSavedAt)}</span>
              </div>
            </div>
            <div className="mtg2-actions" style={{ position: 'relative' }}>
              <button type="button" style={S.iconBtn} onClick={() => setShowShareModal(true)}><Share2 size={14} /> Compartilhar</button>
              <button type="button" style={S.iconBtn} onClick={() => setShowMoreMenu((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
              {showMoreMenu && (
                <div className="mtg2-more-menu">
                  <button type="button" className="mtg2-more-item" onClick={() => { onExportPdf(); setShowMoreMenu(false); }}><FileDown size={14} /> Exportar PDF</button>
                  <button type="button" className="mtg2-more-item" onClick={exportText}><FileText size={14} /> Exportar Texto (.txt)</button>
                </div>
              )}
              <button style={S.iconBtnGhost} title="Excluir reunião" onClick={() => deleteMeeting(pid, m.id)}><Trash2 size={16} /></button>
            </div>
          </div>
        </div>

        <div className="mtg2-meta-card">
          <div className="mtg2-meta-item">
            <Calendar size={16} className="mtg2-meta-icon" />
            <div>
              <div className="mtg2-meta-label">Data</div>
              <input type="date" value={m.date || ''} onChange={(e) => updateMeeting(pid, m.id, { date: e.target.value }, `Data da reunião alterada: "${m.title}"`)} style={{ border: 'none', background: 'transparent', padding: 0 }} />
            </div>
          </div>
          <div className="mtg2-meta-item">
            <Clock size={16} className="mtg2-meta-icon" />
            <div>
              <div className="mtg2-meta-label">Horário</div>
              <input type="time" value={m.time || ''} onChange={(e) => updateMeeting(pid, m.id, { time: e.target.value })} onBlur={() => updateMeeting(pid, m.id, {}, `Horário da reunião alterado: "${m.title}"`)} style={{ border: 'none', background: 'transparent', padding: 0 }} />
            </div>
          </div>
          <div className="mtg2-meta-item">
            <Building2 size={16} className="mtg2-meta-icon" />
            <div>
              <div className="mtg2-meta-label">Empresa</div>
              <div className="mtg2-meta-value">{clientName || '—'}</div>
            </div>
          </div>
          <div className="mtg2-meta-item">
            <Users size={16} className="mtg2-meta-icon" />
            <div>
              <div className="mtg2-meta-label">Participantes</div>
              <div className="mtg2-meta-value">{(m.participants || []).length} participante{(m.participants || []).length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="mtg2-meta-item">
            <ListChecks size={16} className="mtg2-meta-icon" />
            <div>
              <div className="mtg2-meta-label">Atividades geradas</div>
              <div className="mtg2-meta-value">{activeItems.length} atividade{activeItems.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>

        <div className={`mtg2-body ${isMobile ? 'mobile' : ''}`}>
          <div className="mtg2-main">
            <div className="mtg2-card">
              <div className="mtg2-card-head"><div className="mtg2-card-title"><Users size={15} /> Participantes</div></div>
              <div className="mtg2-participants-row">
                {team.map((mem) => {
                  const activeChip = (m.participants || []).includes(mem.name);
                  return (
                    <button key={mem.id} type="button" style={{ ...S.participantChip, ...(activeChip ? S.participantChipActive : {}) }} onClick={() => toggleParticipant(pid, m.id, mem.name)}>
                      {mem.name}
                    </button>
                  );
                })}
                {visiblePersons.map((name) => {
                  const contact = (externalContacts || []).find((c) => c.name === name);
                  return (
                    <button
                      key={name} type="button"
                      title={contact && contact.email ? `${contact.email} · clique pra remover` : 'Participante · clique pra remover'}
                      style={{ ...S.participantChip, ...S.participantChipActive, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => toggleParticipant(pid, m.id, name)}
                    >
                      {name}<X size={11} />
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <button type="button" className="mtg2-participants-more" onClick={() => setShowAllParticipants(true)}>+{hiddenCount}</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <input
                  type="text" list="mtg-contatos-externos" style={{ flex: '1 1 160px' }}
                  value={participantDraft} onChange={(e) => handleParticipantNameChange(e.target.value)}
                  placeholder="Adicionar participante externo..." onKeyDown={(e) => e.key === 'Enter' && submitParticipant()}
                />
                <datalist id="mtg-contatos-externos">
                  {(externalContacts || []).map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
                <input
                  type="email" style={{ flex: '1 1 160px' }}
                  value={participantEmailDraft} onChange={(e) => setParticipantEmailDraft(e.target.value)}
                  placeholder="e-mail (opcional, só na 1ª vez)" onKeyDown={(e) => e.key === 'Enter' && submitParticipant()}
                />
                <button style={S.iconBtn} onClick={submitParticipant}><Plus size={14} /></button>
              </div>
            </div>

            <EditableTextCard
              icon={<FileText size={15} />} title="Resumo executivo" value={m.summary}
              placeholder="O que foi discutido, em poucas linhas..."
              emptyMessage="A IA ainda não gerou um resumo desta reunião."
              onSave={(v) => updateMeeting(pid, m.id, { summary: v }, `Resumo atualizado: "${m.title}"`)}
            />

            <EditableTextCard
              icon={<ListChecks size={15} />} title="Decisões tomadas" value={m.decisions}
              placeholder="O que ficou definido nesta reunião..."
              emptyMessage="Nenhuma decisão foi identificada."
              onSave={(v) => updateMeeting(pid, m.id, { decisions: v }, `Decisões atualizadas: "${m.title}"`)}
              renderRead={DecisionsRead}
            />

            <TranscriptView meeting={m} />
          </div>

          <div className="mtg2-side">
            <div className="mtg2-card" style={{ padding: 0 }}>
              <div className="mtg2-activities-head">
                <div className="mtg2-card-head" style={{ marginBottom: 4 }}>
                  <div className="mtg2-card-title"><ListChecks size={15} /> Atividades geradas pela IA</div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-6)', background: 'var(--bg-3)', borderRadius: 999, padding: '1px 8px' }}>{activeItems.length}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-5)', marginBottom: 4 }}>
                  {activeItems.length} atividade{activeItems.length === 1 ? '' : 's'} criada{activeItems.length === 1 ? '' : 's'} · {doneCount} concluída{doneCount === 1 ? '' : 's'} · {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="mtg2-activities-list">
                {activeItems.length === 0 ? (
                  <div className="mtg2-empty">
                    Nenhuma atividade foi criada a partir desta reunião.
                  </div>
                ) : (
                  activeItems.map((it) => (
                    <ActivityRow
                      key={it.id}
                      row={{ ...it, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date }}
                      pid={pid} team={team} externalContacts={externalContacts} clientName={clientName}
                      hideOrigin
                      onOpenMeeting={() => {}}
                      onOpen={(row, focusComment) => { setOpenItemId(row.id); setOpenFocusComment(!!focusComment); }}
                      updateActionItem={updateActionItem} deleteActionItem={deleteActionItem} duplicateActionItem={duplicateActionItem}
                      pushUndoToast={pushUndoToast}
                    />
                  ))
                )}
                <button type="button" style={{ ...S.addSubBtn, width: '100%', justifyContent: 'center' }} onClick={() => addActionItem(pid, m.id)}><Plus size={12} /> Nova atividade</button>
                {onViewActivities && (
                  <button type="button" style={{ ...S.iconBtn, justifyContent: 'center' }} onClick={() => onViewActivities(m.id)}>
                    Abrir no centro de atividades →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showGuard && (
        <ConfirmDiscardModal
          onDiscard={() => { setParticipantDraft(''); setShowGuard(false); onClose(); }}
          onCancel={() => setShowGuard(false)}
        />
      )}

      {showShareModal && (
        <MeetingShareModal
          meeting={m}
          onClose={() => setShowShareModal(false)}
          onSetVisibility={onSetShareVisibility}
          onRegenerateLink={onRegenerateShareLink}
        />
      )}

      {openItem && (
        <TodoDrawer
          item={openItem} meeting={m} pid={pid} clientName={clientName}
          responsavelSuggestions={responsavelSuggestions} currentUser={currentUser} log={log}
          onClose={() => { setOpenItemId(null); setOpenFocusComment(false); }}
          onOpenMeeting={() => {}}
          updateActionItem={updateActionItem} deleteActionItem={deleteActionItem} duplicateActionItem={duplicateActionItem}
          addSubtask={addSubtask} toggleSubtask={toggleSubtask} deleteSubtask={deleteSubtask}
          addComment={addComment} deleteComment={deleteComment}
          addAttachment={addAttachment} deleteAttachment={deleteAttachment}
          focusComment={openFocusComment}
        />
      )}
    </div>
  );
}

// Layout de impressão de UMA reunião — mesmo padrão do PrintReport
// (App.jsx): fica `display:none` sempre, e só aparece dentro de
// `@media print`, ativado por exportMeetingPdf() (App.jsx) via
// window.print(). Não reaproveita o PrintReport em si (aquele é
// cronograma inteiro) — só o mesmo mecanismo de CSS.
const MEETING_PRINT_CSS = `
  .mtg-print-report { display: none; }
  @media print {
    .mtg-print-report { display: block !important; }
    body, .page-root { background: #ffffff !important; color: #111 !important; }
  }
  .mtg-print-report, .mtg-print-report * { box-sizing: border-box; }
  .mtg-print-report { font-family: 'Arial', 'Helvetica', sans-serif; color: #111; background: #fff; padding: 12mm; }
  .mtg-print-report h1 { font-size: 20px; margin: 0 0 4px; }
  .mtg-print-report h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .mtg-print-report p { font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
  .mtg-print-report .mtg-print-meta { font-size: 12px; color: #444; margin-bottom: 10px; }
  .mtg-print-report ul { margin: 0; padding-left: 18px; font-size: 12px; }
`;

export function MeetingPrintReport({ meeting, companyName }) {
  const items = (meeting.actionItems || []).filter((it) => !it.deleted);
  return (
    <div className="mtg-print-report">
      <style>{MEETING_PRINT_CSS}</style>
      <h1>{meeting.title || 'Reunião sem título'}</h1>
      <div className="mtg-print-meta">
        {companyName || '—'} · {meeting.date ? fmtDate(meeting.date) : 'sem data'}{meeting.time ? ` às ${meeting.time}` : ''}
        {(meeting.participants || []).length > 0 && <> · {meeting.participants.join(', ')}</>}
      </div>
      {meeting.summary && <><h2>Resumo executivo</h2><p>{meeting.summary}</p></>}
      {meeting.decisions && <><h2>Decisões tomadas</h2><p>{meeting.decisions}</p></>}
      {items.length > 0 && (
        <>
          <h2>Atividades geradas</h2>
          <ul>
            {items.map((it) => (
              <li key={it.id}>[{todoStatusMeta(it.status).label}] {it.title} — {it.owner === 'cliente' ? (companyName || 'Cliente') : 'PRICETAX'}{it.responsible ? ` — ${it.responsible}` : ''}{it.dueDate ? ` — prazo ${fmtDate(it.dueDate)}` : ''}</li>
            ))}
          </ul>
        </>
      )}
      {meeting.transcript && <><h2>Transcrição completa</h2><p>{meeting.transcript}</p></>}
    </div>
  );
}

// Tela pública, só-leitura, de uma reunião compartilhada por link — mesmo
// esquema hardcoded de rota do /quadro/:token (App.jsx), mas sem edição:
// GET /api/public-meeting/:token nunca aceita PATCH.
export function PublicMeetingScreen({ token }) {
  const [state, setState] = useState({ loading: true, error: '', meeting: null, companyName: '' });

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiGet(`/api/public-meeting/${token}`);
        setState({ loading: false, error: '', meeting: res.meeting, companyName: res.companyName || '' });
      } catch (e) {
        setState({ loading: false, error: e.message || 'Link inválido.', meeting: null, companyName: '' });
      }
    })();
  }, [token]);

  if (state.loading) {
    return <div className="page-root" style={S.page}><div style={S.loginWrap}><div style={S.loginBox}><p style={S.loginSub}>Carregando...</p></div></div></div>;
  }
  if (state.error || !state.meeting) {
    return (
      <div className="page-root" style={S.page}>
        <div style={S.loginWrap}>
          <div style={S.loginBox}>
            <h1 style={S.loginTitle}>Link indisponível</h1>
            <p style={S.loginSub}>{state.error || 'Este link não existe mais ou a reunião deixou de ser pública.'}</p>
            <a href="/" style={S.primaryBtn}>Ir para o início</a>
          </div>
        </div>
      </div>
    );
  }

  const m = state.meeting;
  const items = (m.actionItems || []).filter((it) => !it.deleted);
  return (
    <div className="page-root" style={S.page}>
      <style>{MEETING_DETAIL_CSS}</style>
      <div className="mtg2-page" style={{ margin: '24px auto' }}>
        <div className="mtg2-header">
          <div className="mtg2-eyebrow"><Mic size={13} /> Reunião compartilhada · só leitura</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0' }}>{m.title || 'Reunião sem título'}</h1>
          <div className="mtg2-subtitle">{state.companyName}</div>
        </div>
        <div className="mtg2-meta-card">
          <div className="mtg2-meta-item"><Calendar size={16} className="mtg2-meta-icon" /><div><div className="mtg2-meta-label">Data</div><div className="mtg2-meta-value">{m.date ? fmtDate(m.date) : 'Sem data'}</div></div></div>
          <div className="mtg2-meta-item"><Clock size={16} className="mtg2-meta-icon" /><div><div className="mtg2-meta-label">Horário</div><div className="mtg2-meta-value">{m.time || '—'}</div></div></div>
          <div className="mtg2-meta-item"><Users size={16} className="mtg2-meta-icon" /><div><div className="mtg2-meta-label">Participantes</div><div className="mtg2-meta-value">{(m.participants || []).length}</div></div></div>
          <div className="mtg2-meta-item"><ListChecks size={16} className="mtg2-meta-icon" /><div><div className="mtg2-meta-label">Atividades</div><div className="mtg2-meta-value">{items.length}</div></div></div>
        </div>
        <div className="mtg2-body">
          <div className="mtg2-main">
            {m.summary && <div className="mtg2-card"><div className="mtg2-card-title" style={{ marginBottom: 8 }}><FileText size={15} /> Resumo executivo</div><div className="mtg2-read-text">{m.summary}</div></div>}
            {m.decisions && <div className="mtg2-card"><div className="mtg2-card-title" style={{ marginBottom: 8 }}><ListChecks size={15} /> Decisões tomadas</div>{DecisionsRead(m.decisions)}</div>}
            <TranscriptView meeting={m} />
          </div>
          <div className="mtg2-side">
            <div className="mtg2-card">
              <div className="mtg2-card-title" style={{ marginBottom: 10 }}><ListChecks size={15} /> Atividades geradas pela IA</div>
              {items.length === 0 ? <div className="mtg2-empty">Nenhuma atividade foi criada a partir desta reunião.</div> : items.map((it) => (
                <div key={it.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border-1)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textDecoration: it.status === 'concluida' ? 'line-through' : 'none', opacity: it.status === 'concluida' ? .6 : 1 }}>{it.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-5)', marginTop: 2 }}>
                    {TODO_STATUS_META[it.status]?.label || 'Não iniciado'} {it.responsible ? `· ${it.responsible}` : ''} {it.dueDate ? `· ${fmtDate(it.dueDate)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
