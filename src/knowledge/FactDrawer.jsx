// Card/drawer detalhado de um conhecimento (Fase 8, 2026-09-11, item 4
// do pedido do Rafael) — usa o SidePanel já existente (src/App.jsx)
// como container, então não precisa recriar overlay/animação/botão de
// fechar. Mostra tipo/escopo/status/vigência, origem (clicável quando
// aponta pra uma reunião real), histórico completo de versões (nunca
// esconde uma versão superseded), relações (entidades) e utilização.
import React, { useEffect, useState } from 'react';
import { Pencil, ExternalLink, Plus, X } from 'lucide-react';
import { SidePanel, fmtTs } from '../App.jsx';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import { knowledgeTypeLabel, scopeLabel, originLabel, entityTypeLabel, statusMeta, ENTITY_TYPE_LABELS, KNOWLEDGE_TYPE_LABELS } from './knowledgeMeta.js';

export function FactDrawer({ factId, onClose, onNavigateToMeeting, onOpenEntity, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addingEntity, setAddingEntity] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('PERSON');

  function load() {
    setLoaded(false);
    apiGet(`/api/knowledge/facts/${factId}`).then((res) => { setDetail(res); setLoaded(true); }).catch(() => setLoaded(true));
  }
  useEffect(load, [factId]);

  if (!loaded) {
    return <SidePanel title="Conhecimento" onClose={onClose}><div className="knw-empty">Carregando…</div></SidePanel>;
  }
  if (!detail) {
    return <SidePanel title="Conhecimento" onClose={onClose}><div className="knw-empty">Não encontrado.</div></SidePanel>;
  }

  const { fact, chain, entities, usage, events } = detail;
  const st = statusMeta(fact.status);

  function startEdit() {
    setEditForm({ content: fact.content, knowledgeType: fact.knowledge_type, validFrom: fact.valid_from || '', reason: '' });
    setEditing(true);
    setError('');
  }

  async function saveEdit() {
    if (!(editForm.reason || '').trim()) { setError('Informe o motivo da edição.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await apiPost(`/api/knowledge/facts/${factId}/edit`, {
        content: editForm.content, knowledgeType: editForm.knowledgeType,
        validFrom: editForm.validFrom || null, reason: editForm.reason,
      });
      setEditing(false);
      // A edição cria uma linha NOVA (nunca sobrescreve a antiga) — o
      // drawer precisa passar a apontar pra ela, senão o usuário fica
      // vendo a versão que acabou de virar histórico.
      if (onChanged) onChanged(result.id);
    } catch (e) {
      setError(e.message || 'Não consegui salvar a edição.');
    } finally {
      setSaving(false);
    }
  }

  async function addEntity() {
    if (!entityName.trim()) return;
    try {
      await apiPost(`/api/knowledge/facts/${factId}/entities`, { name: entityName.trim(), type: entityType });
      setEntityName('');
      setAddingEntity(false);
      load();
    } catch (e) {
      setError(e.message || 'Não consegui adicionar a entidade.');
    }
  }

  async function removeEntity(entityId) {
    try {
      await apiDelete(`/api/knowledge/facts/${factId}/entities/${entityId}`);
      load();
    } catch (e) {
      setError(e.message || 'Não consegui remover a entidade.');
    }
  }

  return (
    <SidePanel title="Conhecimento" onClose={onClose}>
      <div className="knw-drawer-title">{fact.subject}</div>
      <div className="knw-drawer-chips">
        <span className="knw-chip">{knowledgeTypeLabel(fact.knowledge_type)}</span>
        <span className={`knw-chip ${fact.scope === 'org' ? 'scope-org' : ''}`}>{scopeLabel(fact.scope)}</span>
        <span className="knw-chip" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="knw-status-dot" style={{ background: st.color }} /> {st.label}
        </span>
        {fact.valid_from && <span className="knw-chip">Desde {fact.valid_from}</span>}
        {fact.valid_until && <span className="knw-chip">Até {fact.valid_until}</span>}
      </div>

      {!editing ? (
        <div className="knw-drawer-section">
          <div className="knw-drawer-label">O que a RENATA sabe</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{fact.content}</div>
          {fact.status !== 'archived' && fact.status !== 'superseded' && (
            <button className="knw-btn knw-btn-ghost" style={{ marginTop: 10 }} onClick={startEdit}><Pencil size={13} /> Editar (cria nova versão)</button>
          )}
        </div>
      ) : (
        <div className="knw-drawer-section knw-edit-form">
          <div className="knw-drawer-label">Editar (nunca apaga a versão atual — ela vira histórico)</div>
          <textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
          <label>Tipo de conhecimento
            <select value={editForm.knowledgeType} onChange={(e) => setEditForm({ ...editForm, knowledgeType: e.target.value })}>
              {Object.keys(KNOWLEDGE_TYPE_LABELS).map((k) => <option key={k} value={k}>{knowledgeTypeLabel(k)}</option>)}
            </select>
          </label>
          <label>Vigente desde (opcional)
            <input type="text" placeholder="AAAA-MM-DD" value={editForm.validFrom} onChange={(e) => setEditForm({ ...editForm, validFrom: e.target.value })} />
          </label>
          <label>Motivo da edição (obrigatório)
            <input type="text" placeholder="Ex.: correção de digitação, cliente confirmou novo prazo…" value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} />
          </label>
          {error && <div style={{ color: '#e2574c', fontSize: 11.5, marginTop: 8 }}>{error}</div>}
          <div className="knw-btn-row">
            <button className="knw-btn knw-btn-primary" disabled={saving} onClick={saveEdit}>{saving ? 'Salvando…' : 'Salvar nova versão'}</button>
            <button className="knw-btn knw-btn-ghost" disabled={saving} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="knw-drawer-section">
        <div className="knw-drawer-label">Origem</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8 }}>
          {fact.source_user_id ? 'Informado por um usuário' : 'Origem não registrada'} · {originLabel(fact.origin)} · {fmtTs(fact.created_at)}
        </div>
        {fact.source_meeting_id && fact.project_id ? (
          <button className="knw-origin-link" onClick={() => onNavigateToMeeting(fact.project_id, fact.source_meeting_id)}>
            <ExternalLink size={13} /> Abrir reunião de origem
          </button>
        ) : (
          <div className="knw-origin-plain">{fact.reference || (fact.project_id ? 'Projeto de origem não aberto nesta visão.' : '—')}</div>
        )}
      </div>

      {chain && chain.length > 0 && (
        <div className="knw-drawer-section">
          <div className="knw-drawer-label">Histórico</div>
          <div className="knw-timeline">
            {chain.map((v) => (
              <div className="knw-timeline-item" key={v.id}>
                <span className="knw-timeline-dot" />
                {/* "Atual" é quem não tem superseded_by (o fim real da
                    cadeia), não quem bate com o factId aberto no drawer —
                    o drawer pode estar mostrando uma versão antiga. */}
                <div className="knw-timeline-title">{!v.superseded_by ? 'Versão atual' : `${statusMeta(v.status).label} — versão anterior`}</div>
                <div className="knw-timeline-meta">{v.content}</div>
                {v.supersede_reason && <div className="knw-timeline-meta" style={{ fontStyle: 'italic' }}>Motivo: {v.supersede_reason}</div>}
                <div className="knw-timeline-meta">{fmtTs(v.created_at)}{v.source_user_name ? ` · ${v.source_user_name}` : ''}</div>
              </div>
            ))}
            {(events || []).map((ev, i) => (
              <div className="knw-timeline-item" key={`ev-${i}`}>
                <span className="knw-timeline-dot" style={{ background: 'var(--text-6)' }} />
                <div className="knw-timeline-title">{eventLabel(ev.event_type)}</div>
                <div className="knw-timeline-meta">{fmtTs(ev.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="knw-drawer-section">
        <div className="knw-drawer-label">Relações</div>
        <div className="knw-drawer-chips">
          {(entities || []).map((e) => (
            <span key={e.id} className="knw-entity-chip" onClick={() => onOpenEntity(e)}>
              {entityTypeLabel(e.type)}: {e.name}
              <button style={{ background: 'none', border: 'none', color: 'var(--text-6)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={(ev) => { ev.stopPropagation(); removeEntity(e.id); }}><X size={11} /></button>
            </span>
          ))}
          {!addingEntity ? (
            <button className="knw-filter-chip" onClick={() => setAddingEntity(true)}><Plus size={11} /> Adicionar</button>
          ) : (
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ fontSize: 11 }}>
                {Object.keys(ENTITY_TYPE_LABELS).map((k) => <option key={k} value={k}>{entityTypeLabel(k)}</option>)}
              </select>
              <input type="text" placeholder="Nome" value={entityName} onChange={(e) => setEntityName(e.target.value)} style={{ fontSize: 11, width: 100 }} />
              <button className="knw-btn knw-btn-primary" style={{ padding: '4px 8px' }} onClick={addEntity}>OK</button>
            </span>
          )}
          {!entities || entities.length === 0 ? null : null}
        </div>
      </div>

      <div className="knw-drawer-section">
        <div className="knw-drawer-label">Utilização</div>
        <div className="knw-usage-stat">
          <div><div className="knw-usage-num">{usage.count}</div><div className="knw-usage-label">{usage.count === 1 ? 'resposta' : 'respostas'}</div></div>
          <div><div className="knw-usage-num">{usage.projectCount}</div><div className="knw-usage-label">{usage.projectCount === 1 ? 'projeto' : 'projetos'}</div></div>
        </div>
        {usage.lastUsedAt && <div className="knw-fact-meta">Última utilização: {fmtTs(usage.lastUsedAt)}</div>}
      </div>
    </SidePanel>
  );
}

function eventLabel(type) {
  const map = {
    fact_proposed: 'Proposto pela RENATA', fact_confirmed: 'Confirmado pelo usuário', fact_rejected: 'Rejeitado',
    duplicate_detected: 'Identificado como duplicata', conflict_detected: 'Conflito detectado',
    temporal_update_detected: 'Atualização temporal detectada', complement_detected: 'Complemento detectado',
    fact_edited: 'Editado manualmente', conflict_resolved: 'Conflito resolvido',
  };
  return map[type] || type;
}
