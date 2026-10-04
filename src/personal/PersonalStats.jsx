import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { SidePanel } from '../App.jsx';

const OPENED = '#5B8DEF';
const CLOSED = '#3ecf6e';

const WEEKDAYS = [
  { idx: 1, short: 'Seg', long: 'segunda-feira', plural: 'segundas' },
  { idx: 2, short: 'Ter', long: 'terça-feira', plural: 'terças' },
  { idx: 3, short: 'Qua', long: 'quarta-feira', plural: 'quartas' },
  { idx: 4, short: 'Qui', long: 'quinta-feira', plural: 'quintas' },
  { idx: 5, short: 'Sex', long: 'sexta-feira', plural: 'sextas' },
  { idx: 6, short: 'Sáb', long: 'sábado', plural: 'sábados' },
  { idx: 0, short: 'Dom', long: 'domingo', plural: 'domingos' },
];

const PERIODS = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 0, label: 'Tudo' },
];

const TZ = 'America/Sao_Paulo';
const fmtNum = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const shortDay = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
function shiftDay(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function dayLabel(ymd) {
  const t = new Date(`${ymd}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function peakIndex(arr) {
  let best = -1;
  let max = 0;
  arr.forEach((n, i) => { if (n > max) { max = n; best = i; } });
  return best;
}

const CSS = `
  .ps-chip { font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-4); cursor: pointer; }
  .ps-chip.on { background: var(--bg-4); color: var(--text-1); border-color: var(--border-3); }
  .ps-kpi { flex: 1; min-width: 0; background: var(--bg-3); border: 1px solid var(--border-1); border-radius: 10px; padding: 12px 14px; }
  .ps-kpi-num { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .ps-kpi-label { font-size: 11px; color: var(--text-6); margin-top: 3px; }
  .ps-card { background: var(--bg-3); border: 1px solid var(--border-1); border-radius: 10px; padding: 14px; }
  .ps-title { font-size: 12.5px; font-weight: 700; color: var(--text-1); }
  .ps-sub { font-size: 11px; color: var(--text-6); margin-top: 2px; }
  .ps-bars { display: flex; align-items: flex-end; gap: 3px; height: 110px; margin-top: 14px; }
  .ps-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .ps-pair { display: flex; align-items: flex-end; gap: 1px; width: 100%; flex: 1; justify-content: center; }
  .ps-bar { flex: 1; max-width: 14px; border-radius: 2px 2px 0 0; min-height: 0; }
  .ps-val { font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; height: 13px; line-height: 13px; color: var(--text-3); white-space: nowrap; }
  .ps-lab { font-size: 10px; color: var(--text-6); margin-top: 4px; height: 12px; white-space: nowrap; }
  .ps-lab.peak { color: var(--text-1); font-weight: 700; }
  .ps-legend { display: flex; gap: 14px; font-size: 11px; color: var(--text-5); margin-top: 10px; }
  .ps-nav { display: flex; align-items: center; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
  .ps-navbtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 7px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-3); cursor: pointer; }
  .ps-navbtn:disabled { opacity: .35; cursor: default; }
  .ps-nav .ps-date { width: 150px; flex: 0 0 auto; height: 30px; border-radius: 7px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-1); padding: 0 8px; font-size: 12.5px; font-family: inherit; }
  .ps-strip { display: flex; align-items: flex-end; gap: 2px; height: 64px; margin-top: 14px; }
  .ps-day { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 1px; padding: 0 0 0; border: none; border-radius: 3px; background: transparent; cursor: pointer; }
  .ps-day:hover { background: var(--bg-4); }
  .ps-day.sel { background: var(--bg-4); box-shadow: inset 0 -2px 0 var(--text-1); }
  .ps-day i { display: block; flex: 1; max-width: 6px; border-radius: 1px 1px 0 0; }
  .ps-evt { display: flex; gap: 8px; font-size: 12.5px; color: var(--text-2); padding: 5px 0; border-top: 1px solid var(--border-1); }
  .ps-evt time { color: var(--text-6); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .ps-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
`;

function Gauge180({ pct }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const r = 70;
  const cx = 90;
  const cy = 86;
  const arc = (from, to) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const needle = Math.PI * (1 - clamped);
  return (
    <svg viewBox="0 0 180 100" style={{ width: 180, height: 100, flexShrink: 0 }} role="img" aria-label={`Ritmo de encerramento ${Math.round(pct * 100)}%`}>
      <path d={arc(0, 1)} stroke="var(--border-2)" strokeWidth="12" fill="none" strokeLinecap="round" />
      {clamped > 0 && <path d={arc(0, clamped)} stroke={CLOSED} strokeWidth="12" fill="none" strokeLinecap="round" />}
      <line x1={cx} y1={cy} x2={cx + (r - 18) * Math.cos(needle)} y2={cy - (r - 18) * Math.sin(needle)} stroke="var(--text-1)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="var(--text-1)" />
    </svg>
  );
}

function Bars({ items, opened, closed, peakOpened, peakClosed, showEvery, fmt = (n) => n }) {
  const max = Math.max(1, ...opened, ...closed);
  return (
    <div className="ps-bars">
      {items.map((it, i) => {
        const o = opened[it.idx];
        const c = closed[it.idx];
        const isPeak = it.idx === peakOpened || it.idx === peakClosed;
        const label = showEvery && (it.n % showEvery !== 0 && it.n !== 1) ? '' : it.short;
        return (
          <div key={it.idx} className="ps-col" title={`${it.long || it.short}: ${fmt(o)} aberta${o === 1 ? '' : 's'}, ${fmt(c)} encerrada${c === 1 ? '' : 's'}`}>
            <div className="ps-val">{it.idx === peakOpened && o > 0 ? fmt(o) : ''}{it.idx === peakOpened && it.idx === peakClosed ? ' · ' : ''}{it.idx === peakClosed && c > 0 ? fmt(c) : ''}</div>
            <div className="ps-pair" style={{ height: 78 }}>
              <div className="ps-bar" style={{ height: `${(o / max) * 100}%`, background: OPENED, opacity: it.idx === peakOpened ? 1 : 0.55 }} />
              <div className="ps-bar" style={{ height: `${(c / max) * 100}%`, background: CLOSED, opacity: it.idx === peakClosed ? 1 : 0.55 }} />
            </div>
            <div className={`ps-lab${isPeak ? ' peak' : ''}`}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function PersonalStatsPanel({ onClose }) {
  const [period, setPeriod] = useState(0);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('total');
  const [day, setDay] = useState('');
  const [dayData, setDayData] = useState(null);
  const [dayError, setDayError] = useState('');

  useEffect(() => {
    if (stats && !day) setDay(stats.today);
  }, [stats, day]);

  useEffect(() => {
    if (!day) return undefined;
    let cancelled = false;
    setDayError('');
    apiGet(`/api/personal-board/stats/day?date=${day}`)
      .then((r) => {
        if (cancelled) return;
        if (r && Array.isArray(r.window) && Array.isArray(r.events)) setDayData(r);
        else setDayError('Não foi possível carregar este dia.');
      })
      .catch((e) => { if (!cancelled) setDayError(e && e.message ? e.message : 'Não foi possível carregar este dia.'); });
    return () => { cancelled = true; };
  }, [day]);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError('');
    apiGet(`/api/personal-board/stats${period ? `?days=${period}` : ''}`)
      .then((r) => {
        if (cancelled) return;
        if (r && r.weekday && r.monthDay) setStats(r);
        else setError('Não foi possível carregar os indicadores.');
      })
      .catch((e) => { if (!cancelled) setError(e && e.message ? e.message : 'Não foi possível carregar os indicadores.'); });
    return () => { cancelled = true; };
  }, [period]);

  const body = () => {
    if (error) return <div style={{ fontSize: 12.5, color: '#e2574c' }}>{error}</div>;
    if (!stats) return <div style={{ fontSize: 12.5, color: 'var(--text-6)' }}>Carregando…</div>;
    const { opened, closed, weekday, monthDay } = stats;
    const pct = opened > 0 ? closed / opened : 0;
    const days = Math.max(1, stats.totalDays);
    const avgOpened = opened / days;
    const avgClosed = closed / days;
    const per = (arr, occ) => (mode === 'avg' ? arr.map((n, i) => (occ[i] ? n / occ[i] : 0)) : arr);
    const wd = { opened: per(weekday.opened, stats.weekdayDays), closed: per(weekday.closed, stats.weekdayDays) };
    const md = { opened: per(monthDay.opened, stats.monthDayDays), closed: per(monthDay.closed, stats.monthDayDays) };
    const fmt = mode === 'avg' ? fmtNum : (n) => n;
    const wdOpen = peakIndex(wd.opened);
    const wdClose = peakIndex(wd.closed);
    const mdOpen = peakIndex(md.opened);
    const mdClose = peakIndex(md.closed);
    const dayOpened = dayData ? dayData.events.filter((e) => e.kind === 'opened') : [];
    const dayClosed = dayData ? dayData.events.filter((e) => e.kind === 'closed') : [];
    const winMax = dayData ? Math.max(1, ...dayData.window.map((w) => Math.max(w.opened, w.closed))) : 1;
    const isToday = day === stats.today;
    const wdName = (i) => WEEKDAYS.find((w) => w.idx === i);
    const weekItems = WEEKDAYS.map((w, n) => ({ ...w, n: n + 1 }));
    const dayItems = Array.from({ length: 31 }, (_, i) => ({ idx: i, short: String(i + 1), long: `Dia ${i + 1}`, n: i + 1 }));
    const missing = stats.withoutOpenDate + stats.closedWithoutDate;
    const since = stats.firstEventAt ? new Date(stats.firstEventAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map((p) => (
            <button key={p.value} className={`ps-chip${period === p.value ? ' on' : ''}`} onClick={() => setPeriod(p.value)}>{p.label}</button>
          ))}
        </div>

        {opened + closed === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-6)', lineHeight: 1.5 }}>
            Ainda não há atividades abertas ou encerradas neste período. Crie e conclua tarefas no quadro e os indicadores aparecem aqui.
          </div>
        ) : (
          <>
            <div className="ps-card" style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
              {wdOpen >= 0 && <>Você abre mais atividades às <b style={{ color: OPENED }}>{wdName(wdOpen).plural}</b></>}
              {wdOpen >= 0 && wdClose >= 0 && <> e encerra mais às <b style={{ color: CLOSED }}>{wdName(wdClose).plural}</b>.</>}
              {wdOpen >= 0 && wdClose < 0 && '.'}
              {wdOpen < 0 && wdClose >= 0 && <>Você encerra mais atividades às <b style={{ color: CLOSED }}>{wdName(wdClose).plural}</b>.</>}
              {mdOpen >= 0 && <> No mês, o dia de mais aberturas é o <b style={{ color: OPENED }}>{mdOpen + 1}</b>{mdClose >= 0 && <> e o de mais encerramentos é o <b style={{ color: CLOSED }}>{mdClose + 1}</b></>}.</>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: OPENED }}>{opened}</div><div className="ps-kpi-label">Abertas · média de {fmtNum(avgOpened)} por dia</div></div>
              <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: CLOSED }}>{closed}</div><div className="ps-kpi-label">Encerradas · média de {fmtNum(avgClosed)} por dia</div></div>
            </div>

            <div className="ps-card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Gauge180 pct={pct} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{Math.round(pct * 100)}%</div>
                <div className="ps-title">Ritmo de encerramento</div>
                <div className="ps-sub">{closed} encerradas para {opened} abertas. Acima de 100% é sinal de que você está zerando o que já tinha acumulado.</div>
              </div>
            </div>

            <div className="ps-card">
              <div className="ps-title">Dia a dia</div>
              <div className="ps-sub">Navegue por um dia e veja o que foi aberto e encerrado. Média do período: {fmtNum(avgOpened)} abertas e {fmtNum(avgClosed)} encerradas por dia.</div>
              <div className="ps-nav">
                <button className="ps-navbtn" title="Dia anterior" onClick={() => setDay(shiftDay(day, -1))}><ChevronLeft size={16} /></button>
                <input className="ps-date" type="date" value={day} max={stats.today} onChange={(e) => { if (e.target.value && e.target.value <= stats.today) setDay(e.target.value); }} />
                <button className="ps-navbtn" title="Próximo dia" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}><ChevronRight size={16} /></button>
                {!isToday && <button className="ps-chip" onClick={() => setDay(stats.today)}>Hoje</button>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 10 }}>{dayLabel(day)}</div>
              {dayError && <div style={{ fontSize: 12, color: '#e2574c', marginTop: 8 }}>{dayError}</div>}
              {dayData && dayData.date === day && (
                <>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: OPENED }}>{dayOpened.length}</div><div className="ps-kpi-label">Abertas neste dia</div></div>
                    <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: CLOSED }}>{dayClosed.length}</div><div className="ps-kpi-label">Encerradas neste dia</div></div>
                  </div>
                  <div className="ps-strip">
                    {dayData.window.map((w) => (
                      <button key={w.d} className={`ps-day${w.d === day ? ' sel' : ''}`} title={`${shortDay(w.d)}: ${w.opened} abertas, ${w.closed} encerradas`} onClick={() => setDay(w.d)}>
                        <i style={{ height: `${(w.opened / winMax) * 100}%`, background: OPENED }} />
                        <i style={{ height: `${(w.closed / winMax) * 100}%`, background: CLOSED }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-6)', marginTop: 4 }}>
                    <span>{shortDay(dayData.window[0].d)}</span><span>30 dias até o dia escolhido</span><span>{shortDay(dayData.window[dayData.window.length - 1].d)}</span>
                  </div>
                  {[['Abertas', dayOpened, OPENED], ['Encerradas', dayClosed, CLOSED]].map(([label, list, color]) => list.length > 0 && (
                    <div key={label} style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
                      {list.map((e) => (
                        <div key={`${e.cardId}-${e.kind}-${e.at}`} className="ps-evt">
                          <time>{hhmm(e.at)}</time>
                          <span style={e.title === null ? { fontStyle: 'italic', color: 'var(--text-6)' } : undefined}>{e.title === null ? 'Atividade excluída' : (e.title || 'Sem título')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {dayOpened.length + dayClosed.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-6)', marginTop: 12 }}>Nada aberto nem encerrado neste dia.</div>}
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-6)' }}>Gráficos:</span>
              <button className={`ps-chip${mode === 'total' ? ' on' : ''}`} onClick={() => setMode('total')}>Total</button>
              <button className={`ps-chip${mode === 'avg' ? ' on' : ''}`} onClick={() => setMode('avg')}>Média por dia</button>
            </div>

            <div className="ps-card">
              <div className="ps-title">Dia da semana{mode === 'avg' ? ' (média)' : ''}</div>
              <div className="ps-sub">{mode === 'avg' ? 'Média por ocorrência de cada dia da semana no período.' : 'Quando você abre e quando encerra atividades. O pico de cada um fica em destaque.'}</div>
              <Bars items={weekItems} opened={wd.opened} closed={wd.closed} peakOpened={wdOpen} peakClosed={wdClose} fmt={fmt} />
              <div className="ps-legend"><span><i className="ps-dot" style={{ background: OPENED }} />Abertas</span><span><i className="ps-dot" style={{ background: CLOSED }} />Encerradas</span></div>
            </div>

            <div className="ps-card">
              <div className="ps-title">Dia do mês{mode === 'avg' ? ' (média)' : ''}</div>
              <div className="ps-sub">{mode === 'avg' ? 'Média por ocorrência de cada dia do mês no período.' : 'Somando todos os meses do período.'}</div>
              <Bars items={dayItems} opened={md.opened} closed={md.closed} peakOpened={mdOpen} peakClosed={mdClose} showEvery={5} fmt={fmt} />
            </div>
          </>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-7)', lineHeight: 1.5 }}>
          Horário de Brasília. Cada abertura e cada encerramento é guardado de forma permanente{since ? `, desde ${since}` : ''}: reabrir ou excluir uma atividade não apaga o que já foi registrado, e encerrar de novo conta como um novo encerramento.
          {missing > 0 && <> {missing} atividade{missing === 1 ? '' : 's'} antiga{missing === 1 ? '' : 's'} sem data registrada não entra{missing === 1 ? '' : 'm'} na conta.</>}
        </div>
      </div>
    );
  };

  return (
    <SidePanel title="Meus indicadores" onClose={onClose} width={540}>
      <style>{CSS}</style>
      {body()}
    </SidePanel>
  );
}
