// "Sua semana" na tela inicial (Onda 5, §81): 3–4 números dos últimos 7 dias, vindos do mesmo endpoint dos Indicadores do
// quadro pessoal (GET /api/personal-board/stats?days=7). Falha de carga NUNCA quebra a tela: vira um aviso compacto com
// "Tentar de novo". `overdueNow` (atrasadas de agora) vem do "Hoje" — o endpoint só conta aberturas/encerramentos.
import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { Button, ErrorState, Skeleton } from '../ui/index.jsx';

const WEEKDAY_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const CSS = `
.ws { font-family: 'Inter', sans-serif; margin: 0 0 18px; }
.ws-card { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 14px; padding: 14px 18px; }
.ws-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ws-title { margin: 0; font-size: 14px; font-weight: 800; color: var(--text-1); }
.ws-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.ws-kpi { background: var(--bg-3); border: 1px solid var(--border-1); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.ws-num { font-size: 24px; font-weight: 800; line-height: 1.1; color: var(--text-1); font-variant-numeric: tabular-nums; }
.ws-num.small { font-size: 16px; text-transform: capitalize; padding-top: 5px; }
.ws-num.danger { color: var(--ui-danger, #ff7b70); }
.ws-lab { margin-top: 3px; font-size: 11.5px; color: var(--text-4); line-height: 1.35; }
`;

function peak(arr) {
  let best = -1;
  let max = 0;
  (arr || []).forEach((n, i) => { if (n > max) { max = n; best = i; } });
  return best;
}

export default function WeekSummary({ overdueNow, onOpenStats }) {
  const [state, setState] = useState({ loading: true, error: '', stats: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', stats: null });
    apiGet('/api/personal-board/stats?days=7')
      .then((r) => {
        if (cancelled) return;
        if (r && r.weekday && Array.isArray(r.weekday.closed) && typeof r.opened === 'number' && typeof r.closed === 'number') setState({ loading: false, error: '', stats: r });
        else setState({ loading: false, error: 'Resposta inesperada do servidor.', stats: null });
      })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: (e && e.message) || 'Sem conexão com o servidor.', stats: null }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const { loading, error, stats } = state;
  const topDay = stats ? peak(stats.weekday.closed) : -1;

  return (
    <section className="ws" aria-label="Sua semana">
      <style>{CSS}</style>
      <div className="ws-card">
        <div className="ws-head">
          <h2 className="ws-title">Sua semana <span style={{ fontWeight: 600, color: 'var(--text-5)', fontSize: 12 }}>· últimos 7 dias</span></h2>
          {onOpenStats && <Button size="sm" onClick={onOpenStats}>Ver indicadores</Button>}
        </div>
        {loading && <div className="ws-grid" role="status" aria-busy="true" aria-label="Carregando sua semana">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={62} radius={10} />)}</div>}
        {!loading && error && <ErrorState compact title="Não foi possível carregar sua semana" message={error} onRetry={() => setAttempt((a) => a + 1)} />}
        {!loading && stats && (
          <div className="ws-grid">
            <div className="ws-kpi"><div className="ws-num">{stats.closed}</div><div className="ws-lab">Concluídas</div></div>
            <div className="ws-kpi"><div className="ws-num">{stats.opened}</div><div className="ws-lab">Abertas (novas)</div></div>
            <div className="ws-kpi"><div className={`ws-num ${overdueNow > 0 ? 'danger' : ''}`}>{overdueNow}</div><div className="ws-lab">Atrasadas agora</div></div>
            <div className="ws-kpi"><div className="ws-num small">{topDay >= 0 ? WEEKDAY_LONG[topDay] : '—'}</div><div className="ws-lab">{topDay >= 0 ? 'Dia com mais conclusões' : 'Sem conclusões na semana'}</div></div>
          </div>
        )}
      </div>
    </section>
  );
}
