// Cadência de follow-up por etapa do funil (§93): ao entrar na etapa agenda o 1º passo; ao concluir um passo agenda o seguinte.
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { crm } from './crmApi.js';
import { ACTIVITY_TYPES, activityTypeLabel } from './crmMeta.js';
import { notify, askConfirm } from '../ui/dialogs.jsx';

const blank = (stageId) => ({ id: null, stageId, name: '', active: true, steps: [{ title: '1º Follow Up', type: 'followup', days: '1' }, { title: '2º Follow Up', type: 'followup', days: '3' }, { title: '3º Follow Up', type: 'followup', days: '7' }] });

export default function CadenceEditor({ pipeline }) {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stages = pipeline.stages.filter((s) => s.kind === 'open');
  const mine = list.filter((c) => c.pipelineId === pipeline.id);
  const load = () => crm.cadences().then((r) => setList(r.cadences || [])).catch(() => {});
  useEffect(() => { load(); setEdit(null); setError(''); }, [pipeline.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStep = (i, patch) => setEdit((e) => ({ ...e, steps: e.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const invalid = edit && (!edit.stageId || edit.steps.some((s) => !s.title.trim() || !Number.isInteger(Number(s.days)) || Number(s.days) < 0 || Number(s.days) > 90));
  async function save() {
    setBusy(true); setError('');
    const body = { pipelineId: pipeline.id, stageId: edit.stageId, name: edit.name, active: edit.active, steps: edit.steps.map((s) => ({ title: s.title, type: s.type, days: Number(s.days) })) };
    try { await (edit.id ? crm.updateCadence(edit.id, body) : crm.createCadence(body)); notify('Cadência salva.', { tone: 'success' }); setEdit(null); await load(); } catch (e) { setError(e.message || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  async function toggle(c) { try { await crm.updateCadence(c.id, { active: !c.active, steps: c.steps }); await load(); } catch (e) { notify(e.message || 'Não foi possível alterar.', { tone: 'error' }); } }
  async function remove(c) {
    if (!(await askConfirm({ title: `Remover a cadência da etapa "${c.stageName}"?`, message: 'Os passos já agendados continuam na Agenda; só deixa de agendar os próximos.', confirmLabel: 'Remover', danger: true }))) return;
    try { await crm.deleteCadence(c.id); await load(); } catch (e) { notify(e.message || 'Não foi possível remover.', { tone: 'error' }); }
  }
  const free = stages.filter((s) => !mine.some((c) => c.stageId === s.id));

  return (
    <div className="crm-section" style={{ marginTop: 16 }}>
      <h3 className="crm-section-title">Cadência de follow-up</h3>
      <div className="crm-muted" style={{ marginBottom: 8 }}>Ao entrar numa etapa, o CRM agenda sozinho o 1º passo para o responsável; ao concluir cada passo, agenda o próximo (os dias contam a partir da conclusão). Sair da etapa ou fechar o negócio cancela os passos que sobraram.</div>
      {mine.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--line, #2a2a3a)' }}>
          <strong>{c.stageName}</strong>
          <span className="crm-muted" style={{ flex: 1, minWidth: 200 }}>{c.steps.map((s) => `${s.title} (${s.days === 0 ? 'no dia' : `+${s.days} d`})`).join(' → ')}</span>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={c.active} onChange={() => toggle(c)} /> {c.active ? 'Ligada' : 'Desligada'}</label>
          <button type="button" className="crm-icon-btn" title="Editar cadência" aria-label={`Editar a cadência da etapa ${c.stageName}`} onClick={() => setEdit({ ...c, steps: c.steps.map((s) => ({ ...s, days: String(s.days) })) })}><Pencil size={14} aria-hidden="true" /></button>
          <button type="button" className="crm-icon-btn" title="Remover cadência" aria-label={`Remover a cadência da etapa ${c.stageName}`} onClick={() => remove(c)}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      ))}
      {!mine.length && !edit && <div className="crm-muted">Nenhuma cadência neste funil.</div>}
      {!edit && free.length > 0 && <div style={{ marginTop: 8 }}><button type="button" className="crm-btn" onClick={() => setEdit(blank(free[0].id))}><Plus size={14} /> Nova cadência</button></div>}
      {edit && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 640, marginTop: 8 }}>
          <label>Etapa que dispara
            <select value={edit.stageId} disabled={!!edit.id} onChange={(e) => setEdit((x) => ({ ...x, stageId: e.target.value }))}>
              {(edit.id ? stages : free).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {edit.steps.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,2fr) 1fr 90px auto', gap: 6, alignItems: 'center' }}>
              <input aria-label={`Título do passo ${i + 1}`} value={s.title} maxLength={80} onChange={(e) => setStep(i, { title: e.target.value })} placeholder={`Passo ${i + 1}`} />
              <select aria-label={`Tipo do passo ${i + 1}`} value={s.type} onChange={(e) => setStep(i, { type: e.target.value })}>{ACTIVITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input aria-label={`Dias do passo ${i + 1}`} type="number" min="0" max="90" value={s.days} onChange={(e) => setStep(i, { days: e.target.value })} title={i === 0 ? 'Dias depois de entrar na etapa' : 'Dias depois de concluir o passo anterior'} />
              <button type="button" className="crm-icon-btn" disabled={edit.steps.length <= 1} title="Remover passo" aria-label={`Remover o passo ${i + 1}`} onClick={() => setEdit((x) => ({ ...x, steps: x.steps.filter((_, k) => k !== i) }))}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
          <div className="crm-muted" style={{ fontSize: 11.5 }}>Dias: no 1º passo contam da entrada na etapa; nos seguintes, da conclusão do passo anterior (0 = no mesmo dia).</div>
          {edit.steps.length < 8 && <div><button type="button" className="crm-btn" onClick={() => setEdit((x) => ({ ...x, steps: [...x.steps, { title: `${x.steps.length + 1}º Follow Up`, type: 'followup', days: '3' }] }))}><Plus size={14} /> Adicionar passo</button></div>}
          {error && <div className="crm-err">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="crm-btn crm-btn-primary" disabled={busy || invalid} title={invalid ? 'Preencha o título e os dias (0 a 90) de todos os passos' : undefined} onClick={save}>{busy ? 'Salvando…' : 'Salvar cadência'}</button>
            <button type="button" className="crm-btn" onClick={() => { setEdit(null); setError(''); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
