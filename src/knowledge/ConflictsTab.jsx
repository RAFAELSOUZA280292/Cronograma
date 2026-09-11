// Aba Conflitos (Fase 8, item 6 do pedido do Rafael) — pares lado a
// lado, 6 desfechos possíveis, sempre com um passo de confirmação antes
// de aplicar (nunca um clique único e irreversível). Nenhuma resolução
// aqui usa DELETE (server/knowledgeCenter.js `resolveConflict`) — é
// sempre um UPDATE de status/superseded_by, histórico nunca é perdido.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { fmtTs } from '../App.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { RESOLUTION_LABELS } from './knowledgeMeta.js';

function ConflictCard({ conflict, onResolved }) {
  const [pending, setPending] = useState(null); // resolution key
  const [olderId, setOlderId] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (pending === 'temporal_update' && !olderId) { setError('Escolha qual versão é a mais antiga.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiPost('/api/knowledge/conflicts/resolve', {
        factIdA: conflict.fact_a_id, factIdB: conflict.fact_b_id, resolution: pending,
        olderFactId: pending === 'temporal_update' ? olderId : undefined, reason,
      });
      onResolved();
    } catch (e) {
      setError(e.message || 'Não consegui aplicar essa resolução.');
      setSaving(false);
    }
  }

  return (
    <div className="knw-conflict-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: 'var(--text-1)' }}>
        <AlertTriangle size={14} color="#e2574c" /> {conflict.subject}
      </div>
      <div className="knw-conflict-versions">
        <div className="knw-conflict-version">
          <div className="knw-conflict-version-label">Versão A</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{conflict.content_a}</div>
          <div className="knw-fact-meta">{conflict.source_user_name_a ? `${conflict.source_user_name_a} · ` : ''}{fmtTs(conflict.created_at_a)}</div>
        </div>
        <div className="knw-conflict-version">
          <div className="knw-conflict-version-label">Versão B</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{conflict.content_b}</div>
          <div className="knw-fact-meta">{conflict.source_user_name_b ? `${conflict.source_user_name_b} · ` : ''}{fmtTs(conflict.created_at_b)}</div>
        </div>
      </div>

      {!pending ? (
        <div className="knw-conflict-actions">
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('keep_a')}>Manter A</button>
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('keep_b')}>Manter B</button>
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('temporal_update')}>É atualização temporal</button>
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('complement')}>Manter as duas</button>
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('archive_both')}>Arquivar as duas</button>
          <button className="knw-btn knw-btn-ghost" onClick={() => setPending('mark_reviewed')}>Revisado, sem decisão</button>
        </div>
      ) : (
        <div style={{ marginTop: 12, background: 'var(--bg-3)', borderRadius: 9, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>{RESOLUTION_LABELS[pending]}</div>
          {pending === 'temporal_update' && (
            <div className="knw-conflict-actions" style={{ marginTop: 0, marginBottom: 8 }}>
              <button className={`knw-filter-chip ${olderId === conflict.fact_a_id ? 'active' : ''}`} onClick={() => setOlderId(conflict.fact_a_id)}>A é a mais antiga</button>
              <button className={`knw-filter-chip ${olderId === conflict.fact_b_id ? 'active' : ''}`} onClick={() => setOlderId(conflict.fact_b_id)}>B é a mais antiga</button>
            </div>
          )}
          <input type="text" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 7 }} />
          {error && <div style={{ color: '#e2574c', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
          <div className="knw-btn-row">
            <button className="knw-btn knw-btn-primary" disabled={saving} onClick={confirm}><Check size={13} /> Confirmar</button>
            <button className="knw-btn knw-btn-ghost" disabled={saving} onClick={() => { setPending(null); setOlderId(null); setError(''); }}><X size={13} /> Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConflictsTab() {
  const [conflicts, setConflicts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [includeReviewed, setIncludeReviewed] = useState(false);

  function load() {
    setLoaded(false);
    apiGet(`/api/knowledge/conflicts?includeReviewed=${includeReviewed}`)
      .then((res) => { setConflicts(res.conflicts || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }
  useEffect(load, [includeReviewed]);

  return (
    <div>
      <div className="knw-filter-row">
        <button className={`knw-filter-chip ${!includeReviewed ? 'active' : ''}`} onClick={() => setIncludeReviewed(false)}>Pendentes</button>
        <button className={`knw-filter-chip ${includeReviewed ? 'active' : ''}`} onClick={() => setIncludeReviewed(true)}>Incluir já revisados</button>
      </div>
      {!loaded ? (
        <div className="knw-empty">Carregando…</div>
      ) : conflicts.length === 0 ? (
        <div className="knw-empty">Nenhum conflito {includeReviewed ? '' : 'pendente'} — a RENATA não tem divergências pra resolver agora.</div>
      ) : (
        conflicts.map((c) => (
          <React.Fragment key={`${c.fact_a_id}-${c.fact_b_id}`}>
            <ConflictCard conflict={c} onResolved={load} />
            {c.disputed_reviewed_at && <div className="knw-reviewed-tag" style={{ marginTop: -10, marginBottom: 14 }}>Revisado em {fmtTs(c.disputed_reviewed_at)}, ainda sem decisão.</div>}
          </React.Fragment>
        ))
      )}
    </div>
  );
}
