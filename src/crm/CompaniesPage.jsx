// Lista de empresas (PRD 7) — filtros, busca, paginação. Clique abre a ficha.
import React, { useEffect, useState } from 'react';
import { Plus, Upload, Building2 } from 'lucide-react';
import { crm } from './crmApi.js';
import { RelPill, CompletenessBar } from './ui.jsx';
import { fmtCnpj, daysLabel, staleColor } from './crmMeta.js';
import BulkOwner from './BulkOwner.jsx';
import { activateRow } from '../ui/index.jsx';
import { useRowSelection, useColumns, SelectHeadCell, SelectCell, BulkBar, ColumnPicker } from '../ui/tableKit.jsx';

const PAGE = 50;
const COLS = [
  { key: 'name', label: 'Empresa', hideable: false }, { key: 'rel', label: 'Relação' }, { key: 'segment', label: 'Segmento' }, { key: 'city', label: 'Cidade / UF' },
  { key: 'owner', label: 'Responsável' }, { key: 'contact', label: 'Contato principal' }, { key: 'last', label: 'Última interação' }, { key: 'complete', label: 'Completude' },
];

export default function CompaniesPage({ caps, options, refreshKey, onOpenCompany, onNewCompany, onImport }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState({ relationship: '', ownerId: '', state: '', taxRegime: '', source: '' });
  const [showDeleted, setShowDeleted] = useState(false);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setOffset(0); }, 300); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crm.companies({ q: debouncedQ, ...filters, deleted: showDeleted ? 'true' : '', limit: PAGE, offset })
      .then((r) => { if (!cancelled) { setData(r); setError(''); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Não foi possível carregar as empresas.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [debouncedQ, filters, showDeleted, offset, refreshKey, reloadTick]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setOffset(0); };
  const owners = (options && options.owners) || [];
  const sel = useRowSelection(data.items, (c) => c.id);
  const cols = useColumns('crm-companies', COLS);
  const colOn = (k) => cols.visible.some((c) => c.key === k);
  const canBulk = caps.write && !showDeleted;
  const hasFilter = debouncedQ || Object.values(filters).some(Boolean);

  return (
    <div>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Empresas</h1><div className="crm-sub">Toda empresa é uma conta: contatos, projetos e histórico ficam presos a ela.</div></div>
        <div className="crm-actions">
          {caps.import && <button type="button" className="crm-btn" onClick={onImport}><Upload size={14} /> Importar planilha</button>}
          {caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={onNewCompany}><Plus size={14} /> Criar empresa</button>}
        </div>
      </div>

      <div className="crm-filters">
        <input aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, CNPJ ou cidade…" style={{ minWidth: 240 }} />
        <select aria-label="Filtrar por relacionamento" value={filters.relationship} onChange={(e) => setF('relationship', e.target.value)}>
          <option value="">Toda relação</option>{((options && options.relationships) || []).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select aria-label="Filtrar por responsável" value={filters.ownerId} onChange={(e) => setF('ownerId', e.target.value)}>
          <option value="">Todo responsável</option><option value="none">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select aria-label="Filtrar por regime tributário" value={filters.taxRegime} onChange={(e) => setF('taxRegime', e.target.value)}>
          <option value="">Todo regime</option>{((options && options.taxRegimes) || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input aria-label="Filtrar por UF" value={filters.state} onChange={(e) => setF('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" style={{ width: 60 }} />
        {caps.admin && <label className="crm-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setOffset(0); }} style={{ width: 'auto' }} /> Ver excluídas</label>}
        {hasFilter && <button type="button" className="crm-btn" onClick={() => { setQ(''); setFilters({ relationship: '', ownerId: '', state: '', taxRegime: '', source: '' }); }}>Limpar</button>}
      </div>

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      <div className="crm-actions" style={{ justifyContent: 'flex-end', marginBottom: 'var(--sp-2)' }}>
        <ColumnPicker columns={COLS} hidden={cols.hidden} onToggle={cols.toggle} onReset={cols.reset} />
      </div>
      {canBulk && (
        <BulkBar count={sel.count} noun={{ one: 'empresa selecionada', many: 'empresas selecionadas' }} onClear={sel.clear}>
          <BulkOwner rows={sel.selectedRows} owners={owners} noun={{ one: 'empresa', many: 'empresas' }} can={() => true}
            update={(c, ownerId) => crm.updateCompany(c.id, { ownerId })} onDone={() => setReloadTick((n) => n + 1)} />
        </BulkBar>
      )}
      <div className="crm-table-wrap ui-tk-sticky">
        <table className="crm-table">
          <thead><tr>
            {canBulk && <SelectHeadCell state={sel.header} onToggle={sel.toggleAllRows} />}
            <th>Empresa</th>{colOn('rel') && <th>Relação</th>}{colOn('segment') && <th>Segmento</th>}{colOn('city') && <th>Cidade / UF</th>}{colOn('owner') && <th>Responsável</th>}
            {colOn('contact') && <th>Contato principal</th>}{colOn('last') && <th>Última interação</th>}{colOn('complete') && <th>Completude</th>}
          </tr></thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} className={sel.isSelected(c.id) ? 'ui-tk-on' : undefined} {...activateRow(() => onOpenCompany(c.id))}>
                {canBulk && <SelectCell checked={sel.isSelected(c.id)} onCheck={(e) => sel.onRowCheck(c.id, e)} label={`Selecionar ${c.legalName}`} />}
                <td><div className="crm-name">{c.legalName}</div><div className="crm-muted">{[c.tradeName, c.cnpj ? fmtCnpj(c.cnpj) : ''].filter(Boolean).join(' · ')}</div></td>
                {colOn('rel') && <td><RelPill value={c.relationship} /></td>}
                {colOn('segment') && <td>{c.segment}</td>}
                {colOn('city') && <td>{[c.city, c.state].filter(Boolean).join(' / ')}</td>}
                {colOn('owner') && <td>{c.ownerName}</td>}
                {colOn('contact') && <td>{c.stats.primaryContactName || <span className="crm-muted">—</span>}</td>}
                {colOn('last') && <td style={{ color: staleColor(c.stats.daysSinceInteraction), fontWeight: 600 }}>{daysLabel(c.stats.daysSinceInteraction)}</td>}
                {colOn('complete') && <td><CompletenessBar percent={c.completeness.percent} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 && (
          <div className="crm-empty">
            <Building2 size={26} style={{ opacity: .5 }} />
            <div style={{ marginTop: 8 }}>{hasFilter ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa cadastrada ainda.'}</div>
            {!hasFilter && caps.write && <div style={{ marginTop: 10 }}><button type="button" className="crm-btn crm-btn-primary" onClick={onNewCompany}><Plus size={14} /> Criar a primeira empresa</button></div>}
          </div>
        )}
        {loading && <div className="crm-empty">Carregando…</div>}
      </div>
      <div className="crm-pager">
        <span>{data.total} {data.total === 1 ? 'empresa' : 'empresas'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="crm-btn" disabled={offset === 0} title={offset === 0 ? 'Você já está na primeira página' : undefined} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
          <button type="button" className="crm-btn" disabled={offset + PAGE >= data.total} title={offset + PAGE >= data.total ? 'Esta é a última página' : undefined} onClick={() => setOffset(offset + PAGE)}>Próxima</button>
        </span>
      </div>
    </div>
  );
}
