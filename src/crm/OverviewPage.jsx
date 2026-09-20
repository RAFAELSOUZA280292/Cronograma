// Visão Geral do CRM. Fase 1: empresas/contatos. Fase 2: bloco de funil (aberto,
// ponderado, upsell, ganhos do mês, conversão) e listas de atenção de negócios.
// Forecast por período, metas e gráficos entram na Fase 4. Sem gráficos — números
// e listas; cor só pra risco (PRD 50).
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, Target, CalendarCheck } from 'lucide-react';
import { crm } from './crmApi.js';
import { REL_META, fmtDateTimeBR, fmtDateBR, fmtMoney, daysLabel, staleColor, stageAgeColor, activityTypeLabel } from './crmMeta.js';
import { CompletenessBar } from './ui.jsx';

export default function OverviewPage({ caps, refreshKey, onOpenCompany, onOpenDeal, onBootstrap, onGoDeals, onGoAgenda }) {
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
  const dl = data.deals;
  const ac = data.activities;
  const money = (n) => fmtMoney(n) || 'R$ 0';

  return (
    <div>
      <div className="crm-page-head"><div><h1 className="crm-h1">Visão geral</h1><div className="crm-sub">O retrato das contas e do funil hoje. Metas e forecast por período chegam com a fase de inteligência.</div></div></div>

      {pending > 0 && (
        <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><strong>{pending}</strong> {pending === 1 ? 'cliente do painel ainda não está' : 'clientes do painel ainda não estão'} no CRM (empresas com projeto no cronograma).</span>
          <button type="button" className="crm-btn crm-btn-primary" onClick={onBootstrap}><Download size={14} /> Trazer para o CRM</button>
        </div>
      )}

      <h3 className="crm-section-title" style={{ marginBottom: 10 }}><span><CalendarCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Próximos passos</span>
        <button type="button" className="crm-btn" onClick={onGoAgenda}>Abrir a agenda</button></h3>
      <div className="crm-cards">
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: ac.mineToday ? '#ff9f40' : undefined }}>{ac.mineToday}</div><div className="crm-kpi-label">Minhas para hoje</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: ac.mineOverdue ? '#e2574c' : undefined }}>{ac.mineOverdue}</div><div className="crm-kpi-label">Minhas atrasadas</div><div className="crm-kpi-sub">{ac.overdueCount} atrasada(s) no time todo</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{ac.openCount}</div><div className="crm-kpi-label">Atividades em aberto</div><div className="crm-kpi-sub">{ac.todayCount} para hoje no time</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: ac.dealsNoNextStep ? '#ff9f40' : undefined }}>{ac.dealsNoNextStep}</div><div className="crm-kpi-label">Negócios sem próximo passo</div><div className="crm-kpi-sub">em aberto e sem atividade agendada</div></div>
      </div>
      {(ac.myDue.length > 0 || ac.dealsNoNextStepList.length > 0) && (
        <div className="crm-two">
          <div className="crm-section">
            <h3 className="crm-section-title">Minhas: hoje e atrasadas</h3>
            {ac.myDue.length === 0 && <div className="crm-muted">Nada vencendo para você. Bom sinal.</div>}
            {ac.myDue.map((a) => (
              <button key={a.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(a.companyId, 'activities')}>
                <span><b>{a.title}</b> <span className="crm-muted">· {activityTypeLabel(a.activityType)} · {a.companyName}</span></span>
                <span style={{ color: a.bucket === 'overdue' ? '#e2574c' : '#ff9f40', fontWeight: 700, whiteSpace: 'nowrap' }}>{a.bucket === 'overdue' ? `venceu ${fmtDateBR(a.dueDate)}` : `hoje${a.dueTime ? ` ${a.dueTime}` : ''}`}</span>
              </button>
            ))}
          </div>
          <div className="crm-section">
            <h3 className="crm-section-title">Negócios sem próximo passo</h3>
            {ac.dealsNoNextStepList.length === 0 && <div className="crm-muted">Todo negócio em aberto tem um próximo passo.</div>}
            {ac.dealsNoNextStepList.map((d) => (
              <button key={d.id} type="button" className="crm-row-link" onClick={() => onOpenDeal(d.id)}>
                <span><b>{d.title}</b> <span className="crm-muted">· {d.companyName} · {d.stageName}</span></span>
                <span className="crm-muted" style={{ whiteSpace: 'nowrap' }}>{d.daysOpen === 0 ? 'criado hoje' : `há ${d.daysOpen} ${d.daysOpen === 1 ? 'dia' : 'dias'}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <h3 className="crm-section-title" style={{ marginBottom: 10 }}><span><Target size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Funil comercial</span>
        <button type="button" className="crm-btn" onClick={onGoDeals}>Abrir o quadro</button></h3>
      <div className="crm-cards">
        <div className="crm-card"><div className="crm-kpi-value">{money(dl.openValue)}</div><div className="crm-kpi-label">Em aberto</div><div className="crm-kpi-sub">{dl.openCount} {dl.openCount === 1 ? 'negócio' : 'negócios'}</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{money(dl.weightedValue)}</div><div className="crm-kpi-label">Valor ponderado</div><div className="crm-kpi-sub">valor × probabilidade da etapa</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: dl.upsellCount ? '#b98af5' : undefined }}>{money(dl.upsellValue)}</div><div className="crm-kpi-label">Upsell em aberto</div><div className="crm-kpi-sub">{dl.upsellCount} {dl.upsellCount === 1 ? 'oportunidade' : 'oportunidades'} em clientes</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: dl.wonMonthCount ? '#3ecf6e' : undefined }}>{money(dl.wonMonthValue)}</div><div className="crm-kpi-label">Ganho no mês</div><div className="crm-kpi-sub">{dl.wonMonthCount} {dl.wonMonthCount === 1 ? 'negócio' : 'negócios'} · {dl.lostMonthCount} perdido(s)</div></div>
        <div className="crm-card"><div className="crm-kpi-value">{dl.conversion90 == null ? '—' : `${dl.conversion90}%`}</div><div className="crm-kpi-label">Conversão (90 dias)</div><div className="crm-kpi-sub">{dl.closed90 ? `${dl.closed90} negócios fechados` : 'ainda sem fechamentos'}</div></div>
        <div className="crm-card"><div className="crm-kpi-value" style={{ color: dl.overdueCount ? '#e2574c' : undefined }}>{dl.overdueCount}</div><div className="crm-kpi-label">Previsão vencida</div><div className="crm-kpi-sub">{dl.stalledCount} parado(s) há +14 dias</div></div>
      </div>
      {(dl.closingSoon.length > 0 || dl.stalledDeals.length > 0) && (
        <div className="crm-two">
          <div className="crm-section">
            <h3 className="crm-section-title">A fechar nos próximos 30 dias</h3>
            {dl.closingSoon.length === 0 && <div className="crm-muted">Nenhum negócio com previsão nesse período.</div>}
            {dl.closingSoon.map((d) => (
              <button key={d.id} type="button" className="crm-row-link" onClick={() => onOpenDeal(d.id)}>
                <span><b>{d.title}</b> <span className="crm-muted">· {d.companyName} · {d.stageName}</span></span>
                <span style={{ color: d.overdue ? '#e2574c' : undefined, fontWeight: 700, whiteSpace: 'nowrap' }}>{d.overdue ? 'venceu ' : ''}{fmtDateBR(d.expectedCloseDate)}</span>
              </button>
            ))}
          </div>
          <div className="crm-section">
            <h3 className="crm-section-title">Parados na etapa</h3>
            {dl.stalledDeals.length === 0 && <div className="crm-muted">Nada parado. Bom sinal.</div>}
            {dl.stalledDeals.map((d) => (
              <button key={d.id} type="button" className="crm-row-link" onClick={() => onOpenDeal(d.id)}>
                <span><b>{d.title}</b> <span className="crm-muted">· {d.companyName} · {d.stageName}</span></span>
                <span style={{ color: stageAgeColor(d.daysInStage), fontWeight: 700, whiteSpace: 'nowrap' }}>{d.daysInStage} dias</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <h3 className="crm-section-title" style={{ margin: '4px 0 10px' }}>Contas</h3>
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
