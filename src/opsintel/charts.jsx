import React from 'react';

// Gráficos em SVG/CSS puro (sem biblioteca): leves, imprimíveis e no tema do app. Cores via variáveis do tema.
export const fmtDur = (s) => {
  if (s == null) return '—';
  const m = Math.round(s / 60);
  if (m < 1) return s > 0 ? '<1 min' : '0 min';
  const h = Math.floor(m / 60); const r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')} min` : ''}` : `${m} min`;
};
export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
export const dayLabel = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Selo da base de cada número: medido, estimado ou indisponível. Nunca mostrar número sem ele.
const BASIS = { real: { t: 'Medido', c: 'var(--oi-ok)' }, estimado: { t: 'Estimado', c: 'var(--oi-warn)' }, indisponivel: { t: 'Indisponível', c: 'var(--oi-faint)' }, misto: { t: 'Misto', c: 'var(--oi-info)' } };
export function Basis({ basis, title }) {
  const b = BASIS[basis] || BASIS.indisponivel;
  return <span className="oi-basis" style={{ '--c': b.c }} title={title || (basis === 'estimado' ? 'Calculado a partir de eventos que já existiam; não é medição direta.' : basis === 'real' ? 'Registrado pelo rastreador do app.' : basis === 'misto' ? 'Parte dos dias é medida e parte é estimada.' : 'Sem evidência confiável para este número.')}>{b.t}</span>;
}

export function Kpi({ label, value, sub, change, basis, tone }) {
  const up = change != null && change > 0; const down = change != null && change < 0;
  return (
    <div className="oi-kpi" style={tone ? { '--tone': tone } : undefined}>
      <div className="oi-kpi-top"><span className="oi-kpi-label">{label}</span><Basis basis={basis} /></div>
      <div className="oi-kpi-value">{value}</div>
      <div className="oi-kpi-foot">
        {change != null ? <span className={`oi-delta ${up ? 'up' : down ? 'down' : ''}`}>{up ? '▲' : down ? '▼' : '■'} {Math.abs(change)}% <em>vs. período anterior</em></span> : <span className="oi-sub">{sub || 'sem base de comparação'}</span>}
      </div>
    </div>
  );
}

// Barras por dia, empilhadas: medido (cor cheia) + estimado (listrado).
export function DailyBars({ rows, height = 150 }) {
  if (!rows.length) return <div className="oi-empty">Sem atividade neste período.</div>;
  const max = Math.max(1, ...rows.map((r) => r.realActiveS + r.estimatedActiveS));
  const w = 100 / rows.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="oi-svg" style={{ height }} role="img" aria-label="Tempo ativo por dia">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={(height / 3) * (1 - g)} y2={(height / 3) * (1 - g)} className="oi-grid" />)}
        {rows.map((r, i) => {
          const hr = ((r.realActiveS) / max) * (height / 3 - 2); const he = ((r.estimatedActiveS) / max) * (height / 3 - 2);
          const x = i * w + w * 0.12; const bw = w * 0.76; const base = height / 3;
          return (
            <g key={r.date}>
              <title>{`${dayLabel(r.date)}: medido ${fmtDur(r.realActiveS)} · estimado ${fmtDur(r.estimatedActiveS)} · ${r.accesses} acesso(s) · ${r.operations} operação(ões)`}</title>
              <rect x={x} y={base - hr} width={bw} height={hr} className="oi-bar-real" />
              <rect x={x} y={base - hr - he} width={bw} height={he} className="oi-bar-est" />
            </g>
          );
        })}
      </svg>
      <div className="oi-axis"><span>{dayLabel(rows[0].date)}</span><span>{dayLabel(rows[Math.floor(rows.length / 2)].date)}</span><span>{dayLabel(rows[rows.length - 1].date)}</span></div>
      <div className="oi-legend"><span><i className="oi-sw real" />Medido</span><span><i className="oi-sw est" />Estimado</span></div>
    </div>
  );
}

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// Mapa de calor dia da semana × hora. `unit` explica o que a intensidade significa em cada fonte.
export function Heat({ matrix, unit }) {
  const flat = matrix.flat(); const max = Math.max(1, ...flat);
  if (!flat.some((v) => v > 0)) return <div className="oi-empty">Ainda sem dados nesta fonte.</div>;
  return (
    <div>
      <div className="oi-heat" role="img" aria-label="Atividade por dia da semana e hora">
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="oi-heat-h">{h % 3 === 0 ? h : ''}</div>)}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <React.Fragment key={d}>
            <div className="oi-heat-d">{DOW[d]}</div>
            {matrix[d].map((v, h) => <div key={h} className="oi-heat-c" style={{ '--a': v ? Math.max(0.12, v / max) : 0 }} title={`${DOW[d]} ${h}h: ${unit(v)}`} />)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function HBars({ rows, valueOf, labelOf, format, empty = 'Sem dados.', max: maxIn }) {
  if (!rows.length) return <div className="oi-empty">{empty}</div>;
  const max = maxIn || Math.max(1, ...rows.map(valueOf));
  return (
    <div className="oi-hbars">
      {rows.map((r, i) => (
        <div key={i} className="oi-hbar">
          <div className="oi-hbar-l" title={labelOf(r)}>{labelOf(r)}</div>
          <div className="oi-hbar-t"><div className="oi-hbar-f" style={{ width: `${Math.max(2, (valueOf(r) / max) * 100)}%` }} /></div>
          <div className="oi-hbar-v">{format(r)}</div>
        </div>
      ))}
    </div>
  );
}

export const MODULE_NAMES = { company: 'Empresas', personal: 'Gestão de Atividades', xflow: 'XFlow', agenda: 'Agenda', macro: 'Visão Geral', knowledge: 'Conhecimento', pareceres: 'Pareceres', modelos: 'Modelos', crm: 'CRM', users: 'Usuários', ops: 'Inteligência', inicio: 'Tela inicial', outros: 'Outros' };
export const modName = (m) => MODULE_NAMES[m] || m || 'Outros';
export const VIEW_NAMES = { table: 'Tabela', resumo: 'Resumo', meetings: 'Reuniões', todo: 'Tarefas', timeline: 'Gantt', phases: 'Fases', kanban: 'Quadro', mapa: 'Mapa', triagem: 'Triagem' };
export const ROLE_NAMES = { master: 'Master', pricetax: 'PRICETAX', cliente: 'Cliente' };
