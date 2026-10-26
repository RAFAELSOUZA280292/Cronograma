// Cadastro/edição de negócio (estado local + Salvar). A empresa é sempre
// obrigatória: com `company` fixa (aberto pela ficha) não pergunta; sem ela,
// busca. Com produtos na lista o valor passa a ser a soma deles (o servidor faz
// a mesma conta) — o campo de valor só vale para negócio sem produtos.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal, Field, RelPill, CancelButton, useDirty } from './ui.jsx';
import { fmtMoney, sourceLabel, moneyToNumber, contactLabel, fmtCnpj, SOURCE_LABELS } from './crmMeta.js';
import { guardedModal } from '../ui/SafeBoundary.jsx';
import { trackFlow } from '../lib/experience.js';
import { DateField } from '../ui/DateTimeFields.jsx';


const CUSTOM = '__custom';
const numStr = (n) => (n == null ? '' : String(n).replace('.', ','));

function fromDeal(d) {
  return {
    title: d.title || '', dealType: d.dealType || 'new', value: d.value ? numStr(d.value) : '', mrr: d.mrr ? numStr(d.mrr) : '', expectedCloseDate: d.expectedCloseDate || '',
    probabilityOverride: d.probabilityOverride == null ? '' : String(d.probabilityOverride), ownerId: d.ownerId || '', primaryContactId: d.primaryContactId || '',
    source: d.source || '', description: d.description || '',
  };
}


const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Cadastro/edição rápida do contato principal, dentro do próprio negócio.
function ContactMini({ companyId, contact, initialName, onSaved, onCancel }) {
  const editing = !!contact;
  const [f, setF] = useState(() => (contact
    ? { name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(), jobTitle: contact.jobTitle || '', phone: contact.phone || contact.whatsapp || '', email: contact.email || '' }
    : { name: initialName || '', jobTitle: '', phone: '', email: '' }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dup, setDup] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save(force) {
    const [first, ...rest] = f.name.trim().split(/\s+/);
    if (!first) { setErr('Informe o nome do contato.'); return; }
    setBusy(true); setErr('');
    const body = { firstName: first, lastName: rest.join(' '), jobTitle: f.jobTitle, phone: f.phone, whatsapp: f.phone, email: f.email, ...(force ? { force: true } : {}) };
    try {
      const r = editing ? await crm.updateContact(contact.id, body) : await crm.createContact({ ...body, companyId });
      onSaved(r.contact);
    } catch (e) {
      if (e && e.status === 409) { setDup(true); setErr(e.message || 'Já existe um contato parecido.'); } else setErr(e.message || 'Não foi possível salvar o contato.');
    } finally { setBusy(false); }
  }
  return (
    <div className="crm-section" style={{ marginTop: 8 }}>
      <h3 className="crm-section-title">{editing ? 'Editar contato' : 'Novo contato'}</h3>
      <div className="crm-form-grid">
        <Field label="Nome *"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome e sobrenome" autoFocus /></Field>
        <Field label="Cargo"><input value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Ex.: Sócio, Financeiro" /></Field>
        <Field label="Telefone / WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(41) 99999-0000" /></Field>
        <Field label="E-mail"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
      </div>
      {err && <div className="crm-err">{err}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel} disabled={busy} title={busy ? 'Aguarde terminar de salvar' : undefined}>Cancelar</button>
        {dup && <button type="button" className="crm-btn" disabled={busy} title={busy ? 'Aguarde terminar de salvar' : undefined} onClick={() => save(true)}>É outra pessoa — salvar mesmo assim</button>}
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !f.name.trim()} title={!f.name.trim() ? 'Informe o nome do contato' : undefined} onClick={() => save(false)}>{busy ? 'Salvando…' : (editing ? 'Salvar contato' : 'Criar contato')}</button>
      </div>
    </div>
  );
}

// Resumo da consulta do CNPJ (Receita, via BrasilAPI com cache) — mesmo dado que o cadastro de empresa usa.
function CnpjCard({ info, onUseExisting, onUseData }) {
  if (!info) return null;
  if (info.loading) return <div className="crm-muted" style={{ marginTop: 6 }}>Consultando o CNPJ na Receita…</div>;
  if (info.error) return <div className="crm-err" style={{ marginTop: 6 }}>{info.error}</div>;
  const dup = info.duplicates && info.duplicates.exactCnpj;
  const s = info.suggestion;
  if (dup) {
    return (
      <div className="crm-alert crm-alert-warn" style={{ marginTop: 8 }}>
        <strong>Este CNPJ já está cadastrado:</strong> {dup.legalName || dup.legal_name}
        <div style={{ marginTop: 6 }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => onUseExisting(dup)}>Usar esta empresa</button></div>
      </div>
    );
  }
  if (!s) return <div className="crm-muted" style={{ marginTop: 6 }}>{info.message || 'Não encontrei esse CNPJ — cadastre o nome e complete depois.'}</div>;
  return (
    <div className="crm-section" style={{ marginTop: 8 }}>
      <h3 className="crm-section-title">Dados da Receita</h3>
      <div style={{ fontWeight: 800 }}>{s.legalName}</div>
      {s.tradeName && <div className="crm-muted">{s.tradeName}</div>}
      <div className="crm-muted" style={{ marginTop: 4 }}>{[fmtCnpj(s.cnpj), [s.city, s.state].filter(Boolean).join('/'), s.segment, s.companySize, s.taxRegime, s.situacaoCadastral && `situação: ${s.situacaoCadastral}`].filter(Boolean).join(' · ')}</div>
      <div style={{ marginTop: 8 }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => onUseData(s)}><Plus size={14} /> Cadastrar com estes dados</button></div>
    </div>
  );
}

function DealForm({ initial, company, defaultType, defaultPipelineId, options, currentUserId, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => (editing ? fromDeal(initial) : {
    title: '', dealType: defaultType || 'new', value: '', mrr: '', expectedCloseDate: '', probabilityOverride: '', ownerId: currentUserId || '', primaryContactId: '', source: '', description: '',
  }));
  const [items, setItems] = useState(() => (editing && initial.items ? initial.items.map((i) => ({ productId: i.productId || CUSTOM, name: i.name, quantity: String(i.quantity), unitPrice: numStr(i.unitPrice) })) : []));
  const [picked, setPicked] = useState(company || (editing ? { id: initial.companyId, legalName: initial.companyName, relationship: initial.companyRelationship } : null));
  const pipelines = (options && options.pipelines) || [];
  const [pipelineId, setPipelineId] = useState(() => {
    const remembered = (() => { try { return window.localStorage.getItem('crm-deals-pipeline') || ''; } catch { return ''; } })(); // o funil em que a pessoa trabalha
    const pick = [defaultPipelineId, remembered].find((id) => id && pipelines.some((p) => p.id === id));
    return pick || ((pipelines.find((p) => p.isDefault) || pipelines[0] || {}).id || '');
  });
  const [q, setQ] = useState('');
  const t0 = useRef(Date.now());
  const [quick, setQuick] = useState(null); // lead rápido: { contactName, phone, email, companyName, cnpj, companyData, dups }
  const [cnpjInfo, setCnpjInfo] = useState(null);
  const [ctForm, setCtForm] = useState(null); // { contact? } → formulário do contato principal
  const [pendingContact, setPendingContact] = useState('');
  const [results, setResults] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = useDirty({ form, items, company: picked && picked.id, pipelineId, quick });
  const products = (options && options.products) || [];
  const owners = (options && options.owners) || [];
  const isClient = picked && picked.relationship === 'client';
  const sourceChoices = useMemo(() => [...new Set([...((options && options.sources) || []).map((k) => sourceLabel(k)), ...((options && options.dealSources) || []).map((k) => sourceLabel(k))].filter(Boolean))], [options]);

  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { crm.companies({ q, limit: 6 }).then((r) => setResults(r.items)).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  // CNPJ digitado no campo da empresa: consulta sozinho a Receita (BrasilAPI, com cache) assim que completa os 14 dígitos.
  const qDigits = q.replace(/\D/g, '');
  useEffect(() => {
    if (picked || qDigits.length !== 14) { setCnpjInfo(null); return undefined; }
    let off = false;
    setCnpjInfo({ loading: true });
    const t = setTimeout(() => { crm.cnpj(qDigits).then((r) => { if (!off) setCnpjInfo(r.found ? { suggestion: r.suggestion, duplicates: r.duplicates } : { message: r.message, duplicates: r.duplicates }); }).catch((e) => { if (!off) setCnpjInfo({ error: e.message || 'Não foi possível consultar o CNPJ.' }); }); }, 300);
    return () => { off = true; clearTimeout(t); };
  }, [qDigits, picked]);

  useEffect(() => {
    if (!picked) { setContacts([]); return; }
    crm.contacts({ companyId: picked.id, limit: 100 }).then((r) => setContacts(r.items)).catch(() => setContacts([]));
  }, [picked]);

  // Digitou um nome de contato antes de escolher a empresa: ao escolher, abre o cadastro dele já com o nome.
  useEffect(() => { if (picked && pendingContact.trim() && !editing) setCtForm({}); }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empresa que não é cliente não pode ter upsell — volta pra "novo negócio" ao trocar.
  useEffect(() => { if (picked && !isClient && form.dealType === 'upsell') set('dealType', 'new'); }, [picked, isClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemsTotal = useMemo(() => items.reduce((n, i) => {
    const q2 = Number(String(i.quantity).replace(',', '.')) || 0;
    const p = moneyToNumber(i.unitPrice);
    return n + q2 * (Number.isFinite(p) && p != null ? p : 0);
  }, 0), [items]);

  function setItem(idx, patch) { setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it))); }
  function pickProduct(idx, productId) {
    if (productId === CUSTOM) { setItem(idx, { productId: CUSTOM, name: '', unitPrice: '' }); return; }
    const p = products.find((x) => x.id === productId);
    setItem(idx, { productId, name: p ? p.name : '', unitPrice: p && p.listPrice != null ? numStr(p.listPrice) : '' });
  }

  const blockReason = busy ? 'Aguarde terminar de salvar' : !picked && !quick ? 'Escolha a empresa (ou cadastre como lead rápido) para salvar' : !form.title.trim() && !quick ? 'Preencha o título do negócio para salvar' : '';

  async function save() {
    setError('');
    const value = moneyToNumber(form.value);
    if (Number.isNaN(value)) { setError('Valor inválido.'); return; }
    const mrr = moneyToNumber(form.mrr);
    if (Number.isNaN(mrr)) { setError('MRR inválido.'); return; }
    const payloadItems = items.filter((i) => i.productId || i.name.trim()).map((i) => ({ productId: i.productId === CUSTOM ? null : i.productId, name: i.name, quantity: Number(String(i.quantity).replace(',', '.')) || 0, unitPrice: moneyToNumber(i.unitPrice) }));
    if (payloadItems.some((i) => Number.isNaN(i.unitPrice))) { setError('Há um preço inválido nos produtos.'); return; }
    const body = {
      title: form.title, dealType: form.dealType, value: value == null ? 0 : value, mrr: mrr == null ? 0 : mrr, expectedCloseDate: form.expectedCloseDate || null,
      probabilityOverride: form.probabilityOverride === '' ? null : Number(form.probabilityOverride), ownerId: form.ownerId || null,
      primaryContactId: form.primaryContactId || null, source: form.source.trim(), description: form.description, items: payloadItems,
    };
    setBusy(true);
    try {
      if (!editing && !picked && quick) {
        const r = await crm.quickLead({ companyName: (quick.companyName || q.trim()), cnpj: quick.cnpj || '', companyData: quick.companyData || undefined, contactName: quick.contactName, phone: quick.phone, email: quick.email, title: form.title, pipelineId, source: form.source.trim(), force: !!quick.force });
        trackFlow('crm.lead_rapido', 'ok', Date.now() - t0.current);
        onSaved(r.deal);
        return;
      }
      if (editing) onSaved((await crm.updateDeal(initial.id, body)).deal);
      else { const created = (await crm.createDeal({ ...body, companyId: picked.id, ...(pipelineId ? { pipelineId } : {}) })).deal; trackFlow('crm.negocio.criar', 'ok', Date.now() - t0.current); onSaved(created); }
    } catch (e) {
      if (!editing) trackFlow(quick && !picked ? 'crm.lead_rapido' : 'crm.negocio.criar', 'error', Date.now() - t0.current);
      const dups = e && e.data && e.data.duplicates && e.data.duplicates.byName;
      if (quick && e && e.status === 409 && dups && dups.length) { setQuick((x) => ({ ...x, dups })); setError(''); } else setError(e.message || 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar negócio' : (form.dealType === 'upsell' ? 'Nova oportunidade de upsell' : 'Novo negócio')} onClose={onCancel} width={820} dirty={dirty}>
      <div className="crm-form-grid">
        <Field label="Empresa *" full>
          {picked ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{picked.legalName}</strong>{picked.relationship && <RelPill value={picked.relationship} />}
              {!company && !editing && <button type="button" className="crm-btn" onClick={() => { setPicked(null); setForm((f) => ({ ...f, primaryContactId: '' })); }}>Trocar</button>}
            </div>
          ) : (
            <div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou CNPJ da empresa" autoFocus />
              {results.map((r) => (
                <button key={r.id} type="button" className="crm-search-item" title={`Escolher ${r.legalName}`} onClick={() => { setPicked({ id: r.id, legalName: r.legalName, relationship: r.relationship }); setResults([]); }}>
                  {r.legalName}<small>{r.tradeName}</small>
                </button>
              ))}
              {qDigits.length === 14 && !quick && (
                <CnpjCard info={cnpjInfo} onUseExisting={(d) => { setPicked({ id: d.id, legalName: d.legalName || d.legal_name, relationship: d.relationship }); setQ(''); setCnpjInfo(null); }}
                  onUseData={(sg) => { setQuick({ contactName: pendingContact, phone: '', email: '', companyName: sg.legalName, cnpj: sg.cnpj, companyData: sg }); setQ(sg.legalName); setCnpjInfo(null); }} />
              )}
              {q.trim().length >= 2 && qDigits.length !== 14 && !results.length && !quick && (
                <div style={{ marginTop: 6 }}>
                  <span className="crm-muted">Empresa não encontrada. </span>
                  <button type="button" className="crm-btn" onClick={() => setQuick({ contactName: pendingContact, phone: '', email: '' })}><Plus size={14} /> Cadastrar “{q.trim()}” como lead novo</button>
                </div>
              )}
              {quick && (
                <div className="crm-section" style={{ marginTop: 8 }}>
                  <h3 className="crm-section-title">Lead novo: {quick.companyName || q.trim()} <button type="button" className="crm-btn" style={{ marginLeft: 8 }} onClick={() => setQuick(null)}>Cancelar</button></h3>
                  <div className="crm-muted" style={{ marginBottom: 6 }}>{quick.cnpj ? `Cria a empresa com os dados da Receita (CNPJ ${fmtCnpj(quick.cnpj)}), o contato e o negócio de uma vez, com você como responsável.` : 'Cria a empresa (sem CNPJ, a completar depois — dica: digite o CNPJ no campo da empresa para trazer os dados da Receita), o contato e o negócio de uma vez, com você como responsável.'}</div>
                  <div className="crm-form-grid">
                    <Field label="Nome do contato"><input value={quick.contactName} onChange={(e) => setQuick((x) => ({ ...x, contactName: e.target.value }))} placeholder="Quem atende" /></Field>
                    <Field label="Telefone / WhatsApp"><input inputMode="tel" value={quick.phone} onChange={(e) => setQuick((x) => ({ ...x, phone: e.target.value }))} placeholder="Ex.: (41) 99999-0000" /></Field>
                    <Field label="E-mail"><input type="email" value={quick.email} onChange={(e) => setQuick((x) => ({ ...x, email: e.target.value }))} /></Field>
                  </div>
                  {quick.dups && quick.dups.length > 0 && (
                    <div className="crm-alert crm-alert-warn" style={{ marginTop: 8 }}>
                      <strong>Já existe empresa parecida:</strong>
                      {quick.dups.slice(0, 4).map((d) => <div key={d.id} style={{ marginTop: 4 }}>{d.legalName} <button type="button" className="crm-btn" onClick={() => { setPicked({ id: d.id, legalName: d.legalName, relationship: d.relationship }); setQuick(null); }}>Usar esta</button></div>)}
                      <div style={{ marginTop: 6 }}><button type="button" className="crm-btn" onClick={() => setQuick((x) => ({ ...x, force: true, dups: null }))}>É outra empresa — criar mesmo assim</button></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label={quick ? 'Título do negócio (vazio = nome da empresa)' : 'Título do negócio *'} full><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Diagnóstico da Reforma Tributária" autoFocus={!!picked && !editing} /></Field>
        {!editing && pipelines.length > 1 && (
          <Field label="Funil" full>
            <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (padrão)' : ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Tipo">
          <select value={form.dealType} onChange={(e) => set('dealType', e.target.value)}>
            <option value="new">Novo negócio</option>
            <option value="upsell" disabled={!!picked && !isClient}>Upsell (venda para cliente atual){picked && !isClient ? ' — só para clientes' : ''}</option>
          </select>
        </Field>
        <Field label="Responsável">
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>

        <div className="crm-form-group">Produtos e valor</div>
        <div className="crm-field full">
          {items.map((it, idx) => (
            <div className="crm-items-row" key={idx}>
              <div>
                <select value={it.productId} onChange={(e) => pickProduct(idx, e.target.value)} aria-label="Produto">
                  <option value="">Escolha um produto…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.listPrice != null ? ` — ${fmtMoney(p.listPrice)}` : ''}</option>)}
                  {it.productId && it.productId !== CUSTOM && !products.some((p) => p.id === it.productId) && <option value={it.productId}>{it.name} (inativo)</option>}
                  <option value={CUSTOM}>Outro (item avulso)…</option>
                </select>
                {it.productId === CUSTOM && <input aria-label="Nome do item avulso" style={{ marginTop: 6 }} value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} placeholder="Nome do item" />}
              </div>
              <input inputMode="decimal" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} aria-label="Quantidade" placeholder="Qtd." />
              <input inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} aria-label="Preço unitário" placeholder="Preço un." />
              <button type="button" className="crm-icon-btn" title="Remover produto" aria-label="Remover produto" onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
          <button type="button" className="crm-btn" onClick={() => setItems((l) => [...l, { productId: '', name: '', quantity: '1', unitPrice: '' }])}><Plus size={13} /> Adicionar produto</button>
          {items.length > 0 && <div className="crm-total" style={{ marginTop: 10 }}><span>Valor do negócio (soma dos produtos)</span><span>{fmtMoney(itemsTotal)}</span></div>}
        </div>
        {items.length === 0 && <Field label="Valor do negócio (R$)"><input inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="Ex.: 20.000,00" /></Field>}
        <Field label="MRR — receita recorrente mensal (R$)"><input inputMode="decimal" value={form.mrr} onChange={(e) => set('mrr', e.target.value)} placeholder="Ex.: 3.500,00" /></Field>
        <Field label="Previsão de fechamento"><DateField value={form.expectedCloseDate} onChange={(v) => set('expectedCloseDate', v)} ariaLabel="Previsão de fechamento" allowClear /></Field>
        <Field label="Probabilidade manual (%)"><input type="number" min="0" max="100" value={form.probabilityOverride} onChange={(e) => set('probabilityOverride', e.target.value)} placeholder="Vazio = a da etapa" /></Field>

        <div className="crm-form-group">Contexto</div>
        <Field label="Contato principal" full>
          {quick ? (
            <div>
              <input value={quick.contactName} onChange={(e) => setQuick((x) => ({ ...x, contactName: e.target.value }))} placeholder="Quem atende (vira o contato principal do lead)" aria-label="Contato principal" />
              <div className="crm-muted" style={{ marginTop: 4 }}>Telefone e e-mail dele ficam no cadastro do lead acima.</div>
            </div>
          ) : !picked ? (
            <div>
              <input value={pendingContact} onChange={(e) => setPendingContact(e.target.value)} placeholder="Nome do contato (você completa os dados depois de escolher a empresa)" aria-label="Contato principal" />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={form.primaryContactId} aria-label="Contato principal" style={{ flex: '1 1 260px' }} onChange={(e) => { if (e.target.value === '__new') setCtForm({}); else set('primaryContactId', e.target.value); }}>
                  <option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{contactLabel(c)}{c.jobTitle ? ` (${c.jobTitle})` : ''}</option>)}
                  <option value="__new">＋ Novo contato…</option>
                </select>
                {form.primaryContactId && !ctForm && <button type="button" className="crm-btn" onClick={() => setCtForm({ contact: contacts.find((c) => c.id === form.primaryContactId) })}>Editar contato</button>}
                {!ctForm && <button type="button" className="crm-btn" onClick={() => setCtForm({})}><Plus size={14} /> Novo contato</button>}
              </div>
              {ctForm && (
                <ContactMini companyId={picked.id} contact={ctForm.contact} initialName={pendingContact} onCancel={() => setCtForm(null)}
                  onSaved={(c) => { setContacts((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])); set('primaryContactId', c.id); setCtForm(null); setPendingContact(''); }} />
              )}
            </div>
          )}
        </Field>
        <Field label="Origem" full>
          <div>
            <input list="crm-deal-sources" value={sourceLabel(form.source)} aria-label="Origem do negócio" placeholder="Escolha da lista ou digite uma origem nova"
              onChange={(e) => { const v = e.target.value; const key = Object.keys(SOURCE_LABELS).find((k) => norm(SOURCE_LABELS[k]) === norm(v)); set('source', key || v); }} />
            <datalist id="crm-deal-sources">{sourceChoices.map((o) => <option key={o} value={o} />)}</datalist>
            {form.source.trim() && !sourceChoices.some((o) => norm(o) === norm(sourceLabel(form.source))) && <div className="crm-muted" style={{ marginTop: 4 }}>Origem nova: “{form.source.trim()}” — ela fica disponível na lista dos próximos negócios.</div>}
          </div>
        </Field>
        <Field label="Descrição" full><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexto, dor do cliente, escopo combinado…" /></Field>
      </div>
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        {blockReason && !busy && <span className="crm-muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>{blockReason}</span>}
        <CancelButton />
        <button type="button" className="crm-btn crm-btn-primary" disabled={!!blockReason} title={blockReason || undefined} onClick={save}>{busy ? 'Salvando…' : (editing ? 'Salvar' : 'Criar negócio')}</button>
      </div>
    </Modal>
  );
}

export default guardedModal(DealForm, 'o formulário de negócio', 'crm-deal-form');
