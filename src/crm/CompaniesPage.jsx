// Lista de empresas (PRD 7) — filtros, busca, paginação. Clique abre a ficha.
import React, { useEffect, useState } from 'react';
import { Plus, Upload, Building2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { RelPill, CompletenessBar } from './ui.jsx';
import { fmtCnpj, daysLabel, staleColor } from './crmMeta.js';

const PAGE = 50;

export default function CompaniesPage({ caps, options, refreshKey, onOpenCompany, onNewCompany, onImport }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState({ relationship: '', ownerId: '', state: '', taxRegime: '', source: '' });
  const [showDeleted, setShowDeleted] = useState(false);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setOffset(0); }, 300); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crm.companies({ q: debouncedQ, ...filters, deleted: showDeleted ? 'true' : '', limit: PAGE, offset })
      .then((r) => { if (!cancelled) { setData(r); setError(''); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar as empresas.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [debouncedQ, filters, showDeleted, offset, refreshKey]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setOffset(0); };
  const owners = (options && options.owners) || [];
  const hasFilter = debouncedQ || Object.values(filters).some(Boolean);

  return (
    <div>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Empresas</h1><div className="crm-sub">Toda empresa é uma conta: contatos, projetos e histórico ficam presos a ela.</div></div>
        <div className="crm-actions">
          {caps.import && <button type="button" className="crm-btn" onClick={onImport}><Upload size={14} /> Importar planilha</button>}
          {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={onNewCompany}><Plus size={14} /> Nova empresa</button>}
        </div>
      </div>

      <div className="crm-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, CNPJ ou cidade…" style={{ minWidth: 240 }} />
        <select value={filters.relationship} onChange={(e) => setF('relationship', e.target.value)}>
          <option value="">Toda relação</option>{((options && options.relationships) || []).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filters.ownerId} onChange={(e) => setF('ownerId', e.target.value)}>
          <option value="">Todo responsável</option><option value="none">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={filters.taxRegime} onChange={(e) => setF('taxRegime', e.target.value)}>
          <option value="">Todo regime</option>{((options && options.taxRegimes) || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={filters.state} onChange={(e) => setF('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" style={{ width: 60 }} />
        {caps.admin && <label className="crm-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setOffset(0); }} style={{ width: 'auto' }} /> Ver excluídas</label>}
        {hasFilter && <button type="button" className="crm-btn" onClick={() => { setQ(''); setFilters({ relationship: '', ownerId: '', state: '', taxRegime: '', source: '' }); }}>Limpar</button>}
      </div>

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead><tr><th>Empresa</th><th>Relação</th><th>Segmento</th><th>Cidade / UF</th><th>Responsável</th><th>Contato principal</th><th>Última interação</th><th>Completude</th></tr></thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} onClick={() => onOpenCompany(c.id)}>
                <td><div className="crm-name">{c.legalName}</div><div className="crm-muted">{[c.tradeName, c.cnpj ? fmtCnpj(c.cnpj) : ''].filter(Boolean).join(' · ')}</div></td>
                <td><RelPill value={c.relationship} /></td>
                <td>{c.segment}</td>
                <td>{[c.city, c.state].filter(Boolean).join(' / ')}</td>
                <td>{c.ownerName}</td>
                <td>{c.stats.primaryContactName || <span className="crm-muted">—</span>}</td>
                <td style={{ color: staleColor(c.stats.daysSinceInteraction), fontWeight: 600 }}>{daysLabel(c.stats.daysSinceInteraction)}</td>
                <td><CompletenessBar percent={c.completeness.percent} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 && (
          <div className="crm-empty">
            <Building2 size={26} style={{ opacity: .5 }} />
            <div style={{ marginTop: 8 }}>{hasFilter ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa cadastrada ainda.'}</div>
            {!hasFilter && caps.write && <div style={{ marginTop: 10 }}><button type="button" className="crm-btn crm-btn-primary" onClick={onNewCompany}><Plus size={14} /> Cadastrar a primeira</button></div>}
          </div>
        )}
        {loading && <div className="crm-empty">Carregando…</div>}
      </div>
      <div className="crm-pager">
        <span>{data.total} {data.total === 1 ? 'empresa' : 'empresas'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="crm-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
          <button type="button" className="crm-btn" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Próxima</button>
        </span>
      </div>
    </div>
  );
}
