// Aba Métricas (Fase 8, item 11 do pedido do Rafael) — números limpos
// e úteis a partir de ai_metrics_events/ai_answer_cache/ai_messages já
// existentes (server/knowledgeCenter.js `getMetrics`). Sem lib de
// gráfico nova, sem BI — só cards e tabelas simples.
import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { knowledgeTypeLabel } from './knowledgeMeta.js';
import { EmptyState, SkeletonCards } from '../ui/index.jsx';
import { AlertTriangle } from 'lucide-react';

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

  if (!loaded) return <SkeletonCards count={3} height={110} />;
  if (!metrics) return <EmptyState icon={AlertTriangle} title="Não foi possível carregar as métricas" description="Atualize a página em alguns segundos. Se continuar, avise o suporte da PRICETAX." />;

  const { memory, cache, promptCache, topFacts, topProjects, topUsers } = metrics;

  return (
    <div className="knw-metric-grid">
      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Memória</div>
        <div className="knw-metric-row"><span>Fatos propostos</span><b>{memory.factsProposed}</b></div>
        <div className="knw-metric-row"><span>Fatos confirmados</span><b>{memory.factsConfirmed}</b></div>
        <div className="knw-metric-row"><span>Fatos rejeitados</span><b>{memory.factsRejected}</b></div>
        <div className="knw-metric-row"><span>Conflitos detectados</span><b>{memory.conflictsDetected}</b></div>
        <div className="knw-metric-row"><span>Atualizações de informação</span><b>{memory.temporalUpdates}</b></div>
        <div className="knw-metric-row"><span>Repetidos</span><b>{memory.duplicates}</b></div>
        <div className="knw-metric-row"><span>Complementos</span><b>{memory.complements}</b></div>
        <div className="knw-metric-row"><span>Edições manuais</span><b>{memory.factsEdited}</b></div>
        <div className="knw-metric-row"><span>Conflitos resolvidos</span><b>{memory.conflictsResolved}</b></div>
      </div>

      <div className="knw-metric-card">
        <div className="knw-metric-card-title">Respostas reaproveitadas</div>
        <div className="knw-metric-row"><span>Respondidas sem chamar a IA de novo</span><b>{cache.hits}</b></div>
        <div className="knw-metric-row"><span>Precisaram chamar a IA</span><b>{cache.misses}</b></div>
        <div className="knw-metric-row"><span>Descartadas por estarem desatualizadas</span><b>{cache.rejectedStale}</b></div>
        <div className="knw-metric-row"><span>Taxa de reaproveitamento</span><b>{pct(cache.hitRate)}</b></div>
        <div className="knw-metric-row"><span>Custo evitado (unidades de texto)</span><b>{(cache.tokensSavedInput + cache.tokensSavedOutput).toLocaleString('pt-BR')}</b></div>
      </div>

      {promptCache && (
        <div className="knw-metric-card" style={{ gridColumn: '1 / -1' }}>
          <div className="knw-metric-card-title">Contexto reaproveitado pela IA — diferente das respostas reaproveitadas acima</div>
          <div className="knw-metric-row"><span>Chamadas à IA</span><b>{promptCache.calls}</b></div>
          <div className="knw-metric-row"><span>Texto reaproveitado</span><b>{promptCache.cacheReadTokens.toLocaleString('pt-BR')}</b></div>
          <div className="knw-metric-row"><span>Texto guardado para reuso</span><b>{promptCache.cacheCreationTokens.toLocaleString('pt-BR')}</b></div>
          <div className="knw-metric-row"><span>Texto processado do zero</span><b>{promptCache.uncachedInputTokens.toLocaleString('pt-BR')}</b></div>
          <div className="knw-metric-row"><span>Taxa de reaproveitamento</span><b>{pct(promptCache.hitRate)}</b></div>
          {promptCache.byFeature.length > 0 && (
            <table className="knw-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Funcionalidade</th><th>Modelo</th><th>Chamadas</th><th>Reaproveitado</th><th>Guardado</th><th>Do zero</th><th>Taxa</th></tr></thead>
              <tbody>
                {promptCache.byFeature.map((f) => (
                  <tr key={`${f.feature}-${f.model}`}>
                    <td>{f.feature}</td><td>{f.model}</td><td>{f.calls}</td>
                    <td>{f.cacheReadTokens.toLocaleString('pt-BR')}</td>
                    <td>{f.cacheCreationTokens.toLocaleString('pt-BR')}</td>
                    <td>{f.uncachedInputTokens.toLocaleString('pt-BR')}</td>
                    <td>{pct(f.hitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
