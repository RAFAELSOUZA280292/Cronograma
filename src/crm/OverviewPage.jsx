// Visão Geral do CRM. Fase 1: o que dá pra responder só com empresas/contatos
// (pipeline, receita e forecast entram na Fase 2/4). Sem gráficos — números e
// listas de atenção; cor só pra risco (PRD 50).
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { crm } from './crmApi.js';
import { REL_META, fmtDateTimeBR, daysLabel, staleColor } from './crmMeta.js';
import { CompletenessBar } from './ui.jsx';

export default function OverviewPage({ caps, refreshKey, onOpenCompany, onBootstrap }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    crm.overview().then((r) => { if (!cancelled) setData(r); }).catch((e) => { if (!cancelled) setError(e.message || 'Não foi possível carregar a visão geral.'); });
    if (caps.import) crm.bootstrapPreview().then((r) => { if (!cancelled) setPending(r.items.length); }).catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey, caps.import]);

  if (error) return <div className="crm-alert crm-alert-danger">{error}</div>;
  if (!data) return <div className="crm-empty">Carregando…</div>;
  const rel = data.companiesByRelationship;

  return (
    <div>
      <div className="crm-page-head"><div><h1 className="crm-h1">Visão geral</h1><div className="crm-sub">O retrato das contas hoje. Pipeline, receita e forecast chegam com a próxima fase.</div></div></div>

      {pending > 0 && (
        <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><strong>{pending}</strong> {pending === 1 ? 'cliente do painel ainda não está' : 'clientes do painel ainda não estão'} no CRM (empresas com projeto no cronograma).</span>
          <button type="button" className="crm-btn crm-btn-primary" onClick={onBootstrap}><Download size={14} /> Trazer para o CRM</button>
        </div>
      )}

      <div className="crm-cards">
        <div className="crm-card"><div className="crm-kpi-value">{data.totalCompanies}</div><div className="crm-kpi-label">Empresas</div>
          <div className="crm-kpi-sub">{Object.entries(rel).map(([k, n]) => `${n} ${REL_META[k].label.toLowerCase()}`).join(' · ')}</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{data.totalContacts}</div><div className="crm-kpi-label">Contatos</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ fontSize: 20 }}><CompletenessBar percent={data.avgCompleteness} /></div><div className="crm-kpi-label">Completude média</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: data.staleCount ? '#ff9f40' : undefined }}>{data.staleCount}</div><div className="crm-kpi-label">Sem interação há +30 dias</div><div className="crm-kpi-sub">clientes e prospects</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{data.noPrimaryContact}</div><div className="crm-kpi-label">Sem contato principal</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{data.noCnpj}</div><div className="crm-kpi-label">Sem CNPJ</div></div>
      </div>

      <div className="crm-two">
        <div className="crm-section">
          <h3 className="crm-section-title"><span><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Precisam de contato</span></h3>
          {data.staleCompanies.length === 0 && <div className="crm-muted">Nenhuma conta parada. Bom sinal.</div>}
          {data.staleCompanies.map((c) => (
            <button key={c.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(c.id)}>
              <span><b>{c.legalName}</b> <span className="crm-muted">· {REL_META[c.relationship].label}</span></span>
              <span style={{ color: staleColor(c.daysSinceInteraction), fontWeight: 700 }}>{daysLabel(c.daysSinceInteraction)}</span>
            </button>
          ))}
        </div>
        <div className="crm-section">
          <h3 className="crm-section-title">Cadastros mais incompletos</h3>
          {data.incompleteCompanies.length === 0 && <div className="crm-muted">Nada por aqui ainda.</div>}
          {data.incompleteCompanies.map((c) => (
            <button key={c.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(c.id)}>
              <span><b>{c.legalName}</b></span><CompletenessBar percent={c.completeness} />
            </button>
          ))}
        </div>
      </div>

      <div className="crm-section">
        <h3 className="crm-section-title">Atividade recente</h3>
        {data.recentActivity.length === 0 && <div className="crm-muted">Nada registrado ainda.</div>}
        {data.recentActivity.map((e) => (
          <button key={e.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(e.companyId, 'history')}>
            <span>{e.summary} <span className="crm-muted">· {e.companyName}</span></span><span className="crm-muted">{fmtDateTimeBR(e.occurredAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
