// Aba Métricas (Fase 8, item 11 do pedido do Rafael) — números limpos
// e úteis a partir de ai_metrics_events/ai_answer_cache/ai_messages já
// existentes (server/knowledgeCenter.js `getMetrics`). Sem lib de
// gráfico nova, sem BI — só cards e tabelas simples.
import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { knowledgeTypeLabel } from './knowledgeMeta.js';

function pct(n) { return n == null ? '—' : `${Math.round(n * 100)}%`; }

export function MetricsTab() {
  const [metrics, setMetrics] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [projectNames, setProjectNames] = useState({});

  useEffect(() => {
    apiGet('/api/knowledge/metrics').then((res) => { setMetrics(res); setLoaded(true); }).catch(() => setLoaded(true));
    apiGet('/api/projects').then((res) => {
      const map = {};
      (res.projects || []).forEach((p) => { map[p.id] = (p.company && (p.company.nomeFantasia || p.company.name)) || p.id; });
      setProjectNames(map);
    }).catch(() => {});
  }, []);

  if (!loaded) return <div className="knw-empty">Carregando…</div>;
  if (!metrics) return <div className="knw-empty">Não consegui carregar as métricas.</div>;

  const { memory, cache, topFacts, topProjects, topUsers } = metrics;

  return (
    <div className="knw-metric-grid">
      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Memória</div>
        <div className="knw-metric-row"><span>Fatos propostos</span><b>{memory.factsProposed}</b></div>
        <div className="knw-metric-row"><span>Fatos confirmados</span><b>{memory.factsConfirmed}</b></div>
        <div className="knw-metric-row"><span>Fatos rejeitados</span><b>{memory.factsRejected}</b></div>
        <div className="knw-metric-row"><span>Conflitos detectados</span><b>{memory.conflictsDetected}</b></div>
        <div className="knw-metric-row"><span>Atualizações temporais</span><b>{memory.temporalUpdates}</b></div>
        <div className="knw-metric-row"><span>Duplicatas</span><b>{memory.duplicates}</b></div>
        <div className="knw-metric-row"><span>Complementos</span><b>{memory.complements}</b></div>
        <div className="knw-metric-row"><span>Edições manuais</span><b>{memory.factsEdited}</b></div>
        <div className="knw-metric-row"><span>Conflitos resolvidos</span><b>{memory.conflictsResolved}</b></div>
      </div>

      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Cache</div>
        <div className="knw-metric-row"><span>Acertos (hits)</span><b>{cache.hits}</b></div>
        <div className="knw-metric-row"><span>Erros (misses)</span><b>{cache.misses}</b></div>
        <div className="knw-metric-row"><span>Rejeitados por dependência</span><b>{cache.rejectedStale}</b></div>
        <div className="knw-metric-row"><span>Taxa de aproveitamento</span><b>{pct(cache.hitRate)}</b></div>
        <div className="knw-metric-row"><span>Tokens economizados</span><b>{(cache.tokensSavedInput + cache.tokensSavedOutput).toLocaleString('pt-BR')}</b></div>
      </div>

      <div className="knw-metric-card" style={{ gridColumn: '1 / -1' }}>
        <div className="knw-metric-card-title">Conhecimentos mais utilizados</div>
        {topFacts.length === 0 ? <div className="knw-empty-hint">Ainda sem uso registrado.</div> : (
          <table className="knw-table">
            <thead><tr><th>Assunto</th><th>Tipo</th><th>Usos</th></tr></thead>
            <tbody>{topFacts.map((f) => <tr key={f.id}><td>{f.subject}</td><td>{knowledgeTypeLabel(f.knowledge_type)}</td><td>{f.usage_count}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Projetos que mais ensinam</div>
        {topProjects.length === 0 ? <div className="knw-empty-hint">Sem dados ainda.</div> : (
          <table className="knw-table">
            <thead><tr><th>Projeto</th><th>Fatos</th></tr></thead>
            <tbody>{topProjects.map((p) => <tr key={p.project_id}><td>{projectNames[p.project_id] || p.project_id}</td><td>{p.facts_taught}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Usuários que mais ensinam</div>
        {topUsers.length === 0 ? <div className="knw-empty-hint">Sem dados ainda.</div> : (
          <table className="knw-table">
            <thead><tr><th>Usuário</th><th>Fatos</th></tr></thead>
            <tbody>{topUsers.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.facts_taught}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
