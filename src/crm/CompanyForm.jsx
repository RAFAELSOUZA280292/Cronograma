// Cadastro/edição de empresa. Estado local do formulário + botão Salvar (nada
// é gravado por tecla — a auditoria fica limpa, um evento por salvamento).
// Cadastro rápido = só o essencial; "Mais campos" abre o resto (PRD 51).
import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal, Field, DuplicatesAlert } from './ui.jsx';
import { fmtCnpj, sourceLabel } from './crmMeta.js';

const EMPTY = {
  legalName: '', tradeName: '', cnpj: '', economicGroup: '', branchType: '', website: '', segment: '', cnae: '', city: '', state: '', country: 'Brasil',
  relationship: 'prospect', source: '', ownerId: '', enteredAt: '', clientSince: '', companySize: '', taxRegime: '', revenueEstimate: '', employees: '', erp: '', strategicLevel: '',
  phone: '', contactEmail: '', zipCode: '', street: '', streetNumber: '', complement: '', district: '', foundedAt: '', shareCapital: '', cnaeSecondary: '',
};

function fromCompany(c) {
  const f = { ...EMPTY };
  Object.keys(EMPTY).forEach((k) => { if (c[k] != null) f[k] = k === 'cnpj' ? fmtCnpj(c[k]) : String(c[k]); });
  return f;
}

export default function CompanyForm({ initial, options, onSaved, onCancel, onOpenCompany, prefillOwnerId }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => (editing ? fromCompany(initial) : { ...EMPTY, ownerId: prefillOwnerId || '' }));
  const [more, setMore] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState('');
  const [dup, setDup] = useState(null); // { duplicates, blocking }
  const [lookupMsg, setLookupMsg] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function lookup() {
    setError(''); setLookupMsg(''); setLookingUp(true);
    try {
      const r = await crm.cnpj(form.cnpj);
      if (r.duplicates && r.duplicates.exactCnpj && !(editing && r.duplicates.exactCnpj.id === initial.id)) setDup({ duplicates: r.duplicates, blocking: true });
      if (!r.found) { setLookupMsg(r.message || 'Não encontrei esse CNPJ — preencha manualmente.'); return; }
      const s = r.suggestion;
      // só preenche o que ainda está vazio: nunca sobrescreve o que a pessoa já digitou
      setForm((f) => {
        const next = { ...f };
        ['legalName', 'tradeName', 'city', 'state', 'cnae', 'segment', 'taxRegime', 'companySize', 'phone', 'zipCode', 'street', 'streetNumber', 'complement', 'district', 'foundedAt', 'shareCapital']
          .forEach((k) => { if (!next[k] && s[k] !== '' && s[k] != null) next[k] = String(s[k]); });
        next.cnpj = fmtCnpj(s.cnpj || f.cnpj);
        return next;
      });
      setMore(true);
      setLookupMsg(`Dados da Receita preenchidos${s.situacaoCadastral ? ` (situação: ${s.situacaoCadastral})` : ''}. Confira e ajuste se precisar.`);
    } catch (e) {
      setError(e.message || 'Não foi possível consultar o CNPJ.');
    } finally { setLookingUp(false); }
  }

  async function save(force) {
    setError(''); setBusy(true);
    try {
      let payload;
      if (editing) {
        const base = fromCompany(initial);
        payload = {};
        Object.keys(EMPTY).forEach((k) => { if (form[k] !== base[k]) payload[k] = form[k]; });
        if (!Object.keys(payload).length) { onCancel(); return; }
        if (force) payload.force = true;
        const r = await crm.updateCompany(initial.id, payload);
        onSaved(r.company);
      } else {
        payload = { ...form };
        if (force) payload.force = true;
        const r = await crm.createCompany(payload);
        onSaved(r.company);
      }
    } catch (e) {
      if (e.status === 409 && e.data && e.data.duplicates) setDup({ duplicates: e.data.duplicates, blocking: !!e.data.blocking });
      else setError(e.message || 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  const owners = (options && options.owners) || [];
  const canForce = dup && !dup.blocking;
  return (
    <Modal title={editing ? 'Editar empresa' : 'Nova empresa'} onClose={onCancel}>
      <div className="crm-form-grid">
        <Field label="CNPJ" full>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" autoFocus />
            <button type="button" className="crm-btn" disabled={lookingUp || form.cnpj.replace(/\D/g, '').length !== 14} onClick={lookup}>
              {lookingUp ? <Loader2 size={14} className="crm-spin" /> : <Search size={14} />} Buscar dados
            </button>
          </div>
          {lookupMsg && <div className="crm-muted" style={{ marginTop: 5 }}>{lookupMsg}</div>}
        </Field>
        <Field label="Razão social / Nome *"><input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
        <Field label="Nome fantasia"><input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></Field>
        <Field label="Relação com a PRICETAX">
          <select value={form.relationship} onChange={(e) => set('relationship', e.target.value)}>
            {((options && options.relationships) || []).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Origem">
          <select value={form.source} onChange={(e) => set('source', e.target.value)}>
            <option value="">—</option>
            {((options && options.sources) || []).map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Responsável">
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Sem responsável</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>

        {!more && <div className="crm-field full"><button type="button" className="crm-btn" onClick={() => setMore(true)}>Mais campos</button></div>}

        {more && (
          <>
            <div className="crm-form-group">Identificação</div>
            <Field label="Grupo econômico"><input value={form.economicGroup} onChange={(e) => set('economicGroup', e.target.value)} /></Field>
            <Field label="Matriz / Filial">
              <select value={form.branchType} onChange={(e) => set('branchType', e.target.value)}>
                <option value="">—</option><option value="matriz">Matriz</option><option value="filial">Filial</option>
              </select>
            </Field>
            <Field label="Site"><input value={form.website} onChange={(e) => set('website', e.target.value)} /></Field>
            <Field label="Segmento"><input value={form.segment} onChange={(e) => set('segment', e.target.value)} list="crm-segments" /></Field>
            <Field label="CNAE principal"><input value={form.cnae} onChange={(e) => set('cnae', e.target.value)} /></Field>
            <Field label="CNAEs secundários" full><textarea rows={2} value={form.cnaeSecondary} onChange={(e) => set('cnaeSecondary', e.target.value)} /></Field>
            <Field label="Cidade"><input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Estado (UF)"><input value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))} /></Field>
            <Field label="País"><input value={form.country} onChange={(e) => set('country', e.target.value)} /></Field>
            <div className="crm-form-group">Contato e endereço</div>
            <Field label="Telefone(s)"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(11) 3000-0000" /></Field>
            <Field label="E-mail de contato"><input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
            <Field label="CEP"><input value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} placeholder="00000-000" /></Field>
            <Field label="Logradouro"><input value={form.street} onChange={(e) => set('street', e.target.value)} /></Field>
            <Field label="Número"><input value={form.streetNumber} onChange={(e) => set('streetNumber', e.target.value)} /></Field>
            <Field label="Complemento"><input value={form.complement} onChange={(e) => set('complement', e.target.value)} /></Field>
            <Field label="Bairro"><input value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <div className="crm-form-group">Comercial</div>
            <Field label="Data de entrada"><input type="date" value={form.enteredAt} onChange={(e) => set('enteredAt', e.target.value)} /></Field>
            <Field label="Cliente desde"><input type="date" value={form.clientSince} onChange={(e) => set('clientSince', e.target.value)} /></Field>
            <div className="crm-form-group">Econômico</div>
            <Field label="Porte">
              <select value={form.companySize} onChange={(e) => set('companySize', e.target.value)}>
                <option value="">—</option>{((options && options.companySizes) || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Regime tributário">
              <select value={form.taxRegime} onChange={(e) => set('taxRegime', e.target.value)}>
                <option value="">—</option>{((options && options.taxRegimes) || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Data de fundação"><input type="date" value={form.foundedAt} onChange={(e) => set('foundedAt', e.target.value)} /></Field>
            <Field label="Capital social (R$)"><input value={form.shareCapital} onChange={(e) => set('shareCapital', e.target.value)} placeholder="ex.: 50.000,00" /></Field>
            <Field label="Faturamento estimado (R$)"><input value={form.revenueEstimate} onChange={(e) => set('revenueEstimate', e.target.value)} placeholder="ex.: 1.500.000,00" /></Field>
            <Field label="Nº de funcionários"><input type="number" min="0" value={form.employees} onChange={(e) => set('employees', e.target.value)} /></Field>
            <Field label="ERP"><input value={form.erp} onChange={(e) => set('erp', e.target.value)} /></Field>
            <Field label="Nível estratégico">
              <select value={form.strategicLevel} onChange={(e) => set('strategicLevel', e.target.value)}>
                <option value="">—</option><option value="alto">Alto</option><option value="medio">Médio</option><option value="baixo">Baixo</option>
              </select>
            </Field>
          </>
        )}
      </div>
      <datalist id="crm-segments">{((options && options.segments) || []).map((s) => <option key={s} value={s} />)}</datalist>
      <DuplicatesAlert duplicates={dup && dup.duplicates} blocking={dup && dup.blocking} onOpenCompany={onOpenCompany} />
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        {canForce && <button type="button" className="crm-btn" disabled={busy} onClick={() => save(true)}>Salvar mesmo assim</button>}
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !form.legalName.trim() && !form.tradeName.trim()} onClick={() => save(false)}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
