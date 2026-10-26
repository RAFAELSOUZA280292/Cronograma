// Gestão de Atividades (quadro pessoal): quadro, colunas, cartões, lista, quadro público e painéis.
// Extraído de src/App.jsx (2026-10-16, "dividir o App.jsx"): carregado sob demanda (lazyRetry no App.jsx) para sair do pacote principal.
// O código é o mesmo de antes; o que vem do App.jsx é importado de lá (e lá foi exportado).

import { AlertTriangle, Archive, ArrowLeftRight, CalendarDays, Check, Clock, Columns3, Copy, Gauge, Globe, GripVertical, History, LayoutList, Link2, ListChecks, Lock, LogOut, Maximize2, MessageSquare, MoreHorizontal, Palette, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Tag, Trash2, Undo2, UserPlus, Users, X } from 'lucide-react';
import { CommentThread, ComposeBox } from '../ui/ComposeBox.jsx';
import { ConfirmDialog, RecordSaveStatus, SaveStatus, activateRow } from '../ui/index.jsx';
import DaySummary from '../personal/DaySummary.jsx';
import { DialogOverlay } from '../ui/dialog.jsx';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { QuickNew, QuickViews } from '../personal/QuickBits.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SafeBoundary from '../ui/SafeBoundary.jsx';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { WaitingField, isWaiting, localTodayIso, waitingLabel } from '../personal/Waiting.jsx';
import { apiGet, apiPatch, apiPost } from '../lib/api.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { avatarColor, initials } from '../meetings/todoUtils.js';
import { calendarDaysSince } from '../lib/dates.js';
import { lazyRetry } from '../lib/lazyRetry.jsx';
import { noteToPlain } from '../lib/richNote.js';
import { withoutLayer } from '../lib/nav.js';
import { CARD_STATUS_META, COLUMN_COLOR_META, ConfirmDiscardModal, LoadingScreen, SidePanel, ThemeToggleBtn, ToastStack, addDays, fmtDate, fmtTs, genShareToken, parseDate, toISODate, todayISOStr, uid, useAutosaveTimestamp, useDebouncedField, useIsMobile, useToasts } from '../App.jsx';
import { S } from '../styles/S.js';

const PersonalStatsPanel = lazyRetry(() => import('../personal/PersonalStats.jsx'));

const RichNote = lazyRetry(() => import('../ui/RichNote.jsx'));

const Workbench = lazyRetry(() => import('../personal/Workbench.jsx'));

const CARD_PRIORITY_META = {
  urgente: { label: 'Urgente', color: '#e2574c', bg: 'rgba(226,87,76,.16)', border: 'rgba(226,87,76,.5)' },
  alta: { label: 'Alta', color: '#ff9f40', bg: 'rgba(255,159,64,.16)', border: 'rgba(255,159,64,.5)' },
  media: { label: 'Média', color: '#F5C400', bg: 'rgba(245,196,0,.16)', border: 'rgba(245,196,0,.5)' },
  baixa: { label: 'Baixa', color: '#3ea6ff', bg: 'rgba(62,166,255,.16)', border: 'rgba(62,166,255,.5)' },
};

const CARD_PRIORITY_ORDER = ['urgente', 'alta', 'media', 'baixa'];

const CARD_STATUS_ORDER = ['nao-iniciada', 'em-andamento', 'pausada', 'concluida'];

function cardStatusOf(card) {
  return card.status || (card.completed ? 'concluida' : 'nao-iniciada');
}

const COLUMN_COLOR_ORDER = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'brown'];

const CARD_DELETE_CONFIRM_PHRASE = 'Excluir';

function dueDateTone(card) {
  if (!card.dueDate || card.completed) return 'none';
  const today = todayISOStr();
  if (card.dueDate < today) return 'overdue';
  if (card.dueDate === today) return 'today';
  const soon = toISODate(addDays(parseDate(today), 3));
  if (card.dueDate <= soon) return 'soon';
  return 'normal';
}

function daysSinceCardMovement(card) {
  const days = calendarDaysSince(card.updatedAt || card.createdAt);
  return days === null ? 0 : days;
}

function staleTone(days) {
  if (days >= 7) return 'critical';
  if (days >= 3) return 'warn';
  return 'fresh';
}

function fmtDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

const SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridade' },
  { value: 'dueDate', label: 'Prazo' },
  { value: 'createdAt', label: 'Data de criação' },
  { value: 'updatedAt', label: 'Última atualização' },
  { value: 'name', label: 'Nome' },
];

function sortCards(cards, mode) {
  if (!mode || mode === 'manual') return cards;
  const list = cards.slice();
  const priorityRank = (c) => { const i = CARD_PRIORITY_ORDER.indexOf(c.priority); return i === -1 ? CARD_PRIORITY_ORDER.length : i; };
  if (mode === 'priority') return list.sort((a, b) => {
    const tier = (c) => (c.completed ? 2 : cardStatusOf(c) === 'pausada' ? 1 : 0);
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (priorityRank(a) !== priorityRank(b)) return priorityRank(a) - priorityRank(b);
    // Na mesma prioridade, quem tem prazo vem antes (mais próximo primeiro); sem prazo vai para o fim do grupo.
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    return a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : 0;
  });
  if (mode === 'dueDate') return list.sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'));
  if (mode === 'createdAt') return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (mode === 'updatedAt') return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (mode === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return list;
}

function cardMatchesFilters(card, { search, priority, dueBucket, tags, status, waiting }) {
  if (waiting && !isWaiting(card)) return false;
  if (status) {
    const cardStat = cardStatusOf(card);
    if (status === 'nao-concluida' && cardStat === 'concluida') return false;
    if (status !== 'nao-concluida' && cardStat !== status) return false;
  }
  if (priority && priority.length && !priority.includes(card.priority || '')) return false;
  if (tags && tags.length && !tags.every((t) => (card.tags || []).includes(t))) return false;
  if (dueBucket) {
    const tone = dueDateTone(card);
    if (dueBucket === 'overdue' && tone !== 'overdue') return false;
    if (dueBucket === 'today' && tone !== 'today') return false;
    if (dueBucket === 'week' && tone !== 'today' && tone !== 'soon') return false;
    if (dueBucket === 'none' && card.dueDate) return false;
  }
  if (search) {
    const q = search.toLowerCase();
    const hay = `${card.title} ${noteToPlain(card.desc, card.descFormat)} ${(card.tags || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function ColorSwatchGrid({ value, onChange }) {
  return (
    <div style={S.colorSwatchGrid}>
      <button title="Sem cor" style={{ ...S.colorSwatch, background: 'transparent', border: '1px dashed var(--border-3)' }} onClick={() => onChange('')} />
      {COLUMN_COLOR_ORDER.map((key) => (
        <button key={key} title={COLUMN_COLOR_META[key].label} style={{ ...S.colorSwatch, background: COLUMN_COLOR_META[key].bg, borderColor: COLUMN_COLOR_META[key].text, ...(value === key ? { boxShadow: `0 0 0 2px ${COLUMN_COLOR_META[key].text}` } : {}) }} onClick={() => onChange(key)} />
      ))}
    </div>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div style={S.priorityPickerRow}>
      <button style={{ ...S.priorityPickerChip, ...(value === '' ? S.priorityPickerChipActive : {}) }} onClick={() => onChange('')}>Sem prioridade</button>
      {CARD_PRIORITY_ORDER.map((p) => (
        <button
          key={p}
          style={{ ...S.priorityPickerChip, color: CARD_PRIORITY_META[p].color, background: value === p ? CARD_PRIORITY_META[p].bg : 'transparent', borderColor: value === p ? CARD_PRIORITY_META[p].border : 'var(--border-3)' }}
          onClick={() => onChange(p)}
        >
          {CARD_PRIORITY_META[p].label}
        </button>
      ))}
    </div>
  );
}

function StatusPicker({ value, onChange }) {
  return (
    <div style={S.priorityPickerRow}>
      {CARD_STATUS_ORDER.map((s) => (
        <button
          key={s}
          style={{ ...S.priorityPickerChip, color: CARD_STATUS_META[s].color, background: value === s ? CARD_STATUS_META[s].bg : 'transparent', borderColor: value === s ? CARD_STATUS_META[s].border : 'var(--border-3)' }}
          onClick={() => onChange(s)}
        >
          {CARD_STATUS_META[s].label}
        </button>
      ))}
    </div>
  );
}

function TagEditor({ tags, onChange, suggestions }) {
  const [draft, setDraft] = useState('');
  function commit() {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft('');
  }
  return (
    <div>
      <div style={S.tagEditorChips}>
        {tags.map((t) => (
          <span key={t} style={S.personalCardTag}>
            {t} <button aria-label="Remover tag" title="Remover tag" style={S.chipX} onClick={() => onChange(tags.filter((x) => x !== t))}><X aria-hidden="true" size={10} /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); setDraft(''); } }}
          onBlur={commit}
          placeholder="+ tag"
          list="personal-tag-suggestions"
          style={S.tagEditorInput}
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <datalist id="personal-tag-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      )}
    </div>
  );
}

function PersonalColumnMenu({ column, canMoveLeft, canMoveRight, onClose, onAddCard, onRename, onColorChange, onToggleHideCompleted, onMoveLeft, onMoveRight, onDuplicate, onSortNow, onDelete }) {
  const [mode, setMode] = useState('root');
  return (
    <div style={S.dropdownMenu} onClick={(e) => e.stopPropagation()}>
      {mode === 'root' && (
        <>
          <button style={S.dropdownItem} onClick={() => { onAddCard(); onClose(); }}><Plus size={13} /> Adicionar atividade</button>
          <button style={S.dropdownItem} onClick={() => { onRename(); onClose(); }}><Pencil size={13} /> Renomear</button>
          <button style={S.dropdownItem} onClick={() => setMode('color')}><Palette size={13} /> Alterar cor</button>
          <button style={S.dropdownItem} onClick={() => setMode('sort')}><ArrowLeftRight size={13} /> Ordenar</button>
          <button title={!canMoveLeft ? 'Esta coluna já é a primeira' : undefined} style={{ ...S.dropdownItem, opacity: canMoveLeft ? 1 : .4 }} disabled={!canMoveLeft} onClick={() => { onMoveLeft(); onClose(); }}>← Mover para esquerda</button>
          <button title={!canMoveRight ? 'Esta coluna já é a última' : undefined} style={{ ...S.dropdownItem, opacity: canMoveRight ? 1 : .4 }} disabled={!canMoveRight} onClick={() => { onMoveRight(); onClose(); }}>→ Mover para direita</button>
          <button style={S.dropdownItem} onClick={() => { onDuplicate(); onClose(); }}><Copy size={13} /> Duplicar coluna</button>
          <label style={S.dropdownItem}>
            <input type="checkbox" checked={!!column.hideCompleted} onChange={onToggleHideCompleted} /> Ocultar concluídas
          </label>
          <div style={S.dropdownDivider} />
          <button style={{ ...S.dropdownItem, color: '#e2574c' }} onClick={() => { onDelete(); onClose(); }}><Trash2 size={13} /> Excluir coluna</button>
        </>
      )}
      {mode === 'color' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          <ColorSwatchGrid value={column.color} onChange={(c) => { onColorChange(c); onClose(); }} />
        </>
      )}
      {mode === 'sort' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {SORT_OPTIONS.map((opt) => (
            <button key={opt.value} style={S.dropdownItem} onClick={() => { onSortNow(opt.value); onClose(); }}>{opt.label}</button>
          ))}
        </>
      )}
    </div>
  );
}

function PersonalCardMenu({ card, otherColumns, onClose, onOpen, onSetPriority, onSetStatus, onToggleComplete, onMoveTo, onDuplicate, onDelete }) {
  const [mode, setMode] = useState('root');
  const status = cardStatusOf(card);
  return (
    <div style={S.dropdownMenu} onClick={(e) => e.stopPropagation()}>
      {mode === 'root' && (
        <>
          <button style={S.dropdownItem} onClick={() => { onOpen(); onClose(); }}><Maximize2 size={13} /> Abrir atividade</button>
          <button style={S.dropdownItem} onClick={() => setMode('move')}><ArrowLeftRight size={13} /> Mover para...</button>
          <button style={S.dropdownItem} onClick={() => setMode('status')}><Clock size={13} /> Alterar status</button>
          <button style={S.dropdownItem} onClick={() => setMode('priority')}><AlertTriangle size={13} /> Alterar prioridade</button>
          <button style={S.dropdownItem} onClick={() => { onToggleComplete(); onClose(); }}><Check size={13} /> {card.completed ? 'Reabrir' : 'Marcar como concluída'}</button>
          <button style={S.dropdownItem} onClick={() => { onDuplicate(); onClose(); }}><Copy size={13} /> Duplicar</button>
          <div style={S.dropdownDivider} />
          <button style={{ ...S.dropdownItem, color: '#e2574c' }} onClick={() => { onDelete(); onClose(); }}><Trash2 size={13} /> Excluir</button>
        </>
      )}
      {mode === 'status' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {CARD_STATUS_ORDER.map((s) => (
            <button key={s} style={{ ...S.dropdownItem, color: CARD_STATUS_META[s].color, fontWeight: s === status ? 700 : 400 }} onClick={() => { onSetStatus(s); onClose(); }}>{CARD_STATUS_META[s].label}</button>
          ))}
        </>
      )}
      {mode === 'move' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          {otherColumns.length === 0 && <div style={{ ...S.emptyMuted, padding: '4px 10px' }}>Nenhuma outra coluna.</div>}
          {otherColumns.map((c) => (
            <button key={c.id} style={S.dropdownItem} onClick={() => { onMoveTo(c.id); onClose(); }}>{c.name}</button>
          ))}
        </>
      )}
      {mode === 'priority' && (
        <>
          <button style={S.dropdownItem} onClick={() => setMode('root')}>← Voltar</button>
          <button style={S.dropdownItem} onClick={() => { onSetPriority(''); onClose(); }}>Sem prioridade</button>
          {CARD_PRIORITY_ORDER.map((p) => (
            <button key={p} style={{ ...S.dropdownItem, color: CARD_PRIORITY_META[p].color }} onClick={() => { onSetPriority(p); onClose(); }}>{CARD_PRIORITY_META[p].label}</button>
          ))}
        </>
      )}
    </div>
  );
}

// Prazo de um item do checklist (opcional, além do prazo do cartão). O dado é só `item.dueDate` ('AAAA-MM-DD'); item sem prazo continua igual.
const isIsoDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const checklistTone = (item) => dueDateTone({ dueDate: item.dueDate, completed: !!item.done });
const shortDay = (iso) => { const [, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}` : ''; };
// Pior situação entre os itens abertos com prazo (vira a cor do selo ✓ x/y do cartão).
function checklistWorstTone(card) {
  const tones = (card.checklist || []).map(checklistTone);
  return tones.includes('overdue') ? 'overdue' : tones.includes('today') ? 'today' : 'none';
}

function ChecklistDate({ item, readOnly, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item.dueDate || '');
  useEffect(() => { if (!open) setDraft(item.dueDate || ''); }, [item.dueDate, open]);
  const tone = checklistTone(item);
  const toneStyle = tone === 'overdue' ? S.dueOverdue : tone === 'today' ? S.dueToday : tone === 'soon' ? S.dueSoon : {};
  if (!open) {
    if (item.dueDate) {
      const label = `Prazo do item: ${fmtDate(item.dueDate)}${tone === 'overdue' ? ' (vencido)' : tone === 'today' ? ' (hoje)' : ''}`;
      return readOnly
        ? <span title={label} style={{ ...S.personalCardBadge, ...toneStyle, flexShrink: 0 }}>📅 {shortDay(item.dueDate)}</span>
        : <button type="button" title={`${label} — clique para alterar`} aria-label={`${label}. Alterar prazo do item`} onClick={() => setOpen(true)} style={{ ...S.personalCardBadge, ...toneStyle, flexShrink: 0, cursor: 'pointer', border: 'none', font: 'inherit' }}>📅 {shortDay(item.dueDate)}</button>;
    }
    if (readOnly) return null;
    return <button type="button" style={S.chipX} title="Definir prazo do item" aria-label="Definir prazo do item" onClick={() => setOpen(true)}><CalendarDays aria-hidden="true" size={12} /></button>;
  }
  const commit = (v) => { onChange(v); setOpen(false); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <input type="date" autoFocus value={draft} aria-label="Prazo do item do checklist" style={{ width: 128, minHeight: 28, fontSize: 12 }}
        onChange={(e) => { setDraft(e.target.value); if (isIsoDay(e.target.value)) commit(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (isIsoDay(draft)) commit(draft); else setOpen(false); } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}
        onBlur={() => { if (!draft && item.dueDate) onChange(''); setOpen(false); }} />
      <button type="button" style={S.chipX} title="Remover o prazo do item" aria-label="Remover o prazo do item" onMouseDown={(e) => e.preventDefault()} onClick={() => commit('')}><X aria-hidden="true" size={12} /></button>
    </span>
  );
}


const RespCtx = React.createContext([]);
const normResp = (n) => (n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

function RespAvatar({ name, size = 20 }) {
  const c = avatarColor(name);
  return <span title={name} style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42), fontWeight: 700, flexShrink: 0, border: '1.5px solid var(--bg-2)' }}>{initials(name)}</span>;
}

function cardResponsibles(card, all) {
  const ids = card.responsibleIds || [];
  return ids.map((id) => all.find((r) => r.id === id)).filter(Boolean);
}

function ResponsiblesField({ card, readOnly, onSet, onCreate }) {
  const all = React.useContext(RespCtx);
  const [draft, setDraft] = useState('');
  const mine = cardResponsibles(card, all);
  const available = all.filter((r) => !(card.responsibleIds || []).includes(r.id));
  function submit() {
    const v = draft.trim();
    if (!v) return;
    onCreate(v);
    setDraft('');
  }
  return (
    <div>
      <div style={S.subSectionLabel}><Users size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Responsáveis</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {mine.length === 0 && <span style={S.fieldHint}>{readOnly ? 'Sem responsável.' : 'Ninguém atribuído ainda.'}</span>}
        {mine.map((r) => (
          <span key={r.id} style={{ ...S.personalCardTag, fontSize: 12, padding: '3px 8px 3px 4px', gap: 6 }}>
            <RespAvatar name={r.name} size={18} />{r.name}
            {!readOnly && <button type="button" aria-label={`Remover ${r.name}`} title="Remover desta atividade" style={S.chipX} onClick={() => onSet((card.responsibleIds || []).filter((id) => id !== r.id))}><X aria-hidden="true" size={12} /></button>}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {available.map((r) => (
            <button key={r.id} type="button" className="pb-ghost" style={{ ...S.pbGhostBtn, minHeight: 30, padding: '2px 9px', gap: 6 }} title="Atribuir a esta atividade" onClick={() => onSet([...(card.responsibleIds || []), r.id])}>
              <RespAvatar name={r.name} size={16} />{r.name}
            </button>
          ))}
          <div style={{ display: 'flex', gap: 6, flex: '1 1 220px', minWidth: 0 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="Novo responsável (nome)…" style={{ flex: 1, minWidth: 0 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
            <button type="button" className="pb-ghost" style={{ ...S.pbGhostBtn, minHeight: 36 }} disabled={!draft.trim()} title={draft.trim() ? 'Cria o responsável e atribui a esta atividade' : 'Digite o nome do responsável.'} onClick={submit}><UserPlus size={14} /> Criar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalCard({ card, columnId, disabled, readOnly, otherColumns, onOpen, onToggleComplete, onDelete, onDuplicate, onSetPriority, onSetStatus, onMoveTo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: 'card', columnId }, disabled: disabled || readOnly });
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const tone = dueDateTone(card);
  const doneCount = (card.checklist || []).filter((i) => i.done).length;
  const priorityMeta = card.priority ? CARD_PRIORITY_META[card.priority] : null;
  const status = cardStatusOf(card);
  const showStatusBadge = status === 'em-andamento' || status === 'pausada';
  const staleDays = daysSinceCardMovement(card);
  const stale = staleTone(staleDays);
  const showStaleBadge = !card.completed;
  const waiting = isWaiting(card);
  const respAll = React.useContext(RespCtx);
  const cardResp = cardResponsibles(card, respAll);
  const hasMeta = !!priorityMeta || showStatusBadge || waiting || !!card.dueDate || (card.comments || []).length > 0 || (card.checklist || []).length > 0 || showStaleBadge;

  return (
    <div
      ref={setNodeRef}
      className="pb-card"
      style={{ ...S.personalCard, ...style, ...(disabled || readOnly ? {} : { cursor: 'grab' }), ...(card.completed ? S.personalCardDone : {}) }}
      {...attributes}
      {...(readOnly ? {} : listeners)}
      onClick={onOpen}
    >
      <div style={S.personalCardTop}>
        <button className="pb-check" style={S.personalCardCheck} onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggleComplete(); }} title={card.completed ? 'Reabrir' : 'Marcar como concluída'}>
          {card.completed ? <Check size={13} /> : <span style={S.personalCardCheckEmpty} />}
        </button>
        <div style={{ ...S.personalCardTitleText, ...(card.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>{card.title}</div>
        {!readOnly && (
          <div style={{ position: 'relative' }}>
            <button aria-label="Mais ações" title="Mais ações" style={S.iconBtnGhost} onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}><MoreHorizontal aria-hidden="true" size={13} /></button>
            {menuOpen && (
              <PersonalCardMenu
                card={card}
                otherColumns={otherColumns}
                onClose={() => setMenuOpen(false)}
                onOpen={onOpen}
                onSetPriority={onSetPriority}
                onSetStatus={onSetStatus}
                onToggleComplete={onToggleComplete}
                onMoveTo={onMoveTo}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </div>
      {hasMeta && (
        <div style={S.personalCardMeta}>
          {showStatusBadge && <span style={{ ...S.personalCardBadge, color: CARD_STATUS_META[status].color, background: CARD_STATUS_META[status].bg }}>{CARD_STATUS_META[status].label}</span>}
          {priorityMeta && <span style={{ ...S.personalCardBadge, color: priorityMeta.color, background: priorityMeta.bg }}>● {priorityMeta.label}</span>}
          {waiting && <span title={`${waitingLabel(card, localTodayIso())} (desde ${fmtDate(card.waiting.since)})`} style={{ ...S.personalCardBadge, color: '#b9a2f7', background: 'rgba(155,122,245,.14)' }}>⏳ {waitingLabel(card, localTodayIso())}</span>}
          {card.dueDate && (
            <span style={{ ...S.personalCardBadge, ...(tone === 'overdue' ? S.dueOverdue : tone === 'today' ? S.dueToday : tone === 'soon' ? S.dueSoon : {}) }}>
              📅 {fmtDate(card.dueDate)}
            </span>
          )}
          {(card.comments || []).length > 0 && <span style={S.personalCardBadge}>💬 {card.comments.length}</span>}
          {(card.checklist || []).length > 0 && (() => { const ct = checklistWorstTone(card); return <span title={ct === 'overdue' ? 'Há item do checklist com prazo vencido' : ct === 'today' ? 'Há item do checklist com prazo para hoje' : undefined} style={{ ...S.personalCardBadge, ...(ct === 'overdue' ? S.dueOverdue : ct === 'today' ? S.dueToday : {}) }}>✓ {doneCount}/{card.checklist.length}</span>; })()}
          {showStaleBadge && (
            <span
              title={`Sem movimentação há ${staleDays} dia${staleDays === 1 ? '' : 's'} (última: ${fmtDateOnly(card.updatedAt || card.createdAt)})`}
              style={{ ...S.personalCardBadge, ...(stale === 'critical' ? S.dueOverdue : stale === 'warn' ? S.dueSoon : {}) }}
            >
              ⏱ {staleDays}d
            </span>
          )}
        </div>
      )}
      {cardResp.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }} title={`Responsáveis: ${cardResp.map((r) => r.name).join(', ')}`}>
          {cardResp.slice(0, 3).map((r, i) => <span key={r.id} style={{ marginLeft: i ? -6 : 0 }}><RespAvatar name={r.name} /></span>)}
          {cardResp.length > 3 && <span style={{ ...S.fieldHint, marginLeft: 6 }}>+{cardResp.length - 3}</span>}
          {cardResp.length === 1 && <span style={{ ...S.fieldHint, marginLeft: 6 }}>{cardResp[0].name}</span>}
        </div>
      )}
      {(card.tags || []).length > 0 && (
        <div style={S.personalCardTags}>
          {card.tags.slice(0, 3).map((t) => <span key={t} style={S.personalCardTag}>{t}</span>)}
          {card.tags.length > 3 && <span style={S.personalCardTag}>+{card.tags.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

function PersonalColumn({
  column, cardsToRender, totalVisibleCount, hiddenByFilter, hiddenCompleted, onClearFilters, dragDisabled, readOnly, canMoveLeft, canMoveRight, otherColumns,
  onAddCard, onOpenCard, onToggleComplete, onDeleteCard, onDuplicateCard, onSetPriority, onSetStatus, onMoveCardTo,
  onRenameColumn, onColorChange, onToggleHideCompleted, onMoveLeft, onMoveRight, onDuplicateColumn, onSortColumnNow, onDeleteColumn,
}) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const nameInputRef = useRef(null);
  const nameField = useDebouncedField(column.name, (v) => onRenameColumn(column.id, v));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: 'column' }, disabled: readOnly });
  const { setNodeRef: setDropRef } = useDroppable({ id: `coldrop-${column.id}`, data: { type: 'coldrop', columnId: column.id } });
  const isMobile = useIsMobile();
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, ...(isMobile ? S.personalColMobile : null) };
  const colorMeta = column.color ? COLUMN_COLOR_META[column.color] : null;
  const cardIds = cardsToRender.map((c) => c.id);

  function submitQuickAdd() {
    const t = draft.trim();
    if (t) {
      onAddCard(column.id, t);
      setDraft('');
      if (inputRef.current) inputRef.current.focus();
    } else {
      setShowQuickAdd(false);
    }
  }

  return (
    <div ref={setNodeRef} style={{ ...S.personalCol, background: colorMeta ? colorMeta.container : 'var(--pcol-default-container)', ...style }}>
      <div {...(readOnly ? {} : { ...attributes, ...listeners })} style={{ ...S.personalColHead, ...(readOnly ? {} : { cursor: 'grab' }) }}>
        {!readOnly && <span style={S.personalColGrip}><GripVertical size={13} color="var(--text-8)" /></span>}
        <div style={{ ...S.personalColTag, background: colorMeta ? colorMeta.bg : 'transparent' }}>
          {/* O cabeçalho inteiro é a alça de arrastar do dnd-kit (listeners
              acima), então o campo de texto DENTRO dele precisa impedir que
              teclado/mouse subam pra lá: sem isso, a barra de espaço ativa o
              arrastar por teclado (o texto trava e aparece o "fantasma" da
              coluna) e selecionar texto com o mouse arrasta a coluna. Bug
              real relatado em 2026-09-20 ao renomear "AteSegunda". */}
          <input
            ref={nameInputRef}
            value={nameField.draft}
            readOnly={readOnly}
            onChange={(e) => nameField.onChange(e.target.value)}
            onBlur={nameField.flush}
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ ...S.personalColNameInput, color: colorMeta ? colorMeta.text : 'var(--text-2)' }}
          />
        </div>
        <span style={S.kanbanCount}>{totalVisibleCount}</span>
        {!readOnly && (
          <button aria-label={`Adicionar atividade em ${column.name || 'esta coluna'}`} title="Adicionar atividade" style={S.iconBtnGhost} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onClick={() => setShowQuickAdd(true)}><Plus aria-hidden="true" size={14} /></button>
        )}
        {!readOnly && (
          <div style={{ position: 'relative' }} onKeyDown={(e) => e.stopPropagation()}>
            <button aria-label="Mais ações" title="Mais ações" style={S.iconBtnGhost} onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal aria-hidden="true" size={14} /></button>
            {menuOpen && (
              <PersonalColumnMenu
                column={column}
                canMoveLeft={canMoveLeft}
                canMoveRight={canMoveRight}
                onClose={() => setMenuOpen(false)}
                onAddCard={() => setShowQuickAdd(true)}
                onRename={() => nameInputRef.current && nameInputRef.current.focus()}
                onColorChange={(color) => onColorChange(column.id, color)}
                onToggleHideCompleted={() => onToggleHideCompleted(column.id)}
                onMoveLeft={onMoveLeft}
                onMoveRight={onMoveRight}
                onDuplicate={onDuplicateColumn}
                onSortNow={onSortColumnNow}
                onDelete={onDeleteColumn}
              />
            )}
          </div>
        )}
      </div>

      <div ref={setDropRef} style={S.personalColBody}>
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cardsToRender.map((card) => (
            <PersonalCard
              key={card.id}
              card={card}
              columnId={column.id}
              disabled={dragDisabled}
              readOnly={readOnly}
              otherColumns={otherColumns}
              onOpen={() => onOpenCard(column.id, card.id)}
              onToggleComplete={() => onToggleComplete(column.id, card.id)}
              onDelete={() => onDeleteCard(column.id, card.id)}
              onDuplicate={() => onDuplicateCard(column.id, card.id)}
              onSetPriority={(p) => onSetPriority(column.id, card.id, p)}
              onSetStatus={(s) => onSetStatus(column.id, card.id, s)}
              onMoveTo={(targetColId) => onMoveCardTo(column.id, card.id, targetColId)}
            />
          ))}
        </SortableContext>
        {cardsToRender.length === 0 && <div style={S.personalColEmpty}>{hiddenByFilter > 0 ? 'Nenhuma tarefa visível com os filtros atuais.' : hiddenCompleted > 0 ? 'Só há tarefas concluídas aqui (ocultas).' : 'Nenhuma tarefa aqui.'}</div>}
        {(hiddenByFilter > 0 || hiddenCompleted > 0) && (
          <div style={S.personalColHidden}>
            {hiddenByFilter > 0 && <span>{hiddenByFilter} {hiddenByFilter === 1 ? 'oculta' : 'ocultas'} por filtro{onClearFilters ? <> · <button type="button" style={S.personalColHiddenBtn} onClick={onClearFilters}>limpar</button></> : null}</span>}
            {hiddenCompleted > 0 && <span>{hiddenCompleted} {hiddenCompleted === 1 ? 'concluída oculta' : 'concluídas ocultas'}</span>}
          </div>
        )}
      </div>

      {!readOnly && (showQuickAdd ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(); }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setShowQuickAdd(false); }
          }}
          onBlur={() => { if (!draft.trim()) setShowQuickAdd(false); }}
          placeholder="Digite o nome da atividade..."
          style={S.personalQuickAddInput}
        />
      ) : (
        <button className="pb-addbtn" style={{ ...S.personalAddCard, color: colorMeta ? colorMeta.text : 'var(--text-5)' }} onClick={() => setShowQuickAdd(true)}><Plus size={12} /> Nova atividade</button>
      ))}
    </div>
  );
}

function PersonalCardDetailModal({ onSetResponsibles, onCreateResponsible, onSetChecklistDate, card, columnId, columnName, boardName, otherColumns, onMoveTo, allTags, currentUserId, readOnly, onClose, onUpdate, onDelete, onToggleComplete, onSetStatus, onAddComment, onUpdateComment, onRemoveComment, onAddChecklistItem, onToggleChecklistItem, onUpdateChecklistItem, onRemoveChecklistItem }) {
  const [checklistDraft, setChecklistDraft] = useState('');
  const [checklistDraftDate, setChecklistDraftDate] = useState('');
  const [composeDirty, setComposeDirty] = useState(false);
  const composeRef = useRef(null);
  const [editingChecklistId, setEditingChecklistId] = useState(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  // Sair do campo (Escape) tira o foco, e o blur dispararia logo em seguida — sem essa flag, o
  // blur salvaria o texto "cancelado" por cima do Escape (testado e achado ao vivo, não hipotético).
  const cancelingChecklistRef = useRef(false);
  const [showGuard, setShowGuard] = useState(false);
  const lastSavedAt = useAutosaveTimestamp(card);
  const titleField = useDebouncedField(card.title, (v) => onUpdate({ title: v }, 'Título atualizado'));
  const descField = useDebouncedField(card.desc || '', (v) => onUpdate({ desc: v, descFormat: v ? 'html' : '' }, 'Descrição atualizada'));
  const hasDraft = !readOnly && (composeDirty || !!checklistDraft.trim() || editingChecklistId !== null);
  function requestClose() { titleField.flush(); descField.flush(); if (hasDraft) setShowGuard(true); else onClose(); }
  async function saveDraftsAndClose() {
    titleField.flush(); descField.flush();
    if (editingChecklistId !== null) { onUpdateChecklistItem(editingChecklistId, editingChecklistText); setEditingChecklistId(null); }
    if (checklistDraft.trim()) submitChecklist();
    if (composeRef.current && composeRef.current.isDirty()) {
      await composeRef.current.submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (composeRef.current && composeRef.current.isDirty()) { setShowGuard(false); return; }
    }
    onClose();
  }
  function discardAndClose() {
    try { window.sessionStorage.removeItem(`cmp-draft:card:${card.id}`); } catch (e) { /* ignora */ }
    onClose();
  }
  function submitChecklist() {
    if (!checklistDraft.trim()) return;
    onAddChecklistItem(checklistDraft, isIsoDay(checklistDraftDate) ? checklistDraftDate : '');
    setChecklistDraft('');
    setChecklistDraftDate('');
  }

  const doneCount = (card.checklist || []).filter((i) => i.done).length;
  const isMobile = useIsMobile();
  const staleDays = daysSinceCardMovement(card);
  const stale = staleTone(staleDays);

  return (
    <DialogOverlay style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose} history={false}>
      <div style={{ ...S.detailBox, width: 'min(760px, 100%)', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...S.fieldHint, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{boardName} /</span>
              {!readOnly && otherColumns && otherColumns.length > 0 ? (
                <select
                  value={columnId}
                  onChange={(e) => onMoveTo(e.target.value)}
                  title="Mover para outra coluna"
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-6)', background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 6, padding: '2px 5px', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <option value={columnId}>{columnName}</option>
                  {otherColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : <span>{columnName}</span>}
            </div>
            {!readOnly && <RecordSaveStatus hasDraft={hasDraft} lastSavedAt={lastSavedAt} />}
          </div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={18} /></button>
        </div>

        {readOnly && (
          <div style={{ ...S.fieldHint, background: 'var(--bg-3)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
            👁️ Somente visualização — você está vendo pelo link público
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 10 }}>
          <span style={S.fieldHint}>Criada em: {fmtDateOnly(card.createdAt)}</span>
          <span style={S.fieldHint}>Última movimentação: {fmtDateOnly(card.updatedAt || card.createdAt)}</span>
          {!card.completed && (
            <span style={{ ...S.fieldHint, fontWeight: 700, color: stale === 'critical' ? '#e2574c' : stale === 'warn' ? '#ff9f40' : 'var(--text-6)' }}>
              ⏱ Parada há {staleDays} dia{staleDays === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div style={{ pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? .85 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button style={S.personalCardCheck} onClick={onToggleComplete} title={card.completed ? 'Reabrir' : 'Marcar como concluída'}>
              {card.completed ? <Check size={16} /> : <span style={S.personalCardCheckEmptyLg} />}
            </button>
            <input
              value={titleField.draft}
              readOnly={readOnly}
              onChange={(e) => titleField.onChange(e.target.value)}
              onBlur={titleField.flush}
              style={{ ...S.personalDetailTitleInput, ...(card.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}
            />
          </div>

          <div>
            <div style={S.fieldHint}>Status</div>
            <StatusPicker value={cardStatusOf(card)} onChange={onSetStatus} />
          </div>

          <div style={S.cardPropsGrid}>
            <div>
              <div style={S.fieldHint}>Prioridade</div>
              <PriorityPicker value={card.priority || ''} onChange={(p) => onUpdate({ priority: p }, `Prioridade alterada: ${card.priority ? CARD_PRIORITY_META[card.priority].label : 'sem prioridade'} → ${p ? CARD_PRIORITY_META[p].label : 'sem prioridade'}`)} />
            </div>
            <div>
              <div style={S.fieldHint}>Prazo</div>
              <input type="date" value={card.dueDate || ''} onChange={(e) => onUpdate({ dueDate: e.target.value }, e.target.value ? `Prazo alterado: ${fmtDate(e.target.value)}` : 'Prazo removido')} />
              <button type="button" className="pb-ghost" style={{ ...S.pbGhostBtn, marginTop: 6, justifyContent: 'center', width: '100%', minHeight: 36 }}
                disabled={card.dueDate === todayISOStr()} title={card.dueDate === todayISOStr() ? 'O prazo já é hoje.' : 'Define o prazo para a data de hoje.'}
                onClick={() => { const t = todayISOStr(); onUpdate({ dueDate: t }, `Prazo alterado: ${fmtDate(t)}`); }}>Hoje</button>
            </div>
          </div>

          {!card.completed && <WaitingField card={card} onUpdate={onUpdate} readOnly={readOnly} labelStyle={S.subSectionLabel} />}

          <ResponsiblesField card={card} readOnly={readOnly} onSet={onSetResponsibles} onCreate={onCreateResponsible} />

          <div style={S.subSectionLabel}><Tag size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Tags</div>
          <TagEditor tags={card.tags || []} onChange={(tags) => onUpdate({ tags }, 'Tags atualizadas')} suggestions={allTags} />

          <div style={S.subSectionLabel}>Descrição</div>
          <React.Suspense fallback={<div style={{ minHeight: 96, border: '1px solid var(--border-2)', borderRadius: 8, background: 'var(--bg-1)' }} aria-busy="true" aria-label="Carregando o editor" />}>
          <RichNote value={descField.draft} format={card.descFormat} readOnly={readOnly} onChange={descField.onChange} onBlur={descField.flush} placeholder="Descrição, anotações..." />
          </React.Suspense>

          <div style={S.subSectionLabel}><ListChecks size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Checklist {card.checklist && card.checklist.length > 0 ? `(${doneCount}/${card.checklist.length})` : ''}</div>
          <div style={S.checklistList}>
            {(card.checklist || []).map((item) => (
              <div key={item.id} style={S.checklistRow}>
                <input type="checkbox" checked={item.done} onChange={() => onToggleChecklistItem(item.id)} />
                {editingChecklistId === item.id ? (
                  <>
                    <input
                      value={editingChecklistText}
                      onChange={(e) => setEditingChecklistText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); onUpdateChecklistItem(item.id, editingChecklistText); setEditingChecklistId(null); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelingChecklistRef.current = true; setEditingChecklistId(null); }
                      }}
                      onBlur={() => {
                        if (cancelingChecklistRef.current) { cancelingChecklistRef.current = false; return; }
                        onUpdateChecklistItem(item.id, editingChecklistText); setEditingChecklistId(null);
                      }}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button aria-label="Cancelar edição" title="Cancelar edição" style={S.chipX} onClick={() => { cancelingChecklistRef.current = true; setEditingChecklistId(null); }}><X aria-hidden="true" size={12} /></button>
                  </>
                ) : (
                  <>
                    <span
                      style={{ flex: 1, cursor: readOnly ? 'default' : 'text', ...(item.done ? { textDecoration: 'line-through', opacity: .6 } : {}) }}
                      onClick={() => { if (!readOnly) { setEditingChecklistId(item.id); setEditingChecklistText(item.text); } }}
                    >
                      {item.text}
                    </span>
                    <ChecklistDate item={item} readOnly={readOnly} onChange={(v) => onSetChecklistDate(item.id, v)} />
                    {!readOnly && (
                      <button style={S.chipX} title="Editar" onClick={() => { setEditingChecklistId(item.id); setEditingChecklistText(item.text); }}><Pencil size={11} /></button>
                    )}
                    <button aria-label="Remover item do checklist" title="Remover item do checklist" style={S.chipX} onClick={() => onRemoveChecklistItem(item.id)}><X aria-hidden="true" size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <div style={{ ...S.commentInputRow, flexWrap: 'wrap' }}>
              <input
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitChecklist(); } }}
                placeholder="Adicionar item..."
                style={{ flex: '1 1 150px', minWidth: 0 }}
              />
              <input type="date" value={checklistDraftDate} onChange={(e) => setChecklistDraftDate(e.target.value)} aria-label="Prazo do novo item (opcional)" title="Prazo do item (opcional)" style={{ width: 128, flexShrink: 0 }} />
              <button aria-label="Adicionar item ao checklist" title="Adicionar item ao checklist" style={S.iconBtn} onClick={submitChecklist}><Plus aria-hidden="true" size={13} /></button>
            </div>
          )}
        </div>

        <div style={{ ...S.subSectionLabel, marginTop: 18 }}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários {(card.comments || []).length > 0 ? `(${card.comments.length})` : ''}</div>
        {!readOnly && (
          <ComposeBox
            ref={composeRef}
            draftKey={`card:${card.id}`}
            features={{ mentions: false }}
            maxFileBytes={2 * 1024 * 1024}
            maxFiles={3}
            submitLabel="Comentar"
            placeholder="Escreva um comentário…"
            onDirtyChange={setComposeDirty}
            onSubmit={async ({ text, attachments, links }) => { onAddComment(text, attachments, links); }}
          />
        )}
        <div style={{ marginTop: 10 }}>
          <CommentThread
            comments={[...(card.comments || [])].reverse()}
            currentUserId={readOnly ? '' : currentUserId}
            onEdit={readOnly ? undefined : (id, text) => onUpdateComment(id, text)}
            onDelete={readOnly ? undefined : (id) => onRemoveComment(id)}
          />
        </div>

        <div style={{ ...S.subSectionLabel, marginTop: 18 }}><History size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Histórico</div>
        <div style={S.historyList}>
          {(card.history || []).length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
          {(card.history || []).map((l, i) => (
            <div key={i} style={S.logRow}>
              <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
              <div style={S.logAction}>{l.action}</div>
            </div>
          ))}
        </div>

        {!readOnly && <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c' }} onClick={onDelete}><Trash2 size={14} /> Excluir tarefa</button>}
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={saveDraftsAndClose}
          onDiscard={discardAndClose}
          onCancel={() => setShowGuard(false)}
        />
      )}
    </DialogOverlay>
  );
}

function PersonalListView({ board, filterFn, onOpenCard, onToggleComplete, readOnly }) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  const rows = useMemo(() => {
    const flat = [];
    board.columns.forEach((col, colIdx) => {
      col.cards.forEach((cd) => {
        if (cd.deleted || cd.archived) return;
        if (!filterFn(cd)) return;
        flat.push({ ...cd, _colId: col.id, _colName: col.name, _colIdx: colIdx });
      });
    });
    if (!sortKey) return flat;
    const cmp = {
      title: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
      column: (a, b) => a._colIdx - b._colIdx,
      priority: (a, b) => {
        const rank = (c) => { const i = CARD_PRIORITY_ORDER.indexOf(c.priority); return i === -1 ? 99 : i; };
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        // Na mesma prioridade: com prazo antes, sem prazo por último — nos dois sentidos da ordenação (sortDir inverte o resultado, então compensa).
        if (!!a.dueDate !== !!b.dueDate) return (a.dueDate ? -1 : 1) * sortDir;
        return a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : 0;
      },
      dueDate: (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'),
      updatedAt: (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''),
    }[sortKey];
    return cmp ? flat.slice().sort((a, b) => cmp(a, b) * sortDir) : flat;
  }, [board, filterFn, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  }

  return (
    <div style={S.personalListWrap}>
      <table style={S.personalListTable}>
        <thead>
          <tr>
            <th style={S.personalListTh}></th>
            <th style={S.personalListTh} onClick={() => toggleSort('title')}>Título</th>
            <th style={S.personalListTh} onClick={() => toggleSort('column')}>Coluna</th>
            <th style={S.personalListTh}>Status</th>
            <th style={S.personalListTh} onClick={() => toggleSort('priority')}>Prioridade</th>
            <th style={S.personalListTh} onClick={() => toggleSort('dueDate')}>Prazo</th>
            <th style={S.personalListTh}>Tags</th>
            <th style={S.personalListTh} onClick={() => toggleSort('updatedAt')}>Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = dueDateTone(r);
            const priorityMeta = r.priority ? CARD_PRIORITY_META[r.priority] : null;
            return (
              <tr key={r.id} style={S.personalListRow} {...activateRow(() => onOpenCard(r._colId, r.id))}>
                <td style={S.personalListTd}><input type="checkbox" checked={r.completed} disabled={readOnly} onClick={(e) => e.stopPropagation()} onChange={() => onToggleComplete(r._colId, r.id)} /></td>
                <td style={{ ...S.personalListTd, ...(r.completed ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>
                  {r.title}
                  {isWaiting(r) && isMobile && <span title={`${waitingLabel(r, localTodayIso())} (desde ${fmtDate(r.waiting.since)})`} style={{ ...S.personalCardBadge, display: 'block', width: 'fit-content', maxWidth: 'min(280px, 62vw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4, color: '#b9a2f7', background: 'rgba(155,122,245,.14)', textDecoration: 'none' }}>⏳ {waitingLabel(r, localTodayIso())}</span>}
                </td>
                <td style={S.personalListTd}>{r._colName}</td>
                <td style={S.personalListTd}>
                  <span style={{ color: CARD_STATUS_META[cardStatusOf(r)].color }}>{CARD_STATUS_META[cardStatusOf(r)].label}</span>
                  {isWaiting(r) && !isMobile && <span title={`${waitingLabel(r, localTodayIso())} (desde ${fmtDate(r.waiting.since)})`} style={{ ...S.personalCardBadge, display: 'inline-block', marginLeft: 6, color: '#b9a2f7', background: 'rgba(155,122,245,.14)', whiteSpace: 'nowrap' }}>⏳ {waitingLabel(r, localTodayIso())}</span>}
                </td>
                <td style={S.personalListTd}>{priorityMeta ? <span style={{ color: priorityMeta.color }}>{priorityMeta.label}</span> : '—'}</td>
                <td style={{ ...S.personalListTd, ...(tone === 'overdue' ? S.dueOverdue : tone === 'today' ? S.dueToday : {}) }}>{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                <td style={S.personalListTd}>{(r.tags || []).join(', ') || '—'}</td>
                <td style={S.personalListTd}>{r.updatedAt ? fmtTs(r.updatedAt) : '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={S.emptyMuted}>Nenhum resultado com os filtros atuais.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReassignCardsModal({ column, otherColumns, onConfirm, onCancel }) {
  const [targetColId, setTargetColId] = useState(otherColumns[0] ? otherColumns[0].id : '');
  const [alsoDelete, setAlsoDelete] = useState(false);
  const activeCount = column.cards.filter((c) => !c.deleted).length;
  const isMobile = useIsMobile();
  return (
    <DialogOverlay style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={onCancel}>
      <div className="t44" style={{ ...S.detailBox, width: 'min(460px, 100%)', height: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Excluir coluna "{column.name}"</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={onCancel}><X aria-hidden="true" size={18} /></button>
        </div>
        <div style={S.fieldHint}>Esta coluna tem {activeCount} tarefa(s). Para onde deseja movê-las?</div>
        <select value={targetColId} onChange={(e) => setTargetColId(e.target.value)} style={{ marginTop: 10 }}>
          {otherColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5 }}>
          <input type="checkbox" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} />
          Excluir as tarefas também (vão para a Lixeira)
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button style={S.iconBtn} onClick={onCancel}>Cancelar</button>
          <button title={!targetColId ? 'Escolha a coluna de destino' : undefined} style={S.primaryBtn} onClick={() => onConfirm(targetColId, alsoDelete)} disabled={!targetColId}>Mover e excluir coluna</button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function PersonalTrashPanel({ trashItems, onClose, onRestore, onHardDelete }) {
  return (
    <SidePanel title="Lixeira" onClose={onClose}>
      {trashItems.length === 0 && <div style={S.emptyMuted}>Nada excluído.</div>}
      {trashItems.map((item) => (
        <div key={item.card.id} style={S.trashRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.trashTitle}>{item.card.title}</div>
            <div style={S.trashParent}>{item.card.deletedFromBoardName || item.boardName} — coluna "{item.card.deletedFromColumnName || '—'}"</div>
            <div style={S.logTs}>Excluída em {fmtTs(item.card.deletedAt)}{item.card.deletedBy ? ` · ${item.card.deletedBy}` : ''}</div>
          </div>
          <button style={S.iconBtn} onClick={() => onRestore(item)}><Undo2 size={14} /> Restaurar</button>
          <button aria-label="Excluir definitivamente" title="Excluir definitivamente" style={S.iconBtnGhost} onClick={() => onHardDelete(item)}><Trash2 aria-hidden="true" size={14} color="#e2574c" /></button>
        </div>
      ))}
    </SidePanel>
  );
}

function PersonalArchivePanel({ archiveItems, onClose, onRestore }) {
  return (
    <SidePanel title="Concluídas" onClose={onClose}>
      {archiveItems.length === 0 && <div style={S.emptyMuted}>Nenhuma tarefa arquivada ainda.</div>}
      {archiveItems.map((item) => (
        <div key={item.card.id} style={S.trashRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.trashTitle}>{item.card.title}</div>
            <div style={S.trashParent}>{item.card.archivedFromBoardName || item.boardName} — coluna "{item.card.archivedFromColumnName || '—'}"</div>
            <div style={S.logTs}>Arquivada em {fmtTs(item.card.archivedAt)}</div>
          </div>
          <button style={S.iconBtn} onClick={() => onRestore(item)}><Undo2 size={14} /> Restaurar</button>
        </div>
      ))}
    </SidePanel>
  );
}

function BoardShareModal({ board, onClose, onSetVisibility, onRegenerateLink }) {
  const [copied, setCopied] = useState(false);
  const isPublic = board.visibility === 'public';
  const publicUrl = isPublic && board.shareToken ? `${window.location.origin}/quadro/${board.shareToken}` : '';

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  return (
    <DialogOverlay style={S.detailOverlay} onClose={onClose}>
      <div style={{ ...S.detailBox, width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.subSectionLabel}>Visibilidade da página "{board.name}"</div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <label style={S.cnpjCheckRow}>
            <input type="radio" name="board-visibility" checked={!isPublic} onChange={() => onSetVisibility('private')} />
            <Lock size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Privado — só você pode ver e editar
          </label>
          <label style={S.cnpjCheckRow}>
            <input type="radio" name="board-visibility" checked={isPublic} onChange={() => onSetVisibility('public')} />
            <Globe size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Público por link — qualquer pessoa com o link pode ver
          </label>
        </div>
        {isPublic && (
          <>
            <div style={{ ...S.fieldHint, marginTop: 12, lineHeight: 1.5 }}>
              Quem tiver o link e <b>não estiver logado</b> só consegue visualizar (não pode criar, editar, mover, comentar ou excluir nada).
              Quem <b>estiver logado</b> na plataforma pode colaborar normalmente, e cada ação fica registrada no histórico do quadro.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={publicUrl} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
              <button style={S.primaryBtn} onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar link'}</button>
            </div>
            <button
              className="pb-ghost"
              style={{ ...S.pbGhostBtn, marginTop: 10 }}
              onClick={async () => { if (await askConfirm({ title: 'Gerar um novo link público?', message: 'O link atual deixará de funcionar imediatamente.', confirmLabel: 'Gerar novo link', danger: true })) onRegenerateLink(); }}
            >
              <RefreshCw size={13} /> Gerar novo link
            </button>
          </>
        )}
      </div>
    </DialogOverlay>
  );
}

function BoardActivityLogModal({ board, onClose }) {
  const feed = useMemo(() => {
    const items = [];
    (board.log || []).forEach((l) => items.push({ ts: l.ts, user: l.user, action: l.action }));
    (board.columns || []).forEach((c) => (c.cards || []).forEach((cd) => (cd.history || []).forEach((h) => {
      items.push({ ts: h.ts, user: h.user, action: `"${cd.title}" — ${h.action}` });
    })));
    return items.sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 300);
  }, [board]);

  return (
    <SidePanel title={`Histórico do quadro "${board.name}"`} onClose={onClose}>
      {feed.length === 0 && <div style={S.emptyMuted}>Nenhuma atividade registrada ainda.</div>}
      {feed.map((l, i) => (
        <div key={i} style={S.logRow}>
          <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
          <div style={S.logAction}>{l.action}</div>
        </div>
      ))}
    </SidePanel>
  );
}

// Menu "Mais ações" do cabeçalho no celular (2026-10-17, Fase 0 achado E): reúne Lixeira, Concluídas, Indicadores, Compartilhar e Histórico,
// que ocupavam ~100 px de altura antes do primeiro cartão. No desktop os botões seguem como sempre.
function PbMoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', marginLeft: 'auto' }}>
      <button type="button" className="pb-ghost" aria-label="Mais ações" aria-expanded={open} aria-haspopup="menu" style={{ ...S.pbGhostBtn, minWidth: 44, minHeight: 44, justifyContent: 'center' }} onClick={() => setOpen((v) => !v)}><MoreHorizontal size={18} /></button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div role="menu" style={{ ...S.dropdownMenu, minWidth: 220 }}>
            {items.map((it) => (
              <button key={it.label} type="button" role="menuitem" style={{ ...S.dropdownItem, fontSize: 14, minHeight: 44 }} onClick={() => { setOpen(false); it.onClick(); }}><it.icon size={15} /> {it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PersonalBoardScreen({ pendingOpen, onPendingOpenConsumed, todayMeetings, board, onMutate, onExit, onGoCompany, onGoXFlow, currentUser, onLogout, theme, onToggleTheme, saveState, publicMode, readOnly, publicOwnerName, embedded, publicAction, notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead }) {
  // Histórico do navegador — Nível 2 (2026-08): trocar de página do quadro
  // pessoal. Nunca ativo em publicMode (/quadro/:token é a única rota que
  // usa URL de verdade — ver PROJECT_CONTEXT.md §9, não mexer nisso aqui).
  const initPersonalSub = (() => {
    if (publicMode) return null;
    try {
      const s = window.history.state;
      if (s && s.navTag === 'personal' && s.personalSub) return s.personalSub;
    } catch (e) { /* ignora */ }
    return null;
  })();
  const [activeBoardId, setActiveBoardId] = useState(initPersonalSub || (board.boards[0] ? board.boards[0].id : null));
  const [dragBoardId, setDragBoardId] = useState(null);
  // Quadros de outras pessoas fixados como aba (2026-09-20, ver
  // PROJECT_CONTEXT.md §52): `board.linkedBoards` = [{token, name, ownerName}];
  // a aba renderiza o quadro do dono via PublicBoardScreen embutido.
  const linkedBoards = (!publicMode && board.linkedBoards) || [];
  const [activeLinkedToken, setActiveLinkedToken] = useState(() => {
    if (publicMode || embedded) return null;
    try {
      const t = window.sessionStorage.getItem('pb-open-linked');
      return t && (board.linkedBoards || []).some((l) => l.token === t) ? t : null;
    } catch (e) { return null; }
  });
  useEffect(() => {
    try { window.sessionStorage.removeItem('pb-open-linked'); } catch (e) { /* ignora */ }
  }, []);
  useEffect(() => {
    if (activeLinkedToken && !linkedBoards.some((l) => l.token === activeLinkedToken)) setActiveLinkedToken(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedBoards.map((l) => l.token).join(',')]);
  const activeLinked = activeLinkedToken ? linkedBoards.find((l) => l.token === activeLinkedToken) : null;
  const [openCard, setOpenCard] = useState(null);
  const [reassignColumn, setReassignColumn] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ priority: [], dueBucket: '', tags: [], status: '', waiting: false });
  const [showFilters, setShowFilters] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const activeFilterCount = (filters.status ? 1 : 0) + (filters.priority.length > 0 ? 1 : 0) + (filters.dueBucket ? 1 : 0) + (filters.waiting ? 1 : 0);
  const anyFilterActive = activeFilterCount > 0 || filters.tags.length > 0 || !!search.trim();
  function clearAllFilters() { setSearch(''); setFilters({ priority: [], dueBucket: '', tags: [], status: '', waiting: false }); }
  const [activeDragItem, setActiveDragItem] = useState(null);
  const { toasts, pushToast, pushUndoToast, dismissToast } = useToasts();
  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function goToBoardPage(boardId) {
    setActiveLinkedToken(null);
    setActiveBoardId(boardId);
    if (publicMode) return;
    try { window.history.pushState({ navTag: 'personal', personalSub: boardId }, '', window.location.href); } catch (e) { /* ignora */ }
  }
  // Nível 3 (2026-08): abrir PersonalCardDetailModal empilha detailCard em
  // cima do state atual — Voltar fecha o card em vez de sair do quadro.
  // Igual às outras exceções de publicMode, nunca ativo lá.
  function openCardDetail(colId, cardId) {
    setOpenCard({ colId, cardId });
    if (publicMode) return;
    try {
      const cur = window.history.state || {};
      window.history.pushState({ ...withoutLayer(cur), detailCard: { colId, cardId } }, '', window.location.href);
    } catch (e) { /* ignora */ }
  }
  function closeCardDetail() {
    if (!publicMode) {
      try {
        if (window.history.state && window.history.state.detailCard) { window.history.back(); return; }
      } catch (e) { /* ignora */ }
    }
    setOpenCard(null);
  }

  useEffect(() => {
    if (publicMode) return;
    try {
      const cur = window.history.state;
      if (!cur || cur.navTag !== 'personal' || !cur.personalSub) {
        window.history.replaceState({ navTag: 'personal', personalSub: activeBoardId }, '', window.location.href);
      }
    } catch (e) { /* ignora */ }
    function onPopState(e) {
      const state = e.state;
      if (!state || state.navTag !== 'personal' || !state.personalSub) return;
      if (board.boards.some((b) => b.id === state.personalSub)) setActiveBoardId(state.personalSub);
      setOpenCard(state.detailCard || null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingOpen) return;
    if (pendingOpen.stats) setShowStats(true);
    else if (board.boards.some((b) => b.id === pendingOpen.boardId)) {
      goToBoardPage(pendingOpen.boardId);
      openCardDetail(pendingOpen.colId, pendingOpen.cardId);
    }
    onPendingOpenConsumed && onPendingOpenConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  useEffect(() => {
    if (!board.boards.some((b) => b.id === activeBoardId)) {
      setActiveBoardId(board.boards[0] ? board.boards[0].id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.boards.map((b) => b.id).join(',')]);

  const activeBoard = board.boards.find((b) => b.id === activeBoardId) || null;
  const viewPrefs = (activeBoard && activeBoard.viewPrefs) || { view: 'kanban', sortMode: 'manual' };
  // Resumo do dia: abrir um cartão de qualquer página do quadro.
  function openFromSummary(boardId, colId, cardId) { goToBoardPage(boardId); openCardDetail(colId, cardId); }
  // Visões rápidas (2026-10-16): atalhos para os MESMOS filtros que já existem (prazo, prioridade, status); nada novo é salvo.
  const quickViewItems = (() => {
    if (!activeBoard) return [];
    const alive = activeBoard.columns.flatMap((c) => c.cards.filter((cd) => !cd.deleted && !cd.archived));
    const toggle = (key, value) => () => setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value }));
    return [
      { key: 'today', label: 'Hoje', count: alive.filter((c) => dueDateTone(c) === 'today').length, active: filters.dueBucket === 'today', onClick: toggle('dueBucket', 'today') },
      { key: 'overdue', label: 'Atrasadas', danger: true, count: alive.filter((c) => dueDateTone(c) === 'overdue').length, active: filters.dueBucket === 'overdue', onClick: toggle('dueBucket', 'overdue') },
      { key: 'urgent', label: 'Urgentes', count: alive.filter((c) => !c.completed && c.priority === 'urgente').length, active: filters.priority.length === 1 && filters.priority[0] === 'urgente', onClick: () => setFilters((f) => ({ ...f, priority: f.priority.length === 1 && f.priority[0] === 'urgente' ? [] : ['urgente'] })) },
      { key: 'waiting', label: 'Aguardando', count: alive.filter(isWaiting).length, active: !!filters.waiting, onClick: () => setFilters((f) => ({ ...f, waiting: !f.waiting })) },
      { key: 'doing', label: 'Em andamento', count: alive.filter((c) => !c.completed && cardStatusOf(c) === 'em-andamento').length, active: filters.status === 'em-andamento', onClick: toggle('status', 'em-andamento') },
    ];
  })();

  function mutateBoardTree(bid, updater, logMsg) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== bid) return b;
        let next = updater(b);
        if (logMsg && next.visibility === 'public') {
          next = { ...next, log: [{ ts: new Date().toISOString(), action: logMsg, user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
        }
        return next;
      }),
    }));
  }
  function mutateColumnTree(bid, colId, updater, logMsg) {
    mutateBoardTree(bid, (b) => ({ ...b, columns: b.columns.map((c) => (c.id !== colId ? c : updater(c))) }), logMsg);
  }
  function mutateCardTree(bid, colId, cardId, updater, logMsg) {
    mutateColumnTree(bid, colId, (c) => ({ ...c, cards: c.cards.map((cd) => (cd.id !== cardId ? cd : updater(cd))) }), logMsg);
  }

  // ---- quadros compartilhados fixados (abas de outras pessoas) ----
  async function removeLinked(token) {
    const l = linkedBoards.find((x) => x.token === token);
    if (!l) return;
    if (!(await askConfirm({ title: 'Remover quadro da sua lista?', message: `"${l.name}" (de ${l.ownerName || 'outra pessoa'}) deixa de aparecer aqui. O quadro dela não é apagado.`, confirmLabel: 'Remover', danger: true }))) return;
    onMutate((prev) => ({ ...prev, linkedBoards: (prev.linkedBoards || []).filter((x) => x.token !== token) }));
    if (activeLinkedToken === token) setActiveLinkedToken(null);
  }
  function noteLinkedSeen(token, { name, ownerName }) {
    const l = linkedBoards.find((x) => x.token === token);
    if (!l || (l.name === name && l.ownerName === ownerName)) return;
    onMutate((prev) => ({ ...prev, linkedBoards: (prev.linkedBoards || []).map((x) => (x.token === token ? { ...x, name, ownerName } : x)) }));
  }

  // ---- boards (pages) ----
  function addBoard() {
    const nb = { id: uid('board'), name: 'Nova página', visibility: 'private', shareToken: '', log: [], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: [{ id: uid('col'), name: 'A fazer', color: '', hideCompleted: false, cards: [] }] };
    onMutate((prev) => ({ ...prev, boards: [...prev.boards, nb] }));
    goToBoardPage(nb.id);
  }
  function setBoardVisibility(boardId, visibility) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== boardId) return b;
        const next = { ...b, visibility, shareToken: visibility === 'public' && !b.shareToken ? genShareToken() : b.shareToken };
        const msg = visibility === 'public' ? 'Quadro tornado público por link' : 'Quadro tornado privado';
        return { ...next, log: [{ ts: new Date().toISOString(), action: msg, user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
      }),
    }));
  }
  function regenerateShareLink(boardId) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== boardId) return b;
        const next = { ...b, shareToken: genShareToken() };
        return { ...next, log: [{ ts: new Date().toISOString(), action: 'Link público regenerado (link anterior invalidado)', user: currentUser.name }, ...(next.log || [])].slice(0, 300) };
      }),
    }));
  }
  function renameBoard(boardId, name) {
    onMutate((prev) => ({ ...prev, boards: prev.boards.map((b) => (b.id === boardId ? { ...b, name } : b)) }));
  }
  const [deleteBoardTarget, setDeleteBoardTarget] = useState(null);
  const [deleteColumnTarget, setDeleteColumnTarget] = useState(null);
  function deleteBoard(boardId) {
    const b = board.boards.find((x) => x.id === boardId);
    if (!b) return;
    setDeleteBoardTarget(b);
  }
  function confirmDeleteBoard() {
    const b = deleteBoardTarget;
    if (!b) return;
    const idx = board.boards.findIndex((x) => x.id === b.id);
    onMutate((prev) => ({ ...prev, boards: prev.boards.filter((x) => x.id !== b.id) }));
    setDeleteBoardTarget(null);
    pushUndoToast(`Página "${b.name}" excluída.`, () => onMutate((prev) => (prev.boards.some((x) => x.id === b.id) ? prev : { ...prev, boards: (() => { const l = [...prev.boards]; l.splice(Math.min(idx, l.length), 0, b); return l; })() })), 12000);
  }
  function reorderBoards(fromId, toId) {
    if (!fromId || fromId === toId) return;
    onMutate((prev) => {
      const list = prev.boards.slice();
      const fromIdx = list.findIndex((x) => x.id === fromId);
      const toIdx = list.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...prev, boards: list };
    });
  }
  function setViewPrefs(patch) {
    if (!activeBoard || readOnly) return;
    mutateBoardTree(activeBoard.id, (b) => ({ ...b, viewPrefs: { ...(b.viewPrefs || {}), ...patch } }));
  }

  // ---- columns ----
  function addColumn() {
    if (!activeBoard) return;
    const nc = { id: uid('col'), name: 'Nova coluna', color: '', hideCompleted: false, cards: [] };
    mutateBoardTree(activeBoard.id, (b) => ({ ...b, columns: [...b.columns, nc] }), 'Coluna criada: "Nova coluna"');
  }
  function renameColumn(colId, name) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, name }));
  }
  function setColumnColor(colId, color) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, color }));
  }
  function toggleColumnHideCompleted(colId) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, hideCompleted: !c.hideCompleted }));
  }
  function reorderColumns(fromId, toId) {
    if (!fromId || fromId === toId || !activeBoard) return;
    mutateBoardTree(activeBoard.id, (b) => {
      const fromIdx = b.columns.findIndex((x) => x.id === fromId);
      const toIdx = b.columns.findIndex((x) => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return b;
      return { ...b, columns: arrayMove(b.columns, fromIdx, toIdx) };
    });
  }
  function moveColumn(colId, dir) {
    const list = activeBoard.columns;
    const idx = list.findIndex((c) => c.id === colId);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= list.length) return;
    reorderColumns(colId, list[newIdx].id);
  }
  function duplicateColumn(colId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    if (!col) return;
    const now = new Date().toISOString();
    const clone = {
      ...col,
      id: uid('col'),
      name: `${col.name} (cópia)`,
      cards: col.cards.filter((cd) => !cd.deleted).map((cd) => ({
        ...cd, id: uid('card'), comments: [], checklist: (cd.checklist || []).map(({ doneAt, ...i }) => i),
        history: [{ ts: now, action: 'Tarefa duplicada', user: currentUser.name }],
        createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
      })),
    };
    mutateBoardTree(activeBoard.id, (b) => {
      const list = b.columns.slice();
      const idx = list.findIndex((c) => c.id === colId);
      list.splice(idx + 1, 0, clone);
      return { ...b, columns: list };
    });
  }
  function sortColumnNow(colId, mode) {
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, cards: sortCards(c.cards, mode) }));
  }
  function requestDeleteColumn(colId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    if (!col) return;
    if (activeBoard.columns.length <= 1) {
      pushToast({ message: 'Esta é a única coluna da página. Crie outra coluna antes de excluir esta.', ttlMs: 6000 });
      return;
    }
    const activeCount = col.cards.filter((cd) => !cd.deleted).length;
    if (activeCount === 0) {
      setDeleteColumnTarget(col);
      return;
    }
    setReassignColumn(col);
  }
  function confirmDeleteEmptyColumn() {
    const col = deleteColumnTarget;
    if (!col) return;
    const idx = activeBoard.columns.findIndex((c) => c.id === col.id);
    mutateBoardTree(activeBoard.id, (b) => ({ ...b, columns: b.columns.filter((c) => c.id !== col.id) }), `Coluna excluída: "${col.name}"`);
    setDeleteColumnTarget(null);
    pushUndoToast(`Coluna "${col.name}" excluída.`, () => mutateBoardTree(activeBoard.id, (b) => (b.columns.some((c) => c.id === col.id) ? b : { ...b, columns: (() => { const l = [...b.columns]; l.splice(Math.min(idx, l.length), 0, col); return l; })() }), `Coluna restaurada: "${col.name}"`), 8000);
  }
  function confirmDeleteColumn(targetColId, alsoDeleteCards) {
    const col = reassignColumn;
    if (!col || !activeBoard) return;
    const now = new Date().toISOString();
    mutateBoardTree(activeBoard.id, (b) => {
      const cardsToMove = col.cards.map((cd) => {
        if (cd.deleted || !alsoDeleteCards) return cd;
        return {
          ...cd, deleted: true, deletedAt: now, deletedBy: currentUser.name,
          deletedFromColumnId: col.id, deletedFromColumnName: col.name,
          deletedFromBoardId: activeBoard.id, deletedFromBoardName: activeBoard.name,
        };
      });
      const withoutCol = b.columns.filter((c) => c.id !== col.id);
      return { ...b, columns: withoutCol.map((c) => (c.id === targetColId ? { ...c, cards: [...c.cards, ...cardsToMove] } : c)) };
    }, `Coluna excluída: "${col.name}"`);
    setReassignColumn(null);
  }

  // ---- cards ----
  function addCard(colId, title, extra) {
    const t = (title || '').trim();
    if (!t || !activeBoard) return;
    const now = new Date().toISOString();
    const nc = {
      id: uid('card'), title: t, desc: '',
      status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [],
      completed: false, completedAt: '', completedBy: '',
      comments: [], history: [{ ts: now, action: 'Tarefa criada', user: currentUser.name }],
      deleted: false, deletedAt: '', deletedBy: '',
      deletedFromColumnId: '', deletedFromColumnName: '', deletedFromBoardId: '', deletedFromBoardName: '',
      archived: false, archivedAt: '', archivedFromColumnId: '', archivedFromColumnName: '', archivedFromBoardId: '', archivedFromBoardName: '',
      createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
      ...(extra || {}),
    };
    mutateColumnTree(activeBoard.id, colId, (c) => ({ ...c, cards: [...c.cards, nc] }), `Tarefa criada: "${t}"`);
    return nc.id;
  }
  function updateCard(colId, cardId, patch, historyMsg) {
    const now = new Date().toISOString();
    const cardBefore = findCardById(cardId);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => {
      const next = { ...cd, ...patch, updatedAt: now, updatedBy: currentUser.name };
      if (historyMsg) next.history = [{ ts: now, action: historyMsg, user: currentUser.name }, ...(cd.history || [])].slice(0, 200);
      return next;
    }, historyMsg && cardBefore ? `"${cardBefore.title}" — ${historyMsg}` : null);
  }
  function setCardStatus(colId, cardId, status) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    const wasCompleted = !!card.completed;
    const willComplete = status === 'concluida';
    const oldLabel = CARD_STATUS_META[cardStatusOf(card)].label;
    const patch = {
      status,
      completed: willComplete,
      completedAt: willComplete ? (wasCompleted ? card.completedAt : now) : '',
      completedBy: willComplete ? (wasCompleted ? card.completedBy : currentUser.name) : '',
    };
    const historyMsg = `Status alterado: ${oldLabel} → ${CARD_STATUS_META[status].label}`;
    const goesToEnd = (willComplete && !wasCompleted) || (status === 'pausada' && cardStatusOf(card) !== 'pausada');
    if (goesToEnd) {
      mutateColumnTree(activeBoard.id, colId, (c) => {
        const idx = c.cards.findIndex((cd) => cd.id === cardId);
        if (idx === -1) return c;
        const updated = {
          ...c.cards[idx], ...patch, updatedAt: now, updatedBy: currentUser.name,
          history: [{ ts: now, action: historyMsg, user: currentUser.name }, ...(c.cards[idx].history || [])].slice(0, 200),
        };
        return { ...c, cards: [...c.cards.filter((cd) => cd.id !== cardId), updated] };
      }, `"${card.title}" — ${historyMsg}`);
    } else {
      updateCard(colId, cardId, patch, historyMsg);
    }
  }
  function undoDeleteCard(colId, cardId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, deleted: false, deletedAt: '', deletedBy: '' }));
  }
  function deleteCard(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, deleted: true, deletedAt: now, deletedBy: currentUser.name,
      deletedFromColumnId: col.id, deletedFromColumnName: col.name,
      deletedFromBoardId: activeBoard.id, deletedFromBoardName: activeBoard.name,
      history: [{ ts: now, action: 'Tarefa excluída', user: currentUser.name }, ...(cd.history || [])].slice(0, 200),
    }), `Tarefa excluída: "${card.title}"`);
    pushUndoToast(`Tarefa "${card.title}" excluída.`, () => undoDeleteCard(colId, cardId));
    setOpenCard((prev) => (prev && prev.cardId === cardId ? null : prev));
  }
  function toggleCardComplete(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const willComplete = !card.completed;
    setCardStatus(colId, cardId, willComplete ? 'concluida' : 'em-andamento');
    pushUndoToast(
      willComplete ? `Tarefa "${card.title}" concluída.` : `Tarefa "${card.title}" reaberta.`,
      () => toggleCardComplete(colId, cardId)
    );
  }
  function duplicateCard(colId, cardId) {
    const col = activeBoard.columns.find((c) => c.id === colId);
    const card = col && col.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    const clone = {
      ...card, id: uid('card'), title: `${card.title} (cópia)`, comments: [], checklist: (card.checklist || []).map(({ doneAt, ...i }) => i),
      history: [{ ts: now, action: 'Tarefa duplicada', user: currentUser.name }],
      status: 'nao-iniciada', completed: false, completedAt: '', completedBy: '',
      createdAt: now, createdBy: currentUser.name, updatedAt: now, updatedBy: currentUser.name,
    };
    mutateColumnTree(activeBoard.id, colId, (c) => {
      const idx = c.cards.findIndex((cd) => cd.id === cardId);
      const cards = c.cards.slice();
      cards.splice(idx + 1, 0, clone);
      return { ...c, cards };
    });
  }
  function moveCardToIndex(cardId, fromColId, toColId, toIndex) {
    if (!fromColId || !toColId || !activeBoard) return;
    const now = new Date().toISOString();
    let moved = null;
    const cardBeforeMove = fromColId !== toColId ? findCardById(cardId) : null;
    const fromColNameOuter = (activeBoard.columns.find((c) => c.id === fromColId) || {}).name || '';
    const toColNameOuter = (activeBoard.columns.find((c) => c.id === toColId) || {}).name || '';
    const moveLogMsg = cardBeforeMove ? `"${cardBeforeMove.title}" movida de "${fromColNameOuter}" para "${toColNameOuter}"` : null;
    mutateBoardTree(activeBoard.id, (b) => {
      if (fromColId === toColId) {
        return {
          ...b,
          columns: b.columns.map((c) => {
            if (c.id !== fromColId) return c;
            const fromIndex = c.cards.findIndex((cd) => cd.id === cardId);
            if (fromIndex === -1) return c;
            moved = c.cards[fromIndex];
            const clampedTo = (toIndex === null || toIndex === undefined) ? c.cards.length - 1 : Math.min(toIndex, c.cards.length - 1);
            return { ...c, cards: arrayMove(c.cards, fromIndex, clampedTo) };
          }),
        };
      }
      const toColName = (b.columns.find((c) => c.id === toColId) || {}).name || '';
      let fromColName = '';
      const columns = b.columns.map((c) => {
        if (c.id !== fromColId) return c;
        moved = c.cards.find((cd) => cd.id === cardId) || null;
        fromColName = c.name;
        return { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) };
      });
      if (!moved) return b;
      const stamped = {
        ...moved, updatedAt: now, updatedBy: currentUser.name,
        history: [{ ts: now, action: `Movida de "${fromColName}" para "${toColName}"`, user: currentUser.name }, ...(moved.history || [])].slice(0, 200),
      };
      return {
        ...b,
        columns: columns.map((c) => {
          if (c.id !== toColId) return c;
          const cards = c.cards.slice();
          const insertAt = (toIndex === null || toIndex === undefined) ? cards.length : Math.min(toIndex, cards.length);
          cards.splice(insertAt, 0, stamped);
          return { ...c, cards };
        }),
      };
    }, moveLogMsg);
    if (fromColId !== toColId && moved) {
      const movedTitle = moved.title;
      pushUndoToast(`Tarefa "${movedTitle}" movida para outra coluna.`, () => moveCardToIndex(cardId, toColId, fromColId, null));
    }
  }

  // ---- comments ----
  function addCardComment(colId, cardId, text, attachments, links) {
    const v = (text || '').trim();
    const atts = attachments || [];
    const lks = links || [];
    if (!v && !atts.length && !lks.length) return;
    const now = new Date().toISOString();
    const c = { id: uid('cm'), text: v, ts: now, author: currentUser.name, authorId: currentUser.id, ...(atts.length ? { attachments: atts } : {}), ...(lks.length ? { links: lks } : {}) };
    const cardBefore = findCardById(cardId);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, comments: [...(cd.comments || []), c], updatedAt: now, updatedBy: currentUser.name,
      history: [{ ts: now, action: 'Comentário adicionado', user: currentUser.name }, ...(cd.history || [])].slice(0, 200),
    }), cardBefore ? `Comentário em "${cardBefore.title}"` : null);
  }
  function updateCardComment(colId, cardId, commentId, text) {
    const v = (text || '').trim();
    const cur = (findCardById(cardId) || {}).comments;
    const cm = (cur || []).find((c) => c.id === commentId);
    if (!v && !(cm && ((cm.attachments || []).length || (cm.links || []).length))) return;
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({
      ...cd, comments: (cd.comments || []).map((c) => (c.id === commentId ? { ...c, text: v, editedAt: new Date().toISOString() } : c)),
    }));
  }
  function reinsertInCard(colId, cardId, field, item, index) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => {
      const list = [...(cd[field] || [])];
      if (list.some((x) => x.id === item.id)) return cd;
      list.splice(Math.min(index, list.length), 0, item);
      return { ...cd, [field]: list };
    });
  }
  function removeCardComment(colId, cardId, commentId) {
    const cardNow = findCardById(cardId);
    const cm = cardNow && (cardNow.comments || []).find((c) => c.id === commentId);
    const idx = cardNow ? (cardNow.comments || []).findIndex((c) => c.id === commentId) : -1;
    if (cm) pushUndoToast('Comentário removido.', () => reinsertInCard(colId, cardId, 'comments', cm, idx), 8000);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, comments: (cd.comments || []).filter((c) => c.id !== commentId) }));
  }

  // ---- responsáveis (lista do quadro + ids por atividade) ----
  function setCardResponsibles(colId, cardId, ids) {
    const all = activeBoard.responsibles || [];
    const valid = [...new Set(ids)].filter((id) => all.some((r) => r.id === id));
    const nameOf = (id) => (all.find((r) => r.id === id) || {}).name;
    const before = new Set((findCardById(cardId) || {}).responsibleIds || []);
    const added = valid.filter((id) => !before.has(id)).map(nameOf);
    const removed = [...before].filter((id) => !valid.includes(id)).map(nameOf).filter(Boolean);
    const msg = [added.length ? `Responsável atribuído: ${added.join(', ')}` : '', removed.length ? `Responsável removido: ${removed.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Responsáveis atualizados';
    updateCard(colId, cardId, { responsibleIds: valid }, msg);
  }
  function createCardResponsible(colId, cardId, name) {
    const v = (name || '').trim().slice(0, 60);
    if (!v) return;
    const key = normResp(v);
    const existing = (activeBoard.responsibles || []).find((r) => normResp(r.name) === key);
    if (existing) {
      const cur = (findCardById(cardId) || {}).responsibleIds || [];
      if (!cur.includes(existing.id)) setCardResponsibles(colId, cardId, [...cur, existing.id]);
      return;
    }
    const resp = { id: uid('resp'), name: v };
    mutateBoardTree(activeBoard.id, (b) => ({
      ...b,
      responsibles: [...(b.responsibles || []), resp],
      columns: b.columns.map((c) => (c.id !== colId ? c : { ...c, cards: c.cards.map((cd) => (cd.id !== cardId ? cd : { ...cd, responsibleIds: [...(cd.responsibleIds || []), resp.id], updatedAt: new Date().toISOString(), updatedBy: currentUser.name, history: [{ ts: new Date().toISOString(), user: currentUser.name, action: `Responsável criado e atribuído: ${v}` }, ...(cd.history || [])] })) })),
    }), `Responsável criado e atribuído: ${v}`);
  }

  // ---- checklist ----
  function addChecklistItem(colId, cardId, text, dueDate) {
    const v = (text || '').trim();
    if (!v) return;
    const item = { id: uid('chk'), text: v, done: false, ...(isIsoDay(dueDate) ? { dueDate } : {}) };
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: [...(cd.checklist || []), item], updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function toggleChecklistItem(colId, cardId, itemId) {
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).map((i) => (i.id === itemId ? (i.done ? { ...i, done: false, doneAt: '' } : { ...i, done: true, doneAt: new Date().toISOString() }) : i)), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function setChecklistItemDate(colId, cardId, itemId, date) {
    const v = isIsoDay(date) ? date : '';
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).map((i) => { if (i.id !== itemId) return i; const { dueDate, ...rest } = i; return v ? { ...rest, dueDate: v } : rest; }), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function updateChecklistItem(colId, cardId, itemId, text) {
    const v = (text || '').trim();
    if (!v) return;
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).map((i) => (i.id === itemId ? { ...i, text: v } : i)), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }
  function removeChecklistItem(colId, cardId, itemId) {
    const cardNow = findCardById(cardId);
    const it = cardNow && (cardNow.checklist || []).find((i) => i.id === itemId);
    const idx = cardNow ? (cardNow.checklist || []).findIndex((i) => i.id === itemId) : -1;
    if (it) pushUndoToast(`Item "${it.text || it.title || 'do checklist'}" removido.`, () => reinsertInCard(colId, cardId, 'checklist', it, idx), 8000);
    mutateCardTree(activeBoard.id, colId, cardId, (cd) => ({ ...cd, checklist: (cd.checklist || []).filter((i) => i.id !== itemId), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }));
  }

  // ---- trash (cross-board) ----
  const trashItems = useMemo(() => {
    const items = [];
    for (const b of board.boards) {
      for (const c of b.columns) {
        for (const cd of c.cards) {
          if (cd.deleted) items.push({ boardId: b.id, boardName: b.name, colId: c.id, card: cd });
        }
      }
    }
    return items.sort((a, b) => (b.card.deletedAt || '').localeCompare(a.card.deletedAt || ''));
  }, [board]);

  function restoreTrashedCard(item) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => {
        if (b.id !== item.boardId) return b;
        const originalColExists = b.columns.some((c) => c.id === item.card.deletedFromColumnId);
        const targetColId = originalColExists ? item.card.deletedFromColumnId : item.colId;
        let removed = null;
        const withoutCard = b.columns.map((c) => {
          if (c.id !== item.colId) return c;
          removed = c.cards.find((cd) => cd.id === item.card.id);
          return { ...c, cards: c.cards.filter((cd) => cd.id !== item.card.id) };
        });
        if (!removed) return b;
        const restored = { ...removed, deleted: false, deletedAt: '', deletedBy: '' };
        return { ...b, columns: withoutCard.map((c) => (c.id === targetColId ? { ...c, cards: [...c.cards, restored] } : c)) };
      }),
    }));
  }
  async function hardDeleteTrashedCard(item) {
    if (!(await askConfirm({ title: 'Excluir definitivamente?', message: `Para excluir definitivamente "${item.card.title}", digite "${CARD_DELETE_CONFIRM_PHRASE}" abaixo. Não há como desfazer.`, confirmLabel: 'Excluir definitivamente', danger: true, requireText: CARD_DELETE_CONFIRM_PHRASE }))) return;
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== item.boardId ? b : {
        ...b,
        columns: b.columns.map((c) => (c.id !== item.colId ? c : { ...c, cards: c.cards.filter((cd) => cd.id !== item.card.id) })),
      })),
    }));
  }

  // ---- archive (cross-board, concluídas) ----
  const archiveItems = useMemo(() => {
    const items = [];
    for (const b of board.boards) {
      for (const c of b.columns) {
        for (const cd of c.cards) {
          if (cd.archived && !cd.deleted) items.push({ boardId: b.id, boardName: b.name, colId: c.id, card: cd });
        }
      }
    }
    return items.sort((a, b) => (b.card.archivedAt || '').localeCompare(a.card.archivedAt || ''));
  }, [board]);

  function restoreArchivedCard(item) {
    onMutate((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id !== item.boardId ? b : {
        ...b,
        columns: b.columns.map((c) => (c.id !== item.colId ? c : {
          ...c,
          cards: c.cards.map((cd) => (cd.id !== item.card.id ? cd : { ...cd, archived: false, archivedAt: '', archivedFromColumnId: '', archivedFromColumnName: '', archivedFromBoardId: '', archivedFromBoardName: '' })),
        })),
      })),
    }));
  }

  useEffect(() => {
    if (publicMode || readOnly) return;
    const now = new Date();
    const dayIdx = now.getDay();
    const sinceMonday = dayIdx === 0 ? 6 : dayIdx - 1;
    const mostRecentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
    if (board.lastCompletedArchiveAt && new Date(board.lastCompletedArchiveAt) >= mostRecentMonday) return;
    const ts = now.toISOString();
    onMutate((prev) => ({
      ...prev,
      lastCompletedArchiveAt: ts,
      boards: prev.boards.map((b) => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          cards: c.cards.map((cd) => (cd.completed && !cd.archived && !cd.deleted ? {
            ...cd, archived: true, archivedAt: ts,
            archivedFromColumnId: c.id, archivedFromColumnName: c.name, archivedFromBoardId: b.id, archivedFromBoardName: b.name,
          } : cd)),
        })),
      })),
    }));
  }, [board.boards, board.lastCompletedArchiveAt, publicMode, readOnly]);

  // ---- drag and drop ----
  function findCardById(id) {
    if (!activeBoard) return null;
    for (const c of activeBoard.columns) {
      const found = c.cards.find((cd) => cd.id === id);
      if (found) return found;
    }
    return null;
  }
  function handleDragStart(event) {
    const { active } = event;
    if (active.data.current?.type === 'column') {
      const col = activeBoard.columns.find((c) => c.id === active.id);
      setActiveDragItem(col ? { type: 'column', column: col } : null);
    } else {
      const card = findCardById(active.id);
      setActiveDragItem(card ? { type: 'card', card } : null);
    }
  }
  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);
    if (!over || !activeBoard) return;
    if (active.data.current?.type === 'column') {
      if (active.id !== over.id) reorderColumns(active.id, over.id);
      return;
    }
    const fromColId = active.data.current?.columnId;
    if (!fromColId) return;
    let toColId, toIndex = null;
    if (over.data.current?.type === 'card') {
      toColId = over.data.current.columnId;
      const toCol = activeBoard.columns.find((c) => c.id === toColId);
      toIndex = toCol ? toCol.cards.findIndex((cd) => cd.id === over.id) : null;
    } else if (over.data.current?.type === 'coldrop') {
      toColId = over.data.current.columnId;
    } else if (over.data.current?.type === 'column') {
      toColId = over.id;
    } else {
      toColId = fromColId;
    }
    if (fromColId === toColId) {
      if ((viewPrefs.sortMode || 'manual') !== 'manual') return;
      if (toIndex !== null) {
        const col = activeBoard.columns.find((c) => c.id === fromColId);
        const fromIndex = col ? col.cards.findIndex((cd) => cd.id === active.id) : -1;
        if (fromIndex === toIndex) return;
      }
    }
    moveCardToIndex(active.id, fromColId, toColId, toIndex);
  }

  // ---- filters ----
  const allTags = useMemo(() => {
    if (!activeBoard) return [];
    const set = new Set();
    activeBoard.columns.forEach((c) => c.cards.forEach((cd) => (cd.tags || []).forEach((t) => set.add(t))));
    return [...set];
  }, [activeBoard]);

  function cardMatches(card) {
    return cardMatchesFilters(card, { search, priority: filters.priority, dueBucket: filters.dueBucket, tags: filters.tags, status: filters.status, waiting: filters.waiting });
  }

  const columnIds = activeBoard ? activeBoard.columns.map((c) => c.id) : [];

  return (
    <RespCtx.Provider value={(activeBoard && activeBoard.responsibles) || []}>
    <div className={embedded ? undefined : 'page-root t44'} style={embedded ? undefined : S.page}>
      <style>{`
        @keyframes personalSkeletonPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], input[type=number], select, textarea {
          background:var(--bg-3); border:1px solid var(--border-2); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, input[type=number]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }

        :root {
          --pb-shadow-soft: 0 1px 2px rgba(15,15,15,.04);
          --pb-shadow-hover: 0 2px 8px rgba(15,15,15,.16);
          --pb-shadow-drag: 0 8px 20px rgba(15,15,15,.24);
          --pcol-gray-bg: rgba(255,255,255,.06); --pcol-gray-text: var(--text-3); --pcol-gray-container: rgba(255,255,255,.03);
          --pcol-brown-bg: rgba(160,120,90,.22); --pcol-brown-text: #c9a488; --pcol-brown-container: rgba(160,120,90,.08);
          --pcol-orange-bg: rgba(217,115,13,.20); --pcol-orange-text: #e8a463; --pcol-orange-container: rgba(217,115,13,.07);
          --pcol-yellow-bg: rgba(203,145,47,.20); --pcol-yellow-text: #e0b968; --pcol-yellow-container: rgba(203,145,47,.07);
          --pcol-green-bg: rgba(68,131,97,.22); --pcol-green-text: #7fc79c; --pcol-green-container: rgba(68,131,97,.08);
          --pcol-blue-bg: rgba(51,126,169,.22); --pcol-blue-text: #7ec2e8; --pcol-blue-container: rgba(51,126,169,.08);
          --pcol-purple-bg: rgba(144,101,176,.22); --pcol-purple-text: #c6a4e0; --pcol-purple-container: rgba(144,101,176,.08);
          --pcol-pink-bg: rgba(193,76,138,.22); --pcol-pink-text: #ea9dc4; --pcol-pink-container: rgba(193,76,138,.08);
          --pcol-red-bg: rgba(212,76,71,.22); --pcol-red-text: #f08f8a; --pcol-red-container: rgba(212,76,71,.08);
          --pcol-default-container: rgba(255,255,255,.02);
        }
        html[data-theme="light"] {
          --pb-shadow-soft: 0 1px 2px rgba(15,15,15,.04);
          --pb-shadow-hover: 0 2px 6px rgba(15,15,15,.06);
          --pb-shadow-drag: 0 8px 20px rgba(15,15,15,.10);
          --pcol-gray-bg: #EDECE9; --pcol-gray-text: #55534E; --pcol-gray-container: #F7F7F6;
          --pcol-brown-bg: #EEE0DA; --pcol-brown-text: #64473A; --pcol-brown-container: #F8F2EF;
          --pcol-orange-bg: #FADEC9; --pcol-orange-text: #D9730D; --pcol-orange-container: #FDF2E8;
          --pcol-yellow-bg: #FDECC8; --pcol-yellow-text: #CB912F; --pcol-yellow-container: #FEF9EB;
          --pcol-green-bg: #DBEDDB; --pcol-green-text: #448361; --pcol-green-container: #EFF8EF;
          --pcol-blue-bg: #D3E5EF; --pcol-blue-text: #337EA9; --pcol-blue-container: #EFF5F9;
          --pcol-purple-bg: #E8DEEE; --pcol-purple-text: #9065B0; --pcol-purple-container: #F6F2F9;
          --pcol-pink-bg: #F5E0E9; --pcol-pink-text: #C14C8A; --pcol-pink-container: #FBF2F6;
          --pcol-red-bg: #FFE2DD; --pcol-red-text: #D44C47; --pcol-red-container: #FFF3F1;
          --pcol-default-container: #F7F7F5;
        }
        .pb-card { transition: box-shadow .14s ease, transform .14s ease; }
        .pb-card:hover { box-shadow: var(--pb-shadow-hover); transform: translateY(-1px); }
        .pb-check { transition: background .12s ease; }
        .pb-check:hover { background: var(--bg-3); }
        .pb-ghost { transition: background .12s ease, border-color .12s ease; }
        .pb-ghost:hover { background: var(--bg-3); }
        .pb-addbtn { transition: background .12s ease, color .12s ease; }
        .pb-addbtn:hover { background: var(--bg-3); color: var(--text-2); }
      `}</style>
      {!embedded && (
      <div className="no-print t44" style={{ ...S.topbar, ...(isMobile ? { padding: '8px 12px' } : null) }}>
        <div style={S.brandRow}>
          <div style={S.logoPlaceholder}><Columns3 size={18} color="#F5C400" /></div>
          <div>
            <div style={S.brandName}>Gestão de Atividades</div>
            <div style={S.brandCnpj}>{publicMode ? (publicOwnerName ? `Quadro de ${publicOwnerName}` : 'Quadro compartilhado') : currentUser.name}</div>
          </div>
          {!readOnly && !isMobile && <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowTrash(true)}><Trash2 size={15} /> Lixeira{trashItems.length > 0 ? ` (${trashItems.length})` : ''}</button>}
          {!readOnly && !isMobile && <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowArchive(true)}><Archive size={15} /> Concluídas{archiveItems.length > 0 ? ` (${archiveItems.length})` : ''}</button>}
          {!readOnly && !publicMode && !isMobile && <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowStats(true)}><Gauge size={15} /> Indicadores</button>}
          {isMobile && (() => {
            const boardActions = activeBoard && !activeLinked;
            const items = [
              !readOnly && { icon: Trash2, label: `Lixeira${trashItems.length > 0 ? ` (${trashItems.length})` : ''}`, onClick: () => setShowTrash(true) },
              !readOnly && { icon: Archive, label: `Concluídas${archiveItems.length > 0 ? ` (${archiveItems.length})` : ''}`, onClick: () => setShowArchive(true) },
              !readOnly && !publicMode && { icon: Gauge, label: 'Indicadores', onClick: () => setShowStats(true) },
              boardActions && !publicMode && { icon: activeBoard.visibility === 'public' ? Globe : Lock, label: activeBoard.visibility === 'public' ? 'Público por link' : 'Compartilhar', onClick: () => setShowShareModal(true) },
              boardActions && activeBoard.visibility === 'public' && !readOnly && { icon: History, label: 'Histórico', onClick: () => setShowActivityLog(true) },
            ].filter(Boolean);
            return items.length ? <PbMoreMenu items={items} /> : null;
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {publicMode && <SaveStatus state={saveState} errorText="Não foi possível salvar — alteração desfeita." />}
          {publicMode && <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />}
          {publicMode && onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>
      )}

      {embedded ? (
        <div className="no-print t44" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px 0' }}>
          <span style={S.publicBadge}><Globe size={11} /> Quadro de {publicOwnerName || 'outra pessoa'}</span>
          <SaveStatus state={saveState} errorText="Não foi possível salvar — alteração desfeita." />
        </div>
      ) : publicMode ? (
        <div style={{ ...S.personalTabs, ...(isMobile ? { padding: '8px 12px 0' } : null) }}>
          <div style={{ ...S.personalTab, ...S.personalTabActive, cursor: 'default' }}>
            <span style={S.personalTabInput}>{activeBoard ? activeBoard.name : ''}</span>
            <span style={S.publicBadge}><Globe size={11} /> Público por link</span>
          </div>
          {readOnly && <div style={{ ...S.fieldHint, alignSelf: 'center', marginLeft: 8 }}>Somente visualização — <a href="/" style={{ color: '#F5C400' }}>faça login</a> para colaborar</div>}
          {publicAction && <div style={{ alignSelf: 'center', marginLeft: 12 }}>{publicAction}</div>}
        </div>
      ) : (
        <div style={{ ...S.personalTabs, ...(isMobile ? { padding: '8px 12px 0' } : null) }}>
          {board.boards.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragBoardId(b.id)}
              onDragEnd={() => setDragBoardId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { reorderBoards(dragBoardId, b.id); setDragBoardId(null); }}
              onClick={() => goToBoardPage(b.id)}
              style={{ ...S.personalTab, ...(b.id === activeBoardId && !activeLinkedToken ? S.personalTabActive : {}) }}
            >
              <input value={b.name} onChange={(e) => renameBoard(b.id, e.target.value)} style={S.personalTabInput} />
              {b.visibility === 'public' && <span style={S.publicBadge}><Globe size={11} /></span>}
              <button aria-label="Excluir quadro" title="Excluir quadro" style={S.chipX} onClick={(e) => { e.stopPropagation(); deleteBoard(b.id); }}><X aria-hidden="true" size={11} /></button>
            </div>
          ))}
          {linkedBoards.map((l) => (
            <div
              key={l.token}
              onClick={() => setActiveLinkedToken(l.token)}
              title={l.ownerName ? `Quadro compartilhado por ${l.ownerName}` : 'Quadro compartilhado'}
              style={{ ...S.personalTab, ...(l.token === activeLinkedToken ? S.personalTabActive : {}) }}
            >
              <span style={S.publicBadge}><Link2 size={11} /></span>
              <span style={{ ...S.personalTabInput, cursor: 'pointer' }}>{l.name}{l.ownerName ? ` · ${l.ownerName.split(' ')[0]}` : ''}</span>
              <button style={S.chipX} title="Remover da minha lista" onClick={(e) => { e.stopPropagation(); removeLinked(l.token); }}><X size={11} /></button>
            </div>
          ))}
          <button style={S.iconBtnGhost} onClick={addBoard} title="Nova página"><Plus size={16} /></button>
        </div>
      )}

      {activeLinked && (
        <PublicBoardScreen
          key={activeLinked.token}
          token={activeLinked.token}
          embedded
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onRemove={() => removeLinked(activeLinked.token)}
          onSeen={(info) => noteLinkedSeen(activeLinked.token, info)}
        />
      )}

      {activeBoard && !activeLinked && !publicMode && !embedded && !readOnly && (
        <DaySummary boards={board.boards} meetings={todayMeetings} todayIso={todayISOStr()} isMobile={isMobile} onOpenCard={openFromSummary} />
      )}

      {activeBoard && !activeLinked && !publicMode && !embedded && !readOnly && (
        <SafeBoundary label="o painel de calendário, anotações e atalhos" onError={() => { try { window.localStorage.setItem('pricetax-pb-tools-v1', '0'); } catch (e) { /* ignora */ } }}>
        <React.Suspense fallback={null}>
          <Workbench boards={board.boards} todayIso={todayISOStr()} onOpenCard={openFromSummary} readOnly={readOnly}
            onCreateCard={(title, desc) => {
              const col = activeBoard.columns[0]; const bid = activeBoard.id;
              if (!col) return null;
              const id = addCard(col.id, title, desc ? { desc, descFormat: 'html' } : undefined);
              // devolve o "desfazer": tira o cartão recém-criado (some de vez, não vai para a lixeira), pois a criação foi desfeita na hora
              return id ? () => mutateColumnTree(bid, col.id, (c) => ({ ...c, cards: c.cards.filter((cd) => cd.id !== id) }), `Criação desfeita: "${title}"`) : null;
            }} />
        </React.Suspense>
        </SafeBoundary>
      )}

      {activeBoard && !activeLinked && (
        <div style={{ ...S.personalToolbar, ...(isMobile ? { padding: '8px 12px' } : null) }}>
          <QuickNew columns={activeBoard.columns} enabled={!publicMode && !embedded && !readOnly && !openCard && !showStats && !showTrash && !showArchive && !showShareModal && !showActivityLog} onCreate={addCard} />
          <div style={S.personalViewToggle}>
            <button style={{ ...S.personalViewToggleBtn, ...(viewPrefs.view !== 'list' ? S.personalViewToggleBtnActive : {}) }} onClick={() => setViewPrefs({ view: 'kanban' })}><Columns3 size={13} /> Quadro</button>
            <button style={{ ...S.personalViewToggleBtn, ...(viewPrefs.view === 'list' ? S.personalViewToggleBtnActive : {}) }} onClick={() => setViewPrefs({ view: 'list' })}><LayoutList size={13} /> Lista</button>
          </div>
          <div style={{ ...S.personalSearchWrap, ...(isMobile ? { flex: '1 1 150px', minWidth: 0 } : null) }}>
            <Search size={13} color="var(--text-6)" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." style={S.personalSearchInput} />
          </div>
          <button
            className="pb-ghost"
            style={{ ...S.pbGhostBtn, ...(showFilters ? S.pbGhostBtnActive : {}) }}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {!publicMode && !isMobile && (
            <button className="pb-ghost" style={{ ...S.pbGhostBtn, ...(activeBoard.visibility === 'public' ? { color: '#3ea6ff', borderColor: '#3ea6ff' } : {}) }} onClick={() => setShowShareModal(true)}>
              {activeBoard.visibility === 'public' ? <Globe size={13} /> : <Lock size={13} />} {activeBoard.visibility === 'public' ? 'Público por link' : 'Compartilhar'}
            </button>
          )}
          {activeBoard.visibility === 'public' && !readOnly && !isMobile && (
            <button className="pb-ghost" style={S.pbGhostBtn} onClick={() => setShowActivityLog(true)}><History size={13} /> Histórico</button>
          )}
          {showFilters && (
            <div style={isMobile ? { display: 'flex', flexWrap: 'wrap', gap: 8, flexBasis: '100%' } : { display: 'contents' }}>
              <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={S.personalFilterSelect}>
                <option value="">Todo status</option>
                <option value="nao-concluida">Ocultar concluídas</option>
                {CARD_STATUS_ORDER.map((s) => <option key={s} value={s}>{CARD_STATUS_META[s].label}</option>)}
              </select>
              <select value={filters.priority[0] || ''} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value ? [e.target.value] : [] }))} style={S.personalFilterSelect}>
                <option value="">Toda prioridade</option>
                {CARD_PRIORITY_ORDER.map((p) => <option key={p} value={p}>{CARD_PRIORITY_META[p].label}</option>)}
              </select>
              <select value={filters.dueBucket} onChange={(e) => setFilters((f) => ({ ...f, dueBucket: e.target.value }))} style={S.personalFilterSelect}>
                <option value="">Todo prazo</option>
                <option value="overdue">Vencido</option>
                <option value="today">Hoje</option>
                <option value="week">Próximos dias</option>
                <option value="none">Sem prazo</option>
              </select>
              {isMobile && <select value={viewPrefs.sortMode || 'manual'} onChange={(e) => setViewPrefs({ sortMode: e.target.value })} aria-label="Ordenar atividades" style={S.personalFilterSelect}>
            <option value="manual">Ordem manual</option>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>}
            </div>
          )}
          {!isMobile && <select value={viewPrefs.sortMode || 'manual'} onChange={(e) => setViewPrefs({ sortMode: e.target.value })} aria-label="Ordenar atividades" style={S.personalFilterSelect}>
            <option value="manual">Ordem manual</option>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>}
        </div>
      )}

      {activeBoard && !activeLinked && <QuickViews items={quickViewItems} />}

      {activeBoard && !activeLinked && anyFilterActive && (
        <div style={S.personalActiveFilters} role="status">
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-4)' }}>Filtros ativos:</span>
          {search.trim() && <button type="button" style={S.personalFilterChip} onClick={() => setSearch('')} title="Remover este filtro">Busca: “{search.trim().slice(0, 24)}” <X size={11} /></button>}
          {filters.status && <button type="button" style={S.personalFilterChip} onClick={() => setFilters((f) => ({ ...f, status: '' }))} title="Remover este filtro">{filters.status === 'nao-concluida' ? 'Sem concluídas' : `Status: ${CARD_STATUS_META[filters.status] ? CARD_STATUS_META[filters.status].label : filters.status}`} <X size={11} /></button>}
          {filters.priority.length > 0 && <button type="button" style={S.personalFilterChip} onClick={() => setFilters((f) => ({ ...f, priority: [] }))} title="Remover este filtro">Prioridade: {CARD_PRIORITY_META[filters.priority[0]] ? CARD_PRIORITY_META[filters.priority[0]].label : filters.priority[0]} <X size={11} /></button>}
          {filters.dueBucket && <button type="button" style={S.personalFilterChip} onClick={() => setFilters((f) => ({ ...f, dueBucket: '' }))} title="Remover este filtro">Prazo: {{ overdue: 'vencido', today: 'hoje', week: 'próximos dias', none: 'sem prazo' }[filters.dueBucket] || filters.dueBucket} <X size={11} /></button>}
          {filters.waiting && <button type="button" style={S.personalFilterChip} onClick={() => setFilters((f) => ({ ...f, waiting: false }))} title="Remover este filtro">Só aguardando <X size={11} /></button>}
          {filters.tags.length > 0 && <button type="button" style={S.personalFilterChip} onClick={() => setFilters((f) => ({ ...f, tags: [] }))} title="Remover este filtro">Tags: {filters.tags.join(', ')} <X size={11} /></button>}
          <button type="button" style={{ ...S.personalFilterChip, background: 'transparent', fontWeight: 800 }} onClick={clearAllFilters}>Limpar tudo</button>
        </div>
      )}

      {!activeBoard && !activeLinked && (
        <div style={S.emptyMuted}>Nenhuma página ainda. Clique no + acima pra criar a primeira.</div>
      )}

      {activeBoard && !activeLinked && viewPrefs.view !== 'list' && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div style={{ ...S.personalBoardArea, ...(isMobile ? { padding: '12px 12px 32px' } : null) }}>
              {activeBoard.columns.map((col, idx) => {
                const alive = col.cards.filter((cd) => !cd.deleted && !cd.archived);
                const visible = sortCards(
                  alive.filter((cd) => !(col.hideCompleted && cd.completed) && cardMatches(cd)),
                  viewPrefs.sortMode
                );
                const hiddenByFilter = alive.filter((cd) => !(col.hideCompleted && cd.completed) && !cardMatches(cd)).length;
                const hiddenCompleted = col.hideCompleted ? alive.filter((cd) => cd.completed).length : 0;
                return (
                  <PersonalColumn
                    key={col.id}
                    column={col}
                    cardsToRender={visible}
                    totalVisibleCount={visible.length}
                    hiddenByFilter={hiddenByFilter}
                    hiddenCompleted={hiddenCompleted}
                    onClearFilters={clearAllFilters}
                    dragDisabled={false}
                    readOnly={readOnly}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < activeBoard.columns.length - 1}
                    otherColumns={activeBoard.columns.filter((c) => c.id !== col.id)}
                    onAddCard={addCard}
                    onOpenCard={openCardDetail}
                    onToggleComplete={toggleCardComplete}
                    onDeleteCard={deleteCard}
                    onDuplicateCard={duplicateCard}
                    onSetPriority={(colId, cardId, p) => {
                      const prevCard = findCardById(cardId);
                      const prevLabel = prevCard && prevCard.priority ? CARD_PRIORITY_META[prevCard.priority].label : 'sem prioridade';
                      updateCard(colId, cardId, { priority: p }, `Prioridade alterada: ${prevLabel} → ${p ? CARD_PRIORITY_META[p].label : 'sem prioridade'}`);
                    }}
                    onSetStatus={setCardStatus}
                    onMoveCardTo={(colId, cardId, targetColId) => moveCardToIndex(cardId, colId, targetColId, null)}
                    onRenameColumn={renameColumn}
                    onColorChange={setColumnColor}
                    onToggleHideCompleted={toggleColumnHideCompleted}
                    onMoveLeft={() => moveColumn(col.id, -1)}
                    onMoveRight={() => moveColumn(col.id, 1)}
                    onDuplicateColumn={() => duplicateColumn(col.id)}
                    onSortColumnNow={(mode) => sortColumnNow(col.id, mode)}
                    onDeleteColumn={() => requestDeleteColumn(col.id)}
                  />
                );
              })}
              {!readOnly && <button className="pb-addbtn" style={S.personalAddCol} onClick={addColumn}><Plus size={14} /> Nova coluna</button>}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDragItem && activeDragItem.type === 'card' && (
              <div style={{ ...S.personalCard, boxShadow: 'var(--pb-shadow-drag)', opacity: .92 }}>
                <div style={S.personalCardTop}>
                  <span style={S.personalCardCheckEmpty} />
                  <div style={S.personalCardTitleText}>{activeDragItem.card.title}</div>
                </div>
              </div>
            )}
            {activeDragItem && activeDragItem.type === 'column' && (
              <div style={{ ...S.personalCol, background: 'var(--bg-1)', border: '1px solid var(--border-1)', boxShadow: 'var(--pb-shadow-drag)', opacity: .92 }}>
                <div style={S.personalColHead}>{activeDragItem.column.name}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {activeBoard && !activeLinked && viewPrefs.view === 'list' && (
        <PersonalListView board={activeBoard} filterFn={cardMatches} onOpenCard={openCardDetail} onToggleComplete={toggleCardComplete} readOnly={readOnly} />
      )}

      {openCard && activeBoard && (() => {
        const col = activeBoard.columns.find((c) => c.id === openCard.colId);
        const card = col && col.cards.find((cd) => cd.id === openCard.cardId);
        if (!card) return null;
        return (
          <SafeBoundary variant="floating" resetKey={`card:${card.id}`} label="o detalhe da atividade" where="card-detail" actions={[{ label: 'Fechar', onClick: closeCardDetail }]}>
          <PersonalCardDetailModal
            card={card}
            columnId={col.id}
            columnName={col.name}
            boardName={activeBoard.name}
            otherColumns={activeBoard.columns.filter((c) => c.id !== col.id)}
            onMoveTo={(targetColId) => { moveCardToIndex(card.id, col.id, targetColId, null); setOpenCard({ colId: targetColId, cardId: card.id }); }}
            allTags={allTags}
            currentUserId={currentUser.id}
            readOnly={readOnly}
            onClose={closeCardDetail}
            onUpdate={(patch, historyMsg) => updateCard(col.id, card.id, patch, historyMsg)}
            onDelete={() => { deleteCard(col.id, card.id); closeCardDetail(); }}
            onToggleComplete={() => toggleCardComplete(col.id, card.id)}
            onSetStatus={(s) => setCardStatus(col.id, card.id, s)}
            onAddComment={(text, attachments, links) => addCardComment(col.id, card.id, text, attachments, links)}
            onUpdateComment={(id, text) => updateCardComment(col.id, card.id, id, text)}
            onRemoveComment={(id) => removeCardComment(col.id, card.id, id)}
            onAddChecklistItem={(text, date) => addChecklistItem(col.id, card.id, text, date)}
            onSetChecklistDate={(id, date) => setChecklistItemDate(col.id, card.id, id, date)}
            onSetResponsibles={(ids) => setCardResponsibles(col.id, card.id, ids)}
            onCreateResponsible={(name) => createCardResponsible(col.id, card.id, name)}
            onToggleChecklistItem={(id) => toggleChecklistItem(col.id, card.id, id)}
            onUpdateChecklistItem={(id, text) => updateChecklistItem(col.id, card.id, id, text)}
            onRemoveChecklistItem={(id) => removeChecklistItem(col.id, card.id, id)}
          />
          </SafeBoundary>
        );
      })()}

      {reassignColumn && activeBoard && (
        <ReassignCardsModal
          column={reassignColumn}
          otherColumns={activeBoard.columns.filter((c) => c.id !== reassignColumn.id)}
          onConfirm={confirmDeleteColumn}
          onCancel={() => setReassignColumn(null)}
        />
      )}

      {showTrash && (
        <PersonalTrashPanel trashItems={trashItems} onClose={() => setShowTrash(false)} onRestore={restoreTrashedCard} onHardDelete={hardDeleteTrashedCard} />
      )}

      {showArchive && (
        <PersonalArchivePanel archiveItems={archiveItems} onClose={() => setShowArchive(false)} onRestore={restoreArchivedCard} />
      )}

      {showStats && <React.Suspense fallback={null}><PersonalStatsPanel onClose={() => setShowStats(false)} /></React.Suspense>}

      {showShareModal && activeBoard && (
        <BoardShareModal
          board={activeBoard}
          onClose={() => setShowShareModal(false)}
          onSetVisibility={(v) => setBoardVisibility(activeBoard.id, v)}
          onRegenerateLink={() => regenerateShareLink(activeBoard.id)}
        />
      )}

      {showActivityLog && activeBoard && (
        <BoardActivityLogModal board={activeBoard} onClose={() => setShowActivityLog(false)} />
      )}

      {deleteBoardTarget && (
        <ConfirmDialog
          title={`Excluir a página "${deleteBoardTarget.name}"?`}
          message={`Isto apaga a página e tudo dentro dela (${deleteBoardTarget.columns.reduce((n, c) => n + c.cards.length, 0)} atividades, inclusive as da Lixeira). Você terá alguns segundos para desfazer.`}
          confirmLabel="Excluir página"
          danger
          requireText={deleteBoardTarget.columns.some((c) => c.cards.some((cd) => !cd.deleted)) ? deleteBoardTarget.name : undefined}
          onConfirm={confirmDeleteBoard}
          onCancel={() => setDeleteBoardTarget(null)}
        />
      )}
      {deleteColumnTarget && (
        <ConfirmDialog
          title={`Excluir a coluna "${deleteColumnTarget.name}"?`}
          message="A coluna está vazia. Você terá alguns segundos para desfazer."
          confirmLabel="Excluir coluna"
          danger
          onConfirm={confirmDeleteEmptyColumn}
          onCancel={() => setDeleteColumnTarget(null)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
    </RespCtx.Provider>
  );
}

// Página pública /quadro/:token e também a aba "quadro compartilhado" dentro
// da Gestão de Atividades (`embedded`, 2026-09-20, ver PROJECT_CONTEXT.md §52).
// Logado = edita o quadro do DONO (PATCH em /api/public-board/:token, que
// grava direto nos dados dele); anônimo = só leitura.
// - viewPrefs (Quadro/Lista, ordenação) ficam LOCAIS de quem está vendo
//   (`localViewPrefs`) — nunca vão pro PATCH, senão trocar a visão mudaria
//   também a tela do dono.
// - `embedded` recarrega o quadro a cada 45s (a menos que haja edição
//   pendente/em voo) pra enxergar o que o dono mexeu.
export function PublicBoardScreen({ token, theme, onToggleTheme, embedded, currentUser, onRemove, onSeen }) {
  const [state, setState] = useState({ loading: true, error: '', gone: false, board: null, canEdit: false, ownerName: '', isOwner: false, alreadyLinked: false, localViewPrefs: null });
  const [viewerUser, setViewerUser] = useState(embedded ? currentUser : null);
  const [saveState, setSaveState] = useState('idle');
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef(null);
  const savingRef = useRef(false);
  const lastGoodRef = useRef(null);
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  async function fetchBoard(initial) {
    try {
      const res = await apiGet(`/api/public-board/${token}`);
      lastGoodRef.current = res.board;
      setState((prev) => {
        if (!initial && prev.board && JSON.stringify(prev.board) === JSON.stringify(res.board)) return prev;
        return {
          ...prev, loading: false, error: '', gone: false, board: res.board, canEdit: !!res.canEdit,
          ownerName: res.ownerName || '', isOwner: !!res.isOwner, alreadyLinked: !!res.alreadyLinked,
        };
      });
      if (onSeenRef.current) onSeenRef.current({ name: res.board.name, ownerName: res.ownerName || '' });
    } catch (e) {
      if (initial) setState((prev) => ({ ...prev, loading: false, error: e.message || 'Link inválido.', gone: e.status === 404, board: null }));
      else if (e.status === 404) setState((prev) => ({ ...prev, gone: true, error: e.message || 'Link inválido.', board: null }));
      // falha de rede num recarregamento: mantém o que já está na tela
    }
  }

  useEffect(() => {
    (async () => {
      if (!embedded) {
        try {
          const me = await apiGet('/api/auth/me');
          if (me && me.user) setViewerUser(me.user);
        } catch (e) { /* anônimo */ }
      }
      await fetchBoard(true);
    })();
    if (!embedded) return undefined;
    const t = setInterval(() => {
      if (document.hidden || saveTimer.current || savingRef.current) return;
      fetchBoard(false);
    }, 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function persistDebounced(nextBoard) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      savingRef.current = true;
      apiPatch(`/api/public-board/${token}`, { board: nextBoard })
        .then(() => { lastGoodRef.current = nextBoard; setSaveState('saved'); })
        .catch(() => { setSaveState('error'); setState((s) => ({ ...s, board: lastGoodRef.current })); })
        .finally(() => { savingRef.current = false; });
    }, 500);
  }
  function mutateBoard(updater) {
    setState((prev) => {
      const displayed = { ...prev.board, viewPrefs: prev.localViewPrefs || prev.board.viewPrefs };
      const nextWrapped = updater({ boards: [displayed] });
      const nextBoard = nextWrapped.boards[0];
      if (nextBoard === displayed) return prev;
      const { viewPrefs: nextPrefs, ...restNext } = nextBoard;
      const { viewPrefs: curPrefs, ...restCur } = displayed;
      const contentChanged = JSON.stringify(restNext) !== JSON.stringify(restCur);
      const ownerBoard = contentChanged ? { ...restNext, viewPrefs: prev.board.viewPrefs } : prev.board;
      if (contentChanged) persistDebounced(ownerBoard);
      return { ...prev, board: ownerBoard, localViewPrefs: JSON.stringify(nextPrefs) !== JSON.stringify(curPrefs) ? nextPrefs : prev.localViewPrefs };
    });
  }

  function openInMyBoard() {
    try { window.sessionStorage.setItem('pb-open-linked', token); } catch (e) { /* ignora */ }
    window.location.href = '/';
  }
  async function addToMyBoard() {
    setAdding(true);
    try {
      await apiPost('/api/personal-board/linked', { token });
      openInMyBoard();
    } catch (e) {
      notify(e.message || 'Não foi possível adicionar o quadro.', { tone: 'error' });
      setAdding(false);
    }
  }

  if (state.loading) return embedded ? <div style={{ ...S.emptyMuted, padding: '40px 24px' }}>Carregando o quadro compartilhado…</div> : <LoadingScreen theme={theme} />;

  if (state.error || !state.board) {
    const msg = state.error || 'Este link não existe mais ou o quadro deixou de ser público.';
    if (embedded) {
      return (
        <div style={{ ...S.emptyMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 24px' }}>
          <div>{state.gone ? 'Este quadro não está mais compartilhado (o dono deixou de compartilhar ou trocou o link).' : msg}</div>
          {onRemove && <button style={S.iconBtn} onClick={onRemove}><Trash2 size={14} /> Remover da minha lista</button>}
        </div>
      );
    }
    return (
      <div className="page-root" style={S.page}>
        <div style={S.loginWrap}>
          <div style={S.loginBox}>
            <h1 style={S.loginTitle}>Link indisponível</h1>
            <p style={S.loginSub}>{msg}</p>
            <a href="/" style={S.primaryBtn}>Ir para o início</a>
          </div>
        </div>
      </div>
    );
  }

  const wrappedBoard = { boards: [{ ...state.board, viewPrefs: state.localViewPrefs || state.board.viewPrefs }] };
  const viewer = viewerUser || { id: null, name: 'Visitante' };
  const canPin = !embedded && viewerUser && viewerUser.personalAccess && !state.isOwner;
  const publicAction = canPin ? (
    state.alreadyLinked
      ? <button style={S.primaryBtn} onClick={openInMyBoard}><Link2 size={14} /> Abrir no meu quadro</button>
      : <button title={adding ? 'Aguarde terminar de adicionar' : undefined} style={S.primaryBtn} disabled={adding} onClick={addToMyBoard}><Plus size={14} /> {adding ? 'Adicionando…' : 'Adicionar ao meu quadro'}</button>
  ) : null;

  return (
    <PersonalBoardScreen
      board={wrappedBoard}
      onMutate={mutateBoard}
      onExit={null}
      currentUser={viewer}
      onLogout={!embedded && viewerUser ? () => { apiPost('/api/auth/logout').finally(() => { window.location.href = '/'; }); } : null}
      theme={theme}
      onToggleTheme={onToggleTheme}
      saveState={state.canEdit ? saveState : 'idle'}
      publicMode
      embedded={embedded}
      publicAction={publicAction}
      readOnly={!state.canEdit}
      publicOwnerName={state.ownerName}
    />
  );
}
