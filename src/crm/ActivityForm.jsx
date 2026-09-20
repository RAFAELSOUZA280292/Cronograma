// Cadastro/edição de atividade (estado local + Salvar). A empresa é sempre
// obrigatória; negócio e contato só listam os DA MESMA empresa (o servidor
// confere de novo). "Já realizei" registra uma interação que já aconteceu (ligação
// de ontem, reunião de hoje cedo) direto como concluída, com o resultado.
import React, { useEffect, useState } from 'react';
import { crm } from './crmApi.js';
import { Modal, Field, RelPill } from './ui.jsx';
import { ACTIVITY_TYPES, PRIORITY_META } from './crmMeta.js';

const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export default function ActivityForm({ initial, company, prefill, options, currentUserId, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => (editing ? {
    title: initial.title, activityType: initial.activityType, dueDate: initial.dueDate, dueTime: initial.dueTime || '', priority: initial.priority,
    ownerId: initial.ownerId || '', dealId: initial.dealId || '', contactId: initial.contactId || '', description: initial.description || '',
  } : {
    title: (prefill && prefill.title) || '', activityType: (prefill && prefill.activityType) || 'task', dueDate: (prefill && prefill.dueDate) || todayLocal(), dueTime: '',
    priority: 'normal', ownerId: currentUserId || '', dealId: (prefill && prefill.dealId) || '', contactId: (prefill && prefill.contactId) || '', description: '',
  }));
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [picked, setPicked] = useState(company || (editing ? { id: initial.companyId, legalName: initial.companyName } : null));
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const owners = (options && options.owners) || [];

  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { crm.companies({ q, limit: 6 }).then((r) => setResults(r.items)).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  useEffect(() => {
    if (!picked) { setDeals([]); setContacts([]); return; }
    crm.deals({ companyId: picked.id, status: 'open', limit: 100 }).then((r) => setDeals(r.items)).catch(() => setDeals([]));
    crm.contacts({ companyId: picked.id, limit: 100 }).then((r) => setContacts(r.items)).catch(() => setContacts([]));
  }, [picked]);

  async function save() {
    setError(''); setBusy(true);
    const body = {
      title: form.title, activityType: form.activityType, dueDate: form.dueDate, dueTime: form.dueTime, priority: form.priority, ownerId: form.ownerId || null,
      dealId: form.dealId || null, contactId: form.contactId || null, description: form.description,
    };
    try {
      if (editing) onSaved((await crm.updateActivity(initial.id, body)).activity);
      else onSaved((await crm.createActivity({ ...body, companyId: picked.id, ...(done ? { alreadyDone: true, outcome } : {}) })).activity);
    } catch (e) { setError(e.message || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar atividade' : (done ? 'Registrar interação realizada' : 'Nova atividade')} onClose={onCancel} width={700}>
      <div className="crm-form-grid">
        <Field label="Empresa *" full>
          {picked ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{picked.legalName}</strong>{picked.relationship && <RelPill value={picked.relationship} />}
              {!company && !editing && <button type="button" className="crm-btn" onClick={() => { setPicked(null); setForm((f) => ({ ...f, dealId: '', contactId: '' })); }}>Trocar</button>}
            </div>
          ) : (
            <div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou CNPJ da empresa" autoFocus />
              {results.map((r) => (
                <button key={r.id} type="button" className="crm-search-item" onClick={() => { setPicked({ id: r.id, legalName: r.legalName, relationship: r.relationship }); setResults([]); }}>
                  {r.legalName}<small>{r.tradeName}</small>
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="O que precisa ser feito? *" full><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Ligar para o financeiro sobre a proposta" autoFocus={!!picked && !editing} /></Field>
        <Field label="Tipo">
          <select value={form.activityType} onChange={(e) => set('activityType', e.target.value)}>{ACTIVITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Prioridade">
          <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
        </Field>
        <Field label={done ? 'Quando aconteceu *' : 'Data *'}><input type="date" value={form.dueDate} max={done ? todayLocal() : undefined} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Horário (opcional)"><input type="time" value={form.dueTime} onChange={(e) => set('dueTime', e.target.value)} /></Field>
        <Field label="Responsável">
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Contato">
          <select value={form.contactId} onChange={(e) => set('contactId', e.target.value)} disabled={!picked}>
            <option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()}{c.jobTitle ? ` (${c.jobTitle})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Negócio (para não perder o próximo passo dele)" full>
          <select value={form.dealId} onChange={(e) => set('dealId', e.target.value)} disabled={!picked}>
            <option value="">Não ligada a um negócio</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title} — {d.stageName}</option>)}
          </select>
        </Field>
        <Field label="Detalhes" full><textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        {!editing && (
          <Field label="Já aconteceu?" full>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 13 }}>
              <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} style={{ width: 'auto' }} /> Sim, só quero registrar (entra como concluída)
            </label>
          </Field>
        )}
        {!editing && done && <Field label="Como foi? (resultado)" full><textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="O que ficou combinado, objeções, próximos passos…" /></Field>}
      </div>
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !picked || !form.title.trim() || !form.dueDate} onClick={save}>{busy ? 'Salvando…' : (done ? 'Registrar' : 'Salvar')}</button>
      </div>
    </Modal>
  );
}
