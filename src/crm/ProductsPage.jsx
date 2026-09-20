// Catálogo de produtos/serviços (PRD 14). Todos veem; gestor+ mantém. Produto que
// já foi vendido se desativa em vez de excluir — some da escolha em negócios novos
// e continua nos antigos.
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Package, Pencil } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal, Field } from './ui.jsx';
import { fmtMoney, BILLING_LABELS, moneyToNumber } from './crmMeta.js';

function ProductForm({ initial, onSaved, onCancel }) {
  const editing = !!initial;
  const [f, setF] = useState(() => ({
    name: initial ? initial.name : '', category: initial ? initial.category : '', description: initial ? initial.description : '',
    listPrice: initial && initial.listPrice != null ? String(initial.listPrice).replace('.', ',') : '', billing: initial ? initial.billing : 'one_time', active: initial ? initial.active : true,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const price = moneyToNumber(f.listPrice);
    if (Number.isNaN(price)) { setError('Preço inválido.'); return; }
    setBusy(true); setError('');
    try {
      const body = { name: f.name, category: f.category, description: f.description, listPrice: price, billing: f.billing, active: f.active };
      onSaved(editing ? (await crm.updateProduct(initial.id, body)).product : (await crm.createProduct(body)).product);
    } catch (e) { setError(e.message || 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Editar produto' : 'Novo produto'} onClose={onCancel} width={560}>
      <div className="crm-form-grid">
        <Field label="Nome *" full><input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Categoria"><input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex.: Consultoria, Software" /></Field>
        <Field label="Preço de tabela (R$)"><input inputMode="decimal" value={f.listPrice} onChange={(e) => set('listPrice', e.target.value)} placeholder="Ex.: 15.000,00" /></Field>
        <Field label="Cobrança">
          <select value={f.billing} onChange={(e) => set('billing', e.target.value)}>{Object.entries(BILLING_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Situação">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 13 }}>
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} style={{ width: 'auto' }} /> Ativo (aparece na escolha de produtos)
          </label>
        </Field>
        <Field label="Descrição" full><textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        <button type="button" className="crm-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}

export default function ProductsPage({ caps, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // {product?}

  const load = useCallback(() => {
    crm.products(caps.catalog).then((r) => { setItems(r.products); setError(''); setLoading(false); }).catch((e) => { setError(e.message || 'Não foi possível carregar os produtos.'); setLoading(false); });
  }, [caps.catalog]);
  useEffect(() => { load(); }, [load]);

  async function remove(p) {
    if (!window.confirm(`Excluir "${p.name}" do catálogo? Negócios antigos que o usam continuam com o nome registrado. Para só parar de oferecer, prefira desativar.`)) return;
    try { await crm.deleteProduct(p.id); load(); if (onChanged) onChanged(); } catch (e) { window.alert(e.message); }
  }

  return (
    <div>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Produtos</h1><div className="crm-sub">O que a PRICETAX vende. Cada negócio escolhe daqui e o valor é a soma dos itens.</div></div>
        {caps.catalog && <button type="button" className="crm-btn crm-btn-primary" onClick={() => setForm({})}><Plus size={14} /> Novo produto</button>}
      </div>
      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      <div className="crm-table-wrap">
        <table className="crm-table" style={{ minWidth: 640 }}>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Cobrança</th><th className="crm-num">Preço de tabela</th><th>Situação</th>{caps.catalog && <th />}</tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} onClick={() => caps.catalog && setForm({ product: p })} style={{ cursor: caps.catalog ? 'pointer' : 'default' }}>
                <td><div className="crm-name">{p.name}</div>{p.description && <div className="crm-muted">{p.description.slice(0, 90)}</div>}</td>
                <td>{p.category}</td>
                <td>{BILLING_LABELS[p.billing]}</td>
                <td className="crm-num">{p.listPrice != null ? fmtMoney(p.listPrice) : <span className="crm-muted">—</span>}</td>
                <td><span className="crm-pill" style={{ color: p.active ? '#3ecf6e' : '#9a9a9a' }}>{p.active ? 'Ativo' : 'Inativo'}</span></td>
                {caps.catalog && <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="crm-icon-btn" title="Editar" onClick={() => setForm({ product: p })}><Pencil size={14} /></button>
                  <button type="button" className="crm-btn crm-btn-danger" style={{ padding: '4px 9px' }} onClick={() => remove(p)}>Excluir</button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <div className="crm-empty">
            <Package size={26} style={{ opacity: .5 }} />
            <div style={{ marginTop: 8 }}>Nenhum produto cadastrado ainda.{!caps.catalog && ' Peça a um gestor para cadastrar o catálogo.'}</div>
            {caps.catalog && <div style={{ marginTop: 10 }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => setForm({})}><Plus size={14} /> Cadastrar o primeiro</button></div>}
          </div>
        )}
        {loading && <div className="crm-empty">Carregando…</div>}
      </div>
      {form && <ProductForm initial={form.product} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); if (onChanged) onChanged(); }} />}
    </div>
  );
}
