// Lista de contatos (PRD 10). Papel na decisão e força do relacionamento à vista.
import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { crm } from './crmApi.js';
import { DECISION_ROLES, roleLabel, STRENGTH_META, INFLUENCE_LABELS } from './crmMeta.js';

const PAGE = 50;

export default function ContactsPage({ caps, refreshKey, onOpenCompany, onNewContact, onEditContact }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setOffset(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crm.contacts({ q: debouncedQ, decisionRole: role, limit: PAGE, offset })
      .then((r) => { if (!cancelled) { setData(r); setError(''); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar os contatos.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [debouncedQ, role, offset, refreshKey]);

  return (
    <div>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Contatos</h1><div className="crm-sub">Em venda B2B, quem decide importa mais que quem atende o telefone — o papel de cada pessoa fica visível aqui.</div></div>
        {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={onNewContact}><Plus size={14} /> Novo contato</button>}
      </div>
      <div className="crm-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail, telefone ou empresa…" style={{ minWidth: 260 }} />
        <select value={role} onChange={(e) => { setRole(e.target.value); setOffset(0); }}>
          <option value="">Todo papel na decisão</option>{DECISION_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead><tr><th>Nome</th><th>Empresa</th><th>Cargo</th><th>Papel na decisão</th><th>Influência</th><th>Relacionamento</th><th>E-mail</th><th>Telefone</th></tr></thead>
          <tbody>
            {data.items.map((c) => {
              const st = STRENGTH_META[c.relationshipStrength];
              return (
                <tr key={c.id} onClick={() => (caps.write ? onEditContact(c) : onOpenCompany(c.companyId, 'contacts'))}>
                  <td><span className="crm-name">{`${c.firstName} ${c.lastName}`.trim()}</span>{c.isPrimary && ' ★'}</td>
                  <td onClick={(e) => { e.stopPropagation(); onOpenCompany(c.companyId, 'contacts'); }}><span style={{ textDecoration: 'underline', textDecorationColor: 'var(--border-3)' }}>{c.companyName}</span></td>
                  <td>{c.jobTitle || c.department}</td>
                  <td>{roleLabel(c.decisionRole)}</td>
                  <td>{INFLUENCE_LABELS[c.influence] || ''}</td>
                  <td>{st ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="crm-dot" style={{ background: st.color }} />{st.label}</span> : ''}</td>
                  <td>{c.email}</td><td>{c.phone || c.whatsapp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && data.items.length === 0 && <div className="crm-empty">Nenhum contato encontrado.</div>}
        {loading && <div className="crm-empty">Carregando…</div>}
      </div>
      <div className="crm-pager">
        <span>{data.total} {data.total === 1 ? 'contato' : 'contatos'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="crm-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
          <button type="button" className="crm-btn" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Próxima</button>
        </span>
      </div>
    </div>
  );
}
