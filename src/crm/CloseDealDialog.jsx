// Fechar um negócio (ganhar/perder) ou movê-lo pra qualquer etapa pelo quadro.
// Perder exige motivo (é o que alimenta a análise de perdas da Fase 4); ganhar
// avisa quando a empresa vai virar cliente — efeito colateral que não pode ser surpresa.
import React, { useState } from 'react';
import { crm } from './crmApi.js';
import { Modal, Field } from './ui.jsx';
import { fmtMoney, REL_META } from './crmMeta.js';

export default function CloseDealDialog({ deal, stage, reasons, onCancel, onDone }) {
  const won = stage.kind === 'won';
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const promotes = won && ['prospect', 'former_client'].includes(deal.companyRelationship);

  async function confirm() {
    setBusy(true); setError('');
    try {
      const r = await crm.moveDeal(deal.id, { stageId: stage.id, lostReason: won ? '' : reason, lostDetail: won ? '' : detail });
      onDone(r.deal);
    } catch (e) { setError(e.message || 'Não foi possível atualizar o negócio.'); } finally { setBusy(false); }
  }

  return (
    <Modal title={won ? 'Ganhar negócio' : 'Marcar como perdido'} onClose={onCancel} width={480}>
      <div style={{ marginBottom: 12 }}>
        <div className="crm-name">{deal.title}</div>
        <div className="crm-muted">{deal.companyName}{deal.value ? ` · ${fmtMoney(deal.value)}` : ''}</div>
      </div>
      {won && promotes && (
        <div className="crm-alert crm-alert-info">
          {deal.companyName} hoje é <b>{(REL_META[deal.companyRelationship] || {}).label}</b> e passará a <b>Cliente</b> automaticamente. O histórico registra essa mudança.
        </div>
      )}
      {won && !promotes && <div className="crm-muted">O negócio será marcado como ganho na data de hoje.</div>}
      {won && !deal.value && <div className="crm-alert crm-alert-warn">Este negócio está sem valor. Dá pra ganhar assim, mas a receita não entrará nos números — edite o valor antes se puder.</div>}
      {!won && (
        <div className="crm-form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Motivo da perda *">
            <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Escolha um motivo…</option>
              {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label={reason === 'outro' ? 'Descreva o motivo *' : 'Detalhes (opcional)'}>
            <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="O que aconteceu? Isso vira aprendizado para os próximos negócios." />
          </Field>
        </div>
      )}
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className={`crm-btn ${won ? 'crm-btn-primary' : 'crm-btn-danger'}`} disabled={busy || (!won && (!reason || (reason === 'outro' && !detail.trim())))} onClick={confirm}>
          {busy ? 'Salvando…' : won ? 'Confirmar ganho' : 'Confirmar perda'}
        </button>
      </div>
    </Modal>
  );
}
