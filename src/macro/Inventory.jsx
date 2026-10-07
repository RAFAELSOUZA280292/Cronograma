// Levantamento (2026-10-07, Etapa 1 de docs/PLANO_RENATA_CONSULTAS_GERAIS.md) — todas as atividades de todas as empresas
// acessíveis, agrupadas por fase e/ou responsável, com contagens exatas vindas do servidor (server/inventory.js) e planilha
// para baixar. Só leitura; clicar numa atividade abre o mesmo modal de sempre.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, AlertTriangle, X, Search, Mic, CalendarRange, ShieldCheck } from 'lucide-react';
import { Chip, ChipRow, Segmented, Select, Button, EmptyState, SkeletonCards, Kpi, KpiGrid, ErrorState, activate } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { S, STATUS_META, PRIORITY_META } from '../App.jsx';

const GROUPINGS = [
  { value: 'phase_responsible', label: 'Fase › Responsável' },
  { value: 'responsible_phase', label: 'Responsável › Fase' },
  { value: 'phase', label: 'Fase' },
  { value: 'responsible', label: 'Responsável' },
  { value: 'company', label: 'Empresa' },
];
const STATUSES = ['nao-iniciado', 'em-andamento', 'pausado', 'concluido'];
const DEFAULT_STATUS = ['nao-iniciado', 'em-andamento'];

const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Counts({ c, split }) {
  return (
    <span className="inv-counts">
      <b>{plural(c.total, 'atividade', 'atividades')}</b>
      {split && c.reuniao > 0 && c.cronograma > 0 && <span>{c.cronograma} do cronograma + {c.reuniao} de reuniões</span>}
      <span>{plural(c.companies, 'empresa', 'empresas')}</span>
      {c.overdue > 0 && <span className="inv-late"><AlertTriangle size={11} aria-hidden="true" /> {plural(c.overdue, 'atrasada', 'atrasadas')}</span>}
    </span>
  );
}

function Item({ item, onOpen, onOpenTodo, hide }) {
  const st = STATUS_META[item.status] || STATUS_META['nao-iniciado'];
  const isMeeting = item.origin === 'reuniao';
  const open = isMeeting ? (onOpenTodo ? () => onOpenTodo(item.projectId, item.meetingId, item.taskId) : null) : (onOpen ? () => onOpen(item.projectId, item.activityId) : null);
  return (
    <div className="inv-item" {...(open ? activate(open) : {})} title={open ? (isMeeting ? 'Abrir esta tarefa na reunião' : 'Abrir esta atividade') : undefined}>
      <div className="inv-item-main">
        <div className="inv-item-title">{!hide.company && <><span className="inv-co">{item.company}</span><span className="inv-sep"> — </span></>}{item.title}</div>
        <div className="inv-item-meta">
          {isMeeting && <span className="inv-origin"><Mic size={11} aria-hidden="true" /> Reunião{item.meetingTitle ? `: ${item.meetingTitle}` : ''}{item.meetingDate ? ` · ${br(item.meetingDate)}` : ''}{item.owner === 'cliente' ? ' · lado do cliente' : ''}</span>}
          {!hide.phase && item.phase && <span>{item.phase}</span>}
          {!hide.responsible && item.responsible && <span>{item.responsible}</span>}
          {item.priority && PRIORITY_META[item.priority] && <span style={{ color: PRIORITY_META[item.priority].color }}>● {PRIORITY_META[item.priority].label}</span>}
          {item.companyPaused && <span>empresa pausada</span>}
        </div>
      </div>
      <div className="inv-item-pills">
        <span className="mac-pill" style={{ color: st.color, background: st.bg, borderColor: st.border }}>{st.label}</span>
        <span className="inv-date" style={item.overdue ? { color: 'var(--ui-danger)', fontWeight: 700 } : undefined}>{item.date ? `${item.overdue ? 'Atrasada · ' : ''}${br(item.date)}` : 'sem data'}</span>
      </div>
    </div>
  );
}

function Group({ group, depth, path, isOpen, toggle, onOpen, onOpenTodo, hide }) {
  const here = `${path}/${group.key}`;
  const open = isOpen(here, depth, !group.children);
  return (
    <section className={`inv-group d${depth}`} aria-label={group.label}>
      <button type="button" className="inv-head" aria-expanded={open} onClick={() => toggle(here, open)}>
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        <span className="inv-label">{group.label}</span>
        <Counts c={group.counts} />
      </button>
      {open && (
        <div className="inv-body">
          {group.children
            ? group.children.map((c) => <Group key={c.key} group={c} depth={depth + 1} path={here} isOpen={isOpen} toggle={toggle} onOpen={onOpen} onOpenTodo={onOpenTodo} hide={hide} />)
            : group.items.map((it) => <Item key={`${it.origin}-${it.projectId}-${it.activityId || it.taskId}`} item={it} onOpen={onOpen} onOpenTodo={onOpenTodo} hide={hide} />)}
        </div>
      )}
    </section>
  );
}


const KIND_TEXT = {
  partial: (s) => `provável: ${s}`,
  ambiguous: (s) => `ambíguo: ${s}`,
  unknown: () => 'ninguém da equipe com esse nome (pessoa do cliente ou uma área?)',
};

// Passo 1 do caminho combinado: mede o que atrapalha uma varredura organizada. Só lê; nada é alterado.
function QualityPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true); setError('');
    apiGet('/api/inventory/quality').then((r) => { setQ(r); setLoading(false); }).catch((e) => { setError(e.message || 'Não foi possível medir a qualidade dos dados.'); setLoading(false); });
  }
  useEffect(() => { if (open && !q && !loading && !error) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');
  return (
    <section className="inv-q" aria-label="Qualidade dos dados">
      <button type="button" className="inv-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        <ShieldCheck size={15} aria-hidden="true" />
        <span className="inv-label">Qualidade dos dados</span>
        <span className="inv-counts">O que ainda está solto nas atividades e reuniões</span>
      </button>
      {open && (
        <div className="inv-body inv-qbody">
          {loading && <SkeletonCards count={2} height={60} />}
          {error && <ErrorState title="Não foi possível medir" message={error} onRetry={load} />}
          {q && (
            <>
              <p className="inv-qintro">Mede as {q.scope.open} atividades em aberto ({q.scope.cronograma} do cronograma e {q.scope.reuniao} de reuniões) de {q.scope.companies} empresa(s). Só mede — nada é alterado.</p>
              <KpiGrid>
                <Kpi label="Sem responsável" value={q.gaps.noResponsible.cronograma + q.gaps.noResponsible.reuniao} tone={q.gaps.noResponsible.cronograma + q.gaps.noResponsible.reuniao ? 'warn' : 'ok'} hint={`${q.gaps.noResponsible.cronograma} cronograma · ${q.gaps.noResponsible.reuniao} reuniões`} />
                <Kpi label="Sem prazo" value={q.gaps.noDate.cronograma + q.gaps.noDate.reuniao} tone="warn" hint={`${q.gaps.noDate.cronograma} cronograma · ${q.gaps.noDate.reuniao} reuniões (${pct(q.gaps.noDate.reuniao, q.scope.reuniao)})`} />
                <Kpi label="Responsável fora da equipe" value={q.people.partial + q.people.ambiguous + q.people.unknown} tone={q.people.partial + q.people.ambiguous + q.people.unknown ? 'warn' : 'ok'} hint={`de ${q.people.evaluated} avaliadas (${pct(q.people.partial + q.people.ambiguous + q.people.unknown, q.people.evaluated)}) · ${q.people.clientSide} do lado do cliente não entram`} />
                <Kpi label="Lançadas no cronograma e na reunião" value={q.duplicates.count} tone={q.duplicates.count ? 'warn' : 'ok'} hint="mesmo título, mesma empresa — contadas duas vezes" />
                <Kpi label="Reuniões sem nenhuma tarefa" value={q.scope.meetings.noTasks} hint={`de ${q.scope.meetings.total} reuniões`} />
                <Kpi label="Reuniões sem data" value={q.scope.meetings.noDate} hint={`de ${q.scope.meetings.total} reuniões`} />
              </KpiGrid>

              {q.unknownNames.length > 0 && (
                <div className="inv-qlist">
                  <h3>Nomes a conciliar</h3>
                  <p>Responsáveis (lado PRICETAX e cronograma) que não são iguais a uma pessoa da equipe. Se for abreviação, é a mesma pessoa.</p>
                  <ul>
                    {q.unknownNames.map((n) => (
                      <li key={n.name}><b>{n.name}</b> — {n.count} {n.count === 1 ? 'atividade' : 'atividades'} · {n.companies.join(', ')}<span className="inv-qsug"> → {KIND_TEXT[n.kind](n.suggestion)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {q.clusters.length > 0 && (
                <div className="inv-qlist">
                  <h3>Provavelmente a mesma pessoa, escrita de formas diferentes</h3>
                  <ul>
                    {q.clusters.map((c) => (
                      <li key={c.first}>{c.variants.map((v) => `${v.name} (${v.count})`).join(' · ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              {q.duplicates.examples.length > 0 && (
                <div className="inv-qlist">
                  <h3>Lançadas duas vezes (exemplos)</h3>
                  <ul>
                    {q.duplicates.examples.map((d, i) => <li key={i}><b>{d.company}</b> — {d.title}{d.meeting ? <span className="inv-qsug"> (reunião: {d.meeting})</span> : null}</li>)}
                  </ul>
                </div>
              )}
              {q.unknownNames.length === 0 && q.clusters.length === 0 && q.duplicates.count === 0 && <p className="inv-qintro">Nada a conciliar nas atividades em aberto.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function InventoryView({ onOpenActivity, onOpenTodo, activityModalOpen }) {
  const [groupBy, setGroupBy] = useState('phase_responsible');
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [origins, setOrigins] = useState(['cronograma', 'reuniao']);
  const [company, setCompany] = useState('');
  const [phase, setPhase] = useState('');
  const [responsible, setResponsible] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [hidePaused, setHidePaused] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('default'); // default | all | none
  const [overrides, setOverrides] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams({ groupBy, status: status.join(','), origin: origins.join(',') });
    if (company) p.set('company', company);
    if (phase) p.set('phase', phase);
    if (responsible) p.set('responsible', responsible);
    if (overdue) p.set('overdue', '1');
    if (hidePaused) p.set('hidePausedCompanies', '1');
    return p.toString();
  }, [groupBy, status, origins, company, phase, responsible, overdue, hidePaused]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet(`/api/inventory?${query}`)
      .then((res) => { if (!cancelled) { setData(res); setError(''); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar o levantamento.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [query, reloadTick]);

  // Editar uma atividade no modal pode mudar fase/status/responsável: recarrega ao fechar.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !activityModalOpen) setReloadTick((n) => n + 1);
    wasOpen.current = !!activityModalOpen;
  }, [activityModalOpen]);

  useEffect(() => { setMode('default'); setOverrides({}); }, [groupBy]);

  const twoLevels = groupBy === 'phase_responsible' || groupBy === 'responsible_phase';
  // Padrão: dois níveis → só o 1º aberto (visão de resumo); um nível → aberto (já mostra as atividades).
  const isOpen = (path, depth, leafLevel) => {
    if (path in overrides) return overrides[path];
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return twoLevels ? depth === 0 : leafLevel;
  };
  const toggle = (path, cur) => setOverrides((o) => ({ ...o, [path]: !cur }));

  function toggleStatus(s) {
    setStatus((cur) => {
      const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      return next.length ? STATUSES.filter((x) => next.includes(x)) : cur;
    });
  }
  function toggleOrigin(o) {
    setOrigins((cur) => { const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]; return next.length ? ['cronograma', 'reuniao'].filter((x) => next.includes(x)) : cur; });
  }
  const filtersCount = [company, phase, responsible, overdue, hidePaused, status.join() !== DEFAULT_STATUS.join(), origins.length < 2].filter(Boolean).length;
  const clear = () => { setCompany(''); setPhase(''); setResponsible(''); setOverdue(false); setHidePaused(false); setStatus(DEFAULT_STATUS); setOrigins(['cronograma', 'reuniao']); };
  const download = () => { window.location.href = `/api/inventory/export.xlsx?${query}`; };

  // O que já é título de grupo não se repete na linha da atividade.
  const hide = { phase: groupBy.includes('phase'), responsible: groupBy.includes('responsible'), company: groupBy === 'company' };
  const u = data && data.universe;
  const totals = data && data.totals;

  return (
    <div className="inv">
      <div className="mac-pad" style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="inv-bar">
          <div className="inv-seg"><Segmented label="Agrupar por" value={groupBy} onChange={setGroupBy} options={GROUPINGS} /></div>
          <Button icon={Download} onClick={download} disabled={!data || loading} disabledReason="Aguarde o levantamento carregar">Baixar planilha</Button>
        </div>

        <ChipRow label="Origem das atividades">
          <Chip icon={CalendarRange} active={origins.includes('cronograma')} onClick={() => toggleOrigin('cronograma')}>Cronograma</Chip>
          <Chip icon={Mic} active={origins.includes('reuniao')} onClick={() => toggleOrigin('reuniao')}>Tarefas de reunião</Chip>
        </ChipRow>

        <ChipRow label="Situação das atividades">
          {STATUSES.map((s) => (
            <Chip key={s} active={status.includes(s)} accent={STATUS_META[s].color.startsWith('#') ? STATUS_META[s].color : undefined} onClick={() => toggleStatus(s)}>{STATUS_META[s].label}</Chip>
          ))}
          <Chip icon={AlertTriangle} active={overdue} accent="#e2574c" onClick={() => setOverdue((v) => !v)}>Só atrasadas</Chip>
          <Chip active={hidePaused} onClick={() => setHidePaused((v) => !v)}>Ocultar empresas pausadas</Chip>
        </ChipRow>

        <div>
          <Button className="mac-filters-toggle" aria-expanded={filtersOpen} aria-controls="inv-filters" onClick={() => setFiltersOpen((v) => !v)}>Filtros{filtersCount > 0 ? ` (${filtersCount})` : ''}</Button>
          <div id="inv-filters" className={`mac-filters${filtersOpen ? ' open' : ''}`}>
            <Select className="mac-sel" aria-label="Filtrar por empresa" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Todas as empresas</option>
              {u && u.companies.map((c) => <option key={c.id} value={c.id}>{c.label}{c.paused ? ' (pausada)' : ''}</option>)}
            </Select>
            <Select className="mac-sel" aria-label="Filtrar por fase" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="">Todas as fases</option>
              {u && u.phases.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.count})</option>)}
            </Select>
            <Select className="mac-sel" aria-label="Filtrar por responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)}>
              <option value="">Todos os responsáveis</option>
              {u && u.responsibles.map((r) => <option key={r.key} value={r.key}>{r.label} ({r.count})</option>)}
            </Select>
            {filtersCount > 0 && <Button size="sm" icon={X} onClick={clear}>Limpar filtros</Button>}
          </div>
        </div>

        {totals && (
          <div className="inv-sum" role="status" aria-live="polite">
            <Counts c={totals} split />
            <span className="inv-tools">
              <Button size="sm" onClick={() => { setMode('all'); setOverrides({}); }}>Expandir tudo</Button>
              <Button size="sm" onClick={() => { setMode('none'); setOverrides({}); }}>Recolher tudo</Button>
            </span>
          </div>
        )}
      </div>

      <div className="mac-pad" style={{ paddingTop: 8, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <QualityPanel />
        {error && <div style={S.loginBlockedMsg}>{error}</div>}
        {loading && !data && !error && <SkeletonCards count={4} height={52} />}
        {data && !error && data.groups.length === 0 && (
          <EmptyState icon={Search} title="Nenhuma atividade com esses filtros" description="Mude a situação ou tire algum filtro para ver mais.">
            {filtersCount > 0 && <Button size="sm" icon={X} onClick={clear}>Limpar filtros</Button>}
          </EmptyState>
        )}
        {data && !error && data.groups.map((g) => <Group key={g.key} group={g} depth={0} path="" isOpen={isOpen} toggle={toggle} onOpen={onOpenActivity} onOpenTodo={onOpenTodo} hide={hide} />)}
      </div>
    </div>
  );
}
