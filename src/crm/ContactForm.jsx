// Cadastro/edição de contato (estado local + Salvar). Sem empresa definida, o
// formulário pede pra escolher uma (busca por nome/CNPJ).
import React, { useEffect, useState } from 'react';
import { crm } from './crmApi.js';
import { Modal, Field, DuplicatesAlert } from './ui.jsx';
import { DECISION_ROLES } from './crmMeta.js';

const EMPTY = { firstName: '', lastName: '', jobTitle: '', department: '', email: '', phone: '', whatsapp: '', linkedin: '', decisionRole: '', influence: '', relationshipStrength: '', isPrimary: false };

export default function ContactForm({ initial, company, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => {
    if (!editing) return { ...EMPTY };
    const f = { ...EMPTY };
    Object.keys(EMPTY).forEach((k) => { if (initial[k] != null) f[k] = initial[k]; });
    return f;
  });
  const [picked, setPicked] = useState(company || (editing ? { id: initial.companyId, legalName: initial.companyName } : null));
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dup, setDup] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { crm.companies({ q, limit: 6 }).then((r) => setResults(r.items)).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function save(force) {
    setError(''); setBusy(true);
    try {
      if (editing) {
        const payload = {};
        Object.keys(EMPTY).forEach((k) => { if (form[k] !== (initial[k] == null ? EMPTY[k] : initial[k])) payload[k] = form[k]; });
        if (!Object.keys(payload).length) { onCancel(); return; }
        if (force) payload.force = true;
        onSaved((await crm.updateContact(initial.id, payload)).contact);
      } else {
        onSaved((await crm.createContact({ ...form, companyId: picked.id, force: !!force })).contact);
      }
    } catch (e) {
      if (e.status === 409 && e.data && e.data.duplicates) setDup({ duplicates: e.data.duplicates });
      else setError(e.message || 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar contato' : 'Novo contato'} onClose={onCancel}>
      <div className="crm-form-grid">
        <Field label="Empresa *" full>
          {picked ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{picked.legalName}</strong>
              {!company && !editing && <button type="button" className="crm-btn" onClick={() => setPicked(null)}>Trocar</button>}
            </div>
          ) : (
            <div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou CNPJ da empresa" autoFocus />
              {results.map((r) => (
                <button key={r.id} type="button" className="crm-search-item" onClick={() => { setPicked({ id: r.id, legalName: r.legalName }); setResults([]); }}>
                  {r.legalName}<small>{r.tradeName}</small>
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Nome *"><input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus={!!picked} /></Field>
        <Field label="Sobrenome"><input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
        <Field label="Cargo"><input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></Field>
        <Field label="Departamento"><input value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Telefone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="WhatsApp"><input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
        <Field label="LinkedIn"><input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></Field>
        <div className="crm-form-group">Papel na venda B2B</div>
        <Field label="Papel na decisão">
          <select value={form.decisionRole} onChange={(e) => set('decisionRole', e.target.value)}>
            <option value="">—</option>{DECISION_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nível de influência">
          <select value={form.influence} onChange={(e) => set('influence', e.target.value)}>
            <option value="">—</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </Field>
        <Field label="Relacionamento">
          <select value={form.relationshipStrength} onChange={(e) => set('relationshipStrength', e.target.value)}>
            <option value="">—</option><option value="forte">Forte</option><option value="medio">Médio</option><option value="fraco">Fraco</option>
          </select>
        </Field>
        <Field label="Contato principal da empresa">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 13 }}>
            <input type="checkbox" checked={!!form.isPrimary} onChange={(e) => set('isPrimary', e.target.checked)} style={{ width: 'auto' }} /> Marcar como principal
          </label>
        </Field>
      </div>
      <DuplicatesAlert duplicates={dup && dup.duplicates} blocking={false} />
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        {dup && <button type="button" className="crm-btn" disabled={busy} onClick={() => save(true)}>Salvar mesmo assim</button>}
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !picked || !form.firstName.trim()} onClick={() => save(false)}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
