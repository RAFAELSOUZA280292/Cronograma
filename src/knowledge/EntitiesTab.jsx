// Aba Pessoas/Empresas (Fase 8, item 7 do pedido do Rafael) — lista +
// detalhe (sem grafo/rede nesta entrega, escopo confirmado com o
// Rafael). Um componente único reusado pros dois nav items via `types`
// (PERSON pra "Pessoas"; COMPANY+PROJECT pra "Empresas/Projetos") —
// evita duplicar list+detail duas vezes pra algo estruturalmente igual.
import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { entityTypeLabel, knowledgeTypeLabel, scopeLabel, statusMeta } from './knowledgeMeta.js';

export function EntitiesTab({ types, emptyLabel, onOpenFact }) {
  const [entities, setEntities] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setLoaded(false);
    Promise.all(types.map((t) => apiGet(`/api/knowledge/entities?type=${t}`)))
      .then((results) => {
        const merged = results.flatMap((r) => r.entities || []).sort((a, b) => b.mention_count - a.mention_count);
        setEntities(merged);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [types.join(',')]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    apiGet(`/api/knowledge/entities/${selectedId}`).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  if (selectedId && detail) {
    return (
      <div>
        <button className="knw-btn knw-btn-ghost" style={{ marginBottom: 16 }} onClick={() => setSelectedId(null)}>&larr; Voltar</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{detail.entity.name}</div>
        <div className="knw-drawer-chips">
          <span className="knw-chip">{entityTypeLabel(detail.entity.type)}</span>
          <span className="knw-chip">{detail.entity.mention_count} {detail.entity.mention_count === 1 ? 'menção' : 'menções'}</span>
          <span className="knw-chip">{detail.projectCount} {detail.projectCount === 1 ? 'projeto' : 'projetos'}</span>
        </div>
        <div className="knw-drawer-label" style={{ marginTop: 16 }}>Conhecimentos relacionados</div>
        {detail.facts.length === 0 ? (
          <div className="knw-empty-hint">Nenhum conhecimento visível ligado a esta entidade.</div>
        ) : (
          detail.facts.map((f) => {
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
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div>
      {!loaded ? (
        <div className="knw-empty">Carregando…</div>
      ) : entities.length === 0 ? (
        <div className="knw-empty">{emptyLabel}</div>
      ) : (
        <div className="knw-entity-grid">
          {entities.map((e) => (
            <div key={e.id} className="knw-entity-card" onClick={() => setSelectedId(e.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} color="#F5C400" />
                <div className="knw-entity-card-name">{e.name}</div>
              </div>
              <div className="knw-entity-card-meta">{entityTypeLabel(e.type)} · {e.mention_count} {e.mention_count === 1 ? 'menção' : 'menções'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
