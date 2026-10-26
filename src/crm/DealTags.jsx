// Tags do negócio (vindas do PipeRun ou criadas aqui): chips com remoção e um campo que sugere as tags já existentes.
import React, { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { crm } from './crmApi.js';
import { notify } from '../ui/dialogs.jsx';
import { tagColor, tagTint } from './crmMeta.js';

export default function DealTags({ dealId, tags, canEdit, onChanged }) {
  const [known, setKnown] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (canEdit) crm.tags().then((r) => setKnown(r.tags || [])).catch(() => {}); }, [canEdit, dealId]);
  if (!canEdit && !(tags || []).length) return null;
  async function save(next) {
    setBusy(true);
    try { await crm.setDealTags(dealId, next); setText(''); if (onChanged) await onChanged(); } catch (e) { notify(e.message || 'Não foi possível salvar as tags.', { tone: 'error' }); } finally { setBusy(false); }
  }
  const add = () => { const t = text.trim(); if (!t || (tags || []).some((x) => x.toLowerCase() === t.toLowerCase())) { setText(''); return; } save([...(tags || []), t]); };
  return (
    <div className="crm-section" style={{ marginTop: 10 }}>
      <h3 className="crm-section-title">Tags</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(tags || []).map((t) => (
          <span key={t} className="crm-pill" style={{ color: tagColor(t), background: tagTint(t), borderColor: tagColor(t) }}>{t}{canEdit && <button type="button" className="crm-icon-btn" disabled={busy} onClick={() => save(tags.filter((x) => x !== t))} aria-label={`Remover a tag ${t}`} title="Remover tag" style={{ marginLeft: 4, padding: 0 }}><X size={12} aria-hidden="true" /></button>}</span>
        ))}
        {!(tags || []).length && <span className="crm-muted">Nenhuma tag.</span>}
        {canEdit && (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <input list={`crm-tags-${dealId}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Adicionar tag" aria-label="Adicionar tag" maxLength={60} disabled={busy} style={{ width: 170 }} />
            <datalist id={`crm-tags-${dealId}`}>{known.filter((k) => !(tags || []).includes(k.name)).map((k) => <option key={k.id} value={k.name} />)}</datalist>
            <button type="button" className="crm-btn" disabled={busy || !text.trim()} title={!text.trim() ? 'Digite o nome da tag' : undefined} onClick={add}><Plus size={14} /> Adicionar</button>
          </span>
        )}
      </div>
    </div>
  );
}
