// Configuração de funis e etapas (gestor+). A empresa pode ter vários funis (ex.: Empresas,
// Tributaristas e Contadores, Pós-vendas); cada um tem etapas abertas na ordem que a equipe
// trabalha + "Ganho" e "Perdido" fixos no fim. Etapa com negócio não pode ser removida (mova os
// negócios antes); remover é arquivar — o histórico dos negócios continua apontando pra ela.
import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Star } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const toDraft = (p) => p.stages.filter((s) => s.kind === 'open').map((s) => ({ id: s.id, name: s.name, probability: String(s.probability), deals: s.deals }));

export default function FunnelsAdmin({ initialId, onClose, onChanged }) {
  const [pipelines, setPipelines] = useState(null);
  const [selId, setSelId] = useState(initialId || null);
  const [draft, setDraft] = useState([]);
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const sel = pipelines && (pipelines.find((p) => p.id === selId) || pipelines[0]);
  const baseline = sel ? toDraft(sel) : [];
  const dirty = !!sel && !same(baseline.map((s) => ({ ...s, probability: String(s.probability) })), draft);

  function adopt(list, keepId) {
    setPipelines(list);
    const p = list.find((x) => x.id === keepId) || list.find((x) => x.isDefault) || list[0];
    setSelId(p.id); setDraft(toDraft(p)); setName(p.name);
  }
  useEffect(() => { crm.pipelines().then((r) => adopt(r.pipelines, initialId)).catch((e) => setError(e.message || 'Não foi possível carregar os funis.')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn, keepId, okMsg) {
    setError(''); setNote(''); setBusy(true);
    try { const r = await fn(); adopt(r.pipelines, keepId); if (okMsg) setNote(okMsg); if (onChanged) onChanged(); return true; } catch (e) { setError(e.message || 'Não foi possível salvar.'); return false; } finally { setBusy(false); }
  }
  function pick(p) {
    if (dirty && !window.confirm('Descartar as alterações de etapas ainda não salvas?')) return;
    setSelId(p.id); setDraft(toDraft(p)); setName(p.name); setError(''); setNote('');
  }
  function move(i, d) { setDraft((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  const setRow = (i, patch) => setDraft((l) => l.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const invalid = draft.some((r) => !r.name.trim() || r.probability === '' || Number.isNaN(Number(r.probability)) || Number(r.probability) < 0 || Number(r.probability) > 100);
  const closed = sel ? sel.stages.filter((s) => s.kind !== 'open') : [];

  return (
    <Modal title="Funis e etapas" onClose={() => { if (!dirty || window.confirm('Fechar sem salvar as alterações de etapas?')) onClose(); }} width={980}>
      {!pipelines && !error && <div className="crm-empty">Carregando…</div>}
      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      {pipelines && sel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 240px) minmax(0, 1fr)', gap: 18 }} className="crm-funnels">
          <div>
            <div className="crm-form-group" style={{ margin: '0 0 8px' }}>Funis</div>
            {pipelines.map((p) => (
              <button key={p.id} type="button" className={`crm-row-link${p.id === sel.id ? ' crm-active-row' : ''}`} style={{ borderRadius: 8, borderBottom: 'none', marginBottom: 2, background: p.id === sel.id ? 'var(--bg-3)' : undefined }} onClick={() => pick(p)}>
                <span style={{ fontWeight: p.id === sel.id ? 800 : 600 }}>{p.isDefault && <Star size={12} color="#F5C400" style={{ marginRight: 4, verticalAlign: -1 }} />}{p.name}</span>
                <span className="crm-muted">{p.dealCount}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Novo funil" style={{ padding: '7px 9px', fontSize: 12.5, borderRadius: 8 }} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) run(() => crm.createPipeline({ name: newName }), null).then((ok) => ok && setNewName('')); }} />
              <button type="button" className="crm-btn" disabled={busy || !newName.trim()} onClick={() => run(() => crm.createPipeline({ name: newName }), null, 'Funil criado com etapas iniciais — ajuste abaixo.').then((ok) => ok && setNewName(''))}><Plus size={14} /></button>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do funil" style={{ maxWidth: 300, fontWeight: 800, padding: '8px 10px', borderRadius: 8 }} />
              <button type="button" className="crm-btn" disabled={busy || !name.trim() || name.trim() === sel.name} onClick={() => run(() => crm.updatePipeline(sel.id, { name }), sel.id, 'Nome atualizado.')}>Renomear</button>
              {sel.isDefault
                ? <span className="crm-pill" style={{ color: '#F5C400' }}><Star size={11} /> Funil padrão</span>
                : <button type="button" className="crm-btn" disabled={busy} onClick={() => run(() => crm.updatePipeline(sel.id, { isDefault: true }), sel.id, 'Definido como padrão (o que abre primeiro e recebe negócios novos).')}>Definir como padrão</button>}
              {!sel.isDefault && <button type="button" className="crm-btn crm-btn-danger" disabled={busy} onClick={() => { if (window.confirm(`Arquivar o funil "${sel.name}"? Só é possível se ele não tiver negócios.`)) run(() => crm.deletePipeline(sel.id), null, 'Funil arquivado.'); }}>Arquivar funil</button>}
            </div>

            <div className="crm-table-wrap" style={{ marginBottom: 10 }}>
              <table className="crm-table" style={{ minWidth: 520 }}>
                <thead><tr><th>Etapa (ordem do funil)</th><th style={{ width: 110 }}>Chance %</th><th className="crm-num" style={{ width: 80 }}>Negócios</th><th style={{ width: 130 }} /></tr></thead>
                <tbody>
                  {draft.map((r, i) => (
                    <tr key={r.id || `new-${i}`} style={{ cursor: 'default' }}>
                      <td><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={`Nome da etapa ${i + 1}`} style={{ width: '100%', padding: '6px 9px', borderRadius: 7 }} /></td>
                      <td><input type="number" min="0" max="100" value={r.probability} onChange={(e) => setRow(i, { probability: e.target.value })} aria-label={`Chance da etapa ${r.name}`} style={{ width: 80, padding: '6px 9px', borderRadius: 7 }} /></td>
                      <td className="crm-num">{r.id ? r.deals : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" className="crm-icon-btn" title="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                        <button type="button" className="crm-icon-btn" title="Descer" disabled={i === draft.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                        <button type="button" className="crm-icon-btn" title={r.id && r.deals ? 'Tem negócios — mova-os antes de remover' : 'Remover etapa'} disabled={draft.length <= 1 || (r.id && r.deals > 0)} onClick={() => setDraft((l) => l.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {closed.map((s) => (
                    <tr key={s.id} style={{ cursor: 'default', opacity: 0.75 }}>
                      <td><span className="crm-dot" style={{ background: s.color, display: 'inline-block', marginRight: 8 }} />{s.name} <span className="crm-muted">· etapa de fechamento (fixa)</span></td>
                      <td>{s.probability}%</td><td className="crm-num">{s.deals}</td><td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button type="button" className="crm-btn" onClick={() => setDraft((l) => [...l, { id: null, name: '', probability: '50', deals: 0 }])}><Plus size={14} /> Adicionar etapa</button>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {dirty && <span className="crm-muted">Alterações não salvas</span>}
                <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !dirty || invalid} onClick={() => run(() => crm.saveStages(sel.id, draft.map((r) => ({ id: r.id || undefined, name: r.name, probability: Number(r.probability) }))), sel.id, 'Etapas salvas.')}>{busy ? 'Salvando…' : 'Salvar etapas'}</button>
              </span>
            </div>
            <div className="crm-muted" style={{ marginTop: 10 }}>A “chance” é o ponto de partida do valor ponderado do funil. Ganho vale sempre 100% e Perdido 0%. Etapa removida é arquivada: o histórico dos negócios antigos continua intacto.</div>
            {note && <div className="crm-alert crm-alert-info" style={{ marginTop: 10 }}>{note}</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}
