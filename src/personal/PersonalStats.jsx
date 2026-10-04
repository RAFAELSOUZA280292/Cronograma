import React, { useEffect, useState } from 'react';
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

function Bars({ items, opened, closed, peakOpened, peakClosed, showEvery }) {
  const max = Math.max(1, ...opened, ...closed);
  return (
    <div className="ps-bars">
      {items.map((it, i) => {
        const o = opened[it.idx];
        const c = closed[it.idx];
        const isPeak = it.idx === peakOpened || it.idx === peakClosed;
        const label = showEvery && (it.n % showEvery !== 0 && it.n !== 1) ? '' : it.short;
        return (
          <div key={it.idx} className="ps-col" title={`${it.long || it.short}: ${o} aberta${o === 1 ? '' : 's'}, ${c} encerrada${c === 1 ? '' : 's'}`}>
            <div className="ps-val">{it.idx === peakOpened && o > 0 ? o : ''}{it.idx === peakOpened && it.idx === peakClosed ? ' · ' : ''}{it.idx === peakClosed && c > 0 ? c : ''}</div>
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
    const wdOpen = peakIndex(weekday.opened);
    const wdClose = peakIndex(weekday.closed);
    const mdOpen = peakIndex(monthDay.opened);
    const mdClose = peakIndex(monthDay.closed);
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
              <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: OPENED }}>{opened}</div><div className="ps-kpi-label">Abertas</div></div>
              <div className="ps-kpi"><div className="ps-kpi-num" style={{ color: CLOSED }}>{closed}</div><div className="ps-kpi-label">Encerradas</div></div>
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
              <div className="ps-title">Dia da semana</div>
              <div className="ps-sub">Quando você abre e quando encerra atividades. O pico de cada um fica em destaque.</div>
              <Bars items={weekItems} opened={weekday.opened} closed={weekday.closed} peakOpened={wdOpen} peakClosed={wdClose} />
              <div className="ps-legend"><span><i className="ps-dot" style={{ background: OPENED }} />Abertas</span><span><i className="ps-dot" style={{ background: CLOSED }} />Encerradas</span></div>
            </div>

            <div className="ps-card">
              <div className="ps-title">Dia do mês</div>
              <div className="ps-sub">Somando todos os meses do período.</div>
              <Bars items={dayItems} opened={monthDay.opened} closed={monthDay.closed} peakOpened={mdOpen} peakClosed={mdClose} showEvery={5} />
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
