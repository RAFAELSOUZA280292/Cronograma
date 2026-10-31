// Painéis da Visão geral por função (§98): Meu dia, Time, Receita e Contas. Só números e listas que levam a uma ação;
// cor só para risco. Clicar num indicador abre Negócios já filtrado (preset) — o painel nunca é beco sem saída.
import React from 'react';
import { AlertTriangle, BadgeCheck, BarChart3, Building2, CalendarCheck, CalendarX, ChevronRight, CircleDollarSign, Clock, FileText, Hourglass, Layers, Mail, MapPin, MessageCircle, Percent, Phone, Repeat, CheckSquare, Target, TrendingUp, UserX, Users, Video, Wallet } from 'lucide-react';
import { REL_META, ACTIVITY_COLORS, fmtDateTimeBR, fmtDateBR, fmtMoney, daysLabel, staleColor, stageAgeColor, activityTypeLabel } from './crmMeta.js';
import { CompletenessBar } from './ui.jsx';

const money = (n) => fmtMoney(n) || 'R$ 0';
const RED = '#e2574c'; const AMBER = '#ff9f40'; const GREEN = '#3ecf6e';

const BLUE = '#3b82f6'; const PURPLE = '#8b5cf6';
const TYPE_ICON = { task: CheckSquare, call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle, visit: MapPin, followup: Repeat };

const daysAgo = (iso) => {
  if (!iso) return 0;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const t = new Date();
  return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(y, m - 1, d)) / 864e5);
};
const plural = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

function When({ color, text, days }) {
  const dot = color && !String(color).startsWith('var(');
  return (
    <span className="crm-when">
      {dot && <i className="crm-when-dot" style={{ background: color }} aria-hidden="true" />}
      <span className="crm-when-text">{text}</span>
      {days > 0 && <b className="crm-when-days" title={`Atraso de ${plural(days)}`}>{plural(days)}</b>}
    </span>
  );
}

function Kpi({ value, label, sub, tone, onClick, hint, icon: Icon, accent, featured }) {
  const color = tone || accent;
  const body = (
    <>
      {Icon && <span className="crm-kpi-ico" style={{ '--ico': color }} aria-hidden="true"><Icon size={20} /></span>}
      <span className="crm-kpi-body">
        <span className={`crm-kpi-value${featured ? ' featured' : ''}`} style={{ color: tone || undefined }}>{value}</span>
        <span className="crm-kpi-label">{label}</span>
        {sub && <span className="crm-kpi-sub">{sub}</span>}
      </span>
      {onClick && <ChevronRight size={16} className="crm-kpi-go" aria-hidden="true" />}
    </>
  );
  if (!onClick) return <div className="crm-card crm-kpi">{body}</div>;
  return <button type="button" className="crm-card crm-kpi crm-kpi-click" title={hint} onClick={onClick}>{body}</button>;
}

function DealRow({ d, right, onOpenDeal }) {
  return (
    <button type="button" className="crm-row-link" onClick={() => onOpenDeal(d.id)}>
      <span className="crm-row-main">
        <span className="crm-row-ico" aria-hidden="true"><Building2 size={15} /></span>
        <span className="crm-row-text"><b>{d.title}</b> <span className="crm-muted">· {d.companyName}{d.stageName ? ` · ${d.stageName}` : ''}</span></span>
      </span>
      <span className="crm-row-right">{right}<ChevronRight size={15} className="crm-row-go" aria-hidden="true" /></span>
    </button>
  );
}

function Panel({ title, empty, children, count, icon: Icon, more }) {
  return (
    <div className="crm-section">
      <h3 className="crm-section-title">
        <span className="crm-panel-t">{Icon && <Icon size={15} aria-hidden="true" />}{title}{count > 0 ? <span className="crm-muted" style={{ fontWeight: 600 }}> · {count}</span> : null}</span>
        {more && count > 0 && <button type="button" className="crm-more" onClick={more.onClick}>{more.label}<ChevronRight size={14} aria-hidden="true" /></button>}
      </h3>
      {count === 0 && <div className="crm-muted">{empty}</div>}
      {children}
    </div>
  );
}

const Title = ({ icon: Icon, children, action }) => (
  <h3 className="crm-section-title crm-title" style={{ marginBottom: 10 }}><span className="crm-panel-t"><Icon size={14} aria-hidden="true" />{children}</span>{action}</h3>
);

export function MineLens({ data, onOpenCompany, onOpenDeal, onGoDeals, onGoAgenda }) {
  const { activities: ac, deals: dl } = data;
  const mineDeals = (extra) => () => onGoDeals({ ownerId: 'me', view: 'list', ...extra });
  return (
    <div>
      <Title icon={CalendarCheck} action={<button type="button" className="crm-btn" onClick={onGoAgenda}>Abrir a agenda</button>}>Para fazer agora</Title>
      <div className="crm-cards">
        <Kpi icon={CalendarCheck} accent={BLUE} value={ac.mineToday} label="Para hoje" onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi icon={Clock} value={ac.mineOverdue} label="Atrasadas" tone={ac.mineOverdue ? RED : undefined} onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi icon={Layers} value={dl.noNextStepCount} label="Negócios sem próximo passo" sub="seus, em aberto, sem atividade agendada" tone={dl.noNextStepCount ? AMBER : undefined} onClick={mineDeals({ attention: 'nonext' })} hint="Ver na lista de negócios" />
        <Kpi icon={AlertTriangle} value={dl.lateStepCount} label="Com passo atrasado" tone={dl.lateStepCount ? RED : undefined} onClick={mineDeals({ attention: 'late' })} hint="Ver na lista de negócios" />
      </div>
      <div className="crm-two">
        <Panel icon={CalendarCheck} title="Hoje e atrasadas" count={ac.myDue.length} empty="Nada vencendo hoje." more={{ label: 'Ver todas', onClick: onGoAgenda }}>
          {ac.myDue.map((a) => {
            const Ico = TYPE_ICON[a.activityType] || CheckSquare;
            return (
              <button key={a.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(a.companyId, 'activities')}>
                <span className="crm-row-main">
                  <span className="crm-row-ico" style={{ '--ico': ACTIVITY_COLORS[a.activityType] }} aria-hidden="true"><Ico size={15} /></span>
                  <span className="crm-row-text crm-row-two"><b>{a.title}</b><span className="crm-muted">{activityTypeLabel(a.activityType)} · {a.companyName}</span></span>
                </span>
                <span className="crm-row-right">{a.bucket === 'overdue' ? <When color={RED} text={fmtDateBR(a.dueDate)} days={daysAgo(a.dueDate)} /> : <When color={AMBER} text={`hoje${a.dueTime ? ` ${a.dueTime}` : ''}`} />}<ChevronRight size={15} className="crm-row-go" aria-hidden="true" /></span>
              </button>
            );
          })}
        </Panel>
        <Panel icon={Layers} title="Sem próximo passo" count={dl.noNextStep.length} empty="Todo negócio seu tem um próximo passo." more={{ label: 'Ver todos', onClick: mineDeals({ attention: 'nonext' }) }}>
          {dl.noNextStep.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<When color={AMBER} text="agendar" />} />)}
        </Panel>
      </div>

      <Title icon={Target} action={<button type="button" className="crm-btn" onClick={mineDeals({ listStatus: 'open' })}>Abrir meus negócios</button>}>Meu funil</Title>
      <div className="crm-cards crm-cards-six">
        <Kpi featured icon={BarChart3} accent={BLUE} value={money(dl.openValue)} label="Em aberto" sub={`${dl.openCount} ${dl.openCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi featured icon={CircleDollarSign} accent={PURPLE} value={money(dl.weightedValue)} label="Valor ponderado" sub="valor × probabilidade da etapa" />
        <Kpi icon={BadgeCheck} accent={GREEN} value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'} · ${dl.lostMonthCount} perdido(s)`} />
        <Kpi icon={Percent} accent={AMBER} value={dl.conversion90 == null ? '—' : `${dl.conversion90}%`} label="Conversão (90 dias)" sub={dl.closed90 ? `${dl.closed90} negócios fechados` : 'ainda sem fechamentos'} />
        <Kpi icon={Hourglass} value={dl.slaCount} label="Prazo da etapa estourado" tone={dl.slaCount ? RED : undefined} onClick={dl.slaCount ? mineDeals({ attention: 'stalled' }) : undefined} hint="Ver os parados" />
        <Kpi icon={CalendarX} value={dl.overdueCount} label="Previsão vencida" tone={dl.overdueCount ? RED : undefined} onClick={dl.overdueCount ? mineDeals({ attention: 'overdue' }) : undefined} hint="Ver na lista de negócios" />
      </div>
      <div className="crm-two">
        <Panel icon={AlertTriangle} title="Com passo atrasado" count={dl.late.length} empty="Nenhum passo atrasado.">
          {dl.late.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<When color={RED} text={fmtDateBR(d.nextActivityDate)} days={daysAgo(d.nextActivityDate)} />} />)}
        </Panel>
        <Panel icon={CalendarX} title="A fechar nos próximos 30 dias" count={dl.closingSoon.length} empty="Nenhum negócio seu com previsão nesse período.">
          {dl.closingSoon.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={d.overdue ? <When color={RED} text={fmtDateBR(d.expectedCloseDate)} days={daysAgo(d.expectedCloseDate)} /> : <When text={fmtDateBR(d.expectedCloseDate)} />} />)}
        </Panel>
      </div>
      <div className="crm-two">
        <Panel icon={Hourglass} title="Parados na etapa" count={dl.stalled.length} empty="Nada parado nas etapas.">
          {dl.stalled.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<When color={stageAgeColor(d.daysInStage)} text={plural(d.daysInStage)} />} />)}
        </Panel>
        <Panel icon={Target} title="Onde estão meus negócios" count={dl.byStage.length} empty="Você não tem negócios em aberto.">
          {dl.byStage.map((s) => (
            <div key={`${s.pipeline}-${s.stage}`} className="crm-row-link" style={{ cursor: 'default' }}>
              <span>{s.stage} <span className="crm-muted">· {s.pipeline}</span></span>
              <span className="crm-stage-num"><b>{s.count}</b><span className="crm-muted">{money(s.value)}</span></span>
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
      <div className="crm-cards crm-cards-six">
        <Kpi featured icon={BarChart3} accent={BLUE} value={money(dl.openValue)} label="Em aberto" sub={`${dl.openCount} ${dl.openCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi featured icon={CircleDollarSign} accent={PURPLE} value={money(dl.weightedValue)} label="Valor ponderado" sub="valor × probabilidade da etapa" />
        <Kpi icon={BadgeCheck} accent={GREEN} value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'} · ${dl.lostMonthCount} perdido(s)`} />
        <Kpi icon={Percent} accent={AMBER} value={dl.conversion90 == null ? '—' : `${dl.conversion90}%`} label="Conversão (90 dias)" sub={dl.closed90 ? `${dl.closed90} negócios fechados` : 'ainda sem fechamentos'} />
        <Kpi icon={Clock} value={ac.overdueCount} label="Atividades atrasadas" tone={ac.overdueCount ? RED : undefined} sub={`${ac.todayCount} para hoje · ${ac.openCount} em aberto`} onClick={onGoAgenda} hint="Abrir a agenda" />
        <Kpi icon={UserX} value={dl.unownedCount} label="Negócios sem responsável" tone={dl.unownedCount ? AMBER : undefined} sub={dl.unownedCount ? money(dl.unownedValue) : 'todos têm dono'} onClick={dl.unownedCount ? () => onGoDeals({ ownerId: 'none', view: 'list' }) : undefined} hint="Ver na lista de negócios" />
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
        <Panel icon={Hourglass} title="Parados na etapa" count={dl.stalledCount} empty="Nada parado nas etapas.">
          {dl.stalledDeals.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<When color={stageAgeColor(d.daysInStage)} text={plural(d.daysInStage)} />} />)}
        </Panel>
        <Panel title="Prazo da etapa estourado" count={dl.slaCount} empty="Nenhuma etapa com prazo estourado.">
          {dl.slaDeals.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<When color={RED} text={`${d.daysInStage}/${d.slaDays} d`} />} />)}
        </Panel>
      </div>
      <Panel title="Por que perdemos (90 dias)" count={data.lostReasons.length} empty="Nenhuma perda nos últimos 90 dias.">
        {data.lostReasons.map((r) => (
          <div key={r.reason || 'none'} className="crm-row-link" style={{ cursor: 'default' }}><span>{r.label}</span><span className="crm-stage-num"><b>{r.count}</b><span className="crm-muted">{money(r.value)}</span></span></div>
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
      <div className="crm-cards crm-cards-six">
        <Kpi featured icon={Wallet} accent={BLUE} value={money(mrr.wonMrr)} label="MRR contratado" sub={`${mrr.wonCount} ${mrr.wonCount === 1 ? 'negócio ganho' : 'negócios ganhos'} com MRR`} />
        <Kpi icon={TrendingUp} accent={GREEN} value={money(mrr.wonMonthMrr)} label="MRR ganho no mês" tone={mrr.wonMonthMrr ? GREEN : undefined} />
        <Kpi icon={BarChart3} accent={PURPLE} value={money(mrr.openMrr)} label="MRR em negociação" sub="soma do MRR dos negócios em aberto" />
        <Kpi icon={BadgeCheck} accent={GREEN} value={money(dl.wonMonthValue)} label="Ganho no mês" tone={dl.wonMonthCount ? GREEN : undefined} sub={`${dl.wonMonthCount} ${dl.wonMonthCount === 1 ? 'negócio' : 'negócios'}`} />
        <Kpi icon={BadgeCheck} accent={GREEN} value={money(dl.won90Value)} label="Ganho em 90 dias" sub={`${dl.won90Count} negócios · conversão ${dl.conversion90 == null ? '—' : `${dl.conversion90}%`}`} />
        <Kpi featured icon={CircleDollarSign} accent={PURPLE} value={money(dl.weightedValue)} label="Valor ponderado" sub={`${money(dl.openValue)} em aberto`} />
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
          {data.topWeighted.map((d) => <DealRow key={d.id} d={d} onOpenDeal={onOpenDeal} right={<span className="crm-when"><span className="crm-when-text">{money(d.weightedValue)} · {d.probability}%</span></span>} />)}
        </Panel>
        <Panel title="Ganhos por origem (90 dias)" count={data.wonBySource.length} empty="Nenhum ganho nos últimos 90 dias.">
          {data.wonBySource.map((s) => (
            <div key={s.source} className="crm-row-link" style={{ cursor: 'default' }}><span>{s.source}</span><span className="crm-stage-num"><b>{money(s.value)}</b><span className="crm-muted">{s.count}</span></span></div>
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
      <Title icon={Building2}>Contas</Title>
      <div className="crm-cards crm-cards-six">
        <Kpi icon={Building2} accent={BLUE} value={data.totalCompanies} label="Empresas" sub={Object.entries(rel).map(([k, n]) => `${n} ${REL_META[k].label.toLowerCase()}`).join(' · ')} />
        <Kpi icon={Users} accent={PURPLE} value={data.totalContacts} label="Contatos" />
        <div className="crm-card crm-kpi"><span className="crm-kpi-ico" style={{ '--ico': GREEN }} aria-hidden="true"><BadgeCheck size={20} /></span><span className="crm-kpi-body"><span className="crm-kpi-value" style={{ fontSize: 20 }}><CompletenessBar percent={data.avgCompleteness} /></span><span className="crm-kpi-label">Completude média</span></span></div>
        <Kpi icon={Clock} value={data.staleCount} label="Sem interação há +30 dias" sub="clientes e prospects" tone={data.staleCount ? AMBER : undefined} />
        <Kpi icon={UserX} value={data.noPrimaryContact} label="Sem contato principal" />
        <Kpi icon={FileText} value={data.noCnpj} label="Sem CNPJ" />
      </div>
      <div className="crm-two">
        <div className="crm-section">
          <h3 className="crm-section-title"><span className="crm-panel-t"><AlertTriangle size={15} aria-hidden="true" />Precisam de contato</span></h3>
          {data.staleCompanies.length === 0 && <div className="crm-muted">Nenhuma conta parada.</div>}
          {data.staleCompanies.map((c) => (
            <button key={c.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(c.id)}>
              <span><b>{c.legalName}</b> <span className="crm-muted">· {REL_META[c.relationship].label}</span></span>
              <span className="crm-row-right"><When color={staleColor(c.daysSinceInteraction)} text={daysLabel(c.daysSinceInteraction)} /><ChevronRight size={15} className="crm-row-go" aria-hidden="true" /></span>
            </button>
          ))}
        </div>
        <div className="crm-section">
          <h3 className="crm-section-title">Cadastros mais incompletos</h3>
          {data.incompleteCompanies.length === 0 && <div className="crm-muted">Nenhum cadastro incompleto.</div>}
          {data.incompleteCompanies.map((c) => (
            <button key={c.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(c.id)}>
              <span><b>{c.legalName}</b></span><CompletenessBar percent={c.completeness} />
            </button>
          ))}
        </div>
      </div>
      <div className="crm-section">
        <h3 className="crm-section-title">Atividade recente</h3>
        {data.recentActivity.length === 0 && <div className="crm-muted">Nenhuma atividade registrada.</div>}
        {data.recentActivity.map((e) => (
          <button key={e.id} type="button" className="crm-row-link" onClick={() => onOpenCompany(e.companyId, 'history')}>
            <span>{e.summary} <span className="crm-muted">· {e.companyName}</span></span><span className="crm-muted">{fmtDateTimeBR(e.occurredAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
