// Painel lateral de detalhe de uma atividade (2026-09, redesign "Centro de
// Execução"). Reaproveita o mesmo dado/mutators da linha na lista — não
// duplica nada, só mostra mais campos e mais seções (Origem/Descrição/
// Subtarefas/Comentários/Arquivos/Histórico). Histórico reaproveita
// literalmente o mesmo mecanismo de `project.log` + `activityId` que as
// atividades de cronograma já usam (ver PROJECT_CONTEXT.md §25) — só
// passamos o id do item de TO_DO no lugar do id da atividade.
import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, Plus, Trash2, Download, Paperclip, Copy, Check } from 'lucide-react';
import { S, fmtDate, fmtTs, useIsMobile, useAutosaveTimestamp, savedStatusLabel } from '../App.jsx';
import { TODO_STATUS_META, TODO_STATUS_ORDER, todoStatusMeta } from './Meetings.jsx';
import { initials, avatarColor, daysOverdue, isItemOverdue } from './todoUtils.js';

const MAX_TODO_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const DRAWER_CSS = `
  .todo-drawer-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; justify-content:flex-end; z-index:60; }
  .todo-drawer { width:460px; max-width:94vw; height:100%; background:var(--bg-2); border-left:1px solid var(--border-2); overflow-y:auto; transform:translateX(24px); opacity:0; transition:transform .18s ease, opacity .18s ease; }
  .todo-drawer.open { transform:translateX(0); opacity:1; }
  .todo-drawer.mobile { width:100vw; max-width:100vw; }
  .todo-drawer-head { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--border-1); position:sticky; top:0; background:var(--bg-2); z-index:1; }
  .todo-drawer-body { padding:16px 18px 28px; }
  .todo-drawer-title { font-weight:800; font-size:16px; width:100%; resize:none; overflow:hidden; line-height:1.4; border:1px solid transparent; background:transparent; border-radius:6px; padding:4px 6px; font-family:inherit; }
  .todo-drawer-title:hover { background:var(--bg-3); }
  .todo-drawer-title:focus { background:var(--bg-1); border-color:var(--border-3); outline:none; }
  .todo-drawer-subtitle { font-size:12.5px; color:var(--text-5); width:100%; border:1px solid transparent; background:transparent; border-radius:6px; padding:4px 6px; font-family:inherit; }
  .todo-drawer-subtitle:hover { background:var(--bg-3); }
  .todo-drawer-subtitle:focus { background:var(--bg-1); border-color:var(--border-3); outline:none; }
  .todo-drawer-meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
  .todo-drawer-meta-full { grid-column:1 / -1; }
  .todo-drawer-meta-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-6); margin-bottom:4px; }
  .todo-section { margin-top:20px; padding-top:16px; border-top:1px solid var(--border-1); }
  .todo-section-title { display:flex; align-items:center; justify-content:space-between; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:var(--text-4); margin-bottom:10px; }
  .todo-origin-card { display:flex; align-items:center; gap:8px; width:100%; text-align:left; background:var(--bg-3); border:1px solid var(--border-1); border-radius:9px; padding:10px 12px; cursor:pointer; }
  .todo-origin-card:hover { border-color:var(--border-3); }
  .todo-drawer-notes { width:100%; min-height:80px; resize:vertical; font-family:inherit; font-size:12.5px; line-height:1.5; }
  .todo-sub-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
  .todo-sub-check { width:16px; height:16px; border-radius:5px; border:1.5px solid var(--border-3); background:var(--bg-1); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; color:#fff; }
  .todo-sub-check.checked { background:#3ecf6e; border-color:#3ecf6e; }
  .todo-sub-title { flex:1; font-size:12.5px; }
  .todo-sub-title.done { text-decoration:line-through; color:var(--text-6); }
  .todo-avatar { width:22px; height:22px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:800; flex-shrink:0; }
  .todo-comment { background:var(--bg-3); border:1px solid var(--border-1); border-radius:9px; padding:8px 10px; margin-bottom:8px; }
  .todo-comment-head { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-5); margin-bottom:4px; }
  .todo-comment-text { font-size:12.5px; color:var(--text-2); white-space:pre-wrap; }
  .todo-attachment-row { display:flex; align-items:center; gap:8px; padding:6px 0; font-size:12px; }
  .todo-history-row { font-size:11.5px; color:var(--text-5); padding:6px 0; border-bottom:1px solid var(--border-1); }
  .todo-history-row:last-child { border-bottom:none; }
`;

function AvatarBadge({ name, size = 22 }) {
  if (!name) return null;
  const c = avatarColor(name);
  return <div className="todo-avatar" style={{ width: size, height: size, background: c.bg, color: c.fg }}>{initials(name)}</div>;
}

export function TodoDrawer({
  item, meeting, clientName, responsavelSuggestions, currentUser, log, pid,
  onClose, onOpenMeeting,
  updateActionItem, deleteActionItem, duplicateActionItem,
  addSubtask, toggleSubtask, deleteSubtask,
  addComment, deleteComment,
  addAttachment, deleteAttachment,
  focusComment,
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  useEffect(() => { const raf = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(raf); }, []);
  const lastSavedAt = useAutosaveTimestamp(item);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const commentRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (focusComment && commentRef.current) commentRef.current.focus();
  }, [focusComment]);

  function requestClose() {
    setOpen(false);
    setTimeout(onClose, 160);
  }

  const owner = item.owner === 'cliente' ? 'cliente' : 'pricetax';
  const overdue = isItemOverdue(item);
  const subtasks = item.subtasks || [];
  const doneSubs = subtasks.filter((s) => s.done).length;
  const comments = item.comments || [];
  const attachments = item.attachments || [];
  const itemHistory = (log || []).filter((l) => l.activityId === item.id);

  function submitComment() {
    if (!commentDraft.trim()) return;
    addComment(pid, meeting.id, item.id, commentDraft);
    setCommentDraft('');
  }

  function handleFilePicked(e) {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_TODO_ATTACHMENT_BYTES) { window.alert('Arquivo maior que 8MB — não pode ser anexado.'); return; }
    const reader = new FileReader();
    reader.onload = () => addAttachment(pid, meeting.id, item.id, { name: file.name, size: file.size, type: file.type, dataUrl: reader.result });
    reader.readAsDataURL(file);
  }

  const canDeleteComment = (c) => currentUser && (c.userId === currentUser.id || currentUser.role === 'master');

  return (
    <div className="todo-drawer-overlay" onClick={requestClose}>
      <style>{DRAWER_CSS}</style>
      <div className={`todo-drawer ${open ? 'open' : ''} ${isMobile ? 'mobile' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="todo-drawer-head">
          <select
            value={TODO_STATUS_META[item.status] ? item.status : 'nao-iniciado'}
            onChange={(e) => updateActionItem(pid, meeting.id, item.id, { status: e.target.value })}
            style={{ width: 160, flexShrink: 0, fontWeight: 700, color: todoStatusMeta(item.status).color, background: todoStatusMeta(item.status).bg, border: `1px solid ${todoStatusMeta(item.status).border}` }}
          >
            {TODO_STATUS_ORDER.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-6)', flex: 1 }}>{savedStatusLabel(false, lastSavedAt)}</span>
          <button type="button" style={S.iconBtnGhost} title="Duplicar atividade" onClick={() => duplicateActionItem(pid, meeting.id, item.id)}><Copy size={16} /></button>
          <button type="button" style={S.iconBtnGhost} title="Excluir atividade" onClick={() => { deleteActionItem(pid, meeting.id, item.id); requestClose(); }}><Trash2 size={16} /></button>
          <button type="button" style={S.iconBtnGhost} onClick={requestClose}><X size={20} /></button>
        </div>

        <div className="todo-drawer-body">
          <textarea
            className="todo-drawer-title" value={item.title} rows={1}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
            onChange={(e) => updateActionItem(pid, meeting.id, item.id, { title: e.target.value })}
          />
          <input
            type="text" className="todo-drawer-subtitle" value={item.subtitle || ''}
            placeholder="Contexto curto (opcional)"
            onChange={(e) => updateActionItem(pid, meeting.id, item.id, { subtitle: e.target.value })}
          />

          <div className="todo-drawer-meta">
            <div>
              <div className="todo-drawer-meta-label">Empresa</div>
              <div style={{ fontSize: 12.5 }}>{clientName || '—'}</div>
            </div>
            <div>
              <div className="todo-drawer-meta-label">Lado responsável</div>
              <button
                type="button"
                onClick={() => updateActionItem(pid, meeting.id, item.id, { owner: owner === 'pricetax' ? 'cliente' : 'pricetax' })}
                style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                  border: owner === 'pricetax' ? '1px solid #F5C400' : '1px solid #3ea6ff',
                  background: owner === 'pricetax' ? 'rgba(245,196,0,.14)' : 'rgba(62,166,255,.14)',
                  color: owner === 'pricetax' ? '#F5C400' : '#3ea6ff',
                }}
              >{owner === 'pricetax' ? 'PRICETAX' : (clientName || 'Cliente')}</button>
            </div>
            <div>
              <div className="todo-drawer-meta-label">Responsável</div>
              <input
                type="text" list="todo-drawer-responsaveis" value={item.responsible || ''}
                placeholder="Sem responsável"
                onChange={(e) => updateActionItem(pid, meeting.id, item.id, { responsible: e.target.value })}
              />
            </div>
            <div>
              <div className="todo-drawer-meta-label">Data de vencimento</div>
              <input
                type="date" value={item.dueDate || ''}
                onChange={(e) => updateActionItem(pid, meeting.id, item.id, { dueDate: e.target.value })}
                style={overdue ? { borderColor: '#e2574c', color: '#e2574c' } : undefined}
              />
              {overdue && <div style={{ fontSize: 10.5, color: '#e2574c', fontWeight: 700, marginTop: 2 }}>Vencida há {daysOverdue(item.dueDate)} dia{daysOverdue(item.dueDate) === 1 ? '' : 's'}</div>}
            </div>
          </div>

          {meeting && (
            <div className="todo-section">
              <div className="todo-section-title">Origem</div>
              <button type="button" className="todo-origin-card" onClick={() => onOpenMeeting(meeting.id)}>
                <Mic size={14} color="var(--text-5)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{meeting.title || 'Reunião sem título'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-6)' }}>Reunião · {meeting.date ? fmtDate(meeting.date) : 'sem data'}</div>
                </div>
              </button>
            </div>
          )}

          <div className="todo-section">
            <div className="todo-section-title">Descrição</div>
            <textarea
              className="todo-drawer-notes" value={item.notes || ''}
              placeholder="Detalhe o que precisa ser feito..."
              onChange={(e) => updateActionItem(pid, meeting.id, item.id, { notes: e.target.value })}
            />
          </div>

          <div className="todo-section">
            <div className="todo-section-title">
              <span>Subtarefas</span>
              {subtasks.length > 0 && <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{doneSubs} de {subtasks.length}</span>}
            </div>
            {subtasks.map((s) => (
              <div key={s.id} className="todo-sub-row">
                <button type="button" className={`todo-sub-check ${s.done ? 'checked' : ''}`} onClick={() => toggleSubtask(pid, meeting.id, item.id, s.id)}>
                  {s.done && <Check size={11} strokeWidth={3} />}
                </button>
                <span className={`todo-sub-title ${s.done ? 'done' : ''}`}>{s.title}</span>
                <button type="button" style={S.iconBtnGhost} onClick={() => deleteSubtask(pid, meeting.id, item.id, s.id)}><X size={13} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                type="text" value={subtaskDraft} placeholder="Adicionar subtarefa..."
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addSubtask(pid, meeting.id, item.id, subtaskDraft); setSubtaskDraft(''); } }}
              />
              <button type="button" style={S.iconBtn} onClick={() => { addSubtask(pid, meeting.id, item.id, subtaskDraft); setSubtaskDraft(''); }}><Plus size={14} /></button>
            </div>
          </div>

          <div className="todo-section">
            <div className="todo-section-title"><span>Comentários</span><span style={{ fontWeight: 600, textTransform: 'none' }}>{comments.length}</span></div>
            {comments.map((c) => (
              <div key={c.id} className="todo-comment">
                <div className="todo-comment-head">
                  <AvatarBadge name={c.user} size={18} />
                  <span style={{ fontWeight: 700 }}>{c.user}</span>
                  <span>· {c.ts ? fmtTs(c.ts) : ''}</span>
                  {canDeleteComment(c) && <button type="button" style={{ ...S.iconBtnGhost, marginLeft: 'auto', padding: 2 }} onClick={() => deleteComment(pid, meeting.id, item.id, c.id)}><X size={12} /></button>}
                </div>
                <div className="todo-comment-text">{c.text}</div>
              </div>
            ))}
            <textarea
              ref={commentRef} className="todo-drawer-notes" style={{ minHeight: 56 }} value={commentDraft}
              placeholder="Adicione um comentário... (Cmd/Ctrl+Enter para enviar)"
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitComment(); }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" style={S.primaryBtn} onClick={submitComment}>Enviar</button>
            </div>
          </div>

          <div className="todo-section">
            <div className="todo-section-title"><span>Arquivos</span><span style={{ fontWeight: 600, textTransform: 'none' }}>{attachments.length}</span></div>
            {attachments.map((a) => (
              <div key={a.id} className="todo-attachment-row">
                <Paperclip size={13} color="var(--text-6)" />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ color: 'var(--text-6)', flexShrink: 0 }}>{(a.size / 1024).toFixed(0)}KB</span>
                <a href={a.dataUrl} download={a.name} style={{ ...S.iconBtnGhost, textDecoration: 'none' }} title="Baixar"><Download size={14} /></a>
                <button type="button" style={S.iconBtnGhost} onClick={() => deleteAttachment(pid, meeting.id, item.id, a.id)}><X size={13} /></button>
              </div>
            ))}
            <input ref={fileRef} type="file" onChange={handleFilePicked} style={{ marginTop: 8, fontSize: 11.5 }} />
          </div>

          <div className="todo-section">
            <div className="todo-section-title">Histórico</div>
            {itemHistory.length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
            {itemHistory.map((l, i) => (
              <div key={i} className="todo-history-row">
                <strong style={{ color: 'var(--text-3)' }}>{l.user || 'Sistema'}</strong> · {l.action} · {fmtTs(l.ts)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <datalist id="todo-drawer-responsaveis">
        {(responsavelSuggestions || []).map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
