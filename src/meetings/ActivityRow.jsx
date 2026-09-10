// Linha de atividade (item de TO_DO) — extraído de TodoBoard.jsx pra ser
// o MESMO componente visual usado na aba Atividades e na coluna de
// atividades da tela de Reunião (PROJECT_CONTEXT.md §25/§26). Não muda
// dado nenhum, só decide como uma linha é desenhada e reage a clique.
import React, { useState } from 'react';
import { X, Mic, Check, MessageSquare, Copy, Calendar } from 'lucide-react';
import { S, fmtDate } from '../App.jsx';
import { TODO_STATUS_META, TODO_STATUS_ORDER, todoStatusMeta } from './Meetings.jsx';
import { initials, avatarColor, daysOverdue, isItemOverdue } from './todoUtils.js';

// CSS da linha em si (não do entorno/board) — exportada pra qualquer
// tela que renderize <ActivityRow> incluir uma vez (TodoBoard.jsx e a
// coluna de atividades da tela de Reunião, MeetingDetail.jsx).
export const ACTIVITY_ROW_CSS = `
  .todo-row { display:flex; flex-direction:column; gap:9px; padding:13px 14px; border-radius:11px; background:var(--bg-2); border:1px solid var(--border-1); transition:border-color .14s, box-shadow .14s; cursor:pointer; }
  .todo-row:hover { border-color:var(--border-3); box-shadow:0 2px 10px rgba(0,0,0,.07); }
  .todo-row:hover .todo-row-actions { opacity:1; }
  .todo-row-actions { opacity:0; transition:opacity .14s; display:flex; gap:2px; }
  .todo-del-btn:hover { color:#e5484d; }
  .todo-row-main { display:flex; align-items:flex-start; gap:10px; }
  .todo-row-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding-left:30px; }
  .todo-check { width:20px; height:20px; border-radius:6px; border:1.5px solid var(--border-3); background:var(--bg-1); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; color:#fff; margin-top:2px; transition:background .14s, border-color .14s, transform .08s; }
  .todo-check:hover { border-color:#3ecf6e; transform:scale(1.06); }
  .todo-check.checked { background:#3ecf6e; border-color:#3ecf6e; }
  .todo-title-wrap { flex:1; min-width:0; }
  .todo-title-text { font-weight:700; font-size:13.5px; line-height:1.4; color:var(--text-1); word-break:break-word; }
  .todo-title-text.done { text-decoration:line-through; opacity:.6; }
  .todo-subtitle-text { font-size:11.5px; color:var(--text-5); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .todo-avatar-chip { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-3); background:transparent; border:1px solid transparent; border-radius:7px; padding:3px 6px; cursor:pointer; }
  .todo-avatar-chip:hover { background:var(--bg-3); border-color:var(--border-2); }
  .todo-avatar { width:20px; height:20px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:800; flex-shrink:0; }
  .todo-date-chip { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:7px; padding:5px 9px; cursor:pointer; }
  .todo-date-chip:hover { border-color:var(--border-3); }
  .todo-date-chip.overdue { color:#e2574c; background:rgba(226,87,76,.1); border-color:rgba(226,87,76,.4); font-weight:700; }
  .todo-owner-btn { font-size:10px; font-weight:800; padding:5px 8px; border-radius:6px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .todo-origin-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:7px; padding:5px 9px; cursor:pointer; white-space:nowrap; max-width:260px; overflow:hidden; text-overflow:ellipsis; }
  .todo-origin-badge:hover { color:var(--text-2); border-color:var(--border-3); }
`;

function AvatarBadge({ name }) {
  if (!name) return <span style={{ fontSize: 12, color: 'var(--text-6)' }}>Sem responsável</span>;
  const c = avatarColor(name);
  return (
    <>
      <div className="todo-avatar" style={{ background: c.bg, color: c.fg }}>{initials(name)}</div>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </>
  );
}

export function ActivityRow({
  row, pid, team, externalContacts, clientName, hideOrigin,
  onOpenMeeting, onOpen,
  updateActionItem, deleteActionItem, duplicateActionItem, pushUndoToast,
}) {
  const [editingField, setEditingField] = useState(null); // 'responsible' | 'dueDate' | null
  const owner = row.owner === 'cliente' ? 'cliente' : 'pricetax';
  const isDone = row.status === 'concluida';
  const overdue = isItemOverdue(row);

  function handleResponsibleChange(name) {
    const patch = { responsible: name };
    const key = name.trim().toLowerCase();
    if (key) {
      const isTeam = (team || []).some((t) => t.name.toLowerCase() === key);
      const isExternal = (externalContacts || []).some((c) => c.name.toLowerCase() === key);
      if (isTeam) patch.owner = 'pricetax';
      else if (isExternal) patch.owner = 'cliente';
    }
    updateActionItem(pid, row.meetingId, row.id, patch);
  }

  function handleToggleComplete() {
    const prevStatus = row.status;
    updateActionItem(pid, row.meetingId, row.id, { status: isDone ? 'nao-iniciado' : 'concluida' });
    if (!isDone && pushUndoToast) {
      pushUndoToast('Atividade concluída · Desfazer', () => updateActionItem(pid, row.meetingId, row.id, { status: prevStatus }));
    }
  }

  return (
    <div className="todo-row" onClick={() => onOpen(row)}>
      <div className="todo-row-main">
        <button
          type="button" className={`todo-check ${isDone ? 'checked' : ''}`}
          title={isDone ? 'Marcar como não concluída' : 'Marcar como concluída'}
          onClick={(e) => { e.stopPropagation(); handleToggleComplete(); }}
        >
          {isDone && <Check size={13} strokeWidth={3} />}
        </button>

        <div className="todo-title-wrap">
          <div className={`todo-title-text ${isDone ? 'done' : ''}`}>{row.title}</div>
          {row.subtitle && <div className="todo-subtitle-text" title={row.subtitle}>{row.subtitle}</div>}
        </div>

        <div className="todo-row-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" style={S.iconBtnGhost} title="Comentar" onClick={() => onOpen(row, true)}><MessageSquare size={14} /></button>
          <button type="button" style={S.iconBtnGhost} title="Duplicar" onClick={() => duplicateActionItem(pid, row.meetingId, row.id)}><Copy size={14} /></button>
          <button type="button" style={S.iconBtnGhost} className="todo-del-btn" title="Excluir" onClick={() => deleteActionItem(pid, row.meetingId, row.id)}><X size={14} /></button>
        </div>
      </div>

      <div className="todo-row-meta" onClick={(e) => e.stopPropagation()}>
        <select
          value={TODO_STATUS_META[row.status] ? row.status : 'nao-iniciado'}
          onChange={(e) => updateActionItem(pid, row.meetingId, row.id, { status: e.target.value })}
          style={{ width: 148, flexShrink: 0, fontWeight: 700, fontSize: 11.5, color: todoStatusMeta(row.status).color, background: todoStatusMeta(row.status).bg, border: `1px solid ${todoStatusMeta(row.status).border}` }}
        >
          {TODO_STATUS_ORDER.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
        </select>

        <button
          type="button" className="todo-owner-btn" onClick={() => updateActionItem(pid, row.meetingId, row.id, { owner: owner === 'pricetax' ? 'cliente' : 'pricetax' })}
          title="Clique pra alternar entre PRICETAX e cliente"
          style={{
            border: owner === 'pricetax' ? '1px solid #F5C400' : '1px solid #3ea6ff',
            background: owner === 'pricetax' ? 'rgba(245,196,0,.14)' : 'rgba(62,166,255,.14)',
            color: owner === 'pricetax' ? '#F5C400' : '#3ea6ff',
          }}
        >{owner === 'pricetax' ? 'PRICETAX' : (clientName || 'Cliente')}</button>

        {editingField === 'responsible' ? (
          <input
            autoFocus type="text" list="todo-board-responsaveis" defaultValue={row.responsible || ''}
            onBlur={(e) => { handleResponsibleChange(e.target.value); setEditingField(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            style={{ width: 150 }}
          />
        ) : (
          <button type="button" className="todo-avatar-chip" onClick={() => setEditingField('responsible')}>
            <AvatarBadge name={row.responsible} />
          </button>
        )}

        {editingField === 'dueDate' ? (
          <input
            autoFocus type="date" defaultValue={row.dueDate || ''}
            onBlur={(e) => { updateActionItem(pid, row.meetingId, row.id, { dueDate: e.target.value }); setEditingField(null); }}
            style={{ width: 138 }}
          />
        ) : (
          <button type="button" className={`todo-date-chip ${overdue ? 'overdue' : ''}`} onClick={() => setEditingField('dueDate')}>
            <Calendar size={11} />
            {row.dueDate ? (overdue ? `Vencida há ${daysOverdue(row.dueDate)} dia${daysOverdue(row.dueDate) === 1 ? '' : 's'}` : fmtDate(row.dueDate)) : 'Sem prazo'}
          </button>
        )}

        {!hideOrigin && (
          <button type="button" className="todo-origin-badge" onClick={() => onOpenMeeting(row.meetingId)} title="Abrir a reunião de origem">
            <Mic size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.meetingTitle}</span>
            <span style={{ opacity: .7, flexShrink: 0 }}>· {row.meetingDate ? fmtDate(row.meetingDate) : 'sem data'}</span>
          </button>
        )}

        {(row.subtasks || []).length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-6)' }}>{(row.subtasks || []).filter((s) => s.done).length}/{(row.subtasks || []).length} subtarefas</span>
        )}
        {(row.comments || []).length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-6)', display: 'flex', alignItems: 'center', gap: 3 }}><MessageSquare size={11} />{(row.comments || []).length}</span>
        )}
      </div>
    </div>
  );
}
