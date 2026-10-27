// Negócios (PRD 12/13): quadro Kanban por etapa + lista. Arrastar o cartão move
// de etapa; soltar em Ganho/Perdido abre o diálogo de fechamento (motivo da
// perda é obrigatório). O mesmo funil serve novo negócio e upsell — o filtro de
// tipo separa. Arrastar não existe no celular: lá o cartão tem o seletor “Mover para…” (e a etapa também muda na ficha do negócio).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Kanban, List, Sparkles, Settings2, Upload, DatabaseBackup, MoreVertical, User, Download, CalendarPlus, StickyNote, Trophy, ThumbsDown, Building2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { moveDealInBoard } from './boardMove.js';
import { isTransientSaveError, retryDelay } from '../lib/saveRetry.js';
import { notify, askText, askConfirm } from '../ui/dialogs.jsx';
import CloseDealDialog from './CloseDealDialog.jsx';
import FunnelsAdmin from './FunnelsAdmin.jsx';
import DealImportWizard from './DealImportWizard.jsx';
import PipeRunMigration from './PipeRunMigration.jsx';
import SavedViewsBar, { ViewDialogGuarded } from './SavedViews.jsx';
import ContactLinks from './ContactLinks.jsx';
import { InlineMoney, InlineDate, InlineSelect } from './InlineCells.jsx';
import { fmtMoney, fmtDateBR, DEAL_TYPE_META, DEAL_STATUS_META, stageAgeColor, cadenceNotice, tagColor, tagTint, avatarStyle } from './crmMeta.js';
import { trackFlow } from '../lib/experience.js';
import TagFilter from './TagFilter.jsx';

const VIEW_KEY = 'crm-deals-view';
const PIPE_KEY = 'crm-deals-pipeline';
function readPipe() { try { return window.localStorage.getItem(PIPE_KEY) || ''; } catch { return ''; } }
function readView() { try { return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; } }

const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const fmtShort = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}` : ''; };

// Ações rápidas do cartão (como o ⋮ do PipeRun): agendar, anotar, ganhar, perder e abrir a empresa, sem abrir a ficha.
function QuickMenu({ deal, canWrite, onQuick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const run = (a) => (e) => { e.stopPropagation(); setOpen(false); onQuick(a, deal); };
  const isOpen = deal.status === 'open';
  return (
    <div className="crm-quick" ref={ref} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button type="button" className="crm-icon-btn" aria-label={`Ações do negócio ${deal.title}`} aria-haspopup="menu" aria-expanded={open} title="Ações rápidas" onClick={() => setOpen((o) => !o)}><MoreVertical size={15} aria-hidden="true" /></button>
      {open && (
        <div className="crm-quick-menu" role="menu">
          {canWrite && isOpen && <button type="button" role="menuitem" onClick={run('activity')}><CalendarPlus size={14} /> Agendar atividade</button>}
          {canWrite && <button type="button" role="menuitem" onClick={run('note')}><StickyNote size={14} /> Adicionar nota</button>}
          {canWrite && isOpen && <button type="button" role="menuitem" onClick={run('won')}><Trophy size={14} color="#3ecf6e" /> Ganhar</button>}
          {canWrite && isOpen && <button type="button" role="menuitem" onClick={run('lost')}><ThumbsDown size={14} color="#e2574c" /> Perder</button>}
          <button type="button" role="menuitem" onClick={run('company')}><Building2 size={14} /> Abrir a empresa</button>
        </div>
      )}
    </div>
  );
}

// memo: com centenas de cartões, arrastar não pode re-renderizar o quadro inteiro a cada passo (§119). As funções chegam estáveis (cardOpen, cardQuick…).
const DealCard = React.memo(function DealCard({ deal, stages, canDrag, canWrite, dragging, onOpen, onMove, onQuick, onDragStart, onDragEnd }) {
  const closed = deal.status !== 'open';
  const tone = !closed && deal.nextActivityOverdue ? ' tone-late' : (!closed && deal.noNextStep ? ' tone-warn' : '');
  const place = [deal.companyCity, deal.companyState].filter(Boolean).join('/');
  return (
    // div (não button): o Firefox não inicia arrasto em <button>. Teclado abre com Enter/Espaço.
    <div role="button" tabIndex={0} className={`crm-deal${dragging ? ' dragging' : ''}${tone}`} style={deal.stageColor ? { '--stage': deal.stageColor } : undefined} draggable={canDrag} onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(deal.id); } }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal.id); onDragStart(deal.id); }} onDragEnd={onDragEnd}>
      <div className="crm-deal-top">
        <div className="crm-deal-title">{deal.title}</div>
        <div className="crm-deal-tools">
          {deal.ownerName && <span className="crm-avatar" style={avatarStyle(deal.ownerName)} title={`Responsável: ${deal.ownerName}`} aria-label={`Responsável: ${deal.ownerName}`}>{initialsOf(deal.ownerName)}</span>}
          <QuickMenu deal={deal} canWrite={canWrite} onQuick={onQuick} />
        </div>
      </div>
      <div className="crm-deal-co">{deal.companyName}{place ? ` · ${place}` : ''}</div>
      {deal.contactName && <div className="crm-deal-line"><User size={11} aria-hidden="true" /> {deal.contactName}</div>}
      <ContactLinks phone={deal.contactPhone} whatsapp={deal.contactWhatsapp} email={deal.contactEmail} compact />
      {deal.source && <div className="crm-deal-line crm-muted">Origem: {deal.source}</div>}
      <div className="crm-deal-meta">
        <span className="crm-deal-value">{deal.value ? fmtMoney(deal.value) : <span className="crm-muted">sem valor</span>}</span>
        {!closed && <span>{deal.probability}%</span>}
      </div>
      {deal.mrr > 0 && <div className="crm-deal-line" title="Receita recorrente mensal">MRR {fmtMoney(deal.mrr)}</div>}
      <div className="crm-tags">
        {(deal.tags || []).map((t) => <span key={t} className="crm-tag" style={{ color: tagColor(t), background: tagTint(t) }}>{t}</span>)}
        {!closed && deal.slaExceeded && <span className="crm-tag" title={`Prazo da etapa: ${deal.slaDays} dia(s)`} style={{ color: '#e2574c' }}>Prazo da etapa estourado ({deal.daysInStage}/{deal.slaDays} d)</span>}
        {deal.dealType === 'upsell' && <span className="crm-tag" style={{ color: DEAL_TYPE_META.upsell.color }}>Upsell</span>}
        {deal.status === 'lost' && <span className="crm-tag" style={{ color: DEAL_STATUS_META.lost.color }}>{deal.lostReasonLabel || 'Perdido'}</span>}
        {deal.overdue && <span className="crm-tag" style={{ color: '#e2574c' }}>Previsão vencida</span>}
        {deal.noNextStep && <span className="crm-tag" style={{ color: '#ff9f40' }}>Sem próximo passo</span>}
        {!closed && deal.nextActivityDate && <span className="crm-tag" title={deal.nextActivityTitle || undefined} style={{ color: deal.nextActivityOverdue ? '#e2574c' : 'var(--text-5)' }}>{deal.nextActivityOverdue ? 'Passo atrasado ' : 'Próx. '}{fmtShort(deal.nextActivityDate)}{deal.nextActivityTime ? ` ${deal.nextActivityTime}` : ''}{deal.nextActivityTitle ? ` · ${deal.nextActivityTitle}` : ''}</span>}
        {!closed && (deal.daysInStage || 0) > 14 && <span className="crm-tag" style={{ color: stageAgeColor(deal.daysInStage) }}>{deal.daysInStage} dias parado</span>}
      </div>
      <div className="crm-deal-foot">{deal.ownerName ? deal.ownerName : <span className="crm-muted">Sem responsável</span>}<span className="crm-muted"> · criado {fmtDateBR(deal.createdAt)}</span></div>
      {canDrag && (
        <div className="crm-deal-move" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <select value="" aria-label={`Mover o negócio ${deal.title} para outra etapa`} onChange={(e) => { if (e.target.value) onMove(deal, e.target.value); }}>
            <option value="">Mover para…</option>
            {stages.filter((s) => s.id !== deal.stageId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
});

// Exportação: o que está na lista, com os mesmos filtros, em planilha aberta pelo Excel (CSV com ; e BOM).
async function exportDealsCsv(f) {
  const rows = []; let offset = 0;
  for (;;) {
    const r = await crm.deals({ ...f, limit: 200, offset, sort: 'recent' });
    rows.push(...r.items);
    offset += 200;
    if (offset >= r.total || rows.length >= 5000) break;
  }
  const SIT = { open: 'Aberto', won: 'Ganho', lost: 'Perdido' };
  const cols = [['Negócio', (d) => d.title], ['Empresa', (d) => d.companyName], ['Cidade/UF', (d) => [d.companyCity, d.companyState].filter(Boolean).join('/')], ['Contato', (d) => d.contactName], ['Origem', (d) => d.source],
    ['Etapa', (d) => d.stageName], ['Situação', (d) => SIT[d.status]], ['Motivo da perda', (d) => d.lostReasonLabel], ['Valor', (d) => String(d.value || 0).replace('.', ',')], ['Probabilidade (%)', (d) => (d.status === 'open' ? d.probability : '')],
    ['Responsável', (d) => d.ownerName], ['Tipo', (d) => DEAL_TYPE_META[d.dealType].label], ['Criado em', (d) => fmtDateBR(d.createdAt)], ['Fechado em', (d) => fmtDateBR(d.closedAt)], ['Previsão', (d) => fmtDateBR(d.expectedCloseDate)],
    ['Dias na etapa', (d) => (d.status === 'open' ? d.daysInStage : '')], ['Próxima atividade', (d) => [fmtDateBR(d.nextActivityDate), d.nextActivityTime, d.nextActivityTitle].filter(Boolean).join(' ')]];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const body = [cols.map((c) => esc(c[0])).join(';'), ...rows.map((d) => cols.map((c) => esc(c[1](d))).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`\ufeff${body}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `negocios-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return rows.length;
}

const ATTENTION = [['late', 'Passo atrasado'], ['nonext', 'Sem próximo passo'], ['stalled', 'Parados +14 dias'], ['overdue', 'Previsão vencida']];

const EMPTY_FILTERS = { type: '', ownerId: '', source: '', tag: '', attention: '' };
const fieldsOf = (c) => ({ type: c.type || '', ownerId: c.ownerId || '', source: c.source || '', tag: c.tag || '', attention: c.attention || '', q: c.q || '', listStatus: c.listStatus || 'open' });
const sameFields = (a, b) => ['type', 'ownerId', 'source', 'tag', 'attention', 'q', 'listStatus'].every((k) => a[k] === b[k]);

// preset: filtros vindos dos painéis da Visão geral (ex.: "negócios sem próximo passo", "do Fulano") — aplicados uma vez.
export default function DealsPage({ caps, options, refreshKey, currentUserId, preset, onPresetConsumed, onOpenDeal, onOpenCompany, onNewDeal, onNewActivity, onChanged }) {
  const [view, setView] = useState(readView);
  const [pipelineId, setPipelineId] = useState(readPipe); // '' = padrão; 'all' = todos (só na lista)
  const [showFunnels, setShowFunnels] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPipeRun, setShowPipeRun] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [views, setViews] = useState([]);
  const [viewDefault, setViewDefault] = useState('');
  const [activeView, setActiveView] = useState(''); // id de visão salva em uso ('' = nenhuma)
  const [viewDialog, setViewDialog] = useState(null); // {view?} (view = edição)
  const [ready, setReady] = useState(false); // só carrega negócios depois de saber a visão padrão
  const presetRef = useRef(preset);
  const [tagList, setTagList] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [listStatus, setListStatus] = useState('open');
  const [board, setBoard] = useState(null);
  const [list, setList] = useState({ total: 0, totalValue: 0, totalWeighted: 0, items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [closing, setClosing] = useState(null); // {deal, stage}
  const [localKey, setLocalKey] = useState(0);
  const reload = useCallback(() => setLocalKey((k) => k + 1), []);
  // Arrastar (§119): o id arrastado e os movimentos em andamento ficam em refs — o `drop` e o `dragover` não podem depender de o React já ter
  // re-renderizado (num computador lento isso levava segundos e o navegador soltava o cartão sem gravar).
  const dragIdRef = useRef(null);
  const pendingMoves = useRef(0);
  const latest = useRef({});
  const cardOpen = useCallback((id) => latest.current.onOpenDeal(id), []);
  const cardQuick = useCallback((a, d) => latest.current.quick(a, d), []);
  const cardMove = useCallback((deal, stageId) => latest.current.moveToStageId(deal, stageId), []);
  const cardDragStart = useCallback((id) => { dragIdRef.current = id; setDragId(id); }, []);
  const cardDragEnd = useCallback(() => { dragIdRef.current = null; setDragId(null); setOverStage(null); }, []);
  // Só {id, nome} das etapas, com identidade estável enquanto as etapas não mudam: mover um cartão não pode invalidar o `memo` dos outros.
  const stageKey = board ? board.stages.map((x) => `${x.id}:${x.name}`).join('|') : '';
  const stageOptions = useMemo(() => (board ? board.stages.map((x) => ({ id: x.id, name: x.name })) : []), [stageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { crm.tags().then((r) => setTagList(r.tags || [])).catch(() => {}); }, [localKey]);
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
  // 1º acesso (sem funil lembrado): abre o funil onde a pessoa tem mais negócios em aberto, em vez do funil padrão.
  useEffect(() => {
    if (readPipe() || !currentUserId) return undefined;
    let cancelled = false;
    crm.deals({ ownerId: currentUserId, status: 'open', limit: 200 }).then((r) => {
      if (cancelled) return;
      const n = {}; (r.items || []).forEach((d) => { n[d.pipelineId] = (n[d.pipelineId] || 0) + 1; });
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
      if (best && !readPipe()) { setPipelineId(best[0]); try { window.localStorage.setItem(PIPE_KEY, best[0]); } catch { /* sem storage */ } }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentUserId]);
  function changePipeline(v) { setPipelineId(v); try { window.localStorage.setItem(PIPE_KEY, v); } catch { /* sem storage */ } }
  function changeView(v) { setView(v); try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* sem storage: só não lembra */ } }

  // Aplica uma configuração de visão na tela. ownerId 'me' vira a pessoa logada; campos que a visão não define ficam como estão.
  function applyConfig(c, id = '') {
    if (c.view) changeView(c.view === 'list' ? 'list' : 'board');
    if (c.pipelineId !== undefined) changePipeline(c.pipelineId);
    const f = fieldsOf(c);
    setQ(f.q); setDebouncedQ(f.q); setListStatus(f.listStatus);
    setFilters({ type: f.type, ownerId: f.ownerId === 'me' ? (currentUserId || '') : f.ownerId, source: f.source, tag: f.tag, attention: f.attention });
    setActiveView(id);
  }
  const configOf = (ref) => (ref === 'all' ? { ...EMPTY_FILTERS, q: '', listStatus: 'open' } : ref === 'mine' ? { ...EMPTY_FILTERS, ownerId: 'me', q: '', listStatus: 'open' } : (views.find((v) => v.id === ref) || {}).config);
  function pickView(ref) { const c = configOf(ref); if (c) { applyConfig(c, views.some((v) => v.id === ref) ? ref : ''); trackFlow('crm.visao.aplicar', 'ok'); } }

  useEffect(() => {
    let cancelled = false;
    crm.views('deals').then((r) => {
      if (cancelled) return;
      const list = r.views || []; const def = (r.defaults && r.defaults.deals) || '';
      setViews(list); setViewDefault(def);
      if (!presetRef.current && def) {
        const saved = list.find((v) => v.id === def);
        if (saved) applyConfig(saved.config, saved.id); else if (def === 'mine') applyConfig({ ...EMPTY_FILTERS, ownerId: 'me', q: '', listStatus: 'open' });
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!preset || !ready) return;
    applyConfig({ ...EMPTY_FILTERS, q: '', listStatus: 'open', ...preset });
    if (onPresetConsumed) onPresetConsumed();
  }, [preset, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // A configuração que está na tela agora, no formato salvo (a própria pessoa vira 'me', para a visão servir a qualquer um).
  const currentConfig = () => ({ view, pipelineId: view === 'board' ? selectedPipe : (pipelineId || 'all'), q: debouncedQ, type: filters.type, ownerId: filters.ownerId === currentUserId && currentUserId ? 'me' : filters.ownerId, source: filters.source, tag: filters.tag, attention: filters.attention, listStatus });
  const effPipe = (p) => p || (defaultPipe && defaultPipe.id) || '';
  async function saveViews(fn, quiet) { try { await fn(); const r = await crm.views('deals'); setViews(r.views || []); setViewDefault((r.defaults && r.defaults.deals) || ''); } catch (e) { if (!quiet) notify(e.message || 'Não foi possível salvar a visão.', { tone: 'error' }); throw e; } }
  async function submitViewDialog(v, { name, shared }) {
    await saveViews(async () => {
      if (v) await crm.updateView(v.id, { name, shared });
      else { const r = await crm.createView({ scope: 'deals', name, shared, config: currentConfig() }); setActiveView(r.view.id); trackFlow('crm.visao.salvar', 'ok'); }
    }, true); // erro aparece dentro do diálogo
    setViewDialog(null); notify(v ? 'Visão atualizada.' : 'Visão salva. Ela fica na barra “Visões”.', { tone: 'success' });
  }
  async function updateViewFilters(v) { try { await saveViews(() => crm.updateView(v.id, { config: currentConfig() })); notify(`Visão “${v.name}” atualizada.`, { tone: 'success' }); } catch { /* aviso já mostrado */ } }
  async function toggleShare(v) { try { await saveViews(() => crm.updateView(v.id, { shared: !v.shared })); notify(v.shared ? 'Agora só você vê esta visão.' : 'Visão compartilhada com o time.', { tone: 'success' }); } catch { /* aviso já mostrado */ } }
  async function setDefaultView(ref) { try { const off = viewDefault === ref; await saveViews(() => crm.setViewDefault('deals', off ? null : ref)); notify(off ? 'Negócios volta a abrir sem visão.' : 'Esta visão passa a abrir ao entrar em Negócios.', { tone: 'success' }); } catch { /* aviso já mostrado */ } }
  async function removeView(v) {
    const ok = await askConfirm({ title: `Excluir a visão “${v.name}”?`, message: v.shared ? 'Ela some para todo o time.' : 'Os filtros que ela guardava não são afetados.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try { await saveViews(() => crm.deleteView(v.id)); if (activeView === v.id) setActiveView(''); notify('Visão excluída.', { tone: 'success' }); } catch { /* aviso já mostrado */ }
  }

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    setLoading(true);
    // Quadro mostra UM funil (vazio = o padrão); a lista pode juntar todos ('all'/vazio).
    const f = { q: debouncedQ, type: filters.type, ownerId: filters.ownerId, source: filters.source, tag: filters.tag, attention: filters.attention, pipelineId: pipelineId === 'all' ? '' : pipelineId };
    const req = view === 'board' ? crm.board(f).then((r) => { if (!cancelled) setBoard(r); }) : crm.deals({ ...f, status: listStatus, limit: 100, sort: 'recent' }).then((r) => { if (!cancelled) setList(r); });
    req.then(() => { if (!cancelled) { setError(''); setLoading(false); } }).catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar os negócios.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ready, view, pipelineId, debouncedQ, filters, listStatus, refreshKey, localKey]);

  const owners = (options && options.owners) || [];
  const pipelines = (options && options.pipelines) || [];
  // Funil lembrado que não existe mais (arquivado, ou de outra conta): volta ao padrão em vez de mostrar uma lista vazia.
  useEffect(() => { if (options && options.pipelines && pipelineId && pipelineId !== 'all' && !options.pipelines.some((p) => p.id === pipelineId)) changePipeline(''); }, [options, pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultPipe = pipelines.find((p) => p.isDefault) || pipelines[0];
  const selectedPipe = view === 'board' ? ((board && board.pipeline && board.pipeline.id) || (pipelineId && pipelineId !== 'all' ? pipelineId : (defaultPipe && defaultPipe.id) || '')) : (pipelineId || 'all');
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilter = debouncedQ || filters.type || filters.ownerId || filters.source || filters.tag || filters.attention;
  const sources = (options && options.dealSources) || [];
  const reasons = (options && options.lostReasons) || [];
  const activeSaved = views.find((v) => v.id === activeView);
  const viewDirty = !!activeSaved && (!sameFields(fieldsOf(currentConfig()), fieldsOf(activeSaved.config)) || currentConfig().view !== activeSaved.config.view || effPipe(currentConfig().pipelineId) !== effPipe(activeSaved.config.pipelineId));
  const builtinActive = (() => { if (activeSaved) return ''; const cur = fieldsOf(currentConfig()); const flt = (c) => ({ ...fieldsOf(c), listStatus: '' }); return ['all', 'mine'].find((b) => sameFields({ ...cur, listStatus: '' }, flt(configOf(b)))) || ''; })();


  async function drop(stage) {
    const id = dragIdRef.current || dragId;
    dragIdRef.current = null;
    setDragId(null); setOverStage(null);
    if (!id || !board) return;
    const deal = board.stages.flatMap((s) => s.deals).find((d) => d.id === id);
    if (deal) await moveDeal(deal, stage);
  }

  // Mover de etapa: o cartão muda de coluna NA HORA (o quadro só mostrava a mudança depois da volta do servidor — em máquina lenta ou
  // quadro grande eram vários segundos, e parecia que "não gravou"). Se o servidor recusar, volta atrás com a mensagem; ao terminar, a tela
  // recarrega com os números exatos. Ganhar/perder continua passando pelo diálogo de fechamento.
  async function moveDeal(deal, stage) {
    if (deal.stageId === stage.id) return;
    if (stage.kind !== 'open') { setClosing({ deal, stage }); return; }
    const fromId = deal.stageId;
    const fromStage = board && board.stages.find((s) => s.id === fromId);
    pendingMoves.current += 1;
    if (view === 'board') setBoard((b) => moveDealInBoard(b, deal.id, stage.id));
    try {
      // Mover para a mesma etapa de novo é inofensivo (o servidor ignora): por isso falha de rede/servidor repete sozinha antes de desistir.
      let r = null;
      for (let attempt = 0; ; attempt += 1) {
        try { r = await crm.moveDeal(deal.id, { stageId: stage.id }); break; } catch (e) {
          if (!isTransientSaveError(e) || attempt >= 2) throw e;
          if (attempt === 0) notify('Sem conexão com o servidor — tentando mover de novo…', { tone: 'info', ttlMs: 5000 });
          await new Promise((res) => setTimeout(res, retryDelay(attempt)));
        }
      }
      trackFlow('crm.negocio.mover_etapa', 'ok');
      notify(`Movido para ${stage.name}.`, { tone: 'success', ttlMs: 5000, ...(!fromStage || fromStage.kind === 'open' ? { undo: () => undoMove(deal, fromId) } : {}) });
      const m = cadenceNotice(r.cadence); if (m) notify(m, { tone: 'success', ttlMs: 7000 });
      if (onChanged) onChanged();
    } catch (e) {
      trackFlow('crm.negocio.mover_etapa', 'error');
      if (view === 'board') setBoard((b) => moveDealInBoard(b, deal.id, fromId));
      notify(e.message || 'Não foi possível mover o negócio.', { tone: 'error' });
    } finally {
      pendingMoves.current -= 1;
      if (pendingMoves.current === 0) reload();
    }
  }
  async function undoMove(deal, fromId) {
    trackFlow('crm.negocio.mover_etapa', 'undo');
    try { await crm.moveDeal(deal.id, { stageId: fromId }); } catch (e) { notify(e.message || 'Não foi possível desfazer.', { tone: 'error' }); }
    reload(); if (onChanged) onChanged();
  }
  latest.current = { onOpenDeal, quick, moveToStageId: (deal, stageId) => { const st = board && board.stages.find((x) => x.id === stageId); if (st) moveDeal(deal, st); } };

  // Edição direta na lista: salva na hora; se o servidor recusar (ou ignorar), avisa e recarrega o valor real.
  async function patchDeal(deal, patch) {
    try {
      const r = await crm.updateDeal(deal.id, patch);
      if (patch.value !== undefined && Number(r.deal.value) !== Number(patch.value)) notify('O valor deste negócio vem dos produtos dele — edite os produtos na ficha.', { tone: 'info', ttlMs: 6000 });
      else {
        trackFlow('crm.negocio.editar_direto', 'ok');
        const prev = {}; Object.keys(patch).forEach((k) => { prev[k] = k === 'value' ? Number(deal.value || 0) : (deal[k] === undefined ? null : deal[k]); });
        notify('Salvo.', { tone: 'success', undo: async () => { trackFlow('crm.negocio.editar_direto', 'undo'); try { await crm.updateDeal(deal.id, prev); } catch (e) { notify(e.message || 'Não foi possível desfazer.', { tone: 'error' }); } reload(); if (onChanged) onChanged(); } });
      }
    } catch (e) { trackFlow('crm.negocio.editar_direto', 'error'); notify(e.message || 'Não foi possível salvar.', { tone: 'error' }); }
    reload(); if (onChanged) onChanged();
  }
  const pipeStages = (pid) => { const p = ((options && options.pipelines) || []).find((x) => x.id === pid); return p ? p.stages || [] : []; };

  async function quick(action, deal) {
    if (action === 'company') { if (onOpenCompany) onOpenCompany(deal.companyId); return; }
    if (action === 'activity') { if (onNewActivity) onNewActivity({ company: { id: deal.companyId, legalName: deal.companyName }, prefill: { dealId: deal.id, contactId: deal.primaryContactId || '' } }); return; }
    if (action === 'won' || action === 'lost') {
      const st = board && board.stages.find((x) => x.kind === action);
      if (st) setClosing({ deal, stage: st });
      return;
    }
    if (action === 'note') {
      const body = await askText({ title: `Nota sobre "${deal.title}"`, label: 'Nota', multiline: true, confirmLabel: 'Adicionar nota' });
      if (!body) return;
      try { await crm.addNote({ entityType: 'deal', entityId: deal.id, body }); notify('Nota adicionada.', { tone: 'success' }); reload(); } catch (e) { notify(e.message || 'Não foi possível adicionar a nota.', { tone: 'error' }); }
    }
  }
  async function doExport() {
    setExporting(true);
    try { const n = await exportDealsCsv({ q: debouncedQ, type: filters.type, ownerId: filters.ownerId, source: filters.source, tag: filters.tag, attention: filters.attention, status: listStatus, pipelineId: pipelineId === 'all' ? '' : pipelineId }); notify(`${n} negócio(s) exportado(s).`, { tone: 'success' }); } catch (e) { notify(e.message || 'Não foi possível exportar.', { tone: 'error' }); } finally { setExporting(false); }
  }

  const totalOpen = board ? board.stages.filter((s) => s.kind === 'open').reduce((a, s) => ({ n: a.n + s.count, v: a.v + s.value, w: a.w + s.weighted }), { n: 0, v: 0, w: 0 }) : null;

  return (
    <div>
      <div className="crm-page-head">
        <div>
          <h1 className="crm-h1">Negócios</h1>
          <div className="crm-sub">
            {totalOpen ? `${totalOpen.n} em aberto · ${fmtMoney(totalOpen.v) || 'R$ 0'} · ponderado ${fmtMoney(totalOpen.w) || 'R$ 0'}` : 'O funil comercial: cada negócio pertence a uma empresa.'}
          </div>
        </div>
        <div className="crm-actions">
          <div className="crm-seg" role="group" aria-label="Modo de visualização">
            <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => changeView('board')}><Kanban size={14} /> Quadro</button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')}><List size={14} /> Lista</button>
          </div>
          {caps.funnel && <button type="button" className="crm-btn" onClick={() => setShowFunnels(true)}><Settings2 size={14} /> Funis</button>}
          {caps.import && <button type="button" className="crm-btn" onClick={() => setShowImport(true)}><Upload size={14} /> Importar negócios</button>}
          {caps.admin && <button type="button" className="crm-btn" onClick={() => setShowPipeRun(true)}><DatabaseBackup size={14} /> Migrar do PipeRun</button>}
          {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={() => onNewDeal({ pipelineId: view === 'board' ? selectedPipe : (pipelineId !== 'all' ? pipelineId : '') })}><Plus size={14} /> Criar negócio</button>}
        </div>
      </div>

      <SavedViewsBar views={views} activeId={activeView} dirty={viewDirty} builtinActive={builtinActive} defaultRef={viewDefault} canShare={!!caps.funnel}
        onPick={pickView} onSaveNew={() => setViewDialog({})} onUpdate={updateViewFilters} onEdit={(v) => setViewDialog({ view: v })} onToggleShare={toggleShare} onDefault={setDefaultView} onDelete={removeView} />

      <div className="crm-filters">
        {pipelines.length > 1 && (
          <select value={selectedPipe} onChange={(e) => changePipeline(e.target.value)} aria-label="Funil" style={{ fontWeight: 800 }}>
            {view === 'list' && <option value="all">Todos os funis</option>}
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (padrão)' : ''}</option>)}
          </select>
        )}
        <input aria-label="Buscar negócio, empresa, contato, tag ou comentário" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: negócio, empresa, contato, tag, comentário…" title="Procura no título, na descrição, na empresa, nos contatos, nas tags, nos comentários e nas atividades" style={{ minWidth: 230 }} />
        <select value={filters.type} onChange={(e) => setF('type', e.target.value)} aria-label="Tipo de negócio">
          <option value="">Novo negócio e upsell</option><option value="new">Só novos negócios</option><option value="upsell">Só upsell</option>
        </select>
        <select value={filters.ownerId} onChange={(e) => setF('ownerId', e.target.value)} aria-label="Responsável">
          <option value="">Todo responsável</option><option value="none">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {sources.length > 0 && (
          <select value={filters.source} onChange={(e) => setF('source', e.target.value)} aria-label="Origem do negócio">
            <option value="">Toda origem</option>{sources.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <TagFilter tagList={tagList} value={filters.tag} onChange={(v) => setF('tag', v)} />
        {currentUserId && <button type="button" className={`crm-chip${filters.ownerId === currentUserId ? ' active' : ''}`} aria-pressed={filters.ownerId === currentUserId} onClick={() => setF('ownerId', filters.ownerId === currentUserId ? '' : currentUserId)}>Meus negócios</button>}
        {view === 'list' && (
          <select value={listStatus} onChange={(e) => setListStatus(e.target.value)} aria-label="Situação">
            <option value="open">Em aberto</option><option value="won">Ganhos</option><option value="lost">Perdidos</option><option value="all">Todos</option>
          </select>
        )}
        {view === 'list' && <button type="button" className="crm-btn" onClick={doExport} disabled={exporting} title={exporting ? 'Aguarde terminar a exportação' : 'Baixar os negócios desta lista em planilha (CSV)'}><Download size={14} /> {exporting ? 'Exportando…' : 'Exportar'}</button>}
        {hasFilter && <button type="button" className="crm-btn" onClick={() => { setQ(''); setFilters(EMPTY_FILTERS); }}>Limpar</button>}
      </div>

      <div className="crm-filters" role="group" aria-label="Negócios que pedem atenção" style={{ marginTop: -4 }}>
        <span className="crm-muted" style={{ fontSize: 12 }}>Pedem atenção:</span>
        {ATTENTION.map(([k, l]) => {
          const n = board && board.attention ? board.attention[k] : null;
          return <button key={k} type="button" className={`crm-chip${filters.attention === k ? ' active' : ''}`} aria-pressed={filters.attention === k} onClick={() => setF('attention', filters.attention === k ? '' : k)}>{l}{view === 'board' && n != null ? ` (${n})` : ''}</button>;
        })}
      </div>

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}

      {view === 'board' && board && (
        <>
          <div className="crm-board">
            {board.stages.map((s) => (
              <div key={s.id} className={`crm-col${overStage === s.id ? ' over' : ''}`} style={s.color ? { '--stage': s.color } : undefined}
                onDragOver={(e) => { if (dragIdRef.current && caps.write) { e.preventDefault(); if (overStage !== s.id) setOverStage(s.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget) && overStage === s.id) setOverStage(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s); }}>
                <div className="crm-col-head">
                  <div className="crm-col-title"><span className="crm-dot" style={{ background: s.color || 'var(--border-3)' }} />{s.name}<span className="crm-col-count">{s.count}</span></div>
                  <div className="crm-col-sum">{s.count ? `${fmtMoney(s.value) || 'R$ 0'}${s.kind === 'open' ? ` · pond. ${fmtMoney(s.weighted) || 'R$ 0'}` : ''}` : (s.kind === 'open' ? `${s.probability}% de chance` : '—')}</div>
                </div>
                <div className="crm-col-body">
                  {s.deals.map((d) => <DealCard key={d.id} deal={d} stages={stageOptions} canDrag={caps.write} canWrite={caps.write} onQuick={cardQuick} dragging={dragId === d.id} onOpen={cardOpen} onMove={cardMove} onDragStart={cardDragStart} onDragEnd={cardDragEnd} />)}
                  {s.deals.length === 0 && <div className="crm-col-empty">{s.kind === 'open' ? 'Nenhum negócio aqui.' : `Sem ${s.kind === 'won' ? 'ganhos' : 'perdas'} nos últimos ${board.closedWindowDays} dias.`}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="crm-muted">Ganhos e perdas no quadro mostram os últimos {board.closedWindowDays} dias — a lista tem tudo.{caps.write ? ' Arraste um cartão para mudar de etapa (no celular, use o seletor “Mover para…” do cartão).' : ''}</div>
          {!loading && board.stages.every((s) => s.count === 0) && (
            <div className="crm-empty">
              <Sparkles size={26} style={{ opacity: .5 }} />
              <div style={{ marginTop: 8 }}>{hasFilter ? 'Nenhum negócio com esses filtros.' : 'Nenhum negócio ainda. Cada oportunidade de venda vira um cartão que anda pelo funil.'}</div>
              {!hasFilter && caps.write && <div style={{ marginTop: 10 }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => onNewDeal({})}><Plus size={14} /> Criar o primeiro negócio</button></div>}
            </div>
          )}
        </>
      )}

      {view === 'list' && (
        <>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Negócio</th><th>Contato</th><th>Etapa</th><th className="crm-num">Valor</th><th className="crm-num">Prob.</th><th>Previsão</th><th>Próximo passo</th><th>Responsável</th></tr></thead>
              <tbody>
                {list.items.map((d) => {
                  const can = caps.write && (d.status === 'open' || caps.remove);
                  const why = !caps.write ? 'Você não tem permissão para editar' : 'Negócio fechado: só gestores editam';
                  return (
                    <tr key={d.id} onClick={() => onOpenDeal(d.id)}>
                      <td>
                        <div className="crm-name">{d.title}</div>
                        <div className="crm-muted">{d.companyName}{d.dealType === 'upsell' ? ' · Upsell' : ''}{d.status === 'lost' ? ` · Perdido — ${d.lostReasonLabel}` : ''}{d.mrr > 0 ? ` · MRR ${fmtMoney(d.mrr)}` : ''}</div>
                        {(d.tags || []).length > 0 && <div className="crm-tags" style={{ marginTop: 3 }}>{d.tags.slice(0, 3).map((t) => <span key={t} className="crm-tag" style={{ color: 'var(--text-4)' }}>{t}</span>)}{d.tags.length > 3 && <span className="crm-muted">+{d.tags.length - 3}</span>}</div>}
                      </td>
                      <td>{d.contactName && <div>{d.contactName}</div>}<ContactLinks phone={d.contactPhone} whatsapp={d.contactWhatsapp} email={d.contactEmail} compact /></td>
                      <td>
                        <InlineSelect label={`Etapa de ${d.title}`} value={d.stageId} width={170} disabled={!can} disabledTitle={why}
                          options={pipeStages(d.pipelineId).length ? pipeStages(d.pipelineId) : [{ id: d.stageId, name: d.stageName }]} onSave={(id) => { const st = pipeStages(d.pipelineId).find((x) => x.id === id); if (st) moveDeal(d, st); }} />
                        {d.status === 'open' && (d.daysInStage || 0) > 14 && <div style={{ color: stageAgeColor(d.daysInStage), fontSize: 11, fontWeight: 700 }}>{d.daysInStage} dias parado</div>}
                      </td>
                      <td className="crm-num"><InlineMoney value={d.value} label={d.title} disabled={!can} disabledTitle={why} onSave={(n) => patchDeal(d, { value: n })} /></td>
                      <td className="crm-num">{d.status === 'open' ? `${d.probability}%` : <span className="crm-muted">—</span>}</td>
                      <td><InlineDate value={d.expectedCloseDate} label={d.title} overdue={d.overdue} disabled={!can} disabledTitle={why} onSave={(v) => patchDeal(d, { expectedCloseDate: v })} /></td>
                      <td>{d.status === 'open' ? (d.nextActivityDate ? <span style={{ color: d.nextActivityOverdue ? '#e2574c' : undefined, fontWeight: d.nextActivityOverdue ? 700 : undefined }}>{d.nextActivityTitle || 'Atividade'} · {fmtDateBR(d.nextActivityDate)}</span> : <span style={{ color: '#ff9f40' }}>Sem próximo passo</span>) : <span className="crm-muted">—</span>}</td>
                      <td><InlineSelect label={`Responsável de ${d.title}`} value={d.ownerId} empty="Sem responsável" options={owners} width={140} disabled={!can} disabledTitle={why} onSave={(v) => patchDeal(d, { ownerId: v || null })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && list.items.length === 0 && <div className="crm-empty">{hasFilter ? 'Nenhum negócio com esses filtros.' : 'Nenhum negócio nesta situação.'}</div>}
            {loading && <div className="crm-empty">Carregando…</div>}
          </div>
          <div className="crm-pager"><span>{list.total} {list.total === 1 ? 'negócio' : 'negócios'} · {fmtMoney(list.totalValue) || 'R$ 0'} · ponderado {fmtMoney(list.totalWeighted) || 'R$ 0'}</span></div>
        </>
      )}
      {view === 'board' && !board && !error && <div className="crm-empty">Carregando…</div>}

      {viewDialog && <ViewDialogGuarded initial={viewDialog.view} canShare={!!caps.funnel} onCancel={() => setViewDialog(null)} onSubmit={(v) => submitViewDialog(viewDialog.view, v)} />}
      {showFunnels && <FunnelsAdmin initialId={view === 'board' ? selectedPipe : (pipelineId !== 'all' ? pipelineId : '')} onClose={() => setShowFunnels(false)} onChanged={() => { reload(); if (onChanged) onChanged(); }} />}
      {showPipeRun && <PipeRunMigration onClose={() => setShowPipeRun(false)} onDone={() => { reload(); if (onChanged) onChanged(); }} />}
      {showImport && <DealImportWizard options={options} onClose={() => setShowImport(false)} onDone={() => { reload(); if (onChanged) onChanged(); }} />}
      {closing && <CloseDealDialog deal={closing.deal} stage={closing.stage} reasons={reasons} onCancel={() => setClosing(null)} onDone={() => { setClosing(null); reload(); if (onChanged) onChanged(); }} />}
    </div>
  );
}
