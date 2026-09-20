// Traz pro CRM os clientes que já existem no painel (projetos do cronograma).
// Somente leitura em projetos: nada do cronograma é alterado.
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';
import { fmtCnpj } from './crmMeta.js';

const ACTION_LABEL = { create: 'Criar empresa', link_existing: 'Ligar à empresa existente', possible_duplicate: 'Possível duplicada' };

export default function BootstrapDialog({ onClose, onDone }) {
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [withContacts, setWithContacts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    crm.bootstrapPreview().then((r) => { setItems(r.items); setPicked(new Set(r.items.filter((i) => i.defaultSelected).map((i) => i.key))); }).catch((e) => setError(e.message));
  }, []);

  const toggle = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function run() {
    setBusy(true); setError('');
    try { setResult(await crm.bootstrapCommit([...picked], withContacts)); if (onDone) onDone(); } catch (e) { setError(e.message || 'Não foi possível trazer as empresas.'); } finally { setBusy(false); }
  }

  return (
    <Modal title="Trazer clientes do painel para o CRM" onClose={onClose} width="min(900px, 100%)">
      {!items && !error && <div className="crm-empty">Carregando…</div>}
      {items && !result && (
        <>
          <div className="crm-sub" style={{ marginBottom: 10 }}>Cada projeto do cronograma vira (ou se liga a) uma empresa do CRM como <b>Cliente</b>. Projetos com o mesmo CNPJ ficam na mesma empresa. Os projetos não são alterados.</div>
          {items.length === 0 && <div className="crm-empty">Todos os projetos do painel já estão no CRM.</div>}
          <div className="crm-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table className="crm-table" style={{ minWidth: 640 }}>
              <thead><tr><th style={{ width: 30 }} /><th>Empresa</th><th>CNPJ</th><th>Projetos</th><th>O que acontece</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.key} onClick={() => toggle(i.key)}>
                    <td><input type="checkbox" style={{ width: 'auto' }} checked={picked.has(i.key)} onChange={() => toggle(i.key)} onClick={(e) => e.stopPropagation()} /></td>
                    <td><span className="crm-name">{i.legalName}</span>{i.groupName && <div className="crm-muted">Grupo: {i.groupName}</div>}{i.warnings.map((w) => <div key={w} className="crm-muted" style={{ color: '#ff9f40' }}>{w}</div>)}</td>
                    <td>{i.cnpj ? fmtCnpj(i.cnpj) : <span className="crm-muted">—</span>}</td>
                    <td>{i.projects.length}</td>
                    <td>{ACTION_LABEL[i.action]}{i.existing ? <div className="crm-muted">{i.existing.legalName}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '12px 0 0' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={withContacts} onChange={(e) => setWithContacts(e.target.checked)} /> Trazer também os responsáveis cadastrados nas áreas de cada cliente como contatos
            </label>
          )}
        </>
      )}
      {result && (
        <div>
          <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} />
            <span><b>{result.created}</b> empresa(s) criada(s) · {result.linkedToExisting} ligada(s) a existentes · {result.projectsLinked} projeto(s) vinculado(s) · {result.contactsCreated} contato(s)</span></div>
          {result.failed.map((f, i) => <div key={i} className="crm-err">{f.name}: {f.message}</div>)}
        </div>
      )}
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        {!result && <button type="button" className="crm-btn" onClick={onClose}>Cancelar</button>}
        {!result && items && items.length > 0 && <button type="button" className="crm-btn crm-btn-primary" disabled={busy || picked.size === 0} onClick={run}>{busy ? 'Trazendo…' : `Trazer ${picked.size} ${picked.size === 1 ? 'empresa' : 'empresas'}`}</button>}
        {result && <button type="button" className="crm-btn crm-btn-primary" onClick={onClose}>Fechar</button>}
      </div>
    </Modal>
  );
}
