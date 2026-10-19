// Aba ÁRVORE (2026-10-19, pedido do Rafael): mapa mental do cronograma de UMA empresa — empresa → grupos (fase, responsável ou situação) → atividades →
// subatividades. Só leitura: clicar numa atividade (ou numa subatividade) abre o mesmo detalhe de sempre. Usa os mesmos dados das outras abas, sem campo novo.
import { Maximize2, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { STATUS_META, fmtDate, todayISOStr, useIsMobile } from '../App.jsx';
import { subStats } from '../lib/subStats.js';

const COL_W = [210, 230, 340, 320];
const GAP_X = 72;
const GAP_Y = 10;
const PAD = 16;
const PALETTE = ['#3ea6ff', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#22d3ee', '#fb7185', '#84cc16'];
const LATE = '#e2574c';
const SIT_ORDER = ['atrasado', 'em-andamento', 'nao-iniciado', 'pausado', 'concluido'];
const SIT = {
  atrasado: { plural: 'Atrasadas', one: 'Atrasada', color: LATE },
  'em-andamento': { plural: 'Em andamento', one: 'Em andamento', color: STATUS_META['em-andamento'].color },
  'nao-iniciado': { plural: 'Não iniciadas', one: 'Não iniciada', color: '#8a8fa3' },
  pausado: { plural: 'Pausadas', one: 'Pausada', color: STATUS_META.pausado.color },
  concluido: { plural: 'Concluídas', one: 'Concluída', color: STATUS_META.concluido.color },
};
const GROUP_MODES = [{ id: 'fase', label: 'Fase' }, { id: 'resp', label: 'Responsável' }, { id: 'sit', label: 'Situação' }];

const endOf = (a) => a.endDate || a.date || '';
const isLate = (a, today) => a.status !== 'concluido' && !!endOf(a) && endOf(a) < today;
const sitOf = (a, today) => (isLate(a, today) ? 'atrasado' : (SIT[a.status] ? a.status : 'nao-iniciado'));
const daysFrom = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const tint = (c, alpha) => (/^#[0-9a-f]{6}$/i.test(c || '') ? `${c}${alpha}` : 'var(--bg-3)');
const lines = (text, px, width, cap = 3) => Math.min(cap, Math.max(1, Math.ceil(((text || '').length * px) / width)));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function shortDate(iso, thisYear) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y === thisYear ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
}
function period(a, thisYear) {
  const s = a.date, e = a.endDate && a.endDate !== a.date ? a.endDate : '';
  if (s && e) return `${shortDate(s, thisYear)} → ${shortDate(e, thisYear)}`;
  return shortDate(s || e, thisYear);
}
function deadlineText(a, today) {
  if (a.status === 'concluido') return a.doneAt ? `Concluída em ${fmtDate(String(a.doneAt).slice(0, 10))}` : 'Concluída';
  const e = endOf(a);
  if (!e) return 'Sem prazo';
  const d = daysFrom(today, e);
  if (d < 0) return `Atrasada há ${plural(-d, 'dia', 'dias')}`;
  if (d === 0) return 'Vence hoje';
  return `Faltam ${plural(d, 'dia', 'dias')}`;
}

const CSS = `
.tv-node{position:absolute;box-sizing:border-box;font:inherit;text-align:left;color:var(--text-1);border:1.5px solid var(--border-3);border-radius:10px;background:var(--bg-3);margin:0}
.tv-open{all:unset;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:4px;width:100%;height:100%;padding:8px 20px 8px 14px;cursor:pointer;border-radius:9px}
.tv-open:hover{background:rgba(127,127,160,.12)}
.tv-open:focus-visible,.tv-tog:focus-visible,.tv-seg button:focus-visible,.tv-chip:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}
.tv-tog{position:absolute;right:-12px;top:50%;transform:translateY(-50%);min-width:24px;height:24px;padding:0 5px;border-radius:12px;border:1.5px solid var(--border-3);background:var(--bg-1);color:var(--text-2);font:700 11px/1 inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}
.tv-tog:hover{background:var(--bg-4);color:var(--text-1)}
.tv-seg{display:inline-flex;border:1px solid var(--border-3);border-radius:8px;overflow:hidden}
.tv-seg button{all:unset;box-sizing:border-box;padding:6px 11px;font-size:12px;cursor:pointer;color:var(--text-3);min-height:32px;display:flex;align-items:center}
.tv-seg button+button{border-left:1px solid var(--border-3)}
.tv-seg button[aria-pressed=true]{background:var(--bg-4);color:var(--text-1);font-weight:700}
.tv-chip{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--border-3);border-radius:999px;font-size:12px;cursor:pointer;color:var(--text-2);min-height:30px}
.tv-chip[aria-pressed=true]{background:var(--bg-4);color:var(--text-1);font-weight:700}
.tv-ctl{width:auto;max-width:100%;height:34px;border:1px solid var(--border-3);border-radius:8px;background:var(--bg-2);color:var(--text-1);font-size:12.5px;padding:0 8px;box-sizing:border-box}
.tv-iconbtn{all:unset;box-sizing:border-box;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-3);border-radius:8px;cursor:pointer;color:var(--text-2)}
.tv-iconbtn:hover{background:var(--bg-4)}
.tv-iconbtn:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}
.tv-t{font-weight:700;font-size:13px;line-height:17px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.tv-m{font-size:11.5px;line-height:16px;color:var(--text-3);display:flex;flex-wrap:wrap;gap:3px 8px;align-items:center}
.tv-pill{font-weight:700;font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid}
.tv-bar{display:block;height:5px;border-radius:3px;background:var(--border-2);overflow:hidden}
.tv-bar i{display:block;height:100%}
@media (max-width:767px){.tv-ctl{height:40px}.tv-iconbtn{width:40px;height:40px}.tv-seg button,.tv-chip{min-height:40px}}
`;

export default function TreeView({ pid, activities, orderMap, phases, companyName, companyColor, openDetail }) {
  const isMobile = useIsMobile();
  const today = todayISOStr();
  const thisYear = today.slice(0, 4);
  const [groupBy, setGroupBy] = useState('fase');
  const [fPhase, setFPhase] = useState('');
  const [fResp, setFResp] = useState('');
  const [fSit, setFSit] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [scale, setScale] = useState(isMobile ? 0.75 : 1);
  const boxRef = useRef(null);
  const pan = useRef(null);

  const all = useMemo(() => (activities || []).filter((a) => !a.deleted), [activities]);
  const phaseList = phases || [];
  const phaseById = useMemo(() => Object.fromEntries(phaseList.map((p) => [p.id, p])), [phaseList]);
  const responsibles = useMemo(() => [...new Set(all.map((a) => a.responsible).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [all]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(SIT_ORDER.map((k) => [k, 0]));
    all.forEach((a) => { c[sitOf(a, today)] += 1; });
    return c;
  }, [all, today]);

  const q = query.trim().toLowerCase();
  const filtersOn = !!(fPhase || fResp || fSit || q);
  const shown = useMemo(() => all.filter((a) => {
    if (fPhase && (a.phase || '') !== fPhase) return false;
    if (fResp && (a.responsible || '') !== fResp) return false;
    if (fSit && sitOf(a, today) !== fSit) return false;
    if (q) {
      const hay = [a.title, a.responsible, ...(a.subactivities || []).filter((s) => !s.deleted).map((s) => s.title)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [all, fPhase, fResp, fSit, q, today]);

  const groupOf = (a) => (groupBy === 'fase' ? (phaseById[a.phase] ? a.phase : '__none') : groupBy === 'resp' ? (a.responsible || '__none') : sitOf(a, today));
  const groupDefs = useMemo(() => {
    if (groupBy === 'fase') return [...phaseList.map((p) => ({ key: p.id, label: p.name, color: p.color })), { key: '__none', label: 'Sem fase', color: '#8a8fa3' }];
    if (groupBy === 'resp') return [...responsibles.map((r, i) => ({ key: r, label: r, color: PALETTE[i % PALETTE.length] })), { key: '__none', label: 'Sem responsável', color: '#8a8fa3' }];
    return SIT_ORDER.map((k) => ({ key: k, label: SIT[k].plural, color: SIT[k].color }));
  }, [groupBy, phaseList, responsibles]);

  const tree = useMemo(() => {
    const phaseColorOf = (a) => phaseById[a.phase]?.color || '#8a8fa3';
    const mkAct = (a) => {
      const subs = (a.subactivities || []).filter((s) => !s.deleted);
      const st = subStats(subs);
      const sit = sitOf(a, today);
      const per = period(a, thisYear);
      const title = a.title || 'Sem título';
      const metaChars = SIT[sit].one.length + (a.responsible || '').length + per.length + 8;
      const innerW = COL_W[2] - 30;
      const h = lines(title, 7.4, innerW) * 17 + lines('x'.repeat(metaChars), 6.4, innerW, 2) * 21 + 30;
      return {
        id: `a:${a.id}`, kind: 'act', w: COL_W[2], h, a, sit, per, title, stripe: phaseColorOf(a), stats: st,
        order: orderMap && orderMap[a.id], accent: phaseColorOf(a),
        children: subs.map((s) => {
          const t = s.title || 'Sem título';
          const meta = [s.responsible, s.date ? shortDate(s.date, thisYear) : ''].filter(Boolean).join('  ');
          return { id: `s:${a.id}:${s.id}`, kind: 'sub', w: COL_W[3], h: lines(t, 6.9, COL_W[3] - 52) * 16 + ((meta || (s.done && s.skipped)) ? 16 : 0) + 20, s, title: t, meta, actId: a.id, children: [] };
        }),
      };
    };
    const groups = groupDefs.map((g) => {
      const items = shown.filter((a) => groupOf(a) === g.key);
      if (!items.length) return null;
      const done = items.filter((a) => a.status === 'concluido').length;
      const late = items.filter((a) => isLate(a, today)).length;
      const label = g.label || 'Sem nome';
      const node = {
        id: `g:${g.key}`, kind: 'group', w: COL_W[1], h: lines(label, 7.6, COL_W[1] - 30, 2) * 17 + 44, label, color: g.color, accent: g.color, done, late, total: items.length,
        children: items.map(mkAct),
      };
      node.children.forEach((c) => { c.edge = g.color; c.children.forEach((x) => { x.edge = g.color; }); });
      return node;
    }).filter(Boolean);
    const total = shown.length;
    const done = shown.filter((a) => a.status === 'concluido').length;
    const rootLabel = companyName || 'Cronograma';
    const accent = companyColor || '#F5C400';
    return { id: 'root', kind: 'root', w: COL_W[0], h: lines(rootLabel, 8, COL_W[0] - 30, 3) * 18 + 46, label: rootLabel, accent, total, done, children: groups };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupDefs, groupBy, phaseById, orderMap, today, thisYear, companyName, companyColor]);

  const allGroupIds = useMemo(() => tree.children.map((g) => g.id), [tree]);
  const allActIds = useMemo(() => tree.children.flatMap((g) => g.children.filter((a) => a.children.length).map((a) => a.id)), [tree]);
  const level2 = useMemo(() => new Set(['root', ...allGroupIds]), [allGroupIds]);
  const effOpen = open || level2;
  const level = (() => {
    if (!tree.children.length) return 0;
    const gOpen = allGroupIds.every((i) => effOpen.has(i));
    const aOpen = allActIds.length > 0 && allActIds.every((i) => effOpen.has(i));
    const anyA = allActIds.some((i) => effOpen.has(i));
    if (!effOpen.has('root')) return 0;
    if (allGroupIds.every((i) => !effOpen.has(i)) && !anyA) return 1;
    if (gOpen && aOpen) return 3;
    if (gOpen && !anyA) return 2;
    return 0;
  })();
  function setLevel(n) {
    const s = new Set(['root']);
    if (n >= 2) allGroupIds.forEach((i) => s.add(i));
    if (n >= 3) allActIds.forEach((i) => s.add(i));
    setOpen(s);
  }
  function toggle(id) {
    setOpen((prev) => {
      const s = new Set(prev || level2);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }
  const resetView = () => setOpen(null);
  const onFilter = (set) => (e) => { set(e.target.value); resetView(); };

  const layout = useMemo(() => {
    const colX = [];
    let x = PAD;
    COL_W.forEach((w, d) => { colX[d] = x; x += w + GAP_X; });
    const kids = (n) => (effOpen.has(n.id) ? n.children : []);
    const measure = (n) => {
      const ch = kids(n);
      ch.forEach(measure);
      const sum = ch.reduce((t, c) => t + c.sh, 0) + GAP_Y * Math.max(0, ch.length - 1);
      n.ch = ch; n.sum = sum; n.sh = Math.max(n.h, sum);
    };
    measure(tree);
    const nodes = [];
    const edges = [];
    let maxX = 0;
    const place = (n, depth, top) => {
      n.x = colX[depth]; n.y = top + n.sh / 2 - n.h / 2;
      maxX = Math.max(maxX, n.x + n.w);
      nodes.push(n);
      let y = top + (n.sh - n.sum) / 2;
      n.ch.forEach((c) => {
        place(c, depth + 1, y);
        edges.push({ from: n, to: c, color: n.kind === 'root' ? c.accent : (c.edge || n.edgeColor || n.accent) });
        y += c.sh + GAP_Y;
      });
    };
    place(tree, 0, PAD);
    return { nodes, edges, width: maxX + PAD + 14, height: tree.sh + PAD * 2 };
  }, [tree, effOpen]);

  function fit() {
    const w = boxRef.current ? boxRef.current.clientWidth : 0;
    if (w) setScale(Math.max(0.35, Math.min(1, Math.round((w / layout.width) * 100) / 100)));
  }
  const zoom = (d) => setScale((s) => Math.max(0.35, Math.min(1.5, Math.round((s + d) * 100) / 100)));
  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('button,select,input')) return;
    const el = boxRef.current;
    pan.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  }
  function onPointerMove(e) {
    if (!pan.current) return;
    const el = boxRef.current;
    el.scrollLeft = pan.current.l - (e.clientX - pan.current.x);
    el.scrollTop = pan.current.t - (e.clientY - pan.current.y);
  }
  function onPointerUp() { pan.current = null; if (boxRef.current) boxRef.current.style.cursor = 'grab'; }

  const openAct = (id) => openDetail(pid, id);
  const toggleBtn = (n) => {
    const count = n.children.length;
    if (!count) return null;
    const isOpen = effOpen.has(n.id);
    return (
      <button type="button" className="tv-tog" aria-expanded={isOpen} aria-label={`${isOpen ? 'Recolher' : 'Expandir'}: ${n.label || n.title} (${plural(count, 'item', 'itens')})`} title={isOpen ? 'Recolher' : `Expandir (${count})`} onClick={() => toggle(n.id)}>
        {isOpen ? <Minus size={12} /> : count}
      </button>
    );
  };

  function renderNode(n) {
    const pos = { left: n.x, top: n.y, width: n.w, height: n.h };
    if (n.kind === 'root') {
      const pct = n.total ? Math.round((n.done / n.total) * 100) : 0;
      return (
        <div key={n.id} className="tv-node" style={{ ...pos, borderColor: n.accent, background: tint(n.accent, '24'), borderWidth: 2 }}>
          <button type="button" className="tv-open" onClick={() => n.children.length && toggle(n.id)} style={{ cursor: n.children.length ? 'pointer' : 'default' }}>
            <span className="tv-t" style={{ fontSize: 15, lineHeight: '18px' }}>{n.label}</span>
            <span className="tv-m">{plural(n.total, 'atividade', 'atividades')} · {pct}% concluídas</span>
            <span className="tv-bar"><i style={{ width: `${pct}%`, background: n.accent }} /></span>
          </button>
          {toggleBtn(n)}
        </div>
      );
    }
    if (n.kind === 'group') {
      const pct = n.total ? Math.round((n.done / n.total) * 100) : 0;
      return (
        <div key={n.id} className="tv-node" style={{ ...pos, borderColor: n.accent, background: tint(n.accent, '1f') }}>
          <button type="button" className="tv-open" onClick={() => toggle(n.id)}>
            <span className="tv-t" style={{ WebkitLineClamp: 2 }}>{n.label}</span>
            <span className="tv-m">{n.done} de {n.total} concluídas{n.late ? <b style={{ color: LATE }}>{n.late} atrasada{n.late === 1 ? '' : 's'}</b> : null}</span>
            <span className="tv-bar"><i style={{ width: `${pct}%`, background: n.accent }} /></span>
          </button>
          {toggleBtn(n)}
        </div>
      );
    }
    if (n.kind === 'act') {
      const meta = SIT[n.sit];
      const subs = n.stats.total ? ` · ${n.stats.resolved}/${n.stats.total} subatividades` : '';
      return (
        <div key={n.id} className="tv-node" style={{ ...pos, borderLeft: `6px solid ${n.stripe}`, background: tint(n.stripe, '14') }}>
          <button type="button" className="tv-open" onClick={() => openAct(n.a.id)} title={`Abrir a atividade${n.order ? ` ${n.order}` : ''}: ${n.title}\n${deadlineText(n.a, today)}${subs}`} aria-label={`Abrir a atividade ${n.title}`}>
            <span className="tv-t">{n.order ? <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>#{n.order} </span> : null}{n.title}</span>
            <span className="tv-m">
              <span className="tv-pill" style={{ color: meta.color, borderColor: /^#/.test(meta.color) ? `${meta.color}88` : 'var(--border-3)' }}>{meta.one}</span>
              {n.a.responsible ? <span>{n.a.responsible}</span> : null}
              {n.per ? <span>{n.per}</span> : null}
            </span>
          </button>
          {toggleBtn(n)}
        </div>
      );
    }
    const done = n.s.done;
    const skipped = done && n.s.skipped;
    return (
      <div key={n.id} className="tv-node" style={{ ...pos, borderRadius: 8, background: 'var(--bg-2)', borderColor: done ? (skipped ? 'var(--border-3)' : '#3ecf6e66') : 'var(--border-3)' }}>
        <button type="button" className="tv-open" onClick={() => openAct(n.actId)} style={{ padding: '6px 12px', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }} title={`${n.title}${skipped && n.s.skipReason ? `\nPulada: ${n.s.skipReason}` : ''}\nAbrir a atividade`} aria-label={`${n.title}: ${skipped ? 'pulada' : done ? 'concluída' : 'pendente'}. Abrir a atividade`}>
          <span aria-hidden="true" style={{ flex: '0 0 16px', height: 16, borderRadius: 8, marginTop: 1, border: `1.5px solid ${done && !skipped ? '#3ecf6e' : 'var(--text-5)'}`, background: done && !skipped ? '#3ecf6e' : 'transparent', color: '#fff', fontSize: 10, lineHeight: '13px', textAlign: 'center', fontWeight: 800 }}>{done ? (skipped ? '–' : '✓') : ''}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, lineHeight: '16px', color: done ? 'var(--text-3)' : 'var(--text-1)', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}>{n.title}</span>
            {(n.meta || skipped) ? <span className="tv-m" style={{ fontSize: 11 }}>{skipped ? <b style={{ color: 'var(--text-3)' }}>Pulada</b> : null}{n.meta}</span> : null}
          </span>
        </button>
      </div>
    );
  }

  if (!all.length) return <div style={{ padding: 24, color: 'var(--text-4)' }}>Nenhuma atividade para mostrar na árvore.</div>;

  return (
    <div>
      <style>{CSS}</style>
      {isMobile && (
        <button type="button" className="tv-chip" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)} style={{ marginBottom: 10 }}>
          <SlidersHorizontal size={13} /> Filtros e busca{filtersOn || groupBy !== 'fase' ? ' (ativos)' : ''}
        </button>
      )}
      <div style={{ display: isMobile && !showFilters ? 'none' : 'block' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>Agrupar por
          <select className="tv-ctl" value={groupBy} onChange={onFilter(setGroupBy)} aria-label="Agrupar a árvore por">
            {GROUP_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {groupBy !== 'fase' && phaseList.length > 0 && (
          <select className="tv-ctl" value={fPhase} onChange={onFilter(setFPhase)} aria-label="Filtrar por fase">
            <option value="">Todas as fases</option>
            {phaseList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {groupBy !== 'resp' && responsibles.length > 0 && (
          <select className="tv-ctl" value={fResp} onChange={onFilter(setFResp)} aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            {responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--text-5)', pointerEvents: 'none' }} />
          <input className="tv-ctl" value={query} onChange={onFilter(setQuery)} placeholder="Buscar atividade ou subatividade" aria-label="Buscar na árvore" style={{ paddingLeft: 28, width: isMobile ? 220 : 250 }} />
        </div>
        {filtersOn && (
          <button type="button" className="tv-chip" onClick={() => { setFPhase(''); setFResp(''); setFSit(''); setQuery(''); resetView(); }}><X size={12} /> Limpar filtros</button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }} role="group" aria-label="Filtrar por situação">
        {SIT_ORDER.map((k) => (
          <button key={k} type="button" className="tv-chip" aria-pressed={fSit === k} onClick={() => { setFSit(fSit === k ? '' : k); resetView(); }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, background: SIT[k].color }} />
            {SIT[k].plural} <b>{counts[k]}</b>
          </button>
        ))}
      </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div className="tv-seg" role="group" aria-label="Quanto da árvore mostrar">
          <button type="button" aria-pressed={level === 1} onClick={() => setLevel(1)}>Só grupos</button>
          <button type="button" aria-pressed={level === 2} onClick={() => setLevel(2)}>Atividades</button>
          <button type="button" aria-pressed={level === 3} onClick={() => setLevel(3)}>Subatividades</button>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button type="button" className="tv-iconbtn" onClick={() => zoom(-0.1)} aria-label="Diminuir o zoom" title="Diminuir"><Minus size={14} /></button>
          <span style={{ minWidth: 42, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }} aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" className="tv-iconbtn" onClick={() => zoom(0.1)} aria-label="Aumentar o zoom" title="Aumentar"><Plus size={14} /></button>
          <button type="button" className="tv-iconbtn" onClick={fit} aria-label="Ajustar a árvore à largura da tela" title="Ajustar à largura"><Maximize2 size={14} /></button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          {filtersOn ? `${shown.length} de ${all.length} atividades` : plural(all.length, 'atividade', 'atividades')} · arraste o fundo para andar pela árvore; clique numa atividade para abri-la
        </span>
      </div>

      {!shown.length ? (
        <div style={{ padding: 24, color: 'var(--text-4)', border: '1px dashed var(--border-3)', borderRadius: 10 }}>Nenhuma atividade com esses filtros.</div>
      ) : (
        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ overflow: 'auto', maxHeight: isMobile ? '68vh' : 'calc(100vh - 290px)', minHeight: 320, border: '1px solid var(--border-2)', borderRadius: 12, background: 'var(--bg-1)', cursor: 'grab', touchAction: 'pan-x pan-y' }}
        >
          <div style={{ width: layout.width * scale, height: layout.height * scale }}>
            <div style={{ position: 'relative', width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <svg width={layout.width} height={layout.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
                {layout.edges.map((e) => {
                  const x1 = e.from.x + e.from.w;
                  const y1 = e.from.y + e.from.h / 2;
                  const x2 = e.to.x;
                  const y2 = e.to.y + e.to.h / 2;
                  const dx = (x2 - x1) * 0.55;
                  return <path key={`${e.from.id}>${e.to.id}`} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke={/^#/.test(e.color || '') ? `${e.color}99` : 'var(--border-3)'} strokeWidth="1.6" />;
                })}
              </svg>
              {layout.nodes.map(renderNode)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
