// Visão Geral do CRM por função (§98). Cada pessoa abre no painel do seu perfil — Meu dia (vendedor/consultor),
// Time (gestor/diretor/admin/visualização), Receita (financeiro) — e pode trocar; "Contas" é o retrato do cadastro.
// O painel que abre é escolha da pessoa (guardada no servidor) ou, sem escolha, o primeiro do perfil.
import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Star } from 'lucide-react';
import { crm } from './crmApi.js';
import { notify } from '../ui/dialogs.jsx';
import { Skeleton } from '../ui/index.jsx';
import ActivityForm from './ActivityForm.jsx';
import { CompleteDialog } from './ActivityList.jsx';
import { MineLens, TeamLens, RevenueLens, AccountsLens } from './OverviewLenses.jsx';

const LENS_META = {
  mine: ['Meu dia', 'Atividades de hoje e atrasadas, negócios sem próximo passo e o seu funil.'],
  team: ['Time', 'Funil do time, carga por responsável e negócios que precisam de ajuda.'],
  revenue: ['Receita', 'MRR, previsão de fechamento e o que mais pesa no funil.'],
  accounts: ['Contas', 'Empresas e contatos cadastrados: completude e quem precisa de contato.'],
};

let lastLens = ''; // lembra a escolha enquanto a pessoa navega pelo CRM nesta sessão

const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// Esqueleto no formato da tela (4 indicadores + 2 listas): o que carrega aparece no lugar certo, sem pulo.
function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando a visão geral">
      <div className="crm-cards">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={92} radius={12} />)}</div>
      <div className="crm-two">{[0, 1].map((i) => <div key={i} className="crm-section"><Skeleton height={16} width="40%" />{[0, 1, 2, 3].map((r) => <div key={r} style={{ marginTop: 14 }}><Skeleton height={34} radius={8} /></div>)}</div>)}</div>
    </div>
  );
}

export default function OverviewPage({ caps, options, currentUserId, refreshKey, onOpenCompany, onOpenDeal, onBootstrap, onGoDeals, onGoAgenda }) {
  const lenses = caps.lenses && caps.lenses.length ? caps.lenses : ['accounts'];
  const [saved, setSaved] = useState(null); // padrão guardado no servidor ('' = nenhum); null = carregando
  const [lens, setLens] = useState(lastLens && lenses.includes(lastLens) ? lastLens : '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState(null); // {company, prefill}
  const [completing, setCompleting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    crm.views('deals').then((r) => { if (!cancelled) setSaved((r.defaults && r.defaults.overview) || ''); }).catch(() => { if (!cancelled) setSaved(''); });
    return () => { cancelled = true; };
  }, []);

  const startLens = lenses.includes(saved) ? saved : lenses[0];
  const current = lens || (saved === null ? '' : startLens);

  useEffect(() => {
    if (!current) return undefined;
    let cancelled = false;
    setError('');
    setRefreshing(true);
    crm.overview(current).then((r) => { if (!cancelled) { setData(r); setUpdatedAt(new Date()); } }).catch((e) => { if (!cancelled) setError(e.message || 'Não foi possível carregar a visão geral.'); }).finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [current, refreshKey, reloadTick]);

  useEffect(() => {
    if (!caps.import) return undefined;
    let cancelled = false;
    crm.bootstrapPreview().then((r) => { if (!cancelled) setPending(r.items.length); }).catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey, caps.import]);

  function pick(l) { if (l === current) return; setData(null); lastLens = l; setLens(l); }
  async function makeDefault() {
    try { await crm.setViewDefault('overview', current); setSaved(current); notify(`“${LENS_META[current][0]}” passa a ser a primeira tela do CRM para você.`, { tone: 'success' }); } catch (e) { notify(e.message || 'Não foi possível guardar sua escolha.', { tone: 'error' }); }
  }

  const reload = () => setReloadTick((n) => n + 1);
  const ready = data && data.lens === current;
  const isStart = current === startLens;
  const meta = LENS_META[current] || LENS_META.accounts;

  const actions = {
    canWrite: !!caps.write,
    onSchedule: (d) => setForm({ company: { id: d.companyId, legalName: d.companyName }, prefill: { dealId: d.dealId, activityType: 'followup', title: `Follow-up: ${d.title}` } }),
    onComplete: (a) => setCompleting(a),
  };

  // Teclado nas listas: ↑/↓ percorrem (dentro do mesmo painel), Home/End vão ao primeiro/último, A agenda e C conclui — clicando no botão da própria linha,
  // então as regras (permissão, formulário, diálogo) são exatamente as do clique.
  function onKeys(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (!t || !t.matches || !t.matches('.crm-row-link, .crm-prio-main')) return;
    const scope = t.closest('.crm-section') || e.currentTarget;
    const items = [...scope.querySelectorAll('.crm-row-link, .crm-prio-main')].filter((el) => el.offsetParent !== null);
    const i = items.indexOf(t);
    const go = (n) => { e.preventDefault(); const el = items[Math.max(0, Math.min(items.length - 1, n))]; if (el) el.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if ((e.key === 'a' || e.key === 'A' || e.key === 'c' || e.key === 'C') && caps.write) {
      const host = t.closest('.crm-rowx, .crm-prio-item');
      const btn = host && host.querySelector('.crm-rowbtn');
      const label = (btn && btn.getAttribute('aria-label')) || '';
      const isSchedule = /Agendar|follow-up/i.test(label);
      const isComplete = /Concluir/i.test(label);
      if ((/^[aA]$/.test(e.key) && isSchedule) || (/^[cC]$/.test(e.key) && isComplete)) { e.preventDefault(); btn.click(); }
    }
  }
  const fine = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  return (
    <div className="crm-ov" onKeyDown={onKeys}>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Visão geral</h1><div className="crm-sub">{meta[1]}</div></div>
        <div className="crm-actions">
          {updatedAt && <span className="crm-fresh" aria-live="polite">Atualizado às {hhmm(updatedAt)}</span>}
          <button type="button" className="crm-btn" onClick={reload} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={13} className={refreshing ? 'crm-spin' : undefined} aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}</button>
          {lenses.length > 1 && (
            <div className="crm-seg" role="group" aria-label="Painel">
              {lenses.map((l) => <button key={l} type="button" className={current === l ? 'active' : ''} aria-pressed={current === l} onClick={() => pick(l)}>{LENS_META[l][0]}</button>)}
            </div>
          )}
          {lenses.length > 1 && current && !isStart && <button type="button" className="crm-btn" onClick={makeDefault} title="Abrir sempre neste painel ao entrar no CRM"><Star size={13} /> Usar como início</button>}
        </div>
      </div>

      {pending > 0 && (current === 'accounts' || current === 'team') && (
        <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span><strong>{pending}</strong> {pending === 1 ? 'cliente do painel ainda não está' : 'clientes do painel ainda não estão'} no CRM (empresas com projeto no cronograma).</span>
          <button type="button" className="crm-btn crm-btn-primary" onClick={onBootstrap}><Download size={14} /> Trazer para o CRM</button>
        </div>
      )}

      {error && <div className="crm-alert crm-alert-danger" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><span>{error}</span><button type="button" className="crm-btn" onClick={reload}>Tentar de novo</button></div>}
      {!error && !ready && <OverviewSkeleton />}
      {ready && current === 'mine' && fine && caps.write && <p className="crm-hint"><kbd>↑</kbd> <kbd>↓</kbd> percorrem as listas · <kbd>Enter</kbd> abre · <kbd>A</kbd> agenda · <kbd>C</kbd> conclui · <kbd>?</kbd> mostra todos os atalhos</p>}
      {ready && current === 'mine' && <MineLens data={data} onOpenCompany={onOpenCompany} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} onGoAgenda={onGoAgenda} actions={actions} />}
      {ready && current === 'team' && <TeamLens data={data} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} onGoAgenda={onGoAgenda} />}
      {ready && current === 'revenue' && <RevenueLens data={data} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} />}
      {ready && current === 'accounts' && <AccountsLens data={data} onOpenCompany={onOpenCompany} />}
      {form && (
        <ActivityForm company={form.company} prefill={form.prefill} options={options} currentUserId={currentUserId}
          onCancel={() => setForm(null)} onSaved={() => { setForm(null); notify('Atividade criada.', { tone: 'success' }); reload(); }} />
      )}
      {completing && (
        <CompleteDialog activity={completing} onCancel={() => setCompleting(null)}
          onDone={(done, wantsNext, cadenceScheduled) => {
            setCompleting(null); reload();
            if (wantsNext && !cadenceScheduled) setForm({ company: { id: done.companyId, legalName: done.companyName }, prefill: { dealId: done.dealId, contactId: done.contactId, activityType: 'followup', title: `Próximo passo: ${done.title}` } });
          }} />
      )}
    </div>
  );
}
