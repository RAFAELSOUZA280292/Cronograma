// Vistas de uma empresa: Resumo, Tabela, Fases, Quadro (kanban), Gantt/linha do tempo, impressão e detalhe da atividade.
// Extraído de src/App.jsx (2026-10-16, "dividir o App.jsx"): carregado sob demanda (lazyRetry no App.jsx) para sair do pacote principal.
// O código é o mesmo de antes; o que vem do App.jsx é importado de lá (e lá foi exportado).

import { AddMenu, AttachmentList, CommentThread, ComposeBox } from '../ui/ComposeBox.jsx';
import { AlertTriangle, Building2, Check, ChevronDown, GripVertical, History, Lock, Maximize2, MessageSquare, Mic, MoreHorizontal, Paperclip, Plus, SlidersHorizontal, Trash2, Upload, Users, X } from 'lucide-react';
import { Button, IconButton, RecordSaveStatus, activate, activateRow } from '../ui/index.jsx';
import { DialogOverlay } from '../ui/dialog.jsx';
import LinkedTasks from '../meetings/LinkedTasks.jsx';
import { linkPatch, meetingAbove, pautaItems } from '../../shared/pauta.js';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import pricetaxLogoBranco from '../assets/brand/pricetax-logo-branco.png';
import { useEscClose } from '../lib/nav.js';
import { CLIENT_TYPE_META, ConfirmDiscardModal, MAX_ATTACHMENT_BYTES, PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER, TeamLinkBadge, addDays, calcDeadline, fmtDate, fmtTs, parseDate, sortActivities, startOfDay, toISODate, uid, useAutosaveTimestamp, useDebouncedField, useDirtyForm, useIsMobile, useMediaQuery } from '../App.jsx';
import { S } from '../styles/S.js';
import { SUB_EXTRAS_CSS, SubExtras, SubOutcome } from './SubExtras.jsx';
import { ActivityGauge } from './ActivityGauge.jsx';

const SUB_ROW_CSS = `
  .sub-row-card { transition:border-color .12s, box-shadow .12s; }
  .sub-row-card:hover { border-color:var(--border-3); box-shadow:0 1px 5px rgba(0,0,0,.10); }
  .sub-row-card .sub-drag-handle { opacity:.3; transition:opacity .12s; }
  .sub-row-card:hover .sub-drag-handle { opacity:.9; }
  .sub-row-card .sub-del-btn { opacity:.4; transition:opacity .12s, color .12s; }
  .sub-row-card:hover .sub-del-btn { opacity:1; }
  .sub-row-card .sub-del-btn:hover { color:#e5484d; }
  .sub-row-card .sub-title-input { background:transparent; border:1px solid transparent; padding:4px 6px; font-size:13px; border-radius:5px; }
  .sub-row-card textarea.sub-title-input { resize:none; overflow:hidden; line-height:1.4; font-family:inherit; display:block; box-sizing:border-box; min-height:28px; }
  .sub-row-card .sub-title-input:hover { background:var(--bg-3); }
  .sub-row-card .sub-title-input:focus { background:var(--bg-4); border-color:#F5C400; }
  .sub-row-card .sub-meta-select, .sub-row-card .sub-meta-date {
    font-size:11px; padding:4px 7px; border-radius:6px; background:var(--bg-3); border:1px solid var(--border-1); color:var(--text-4);
  }
  .sub-row-card .sub-meta-select:hover, .sub-row-card .sub-meta-date:hover { color:var(--text-2); border-color:var(--border-3); }
  .sub-row-card input[type=checkbox] { width:16px; height:16px; cursor:pointer; flex-shrink:0; }
  .ord-badge { cursor:pointer; border:0; font-family:inherit; line-height:1.2; transition:transform .12s, box-shadow .12s, filter .12s; }
  .ord-badge:hover { transform:translateY(-1px); box-shadow:0 2px 7px rgba(0,0,0,.4); filter:brightness(1.1); }
  .ord-badge:focus-visible { outline:2px solid var(--text-1); outline-offset:2px; }
  @media (max-width: 767px) { .ord-badge { min-height:32px; min-width:38px; } }
  .act-row .act-row-actions { opacity:.45; transition:opacity .12s; }
  .act-row:hover .act-row-actions, .act-row:focus-within .act-row-actions, .act-row .act-row-actions[data-open="true"] { opacity:1; }
  @media (hover:none) { .act-row .act-row-actions { opacity:1; } }
  .row-menu-btn:hover { background:var(--bg-3); color:var(--text-1); }
  .row-menu-btn:focus-visible, .row-menu-item:focus-visible { outline:2px solid #F5C400; outline-offset:-2px; }
  .row-menu-item:hover, .row-menu-item:focus { background:var(--bg-3); }
  ${SUB_EXTRAS_CSS}
`;

const TABLET_BP = 1024;

export function useIsCompact() { return useMediaQuery(`(max-width: ${TABLET_BP - 1}px)`); }

// Campo de texto de uma linha da Tabela com gravação por debounce (Onda 4): grava ~300 ms depois de parar de digitar e ao sair do campo,
// em vez de a cada tecla (cada tecla re-renderizava o projeto inteiro — §45). `onBlurLog` registra a linha no histórico como antes.
function DebouncedTextInput({ value, onCommit, onBlurLog, ...rest }) {
  const f = useDebouncedField(value || '', onCommit);
  return <input type="text" {...rest} value={f.draft} onChange={(e) => f.onChange(e.target.value)} onBlur={() => { f.flush(); if (onBlurLog) onBlurLog(); }} />;
}

// Selo "Empresas envolvidas" (v2) — só pra atividades do Master com o campo
// novo definido (involvedCompanyIds !== undefined); distinto do selo legado
// "Grupo inteiro"/"Várias empresas" (groupActivityId, mecanismo de cópia v1).
function involvedCompaniesLabel(a, groupInfo) {
  if (a.involvedCompanyIds === undefined || !groupInfo) return null;
  if (a.involvedCompanyIds.length === 0) return 'Geral do Grupo';
  const names = groupInfo.children.filter((c) => a.involvedCompanyIds.includes(c.id)).map((c) => c.name);
  return names.length ? names.join(', ') : 'Geral do Grupo';
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

function dayAfter(iso) {
  let d = addDays(parseDate(iso), 1);
  const dow = d.getDay();
  if (dow === 6) d = addDays(d, 2);
  else if (dow === 0) d = addDays(d, 1);
  return toISODate(d);
}

function dayBefore(iso) {
  let d = addDays(parseDate(iso), -1);
  const dow = d.getDay();
  if (dow === 0) d = addDays(d, -2);
  else if (dow === 6) d = addDays(d, -1);
  return toISODate(d);
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function endOfMonth(d) { return addDays(addMonths(startOfMonth(d), 1), -1); }

function startOfWeek(d) { const x = startOfDay(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; return addDays(x, diff); }

function fmtDayLabel(d) { return String(d.getDate()).padStart(2, '0'); }

function fmtDayFull(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

function fmtMonthYearLabel(d) { return `${MONTH_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`; }

function fmtWeekLabel(d) { return `sem. ${fmtDayFull(d)}`; }

function fmtMonthTitle(d) { const m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']; return `${m[d.getMonth()]} de ${d.getFullYear()}`; }

function buildTimelineColumns(granularity, activities, windowAnchor) {
  const dated = [];
  activities.forEach((a) => {
    if (a.date) dated.push(parseDate(a.date));
    if (a.endDate) dated.push(parseDate(a.endDate));
  });
  if (granularity === 'mes' || granularity === 'ano') {
    if (dated.length === 0) return [];
    const min = new Date(Math.min(...dated));
    const max = new Date(Math.max(...dated));
    const cols = [];
    if (granularity === 'mes') {
      let cur = startOfMonth(min);
      const end = startOfMonth(max);
      while (cur <= end) { cols.push({ key: toISODate(cur).slice(0, 7), start: cur, end: endOfMonth(cur), label: fmtMonthYearLabel(cur) }); cur = addMonths(cur, 1); }
    } else {
      for (let y = min.getFullYear(); y <= max.getFullYear(); y++) {
        const start = new Date(y, 0, 1);
        cols.push({ key: String(y), start, end: new Date(y, 11, 31), label: String(y) });
      }
    }
    return cols;
  }
  if (granularity === 'dia') {
    const start = startOfMonth(windowAnchor);
    const end = endOfMonth(windowAnchor);
    const cols = []; let cur = start;
    while (cur <= end) { cols.push({ key: toISODate(cur), start: cur, end: cur, label: fmtDayLabel(cur) }); cur = addDays(cur, 1); }
    return cols;
  }
  if (granularity === 'semana') {
    let cur = startOfWeek(addMonths(startOfMonth(windowAnchor), -1));
    const end = addMonths(windowAnchor, 2);
    const cols = [];
    while (cur <= end) { const wEnd = addDays(cur, 6); cols.push({ key: toISODate(cur), start: cur, end: wEnd, label: fmtWeekLabel(cur) }); cur = addDays(cur, 7); }
    return cols;
  }
  return [];
}

function colIndexFor(iso, columns) {
  if (!iso) return null;
  const d = parseDate(iso);
  for (let i = 0; i < columns.length; i++) {
    if (d >= columns[i].start && d <= columns[i].end) return i;
  }
  if (columns.length && d < columns[0].start) return 0;
  if (columns.length && d > columns[columns.length - 1].end) return columns.length - 1;
  return null;
}

function fractionInColumn(iso, col) {
  if (!iso || !col) return 0;
  const d = parseDate(iso);
  const span = (col.end - col.start) + 86400000;
  const pos = d - col.start;
  return Math.min(1, Math.max(0, pos / span));
}

function CompanyBadge({ name, color, logo, small }) {
  return (
    <div style={small ? S.companyBadgeSmall : S.companyBadge}>
      {logo ? <img src={logo} alt="" style={S.companyBadgeLogo} /> : <span style={{ ...S.companyColorDot, background: color || 'var(--text-8)' }} />}
      <span style={S.companyBadgeName}>{name}</span>
    </div>
  );
}

function StatusPill({ status, onClick }) {
  const meta = STATUS_META[status] || STATUS_META['nao-iniciado'];
  return (
    <div
      onClick={onClick}
      style={{ ...S.statusPill, color: meta.color, background: meta.bg, borderColor: meta.border, cursor: onClick ? 'pointer' : 'default' }}
    >
      {meta.label}
    </div>
  );
}

// Extraído do .map() de subatividades dentro de ActivityDetailModal pra
// poder usar useDebouncedField por linha sem violar Rules of Hooks — mesmo
// bug de digitação do PROJECT_CONTEXT.md §45/§46 (não coberto pelo fix do
// §45, que só tratou os 4 campos do nível principal da atividade).
// Selo "#N" da atividade na Tabela (2026-10-19): botão que ABRE a atividade, com a cor da fase (texto preto ou branco conforme o contraste).
const badgeInk = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#111';
  const n = parseInt(m[1], 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.4 ? '#111' : '#fff';
};
function OrderBadge({ n, title, color, phaseName, onOpen }) {
  const bg = /^#/.test(color || '') ? color : '#F5C400';
  return (
    <button type="button" className="ord-badge" onClick={onOpen} aria-label={`Abrir a atividade ${n}: ${title || 'sem título'}`} title={`Abrir atividade${phaseName ? ` · ${phaseName}` : ''}`} style={{ ...S.monthBadgeSm, background: bg, color: badgeInk(bg) }}>#{n}</button>
  );
}

function SubactivityRow({ s, pid, actId, dragSubId, setDragSubId, team, updateSub, deleteSub, reorderSub, allSubs, canEditExtras, meetings, onOpenMeeting, meetingConflicts, siblings }) {
  const pautaMeeting = s.pautaDe ? (siblings || []).find((x) => x.id === s.pautaDe && !x.deleted) : null;
  const aboveMeeting = s.kind !== 'reuniao' && !s.pautaDe ? meetingAbove(siblings, s.id) : null;
  const pautaCount = s.kind === 'reuniao' ? pautaItems(siblings, s.id).length : 0;
  const conflict = s.kind === 'reuniao' && !s.done ? (meetingConflicts || []).find((c) => c.items.some((i) => i.key === `${actId}#${s.id}`)) : null;
  const titleField = useDebouncedField(s.title, (v) => updateSub(pid, actId, s.id, { title: v }));
  // Título da subatividade quebra em linhas (cresce com o texto) em vez de cortar: o painel é largo e o nome inteiro precisa aparecer.
  const titleRef = useRef(null);
  const fit = () => { const el = titleRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
  useLayoutEffect(fit, [titleField.draft]);
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return (
    <div
      className="sub-row-card"
      style={{ ...S.subRowWrap, ...(dragSubId === s.id ? { opacity: .4 } : {}) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => { reorderSub(pid, actId, dragSubId, s.id); setDragSubId(null); }}
    >
      <div style={S.subRow}>
        <div className="sub-drag-handle" draggable onDragStart={() => setDragSubId(s.id)} onDragEnd={() => setDragSubId(null)} style={S.subDragHandle} title="Arraste para reordenar">
          <GripVertical size={13} color="var(--text-8)" />
        </div>
        <input type="checkbox" checked={s.done} onChange={(e) => updateSub(pid, actId, s.id, { done: e.target.checked })} />
        <textarea ref={titleRef} rows={1} className="sub-title-input" aria-label="Título da subatividade" value={titleField.draft} onChange={(e) => titleField.onChange(e.target.value)} onBlur={titleField.flush} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} style={{ ...S.subTitleInput, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
        <button aria-label="Excluir subatividade" title="Excluir subatividade" className="sub-del-btn" style={S.iconBtnGhost} onClick={() => deleteSub(pid, actId, s.id)}><X aria-hidden="true" size={13} /></button>
      </div>
      <div style={S.subMetaRow}>
        <select className="sub-meta-select" value={s.responsible || ''} onChange={(e) => updateSub(pid, actId, s.id, { responsible: e.target.value })} style={S.subMetaSelect} title="Responsável da subatividade">
          <option value="">Sem responsável</option>
          {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <input type="date" className="sub-meta-date" value={s.date || ''} onChange={(e) => updateSub(pid, actId, s.id, { date: e.target.value })} style={S.subMetaDate} title="Prazo da subatividade" />
        <select className="sub-meta-select" aria-label="Tipo da subatividade" value={s.kind === 'reuniao' ? 'reuniao' : 'trabalho'} onChange={(e) => updateSub(pid, actId, s.id, { kind: e.target.value })} style={s.kind === 'reuniao' ? { ...S.subMetaSelect, borderColor: 'var(--ui-accent, #F5C400)' } : S.subMetaSelect} title="Reunião = call com gente junto ao mesmo tempo. Trabalho = execução. Só reunião entra em Reservar na agenda, e só pode haver uma por dia na empresa.">
          <option value="trabalho">Trabalho</option>
          <option value="reuniao">Reunião</option>
        </select>
        <SubOutcome s={s} pid={pid} actId={actId} updateSub={updateSub} />
      </div>
      {s.kind !== 'reuniao' && !s.done && (pautaMeeting || aboveMeeting) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '4px 0 0 28px', fontSize: 11.5 }}>
          {pautaMeeting ? (
            <>
              <span style={{ color: 'var(--text-3)' }}>Pauta da reunião <b style={{ color: 'var(--text-1)' }}>{pautaMeeting.title}</b>{pautaMeeting.date ? ` · ${fmtDate(pautaMeeting.date)}` : ''} (a data acompanha a reunião)</span>
              <button type="button" className="sub-del-btn" style={{ ...S.iconBtnGhost, fontSize: 11, padding: '2px 8px' }} onClick={() => updateSub(pid, actId, s.id, { pautaDe: '' })} title="Desvincular da reunião (a data fica como está)">Desvincular</button>
            </>
          ) : (
            <button type="button" className="sub-del-btn" style={{ ...S.iconBtnGhost, fontSize: 11.5, padding: '3px 9px', color: 'var(--text-1)', fontWeight: 700 }} onClick={() => updateSub(pid, actId, s.id, linkPatch(aboveMeeting))} title={`Trata este item na mesma agenda da reunião "${aboveMeeting.title}" e usa a data dela${aboveMeeting.date ? '' : ' (a reunião ainda não tem data)'}`}>Tratar na reunião de cima{aboveMeeting.date ? ` (${fmtDate(aboveMeeting.date)})` : ''}</button>
          )}
        </div>
      )}
      {pautaCount > 0 && <div style={{ margin: '4px 0 0 28px', fontSize: 11.5, color: 'var(--text-3)' }}>Pauta: {pautaCount} {pautaCount === 1 ? 'item de trabalho vinculado' : 'itens de trabalho vinculados'}; a data deles acompanha esta reunião.</div>}
      {conflict && <div role="note" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, color: '#e0a21a', margin: '2px 0 0 28px', lineHeight: 1.4 }}><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /><span>Outra reunião neste mesmo dia ({fmtDate(conflict.day)}): {conflict.items.filter((i) => i.key !== `${actId}#${s.id}`).map((i) => i.title).join('; ')}. Só pode haver uma por dia.</span></div>}
      <SubExtras s={s} pid={pid} actId={actId} allSubs={allSubs} canEdit={canEditExtras} updateSub={updateSub} meetings={meetings} onOpenMeeting={onOpenMeeting} />
    </div>
  );
}

export function ActivityDetailModal({ meetingConflicts = [], activity: a, orderMap, phases, team, log, companyName, currentUser, pid, groupChildren, onClose, updateActivity, flushProjectSave, deleteActivity, addSub, updateSub, deleteSub, reorderSub, allSubs, addAttachments, removeAttachment, addComment, removeComment, updateComment, addLink, removeLink, toggleParticipant, meetings, onOpenLinkedTask, onOpenLinkedTasks, onOpenMeeting }) {
  const [dragSubId, setDragSubId] = useState(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [composeDirty, setComposeDirty] = useState(false);
  const [filesDragOver, setFilesDragOver] = useState(false);
  const composeRef = useRef(null);
  const [showTranscriptBox, setShowTranscriptBox] = useState(!!a.transcript);
  const phase = phases.find((p) => p.id === a.phase);
  const mentionCandidates = team.filter((m) => m.userId).map((m) => ({ id: m.userId, name: m.name }));
  const mentionNames = mentionCandidates.map((m) => m.name);
  const activityHistory = (log || []).filter((l) => l.activityId === a.id);
  const isMaster = !!currentUser && currentUser.role === 'master';
  const threadComments = [...(a.comments || [])].reverse().map((c) => (c.authorId || !c.author || !currentUser || c.author !== currentUser.name ? c : { ...c, authorId: currentUser.id }));

  // Observações (a.notes) viraram parte da Descrição (Onda 3): atividade antiga com observação junta o texto à descrição uma única vez.
  // Atividade de grupo tem a descrição sincronizada entre as empresas — lá a observação vira um comentário (que é independente), para não vazar para as irmãs.
  const notesMigratedRef = useRef(null);
  useEffect(() => {
    if (!a.notes || notesMigratedRef.current === a.id) return;
    notesMigratedRef.current = a.id;
    const notes = String(a.notes).trim();
    if (!notes) { updateActivity(pid, a.id, { notes: '' }); return; }
    if (a.groupActivityId) {
      const c = { id: uid('cm'), text: notes, ts: new Date().toISOString(), author: 'Observações anteriores', authorId: '', mentions: [], attachments: [], links: [] };
      updateActivity(pid, a.id, { notes: '', comments: [...(a.comments || []), c] }, 'Observações movidas para comentário');
      return;
    }
    const desc = a.desc || '';
    updateActivity(pid, a.id, { desc: desc + (desc ? '\n\n' : '') + notes, notes: '' }, 'Observações juntadas à descrição');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, a.notes]);

  function addFiles(fileList) { addAttachments(pid, a.id, [...(fileList || [])]); }

  function onPasteFiles(e) {
    if (e.defaultPrevented || (e.target && e.target.closest && e.target.closest('.cmp-box, .cmp-comment'))) return;
    const files = [...((e.clipboardData && e.clipboardData.items) || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  }

  function submitLink() {
    if (!linkUrlDraft.trim()) return;
    addLink(pid, a.id, { label: linkLabelDraft, url: linkUrlDraft });
    setLinkLabelDraft('');
    setLinkUrlDraft('');
    setShowLinkForm(false);
  }

  const isMobile = useIsMobile();
  const lastSavedAt = useAutosaveTimestamp(a);
  // Campos de autosave (título/descrição/observações/transcrição) — 2026-09-16:
  // corrigido pra exigir confirmação de fechamento (useDirtyForm) quando
  // editados, já que antes `hasDraft` só olhava rascunho de comentário/link.
  // 2026-09-17: além disso, corrigido o bug real "escrevo e o texto some" —
  // useDebouncedField (ver definição) mantém o campo local/responsivo e só
  // propaga pro resto do app (updateActivity, que refaz o render da árvore
  // inteira) 300ms depois da última tecla, não a cada tecla.
  const titleField = useDebouncedField(a.title, (v) => updateActivity(pid, a.id, { title: v }, `Título alterado: "${v}"`));
  const descField = useDebouncedField(a.desc, (v) => updateActivity(pid, a.id, { desc: v }, `Descrição alterada em "${titleField.draft}"`));
  const transcriptField = useDebouncedField(a.transcript || '', (v) => updateActivity(pid, a.id, { transcript: v }, `Transcrição de reunião atualizada em "${titleField.draft}"`));
  // "Não salvo" = só o que ainda não foi gravado: texto nos 300 ms antes do autosave e rascunhos de comentário/link ainda não enviados.
  // O que o autosave já gravou NÃO conta (antes a guarda comparava com o valor de quando o modal abriu e avisava à toa).
  const fieldsPending = titleField.draft !== a.title || descField.draft !== a.desc || transcriptField.draft !== (a.transcript || '');
  const hasDraft = fieldsPending || composeDirty || !!linkLabelDraft.trim() || !!linkUrlDraft.trim();
  useDirtyForm(hasDraft);
  const [showGuard, setShowGuard] = useState(false);
  const [closing, setClosing] = useState(false);
  function requestClose() { if (hasDraft) setShowGuard(true); else onClose(); }
  async function saveDraftsAndClose() {
    setClosing(true);
    titleField.flush(); descField.flush(); transcriptField.flush();
    if (linkUrlDraft.trim()) submitLink();
    if (composeRef.current && composeRef.current.isDirty()) {
      await composeRef.current.submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (composeRef.current && composeRef.current.isDirty()) { setClosing(false); setShowGuard(false); return; }
    }
    // Dá um tick pro React aplicar os setState acima antes de forçar o
    // flush — sem isso o flush pode rodar antes do mutateProject(comentário/
    // link) ter chegado a agendar o próprio PATCH.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (flushProjectSave) { try { await flushProjectSave(); } catch (e) { /* toast já mostrado por flushProjectSave */ } }
    setClosing(false);
    onClose();
  }
  function discardDraftsAndClose() {
    titleField.flush(); descField.flush(); transcriptField.flush();
    try { window.sessionStorage.removeItem(`cmp-draft:act:${a.id}`); } catch (e) { /* ignora */ }
    onClose();
  }

  return (
    <DialogOverlay className="no-print" style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClose={requestClose} history={false}>
      <style>{SUB_ROW_CSS}</style>
      <div style={{ ...S.detailBox, ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={S.detailTopLeft}>
            <span style={{ ...S.monthBadgeSm, background: phase?.color }}>#{orderMap[a.id]}</span>
            <span style={S.detailPhaseTag}><span style={{ ...S.timelineLaneDot, background: phase?.color }} />{phase?.name}</span>
            <RecordSaveStatus hasDraft={hasDraft} lastSavedAt={lastSavedAt} />
          </div>
          <button aria-label="Fechar" title="Fechar" style={S.iconBtnGhost} onClick={requestClose}><X aria-hidden="true" size={20} /></button>
        </div>

        <input
          type="text"
          value={titleField.draft}
          onChange={(e) => titleField.onChange(e.target.value)}
          onBlur={titleField.flush}
          style={S.detailTitleInput}
        />

        <div style={S.detailGrid} onPaste={onPasteFiles}>
          <div style={{ ...S.detailMain, ...(isMobile ? S.detailMainMobile : null) }}>
            <div style={S.subSectionLabel}>Descrição</div>
            <textarea value={descField.draft} onChange={(e) => descField.onChange(e.target.value)} onBlur={descField.flush} rows={3} placeholder="Contexto, decisões e observações desta atividade..." style={S.notesArea} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14, marginBottom: 6 }}>
              <span style={{ ...S.subSectionLabel, margin: 0 }}><Paperclip size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Anexos e links {(a.attachments || []).length + (a.links || []).length > 0 ? `(${(a.attachments || []).length + (a.links || []).length})` : ''}</span>
              <AddMenu onFiles={addFiles} onLink={() => setShowLinkForm(true)} accept="*/*" />
            </div>
            <div
              className={`cmp-box${filesDragOver ? ' drag' : ''}`}
              style={{ padding: 8 }}
              onDragOver={(e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setFilesDragOver(true); } }}
              onDragLeave={() => setFilesDragOver(false)}
              onDrop={(e) => { setFilesDragOver(false); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
            >
              <AttachmentList
                attachments={a.attachments || []} links={a.links || []}
                onRemoveAttachment={(id) => removeAttachment(pid, a.id, id)} onRemoveLink={(id) => removeLink(pid, a.id, id)}
              />
              {!(a.attachments || []).length && !(a.links || []).length && <div style={S.emptyMuted}>Nenhum anexo ou link ainda.</div>}
              {showLinkForm && (
                <div className="cmp-linkform">
                  <input type="text" value={linkLabelDraft} onChange={(e) => setLinkLabelDraft(e.target.value)} placeholder="Nome do link (opcional)" aria-label="Nome do link" />
                  <input type="text" value={linkUrlDraft} onChange={(e) => setLinkUrlDraft(e.target.value)} placeholder="https://..." aria-label="Endereço do link" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } }} autoFocus />
                  <Button size="sm" onClick={submitLink} disabled={!linkUrlDraft.trim()} disabledReason="Informe o endereço do link">Adicionar link</Button>
                  <IconButton size="sm" label="Cancelar link" icon={X} onClick={() => { setShowLinkForm(false); setLinkUrlDraft(''); setLinkLabelDraft(''); }} />
                </div>
              )}
              <div className="cmp-hint">Limite de {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB por arquivo · arraste arquivos aqui ou cole um print com Ctrl+V</div>
            </div>

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={12} style={{ verticalAlign: -2 }} />Transcrição de reunião
              {!showTranscriptBox && <button style={S.iconBtnGhost} onClick={() => setShowTranscriptBox('focus')} title="Adicionar transcrição"><Plus size={12} /></button>}
            </div>
            {!!showTranscriptBox && (
              <textarea
                value={transcriptField.draft}
                onChange={(e) => transcriptField.onChange(e.target.value)}
                onBlur={transcriptField.flush}
                rows={6}
                placeholder="Cole aqui a transcrição da reunião..."
                style={{ ...S.notesArea, fontFamily: 'monospace', fontSize: 11.5 }}
                autoFocus={showTranscriptBox === 'focus'}
              />
            )}

            <div className="sub-section" data-testid="subs-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 18, marginBottom: 6 }}>
                <span style={{ ...S.subSectionLabel, margin: 0 }}>Subatividades{(() => { const live = (a.subactivities || []).filter((x) => !x.deleted); return live.length ? ` (${live.filter((x) => x.done).length} de ${live.length} resolvidas)` : ''; })()}</span>
                <button style={S.addSubBtn} onClick={() => addSub(pid, a.id)}><Plus size={12} /> Subatividade</button>
              </div>
              <ActivityGauge activity={a} />
              <div style={S.subList}>
                {(a.subactivities || []).filter((s) => !s.deleted).map((s) => (
                  <SubactivityRow
                    key={s.id} s={s} pid={pid} actId={a.id}
                    dragSubId={dragSubId} setDragSubId={setDragSubId}
                    team={team} updateSub={updateSub} deleteSub={deleteSub} reorderSub={reorderSub}
                    allSubs={allSubs} canEditExtras={!!currentUser && (currentUser.role === 'master' || currentUser.role === 'pricetax')}
                    meetings={meetings} onOpenMeeting={onOpenMeeting} meetingConflicts={meetingConflicts} siblings={a.subactivities}
                  />
                ))}
                {!(a.subactivities || []).some((x) => !x.deleted) && <div style={S.emptyMuted}>Nenhuma subatividade ainda.</div>}
              </div>
            </div>
          </div>

          <div style={{ ...S.detailSide, ...(isMobile ? S.detailSideMobile : null) }}>
            <div style={S.subSectionLabel}>Tipo</div>
            <select aria-label="Tipo da atividade" value={a.kind === 'reuniao' ? 'reuniao' : 'trabalho'} onChange={(e) => updateActivity(pid, a.id, { kind: e.target.value }, `Tipo alterado em "${a.title}": ${e.target.value === 'reuniao' ? 'Reunião' : 'Trabalho'}`)}>
              <option value="trabalho">Trabalho (execução)</option>
              <option value="reuniao">Reunião (call)</option>
            </select>
            <div style={{ ...S.fieldHint, marginTop: 4 }}>Reunião = precisa de gente junto ao mesmo tempo. Só reunião entra em "Reservar na agenda", e só pode haver uma por dia na empresa. Os encontros de uma frente podem ser subatividades do tipo Reunião.</div>
            {(() => {
              const c = a.kind === 'reuniao' && a.status !== 'concluido' ? meetingConflicts.find((x) => x.items.some((i) => i.key === a.id)) : null;
              return c ? <div role="note" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: '#e0a21a', marginTop: 6, lineHeight: 1.4 }}><AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /><span>Outra reunião no mesmo dia ({fmtDate(c.day)}): {c.items.filter((i) => i.key !== a.id).map((i) => i.title).join('; ')}. Só pode haver uma por dia.</span></div> : null;
            })()}

            <div style={S.subSectionLabel}>Fase</div>
            <select value={a.phase} onChange={(e) => { const id = Number(e.target.value); updateActivity(pid, a.id, { phase: id }, `Fase alterada em "${a.title}": ${phases.find((p) => p.id === id)?.name}`); }}>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {groupChildren && groupChildren.length > 0 && (
              <>
                <div style={S.subSectionLabel}>Empresas envolvidas</div>
                <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 6 }}>
                  Deixe tudo desmarcado para atividade geral do grupo.
                </div>
                {groupChildren.map((c) => {
                  const involved = a.involvedCompanyIds || [];
                  const checked = involved.includes(c.id);
                  return (
                    <label key={c.id} style={S.cnpjCheckRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? involved.filter((id) => id !== c.id) : [...involved, c.id];
                          const names = groupChildren.filter((gc) => next.includes(gc.id)).map((gc) => gc.name);
                          updateActivity(pid, a.id, { involvedCompanyIds: next }, `Empresas envolvidas alteradas em "${a.title}": ${names.length ? names.join(', ') : 'Geral do Grupo'}`);
                        }}
                      />
                      {c.name}
                    </label>
                  );
                })}
              </>
            )}

            <div style={S.subSectionLabel}>Responsável</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={a.responsible} onChange={(e) => updateActivity(pid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1 }}>
                {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <TeamLinkBadge link={team.find((m) => m.name === a.responsible)} companyName={companyName} />
            </div>
            {(() => {
              const rm = team.find((m) => m.name === a.responsible);
              return rm && rm.area ? <div style={{ ...S.fieldHint, marginTop: 4 }}>Área: {rm.area}</div> : null;
            })()}

            <div style={S.subSectionLabel}>Participantes</div>
            <div style={S.participantChips}>
              {team.filter((m) => m.name !== a.responsible).map((m) => {
                const active = (a.participants || []).includes(m.name);
                return (
                  <button
                    key={m.id}
                    type="button"
                    style={{ ...S.participantChip, ...(active ? S.participantChipActive : {}) }}
                    onClick={() => toggleParticipant(pid, a.id, m.name)}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            <div style={S.subSectionLabel}>Prioridade</div>
            <select
              value={a.priority || ''}
              onChange={(e) => updateActivity(pid, a.id, { priority: e.target.value }, `Prioridade alterada em "${a.title}": ${e.target.value ? PRIORITY_META[e.target.value].label : 'sem prioridade'}`)}
              style={{ color: a.priority ? PRIORITY_META[a.priority].color : undefined }}
            >
              <option value="">Sem prioridade</option>
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>

            <div style={S.subSectionLabel}>Início</div>
            <input type="date" value={a.date} onChange={(e) => {
              const v = e.target.value;
              const patch = { date: v };
              if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
              else if (!a.endDate || a.endDate < v) patch.endDate = v;
              updateActivity(pid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
            }} />

            <div style={S.subSectionLabel}>Horário da reunião (opcional)</div>
            <input
              type="time"
              value={a.meetingTime || ''}
              onChange={(e) => updateActivity(pid, a.id, { meetingTime: e.target.value })}
              onBlur={() => updateActivity(pid, a.id, {}, `Horário da reunião alterado em "${a.title}": ${a.meetingTime || 'sem horário definido'}`)}
            />

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={!!a.clientDateConfirmed}
                onChange={(e) => updateActivity(pid, a.id, { clientDateConfirmed: e.target.checked }, `Data confirmada com o cliente ${e.target.checked ? 'marcada' : 'desmarcada'} em "${a.title}"`)}
              /> Data confirmada com o cliente?
            </div>

            <div style={S.subSectionLabel}>Prazo (dias)</div>
            <input
              type="number"
              min={1}
              placeholder="Ex.: 15"
              value={a.durationDays || ''}
              onChange={(e) => {
                const v = e.target.value;
                const patch = { durationDays: v ? Number(v) : '' };
                if (v && a.date) patch.endDate = calcDeadline(a.date, v);
                updateActivity(pid, a.id, patch);
              }}
              onBlur={() => updateActivity(pid, a.id, {}, `Prazo alterado em "${a.title}": ${a.durationDays ? a.durationDays + ' dias' : 'sem prazo definido'}`)}
            />

            <div style={S.subSectionLabel}>Fim</div>
            <input type="date" value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(pid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, cursor: 'pointer' }} title="Datas travadas não acompanham o ajuste automático de datas">
              <input type="checkbox" checked={!!a.dateLocked} onChange={(e) => updateActivity(pid, a.id, { dateLocked: e.target.checked }, `Data ${e.target.checked ? 'travada' : 'destravada'} em "${a.title}"`)} /> Travar a data (ajuste automático)
            </label>

            <div style={{ ...S.subSectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={a.required} onChange={(e) => updateActivity(pid, a.id, { required: e.target.checked }, `Obrigatoriedade alterada em "${a.title}"`)} /> Obrigatória
            </div>

            <div style={S.subSectionLabel}>Status</div>
            <select value={a.status} onChange={(e) => updateActivity(pid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ color: STATUS_META[a.status].color }}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>

            <div style={S.subSectionLabel}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários {(a.comments || []).length > 0 ? `(${(a.comments || []).length})` : ''}</div>
            <ComposeBox
              ref={composeRef}
              draftKey={`act:${a.id}`}
              mentionCandidates={mentionCandidates}
              maxFileBytes={MAX_ATTACHMENT_BYTES}
              submitLabel="Comentar"
              placeholder="Escreva um comentário…"
              onDirtyChange={setComposeDirty}
              onSubmit={async ({ text, mentions, attachments, links }) => { addComment(pid, a.id, text, mentions, attachments, links); }}
            />
            <div style={{ marginTop: 10 }}>
              <CommentThread
                comments={threadComments}
                currentUserId={currentUser ? currentUser.id : ''}
                canModerate={isMaster}
                mentionNames={mentionNames}
                onEdit={(id, text) => updateComment(pid, a.id, id, text)}
                onDelete={(id) => removeComment(pid, a.id, id)}
              />
            </div>

            <div style={{ ...S.subSectionLabel, marginTop: 18 }}><History size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Histórico desta atividade</div>
            <div style={S.historyList}>
              {activityHistory.length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
              {activityHistory.map((l, i) => (
                <div key={i} style={S.logRow}>
                  <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
                  <div style={S.logAction}>{l.action}</div>
                </div>
              ))}
            </div>

            <LinkedTasks meetings={meetings} activityId={a.id} activity={a} labelStyle={S.subSectionLabel} onOpenTask={onOpenLinkedTask} onOpenAll={onOpenLinkedTasks} />

            <button style={{ ...S.iconBtn, marginTop: 20, color: '#e2574c', borderColor: 'rgba(226,87,76,.35)' }} onClick={() => deleteActivity(pid, a.id)}><Trash2 size={14} /> Excluir atividade</button>
          </div>
        </div>
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={saveDraftsAndClose}
          onDiscard={discardDraftsAndClose}
          onCancel={() => setShowGuard(false)}
          saving={closing}
        />
      )}
    </DialogOverlay>
  );
}

// Cores literais fixas — nunca var(--...) — porque o relatório sempre
// imprime no padrão visual PRICETAX (fundo navy + amarelo da marca),
// independente do tema claro/escuro ativo na tela. Paleta extraída direto
// dos materiais oficiais da PRICETAX (deck de apresentação/kit de marca):
// navy #0B0E1A/#161B2E/#1D2338, amarelo #FEDC04, verde #3DDC84 (positivo),
// coral #FF6B6B (negativo/atraso), azul #5B8DEF (informativo).
const PRINT_STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: '#B8BCC8', bg: 'rgba(184,188,200,.14)' },
  'em-andamento': { label: 'Em andamento', color: '#FEDC04', bg: 'rgba(254,220,4,.16)' },
  pausado: { label: 'Pausado', color: '#F0954D', bg: 'rgba(240,149,77,.16)' },
  concluido: { label: 'Concluído', color: '#3DDC84', bg: 'rgba(61,220,132,.16)' },
};

const PRINT_COUNTDOWN_TONE_META = {
  ok: { color: '#3DDC84', bg: 'rgba(61,220,132,.14)' },
  warn: { color: '#FEDC04', bg: 'rgba(254,220,4,.16)' },
  soon: { color: '#F0954D', bg: 'rgba(240,149,77,.16)' },
  today: { color: '#5B8DEF', bg: 'rgba(91,141,239,.20)' },
  overdue: { color: '#FF6B6B', bg: 'rgba(255,107,107,.16)' },
  done: { color: '#B8BCC8', bg: 'rgba(184,188,200,.12)' },
  none: { color: '#7B8098', bg: 'rgba(123,128,152,.12)' },
};

const PRINT_REPORT_CSS = `
  .print-report { display: none; }
  @media print {
    @page { size: landscape; margin: 10mm; }
    .print-report { display: block !important; }
    body, .page-root { background: #0B0E1A !important; color: #FFFFFF !important; }
  }
  .print-report, .print-report * { box-sizing: border-box; }
  .print-report { font-family: 'Arial', 'Helvetica', 'Inter', sans-serif; color: #FFFFFF; background: #0B0E1A; }
  .pr-page { page-break-after: always; background: #0B0E1A; padding: 6mm; }
  .pr-page:last-child { page-break-after: auto; }
  .pr-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #FEDC04; padding-bottom: 12px; margin-bottom: 18px; }
  .pr-header-left { display: flex; align-items: center; gap: 12px; }
  .pr-header-logo-chip { background: #FFFFFF; border-radius: 4px; padding: 5px 9px; display: flex; align-items: center; }
  .pr-header-logo { width: 34px; height: 34px; object-fit: contain; display: block; }
  .pr-eyebrow { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #FEDC04; font-weight: 700; }
  .pr-company-name { font-size: 22px; font-weight: 800; margin-top: 3px; color: #FFFFFF; }
  .pr-company-meta { font-size: 11px; color: #B8BCC8; margin-top: 3px; }
  .pr-header-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .pr-header-brand { height: 20px; object-fit: contain; }
  .pr-header-meta { font-size: 10.5px; color: #B8BCC8; white-space: nowrap; }
  .pr-block { margin-bottom: 16px; page-break-inside: avoid; }
  .pr-block-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 9px; color: #FFFFFF; }
  .pr-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .pr-kpi { background: #161B2E; border: 1px solid #262C46; border-radius: 4px; padding: 11px 14px; }
  .pr-kpi-num { font-size: 26px; font-weight: 800; line-height: 1; }
  .pr-kpi-label { font-size: 10px; color: #B8BCC8; margin-top: 5px; text-transform: uppercase; letter-spacing: .03em; }
  .pr-progress-row { display: flex; align-items: center; gap: 12px; }
  .pr-progress-track { flex: 1; height: 12px; background: #1D2338; border-radius: 3px; overflow: hidden; }
  .pr-progress-fill { height: 100%; background: #FEDC04; }
  .pr-progress-pct { font-size: 17px; font-weight: 800; width: 56px; text-align: right; color: #FEDC04; }
  .pr-phases-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 28px; }
  .pr-phase-row { display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .pr-phase-name { width: 160px; flex-shrink: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #FFFFFF; }
  .pr-phase-track { flex: 1; height: 7px; background: #1D2338; border-radius: 3px; overflow: hidden; }
  .pr-phase-fill { height: 100%; }
  .pr-phase-pct { width: 34px; text-align: right; font-weight: 700; font-size: 10.5px; color: #B8BCC8; }
  .pr-table-wrap { border: 1px solid #262C46; border-radius: 4px; overflow: hidden; }
  .pr-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .pr-table th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #B8BCC8; border-bottom: 1px solid #262C46; padding: 7px 10px; background: #1D2338; }
  .pr-table td { padding: 7px 10px; border-bottom: 1px solid #1D2338; vertical-align: top; color: #FFFFFF; }
  .pr-table tr:last-child td { border-bottom: none; }
  .pr-status-pill, .pr-countdown-pill { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: 9.5px; font-weight: 700; white-space: nowrap; }
  .pr-empty-row td { color: #7B8098; font-style: italic; }
  .pr-footer { margin-top: 8px; padding-top: 10px; border-top: 1px solid #262C46; font-size: 9.5px; color: #7B8098; display: flex; justify-content: space-between; }
`;

function PrintActivityTable({ rows, phases }) {
  return (
    <div className="pr-table-wrap">
      <table className="pr-table">
        <thead>
          <tr>
            <th>Atividade</th>
            <th>Responsável</th>
            <th>Fase</th>
            <th>Data</th>
            <th>Contagem</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="pr-empty-row"><td colSpan={6}>Nenhuma atividade nesta lista.</td></tr>
          )}
          {rows.map((a) => {
            const phase = phases.find((p) => p.id === a.phase);
            const statusMeta = PRINT_STATUS_META[a.status] || PRINT_STATUS_META['nao-iniciado'];
            const cd = resumoCountdown(a, toISODate(startOfDay(new Date())));
            const tone = PRINT_COUNTDOWN_TONE_META[cd.tone];
            return (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.responsible || '—'}</td>
                <td>{phase ? phase.name : '—'}</td>
                <td>{resumoDateLabel(a)}{a.meetingTime ? ` às ${a.meetingTime}` : ''}</td>
                <td><span className="pr-countdown-pill" style={{ background: tone.bg, color: tone.color }}>{cd.label}</span></td>
                <td><span className="pr-status-pill" style={{ background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Relatório dedicado para exportação em PDF (window.print(), modo paisagem) —
// não é "o que está na tela agora": tem seu próprio layout de KPIs/progresso/
// próximas etapas, no padrão visual PRICETAX (navy + amarelo da marca, ver
// PRINT_STATUS_META acima), pensado pra ser mostrado ao gestor do cliente.
// Fica display:none na tela o tempo todo, só aparece dentro de @media print
// (ver PRINT_REPORT_CSS) enquanto o resto da UI (.no-print) some.
export function PrintReport({ projects, generatedAt }) {
  const todayISO = toISODate(startOfDay(new Date()));
  return (
    <div className="print-report">
      <style>{PRINT_REPORT_CSS}</style>
      {projects.map((p, i) => {
        const activities = (p.activities || []).filter((a) => !a.deleted);
        const total = activities.length;
        const doneCount = activities.filter((a) => a.status === 'concluido').length;
        const emAndamentoCount = activities.filter((a) => a.status === 'em-andamento').length;
        const pct = total ? Math.round((doneCount / total) * 100) : 0;
        const isOverdue = (a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < todayISO;
        // sortActivities() é a mesma função usada pra montar activitiesSorted
        // em App() (fonte da ordem da aba Tabela) — reaproveitada aqui ao
        // pé da letra, não só "parecida", pra garantir que atrasadas +
        // próximas em sequência reproduzam exatamente a ordem da Tabela
        // (inclusive a regra de sem-data ir sempre por último).
        const overdue = sortActivities(activities.filter(isOverdue));
        const upcoming = sortActivities(activities.filter((a) => !isOverdue(a) && a.status !== 'concluido'));
        const companyName = p.company.nomeFantasia || p.company.name || 'Empresa sem nome';
        return (
          <div className="pr-page" key={p.id}>
            <div className="pr-header">
              <div className="pr-header-left">
                {p.company.logo && (
                  <div className="pr-header-logo-chip"><img className="pr-header-logo" src={p.company.logo} alt="" /></div>
                )}
                <div>
                  <div className="pr-eyebrow">Relatório de acompanhamento</div>
                  <div className="pr-company-name">{companyName}</div>
                  <div className="pr-company-meta">
                    {p.company.cnpj ? `CNPJ ${p.company.cnpj}` : 'CNPJ não informado'}
                    {p.company.regimeTributario ? ` · ${p.company.regimeTributario}` : ''}
                    {p.company.clientType && CLIENT_TYPE_META[p.company.clientType] ? ` · ${CLIENT_TYPE_META[p.company.clientType].label}` : ''}
                  </div>
                </div>
              </div>
              <div className="pr-header-right">
                <img className="pr-header-brand" src={pricetaxLogoBranco} alt="PriceTax" />
                <div className="pr-header-meta">
                  Gerado em {generatedAt}
                  {projects.length > 1 ? <div>{i + 1} de {projects.length}</div> : null}
                </div>
              </div>
            </div>

            <div className="pr-block">
              <div className="pr-kpis">
                <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: '#FEDC04' }}>{total}</div><div className="pr-kpi-label">Atividades no total</div></div>
                <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: '#3DDC84' }}>{doneCount}</div><div className="pr-kpi-label">Concluídas</div></div>
                <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: '#B8BCC8' }}>{emAndamentoCount}</div><div className="pr-kpi-label">Em andamento</div></div>
                <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: overdue.length ? '#FF6B6B' : '#FFFFFF' }}>{overdue.length}</div><div className="pr-kpi-label">Em atraso</div></div>
              </div>
            </div>

            <div className="pr-block">
              <div className="pr-block-title">Progresso geral</div>
              <div className="pr-progress-row">
                <div className="pr-progress-track"><div className="pr-progress-fill" style={{ width: `${pct}%` }} /></div>
                <div className="pr-progress-pct">{pct}%</div>
              </div>
            </div>

            <div className="pr-block">
              <div className="pr-block-title">Progresso por fase</div>
              <div className="pr-phases-grid">
                {p.phases.map((ph) => {
                  const phaseActs = activities.filter((a) => a.phase === ph.id);
                  const phasePct = phaseActs.length ? Math.round((phaseActs.filter((a) => a.status === 'concluido').length / phaseActs.length) * 100) : 0;
                  return (
                    <div className="pr-phase-row" key={ph.id}>
                      <div className="pr-phase-name">{ph.name}</div>
                      <div className="pr-phase-track"><div className="pr-phase-fill" style={{ width: `${phasePct}%`, background: ph.color || '#FEDC04' }} /></div>
                      <div className="pr-phase-pct">{phasePct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {overdue.length > 0 && (
              <div className="pr-block">
                <div className="pr-block-title" style={{ color: '#FF6B6B' }}>Em atraso ({overdue.length})</div>
                <PrintActivityTable rows={overdue} phases={p.phases} />
              </div>
            )}

            <div className="pr-block">
              <div className="pr-block-title">Próximas etapas</div>
              <PrintActivityTable rows={upcoming} phases={p.phases} />
            </div>

            <div className="pr-footer">
              <span>PRICETAX · Cronograma de Reforma Tributária</span>
              <span>{companyName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Aba RESUMO (2026-08) — visão executiva de consulta/acompanhamento, não de
// edição. Reaproveita 100% do modelo de dados já existente (activity/phase/
// responsible/status/subactivities) — nenhum campo novo, nenhuma tabela nova.
// "Atrasado" aqui é sempre derivado de data x hoje, nunca um status gravado
// (mesmo espírito do isOverdue() do PhasesView/PrintReport) — abrir a
// atividade continua usando o mesmo ActivityDetailModal de sempre via
// openDetail(), sem nenhuma edição própria nessa tela.
const COUNTDOWN_TONE_META = {
  ok: { color: '#3ecf6e', bg: 'rgba(62,207,110,.14)' },
  warn: { color: '#c9a227', bg: 'rgba(201,162,39,.16)' },
  soon: { color: '#ff9f40', bg: 'rgba(255,159,64,.16)' },
  today: { color: '#3ea6ff', bg: 'rgba(62,166,255,.20)' },
  overdue: { color: '#e2574c', bg: 'rgba(226,87,76,.16)' },
  done: { color: 'var(--text-5)', bg: 'var(--border-1)' },
  none: { color: 'var(--text-6)', bg: 'var(--border-1)' },
};

const RESUMO_QUICK_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'proximos7', label: 'Próximos 7 dias' },
  { value: 'proximos30', label: 'Próximos 30 dias' },
  { value: 'em-andamento', label: 'Em andamento' },
  { value: 'nao-iniciado', label: 'Não iniciadas' },
  { value: 'concluidas', label: 'Concluídas' },
];

const RESUMO_MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function resumoMonthLabel(key) {
  if (!key) return 'Sem data definida';
  const [y, m] = key.split('-').map(Number);
  return `${RESUMO_MONTH_NAMES[m - 1]}/${y}`;
}

function resumoCountdown(a, todayISO) {
  if (a.status === 'concluido') return { label: 'Concluído', tone: 'done' };
  const deadline = a.endDate || a.date;
  if (!deadline) return { label: 'Sem prazo', tone: 'none' };
  const diff = Math.round((parseDate(deadline) - parseDate(todayISO)) / 86400000);
  if (diff < 0) return { label: `Atrasado ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`, tone: 'overdue' };
  if (diff === 0) return { label: 'Hoje', tone: 'today' };
  if (diff === 1) return { label: 'Amanhã', tone: 'soon' };
  if (diff <= 6) return { label: `D-${diff}`, tone: 'soon' };
  if (diff <= 15) return { label: `D-${diff}`, tone: 'warn' };
  return { label: `D-${diff}`, tone: 'ok' };
}

function resumoDateLabel(a) {
  if (!a.date && !a.endDate) return '—';
  if (a.date && a.endDate && a.endDate !== a.date) return `${fmtDayFull(parseDate(a.date))} → ${fmtDayFull(parseDate(a.endDate))}`;
  return fmtDate(a.endDate || a.date);
}

// Chip "N tarefas · M abertas": usado no Resumo e na Tabela, então o CSS é injetado pelas duas telas.
const TASK_CHIP_CSS = `
  .rs-task-chip { margin-top: 4px; font-size: 10.5px; font-weight: 700; color: var(--text-4); background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 999px; padding: 2px 9px; cursor: pointer; }
  .rs-task-chip:hover { color: var(--text-1); border-color: var(--border-3); }
  .rs-task-chip:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
  @media (max-width: 767px) { .rs-task-chip { min-height: 44px; padding: 2px 14px; } }
`;

const RESUMO_CSS = `
  .resumo-view { padding-bottom: 24px; }
  .rs-title { font-size: 22px; font-weight: 800; letter-spacing: .02em; margin: 0 0 16px; color: var(--text-1); }
  .rs-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .rs-kpi { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 10px; padding: 12px 14px; }
  .rs-kpi-num { font-size: 22px; font-weight: 800; color: var(--text-1); line-height: 1; }
  .rs-kpi-label { font-size: 10.5px; color: var(--text-5); margin-top: 6px; }
  .rs-kpi-next { cursor: pointer; background: var(--bg-3); min-width: 168px; }
  .rs-kpi-next-label { font-size: 10px; color: var(--text-5); text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
  .rs-kpi-next-title { font-size: 12.5px; font-weight: 700; color: var(--text-1); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rs-kpi-next-meta { font-size: 11px; color: var(--text-5); margin-top: 3px; }
  .rs-empty-inline { font-size: 11.5px; color: var(--text-6); margin-top: 6px; }
  .rs-progress-block { margin-bottom: 20px; }
  .rs-progress-head { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 6px; }
  .rs-progress-pct { font-weight: 800; }
  .rs-progress-track { height: 10px; background: var(--border-1); border-radius: 999px; overflow: hidden; }
  .rs-progress-fill { height: 100%; border-radius: 999px; }
  .rs-toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .rs-quickfilters { display: flex; flex-wrap: wrap; gap: 6px; }
  .rs-chip { font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-4); cursor: pointer; }
  .rs-chip-active { background: var(--text-1); color: var(--bg-1); border-color: var(--text-1); }
  .rs-selects { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .rs-selects select { font-size: 11.5px; width: auto; }
  .rs-group-toggle { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-4); cursor: pointer; }
  .rs-table-wrap { overflow-x: auto; border: 1px solid var(--border-1); border-radius: 10px; }
  .rs-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .rs-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-6); padding: 10px 12px; border-bottom: 1px solid var(--border-1); background: var(--bg-2); white-space: nowrap; }
  .rs-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-1); vertical-align: top; }
  .rs-row { cursor: pointer; }
  .rs-row:hover { background: var(--bg-3); }
  .rs-td-activity { display: flex; gap: 8px; max-width: 340px; }
  .rs-activity-num { font-size: 10.5px; color: var(--text-6); font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .rs-activity-main { min-width: 0; }
  .rs-activity-title { font-weight: 700; color: var(--text-1); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rs-activity-desc { font-size: 11px; color: var(--text-5); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rs-activity-subs { font-size: 10.5px; color: var(--text-6); margin-top: 3px; }
  .rs-resp { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); white-space: nowrap; }
  .rs-avatar { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #111; flex-shrink: 0; }
  .rs-phase-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
  .rs-date-cell { font-size: 12px; color: var(--text-3); white-space: nowrap; }
  .rs-meeting-time { color: var(--text-5); }
  .rs-confirmed-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; margin-left: 6px; color: var(--ui-ok); background: rgba(62,207,110,.14); border: 1px solid rgba(62,207,110,.5); }
  .rs-countdown-pill { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .rs-status-pill { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
  .rs-empty-row td { text-align: center; color: var(--text-6); font-style: italic; }
  .rs-month-group { margin-bottom: 14px; }
  .rs-month-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: none; padding: 8px 4px; font-size: 12px; font-weight: 800; letter-spacing: .04em; color: var(--text-4); cursor: pointer; text-transform: uppercase; }
  .rs-month-count { margin-left: auto; font-size: 10.5px; color: var(--text-6); font-weight: 600; text-transform: none; }
  .rs-cards { display: flex; flex-direction: column; gap: 8px; }
  .rs-card { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 10px; padding: 12px; cursor: pointer; }
  .rs-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .rs-card-title-wrap { display: flex; gap: 6px; min-width: 0; }
  .rs-card-title { font-weight: 700; font-size: 13px; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rs-card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .rs-card-secondary { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-1); }
  .rs-empty { text-align: center; padding: 40px 0; color: var(--text-6); font-size: 13px; }
  @media (max-width: 767px) { .rs-selects select { min-height: 44px; } .rs-group-toggle { min-height: 44px; } }
  @media (min-width: 768px) and (max-width: 1023px), (min-width: 768px) and (pointer: coarse) { .rs-group-toggle { min-height: 44px; } }
`;

function TaskCountChip({ counts, onOpenTasks, style }) {
  if (!counts || !counts.total) return null;
  return (
    <button type="button" className="rs-task-chip" style={style} onClick={(e) => { e.stopPropagation(); onOpenTasks(); }} title="Ver as tarefas de reunião vinculadas a esta atividade">
      {counts.total} tarefa{counts.total === 1 ? '' : 's'} · {counts.open} aberta{counts.open === 1 ? '' : 's'}
    </button>
  );
}

function ResumoTable({ rows, orderMap, phases, accent, todayISO, onOpen, taskCounts, onOpenTasks }) {
  return (
    <div className="rs-table-wrap">
      <table className="rs-table">
        <thead>
          <tr>
            <th>Atividade</th>
            <th>Responsável</th>
            <th>Fase</th>
            <th>Data</th>
            <th>Contagem</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr className="rs-empty-row"><td colSpan={6}>Nenhuma atividade encontrada com esses filtros.</td></tr>}
          {rows.map((a) => {
            const phase = phases.find((p) => p.id === a.phase);
            const cd = resumoCountdown(a, todayISO);
            const tone = COUNTDOWN_TONE_META[cd.tone];
            const statusMeta = STATUS_META[a.status];
            const subs = (a.subactivities || []).filter((s) => !s.deleted);
            const doneSubs = subs.filter((s) => s.done).length;
            return (
              <tr key={a.id} className="rs-row" {...activateRow(() => onOpen(a.id))}>
                <td>
                  <div className="rs-td-activity">
                    <div className="rs-activity-num">#{orderMap[a.id]}</div>
                    <div className="rs-activity-main">
                      <div className="rs-activity-title" title={a.title}>{a.title}</div>
                      {a.desc ? <div className="rs-activity-desc" title={a.desc}>{a.desc}</div> : null}
                      {subs.length > 0 && <div className="rs-activity-subs">{doneSubs}/{subs.length} subatividades</div>}
                      <TaskCountChip counts={taskCounts && taskCounts[a.id]} onOpenTasks={() => onOpenTasks(a.id)} />
                    </div>
                  </div>
                </td>
                <td><div className="rs-resp"><span className="rs-avatar" style={{ background: accent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>{a.responsible || '—'}</div></td>
                <td>{phase ? <span className="rs-phase-tag" style={{ borderColor: phase.color, color: phase.color }}>{phase.name}</span> : '—'}</td>
                <td className="rs-date-cell">
                  {resumoDateLabel(a)}
                  {a.meetingTime && <span className="rs-meeting-time"> às {a.meetingTime}</span>}
                  {a.clientDateConfirmed && <span className="rs-confirmed-badge" title="Data confirmada com o cliente"><Check size={10} /> Confirmado c/ cliente</span>}
                </td>
                <td><span className="rs-countdown-pill" style={{ color: tone.color, background: tone.bg }}>{cd.label}</span></td>
                <td><span className="rs-status-pill" style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}>{statusMeta.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResumoCard({ a, orderMap, phases, accent, todayISO, onOpen, taskCounts, onOpenTasks }) {
  const phase = phases.find((p) => p.id === a.phase);
  const cd = resumoCountdown(a, todayISO);
  const tone = COUNTDOWN_TONE_META[cd.tone];
  const statusMeta = STATUS_META[a.status];
  const subs = (a.subactivities || []).filter((s) => !s.deleted);
  const doneSubs = subs.filter((s) => s.done).length;
  return (
    <div className="rs-card" onClick={onOpen}>
      <div className="rs-card-top">
        <div className="rs-card-title-wrap">
          <span className="rs-activity-num">#{orderMap[a.id]}</span>
          <span className="rs-card-title">{a.title}</span>
        </div>
        <span className="rs-countdown-pill" style={{ color: tone.color, background: tone.bg }}>{cd.label}</span>
      </div>
      {subs.length > 0 && <div className="rs-activity-subs">{doneSubs}/{subs.length} subatividades</div>}
      <TaskCountChip counts={taskCounts && taskCounts[a.id]} onOpenTasks={() => onOpenTasks(a.id)} />
      <div className="rs-card-bottom">
        <span className="rs-date-cell">
          {resumoDateLabel(a)}
          {a.meetingTime && <span className="rs-meeting-time"> às {a.meetingTime}</span>}
        </span>
        <span className="rs-status-pill" style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}>{statusMeta.label}</span>
      </div>
      {a.clientDateConfirmed && (
        <div style={{ marginTop: 6 }}>
          <span className="rs-confirmed-badge" title="Data confirmada com o cliente"><Check size={10} /> Confirmado c/ cliente</span>
        </div>
      )}
      <div className="rs-card-secondary">
        <span className="rs-resp"><span className="rs-avatar" style={{ background: accent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>{a.responsible || '—'}</span>
        {phase && <span className="rs-phase-tag" style={{ borderColor: phase.color, color: phase.color }}>{phase.name}</span>}
      </div>
    </div>
  );
}

export function ResumoView({ activities, orderMap, phases, pid, openDetail, companyColor, taskCounts, onOpenTasks }) {
  const isMobile = useIsMobile();
  const accent = companyColor || '#F5C400';
  const todayISO = toISODate(startOfDay(new Date()));

  const [quickFilter, setQuickFilter] = useState('todas');
  const [filterResp, setFilterResp] = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [sortMode, setSortMode] = useState('auto');
  const [groupByMonth, setGroupByMonth] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState({});

  const total = activities.length;
  const concluidas = activities.filter((a) => a.status === 'concluido').length;
  const emAndamento = activities.filter((a) => a.status === 'em-andamento').length;
  const naoIniciadas = activities.filter((a) => a.status === 'nao-iniciado').length;
  const pausadas = activities.filter((a) => a.status === 'pausado').length;
  const atrasadas = activities.filter((a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < todayISO).length;
  const proximas7 = activities.filter((a) => {
    if (a.status === 'concluido') return false;
    const d = a.endDate || a.date;
    if (!d) return false;
    const diff = Math.round((parseDate(d) - parseDate(todayISO)) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;
  const progress = total ? Math.round((concluidas / total) * 100) : 0;

  const nextActivity = (() => {
    const pending = activities.filter((a) => (a.date || a.endDate) && a.status !== 'concluido');
    const upcoming = pending.filter((a) => (a.endDate || a.date) >= todayISO).sort((a, b) => (a.endDate || a.date).localeCompare(b.endDate || b.date));
    if (upcoming.length) return upcoming[0];
    return pending.slice().sort((a, b) => (a.endDate || a.date).localeCompare(b.endDate || b.date))[0] || null;
  })();

  const respOptions = Array.from(new Set(activities.map((a) => a.responsible).filter(Boolean)));
  const monthOptions = Array.from(new Set(activities.map((a) => (a.date || a.endDate || '').slice(0, 7)).filter(Boolean))).sort();
  const phaseName = (id) => (phases.find((p) => p.id === id) || {}).name || '';

  function matchesQuickFilter(a) {
    const deadline = a.endDate || a.date;
    const diff = deadline ? Math.round((parseDate(deadline) - parseDate(todayISO)) / 86400000) : null;
    switch (quickFilter) {
      case 'atrasadas': return a.status !== 'concluido' && diff !== null && diff < 0;
      case 'hoje': return a.status !== 'concluido' && diff === 0;
      case 'proximos7': return a.status !== 'concluido' && diff !== null && diff >= 0 && diff <= 7;
      case 'proximos30': return a.status !== 'concluido' && diff !== null && diff >= 0 && diff <= 30;
      case 'em-andamento': return a.status === 'em-andamento';
      case 'nao-iniciado': return a.status === 'nao-iniciado';
      case 'concluidas': return a.status === 'concluido';
      default: return true;
    }
  }

  let filtered = activities.filter((a) => {
    if (!matchesQuickFilter(a)) return false;
    if (filterResp && a.responsible !== filterResp) return false;
    if (filterPhase && a.phase !== filterPhase) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterMonth && (a.date || a.endDate || '').slice(0, 7) !== filterMonth) return false;
    return true;
  });

  // 'auto' não reordena — `activities` já chega na mesma ordem exibida na
  // aba Tabela (sortActivities() em App()), e o filter acima preserva essa
  // ordem relativa. Pedido explícito do Rafael: a ordem da Tabela é a
  // referência, tanto aqui quanto no relatório em PDF (ver PrintReport).
  if (sortMode !== 'auto') {
    filtered = filtered.slice().sort((a, b) => {
      if (sortMode === 'data') return (a.endDate || a.date || '').localeCompare(b.endDate || b.date || '');
      if (sortMode === 'atividade') return a.title.localeCompare(b.title, 'pt-BR');
      if (sortMode === 'responsavel') return (a.responsible || '').localeCompare(b.responsible || '', 'pt-BR');
      if (sortMode === 'fase') return phaseName(a.phase).localeCompare(phaseName(b.phase), 'pt-BR');
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    });
  }

  const groups = groupByMonth ? (() => {
    const map = {};
    filtered.forEach((a) => {
      const key = (a.date || a.endDate || '').slice(0, 7);
      (map[key] || (map[key] = [])).push(a);
    });
    return Object.keys(map).sort().map((key) => ({ key, items: map[key] }));
  })() : null;

  return (
    <div className="resumo-view">
      <style>{RESUMO_CSS}</style>
      <style>{TASK_CHIP_CSS}</style>
      <div className="rs-title">RESUMO</div>

      <div className="rs-kpis">
        <div className="rs-kpi"><div className="rs-kpi-num">{total}</div><div className="rs-kpi-label">Total de atividades</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num" style={{ color: '#3ecf6e' }}>{concluidas}</div><div className="rs-kpi-label">Concluídas</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num" style={{ color: '#F5C400' }}>{emAndamento}</div><div className="rs-kpi-label">Em andamento</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num">{naoIniciadas}</div><div className="rs-kpi-label">Não iniciadas</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num" style={{ color: '#ff9f40' }}>{pausadas}</div><div className="rs-kpi-label">Pausadas</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num" style={{ color: atrasadas ? '#e2574c' : 'var(--text-1)' }}>{atrasadas}</div><div className="rs-kpi-label">Atrasadas</div></div>
        <div className="rs-kpi"><div className="rs-kpi-num" style={{ color: '#3ea6ff' }}>{proximas7}</div><div className="rs-kpi-label">Próx. 7 dias</div></div>
        {nextActivity ? (
          <div className="rs-kpi rs-kpi-next" {...activate(() => openDetail(pid, nextActivity.id))}>
            <div className="rs-kpi-next-label">Próxima atividade</div>
            <div className="rs-kpi-next-title" title={nextActivity.title}>{nextActivity.title}</div>
            <div className="rs-kpi-next-meta">{resumoDateLabel(nextActivity)} · {resumoCountdown(nextActivity, todayISO).label}</div>
          </div>
        ) : (
          <div className="rs-kpi rs-kpi-next">
            <div className="rs-kpi-next-label">Próxima atividade</div>
            <div className="rs-empty-inline">Nenhuma pendente</div>
          </div>
        )}
      </div>

      <div className="rs-progress-block">
        <div className="rs-progress-head"><span>Progresso geral</span><span className="rs-progress-pct">{progress}%</span></div>
        <div className="rs-progress-track"><div className="rs-progress-fill" style={{ width: `${progress}%`, background: accent }} /></div>
      </div>

      <div className="rs-toolbar">
        <div className="rs-quickfilters">
          {RESUMO_QUICK_FILTERS.map((opt) => (
            <button key={opt.value} className={`rs-chip${quickFilter === opt.value ? ' rs-chip-active' : ''}`} onClick={() => setQuickFilter(opt.value)}>{opt.label}</button>
          ))}
        </div>
        <div className="rs-selects">
          <select value={filterResp} onChange={(e) => setFilterResp(e.target.value)}>
            <option value="">Responsável: todos</option>
            {respOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
            <option value="">Fase: todas</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Status: todos</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="">Mês: todos</option>
            {monthOptions.map((m) => <option key={m} value={m}>{resumoMonthLabel(m)}</option>)}
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="auto">Ordenar: como na Tabela</option>
            <option value="data">Ordenar: data</option>
            <option value="atividade">Ordenar: atividade</option>
            <option value="responsavel">Ordenar: responsável</option>
            <option value="fase">Ordenar: fase</option>
            <option value="status">Ordenar: status</option>
          </select>
          <label className="rs-group-toggle">
            <input type="checkbox" checked={groupByMonth} onChange={(e) => setGroupByMonth(e.target.checked)} /> Agrupar por mês
          </label>
        </div>
      </div>

      {groupByMonth ? (
        groups.length === 0 ? (
          <div className="rs-empty">Nenhuma atividade encontrada com esses filtros.</div>
        ) : groups.map((g) => (
          <div className="rs-month-group" key={g.key || 'sem-data'}>
            <button className="rs-month-head" onClick={() => setCollapsedMonths((c) => ({ ...c, [g.key]: !c[g.key] }))}>
              <ChevronDown size={14} style={{ transform: collapsedMonths[g.key] ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }} />
              {resumoMonthLabel(g.key)}
              <span className="rs-month-count">{g.items.length}</span>
            </button>
            {!collapsedMonths[g.key] && (
              isMobile
                ? <div className="rs-cards">{g.items.map((a) => <ResumoCard key={a.id} a={a} orderMap={orderMap} phases={phases} accent={accent} todayISO={todayISO} onOpen={() => openDetail(pid, a.id)} taskCounts={taskCounts} onOpenTasks={onOpenTasks} />)}</div>
                : <ResumoTable rows={g.items} orderMap={orderMap} phases={phases} accent={accent} todayISO={todayISO} onOpen={(id) => openDetail(pid, id)} taskCounts={taskCounts} onOpenTasks={onOpenTasks} />
            )}
          </div>
        ))
      ) : (
        isMobile
          ? <div className="rs-cards">{filtered.map((a) => <ResumoCard key={a.id} a={a} orderMap={orderMap} phases={phases} accent={accent} todayISO={todayISO} onOpen={() => openDetail(pid, a.id)} taskCounts={taskCounts} onOpenTasks={onOpenTasks} />)}</div>
          : <ResumoTable rows={filtered} orderMap={orderMap} phases={phases} accent={accent} todayISO={todayISO} onOpen={(id) => openDetail(pid, id)} taskCounts={taskCounts} onOpenTasks={onOpenTasks} />
      )}
    </div>
  );
}

function ActivityMetaChips({ a, phaseName, phaseColor }) {
  const chip = { fontSize: 10.5, fontWeight: 600, marginTop: 6, color: 'var(--text-5)' };
  return (
    <>
      {phaseName && <span style={{ ...chip, color: phaseColor }}>{phaseName}</span>}
      {a.meetingTime && <span style={chip} title="Horário da reunião">{a.meetingTime}</span>}
      {a.required && <span style={chip}>Obrigatória</span>}
      {a.clientDateConfirmed && <span style={{ ...chip, color: '#3ecf6e' }}>Data confirmada com o cliente</span>}
    </>
  );
}

// Campos secundários da atividade (fase, prioridade, prazo em dias, horário da reunião) — antes eram colunas da linha da tabela.
function ActivityMoreFields({ a, rowPid, rowPhases, phaseColor, updateActivity, isMobile }) {
  const ctl = isMobile ? { minHeight: 44 } : null;
  return (
    <div style={S.moreFieldsGrid}>
      <div>
        <div style={S.mobileFieldLabel}>Fase</div>
        <select
          aria-label={`Fase de ${a.title}`}
          value={a.phase}
          onChange={(e) => {
            const newPhaseId = Number(e.target.value);
            const phaseName = rowPhases.find((p) => p.id === newPhaseId)?.name || '';
            updateActivity(rowPid, a.id, { phase: newPhaseId }, `Fase alterada em "${a.title}": ${phaseName}`);
          }}
          style={{ ...S.pillSelect, ...ctl, background: `${phaseColor}22`, borderColor: `${phaseColor}66`, color: phaseColor }}
        >
          {rowPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <div style={S.mobileFieldLabel}>Prioridade</div>
        <select
          aria-label={`Prioridade de ${a.title}`}
          value={a.priority || ''}
          style={ctl}
          onChange={(e) => updateActivity(rowPid, a.id, { priority: e.target.value }, `Prioridade alterada em "${a.title}": ${e.target.value ? PRIORITY_META[e.target.value].label : 'sem prioridade'}`)}
        >
          <option value="">Sem prioridade</option>
          {PRIORITY_ORDER.map((pr) => <option key={pr} value={pr}>{PRIORITY_META[pr].label}</option>)}
        </select>
      </div>
      <div>
        <div style={S.mobileFieldLabel}>Prazo (dias)</div>
        <input
          type="number"
          min={1}
          placeholder="dias"
          aria-label={`Prazo em dias de ${a.title}`}
          value={a.durationDays || ''}
          style={ctl}
          onChange={(e) => {
            const v = e.target.value;
            const patch = { durationDays: v ? Number(v) : '' };
            if (v && a.date) patch.endDate = calcDeadline(a.date, v);
            updateActivity(rowPid, a.id, patch);
          }}
          onBlur={() => updateActivity(rowPid, a.id, {}, `Prazo alterado em "${a.title}": ${a.durationDays ? a.durationDays + ' dias' : 'sem prazo definido'}`)}
        />
      </div>
      <div>
        <div style={S.mobileFieldLabel}>Horário da reunião (opcional)</div>
        <input
          type="time"
          aria-label={`Horário da reunião de ${a.title}`}
          value={a.meetingTime || ''}
          style={ctl}
          onChange={(e) => updateActivity(rowPid, a.id, { meetingTime: e.target.value })}
          onBlur={() => updateActivity(rowPid, a.id, {}, `Horário da reunião alterado em "${a.title}": ${a.meetingTime || 'sem horário definido'}`)}
        />
      </div>
    </div>
  );
}

// Menu "⋯ Mais ações" por linha: renderizado num portal (a tabela rola na horizontal e cortaria um menu absoluto).
function RowActionsMenu({ title, required, confirmed, locked, onToggleRequired, onToggleConfirmed, onToggleLocked, onOpenFull, onMoreFields, onDelete, isMobile }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const close = (refocus) => { setOpen(false); if (refocus && btnRef.current) btnRef.current.focus(); };
  useEscClose(() => close(true), open);
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onAway() { setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onAway);
    window.addEventListener('scroll', onAway, true);
    const first = menuRef.current && menuRef.current.querySelector('[role^="menuitem"]');
    if (first) first.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onAway);
      window.removeEventListener('scroll', onAway, true);
    };
  }, [open]);

  function toggle() {
    if (open) { close(true); return; }
    const r = btnRef.current.getBoundingClientRect();
    const w = 280;
    const h = 6 * (isMobile ? 48 : 38) + 14;
    const left = Math.min(Math.max(8, r.right - w), Math.max(8, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ top, left, width: Math.min(w, window.innerWidth - 16) });
    setOpen(true);
  }
  function onMenuKey(e) {
    const items = Array.from(menuRef.current.querySelectorAll('[role^="menuitem"]'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Tab') close(false);
  }
  const itemStyle = { ...S.rowMenuItem, ...(isMobile ? { minHeight: 48 } : null) };
  const run = (fn) => () => { close(true); fn(); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="row-menu-btn act-row-actions"
        data-open={open}
        aria-label={`Mais ações da atividade ${title || '(sem título)'}`}
        title="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ ...S.rowMenuBtn, ...(isMobile ? { width: 44, height: 44 } : null) }}
        onClick={toggle}
      >
        <MoreHorizontal size={isMobile ? 18 : 16} aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" aria-label={`Ações da atividade ${title || '(sem título)'}`} onKeyDown={onMenuKey} style={{ ...S.rowMenu, top: pos.top, left: pos.left, width: pos.width }}>
          <button type="button" role="menuitem" tabIndex={-1} className="row-menu-item" style={itemStyle} onClick={run(onOpenFull)}><Maximize2 size={14} aria-hidden="true" /> Abrir em tela cheia</button>
          <button type="button" role="menuitem" tabIndex={-1} className="row-menu-item" style={itemStyle} onClick={run(onMoreFields)}><SlidersHorizontal size={14} aria-hidden="true" /> Fase, prioridade, prazo e horário…</button>
          <button type="button" role="menuitemcheckbox" aria-checked={!!required} tabIndex={-1} className="row-menu-item" style={itemStyle} onClick={onToggleRequired}>
            <span aria-hidden="true" style={S.rowMenuCheck}>{required ? <Check size={13} /> : null}</span> Obrigatória
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!!confirmed} tabIndex={-1} className="row-menu-item" style={itemStyle} onClick={onToggleConfirmed}>
            <span aria-hidden="true" style={S.rowMenuCheck}>{confirmed ? <Check size={13} /> : null}</span> Data confirmada com o cliente
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!!locked} tabIndex={-1} className="row-menu-item" style={itemStyle} onClick={onToggleLocked} title="Datas travadas não acompanham o ajuste automático de datas">
            <span aria-hidden="true" style={S.rowMenuCheck}>{locked ? <Check size={13} /> : null}</span> Travar a data (ajuste automático)
          </button>
          <div role="separator" style={{ height: 1, background: 'var(--border-1)', margin: '4px 0' }} />
          <button type="button" role="menuitem" tabIndex={-1} className="row-menu-item" style={{ ...itemStyle, color: '#e5484d' }} onClick={run(onDelete)}><Trash2 size={14} aria-hidden="true" /> Excluir atividade</button>
        </div>,
        document.body,
      )}
    </>
  );
}

// Largura mínima da tabela no layout de desktop: abaixo disso (tablet, janela estreita) o contêiner rola na horizontal em vez de espremer as colunas (Fase 0, achado F).
const TABLE_MIN_W = 1060;

// Subatividades (não apagadas) do projeto da linha, para escolher predecessoras. Em várias empresas, as atividades trazem `_pid`.
const subsOfProject = (activities, rowPid, singlePid) => (activities || []).filter((x) => !x.deleted && (singlePid || x._pid) === rowPid).flatMap((x) => (x.subactivities || []).filter((y) => !y.deleted).map((y) => ({ id: y.id, title: y.title, code: y.code, done: !!y.done, date: y.date, predecessors: y.predecessors })));

export function TableView({ activities, orderMap, phases, team, pid, expanded, setExpanded, updateActivity, deleteActivity, addSub, updateSub, deleteSub, reorderSub, addAttachment, removeAttachment, openDetail, multiMode, companyColor, groupInfo, taskCounts, onOpenTasks, staff, meetingsByPid, onOpenMeeting }) {
  const isMobile = useIsMobile();
  const isCompact = useIsCompact();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [dragSub, setDragSub] = useState(null);
  const [dragActId, setDragActId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragMetaRef = useRef({ orderIds: [], rects: {} });
  const dragOverIdRef = useRef(null);
  const rowElRefs = useRef({});
  const [filterPhase, setFilterPhase] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCompany, setFilterCompany] = useState('');

  function phaseOf(a) {
    const rp = phases || a._phases;
    return rp && rp.find((p) => p.id === a.phase);
  }

  const phaseOptions = [];
  const seenPhaseNames = new Set();
  activities.forEach((a) => {
    const po = phaseOf(a);
    if (po && !seenPhaseNames.has(po.name)) { seenPhaseNames.add(po.name); phaseOptions.push(po); }
  });
  const respOptions = Array.from(new Set(activities.map((a) => a.responsible).filter(Boolean)));
  const companyOptions = (multiMode && !groupInfo) ? Array.from(new Set(activities.map((a) => a._companyName).filter(Boolean))) : [];

  const filtered = activities.filter((a) => {
    if (filterPhase && phaseOf(a)?.name !== filterPhase) return false;
    if (filterResp && a.responsible !== filterResp) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterPriority && (a.priority || '') !== filterPriority) return false;
    if (groupInfo) {
      if (filterCompany === '__geral__') {
        if (!(a._pid === groupInfo.masterId && (!a.involvedCompanyIds || a.involvedCompanyIds.length === 0))) return false;
      } else if (filterCompany) {
        const matchesNative = a._pid === filterCompany;
        const matchesTag = a._pid === groupInfo.masterId && (a.involvedCompanyIds || []).includes(filterCompany);
        if (!matchesNative && !matchesTag) return false;
      }
    } else if (filterCompany && a._companyName !== filterCompany) return false;
    return true;
  });
  const filtersActive = !!(filterPhase || filterResp || filterStatus || filterPriority || filterCompany);

  useEffect(() => {
    if (!dragActId) return;
    function onMove(e) {
      const meta = dragMetaRef.current;
      setDragOffsetY(e.clientY - meta.startY);
      let bestId = dragActId;
      let bestDist = Infinity;
      meta.orderIds.forEach((id) => {
        const r = meta.rects[id];
        if (!r) return;
        const mid = r.top + r.height / 2;
        const dist = Math.abs(e.clientY - mid);
        if (dist < bestDist) { bestDist = dist; bestId = id; }
      });
      dragOverIdRef.current = bestId;
      setDragOverId(bestId);
    }
    function onUp() {
      const toId = dragOverIdRef.current;
      if (toId && toId !== dragActId) reorderActivityByDrop(dragActId, toId);
      setDragActId(null);
      setDragOverId(null);
      setDragOffsetY(0);
      dragOverIdRef.current = null;
    }
    function onCancel() {
      setDragActId(null);
      setDragOverId(null);
      setDragOffsetY(0);
      dragOverIdRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActId]);

  function startRowDrag(e, id) {
    if (multiMode) return;
    e.preventDefault();
    const orderIds = filtered.map((x) => x.id);
    const rects = {};
    orderIds.forEach((rid) => {
      const el = rowElRefs.current[rid];
      if (el) {
        const r = el.getBoundingClientRect();
        rects[rid] = { top: r.top, height: r.height };
      }
    });
    dragMetaRef.current = { orderIds, rects, startY: e.clientY };
    dragOverIdRef.current = id;
    setDragActId(id);
    setDragOverId(id);
    setDragOffsetY(0);
  }

  function reorderActivityByDrop(fromId, toId) {
    const list = filtered;
    const fromIdx = list.findIndex((x) => x.id === fromId);
    const toIdx = list.findIndex((x) => x.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const dragged = list[fromIdx];
    const withoutDragged = list.filter((x) => x.id !== fromId);
    const targetIdx = withoutDragged.findIndex((x) => x.id === toId);
    const insertAt = fromIdx < toIdx ? targetIdx + 1 : targetIdx;
    const prev = insertAt > 0 ? withoutDragged[insertAt - 1] : null;
    const next = insertAt < withoutDragged.length ? withoutDragged[insertAt] : null;

    let newDate = dragged.date;
    if (prev && prev.date) newDate = dayAfter(prev.endDate || prev.date);
    else if (next && next.date) newDate = dayBefore(next.date);
    if (!newDate) return;

    const oldDate = dragged.date;
    const oldEnd = dragged.endDate || dragged.date;
    let newEnd;
    if (dragged.durationDays) {
      newEnd = calcDeadline(newDate, dragged.durationDays);
    } else if (oldDate && oldEnd) {
      const spanDays = Math.round((parseDate(oldEnd) - parseDate(oldDate)) / 86400000);
      newEnd = toISODate(addDays(parseDate(newDate), spanDays));
    } else {
      newEnd = newDate;
    }
    updateActivity(pid, dragged.id, { date: newDate, endDate: newEnd }, `Atividade "${dragged.title}" reordenada: novo início ${fmtDate(newDate)}`, { noRipple: true });
  }

  return (
    <div style={{ ...S.tableLayout, ...(isCompact ? S.tableLayoutCompact : null) }}>
      <style>{SUB_ROW_CSS}</style>
      <style>{TASK_CHIP_CSS}</style>
      {isCompact && (
        <button style={{ ...S.filterToggleBtn, minHeight: 44 }} aria-expanded={showMobileFilters} onClick={() => setShowMobileFilters((v) => !v)}>
          <SlidersHorizontal size={14} /> Filtros{filtersActive ? ' •' : ''} {showMobileFilters ? '▲' : '▼'}
        </button>
      )}
      {(!isCompact || showMobileFilters) && (
      <div style={{ ...S.filterSidebar, ...(isCompact ? S.filterSidebarCompact : null) }}>
        <div style={S.filterSidebarTitle}>Filtros rápidos</div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Fase</div>
          <select style={S.filterSelect} value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
            <option value="">Todas as fases</option>
            {phaseOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Responsável</div>
          <select style={S.filterSelect} value={filterResp} onChange={(e) => setFilterResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {respOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Status</div>
          <select style={S.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Prioridade</div>
          <select style={S.filterSelect} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">Todas as prioridades</option>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>
        {groupInfo ? (
          <div style={S.filterGroup}>
            <div style={S.filterLabel}>Empresa do grupo</div>
            <select style={S.filterSelect} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
              <option value="">Todas as atividades</option>
              <option value="__geral__">Geral do Grupo</option>
              {groupInfo.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : multiMode && companyOptions.length > 0 && (
          <div style={S.filterGroup}>
            <div style={S.filterLabel}>Empresa</div>
            <select style={S.filterSelect} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
              <option value="">Todas as empresas</option>
              {companyOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        {filtersActive && (
          <button style={S.filterClearBtn} onClick={() => { setFilterPhase(''); setFilterResp(''); setFilterStatus(''); setFilterPriority(''); setFilterCompany(''); }}>
            Limpar filtros
          </button>
        )}
      </div>
      )}

      <div style={{ flex: 1, minWidth: 0, ...(isCompact ? { alignSelf: 'stretch' } : null) }}>
        <div style={S.tableWrap}>
          {!isMobile && (
          <div style={{ ...S.tableHeaderRow, minWidth: TABLE_MIN_W }}>
            <div className="tbl-grip" style={{ ...S.th, width: 20 }}></div>
            <div style={{ ...S.th, width: 46 }}>#</div>
            {multiMode && <div style={{ ...S.th, width: 150 }}>Empresa</div>}
            <div style={{ ...S.th, flex: 2, minWidth: 260 }}>Atividade</div>
            <div style={{ ...S.th, width: 170 }}>Responsável</div>
            <div style={{ ...S.th, width: 240 }}>Início / Fim</div>
            <div style={{ ...S.th, width: 140 }}>Status</div>
            <div style={{ ...S.th, width: 84 }}></div>
          </div>
          )}

          {filtered.length === 0 && (
            <div style={S.tableEmptyState}>Nenhuma atividade encontrada com esses filtros.</div>
          )}

          {filtered.map((a) => {
            const rowPid = pid || a._pid;
            const rowPhases = phases || a._phases;
            const rowTeam = team || a._team;
            const rowAccent = companyColor || a._companyColor || '#F5C400';
            const rowOrder = orderMap ? orderMap[a.id] : a._order;
            const isOpen = !!expanded[`${rowPid}-${a.id}`];
            const subs = (a.subactivities || []).filter((s) => !s.deleted);
            const doneSubs = subs.filter((s) => s.done).length;
            const phaseColor = phaseOf(a)?.color || 'var(--text-5)';
            const isDragging = dragActId === a.id;

            let rowShift = 0;
            if (dragActId && !isDragging) {
              const meta = dragMetaRef.current;
              const fromIdx = meta.orderIds.indexOf(dragActId);
              const hoverIdx = meta.orderIds.indexOf(dragOverId);
              const idx = meta.orderIds.indexOf(a.id);
              const draggedHeight = (meta.rects[dragActId] && meta.rects[dragActId].height) || 0;
              if (fromIdx !== -1 && hoverIdx !== -1 && idx !== -1) {
                if (hoverIdx >= fromIdx && idx > fromIdx && idx <= hoverIdx) rowShift = -draggedHeight;
                else if (hoverIdx < fromIdx && idx < fromIdx && idx >= hoverIdx) rowShift = draggedHeight;
              }
            }

            return (
              <div
                key={`${rowPid}-${a.id}`}
                ref={(el) => { rowElRefs.current[a.id] = el; }}
                className="act-row"
                style={{
                  ...S.tableGroup,
                  ...(!isMobile ? { minWidth: TABLE_MIN_W } : null),
                  borderLeft: `3px solid ${rowAccent}`,
                  position: 'relative',
                  transform: isDragging ? `translateY(${dragOffsetY}px)` : (rowShift ? `translateY(${rowShift}px)` : undefined),
                  transition: isDragging ? 'none' : 'transform .15s ease',
                  zIndex: isDragging ? 5 : undefined,
                  ...(isDragging ? S.tableRowDragging : {}),
                }}
              >
                {!isMobile && (
                <div style={S.tableRow}>
                  <div
                    className="tbl-grip tbl-grip-row"
                    style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: multiMode ? 'default' : (isDragging ? 'grabbing' : 'grab'), opacity: multiMode ? 0.25 : 1, flexShrink: 0, touchAction: 'none' }}
                    onPointerDown={(e) => startRowDrag(e, a.id)}
                    title={multiMode ? undefined : 'Arraste para reordenar (ajusta a data de início)'}
                  >
                    <GripVertical size={14} color="var(--text-7)" />
                  </div>
                  <div style={{ width: 46, paddingTop: 6 }}><OrderBadge n={rowOrder} title={a.title} color={phaseColor} phaseName={phaseOf(a)?.name} onOpen={() => openDetail(rowPid, a.id)} /></div>
                  {multiMode && (
                    <div style={{ width: 150 }}>
                      <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} />
                      {a.groupActivityId && (
                        <span title={a.groupScopeType === 'all' ? 'Atividade do grupo inteiro' : 'Atividade vinculada a várias empresas do grupo'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5', marginTop: 3 }}>
                          <Users size={10} /> {a.groupScopeType === 'all' ? 'Grupo inteiro' : 'Várias empresas'}
                        </span>
                      )}
                      {involvedCompaniesLabel(a, groupInfo) && (
                        <span title="Empresas envolvidas nesta atividade" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5', marginTop: 3 }}>
                          <Building2 size={10} /> {involvedCompaniesLabel(a, groupInfo)}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 2, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.priority && <span title={`Prioridade ${PRIORITY_META[a.priority].label}`} style={{ ...S.priorityDot, background: PRIORITY_META[a.priority].color }} />}
                      <DebouncedTextInput aria-label="Título da atividade" value={a.title} onCommit={(v) => updateActivity(rowPid, a.id, { title: v })} onBlurLog={() => updateActivity(rowPid, a.id, {}, `Título alterado: "${a.title}"`)} style={{ flex: 1, fontWeight: 700 }} />
                    </div>
                    <DebouncedTextInput value={a.desc} onCommit={(v) => updateActivity(rowPid, a.id, { desc: v })} onBlurLog={() => updateActivity(rowPid, a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 4, opacity: .8 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        aria-expanded={isOpen}
                        style={S.subToggleBtn}
                        onClick={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: !e[`${rowPid}-${a.id}`] }))}
                      >
                        <ChevronDown size={11} aria-hidden="true" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                        {subs.length > 0 ? `${doneSubs}/${subs.length} subatividades` : 'Detalhes'}
                      </button>
                      <ActivityMetaChips a={a} phaseName={phaseOf(a)?.name} phaseColor={phaseColor} />
                      {onOpenTasks && <TaskCountChip counts={taskCounts && (multiMode ? taskCounts[rowPid] && taskCounts[rowPid][a.id] : taskCounts[a.id])} onOpenTasks={() => onOpenTasks(a.id, rowPid)} style={{ marginTop: 0 }} />}
                    </div>
                  </div>
                  <div style={{ width: 170, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...S.avatarDot, background: rowAccent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                    <select value={a.responsible} onChange={(e) => updateActivity(rowPid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1, minWidth: 0 }}>
                      {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 240, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="date" aria-label={`Início de ${a.title}`} style={{ width: 108, flexShrink: 0 }} value={a.date} onChange={(e) => {
                      const v = e.target.value;
                      const patch = { date: v };
                      if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
                      else if (!a.endDate || a.endDate < v) patch.endDate = v;
                      updateActivity(rowPid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                    }} />
                    <span aria-hidden="true" style={{ color: 'var(--text-6)', flexShrink: 0 }}>→</span>
                    <input type="date" aria-label={`Fim de ${a.title}`} style={{ width: 108, flexShrink: 0 }} value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(rowPid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
                  </div>
                  <div style={{ width: 140 }}>
                    <select value={a.status} onChange={(e) => updateActivity(rowPid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ ...S.pillSelect, background: STATUS_META[a.status].bg, borderColor: STATUS_META[a.status].border, color: STATUS_META[a.status].color }}>
                      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  </div>
                  <div style={S.actionsCell}>
                    {a.dateLocked && <button aria-label={`Data travada em ${a.title || '(sem título)'}: destravar`} title="Data travada: não acompanha o ajuste automático de datas. Clique para destravar" className="act-row-actions" style={{ ...S.rowMenuBtn, color: '#F5C400', opacity: 1 }} onClick={() => updateActivity(rowPid, a.id, { dateLocked: false }, `Data destravada em "${a.title}"`)}><Lock size={13} aria-hidden="true" /></button>}
                    <button aria-label={`Abrir em tela cheia a atividade ${a.title || '(sem título)'}`} title="Abrir em tela cheia" className="act-row-actions" style={S.rowMenuBtn} onClick={() => openDetail(rowPid, a.id)}><Maximize2 size={14} aria-hidden="true" /></button>
                    <RowActionsMenu
                      title={a.title}
                      required={a.required}
                      confirmed={a.clientDateConfirmed}
                      locked={a.dateLocked}
                      onToggleRequired={() => updateActivity(rowPid, a.id, { required: !a.required }, `Obrigatoriedade alterada em "${a.title}"`)}
                      onToggleConfirmed={() => updateActivity(rowPid, a.id, { clientDateConfirmed: !a.clientDateConfirmed }, `Data confirmada com o cliente ${!a.clientDateConfirmed ? 'marcada' : 'desmarcada'} em "${a.title}"`)}
                      onToggleLocked={() => updateActivity(rowPid, a.id, { dateLocked: !a.dateLocked }, `Data ${!a.dateLocked ? 'travada' : 'destravada'} em "${a.title}"`)}
                      onOpenFull={() => openDetail(rowPid, a.id)}
                      onMoreFields={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: true }))}
                      onDelete={() => deleteActivity(rowPid, a.id)}
                      isMobile={false}
                    />
                  </div>
                </div>
                )}

                {isMobile && (
                  <div style={S.mobileActCard}>
                    <div style={S.mobileActTopRow}>
                      <OrderBadge n={rowOrder} title={a.title} color={phaseColor} phaseName={phaseOf(a)?.name} onOpen={() => openDetail(rowPid, a.id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {a.priority && <span title={`Prioridade ${PRIORITY_META[a.priority].label}`} style={{ ...S.priorityDot, background: PRIORITY_META[a.priority].color, flexShrink: 0 }} />}
                          <DebouncedTextInput aria-label="Título da atividade" value={a.title} onCommit={(v) => updateActivity(rowPid, a.id, { title: v })} onBlurLog={() => updateActivity(rowPid, a.id, {}, `Título alterado: "${a.title}"`)} style={{ flex: 1, fontWeight: 700, minHeight: 44 }} />
                        </div>
                        {multiMode && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} />
                            {a.groupActivityId && (
                              <span title={a.groupScopeType === 'all' ? 'Atividade do grupo inteiro' : 'Atividade vinculada a várias empresas do grupo'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5' }}>
                                <Users size={10} /> {a.groupScopeType === 'all' ? 'Grupo inteiro' : 'Várias empresas'}
                              </span>
                            )}
                            {involvedCompaniesLabel(a, groupInfo) && (
                              <span title="Empresas envolvidas nesta atividade" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5' }}>
                                <Building2 size={10} /> {involvedCompaniesLabel(a, groupInfo)}
                              </span>
                            )}
                          </div>
                        )}
                        <DebouncedTextInput value={a.desc} onCommit={(v) => updateActivity(rowPid, a.id, { desc: v })} onBlurLog={() => updateActivity(rowPid, a.id, {}, `Descrição alterada em "${a.title}"`)} placeholder="Descrição" style={{ marginTop: 6, opacity: .8, minHeight: 44 }} />
                        {onOpenTasks && <TaskCountChip counts={taskCounts && (multiMode ? taskCounts[rowPid] && taskCounts[rowPid][a.id] : taskCounts[a.id])} onOpenTasks={() => onOpenTasks(a.id, rowPid)} style={{ marginTop: 0 }} />}
                      </div>
                    </div>

                    <div style={S.mobileFieldGroup}>
                      <div>
                        <div style={S.mobileFieldLabel}>Responsável</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...S.avatarDot, background: rowAccent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                          <select aria-label={`Responsável por ${a.title}`} value={a.responsible} onChange={(e) => updateActivity(rowPid, a.id, { responsible: e.target.value }, `Responsável alterado em "${a.title}": ${e.target.value}`)} style={{ flex: 1, minWidth: 0, minHeight: 44 }}>
                            {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <div style={S.mobileFieldLabel}>Status</div>
                        <select aria-label={`Status de ${a.title}`} value={a.status} onChange={(e) => updateActivity(rowPid, a.id, { status: e.target.value }, `Status alterado em "${a.title}": ${STATUS_META[e.target.value].label}`)} style={{ ...S.pillSelect, minHeight: 44, background: STATUS_META[a.status].bg, borderColor: STATUS_META[a.status].border, color: STATUS_META[a.status].color }}>
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={S.mobileFieldLabel}>Início</div>
                          <input type="date" aria-label={`Início de ${a.title}`} style={{ minHeight: 44 }} value={a.date} onChange={(e) => {
                            const v = e.target.value;
                            const patch = { date: v };
                            if (a.durationDays) patch.endDate = calcDeadline(v, a.durationDays);
                            else if (!a.endDate || a.endDate < v) patch.endDate = v;
                            updateActivity(rowPid, a.id, patch, `Início alterado em "${a.title}": ${fmtDate(v)}`);
                          }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={S.mobileFieldLabel}>Fim</div>
                          <input type="date" aria-label={`Fim de ${a.title}`} style={{ minHeight: 44 }} value={a.endDate || a.date} min={a.date} onChange={(e) => updateActivity(rowPid, a.id, { endDate: e.target.value }, `Fim alterado em "${a.title}": ${fmtDate(e.target.value)}`)} />
                        </div>
                      </div>
                    </div>

                    <div style={S.mobileActionsRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                        <button
                          aria-expanded={isOpen}
                          style={{ ...S.subToggleBtn, marginTop: 0, minHeight: 44 }}
                          onClick={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: !e[`${rowPid}-${a.id}`] }))}
                        >
                          <ChevronDown size={11} aria-hidden="true" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                          {subs.length > 0 ? `${doneSubs}/${subs.length} subatividades` : 'Detalhes'}
                        </button>
                        <ActivityMetaChips a={a} phaseName={phaseOf(a)?.name} phaseColor={phaseColor} />
                      </div>
                      <RowActionsMenu
                        title={a.title}
                        required={a.required}
                        confirmed={a.clientDateConfirmed}
                      locked={a.dateLocked}
                        onToggleRequired={() => updateActivity(rowPid, a.id, { required: !a.required }, `Obrigatoriedade alterada em "${a.title}"`)}
                        onToggleConfirmed={() => updateActivity(rowPid, a.id, { clientDateConfirmed: !a.clientDateConfirmed }, `Data confirmada com o cliente ${!a.clientDateConfirmed ? 'marcada' : 'desmarcada'} em "${a.title}"`)}
                      onToggleLocked={() => updateActivity(rowPid, a.id, { dateLocked: !a.dateLocked }, `Data ${!a.dateLocked ? 'travada' : 'destravada'} em "${a.title}"`)}
                        onOpenFull={() => openDetail(rowPid, a.id)}
                        onMoreFields={() => setExpanded((e) => ({ ...e, [`${rowPid}-${a.id}`]: true }))}
                        onDelete={() => deleteActivity(rowPid, a.id)}
                        isMobile
                      />
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div style={S.subPanel}>
                    <ActivityMoreFields a={a} rowPid={rowPid} rowPhases={rowPhases} phaseColor={phaseColor} updateActivity={updateActivity} isMobile={isMobile} />
                    <div style={S.subList}>
                      {subs.map((s) => (
                        <div
                          key={s.id}
                          className="sub-row-card"
                          style={{ ...S.subRowWrap, ...(dragSub && dragSub.subId === s.id ? { opacity: .4 } : {}) }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragSub && dragSub.actId === a.id) reorderSub(rowPid, a.id, dragSub.subId, s.id); setDragSub(null); }}
                        >
                          <div style={S.subRow}>
                            <div className="sub-drag-handle" draggable onDragStart={() => setDragSub({ actId: a.id, subId: s.id })} onDragEnd={() => setDragSub(null)} style={S.subDragHandle} title="Arraste para reordenar">
                              <GripVertical size={13} color="var(--text-8)" />
                            </div>
                            <input type="checkbox" checked={s.done} onChange={(e) => updateSub(rowPid, a.id, s.id, { done: e.target.checked })} />
                            <input type="text" className="sub-title-input" value={s.title} onChange={(e) => updateSub(rowPid, a.id, s.id, { title: e.target.value })} style={{ ...S.subTitleInput, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .6 : 1 }} />
                            <button aria-label="Excluir subatividade" title="Excluir subatividade" className="sub-del-btn" style={S.iconBtnGhost} onClick={() => deleteSub(rowPid, a.id, s.id)}><X aria-hidden="true" size={13} /></button>
                          </div>
                          <div style={S.subMetaRow}>
                            <select className="sub-meta-select" value={s.responsible || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { responsible: e.target.value })} style={S.subMetaSelect} title="Responsável da subatividade">
                              <option value="">Sem responsável</option>
                              {rowTeam.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                            </select>
                            <input type="date" className="sub-meta-date" value={s.date || ''} onChange={(e) => updateSub(rowPid, a.id, s.id, { date: e.target.value })} style={S.subMetaDate} title="Prazo da subatividade" />
                            <SubOutcome s={s} pid={rowPid} actId={a.id} updateSub={updateSub} />
                          </div>
                          <SubExtras s={s} pid={rowPid} actId={a.id} allSubs={subsOfProject(activities, rowPid, pid)} canEdit={!!staff} updateSub={updateSub} meetings={meetingsByPid && meetingsByPid[rowPid]} onOpenMeeting={(id) => onOpenMeeting && onOpenMeeting(rowPid, id)} />
                        </div>
                      ))}
                    </div>
                    <button style={S.addSubBtn} onClick={() => addSub(rowPid, a.id)}><Plus size={12} /> Subatividade</button>

                    {!!(a.notes || '').trim() && (
                      <>
                        <div style={S.subSectionLabel}>Observações anteriores</div>
                        <div style={{ ...S.fieldHint, marginTop: 0, whiteSpace: 'pre-wrap' }}>{a.notes}</div>
                        <div style={S.fieldHint}>Ao abrir a atividade em tela cheia, este texto passa a fazer parte da descrição.</div>
                      </>
                    )}

                    <div style={S.subSectionLabel}>Anexos {(a.attachments || []).length > 0 ? `(${(a.attachments || []).length})` : ''}</div>
                    <div style={S.attachList}>
                      {(a.attachments || []).map((att) => (
                        <div key={att.id} style={S.attachRow}>
                          <a href={att.dataUrl} download={att.name} style={S.attachLink}>{att.name}</a>
                          <span style={S.attachSize}>{att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
                          <button aria-label="Remover anexo" title="Remover anexo" style={S.iconBtnGhost} onClick={() => removeAttachment(rowPid, a.id, att.id)}><X aria-hidden="true" size={12} /></button>
                        </div>
                      ))}
                    </div>
                    <label htmlFor={`file-${rowPid}-${a.id}`} style={S.addSubBtn}><Upload size={12} /> Anexar arquivo</label>
                    <input id={`file-${rowPid}-${a.id}`} type="file" style={{ display: 'none' }} onChange={(e) => { addAttachment(rowPid, a.id, e.target.files && e.target.files[0]); e.target.value = ''; }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PhasesView({ activities, orderMap, phases, pid, updateActivity, openDetail, companyColor, taskCounts, onOpenTasks }) {
  const accent = companyColor || '#F5C400';
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState({});
  function toggle(id) { setCollapsed((c) => ({ ...c, [id]: !c[id] })); }

  function cycleStatus(a) {
    const rowPid = pid || a._pid;
    const idx = STATUS_ORDER.indexOf(a.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateActivity(rowPid, a.id, { status: next }, `Status alterado em "${a.title}": ${STATUS_META[next].label}`);
  }

  const todayISO = toISODate(startOfDay(new Date()));
  const isOverdue = (a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < todayISO;

  const total = activities.length;
  const doneCount = activities.filter((a) => a.status === 'concluido').length;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = activities.filter(isOverdue).length;
  const collaborators = new Set(activities.map((a) => a.responsible).filter(Boolean));
  const ends = activities.map((a) => a.endDate || a.date).filter(Boolean);
  const lastEnd = ends.length ? ends.reduce((mx, d) => (d > mx ? d : mx)) : null;
  const daysRemaining = lastEnd ? Math.max(0, Math.round((parseDate(lastEnd) - parseDate(todayISO)) / 86400000)) : 0;
  const statusCounts = STATUS_ORDER.reduce((acc, s) => { acc[s] = activities.filter((a) => a.status === s).length; return acc; }, {});
  const maxStatusCount = Math.max(1, ...STATUS_ORDER.map((s) => statusCounts[s]));
  const circumference = 2 * Math.PI * 32;

  return (
    <div>
      {onOpenTasks && <style>{TASK_CHIP_CSS}</style>}
      <div style={S.phasesSummaryCard}>
        <div style={S.phasesSummaryDonutWrap}>
          <svg viewBox="0 0 80 80" width="72" height="72">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border-1)" strokeWidth="9" />
            <circle
              cx="40" cy="40" r="32" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progressPct / 100)}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div style={S.phasesSummaryDonutLabel}>{progressPct}%</div>
        </div>
        <div style={S.phasesSummaryMid}>
          <div style={S.phasesSummaryTitle}>Progresso Geral do Projeto</div>
          <div style={S.phasesSummaryStatBars}>
            {STATUS_ORDER.map((s) => (
              <div
                key={s}
                title={`${STATUS_META[s].label}: ${statusCounts[s]}`}
                style={{ ...S.phasesSummaryBar, background: STATUS_META[s].color, height: Math.max(5, (statusCounts[s] / maxStatusCount) * 36) }}
              />
            ))}
          </div>
        </div>
        <div style={S.phasesSummaryStats}>
          <div>
            <div style={S.phasesSummaryStatNum}>{daysRemaining}</div>
            <div style={S.phasesSummaryStatLabel}>Dias restantes</div>
          </div>
          <div>
            <div style={{ ...S.phasesSummaryStatNum, color: overdueCount ? '#e2574c' : 'var(--text-1)' }}>{overdueCount}</div>
            <div style={S.phasesSummaryStatLabel}>Em atraso</div>
          </div>
          <div>
            <div style={S.phasesSummaryStatNum}>{collaborators.size}</div>
            <div style={S.phasesSummaryStatLabel}>Colaboradores</div>
          </div>
        </div>
      </div>

      {phases.map((p, pi) => {
        const phaseActs = activities.filter((a) => a.phase === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const phaseDone = phaseActs.filter((a) => a.status === 'concluido').length;
        const phasePct = phaseActs.length ? Math.round((phaseDone / phaseActs.length) * 100) : 0;
        const isCollapsed = !!collapsed[p.id];
        return (
          <section key={p.id} style={{ ...S.phaseSection, borderLeft: `3px solid ${accent}` }}>
            <div style={S.phaseHead2} onClick={() => toggle(p.id)}>
              <div style={{ ...S.phaseNum, color: p.color }}>{String(pi + 1).padStart(2, '0')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.phaseTitle}>{p.name}</div>
                <div style={S.phaseSub}>{p.sub}</div>
              </div>
              <div style={S.phaseProgressWrap}>
                <div style={S.phaseProgressTrack}>
                  <div style={{ ...S.phaseProgressFill, width: `${phasePct}%`, background: p.color }} />
                </div>
                <div style={S.phaseProgressPct}>{phasePct}%</div>
              </div>
              <ChevronDown size={16} style={{ color: 'var(--text-5)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s', flexShrink: 0 }} />
            </div>

            {!isCollapsed && (
              <div style={{ ...S.phaseCardGrid, ...(isMobile ? S.phaseCardGridMobile : null) }}>
                {phaseActs.map((a) => {
                  const rowPid = pid || a._pid;
                  const rowOrder = orderMap ? orderMap[a.id] : a._order;
                  const overdue = isOverdue(a);
                  return (
                    <div
                      key={a.id}
                      style={{ ...S.phaseCard, borderColor: overdue ? '#e2574c66' : 'var(--border-1)', borderLeft: `3px solid ${overdue ? '#e2574c' : accent}` }}
                      onClick={() => openDetail(rowPid, a.id)}
                    >
                      <div style={S.phaseCardTop}>
                        <span style={{ ...S.monthBadgeSm, background: p.color }}>#{rowOrder}</span>
                        <div style={S.phaseActTitle}>{a.title}{a.required && <span style={S.reqDot} title="Obrigatória" />}</div>
                        {overdue && <span title="Atrasada" style={S.phaseWarnIcon}><AlertTriangle size={13} /></span>}
                        <StatusPill status={a.status} onClick={(e) => { e.stopPropagation(); cycleStatus(a); }} />
                      </div>
                      {a.desc && <div style={S.phaseActDesc}>{a.desc}</div>}
                      {onOpenTasks && <div><TaskCountChip counts={taskCounts && taskCounts[a.id]} onOpenTasks={() => onOpenTasks(a.id)} style={{ marginTop: 6 }} /></div>}
                      <div style={S.phaseCardFooter}>
                        <div style={S.phaseCardOwner}>
                          <span style={{ ...S.avatarDot, background: accent }}>{(a.responsible || '?').slice(0, 1).toUpperCase()}</span>
                          {a.responsible}
                        </div>
                        <div style={S.phaseDate}>{fmtDate(a.date)}{a.endDate && a.endDate !== a.date ? ` – ${fmtDate(a.endDate)}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function KanbanView({ activities, orderMap, phases, pid, dragId, setDragId, updateActivity, addActivity, openDetail, multiMode, groupInfo, taskCounts, onOpenTasks }) {
  const isMobile = useIsMobile();
  const [filterCompany, setFilterCompany] = useState('');
  function keyPid(a) { return pid || a._pid; }
  function onDrop(status) {
    if (!dragId) return;
    const a = activities.find((x) => x.id === dragId.id && keyPid(x) === dragId.pid);
    if (a && a.status !== status) {
      updateActivity(dragId.pid, a.id, { status }, `Status alterado em "${a.title}": ${STATUS_META[status].label}`);
    }
    setDragId(null);
  }
  const visibleActivities = !groupInfo ? activities : activities.filter((a) => {
    if (filterCompany === '__geral__') return a._pid === groupInfo.masterId && (!a.involvedCompanyIds || a.involvedCompanyIds.length === 0);
    if (filterCompany) {
      const matchesNative = a._pid === filterCompany;
      const matchesTag = a._pid === groupInfo.masterId && (a.involvedCompanyIds || []).includes(filterCompany);
      return matchesNative || matchesTag;
    }
    return true;
  });
  return (
    <div>
      {onOpenTasks && <style>{TASK_CHIP_CSS}</style>}
      {groupInfo && (
        <div style={S.filterGroup}>
          <div style={S.filterLabel}>Empresa do grupo</div>
          <select style={S.filterSelect} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">Todas as atividades</option>
            <option value="__geral__">Geral do Grupo</option>
            {groupInfo.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ ...S.kanbanBoard, ...(isMobile ? S.kanbanBoardMobile : null) }}>
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const items = visibleActivities.filter((a) => a.status === status);
        return (
          <div key={status} style={{ ...S.kanbanCol, ...(isMobile ? S.kanbanColMobile : null) }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(status)}>
            <div style={S.kanbanColHead}>
              <span style={{ ...S.kanbanDot, background: meta.color }} />
              <span>{meta.label}</span>
              <span style={S.kanbanCount}>{items.length}</span>
            </div>
            {items.map((a) => {
              const rowPid = keyPid(a);
              const rowPhases = phases && phases.length ? phases : a._phases;
              const phase = rowPhases && rowPhases.find((p) => p.id === a.phase);
              const rowOrder = orderMap && orderMap[a.id] ? orderMap[a.id] : a._order;
              return (
                <div key={`${rowPid}-${a.id}`} draggable onDragStart={() => setDragId({ pid: rowPid, id: a.id })} onClick={() => openDetail(rowPid, a.id)} style={S.kanbanCard}>
                  <div style={S.kanbanCardTop}>
                    <span style={{ ...S.monthBadgeSm, background: phase?.color }}>#{rowOrder}</span>
                    <GripVertical size={13} color="var(--text-8)" />
                  </div>
                  {multiMode && <CompanyBadge name={a._companyName} color={a._companyColor} logo={a._companyLogo} small />}
                  {multiMode && a.groupActivityId && (
                    <span title={a.groupScopeType === 'all' ? 'Atividade do grupo inteiro' : 'Atividade vinculada a várias empresas do grupo'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5', marginTop: 3 }}>
                      <Users size={10} /> {a.groupScopeType === 'all' ? 'Grupo inteiro' : 'Várias empresas'}
                    </span>
                  )}
                  {involvedCompaniesLabel(a, groupInfo) && (
                    <span title="Empresas envolvidas nesta atividade" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#9b7af5', marginTop: 3 }}>
                      <Building2 size={10} /> {involvedCompaniesLabel(a, groupInfo)}
                    </span>
                  )}
                  <div style={S.kanbanCardTitle}>{a.title}</div>
                  <div style={S.kanbanCardMeta}>
                    <span>{a.responsible}</span>
                    <span>{fmtDate(a.date)}</span>
                  </div>
                  {onOpenTasks && <TaskCountChip counts={taskCounts && taskCounts[rowPid] && taskCounts[rowPid][a.id]} onOpenTasks={() => onOpenTasks(a.id, rowPid)} style={{ marginTop: 6 }} />}
                </div>
              );
            })}
            {status === 'nao-iniciado' && addActivity && (
              <button style={S.kanbanAdd} onClick={addActivity}><Plus size={13} /> Nova atividade</button>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

const GANTT_DAYS_PER_COL = { dia: 1, semana: 7, mes: 30.4368, ano: 365.25 };

export function TimelineView({ activities, phases, granularity, setGranularity, windowAnchor, setWindowAnchor, pid, updateActivity, openDetail, taskCounts, onOpenTasks }) {
  const isMobile = useIsMobile();
  const columns = buildTimelineColumns(granularity, activities, windowAnchor);
  const noDate = activities.filter((a) => !a.date);
  const windowed = granularity === 'dia' || granularity === 'semana';

  function nav(dir) {
    if (granularity === 'dia') setWindowAnchor((d) => addMonths(d, dir));
    else if (granularity === 'semana') setWindowAnchor((d) => addMonths(d, dir * 3));
  }

  const LABEL_W = 216;
  const colW = granularity === 'dia' ? 34 : granularity === 'semana' ? 70 : granularity === 'ano' ? 120 : 92;
  const totalW = LABEL_W + columns.length * colW;
  const daysPerCol = GANTT_DAYS_PER_COL[granularity] || 30.4368;

  const [dragBar, setDragBar] = useState(null);

  useEffect(() => {
    if (!dragBar) return;
    function onMove(e) {
      setDragBar((d) => (d ? { ...d, offsetPx: e.clientX - d.startX } : d));
    }
    function onCancel() { setDragBar(null); }
    function onUp(e) {
      setDragBar((d) => {
        if (d) {
          const pxMoved = e.clientX - d.startX;
          if (Math.abs(pxMoved) < (d.touch ? 8 : 4)) {
            openDetail(pid, d.id);
          } else {
            const deltaDays = Math.round((pxMoved / colW) * daysPerCol);
            if (deltaDays !== 0) {
              const newDate = toISODate(addDays(parseDate(d.origDate), deltaDays));
              const newEnd = toISODate(addDays(parseDate(d.origEndDate), deltaDays));
              updateActivity(pid, d.id, { date: newDate, endDate: newEnd }, `Atividade "${d.title}" reagendada no Gantt: ${fmtDate(newDate)} – ${fmtDate(newEnd)}`);
            }
          }
        }
        return null;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragBar, colW, daysPerCol, pid, updateActivity, openDetail]);

  const rows = [];
  let r = 1;
  phases.forEach((p) => {
    rows.push({ type: 'phase', row: r, phase: p });
    r++;
    const acts = activities.filter((a) => a.phase === p.id && a.date).sort((x, y) => x.date.localeCompare(y.date));
    acts.forEach((a) => {
      const sIdx = colIndexFor(a.date, columns);
      const eIdx = colIndexFor(a.endDate || a.date, columns);
      if (sIdx === null) return;
      rows.push({ type: 'bar', row: r, act: a, phase: p, sIdx, eIdx: Math.max(sIdx, eIdx === null ? sIdx : eIdx) });
      r++;
    });
  });
  const totalRows = r - 1;

  const todayISO = toISODate(startOfDay(new Date()));
  const todayColIdx = colIndexFor(todayISO, columns);
  const todayLeft = todayColIdx === null ? null : LABEL_W + todayColIdx * colW + fractionInColumn(todayISO, columns[todayColIdx]) * colW;

  return (
    <div>
      {onOpenTasks && <style>{TASK_CHIP_CSS}</style>}
      <div className="no-print" style={S.timelineToolbar}>
        <div style={S.granularityGroup}>
          {[{ id: 'dia', l: 'Dia' }, { id: 'semana', l: 'Semana' }, { id: 'mes', l: 'Mês' }, { id: 'ano', l: 'Ano' }].map((g) => (
            <button key={g.id} onClick={() => setGranularity(g.id)} style={{ ...S.granBtn, ...(isMobile ? { minWidth: 44, minHeight: 44 } : null), ...(granularity === g.id ? S.granBtnActive : {}) }}>{g.l}</button>
          ))}
        </div>
        {windowed && (
          <div style={S.navGroup}>
            <button aria-label="Período anterior" title="Período anterior" style={S.navBtn} onClick={() => nav(-1)}>‹</button>
            <span style={S.navLabel}>{granularity === 'dia' ? fmtMonthTitle(windowAnchor) : `${fmtMonthTitle(addMonths(windowAnchor, -1))} — ${fmtMonthTitle(addMonths(windowAnchor, 1))}`}</span>
            <button aria-label="Próximo período" title="Próximo período" style={S.navBtn} onClick={() => nav(1)}>›</button>
            <button style={S.navToday} onClick={() => setWindowAnchor(new Date())}>Hoje</button>
          </div>
        )}
      </div>

      {columns.length === 0 ? (
        <div style={S.emptyMuted}>Nenhuma atividade com data cadastrada para exibir no Gantt.</div>
      ) : (
        <div style={S.ganttScroll}>
          <div style={{ ...S.ganttGrid, width: totalW, gridTemplateColumns: `${LABEL_W}px repeat(${columns.length}, ${colW}px)`, gridTemplateRows: `32px repeat(${totalRows}, 46px)` }}>
            <div style={{ gridRow: 1, gridColumn: 1, ...S.ganttCornerCell }} />
            {columns.map((c, i) => (
              <div key={c.key} style={{ gridRow: 1, gridColumn: i + 2, ...S.ganttColHeader }}>{c.label}</div>
            ))}

            {rows.map((row) => row.type === 'phase' ? (
              <div key={'ph' + row.phase.id} style={{ gridRow: row.row + 1, gridColumn: `1 / -1`, ...S.ganttPhaseRow }}>
                <span style={{ ...S.timelineLaneDot, background: row.phase.color }} />
                {row.phase.name}
              </div>
            ) : (
              <React.Fragment key={row.act.id}>
                <div style={{ gridRow: row.row + 1, gridColumn: 1, ...S.ganttLabelCell }}>
                  <div style={S.ganttLabelTitle}>{row.act.title}</div>
                  {onOpenTasks && taskCounts && taskCounts[row.act.id] ? (
                    <div style={{ ...S.ganttLabelMeta, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.act.responsible}</span>
                      <span className="no-print" style={{ flexShrink: 0 }}>
                        <TaskCountChip counts={taskCounts[row.act.id]} onOpenTasks={() => onOpenTasks(row.act.id)} style={{ marginTop: 0, minHeight: 0, padding: '0 7px', fontSize: 9.5, lineHeight: '15px' }} />
                      </span>
                    </div>
                  ) : <div style={S.ganttLabelMeta}>{row.act.responsible}</div>}
                </div>
                <div style={{ gridRow: row.row + 1, gridColumn: `${row.sIdx + 2} / ${row.eIdx + 3}`, ...S.ganttBarWrap }}>
                  <div
                    className="no-print"
                    style={{
                      ...S.ganttBar,
                      background: STATUS_META[row.act.status].bg,
                      borderColor: row.phase.color,
                      cursor: dragBar && dragBar.id === row.act.id ? 'grabbing' : 'grab',
                      position: 'relative',
                      transform: dragBar && dragBar.id === row.act.id ? `translateX(${dragBar.offsetPx}px)` : undefined,
                      boxShadow: dragBar && dragBar.id === row.act.id ? '0 6px 16px rgba(0,0,0,.5)' : undefined,
                      zIndex: dragBar && dragBar.id === row.act.id ? 5 : undefined,
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                    title={`${row.act.title}\n${fmtDate(row.act.date)} – ${fmtDate(row.act.endDate || row.act.date)}\nClique para abrir · arraste para reagendar`}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'mouse' && e.button !== 0) return;
                      e.preventDefault();
                      setDragBar({ id: row.act.id, title: row.act.title, startX: e.clientX, origDate: row.act.date, origEndDate: row.act.endDate || row.act.date, offsetPx: 0, touch: e.pointerType !== 'mouse' });
                    }}
                  >
                    <span style={{ ...S.ganttBarDot, background: STATUS_META[row.act.status].color }} />
                    <span style={S.ganttBarTitle}>{row.act.title}</span>
                  </div>
                </div>
              </React.Fragment>
            ))}

            {todayLeft !== null && (
              <div style={{ ...S.ganttTodayLine, left: todayLeft, height: 32 + totalRows * 46 }} />
            )}
          </div>
        </div>
      )}

      {noDate.length > 0 && (
        <div style={S.noDateBlock}>
          <div style={S.noDateLabel}>Sem data definida ({noDate.length})</div>
          <div style={S.noDateList}>
            {noDate.map((a) => <span key={a.id} style={S.noDateChip}>{a.title}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
