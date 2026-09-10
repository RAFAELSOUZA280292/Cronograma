// Aba "TO DO" (2026-09, pedido do Rafael) — visão consolidada de TODOS os
// itens de TO_DO de TODAS as reuniões da empresa, num lugar só. Cada item
// continua fisicamente morando dentro de `meeting.actionItems[]` (mesma
// fonte de dado da aba Reuniões, PROJECT_CONTEXT.md §24) — esta tela só
// achata (flatten) e agrega pra visualização/edição cross-reunião, sem
// duplicar o dado em lugar nenhum. Editar aqui edita o mesmo item que
// aparece dentro do modal da reunião de origem, e vice-versa.
import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ListChecks, Search, Download, Plus, X, ChevronDown, ChevronRight, Mic } from 'lucide-react';
import { S, fmtDate, useIsMobile } from '../App.jsx';
import { MEETINGS_CSS, TODO_STATUS_META, TODO_STATUS_ORDER, todoStatusMeta } from './Meetings.jsx';

const TODO_BOARD_CSS = `
  .todo-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-radius:9px; background:var(--bg-2); border:1px solid var(--border-1); transition:border-color .12s; }
  .todo-row:hover { border-color:var(--border-3); }
  .todo-row:hover .todo-del-btn { opacity:1; }
  .todo-del-btn { opacity:.35; transition:opacity .12s, color .12s; }
  .todo-del-btn:hover { color:#e5484d; }
  .todo-title-input { font-weight:700; font-size:13px; }
  .todo-section-head { display:flex; align-items:center; gap:8px; padding:8px 2px; cursor:pointer; user-select:none; }
  .todo-section-head:hover .todo-section-label { color:var(--text-2); }
  .todo-section-label { font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-4); transition:color .12s; }
  .todo-section-count { font-size:11px; font-weight:700; color:var(--text-6); background:var(--bg-3); border-radius:999px; padding:1px 8px; }
  .todo-owner-btn { font-size:10px; font-weight:800; padding:5px 8px; border-radius:6px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .todo-origin-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--text-5); background:var(--bg-3); border:1px solid var(--border-1); border-radius:7px; padding:5px 9px; cursor:pointer; white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
  .todo-origin-badge:hover { color:var(--text-2); border-color:var(--border-3); }
  .todo-overdue { color:#e2574c !important; font-weight:700; }
  .todo-filter-chip { font-size:11.5px; font-weight:700; padding:6px 11px; border-radius:999px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-5); cursor:pointer; white-space:nowrap; }
  .todo-filter-chip.active { border-color:#F5C400; background:rgba(245,196,0,.12); color:#F5C400; }
  .todo-empty { text-align:center; padding:48px 20px; color:var(--text-6); }
`;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Achata todas as reuniões não-excluídas em uma lista só de itens, cada um
// carregando de onde veio (reunião de origem) pra rastreabilidade na tela.
function collectTodoRows(meetings) {
  const rows = [];
  (meetings || []).filter((m) => !m.deleted).forEach((m) => {
    (m.actionItems || []).filter((it) => !it.deleted).forEach((it) => {
      rows.push({ ...it, meetingId: m.id, meetingTitle: m.title || 'Reunião sem título', meetingDate: m.date || '' });
    });
  });
  return rows;
}

export function TodoBoardView({ meetings, team, externalContacts, clientName, pid, onOpenMeeting, onAddItem, updateActionItem, deleteActionItem }) {
  const isMobile = useIsMobile();
  const today = todayIso();
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('todos');
  const [collapsed, setCollapsed] = useState(() => new Set(['concluida', 'nao-relevante']));
  const [showAddPicker, setShowAddPicker] = useState(false);

  const allRows = useMemo(() => collectTodoRows(meetings), [meetings]);

  const meetingsForPicker = useMemo(() => (
    (meetings || []).filter((m) => !m.deleted).slice().sort((a, b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`))
  ), [meetings]);

  const responsavelSuggestions = useMemo(() => Array.from(new Set([
    ...(team || []).map((t) => t.name),
    ...(externalContacts || []).map((c) => c.name),
    ...(meetings || []).flatMap((m) => m.participants || []),
  ].filter(Boolean))), [team, externalContacts, meetings]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (ownerFilter !== 'todos' && (r.owner === 'cliente' ? 'cliente' : 'pricetax') !== ownerFilter) return false;
      if (!q) return true;
      return (r.title || '').toLowerCase().includes(q)
        || (r.responsible || '').toLowerCase().includes(q)
        || (r.meetingTitle || '').toLowerCase().includes(q);
    });
  }, [allRows, search, ownerFilter]);

  const grouped = useMemo(() => {
    const byStatus = {};
    TODO_STATUS_ORDER.forEach((s) => { byStatus[s] = []; });
    filteredRows.forEach((r) => {
      const s = TODO_STATUS_META[r.status] ? r.status : 'nao-iniciado';
      byStatus[s].push(r);
    });
    TODO_STATUS_ORDER.forEach((s) => {
      byStatus[s].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return `${b.meetingDate || ''}`.localeCompare(`${a.meetingDate || ''}`);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    });
    return byStatus;
  }, [filteredRows]);

  const counts = useMemo(() => {
    const c = { total: allRows.length, urgente: 0, pendentes: 0 };
    allRows.forEach((r) => {
      if (r.status === 'urgente') c.urgente++;
      if (r.status !== 'concluida' && r.status !== 'nao-relevante') c.pendentes++;
    });
    return c;
  }, [allRows]);

  function toggleSection(s) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  function handleResponsibleChange(row, name) {
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

  function handleAddToMeeting(meetingId) {
    setShowAddPicker(false);
    if (meetingId) onAddItem(meetingId);
  }

  function exportExcel() {
    const rows = allRows.map((r) => ({
      Reunião: r.meetingTitle,
      'Data da reunião': r.meetingDate ? fmtDate(r.meetingDate) : '',
      Título: r.title || '',
      Lado: r.owner === 'cliente' ? (clientName || 'Cliente') : 'PRICETAX',
      Responsável: r.responsible || '',
      Status: todoStatusMeta(r.status).label,
      Prazo: r.dueDate ? fmtDate(r.dueDate) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 44 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TO DO');
    const fname = `todo-${(clientName || 'reuniao').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  function renderRow(row) {
    const owner = row.owner === 'cliente' ? 'cliente' : 'pricetax';
    const isOverdue = row.dueDate && row.dueDate < today && row.status !== 'concluida' && row.status !== 'nao-relevante';
    return (
      <div key={row.id} className="todo-row">
        <select
          value={TODO_STATUS_META[row.status] ? row.status : 'nao-iniciado'}
          onChange={(e) => updateActionItem(pid, row.meetingId, row.id, { status: e.target.value })}
          style={{ width: 150, flexShrink: 0, fontWeight: 700, color: todoStatusMeta(row.status).color, background: todoStatusMeta(row.status).bg, border: `1px solid ${todoStatusMeta(row.status).border}` }}
        >
          {TODO_STATUS_ORDER.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
        </select>

        <input
          type="text" className="todo-title-input" value={row.title}
          onChange={(e) => updateActionItem(pid, row.meetingId, row.id, { title: e.target.value })}
          style={{ flex: '2 1 220px', minWidth: 180, textDecoration: row.status === 'concluida' ? 'line-through' : 'none', opacity: row.status === 'concluida' ? .6 : 1 }}
        />

        <button
          type="button" className="todo-owner-btn" onClick={() => updateActionItem(pid, row.meetingId, row.id, { owner: owner === 'pricetax' ? 'cliente' : 'pricetax' })}
          title="Clique pra alternar entre PRICETAX e cliente"
          style={{
            border: owner === 'pricetax' ? '1px solid #F5C400' : '1px solid #3ea6ff',
            background: owner === 'pricetax' ? 'rgba(245,196,0,.14)' : 'rgba(62,166,255,.14)',
            color: owner === 'pricetax' ? '#F5C400' : '#3ea6ff',
            flex: '0 1 120px',
          }}
        >{owner === 'pricetax' ? 'PRICETAX' : (clientName || 'Cliente')}</button>

        <input
          type="text" list="todo-board-responsaveis"
          value={row.responsible || ''} onChange={(e) => handleResponsibleChange(row, e.target.value)}
          placeholder="Responsável" title="Responsável"
          style={{ flex: '1 1 150px', minWidth: 130 }}
        />

        <input
          type="date" value={row.dueDate || ''} title="Prazo"
          onChange={(e) => updateActionItem(pid, row.meetingId, row.id, { dueDate: e.target.value })}
          style={{ width: 138, flexShrink: 0 }}
          className={isOverdue ? 'todo-overdue' : ''}
        />

        <button type="button" className="todo-origin-badge" onClick={() => onOpenMeeting(row.meetingId)} title="Abrir a reunião de origem">
          <Mic size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.meetingTitle}</span>
          <span style={{ opacity: .7, flexShrink: 0 }}>· {row.meetingDate ? fmtDate(row.meetingDate) : 'sem data'}</span>
        </button>

        <button type="button" style={S.iconBtnGhost} className="todo-del-btn" title="Excluir item" onClick={() => deleteActionItem(pid, row.meetingId, row.id)}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="mtg-view todo-board-view">
      <style>{MEETINGS_CSS}</style>
      <style>{TODO_BOARD_CSS}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={20} /> TO DO
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 2 }}>
            Tudo que nasceu de alguma reunião, num lugar só — {counts.total} item{counts.total === 1 ? '' : 's'}
            {counts.pendentes > 0 && <> · {counts.pendentes} pendente{counts.pendentes === 1 ? '' : 's'}</>}
            {counts.urgente > 0 && <> · <span style={{ color: '#e2574c', fontWeight: 700 }}>{counts.urgente} urgente{counts.urgente === 1 ? '' : 's'}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button style={S.iconBtn} onClick={exportExcel}><Download size={14} /> Exportar Excel</button>
          <button style={S.primaryBtn} onClick={() => setShowAddPicker((v) => !v)}><Plus size={15} /> Novo item</button>
          {showAddPicker && (
            <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 10, width: 260, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
              {meetingsForPicker.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-5)' }}>Crie uma reunião primeiro, na aba Reuniões.</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-5)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Adicionar em qual reunião?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                    {meetingsForPicker.map((m) => (
                      <button
                        key={m.id} type="button" onClick={() => handleAddToMeeting(m.id)}
                        style={{ textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12 }}
                      >
                        <div style={{ fontWeight: 700 }}>{m.title || 'Reunião sem título'}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-6)' }}>{m.date ? fmtDate(m.date) : 'Sem data'}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-6)' }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, responsável ou reunião..."
            style={{ paddingLeft: 30 }}
          />
        </div>
        {[['todos', 'Todos'], ['pricetax', 'PRICETAX'], ['cliente', clientName || 'Cliente']].map(([key, label]) => (
          <button key={key} type="button" className={`todo-filter-chip ${ownerFilter === key ? 'active' : ''}`} onClick={() => setOwnerFilter(key)}>{label}</button>
        ))}
      </div>

      {allRows.length === 0 ? (
        <div className="todo-empty">
          <ListChecks size={28} style={{ opacity: .4, marginBottom: 8 }} />
          <div style={{ fontWeight: 700, color: 'var(--text-4)' }}>Nenhum item de TO_DO ainda.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Itens aparecem aqui assim que forem criados dentro de uma reunião, ou enviando uma transcrição pra IA processar.</div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="todo-empty">Nenhum item bate com esse filtro.</div>
      ) : (
        TODO_STATUS_ORDER.filter((s) => grouped[s].length > 0).map((s) => {
          const meta = TODO_STATUS_META[s];
          const isCollapsed = collapsed.has(s);
          return (
            <div key={s} style={{ marginBottom: 6 }}>
              <div className="todo-section-head" onClick={() => toggleSection(s)}>
                {isCollapsed ? <ChevronRight size={14} color="var(--text-5)" /> : <ChevronDown size={14} color="var(--text-5)" />}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                <span className="todo-section-label">{meta.label}</span>
                <span className="todo-section-count">{grouped[s].length}</span>
              </div>
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {grouped[s].map(renderRow)}
                </div>
              )}
            </div>
          );
        })
      )}

      <datalist id="todo-board-responsaveis">
        {responsavelSuggestions.map((n) => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}
