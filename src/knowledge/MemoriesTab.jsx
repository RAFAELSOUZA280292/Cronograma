// Aba Memórias (Fase 8, item 3 do pedido do Rafael) — busca real
// (lexical + semântica, via server/knowledgeCenter.js
// `searchKnowledgeFacts`) com filtros rápidos em chip, não um formulário
// de banco de dados. O filtro de "origem" (item 8) mora aqui, não numa
// aba própria — decisão confirmada com o Rafael.
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { fmtTs } from '../App.jsx';
import { apiGet } from '../lib/api.js';
import { knowledgeTypeLabel, scopeLabel, originLabel, statusMeta, KNOWLEDGE_TYPE_LABELS, SCOPE_LABELS, ORIGIN_LABELS } from './knowledgeMeta.js';

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function MemoriesTab({ onOpenFact, refreshKey }) {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 350);
  const [knowledgeType, setKnowledgeType] = useState('');
  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('');
  const [origin, setOrigin] = useState('');
  const [facts, setFacts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    if (knowledgeType) params.set('knowledgeType', knowledgeType);
    if (scope) params.set('scope', scope);
    if (status) params.set('status', status);
    if (origin) params.set('origin', origin);
    apiGet(`/api/knowledge/facts?${params.toString()}`)
      .then((res) => { setFacts(res.facts || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [debouncedQ, knowledgeType, scope, status, origin, refreshKey]);

  return (
    <div>
      <div className="knw-search-row">
        <input type="text" placeholder="Pesquise por texto, assunto, pessoa, empresa… (ex.: “presidente da empresa”)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="knw-filter-row">
        <select className="knw-filter-select" value={knowledgeType} onChange={(e) => setKnowledgeType(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.keys(KNOWLEDGE_TYPE_LABELS).map((k) => <option key={k} value={k}>{knowledgeTypeLabel(k)}</option>)}
        </select>
        <select className="knw-filter-select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Todos os escopos</option>
          {Object.keys(SCOPE_LABELS).map((k) => <option key={k} value={k}>{scopeLabel(k)}</option>)}
        </select>
        <select className="knw-filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Vigentes (padrão)</option>
          <option value="active">Ativos</option>
          <option value="disputed">Em conflito</option>
          <option value="pending_validation">Hipóteses</option>
          <option value="superseded">Substituídos</option>
          <option value="archived">Arquivados</option>
        </select>
        <select className="knw-filter-select" value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Toda origem</option>
          {Object.keys(ORIGIN_LABELS).map((k) => <option key={k} value={k}>{originLabel(k)}</option>)}
        </select>
      </div>

      {!loaded ? (
        <div className="knw-empty">Buscando…</div>
      ) : facts.length === 0 ? (
        <div className="knw-empty">Nenhum conhecimento encontrado com esses filtros.</div>
      ) : (
        facts.map((f) => {
          const st = statusMeta(f.status);
          return (
            <div key={f.id} className="knw-fact-card" onClick={() => onOpenFact(f.id)}>
              <div className="knw-fact-head">
                <span className="knw-status-dot" style={{ background: st.color }} />
                <span className="knw-fact-subject">{f.subject}</span>
                <span className="knw-chip">{knowledgeTypeLabel(f.knowledge_type)}</span>
                <span className={`knw-chip ${f.scope === 'org' ? 'scope-org' : ''}`}>{scopeLabel(f.scope)}</span>
              </div>
              <div className="knw-fact-content">{f.content}</div>
              <div className="knw-fact-meta">{f.source_user_name ? `${f.source_user_name} · ` : ''}{fmtTs(f.created_at)}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
