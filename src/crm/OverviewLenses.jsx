// Painéis da Visão geral por função (§98): Meu dia, Time, Receita e Contas. Só números e listas que levam a uma ação;
// cor só para risco. Clicar num indicador abre Negócios já filtrado (preset) — o painel nunca é beco sem saída.
import React from 'react';
import { AlertTriangle, CalendarCheck, Target, Users, Wallet, Clock } from 'lucide-react';
import { REL_META, fmtDateTimeBR, fmtDateBR, fmtMoney, daysLabel, staleColor, stageAgeColor, activityTypeLabel } from './crmMeta.js';
import { CompletenessBar } from './ui.jsx';

const money = (n) => fmtMoney(n) || 'R$ 0';
const RED = '#e2574c'; const AMBER = '#ff9f40'; const GREEN = '#3ecf6e';

function Kpi({ value, label, sub, tone, onClick, hint }) {
  const body = (<><div className="crm-kpi-value" style={{ color: tone || undefined }}>{value}</div><div className="crm-kpi-label">{label}</div>{sub && <div className="crm-kpi-sub">{sub}</div>}</>);
  if (!onClick) return <div className="crm-card">{body}</div>;
  return <button type="button" className="crm-card" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} title={hint} onClick={onClick}>{body}</button>;
}

function DealRow({ d, right, rightColor, onOpenDeal }) {
  return (
    <button type="button" className="crm-row-link" onClick={() => onOpenDeal(d.id)}>
      <span><b>{d.title}</b> <span className="crm-muted">· {d.companyName}{d.stageName ? ` · ${d.stageName}` : ''}</span></span>
      <span style={{ color: rightColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{right}</span>
    </button>
  );
}

function Panel({ title, empty, children, count }) {
  return (
    <div className="crm-section">
      <h3 className="crm-section-title"><span>{title}{count > 0 ? <span className="crm-muted" style={{ fontWeight: 600 }}> · {count}</span> : null}</span></h3>
      {count === 0 && <div className="crm-muted">{empty}</div>}
      {children}
    </div>
  );
}

const Title = ({ icon: Icon, children, action }) => (
  <h3 className="crm-section-title" style={{ marginBottom: 10 }}><span><Icon size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{children}</span>{action}</h3>
);

export function MineLens({ data, onOpenCompany, onOpenDeal, onGoDeals, onGoAgenda }) {
  const { activities: ac, deals: dl } = data;
  const mineDeals = (extra) => () => onGoDeals({ ownerId: 'me', view: 'list', ...extra });
  return (
    <div>
      <Title icon={CalendarCheck} action={<button type="button" className="crm-btn" onClick={onGoAgenda}>Abrir a agenda</button>}>Para fazer agora</Title>
      <div className="crm-cards">
        <Kpi value={ac.mineToday} label="Para hoje" tone={ac.mineToday ? AMBER : undefined} onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi value={ac.mineOverdue} label="Atrasadas" tone={ac.mineOverdue ? RED : undefined} onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi value={dl.noNextStepCount} label="Negócios sem próximo passo" sub="seus, em aberto, sem atividade agendada" tone={dl.noNextStepCount ? AMBER : undefined} onClick={mineDeals({ attention: 'nonext' })} hint="Ver na lista de negócios" />
        <Kpi value={dl.lateStepCount} label="Com passo atrasado" tone={dl.lateStepCount ? RED : undefined} onClick={mineDeals({ attention: 'late' })} hint="Ver na lista de negócios" />
      </div>
      <div className="crm-two">
        <Panel title="Hoje e atrasadas" count={ac.myDue.length} empty="Nada vencendo para você. Bom sinal.">
          {ac.myDue.map((a) => (
            <button key={a.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(a.companyId, 'activities')}>
              <span><b>{a.title}</b> <span className="crm-muted">· {activityTypeLabel(a.activityType)} · {a.companyName}</span></span>
              <span style={{ color: a.bucket === 'overdue' ? RED : AMBER, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.bucket === 'overdue' ? `venceu ${fmtDateBR(a.dueDate)}` : `hoje${a.dueTime ? ` ${a.dueTime}` : ''}`}</span>
            </button>
          ))}
        </Panel>
        <Panel title="Sem próximo passo" count={dl.noNextStep.length} empty="Todo negócio seu tem um próximo passo.">
          {dl.noNextStep.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right="agendar" rightColor={AMBER} />)}
        </Panel>
      </div>

      <Title icon={Target} action={<button type="button" className="crm-btn" onClick={mineDeals({ listStatus: 'open' })}>Abrir meus negócios</button>}>Meu funil</Title>
      <div className="crm-cards">
        <Kpi value={money(dl.openValue)} label="Em aberto" sub={`${dl.openCount} ${dl.openCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi value={money(dl.weightedValue)} label="Valor ponderado" sub="valor × probabilidade da etapa" />
        <Kpi value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'} · ${dl.lostMonthCount} perdido(s)`} />
        <Kpi value={dl.conversion90 == null ? '—' : `${dl.conversion90}%`} label="Conversão (90 dias)" sub={dl.closed90 ? `${dl.closed90} negócios fechados` : 'ainda sem fechamentos'} />
        <Kpi value={dl.slaCount} label="Prazo da etapa estourado" tone={dl.slaCount ? RED : undefined} onClick={dl.slaCount ? mineDeals({ attention: 'stalled' }) : undefined} hint="Ver os parados" />
        <Kpi value={dl.overdueCount} label="Previsão vencida" tone={dl.overdueCount ? RED : undefined} onClick={dl.overdueCount ? mineDeals({ attention: 'overdue' }) : undefined} hint="Ver na lista de negócios" />
      </div>
      <div className="crm-two">
        <Panel title="Com passo atrasado" count={dl.late.length} empty="Nenhum passo atrasado.">
          {dl.late.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`venceu ${fmtDateBR(d.nextActivityDate)}`} rightColor={RED} />)}
        </Panel>
        <Panel title="A fechar nos próximos 30 dias" count={dl.closingSoon.length} empty="Nenhum negócio seu com previsão nesse período.">
          {dl.closingSoon.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`${d.overdue ? 'venceu ' : ''}${fmtDateBR(d.expectedCloseDate)}`} rightColor={d.overdue ? RED : undefined} />)}
        </Panel>
      </div>
      <div className="crm-two">
        <Panel title="Parados na etapa" count={dl.stalled.length} empty="Nada parado. Bom sinal.">
          {dl.stalled.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`${d.daysInStage} dias`} rightColor={stageAgeColor(d.daysInStage)} />)}
        </Panel>
        <Panel title="Onde estão meus negócios" count={dl.byStage.length} empty="Você não tem negócios em aberto.">
          {dl.byStage.map((s) => (
            <div key={`${s.pipeline}-${s.stage}`} className="crm-row-link" style={{ cursor: 'default' }}>
              <span>{s.stage} <span className="crm-muted">· {s.pipeline}</span></span>
              <span style={{ whiteSpace: 'nowrap' }}><b>{s.count}</b> <span className="crm-muted">· {money(s.value)}</span></span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

export function TeamLens({ data, onOpenDeal, onGoDeals, onGoAgenda }) {
  const { activities: ac, deals: dl, owners } = data;
  const risk = (n, c = RED) => (n ? { color: c, fontWeight: 700 } : { color: 'var(--text-5)' });
  const toOwner = (o) => onGoDeals({ ownerId: o.ownerId || 'none', view: 'list' });
  return (
    <div>
      <Title icon={Target} action={<button type="button" className="crm-btn" onClick={() => onGoDeals({})}>Abrir o quadro</button>}>Funil do time</Title>
      <div className="crm-cards">
        <Kpi value={money(dl.openValue)} label="Em aberto" sub={`${dl.openCount} ${dl.openCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi value={money(dl.weightedValue)} label="Valor ponderado" sub="valor × probabilidade da etapa" />
        <Kpi value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'} · ${dl.lostMonthCount} perdido(s)`} />
        <Kpi value={dl.conversion90 == null ? '—' : `${dl.conversion90}%`} label="Conversão (90 dias)" sub={dl.closed90 ? `${dl.closed90} negócios fechados` : 'ainda sem fechamentos'} />
        <Kpi value={ac.overdueCount} label="Atividades atrasadas" tone={ac.overdueCount ? RED : undefined} sub={`${ac.todayCount} para hoje · ${ac.openCount} em aberto`} onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi value={dl.unownedCount} label="Negócios sem responsável" tone={dl.unownedCount ? AMBER : undefined} sub={dl.unownedCount ? money(dl.unownedValue) : 'todos têm dono'} onClick={dl.unownedCount ? () => onGoDeals({ ownerId: 'none', view: 'list' }) : undefined} hint="Ver na lista de negócios" />
      </div>

      <Title icon={Users}>Por responsável</Title>
      <div className="crm-table-wrap" style={{ marginBottom: 16 }}>
        <table className="crm-table">
          <thead><tr><th>Responsável</th><th className="crm-num">Em aberto</th><th className="crm-num">Ponderado</th><th className="crm-num">Sem passo</th><th className="crm-num">Passo atrasado</th><th className="crm-num">Parados +14 d</th><th className="crm-num">Ativ. atrasadas</th><th className="crm-num">Ganho no mês</th></tr></thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.ownerId || 'none'} onClick={() => toOwner(o)} style={{ cursor: 'pointer' }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') toOwner(o); }} title="Ver os negócios desta pessoa">
                <td><div className="crm-name" style={o.ownerId ? undefined : { color: AMBER }}>{o.name}</div></td>
                <td className="crm-num">{o.openCount} <span className="crm-muted">· {money(o.openValue)}</span></td>
                <td className="crm-num">{money(o.weightedValue)}</td>
                <td className="crm-num" style={risk(o.noNextStep, AMBER)}>{o.noNextStep}</td>
                <td className="crm-num" style={risk(o.lateStep)}>{o.lateStep}</td>
                <td className="crm-num" style={risk(o.stalled, AMBER)}>{o.stalled}</td>
                <td className="crm-num" style={risk(o.activitiesOverdue)}>{o.activitiesOverdue}</td>
                <td className="crm-num">{o.wonMonthCount ? <span style={{ color: GREEN, fontWeight: 700 }}>{money(o.wonMonthValue)} <span className="crm-muted">· {o.wonMonthCount}</span></span> : <span className="crm-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {owners.length === 0 && <div className="crm-empty">Nenhum negócio ou atividade em aberto no time.</div>}
      </div>

      <div className="crm-two">
        <Panel title="Parados na etapa" count={dl.stalledCount} empty="Nada parado. Bom sinal.">
          {dl.stalledDeals.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`${d.daysInStage} dias`} rightColor={stageAgeColor(d.daysInStage)} />)}
        </Panel>
        <Panel title="Prazo da etapa estourado" count={dl.slaCount} empty="Nenhuma etapa com prazo estourado.">
          {dl.slaDeals.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`${d.daysInStage}/${d.slaDays} d`} rightColor={RED} />)}
        </Panel>
      </div>
      <Panel title="Por que perdemos (90 dias)" count={data.lostReasons.length} empty="Nenhuma perda nos últimos 90 dias.">
        {data.lostReasons.map((r) => (
          <div key={r.reason || 'none'} className="crm-row-link" style={{ cursor: 'default' }}><span>{r.label}</span><span style={{ whiteSpace: 'nowrap' }}><b>{r.count}</b> <span className="crm-muted">· {money(r.value)}</span></span></div>
        ))}
      </Panel>
    </div>
  );
}

export function RevenueLens({ data, onOpenDeal, onGoDeals }) {
  const { mrr, deals: dl, forecast } = data;
  const maxW = Math.max(1, ...forecast.map((b) => b.weighted));
  return (
    <div>
      <Title icon={Wallet}>Receita recorrente (MRR)</Title>
      <div className="crm-cards">
        <Kpi value={money(mrr.wonMrr)} label="MRR contratado" sub={`${mrr.wonCount} ${mrr.wonCount === 1 ? 'negócio ganho' : 'negócios ganhos'} com MRR`} />
        <Kpi value={money(mrr.wonMonthMrr)} label="MRR ganho no mês" tone={mrr.wonMonthMrr ? GREEN : undefined} />
        <Kpi value={money(mrr.openMrr)} label="MRR em negociação" sub="soma do MRR dos negócios em aberto" />
        <Kpi value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi value={money(dl.won90Value)} label="Ganho em 90 dias" sub={`${dl.won90Count} negócios · conversão ${dl.conversion90 == null ? '—' : `${dl.conversion90}%`}`} />
        <Kpi value={money(dl.weightedValue)} label="Valor ponderado" sub={`${money(dl.openValue)} em aberto`} />
      </div>
      <Title icon={Clock}>Previsão de fechamento</Title>
      <div className="crm-table-wrap" style={{ marginBottom: 16 }}>
        <table className="crm-table">
          <thead><tr><th>Período</th><th className="crm-num">Negócios</th><th className="crm-num">Valor</th><th className="crm-num">Ponderado</th><th className="crm-num">MRR</th></tr></thead>
          <tbody>
            {forecast.map((b) => {
              const link = b.count && (b.key === 'overdue' ? () => onGoDeals({ attention: 'overdue', view: 'list' }) : null);
              return (
                <tr key={b.key} onClick={link || undefined} style={link ? { cursor: 'pointer' } : undefined} tabIndex={link ? 0 : undefined} onKeyDown={link ? (e) => { if (e.key === 'Enter') link(); } : undefined}>
                  <td><div className="crm-name" style={{ color: b.count ? (b.tone === 'late' ? RED : b.tone === 'warn' ? AMBER : undefined) : 'var(--text-5)' }}>{b.label}</div></td>
                  <td className="crm-num">{b.count || <span className="crm-muted">—</span>}</td>
                  <td className="crm-num">{b.count ? money(b.value) : <span className="crm-muted">—</span>}</td>
                  <td className="crm-num">{b.count ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}><span aria-hidden="true" style={{ display: 'inline-block', height: 6, width: Math.max(2, Math.round((b.weighted / maxW) * 90)), borderRadius: 3, background: b.tone === 'late' ? RED : '#F5C400' }} />{money(b.weighted)}</span>) : <span className="crm-muted">—</span>}</td>
                  <td className="crm-num">{b.mrr ? money(b.mrr) : <span className="crm-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {dl.noValueCount > 0 && <div className="crm-muted" style={{ padding: '8px 12px', fontSize: 12 }}>{dl.noValueCount} negócio(s) em aberto estão sem valor e não entram nos totais.</div>}
      </div>
      <div className="crm-two">
        <Panel title="Maior peso no funil" count={data.topWeighted.length} empty="Nenhum negócio em aberto.">
          {data.topWeighted.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={`${money(d.weightedValue)} · ${d.probability}%`} />)}
        </Panel>
        <Panel title="Ganhos por origem (90 dias)" count={data.wonBySource.length} empty="Nenhum ganho nos últimos 90 dias.">
          {data.wonBySource.map((s) => (
            <div key={s.source} className="crm-row-link" style={{ cursor: 'default' }}><span>{s.source}</span><span style={{ whiteSpace: 'nowrap' }}><b>{money(s.value)}</b> <span className="crm-muted">· {s.count}</span></span></div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

export function AccountsLens({ data, onOpenCompany }) {
  const rel = data.companiesByRelationship;
  return (
    <div>
      <h3 className="crm-section-title" style={{ margin: '4px 0 10px' }}>Contas</h3>
      <div className="crm-cards">
        <Kpi value={data.totalCompanies} label="Empresas" sub={Object.entries(rel).map(([k, n]) => `${n} ${REL_META[k].label.toLowerCase()}`).join(' · ')} />
        <Kpi value={data.totalContacts} label="Contatos" />
        <div className="crm-card"><div className="crm-kpi-value" style={{ fontSize: 20 }}><CompletenessBar percent={data.avgCompleteness} /></div><div className="crm-kpi-label">Completude média</div></div>
        <Kpi value={data.staleCount} label="Sem interação há +30 dias" sub="clientes e prospects" tone={data.staleCount ? AMBER : undefined} />
        <Kpi value={data.noPrimaryContact} label="Sem contato principal" />
        <Kpi value={data.noCnpj} label="Sem CNPJ" />
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
