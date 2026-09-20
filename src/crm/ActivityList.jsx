// Lista de atividades reutilizável (Agenda, ficha da empresa, ficha do negócio).
// Cuida sozinha de concluir/editar/cancelar/reabrir/excluir e dos diálogos, e
// oferece "Agendar próximo passo" ao concluir — é assim que o negócio não fica
// sem próximo passo. `onChanged` avisa quem hospeda pra recarregar.
import React, { useState } from 'react';
import { Phone, Mail, Video, MessageCircle, MapPin, CheckSquare, Repeat, Check, Pencil, Ban, RotateCcw, Trash2, Clock } from 'lucide-react';
import { crm } from './crmApi.js';
import ActivityForm from './ActivityForm.jsx';
import { Modal, Field } from './ui.jsx';
import { fmtDateBR, fmtDateTimeBR, BUCKET_META, PRIORITY_META, activityTypeLabel } from './crmMeta.js';

const ICONS = { task: CheckSquare, call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle, visit: MapPin, followup: Repeat };

function CompleteDialog({ activity, onCancel, onDone }) {
  const [outcome, setOutcome] = useState('');
  const [next, setNext] = useState(activity.status === 'open' && !!activity.dealId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try { const r = await crm.completeActivity(activity.id, outcome); onDone(r.activity, next); } catch (e) { setError(e.message || 'Não foi possível concluir.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Concluir atividade" onClose={onCancel} width={500}>
      <div style={{ marginBottom: 12 }}><div className="crm-name">{activity.title}</div><div className="crm-muted">{activity.companyName}{activity.dealTitle ? ` · ${activity.dealTitle}` : ''}</div></div>
      <Field label="Como foi? (resultado — opcional)"><textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus placeholder="O que ficou combinado, o que o cliente disse…" /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 13, marginTop: 12 }}>
        <input type="checkbox" checked={next} onChange={(e) => setNext(e.target.checked)} style={{ width: 'auto' }} /> Agendar o próximo passo agora
      </label>
      {activity.dealId && !next && <div className="crm-muted" style={{ marginTop: 6 }}>Sem outra atividade em aberto, o negócio fica marcado como “sem próximo passo”.</div>}
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Salvando…' : 'Concluir'}</button>
      </div>
    </Modal>
  );
}

export default function ActivityList({ activities, caps, options, currentUserId, onChanged, onOpenCompany, onOpenDeal, showCompany, emptyText, grouped }) {
  const [completing, setCompleting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [scheduling, setScheduling] = useState(null); // atividade recém-concluída → próximo passo
  const changed = () => { if (onChanged) onChanged(); };

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await fn(); changed(); } catch (e) { window.alert(e.message); }
  }

  function renderRow(a) {
    const Icon = ICONS[a.activityType] || CheckSquare;
    const open = a.status === 'open';
    const bm = BUCKET_META[a.bucket];
    return (
      <div key={a.id} className={`crm-act${open ? '' : ' done'}`}>
        {open
          ? <button type="button" className="crm-check" title="Concluir" aria-label={`Concluir ${a.title}`} disabled={!caps.write} onClick={() => setCompleting(a)}><Check size={13} /></button>
          : <span className={`crm-check ${a.status === 'done' ? 'on' : ''}`} style={{ cursor: 'default' }}>{a.status === 'done' ? <Check size={13} /> : <Ban size={12} />}</span>}
        <div className="crm-act-ico" title={activityTypeLabel(a.activityType)}><Icon size={15} /></div>
        <div className="crm-act-body">
          <div className="crm-act-title">{a.title}</div>
          <div className="crm-act-meta">
            <span style={{ color: open && bm ? bm.color : undefined, fontWeight: open && (a.bucket === 'overdue' || a.bucket === 'today') ? 800 : 600 }}>
              <Clock size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{open && a.bucket === 'today' ? 'Hoje' : fmtDateBR(a.dueDate)}{a.dueTime ? ` às ${a.dueTime}` : ''}{open && a.bucket === 'overdue' ? ' · atrasada' : ''}
            </span>
            <span>{activityTypeLabel(a.activityType)}</span>
            {a.priority === 'high' && <span style={{ color: PRIORITY_META.high.color, fontWeight: 800 }}>Prioridade alta</span>}
            {showCompany && (onOpenCompany ? <button type="button" onClick={() => onOpenCompany(a.companyId)}>{a.companyName}</button> : <span>{a.companyName}</span>)}
            {a.dealTitle && (onOpenDeal && a.dealId ? <button type="button" onClick={() => onOpenDeal(a.dealId)}>Negócio: {a.dealTitle}</button> : <span>Negócio: {a.dealTitle}</span>)}
            {a.contactName && <span>com {a.contactName}</span>}
            {a.ownerName && <span>Resp.: {a.ownerName}</span>}
            {a.status === 'done' && a.completedAt && <span>Concluída em {fmtDateTimeBR(a.completedAt)}{a.completedByName ? ` por ${a.completedByName}` : ''}</span>}
            {a.status === 'cancelled' && <span>Cancelada</span>}
          </div>
          {a.description && open && <div className="crm-muted" style={{ marginTop: 3 }}>{a.description}</div>}
          {a.outcome && <div className="crm-act-outcome">{a.outcome}</div>}
        </div>
        {caps.write && (
          <div className="crm-act-actions">
            {open && <button type="button" className="crm-icon-btn" title="Editar" onClick={() => setEditing(a)}><Pencil size={14} /></button>}
            {open && <button type="button" className="crm-icon-btn" title="Cancelar atividade" onClick={() => act(() => crm.cancelActivity(a.id), `Cancelar "${a.title}"? Ela sai da agenda, mas o histórico registra.`)}><Ban size={14} /></button>}
            {!open && <button type="button" className="crm-icon-btn" title="Reabrir" onClick={() => act(() => crm.reopenActivity(a.id))}><RotateCcw size={14} /></button>}
            {caps.remove && <button type="button" className="crm-icon-btn" title="Excluir" onClick={() => act(() => crm.deleteActivity(a.id), `Excluir "${a.title}"? O histórico registra a exclusão.`)}><Trash2 size={14} /></button>}
          </div>
        )}
      </div>
    );
  }

  // Os diálogos ficam FORA das listas/faixas: se concluir a última atividade de uma
  // faixa fizer a faixa sumir, o diálogo de "próximo passo" continua vivo.
  return (
    <>
      {!activities.length && <div className="crm-muted" style={{ padding: '8px 4px' }}>{emptyText || 'Nenhuma atividade.'}</div>}
      {grouped
        ? Object.entries(BUCKET_META).map(([key, meta]) => {
          const list = activities.filter((x) => x.bucket === key);
          if (!list.length) return null;
          return (
            <div key={key} className="crm-section">
              <h3 className="crm-section-title"><span style={{ color: meta.color }}>{meta.label}</span><span className="crm-muted">{list.length}</span></h3>
              {list.map(renderRow)}
            </div>
          );
        })
        : <div>{activities.map(renderRow)}</div>}
      {completing && <CompleteDialog activity={completing} onCancel={() => setCompleting(null)} onDone={(done, wantsNext) => { setCompleting(null); changed(); if (wantsNext) setScheduling(done); }} />}
      {editing && <ActivityForm initial={editing} options={options} currentUserId={currentUserId} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}
      {scheduling && (
        <ActivityForm company={{ id: scheduling.companyId, legalName: scheduling.companyName }} options={options} currentUserId={currentUserId}
          prefill={{ dealId: scheduling.dealId, contactId: scheduling.contactId, activityType: 'followup', title: `Próximo passo: ${scheduling.title}` }}
          onCancel={() => setScheduling(null)} onSaved={() => { setScheduling(null); changed(); }} />
      )}
    </>
  );
}
