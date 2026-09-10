// Aba "Atividades" (ex-"TO DO", redesign 2026-09 — "Centro de Execução")
// — visão consolidada de TODOS os itens de TO_DO de TODAS as reuniões da
// empresa, num lugar só. Cada item continua fisicamente morando dentro de
// `meeting.actionItems[]` (mesma fonte de dado da aba Reuniões,
// PROJECT_CONTEXT.md §25) — esta tela só achata (flatten) e agrega pra
// visualização/edição cross-reunião, sem duplicar o dado em lugar nenhum.
// Editar aqui edita o mesmo item que aparece dentro do modal da reunião de
// origem, e vice-versa. O painel de detalhe fica em TodoDrawer.jsx (arquivo
// separado, pra este aqui não virar um componente gigante).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ListChecks, Search, Download, Plus, X, ChevronDown, ChevronRight,
  Filter, ArrowUpDown, MoreHorizontal,
} from 'lucide-react';
import { S, fmtDate, useIsMobile } from '../App.jsx';
import { MEETINGS_CSS, TODO_STATUS_META, TODO_STATUS_ORDER, todoStatusMeta } from './Meetings.jsx';
import { TodoDrawer } from './TodoDrawer.jsx';
import { ActivityRow, ACTIVITY_ROW_CSS } from './ActivityRow.jsx';
import { isItemOverdue, todayIso, greetingPeriod } from './todoUtils.js';

const SORT_MODE_KEY = 'pricetax_todo_sort_mode';

const QUICK_FILTERS = [
  { key: 'minha', label: 'Minha fila' },
  { key: 'todos', label: 'Todos' },
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: 'Próximos 7 dias' },
];

const SORT_OPTIONS = [
  { key: 'priority', label: 'Prioridade (atrasada > urgente > prazo)' },
  { key: 'recent', label: 'Mais recente' },
  { key: 'oldest', label: 'Mais antiga' },
  { key: 'dueAsc', label: 'Prazo mais próximo' },
  { key: 'dueDesc', label: 'Prazo mais distante' },
  { key: 'responsavel', label: 'Responsável (A-Z)' },
  { key: 'status', label: 'Status' },
];

const GROUP_OPTIONS = [
  { key: 'status', label: 'Status' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'reuniao', label: 'Reunião' },
];

const TODO_BOARD_CSS = `
  .todo-section-head { display:flex; align-items:center; gap:8px; padding:8px 2px; cursor:pointer; user-select:none; }
  .todo-section-head:hover .todo-section-label { color:var(--text-2); }
  .todo-section-label { font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-4); transition:color .12s; }
  .todo-section-count { font-size:11px; font-weight:700; color:var(--text-6); background:var(--bg-3); border-radius:999px; padding:1px 8px; }
  .todo-filter-chip { font-size:11.5px; font-weight:700; padding:6px 11px; border-radius:999px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-5); cursor:pointer; white-space:nowrap; }
  .todo-filter-chip.active { border-color:#F5C400; background:rgba(245,196,0,.12); color:#F5C400; }
  .todo-empty { text-align:center; padding:48px 20px; color:var(--text-6); }
  .todo-stat-card { display:flex; flex-direction:column; gap:2px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:11px; padding:12px 16px; min-width:110px; cursor:pointer; transition:border-color .14s, transform .1s; }
  .todo-stat-card:hover { border-color:var(--border-3); transform:translateY(-1px); }
  .todo-stat-card.active { border-color:#F5C400; }
  .todo-stat-card.static { cursor:default; }
  .todo-stat-card.static:hover { transform:none; }
  .todo-stat-value { font-size:22px; font-weight:800; color:var(--text-1); }
  .todo-stat-label { font-size:11px; color:var(--text-5); }
  .todo-popover { position:absolute; top:110%; z-index:30; background:var(--bg-1); border:1px solid var(--border-2); border-radius:10px; padding:14px; width:280px; box-shadow:0 8px 24px rgba(0,0,0,.35); }
  .todo-popover-label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-6); margin:10px 0 5px; }
  .todo-popover-label:first-child { margin-top:0; }
  .todo-check-row { display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--text-2); padding:3px 0; cursor:pointer; }
  .todo-greeting { background:var(--bg-2); border:1px solid var(--border-1); border-radius:11px; padding:14px 16px; margin-bottom:16px; font-size:13px; color:var(--text-2); }
`;

function collectTodoRows(meetings) {
  const rows = [];
  (meetings || []).filter((m) => !m.deleted).forEach((m) => {
    (m.actionItems || []).filter((it) => !it.deleted).forEach((it) => {
      rows.push({ ...it, meetingId: m.id, meetingTitle: m.title || 'Reunião sem título', meetingDate: m.date || '' });
    });
  });
  return rows;
}

function matchesMine(responsible, currentUser) {
  if (!currentUser || !currentUser.name) return false;
  return (responsible || '').toLowerCase().includes(currentUser.name.toLowerCase());
}

function inNextDays(dueDate, days) {
  if (!dueDate) return false;
  const today = todayIso();
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
  return dueDate >= today && dueDate <= limitIso;
}

function smartPrioritySort(rows) {
  return rows.slice().sort((a, b) => {
    const ao = isItemOverdue(a) ? 1 : 0, bo = isItemOverdue(b) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    const au = a.status === 'urgente' ? 1 : 0, bu = b.status === 'urgente' ? 1 : 0;
    if (au !== bu) return bu - au;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

function sortRows(rows, mode) {
  const arr = rows.slice();
  switch (mode) {
    case 'recent': return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'oldest': return arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    case 'dueAsc': return arr.sort((a, b) => { if (!a.dueDate && !b.dueDate) return 0; if (!a.dueDate) return 1; if (!b.dueDate) return -1; return a.dueDate.localeCompare(b.dueDate); });
    case 'dueDesc': return arr.sort((a, b) => { if (!a.dueDate && !b.dueDate) return 0; if (!a.dueDate) return 1; if (!b.dueDate) return -1; return b.dueDate.localeCompare(a.dueDate); });
    case 'responsavel': return arr.sort((a, b) => (a.responsible || '￿').localeCompare(b.responsible || '￿'));
    case 'status': return arr.sort((a, b) => TODO_STATUS_ORDER.indexOf(a.status) - TODO_STATUS_ORDER.indexOf(b.status));
    case 'priority':
    default: return smartPrioritySort(arr);
  }
}

export function TodoBoardView({
  meetings, team, externalContacts, clientName, pid, currentUser, log, pushUndoToast,
  focusMeetingId, onClearFocusMeeting,
  onOpenMeeting, onAddItem,
  updateActionItem, deleteActionItem, duplicateActionItem,
  addSubtask, toggleSubtask, deleteSubtask,
  addComment, deleteComment,
  addAttachment, deleteAttachment,
}) {
  const isMobile = useIsMobile();
  const today = todayIso();
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('minha');
  const [groupBy, setGroupBy] = useState('status');
  const [sortMode, setSortMode] = useState(() => { try { return window.localStorage.getItem(SORT_MODE_KEY) || 'priority'; } catch (e) { return 'priority'; } });
  const [collapsed, setCollapsed] = useState(() => new Set(['status:concluida', 'status:nao-relevante']));
  const [openPopover, setOpenPopover] = useState(null); // 'add' | 'filters' | 'sort' | 'more' | null
  const showAddPicker = openPopover === 'add';
  const filtersOpen = openPopover === 'filters';
  const sortOpen = openPopover === 'sort';
  const moreOpen = openPopover === 'more';
  function togglePopover(name) { setOpenPopover((v) => (v === name ? null : name)); }
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [ownerFilter, setOwnerFilter] = useState('todos');
  const [reuniaoFilter, setReuniaoFilter] = useState('');
  const [semPrazoOnly, setSemPrazoOnly] = useState(false);
  const [comSubtarefasOnly, setComSubtarefasOnly] = useState(false);
  const [criadasPorMimOnly, setCriadasPorMimOnly] = useState(false);
  const [openItemId, setOpenItemId] = useState(null);
  const [openFocusComment, setOpenFocusComment] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newResponsible, setNewResponsible] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newMeetingId, setNewMeetingId] = useState('');
  const pendingOpenId = useRef(null);

  useEffect(() => {
    try { window.localStorage.setItem(SORT_MODE_KEY, sortMode); } catch (e) { /* ignora */ }
  }, [sortMode]);

  useEffect(() => {
    if (focusMeetingId) {
      setQuickFilter('todos');
      setReuniaoFilter(focusMeetingId);
      onClearFocusMeeting && onClearFocusMeeting();
    }
  }, [focusMeetingId]);

  const allRows = useMemo(() => collectTodoRows(meetings), [meetings]);

  useEffect(() => {
    if (pendingOpenId.current && allRows.some((r) => r.id === pendingOpenId.current)) {
      setOpenItemId(pendingOpenId.current);
      pendingOpenId.current = null;
    }
  }, [allRows]);

  const meetingsForPicker = useMemo(() => (
    (meetings || []).filter((m) => !m.deleted).slice().sort((a, b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`))
  ), [meetings]);

  const responsavelSuggestions = useMemo(() => Array.from(new Set([
    ...(team || []).map((t) => t.name),
    ...(externalContacts || []).map((c) => c.name),
    ...(meetings || []).flatMap((m) => m.participants || []),
  ].filter(Boolean))), [team, externalContacts, meetings]);

  const openItem = openItemId ? allRows.find((r) => r.id === openItemId) : null;
  const openMeeting = openItem ? (meetings || []).find((m) => m.id === openItem.meetingId) : null;

  const stats = useMemo(() => {
    let pendentes = 0, atrasadas = 0, minhas = 0, cliente = 0, pricetax = 0;
    allRows.forEach((r) => {
      const pending = r.status !== 'concluida' && r.status !== 'nao-relevante';
      if (pending) pendentes++;
      if (pending && r.dueDate && r.dueDate < today) atrasadas++;
      if (pending && matchesMine(r.responsible, currentUser)) minhas++;
      if (pending && r.owner === 'cliente') cliente++;
      if (pending && r.owner !== 'cliente') pricetax++;
    });
    return { pendentes, atrasadas, minhas, cliente, pricetax, reunioes: (meetings || []).filter((m) => !m.deleted).length };
  }, [allRows, currentUser, meetings, today]);

  const meuResumo = useMemo(() => {
    const mine = allRows.filter((r) => matchesMine(r.responsible, currentUser) && r.status !== 'concluida' && r.status !== 'nao-relevante');
    return {
      total: mine.length,
      atrasadas: mine.filter((r) => r.dueDate && r.dueDate < today).length,
      semPrazo: mine.filter((r) => !r.dueDate).length,
    };
  }, [allRows, currentUser, today]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (quickFilter === 'minha' && !matchesMine(r.responsible, currentUser)) return false;
      if (quickFilter === 'hoje' && r.dueDate !== today) return false;
      if (quickFilter === 'semana' && !inNextDays(r.dueDate, 7)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (ownerFilter !== 'todos' && (r.owner === 'cliente' ? 'cliente' : 'pricetax') !== ownerFilter) return false;
      if (reuniaoFilter && r.meetingId !== reuniaoFilter) return false;
      if (semPrazoOnly && r.dueDate) return false;
      if (comSubtarefasOnly && !(r.subtasks || []).length) return false;
      if (criadasPorMimOnly && !(currentUser && r.createdBy === currentUser.name)) return false;
      if (!q) return true;
      return (r.title || '').toLowerCase().includes(q)
        || (r.subtitle || '').toLowerCase().includes(q)
        || (r.notes || '').toLowerCase().includes(q)
        || (r.responsible || '').toLowerCase().includes(q)
        || (r.meetingTitle || '').toLowerCase().includes(q);
    });
  }, [allRows, search, quickFilter, statusFilter, ownerFilter, reuniaoFilter, semPrazoOnly, comSubtarefasOnly, criadasPorMimOnly, currentUser, today]);

  const groups = useMemo(() => {
    if (groupBy === 'responsavel') {
      const map = new Map();
      filteredRows.forEach((r) => { const key = r.responsible || ''; if (!map.has(key)) map.set(key, []); map.get(key).push(r); });
      const keys = Array.from(map.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
      return keys.map((key) => ({ key: `resp:${key}`, label: key || 'Sem responsável', color: 'var(--text-4)', rows: sortRows(map.get(key), sortMode) }));
    }
    if (groupBy === 'reuniao') {
      const map = new Map();
      filteredRows.forEach((r) => { if (!map.has(r.meetingId)) map.set(r.meetingId, []); map.get(r.meetingId).push(r); });
      const entries = Array.from(map.entries()).map(([mid, rows]) => ({ mid, rows, meetingTitle: rows[0].meetingTitle, meetingDate: rows[0].meetingDate }));
      // Cronológica crescente (reunião mais antiga primeiro) — mesmo
      // critério da aba Reuniões, não depende de quando a reunião foi
      // cadastrada no sistema.
      entries.sort((a, b) => `${a.meetingDate || ''}`.localeCompare(`${b.meetingDate || ''}`));
      return entries.map((e) => ({ key: `mtg:${e.mid}`, label: `${e.meetingTitle}${e.meetingDate ? ' · ' + fmtDate(e.meetingDate) : ''}`, color: 'var(--text-4)', rows: sortRows(e.rows, sortMode) }));
    }
    const byStatus = {};
    TODO_STATUS_ORDER.forEach((s) => { byStatus[s] = []; });
    filteredRows.forEach((r) => { const s = TODO_STATUS_META[r.status] ? r.status : 'nao-iniciado'; byStatus[s].push(r); });
    return TODO_STATUS_ORDER.filter((s) => byStatus[s].length > 0).map((s) => ({ key: `status:${s}`, label: TODO_STATUS_META[s].label, color: TODO_STATUS_META[s].color, rows: sortRows(byStatus[s], sortMode) }));
  }, [filteredRows, groupBy, sortMode]);

  function toggleSection(key) {
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function toggleStatusFilter(s) {
    setStatusFilter((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; });
  }

  function handleCreateSubmit() {
    const title = newTitle.trim();
    if (!title || !newMeetingId) return;
    const newId = onAddItem(newMeetingId, { title, responsible: newResponsible.trim(), dueDate: newDueDate });
    pendingOpenId.current = newId || null;
    setNewTitle(''); setNewResponsible(''); setNewDueDate('');
    setOpenPopover(null);
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
    XLSX.utils.book_append_sheet(wb, ws, 'Atividades');
    const fname = `atividades-${(clientName || 'empresa').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fname);
    setOpenPopover(null);
  }

  function openDrawer(row, focusComment) {
    setOpenItemId(row.id);
    setOpenFocusComment(!!focusComment);
  }

  return (
    <div className="mtg-view todo-board-view">
      <style>{MEETINGS_CSS}</style>
      <style>{TODO_BOARD_CSS}</style>
      <style>{ACTIVITY_ROW_CSS}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={20} /> Atividades
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 2 }}>Seu centro de execução.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button style={S.primaryBtn} onClick={() => { togglePopover('add'); setNewMeetingId(meetingsForPicker[0]?.id || ''); }}><Plus size={15} /> Nova tarefa</button>
          <button style={S.iconBtn} onClick={() => togglePopover('more')}><MoreHorizontal size={15} /></button>
          {moreOpen && (
            <div className="todo-popover" style={{ right: 0, width: 180 }}>
              <button type="button" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, padding: '6px 4px', cursor: 'pointer' }}><Download size={14} /> Exportar Excel</button>
            </div>
          )}
          {showAddPicker && (
            <div className="todo-popover" style={{ right: 0, width: 280 }} onClick={(e) => e.stopPropagation()}>
              <div className="todo-popover-label">Título</div>
              <input type="text" autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="O que precisa ser feito?" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreateSubmit(); }} />
              <div className="todo-popover-label">Responsável</div>
              <input type="text" list="todo-board-responsaveis" value={newResponsible} onChange={(e) => setNewResponsible(e.target.value)} placeholder="Opcional" />
              <div className="todo-popover-label">Prazo</div>
              <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
              <div className="todo-popover-label">Reunião</div>
              {meetingsForPicker.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-5)' }}>Crie uma reunião primeiro, na aba Reuniões.</div>
              ) : (
                <select value={newMeetingId} onChange={(e) => setNewMeetingId(e.target.value)}>
                  {meetingsForPicker.map((m) => <option key={m.id} value={m.id}>{m.title || 'Reunião sem título'} {m.date ? `(${fmtDate(m.date)})` : ''}</option>)}
                </select>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" style={S.primaryBtn} onClick={handleCreateSubmit} disabled={!newTitle.trim() || !newMeetingId}>Criar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className={`todo-stat-card ${quickFilter === 'todos' ? 'active' : ''}`} onClick={() => setQuickFilter('todos')}>
          <div className="todo-stat-value">{stats.pendentes}</div>
          <div className="todo-stat-label">pendentes</div>
        </div>
        <div className={`todo-stat-card ${quickFilter === 'atrasadas' ? 'active' : ''}`} onClick={() => setQuickFilter((v) => (v === 'atrasadas' ? 'todos' : 'atrasadas'))}>
          <div className="todo-stat-value" style={stats.atrasadas > 0 ? { color: '#e2574c' } : undefined}>{stats.atrasadas}</div>
          <div className="todo-stat-label">atrasadas</div>
        </div>
        <div className={`todo-stat-card ${quickFilter === 'minha' ? 'active' : ''}`} onClick={() => setQuickFilter('minha')}>
          <div className="todo-stat-value">{stats.minhas}</div>
          <div className="todo-stat-label">minhas</div>
        </div>
        <div className={`todo-stat-card ${ownerFilter === 'cliente' ? 'active' : ''}`} onClick={() => setOwnerFilter((v) => (v === 'cliente' ? 'todos' : 'cliente'))}>
          <div className="todo-stat-value">{stats.cliente}</div>
          <div className="todo-stat-label">cliente</div>
        </div>
        <div className={`todo-stat-card ${ownerFilter === 'pricetax' ? 'active' : ''}`} onClick={() => setOwnerFilter((v) => (v === 'pricetax' ? 'todos' : 'pricetax'))}>
          <div className="todo-stat-value">{stats.pricetax}</div>
          <div className="todo-stat-label">pricetax</div>
        </div>
        <div className="todo-stat-card static">
          <div className="todo-stat-value">{stats.reunioes}</div>
          <div className="todo-stat-label">reuniões</div>
        </div>
      </div>

      {quickFilter === 'minha' && (
        <div className="todo-greeting">
          {meuResumo.total > 0 ? (
            <>
              {greetingPeriod()}{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}. Você tem <strong>{meuResumo.total}</strong> atividade{meuResumo.total === 1 ? '' : 's'} na sua fila
              {meuResumo.atrasadas > 0 && <> · <strong style={{ color: '#e2574c' }}>{meuResumo.atrasadas} atrasada{meuResumo.atrasadas === 1 ? '' : 's'}</strong></>}
              {meuResumo.semPrazo > 0 && <> · {meuResumo.semPrazo} sem prazo</>}.
            </>
          ) : 'Nenhuma atividade exige sua atenção agora.'}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, alignItems: 'center' }}>
        {QUICK_FILTERS.map((f) => (
          <button key={f.key} type="button" className={`todo-filter-chip ${quickFilter === f.key ? 'active' : ''}`} onClick={() => setQuickFilter(f.key)}>{f.label}</button>
        ))}

        <div style={{ position: 'relative' }}>
          <button type="button" className="todo-filter-chip" onClick={() => togglePopover('filters')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Filter size={12} /> Filtros{(statusFilter.size > 0 || ownerFilter !== 'todos' || reuniaoFilter || semPrazoOnly || comSubtarefasOnly || criadasPorMimOnly) ? ` (${[statusFilter.size > 0, ownerFilter !== 'todos', !!reuniaoFilter, semPrazoOnly, comSubtarefasOnly, criadasPorMimOnly].filter(Boolean).length})` : ''}
          </button>
          {filtersOpen && (
            <div className="todo-popover" onClick={(e) => e.stopPropagation()}>
              <div className="todo-popover-label">Status</div>
              {TODO_STATUS_ORDER.map((s) => (
                <label key={s} className="todo-check-row">
                  <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatusFilter(s)} /> {TODO_STATUS_META[s].label}
                </label>
              ))}
              <div className="todo-popover-label">Lado</div>
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="pricetax">PRICETAX</option>
                <option value="cliente">{clientName || 'Cliente'}</option>
              </select>
              <div className="todo-popover-label">Reunião</div>
              <select value={reuniaoFilter} onChange={(e) => setReuniaoFilter(e.target.value)}>
                <option value="">Todas</option>
                {meetingsForPicker.map((m) => <option key={m.id} value={m.id}>{m.title || 'Reunião sem título'}</option>)}
              </select>
              <div className="todo-popover-label">Outros</div>
              <label className="todo-check-row"><input type="checkbox" checked={semPrazoOnly} onChange={(e) => setSemPrazoOnly(e.target.checked)} /> Sem prazo</label>
              <label className="todo-check-row"><input type="checkbox" checked={comSubtarefasOnly} onChange={(e) => setComSubtarefasOnly(e.target.checked)} /> Com subtarefas</label>
              <label className="todo-check-row"><input type="checkbox" checked={criadasPorMimOnly} onChange={(e) => setCriadasPorMimOnly(e.target.checked)} /> Criadas por mim</label>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" className="todo-filter-chip" onClick={() => togglePopover('sort')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ArrowUpDown size={12} /> Ordenar
          </button>
          {sortOpen && (
            <div className="todo-popover" onClick={(e) => e.stopPropagation()}>
              {SORT_OPTIONS.map((o) => (
                <label key={o.key} className="todo-check-row">
                  <input type="radio" name="todo-sort" checked={sortMode === o.key} onChange={() => setSortMode(o.key)} /> {o.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ width: 'auto', fontSize: 11.5 }}>
          {GROUP_OPTIONS.map((g) => <option key={g.key} value={g.key}>Agrupar por {g.label}</option>)}
        </select>

        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-6)' }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, responsável ou reunião..."
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {allRows.length === 0 ? (
        <div className="todo-empty">
          <ListChecks size={28} style={{ opacity: .4, marginBottom: 8 }} />
          <div style={{ fontWeight: 700, color: 'var(--text-4)' }}>Nenhuma atividade ainda.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Itens aparecem aqui assim que forem criados dentro de uma reunião, ou enviando uma transcrição pra IA processar.</div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="todo-empty">Nenhum item bate com esse filtro.</div>
      ) : (
        groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <div key={g.key} style={{ marginBottom: 6 }}>
              <div className="todo-section-head" onClick={() => toggleSection(g.key)}>
                {isCollapsed ? <ChevronRight size={14} color="var(--text-5)" /> : <ChevronDown size={14} color="var(--text-5)" />}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span className="todo-section-label">{g.label}</span>
                <span className="todo-section-count">{g.rows.length}</span>
              </div>
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {g.rows.map((row) => (
                    <ActivityRow
                      key={row.id} row={row} pid={pid} team={team} externalContacts={externalContacts} clientName={clientName}
                      onOpenMeeting={onOpenMeeting} onOpen={openDrawer}
                      updateActionItem={updateActionItem} deleteActionItem={deleteActionItem} duplicateActionItem={duplicateActionItem}
                      pushUndoToast={pushUndoToast}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <datalist id="todo-board-responsaveis">
        {responsavelSuggestions.map((n) => <option key={n} value={n} />)}
      </datalist>

      {openItem && openMeeting && (
        <TodoDrawer
          item={openItem}
          meeting={openMeeting}
          pid={pid}
          clientName={clientName}
          responsavelSuggestions={responsavelSuggestions}
          currentUser={currentUser}
          log={log}
          onClose={() => { setOpenItemId(null); setOpenFocusComment(false); }}
          onOpenMeeting={onOpenMeeting}
          updateActionItem={updateActionItem}
          deleteActionItem={deleteActionItem}
          duplicateActionItem={duplicateActionItem}
          addSubtask={addSubtask}
          toggleSubtask={toggleSubtask}
          deleteSubtask={deleteSubtask}
          addComment={addComment}
          deleteComment={deleteComment}
          addAttachment={addAttachment}
          deleteAttachment={deleteAttachment}
          focusComment={openFocusComment}
        />
      )}
    </div>
  );
}
