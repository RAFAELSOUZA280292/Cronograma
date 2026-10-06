// Ficha do negócio (drawer). Resumo (valor, probabilidade, produtos), Histórico
// (notas + percurso no funil + linha do tempo) e Auditoria (gestor+). Mover de
// etapa passa por aqui também — o select cobre teclado e celular, onde arrastar
// no quadro não funciona.
import React, { useCallback, useEffect, useState } from 'react';
import { X, Pencil, Trash2, Trophy, ThumbsDown, StickyNote, Building2, Plus, AlertTriangle } from 'lucide-react';
import { crm } from './crmApi.js';
import DealForm from './DealForm.jsx';
import CloseDealDialog from './CloseDealDialog.jsx';
import ActivityForm from './ActivityForm.jsx';
import ActivityList from './ActivityList.jsx';
import RenataAsk from './RenataAsk.jsx';
import { useDraftGuard, NoteComposer, NoteThread } from './ui.jsx';
import { useDialog } from '../lib/nav.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { fmtMoney, fmtDateBR, fmtDateTimeBR, DEAL_TYPE_META, DEAL_STATUS_META, TIMELINE_KIND, sourceLabel, stageAgeColor } from './crmMeta.js';

// A auditoria guarda os valores crus (new/open/won…); na tela vão em português.
const AUDIT_LABELS = { dealType: { new: 'Novo negócio', upsell: 'Upsell' }, status: { open: 'Em aberto', won: 'Ganho', lost: 'Perdido' } };
const auditValue = (field, v) => (v == null || v === '' ? 'vazio' : ((AUDIT_LABELS[field] || {})[v] || String(v)));

function KV({ k, v }) {
  return <div><div className="k">{k}</div><div className="v">{v || <span className="crm-muted">—</span>}</div></div>;
}

export default function DealDrawer({ dealId, caps, options, currentUserId, onClose, onChanged, onOpenCompany, canAskRenata, closeRef }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('summary');
  const [audit, setAudit] = useState(null);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(null); // etapa de destino (ganho/perdido)
  const [noteDirty, setNoteDirty] = useState(false);
  const [activityForm, setActivityForm] = useState(false);
  const [companyProjects, setCompanyProjects] = useState(null); // projetos do cronograma ligados à empresa do negócio (null = ainda não sei)
  const { guard, dialog: discardDialog } = useDraftGuard(noteDirty, 'Há uma nota digitada que ainda não foi registrada. Se fechar, o texto será perdido.');
  const close = guard(onClose);
  if (closeRef) closeRef.current = close;
  const dlg = useDialog(close, { history: false });

  const load = useCallback(async () => {
    try { setError(''); setData(await crm.deal(dealId)); } catch (e) { setError(e.message || 'Não foi possível abrir o negócio.'); }
  }, [dealId]);
  useEffect(() => { setData(null); setAudit(null); setTab('summary'); load(); }, [load]);
  useEffect(() => { if (tab === 'audit' && caps.remove && !audit) crm.dealAudit(dealId).then((r) => setAudit(r.logs)).catch(() => setAudit([])); }, [tab, caps.remove, audit, dealId]);

  // O negócio não traz os projetos; busca a ficha da empresa só para saber quais estão vinculados (a RENATA é por projeto).
  const dealCompanyId = data && data.deal && data.deal.companyId;
  useEffect(() => {
    setCompanyProjects(null);
    if (!dealCompanyId || !canAskRenata) return undefined;
    let alive = true;
    crm.company(dealCompanyId).then((r) => { if (alive) setCompanyProjects(r.projects || []); }).catch(() => {});
    return () => { alive = false; };
  }, [dealCompanyId, canAskRenata]);

  async function afterChange() { setAudit(null); await load(); if (onChanged) onChanged(); }

  const fail = (e) => notify((e && e.message) || 'Não foi possível concluir.', { tone: 'error' });

  async function changeStage(stageId) {
    const stage = data.stages.find((s) => s.id === stageId);
    if (!stage || stage.id === data.deal.stageId) return;
    if (stage.kind !== 'open') { setClosing(stage); return; }
    try { await crm.moveDeal(dealId, { stageId }); await afterChange(); } catch (e) { fail(e); }
  }

  async function removeDeal() {
    if (!(await askConfirm({ title: `Excluir o negócio "${data.deal.title}"?`, message: 'Ele some do funil; o histórico da empresa registra a exclusão.', confirmLabel: 'Excluir', danger: true }))) return;
    try { await crm.deleteDeal(dealId); if (onChanged) onChanged(); onClose(); } catch (e) { fail(e); }
  }

  const d = data && data.deal;
  const canEdit = d && caps.write && (d.status === 'open' || caps.remove);
  const tabs = [['summary', 'Resumo'], ['history', 'Histórico']];
  if (caps.remove) tabs.push(['audit', 'Auditoria']);
  const stageOf = (kind) => data && data.stages.find((s) => s.kind === kind);

  return (
    <>
      <div className="crm-overlay" onClick={close}>
        <div className="crm-drawer" onClick={(e) => e.stopPropagation()} {...dlg} aria-label="Ficha do negócio">
          <div className="crm-drawer-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                {d ? (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <h2 className="crm-h1" style={{ overflowWrap: 'anywhere' }}>{d.title}</h2>
                      <span className="crm-pill" style={{ color: DEAL_TYPE_META[d.dealType].color }}>{DEAL_TYPE_META[d.dealType].label}</span>
                      {d.status !== 'open' && <span className="crm-pill" style={{ color: DEAL_STATUS_META[d.status].color }}>{DEAL_STATUS_META[d.status].label}</span>}
                    </div>
                    <div className="crm-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="crm-btn" style={{ padding: '3px 9px' }} title={`Abrir a empresa ${d.companyName}`} onClick={guard(() => onOpenCompany(d.companyId))}><Building2 size={12} /> {d.companyName}</button>
                      {d.ownerName && <span>Responsável: {d.ownerName}</span>}
                    </div>
                  </>
                ) : <h2 className="crm-h1">{error ? 'Negócio' : 'Carregando…'}</h2>}
              </div>
              <div className="crm-actions">
                {canEdit && <button type="button" className="crm-btn" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>}
                {d && caps.remove && <button type="button" className="crm-btn crm-btn-danger" onClick={removeDeal}><Trash2 size={14} /> Excluir</button>}
                <button type="button" className="crm-icon-btn" onClick={close} title="Fechar" aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
              </div>
            </div>
            {d && caps.write && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <label className="crm-muted" htmlFor="crm-deal-stage">Etapa</label>
                <select id="crm-deal-stage" value={d.stageId} onChange={(e) => changeStage(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12.5, borderRadius: 8 }}>
                  {data.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {d.status === 'open' && <button type="button" className="crm-btn" onClick={() => setClosing(stageOf('won'))}><Trophy size={14} color="#3ecf6e" /> Ganhar</button>}
                {d.status === 'open' && <button type="button" className="crm-btn" onClick={() => setClosing(stageOf('lost'))}><ThumbsDown size={14} color="#e2574c" /> Perder</button>}
              </div>
            )}
            <div className="crm-tabs" role="tablist">
              {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-label={l} className={`crm-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
            </div>
          </div>

          <div className="crm-drawer-body">
            {error && <div className="crm-alert crm-alert-danger">{error}</div>}
            {!data && !error && <div className="crm-empty">Carregando…</div>}

            {data && tab === 'summary' && (
              <>
                <div className="crm-cards">
                  <div className="crm-card"><div className="crm-kpi-value">{fmtMoney(d.value) || 'R$ 0'}</div><div className="crm-kpi-label">Valor</div><div className="crm-kpi-sub">{d.items.length ? `${d.items.length} produto(s)` : 'informado à mão'}</div></div>
                  <div className="crm-card"><div className="crm-kpi-value">{d.probability}%</div><div className="crm-kpi-label">Probabilidade</div><div className="crm-kpi-sub">{d.probabilityOverride != null ? 'definida à mão' : `da etapa ${d.stageName}`}</div></div>
                  <div className="crm-card"><div className="crm-kpi-value">{fmtMoney(d.weightedValue) || 'R$ 0'}</div><div className="crm-kpi-label">Valor ponderado</div></div>
                  <div className="crm-card"><div className="crm-kpi-value" style={{ color: d.status === 'open' ? stageAgeColor(d.daysInStage) : undefined, fontSize: 20 }}>{d.daysInStage == null ? '—' : `${d.daysInStage} ${d.daysInStage === 1 ? 'dia' : 'dias'}`}</div><div className="crm-kpi-label">Na etapa {d.stageName}</div></div>
                  <div className="crm-card"><div className="crm-kpi-value" style={{ color: d.overdue ? '#e2574c' : undefined, fontSize: 18 }}>{fmtDateBR(d.expectedCloseDate) || '—'}</div><div className="crm-kpi-label">Previsão de fechamento</div>{d.overdue && <div className="crm-kpi-sub" style={{ color: '#e2574c' }}>vencida</div>}</div>
                </div>

                {d.status === 'open' && !data.activities.some((a) => a.status === 'open') && (
                  <div className="crm-alert crm-alert-warn" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={15} /> <span><strong>Sem próximo passo.</strong> Negócio sem atividade agendada tende a esfriar.</span></span>
                    {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={() => setActivityForm(true)}><Plus size={14} /> Agendar agora</button>}
                  </div>
                )}

                {d.status === 'lost' && (
                  <div className="crm-alert crm-alert-danger"><strong>Perdido — {d.lostReasonLabel}.</strong>{d.lostDetail ? ` ${d.lostDetail}` : ''}</div>
                )}
                {d.status === 'won' && d.closedAt && <div className="crm-alert crm-alert-info"><strong>Ganho em {fmtDateBR(d.closedAt)}.</strong></div>}

                <div className="crm-section">
                  <h3 className="crm-section-title"><span>Próximos passos</span>{caps.write && d.status === 'open' && <button type="button" className="crm-btn" onClick={() => setActivityForm(true)}><Plus size={13} /> Criar atividade</button>}</h3>
                  <ActivityList activities={data.activities} caps={caps} options={options} currentUserId={currentUserId} onChanged={afterChange} emptyText="Nenhuma atividade ligada a este negócio." />
                </div>

                <div className="crm-section">
                  <h3 className="crm-section-title">Produtos</h3>
                  {d.items.length === 0 ? <div className="crm-muted">Nenhum produto vinculado — o valor foi informado à mão.</div> : (
                    <div className="crm-table-wrap" style={{ border: 'none' }}>
                      <table className="crm-table" style={{ minWidth: 480 }}>
                        <thead><tr><th>Produto</th><th className="crm-num">Qtd.</th><th className="crm-num">Preço un.</th><th className="crm-num">Total</th></tr></thead>
                        <tbody>{d.items.map((i) => <tr key={i.id} style={{ cursor: 'default' }}><td>{i.name}</td><td className="crm-num">{i.quantity}</td><td className="crm-num">{fmtMoney(i.unitPrice)}</td><td className="crm-num">{fmtMoney(i.total)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>

                {companyProjects && (
                  <div className="crm-section">
                    <h3 className="crm-section-title">RENATA</h3>
                    <RenataAsk projects={companyProjects} canAsk={canAskRenata} onReload={afterChange} />
                  </div>
                )}

                <div className="crm-section">
                  <h3 className="crm-section-title">Detalhes</h3>
                  <div className="crm-kv">
                    <KV k="Empresa" v={d.companyName} /><KV k="Contato principal" v={d.contactName} /><KV k="Responsável" v={d.ownerName} />
                    <KV k="Origem" v={sourceLabel(d.source)} /><KV k="Criado em" v={fmtDateBR(d.createdAt)} /><KV k="Tipo" v={DEAL_TYPE_META[d.dealType].label} />
                  </div>
                  {d.description && <div className="crm-note" style={{ marginTop: 14 }}>{d.description}</div>}
                </div>
              </>
            )}

            {data && caps.write && (
              <div hidden={tab !== 'history'}>
                <div className="crm-section">
                  <h3 className="crm-section-title"><span><StickyNote size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Nova nota sobre o negócio</span></h3>
                  <NoteComposer about={{ entityType: 'deal', entityId: dealId }} draftKey={`crm-deal:${dealId}`} placeholder="Objeção, próximo passo, o que o cliente disse…" onDirtyChange={setNoteDirty} onAdded={afterChange} />
                </div>
              </div>
            )}

            {data && tab === 'history' && (
              <>
                {data.notes.length > 0 && (
                  <div className="crm-section">
                    <h3 className="crm-section-title">Notas</h3>
                    <NoteThread notes={data.notes} currentUserId={currentUserId} canModerate={!!caps.remove} onChanged={afterChange} />
                  </div>
                )}
                <div className="crm-section">
                  <h3 className="crm-section-title">Percurso no funil</h3>
                  <div className="crm-path">
                    {data.stageHistory.map((h) => (
                      <div key={h.id} className="crm-path-row">
                        <span>{h.from ? <>{h.from} → <b>{h.to}</b></> : <>Entrou em <b>{h.to}</b></>} <span className="crm-muted">· {h.actorName}</span></span>
                        <span className="crm-muted crm-num">{h.daysInFrom != null ? `${Number(h.daysInFrom).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d na anterior · ` : ''}{fmtDateTimeBR(h.movedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="crm-section">
                  <h3 className="crm-section-title">Linha do tempo</h3>
                  <div className="crm-tl">
                    {data.timeline.map((e) => (
                      <div key={e.id} className="crm-tl-item">
                        <div className="crm-tl-kind">{TIMELINE_KIND[e.eventType] || 'Evento'}</div>
                        <div className="crm-tl-text">{e.summary}</div>
                        <div className="crm-tl-time">{fmtDateTimeBR(e.occurredAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {data && tab === 'audit' && (
              <>
                <div className="crm-sub" style={{ marginBottom: 12 }}>Toda alteração do negócio, com quem fez, quando e o valor anterior. Este histórico não pode ser apagado.</div>
                {!audit && <div className="crm-empty">Carregando…</div>}
                {audit && audit.map((a) => (
                  <div key={a.id} className="crm-note">
                    <div className="crm-note-meta"><span>{a.actorName || 'Sistema'} · {a.action}</span><span>{fmtDateTimeBR(a.createdAt)}</span></div>
                    {(a.changes || []).length === 0 ? <span className="crm-muted">Sem alteração de campo.</span> : (a.changes || []).map((ch, i) => (
                      <div key={i}><b>{ch.label}</b>: <span className="crm-muted">{auditValue(ch.field, ch.from)}</span> → {auditValue(ch.field, ch.to)}</div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {discardDialog}
      {activityForm && d && <ActivityForm company={{ id: d.companyId, legalName: d.companyName, relationship: d.companyRelationship }} prefill={{ dealId: d.id, contactId: d.primaryContactId || '' }} options={options} currentUserId={currentUserId}
        onCancel={() => setActivityForm(false)} onSaved={async () => { setActivityForm(false); await afterChange(); }} />}
      {editing && d && <DealForm initial={d} options={options} currentUserId={currentUserId} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await afterChange(); }} />}
      {closing && d && <CloseDealDialog deal={d} stage={closing} reasons={data.lostReasons} onCancel={() => setClosing(null)} onDone={async () => { setClosing(null); await afterChange(); }} />}
    </>
  );
}
