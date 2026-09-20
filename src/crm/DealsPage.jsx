// Negócios (PRD 12/13): quadro Kanban por etapa + lista. Arrastar o cartão move
// de etapa; soltar em Ganho/Perdido abre o diálogo de fechamento (motivo da
// perda é obrigatório). O mesmo funil serve novo negócio e upsell — o filtro de
// tipo separa. Arrastar não existe no celular: lá a etapa muda na ficha do negócio.
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Kanban, List, Sparkles } from 'lucide-react';
import { crm } from './crmApi.js';
import CloseDealDialog from './CloseDealDialog.jsx';
import { fmtMoney, fmtDateBR, DEAL_TYPE_META, DEAL_STATUS_META, stageAgeColor } from './crmMeta.js';

const VIEW_KEY = 'crm-deals-view';
function readView() { try { return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; } }

function DealCard({ deal, canDrag, dragging, onOpen, onDragStart, onDragEnd }) {
  const closed = deal.status !== 'open';
  return (
    // div (não button): o Firefox não inicia arrasto em <button>. Teclado abre com Enter/Espaço.
    <div role="button" tabIndex={0} className={`crm-deal${dragging ? ' dragging' : ''}`} draggable={canDrag} onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(deal.id); } }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal.id); onDragStart(deal.id); }} onDragEnd={onDragEnd}>
      <div className="crm-deal-title">{deal.title}</div>
      <div className="crm-deal-co">{deal.companyName}</div>
      <div className="crm-deal-meta">
        <span className="crm-deal-value">{deal.value ? fmtMoney(deal.value) : <span className="crm-muted">sem valor</span>}</span>
        {!closed && <span>{deal.probability}%</span>}
      </div>
      <div className="crm-tags">
        {deal.dealType === 'upsell' && <span className="crm-tag" style={{ color: DEAL_TYPE_META.upsell.color }}>Upsell</span>}
        {deal.status === 'lost' && <span className="crm-tag" style={{ color: DEAL_STATUS_META.lost.color }}>{deal.lostReasonLabel || 'Perdido'}</span>}
        {deal.overdue && <span className="crm-tag" style={{ color: '#e2574c' }}>Previsão vencida</span>}
        {!closed && (deal.daysInStage || 0) > 14 && <span className="crm-tag" style={{ color: stageAgeColor(deal.daysInStage) }}>{deal.daysInStage} dias parado</span>}
        {deal.ownerName && <span className="crm-muted" style={{ fontSize: 11 }}>{deal.ownerName}</span>}
      </div>
    </div>
  );
}

export default function DealsPage({ caps, options, refreshKey, onOpenDeal, onNewDeal, onChanged }) {
  const [view, setView] = useState(readView);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState({ type: '', ownerId: '' });
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

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
  function changeView(v) { setView(v); try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* sem storage: só não lembra */ } }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const f = { q: debouncedQ, type: filters.type, ownerId: filters.ownerId };
    const req = view === 'board' ? crm.board(f).then((r) => { if (!cancelled) setBoard(r); }) : crm.deals({ ...f, status: listStatus, limit: 100, sort: 'recent' }).then((r) => { if (!cancelled) setList(r); });
    req.then(() => { if (!cancelled) { setError(''); setLoading(false); } }).catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar os negócios.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [view, debouncedQ, filters, listStatus, refreshKey, localKey]);

  const owners = (options && options.owners) || [];
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilter = debouncedQ || filters.type || filters.ownerId;
  const reasons = (options && options.lostReasons) || [];

  async function drop(stage) {
    const id = dragId;
    setDragId(null); setOverStage(null);
    if (!id || !board) return;
    const deal = board.stages.flatMap((s) => s.deals).find((d) => d.id === id);
    if (!deal || deal.stageId === stage.id) return;
    if (stage.kind !== 'open') { setClosing({ deal, stage }); return; }
    try { await crm.moveDeal(id, { stageId: stage.id }); reload(); if (onChanged) onChanged(); } catch (e) { window.alert(e.message); reload(); }
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
          {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={() => onNewDeal({})}><Plus size={14} /> Novo negócio</button>}
        </div>
      </div>

      <div className="crm-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por negócio ou empresa…" style={{ minWidth: 230 }} />
        <select value={filters.type} onChange={(e) => setF('type', e.target.value)} aria-label="Tipo de negócio">
          <option value="">Novo negócio e upsell</option><option value="new">Só novos negócios</option><option value="upsell">Só upsell</option>
        </select>
        <select value={filters.ownerId} onChange={(e) => setF('ownerId', e.target.value)} aria-label="Responsável">
          <option value="">Todo responsável</option><option value="none">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {view === 'list' && (
          <select value={listStatus} onChange={(e) => setListStatus(e.target.value)} aria-label="Situação">
            <option value="open">Em aberto</option><option value="won">Ganhos</option><option value="lost">Perdidos</option><option value="all">Todos</option>
          </select>
        )}
        {hasFilter && <button type="button" className="crm-btn" onClick={() => { setQ(''); setFilters({ type: '', ownerId: '' }); }}>Limpar</button>}
      </div>

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}

      {view === 'board' && board && (
        <>
          <div className="crm-board">
            {board.stages.map((s) => (
              <div key={s.id} className={`crm-col${overStage === s.id ? ' over' : ''}`}
                onDragOver={(e) => { if (dragId && caps.write) { e.preventDefault(); if (overStage !== s.id) setOverStage(s.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget) && overStage === s.id) setOverStage(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s); }}>
                <div className="crm-col-head">
                  <div className="crm-col-title"><span className="crm-dot" style={{ background: s.color || 'var(--border-3)' }} />{s.name}<span className="crm-col-count">{s.count}</span></div>
                  <div className="crm-col-sum">{s.count ? `${fmtMoney(s.value) || 'R$ 0'}${s.kind === 'open' ? ` · pond. ${fmtMoney(s.weighted) || 'R$ 0'}` : ''}` : (s.kind === 'open' ? `${s.probability}% de chance` : '—')}</div>
                </div>
                <div className="crm-col-body">
                  {s.deals.map((d) => <DealCard key={d.id} deal={d} canDrag={caps.write} dragging={dragId === d.id} onOpen={onOpenDeal} onDragStart={setDragId} onDragEnd={() => { setDragId(null); setOverStage(null); }} />)}
                  {s.deals.length === 0 && <div className="crm-col-empty">{s.kind === 'open' ? 'Nenhum negócio aqui.' : `Sem ${s.kind === 'won' ? 'ganhos' : 'perdas'} nos últimos ${board.closedWindowDays} dias.`}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="crm-muted">Ganhos e perdas no quadro mostram os últimos {board.closedWindowDays} dias — a lista tem tudo.{caps.write ? ' Arraste um cartão para mudar de etapa (no celular, mude a etapa dentro do negócio).' : ''}</div>
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
              <thead><tr><th>Negócio</th><th>Empresa</th><th>Etapa</th><th className="crm-num">Valor</th><th className="crm-num">Prob.</th><th>Previsão</th><th>Responsável</th><th>Tipo</th></tr></thead>
              <tbody>
                {list.items.map((d) => (
                  <tr key={d.id} onClick={() => onOpenDeal(d.id)}>
                    <td><div className="crm-name">{d.title}</div>{d.status === 'lost' && <div className="crm-muted">Perdido — {d.lostReasonLabel}</div>}</td>
                    <td>{d.companyName}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="crm-dot" style={{ background: d.stageColor || 'var(--border-3)' }} />{d.stageName}</span>{d.status === 'open' && (d.daysInStage || 0) > 14 && <div style={{ color: stageAgeColor(d.daysInStage), fontSize: 11 }}>{d.daysInStage} dias parado</div>}</td>
                    <td className="crm-num">{d.value ? fmtMoney(d.value) : <span className="crm-muted">—</span>}</td>
                    <td className="crm-num">{d.status === 'open' ? `${d.probability}%` : <span className="crm-muted">—</span>}</td>
                    <td style={{ color: d.overdue ? '#e2574c' : undefined, fontWeight: d.overdue ? 700 : undefined }}>{fmtDateBR(d.expectedCloseDate) || <span className="crm-muted">—</span>}</td>
                    <td>{d.ownerName}</td>
                    <td><span className="crm-tag" style={{ color: DEAL_TYPE_META[d.dealType].color }}>{DEAL_TYPE_META[d.dealType].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && list.items.length === 0 && <div className="crm-empty">{hasFilter ? 'Nenhum negócio com esses filtros.' : 'Nenhum negócio nesta situação.'}</div>}
            {loading && <div className="crm-empty">Carregando…</div>}
          </div>
          <div className="crm-pager"><span>{list.total} {list.total === 1 ? 'negócio' : 'negócios'} · {fmtMoney(list.totalValue) || 'R$ 0'} · ponderado {fmtMoney(list.totalWeighted) || 'R$ 0'}</span></div>
        </>
      )}
      {view === 'board' && !board && !error && <div className="crm-empty">Carregando…</div>}

      {closing && <CloseDealDialog deal={closing.deal} stage={closing.stage} reasons={reasons} onCancel={() => setClosing(null)} onDone={() => { setClosing(null); reload(); if (onChanged) onChanged(); }} />}
    </div>
  );
}
