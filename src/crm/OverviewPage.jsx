// Visão Geral do CRM por função (§98). Cada pessoa abre no painel do seu perfil — Meu dia (vendedor/consultor),
// Time (gestor/diretor/admin/visualização), Receita (financeiro) — e pode trocar; "Contas" é o retrato do cadastro.
// O painel que abre é escolha da pessoa (guardada no servidor) ou, sem escolha, o primeiro do perfil.
import React, { useEffect, useState } from 'react';
import { Download, Star } from 'lucide-react';
import { crm } from './crmApi.js';
import { notify } from '../ui/dialogs.jsx';
import { MineLens, TeamLens, RevenueLens, AccountsLens } from './OverviewLenses.jsx';

const LENS_META = {
  mine: ['Meu dia', 'Atividades de hoje e atrasadas, negócios sem próximo passo e o seu funil.'],
  team: ['Time', 'Funil do time, carga por responsável e negócios que precisam de ajuda.'],
  revenue: ['Receita', 'MRR, previsão de fechamento e o que mais pesa no funil.'],
  accounts: ['Contas', 'Empresas e contatos cadastrados: completude e quem precisa de contato.'],
};

let lastLens = ''; // lembra a escolha enquanto a pessoa navega pelo CRM nesta sessão

export default function OverviewPage({ caps, refreshKey, onOpenCompany, onOpenDeal, onBootstrap, onGoDeals, onGoAgenda }) {
  const lenses = caps.lenses && caps.lenses.length ? caps.lenses : ['accounts'];
  const [saved, setSaved] = useState(null); // padrão guardado no servidor ('' = nenhum); null = carregando
  const [lens, setLens] = useState(lastLens && lenses.includes(lastLens) ? lastLens : '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);

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
    crm.overview(current).then((r) => { if (!cancelled) setData(r); }).catch((e) => { if (!cancelled) setError(e.message || 'Não foi possível carregar a visão geral.'); });
    return () => { cancelled = true; };
  }, [current, refreshKey]);

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

  const ready = data && data.lens === current;
  const isStart = current === startLens;
  const meta = LENS_META[current] || LENS_META.accounts;

  return (
    <div className="crm-ov">
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Visão geral</h1><div className="crm-sub">{meta[1]}</div></div>
        <div className="crm-actions">
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

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      {!error && !ready && <div className="crm-empty">Carregando…</div>}
      {ready && current === 'mine' && <MineLens data={data} onOpenCompany={onOpenCompany} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} onGoAgenda={onGoAgenda} />}
      {ready && current === 'team' && <TeamLens data={data} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} onGoAgenda={onGoAgenda} />}
      {ready && current === 'revenue' && <RevenueLens data={data} onOpenDeal={onOpenDeal} onGoDeals={onGoDeals} />}
      {ready && current === 'accounts' && <AccountsLens data={data} onOpenCompany={onOpenCompany} />}
    </div>
  );
}
