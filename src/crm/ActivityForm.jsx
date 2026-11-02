// Cadastro/edição de atividade (estado local + Salvar). A empresa é sempre
// obrigatória; negócio e contato só listam os DA MESMA empresa (o servidor
// confere de novo). "Já realizei" registra uma interação que já aconteceu (ligação
// de ontem, reunião de hoje cedo) direto como concluída, com o resultado.
import React, { useEffect, useState } from 'react';
import { crm } from './crmApi.js';
import { Modal, Field, RelPill, CancelButton, useDirty } from './ui.jsx';
import { ACTIVITY_TYPES, PRIORITY_META, contactLabel } from './crmMeta.js';
import { guardedModal } from '../ui/SafeBoundary.jsx';
import { DateField, TimeField } from '../ui/DateTimeFields.jsx';
import { notify } from '../ui/dialogs.jsx';


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Diz a verdade sobre o convite: só afirma "enviado" quando o Google confirmou; senão explica por que não saiu.
function tellInvite(a, email, ownerName) {
  const st = a && a.inviteStatus;
  if (st === 'created' || st === 'updated') {
    notify(a.meetLink ? `Convite enviado a ${email}, com o link do Google Meet.` : `Convite enviado a ${email}. O Google ainda não devolveu o link do Meet; ele aparece na atividade em instantes.`, { tone: 'success', ttlMs: 7000 });
  } else if (st === 'not-connected') {
    notify(`A atividade foi salva, mas o convite NÃO foi enviado: ${ownerName || 'o responsável'} ainda não conectou o Google (Agenda › Conectar Google).`, { tone: 'error', ttlMs: 12000 });
  } else {
    notify('A atividade foi salva, mas o convite NÃO foi enviado (não foi possível falar com o Google). Abra a atividade e salve de novo.', { tone: 'error', ttlMs: 12000 });
  }
}

function ActivityForm({ initial, company, prefill, options, currentUserId, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => (editing ? {
    title: initial.title, activityType: initial.activityType, dueDate: initial.dueDate, dueTime: initial.dueTime || '', priority: initial.priority,
    ownerId: initial.ownerId || '', dealId: initial.dealId || '', contactId: initial.contactId || '', description: initial.description || '', inviteMeet: !!initial.inviteMeet,
  } : {
    title: (prefill && prefill.title) || '', activityType: (prefill && prefill.activityType) || 'task', dueDate: (prefill && prefill.dueDate) || todayLocal(), dueTime: '',
    priority: 'normal', ownerId: currentUserId || '', dealId: (prefill && prefill.dealId) || '', contactId: (prefill && prefill.contactId) || '', description: '', inviteMeet: false,
  }));
  const [done, setDone] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [picked, setPicked] = useState(company || (editing ? { id: initial.companyId, legalName: initial.companyName } : null));
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const owners = (options && options.owners) || [];
  const dirty = useDirty({ form, done, outcome, company: picked && picked.id });

  // Convite com Meet (só quando a pessoa marca): reunião, com horário, ainda não realizada, e contato escolhido que tenha e-mail.
  const inviteContact = contacts.find((c) => c.id === form.contactId) || null;
  const inviteIssue = done ? 'Atividade já realizada não envia convite.'
    : !/^\d{2}:\d{2}$/.test(form.dueTime || '') ? 'Informe o horário da reunião.'
    : !form.contactId ? 'Escolha o contato que vai receber o convite.'
    : !contactsLoaded ? ''
    : !inviteContact || !EMAIL_RE.test(String(inviteContact.email || '').trim()) ? 'O contato escolhido não tem e-mail cadastrado.' : '';
  const showInvite = form.activityType === 'meeting' && !done;
  const invite = showInvite && form.inviteMeet && !inviteIssue;
  const ownerName = (owners.find((o) => o.id === form.ownerId) || {}).name || '';
  const blockReason = busy ? 'Aguarde terminar de salvar' : (editing && !contactsLoaded && form.inviteMeet) ? 'Carregando os contatos…' : !picked ? 'Escolha a empresa para salvar' : !form.title.trim() ? 'Preencha o que precisa ser feito para salvar' : !form.dueDate ? 'Informe a data para salvar' : '';

  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { crm.companies({ q, limit: 6 }).then((r) => setResults(r.items)).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  useEffect(() => {
    if (!picked) { setDeals([]); setContacts([]); setContactsLoaded(true); return; }
    setContactsLoaded(false);
    crm.deals({ companyId: picked.id, status: 'open', limit: 100 }).then((r) => setDeals(r.items)).catch(() => setDeals([]));
    crm.contacts({ companyId: picked.id, limit: 100 }).then((r) => setContacts(r.items)).catch(() => setContacts([])).finally(() => setContactsLoaded(true));
  }, [picked]);

  async function save() {
    setError(''); setBusy(true);
    const body = {
      title: form.title, activityType: form.activityType, dueDate: form.dueDate, dueTime: form.dueTime, priority: form.priority, ownerId: form.ownerId || null,
      dealId: form.dealId || null, contactId: form.contactId || null, description: form.description, inviteMeet: invite,
    };
    try {
      const saved = editing ? (await crm.updateActivity(initial.id, body)).activity : (await crm.createActivity({ ...body, companyId: picked.id, ...(done ? { alreadyDone: true, outcome } : {}) })).activity;
      if (invite) tellInvite(saved, inviteContact && inviteContact.email, ownerName);
      onSaved(saved);
    } catch (e) { setError(e.message || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar atividade' : (done ? 'Registrar interação realizada' : 'Nova atividade')} onClose={onCancel} width={700} dirty={dirty}>
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
                <button key={r.id} type="button" className="crm-search-item" title={`Escolher ${r.legalName}`} onClick={() => { setPicked({ id: r.id, legalName: r.legalName, relationship: r.relationship }); setResults([]); }}>
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
        <Field label={done ? 'Quando aconteceu *' : 'Data *'}><DateField value={form.dueDate} max={done ? todayLocal() : undefined} onChange={(v) => set('dueDate', v)} ariaLabel={done ? 'Quando aconteceu' : 'Data da atividade'} /></Field>
        <Field label="Horário (opcional)"><TimeField value={form.dueTime} onChange={(v) => set('dueTime', v)} ariaLabel="Horário da atividade" /></Field>
        <Field label="Responsável">
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Contato">
          <select value={form.contactId} onChange={(e) => set('contactId', e.target.value)} disabled={!picked}>
            <option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{contactLabel(c)}{c.jobTitle ? ` (${c.jobTitle})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Negócio (para não perder o próximo passo dele)" full>
          <select value={form.dealId} onChange={(e) => set('dealId', e.target.value)} disabled={!picked}>
            <option value="">Não ligada a um negócio</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title} — {d.stageName}</option>)}
          </select>
        </Field>
        {showInvite && (
          <Field label="Convite do Google" full>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 13, opacity: inviteIssue ? .7 : 1 }}>
              <input type="checkbox" checked={invite} disabled={!!inviteIssue} onChange={(e) => set('inviteMeet', e.target.checked)} style={{ width: 'auto' }} /> Convidar o contato por e-mail e criar link do Google Meet
            </label>
            <span className="crm-muted" style={{ display: 'block', marginTop: 4 }}>
              {inviteIssue ? `${inviteIssue} ` : ''}{invite && inviteContact ? `O Google envia o convite para ${inviteContact.email}${ownerName ? ` em nome de ${ownerName}` : ''}. ` : 'Só sai e-mail se você marcar. '}
              O Google do responsável precisa estar conectado (Agenda).
            </span>
          </Field>
        )}
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
        {blockReason && !busy && <span className="crm-muted" style={{ fontSize: 12, marginRight: 'auto' }}>{blockReason}</span>}
        <CancelButton />
        <button type="button" className="crm-btn crm-btn-primary" disabled={!!blockReason} title={blockReason || undefined} onClick={save}>{busy ? 'Salvando…' : (done ? 'Registrar' : 'Salvar')}</button>
      </div>
    </Modal>
  );
}

export default guardedModal(ActivityForm, 'o formulário de atividade', 'crm-activity-form');
