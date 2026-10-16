// "Resumo do dia" no topo da Gestão de Atividades (2026-10-16, melhoria visual 3 do pedido do Rafael; inspirado no mockup "Mesa de Trabalho"). Faixa
// RECOLHÍVEL (a escolha fica guardada por pessoa neste navegador) que só LÊ dados que já existem — cartões do quadro (prazo, prioridade, conclusão,
// itens do checklist com `doneAt`) e as reuniões de hoje/amanhã da pessoa (as mesmas do painel "Hoje"). Não grava nada e não muda nenhum fluxo.
import React, { useMemo, useState } from 'react';
import { ChevronDown, Target, Flame, CalendarClock } from 'lucide-react';

const PREF_KEY = 'pricetax-pb-summary-v1';
const PRIORITY = { urgente: { label: 'Urgente', color: '#e2574c', idx: 0 }, alta: { label: 'Alta', color: '#ff9f40', idx: 1 }, media: { label: 'Média', color: '#F5C400', idx: 2 }, baixa: { label: 'Baixa', color: '#3ea6ff', idx: 3 } };

const pad = (n) => String(n).padStart(2, '0');
export const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoOf = (ts) => { const d = ts ? new Date(ts) : null; return d && !Number.isNaN(d.getTime()) ? localIso(d) : ''; };
const addDaysIso = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return localIso(new Date(y, m - 1, d + n)); };
const daysBetween = (fromIso, toIso) => { const [a, b, c] = fromIso.split('-').map(Number); const [x, y, z] = toIso.split('-').map(Number); return Math.round((new Date(x, y - 1, z) - new Date(a, b - 1, c)) / 86400000); };

// Cartões "vivos" de todas as páginas do quadro: { boardId, colId, card }.
export function liveCards(boards, withArchived = false) {
  const out = [];
  for (const b of boards || []) for (const col of b.columns || []) for (const card of col.cards || []) {
    if (card && !card.deleted && (withArchived || !card.archived)) out.push({ boardId: b.id, boardName: b.name || '', colId: col.id, colName: col.name || '', card });
  }
  return out;
}

// Função pura (testável): números do "Foco de hoje".
export function focusOf(items, todayIso) {
  let planned = 0; let done = 0; let overdue = 0; let steps = 0;
  for (const { card } of items) {
    const doneToday = !!card.completed && isoOf(card.completedAt) === todayIso;
    if (card.archived && !doneToday) continue; // arquivada só conta se foi concluída hoje (o arquivamento semanal pode já ter passado por ela)
    const dueToday = card.dueDate === todayIso;
    if (dueToday || doneToday) { planned += 1; if (card.completed) done += 1; }
    if (!card.completed && card.dueDate && card.dueDate < todayIso) overdue += 1;
    for (const it of card.checklist || []) if (it && it.done && isoOf(it.doneAt) === todayIso) steps += 1;
  }
  const closedToday = items.filter(({ card }) => card.completed && isoOf(card.completedAt) === todayIso).length;
  return { planned, done, overdue, steps, wins: closedToday + steps };
}

// Função pura (testável): as até 5 coisas que não podem esperar — atrasadas (mais antigas primeiro), vencem hoje, urgentes e altas que vencem em até 3 dias.
export function topPriorities(items, todayIso, limit = 5) {
  const soon = addDaysIso(todayIso, 3);
  const ranked = [];
  for (const it of items) {
    const c = it.card;
    if (c.completed) continue;
    const p = PRIORITY[c.priority] || null;
    let rank = null; let tag = '';
    if (c.dueDate && c.dueDate < todayIso) { rank = [0, c.dueDate]; const n = daysBetween(c.dueDate, todayIso); tag = n === 1 ? 'Atrasada desde ontem' : `Atrasada há ${n} dias`; }
    else if (c.dueDate === todayIso) { rank = [1, String(p ? p.idx : 9)]; tag = 'Vence hoje'; }
    else if (c.priority === 'urgente') { rank = [2, c.dueDate || '9999']; tag = c.dueDate ? 'Urgente' : 'Urgente, sem prazo'; }
    else if (c.priority === 'alta' && c.dueDate && c.dueDate <= soon) { rank = [3, c.dueDate]; tag = 'Alta, vence em breve'; }
    if (rank) ranked.push({ ...it, rank, tag, p });
  }
  ranked.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1].localeCompare(b.rank[1]) || a.card.title.localeCompare(b.card.title, 'pt-BR'));
  return ranked.slice(0, limit);
}

const CSS = `
  .ds { margin:0 0 12px; font-family:'Inter', sans-serif; }
  .ds-head { display:flex; align-items:center; gap:10px; width:100%; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:9px 14px; cursor:pointer; color:inherit; font:inherit; text-align:left; }
  .ds-head:hover { border-color:var(--border-3); }
  .ds-head:focus-visible, .ds-prio-row:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .ds-title { font-size:13.5px; font-weight:800; color:var(--text-1); }
  .ds-mini { font-size:12px; color:var(--text-4); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ds-chev { margin-left:auto; flex-shrink:0; transition:transform .15s ease; color:var(--text-5); }
  .ds.collapsed .ds-chev { transform:rotate(-90deg); }
  @media (prefers-reduced-motion: reduce) { .ds-chev { transition:none; } }
  .ds-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; margin-top:8px; }
  .ds-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:12px 14px; min-width:0; }
  .ds-card h3 { display:flex; align-items:center; gap:7px; margin:0 0 8px; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-4); }
  .ds-big { font-size:26px; font-weight:800; color:var(--text-1); font-variant-numeric:tabular-nums; line-height:1.1; }
  .ds-big small { font-size:13px; font-weight:600; color:var(--text-4); }
  .ds-bar { height:8px; border-radius:999px; background:var(--bg-4); overflow:hidden; margin:8px 0; }
  .ds-bar > i { display:block; height:100%; background:#3ecf6e; transition:width .3s; }
  .ds-line { font-size:12.5px; color:var(--text-3); line-height:1.5; }
  .ds-line b { color:var(--text-1); }
  .ds-late { color:#e2574c; font-weight:700; }
  .ds-prio-row { display:flex; align-items:flex-start; gap:8px; width:100%; background:transparent; border:0; border-top:1px solid var(--border-1); padding:7px 2px; text-align:left; color:inherit; font:inherit; cursor:pointer; border-radius:6px; }
  .ds-prio-row:first-of-type { border-top:0; }
  .ds-prio-row:hover { background:var(--bg-3); }
  .ds-dot { width:9px; height:9px; border-radius:50%; margin-top:5px; flex-shrink:0; }
  .ds-prio-t { font-size:13px; font-weight:700; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .ds-prio-m { font-size:11.5px; color:var(--text-4); margin-top:1px; }
  .ds-meet { display:flex; gap:10px; padding:6px 0; border-top:1px solid var(--border-1); font-size:13px; }
  .ds-meet:first-of-type { border-top:0; }
  .ds-meet time { font-weight:800; color:var(--text-1); font-variant-numeric:tabular-nums; min-width:44px; }
  .ds-meet-s { font-size:11.5px; color:var(--text-4); }
  .ds-none { font-size:12.5px; color:var(--text-5); }
  @media (max-width: 900px) { .ds-grid { grid-template-columns:1fr; } .ds-head { min-height:44px; } .ds-prio-row { min-height:44px; } }
`;

function readPref(isMobile) {
  try { const v = window.localStorage.getItem(PREF_KEY); if (v === '1') return true; if (v === '0') return false; } catch (e) { /* sem armazenamento: usa o padrão */ }
  return !!isMobile;
}

export default function DaySummary({ boards, meetings, todayIso, isMobile, onOpenCard }) {
  const [collapsed, setCollapsed] = useState(() => readPref(isMobile));
  const items = useMemo(() => liveCards(boards), [boards]);
  const f = useMemo(() => focusOf(liveCards(boards, true), todayIso), [boards, todayIso]);
  const prios = useMemo(() => topPriorities(items, todayIso), [items, todayIso]);
  const meets = (meetings || []).slice(0, 4);
  const pct = f.planned ? Math.round((f.done / f.planned) * 100) : 0;

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(PREF_KEY, next ? '1' : '0'); } catch (e) { /* ignora */ }
  }
  const mini = [f.planned ? `${f.done} de ${f.planned} de hoje` : 'nada marcado para hoje', f.overdue ? `${f.overdue} atrasada${f.overdue === 1 ? '' : 's'}` : null, meets.length ? `${meets.length} reunião${meets.length === 1 ? '' : 'ões'}` : null].filter(Boolean).join(' · ');

  return (
    <section className={`ds${collapsed ? ' collapsed' : ''}`} aria-label="Resumo do dia">
      <style>{CSS}</style>
      <button type="button" className="ds-head" onClick={toggle} aria-expanded={!collapsed} aria-controls="ds-body">
        <span className="ds-title">Resumo do dia</span>
        {collapsed && <span className="ds-mini">{mini}</span>}
        <ChevronDown size={16} className="ds-chev" aria-hidden="true" />
      </button>
      {!collapsed && (
        <div className="ds-grid" id="ds-body">
          <div className="ds-card">
            <h3><Target size={13} aria-hidden="true" /> Foco de hoje</h3>
            {f.planned ? (
              <>
                <div className="ds-big">{f.done} <small>de {f.planned} concluída{f.planned === 1 ? '' : 's'}</small></div>
                <div className="ds-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso de hoje"><i style={{ width: `${pct}%` }} /></div>
              </>
            ) : <div className="ds-none">Nada com prazo para hoje.</div>}
            <div className="ds-line">
              {f.wins > 0 && <>Ganhos do dia: <b>{f.wins}</b> ({f.wins - f.steps} atividade{f.wins - f.steps === 1 ? '' : 's'} + {f.steps} subatividade{f.steps === 1 ? '' : 's'}). </>}
              {f.overdue > 0 ? <span className="ds-late">{f.overdue} atrasada{f.overdue === 1 ? '' : 's'}</span> : (f.planned > 0 || f.wins > 0 ? 'Nenhuma atrasada.' : null)}
            </div>
          </div>
          <div className="ds-card">
            <h3><Flame size={13} aria-hidden="true" /> Prioridades</h3>
            {prios.length === 0 ? <div className="ds-none">Nada urgente ou atrasado. Bom ritmo.</div> : prios.map((r) => (
              <button type="button" key={r.card.id} className="ds-prio-row" onClick={() => onOpenCard(r.boardId, r.colId, r.card.id)} title={`Abrir: ${r.card.title}`}>
                <span className="ds-dot" style={{ background: r.p ? r.p.color : 'var(--text-6)' }} aria-hidden="true" />
                <span style={{ minWidth: 0 }}>
                  <span className="ds-prio-t">{r.card.title}</span>
                  <span className="ds-prio-m">{r.tag}{r.p ? ` · prioridade ${r.p.label.toLowerCase()}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="ds-card">
            <h3><CalendarClock size={13} aria-hidden="true" /> Próximas reuniões</h3>
            {meets.length === 0 ? <div className="ds-none">Nenhuma reunião sua hoje ou amanhã.</div> : meets.map((m) => (
              <div className="ds-meet" key={m.key}>
                <time>{m.time || '—'}</time>
                <span style={{ minWidth: 0 }}>
                  <span className="ds-prio-t">{m.title}</span>
                  <span className="ds-meet-s">{m.day === 'today' ? 'Hoje' : 'Amanhã'}{m.hint ? ` · ${m.hint}` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
