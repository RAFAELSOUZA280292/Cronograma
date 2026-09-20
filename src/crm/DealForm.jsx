// Cadastro/edição de negócio (estado local + Salvar). A empresa é sempre
// obrigatória: com `company` fixa (aberto pela ficha) não pergunta; sem ela,
// busca. Com produtos na lista o valor passa a ser a soma deles (o servidor faz
// a mesma conta) — o campo de valor só vale para negócio sem produtos.
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal, Field, RelPill } from './ui.jsx';
import { fmtMoney, sourceLabel, moneyToNumber } from './crmMeta.js';

const CUSTOM = '__custom';
const numStr = (n) => (n == null ? '' : String(n).replace('.', ','));

function fromDeal(d) {
  return {
    title: d.title || '', dealType: d.dealType || 'new', value: d.value ? numStr(d.value) : '', expectedCloseDate: d.expectedCloseDate || '',
    probabilityOverride: d.probabilityOverride == null ? '' : String(d.probabilityOverride), ownerId: d.ownerId || '', primaryContactId: d.primaryContactId || '',
    source: d.source || '', description: d.description || '',
  };
}

export default function DealForm({ initial, company, defaultType, defaultPipelineId, options, currentUserId, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => (editing ? fromDeal(initial) : {
    title: '', dealType: defaultType || 'new', value: '', expectedCloseDate: '', probabilityOverride: '', ownerId: currentUserId || '', primaryContactId: '', source: '', description: '',
  }));
  const [items, setItems] = useState(() => (editing && initial.items ? initial.items.map((i) => ({ productId: i.productId || CUSTOM, name: i.name, quantity: String(i.quantity), unitPrice: numStr(i.unitPrice) })) : []));
  const [picked, setPicked] = useState(company || (editing ? { id: initial.companyId, legalName: initial.companyName, relationship: initial.companyRelationship } : null));
  const pipelines = (options && options.pipelines) || [];
  const [pipelineId, setPipelineId] = useState(() => (defaultPipelineId && pipelines.some((p) => p.id === defaultPipelineId) ? defaultPipelineId : ((pipelines.find((p) => p.isDefault) || pipelines[0] || {}).id || '')));
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const products = (options && options.products) || [];
  const owners = (options && options.owners) || [];
  const isClient = picked && picked.relationship === 'client';

  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { crm.companies({ q, limit: 6 }).then((r) => setResults(r.items)).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  useEffect(() => {
    if (!picked) { setContacts([]); return; }
    crm.contacts({ companyId: picked.id, limit: 100 }).then((r) => setContacts(r.items)).catch(() => setContacts([]));
  }, [picked]);

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

  async function save() {
    setError('');
    const value = moneyToNumber(form.value);
    if (Number.isNaN(value)) { setError('Valor inválido.'); return; }
    const payloadItems = items.filter((i) => i.productId || i.name.trim()).map((i) => ({ productId: i.productId === CUSTOM ? null : i.productId, name: i.name, quantity: Number(String(i.quantity).replace(',', '.')) || 0, unitPrice: moneyToNumber(i.unitPrice) }));
    if (payloadItems.some((i) => Number.isNaN(i.unitPrice))) { setError('Há um preço inválido nos produtos.'); return; }
    const body = {
      title: form.title, dealType: form.dealType, value: value == null ? 0 : value, expectedCloseDate: form.expectedCloseDate || null,
      probabilityOverride: form.probabilityOverride === '' ? null : Number(form.probabilityOverride), ownerId: form.ownerId || null,
      primaryContactId: form.primaryContactId || null, source: form.source, description: form.description, items: payloadItems,
    };
    setBusy(true);
    try {
      if (editing) onSaved((await crm.updateDeal(initial.id, body)).deal);
      else onSaved((await crm.createDeal({ ...body, companyId: picked.id, ...(pipelineId ? { pipelineId } : {}) })).deal);
    } catch (e) { setError(e.message || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar negócio' : (form.dealType === 'upsell' ? 'Nova oportunidade de upsell' : 'Novo negócio')} onClose={onCancel} width={820}>
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
                <button key={r.id} type="button" className="crm-search-item" onClick={() => { setPicked({ id: r.id, legalName: r.legalName, relationship: r.relationship }); setResults([]); }}>
                  {r.legalName}<small>{r.tradeName}</small>
                </button>
              ))}
              {q.trim().length >= 2 && !results.length && <div className="crm-muted" style={{ marginTop: 6 }}>Empresa não encontrada. Cadastre em “+ Empresa” antes de abrir o negócio.</div>}
            </div>
          )}
        </Field>
        <Field label="Título do negócio *" full><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Diagnóstico da Reforma Tributária" autoFocus={!!picked && !editing} /></Field>
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
                {it.productId === CUSTOM && <input style={{ marginTop: 6 }} value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} placeholder="Nome do item" />}
              </div>
              <input inputMode="decimal" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} aria-label="Quantidade" placeholder="Qtd." />
              <input inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} aria-label="Preço unitário" placeholder="Preço un." />
              <button type="button" className="crm-icon-btn" title="Remover produto" onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="crm-btn" onClick={() => setItems((l) => [...l, { productId: '', name: '', quantity: '1', unitPrice: '' }])}><Plus size={13} /> Adicionar produto</button>
          {items.length > 0 && <div className="crm-total" style={{ marginTop: 10 }}><span>Valor do negócio (soma dos produtos)</span><span>{fmtMoney(itemsTotal)}</span></div>}
        </div>
        {items.length === 0 && <Field label="Valor do negócio (R$)"><input inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="Ex.: 20.000,00" /></Field>}
        <Field label="Previsão de fechamento"><input type="date" value={form.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} /></Field>
        <Field label="Probabilidade manual (%)"><input type="number" min="0" max="100" value={form.probabilityOverride} onChange={(e) => set('probabilityOverride', e.target.value)} placeholder="Vazio = a da etapa" /></Field>

        <div className="crm-form-group">Contexto</div>
        <Field label="Contato principal">
          <select value={form.primaryContactId} onChange={(e) => set('primaryContactId', e.target.value)} disabled={!picked}>
            <option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()}{c.jobTitle ? ` (${c.jobTitle})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Origem">
          <select value={form.source} onChange={(e) => set('source', e.target.value)}>
            <option value="">—</option>{((options && options.sources) || []).map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Descrição" full><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexto, dor do cliente, escopo combinado…" /></Field>
      </div>
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !picked || !form.title.trim()} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
