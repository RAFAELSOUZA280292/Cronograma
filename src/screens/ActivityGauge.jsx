// Velocímetro da atividade (2026-10-19, pedido do Rafael): no detalhe de cada atividade, quanto das subatividades está feito, quanto foi pulado e quanto falta para
// zerar a etapa. O arco verde são as concluídas de verdade, o âmbar as puladas; o número do centro é o que já foi resolvido (feitas + puladas).
import React from 'react';
import { STATUS_META } from '../App.jsx';
import { subStats } from '../lib/subStats.js';

export const GAUGE_CSS = `
  .ag { display:flex; align-items:center; gap:16px; flex-wrap:wrap; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:10px 14px; margin-bottom:10px; }
  .ag-svg { flex:0 0 auto; }
  .ag-num { font-size:20px; font-weight:800; fill:var(--text-1); font-variant-numeric:tabular-nums; }
  .ag-lab { font-size:8px; fill:var(--text-4); text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .ag-kpis { display:flex; gap:8px; flex-wrap:wrap; flex:1 1 220px; }
  .ag-kpi { flex:1 1 90px; min-width:84px; border:1px solid var(--border-2); border-radius:10px; padding:7px 10px; }
  .ag-kpi b { display:block; font-size:22px; line-height:1.1; font-variant-numeric:tabular-nums; color:var(--text-1); }
  .ag-kpi span { display:block; margin-top:2px; font-size:11px; color:var(--text-4); }
  .ag-kpi.done b { color:#3ecf6e; } .ag-kpi.skip b { color:#ff9f40; } .ag-kpi.left { border-color:rgba(245,196,0,.55); } .ag-kpi.left b { color:#F5C400; }
  .ag-status { margin-left:auto; font-size:11px; font-weight:700; border-radius:999px; padding:2px 10px; border:1px solid; white-space:nowrap; }
  .ag-empty { font-size:12.5px; color:var(--text-4); }
  @media (max-width: 767px) { .ag { gap:10px; padding:10px; } .ag-kpi { min-width:76px; } }
`;

export function ActivityGauge({ activity }) {
  const st = subStats(activity.subactivities);
  const meta = STATUS_META[activity.status] || STATUS_META['nao-iniciado'];
  if (!st.total) {
    return <div className="ag"><style>{GAUGE_CSS}</style><span className="ag-empty">Esta atividade ainda não tem subatividades para medir.</span><span className="ag-status" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>{meta.label}</span></div>;
  }
  // Semicírculo de 100 unidades: verde (feitas), depois âmbar (puladas). `pathLength` deixa os traços em porcentagem exata.
  const arc = 'M10 60 A50 50 0 0 1 110 60';
  const label = `${st.resolved} de ${st.total} subatividades resolvidas: ${st.done} concluídas, ${st.skipped} puladas, ${st.pending} faltam`;
  return (
    <div className="ag" role="group" aria-label={label}>
      <style>{GAUGE_CSS}</style>
      <svg className="ag-svg" viewBox="0 0 120 72" width="150" height="90" role="img" aria-label={`${st.pctResolved}% resolvido`}>
        <path d={arc} fill="none" stroke="var(--border-2)" strokeWidth="10" pathLength="100" />
        {st.pctDone > 0 && <path d={arc} fill="none" stroke="#3ecf6e" strokeWidth="10" pathLength="100" strokeDasharray={`${st.done / st.total * 100} 100`} />}
        {st.pctSkipped > 0 && <path d={arc} fill="none" stroke="#ff9f40" strokeWidth="10" pathLength="100" strokeDasharray={`${st.skipped / st.total * 100} 100`} strokeDashoffset={-(st.done / st.total * 100)} />}
        <text x="60" y="52" textAnchor="middle" className="ag-num">{st.pctResolved}%</text>
        <text x="60" y="66" textAnchor="middle" className="ag-lab">resolvido</text>
      </svg>
      <div className="ag-kpis">
        <div className="ag-kpi done"><b>{st.done}</b><span>concluídas</span></div>
        <div className="ag-kpi skip"><b>{st.skipped}</b><span>puladas</span></div>
        <div className="ag-kpi left"><b>{st.pending}</b><span>{st.pending === 1 ? 'falta para zerar a etapa' : 'faltam para zerar a etapa'}</span></div>
      </div>
      <span className="ag-status" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }} title="Status da atividade">{meta.label}</span>
    </div>
  );
}
