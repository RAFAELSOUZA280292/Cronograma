// Cliente 360 na tela da empresa do cronograma (Onda 3, I1): o lado comercial (CRM) ao lado do cronograma, com a mesma faixa de alertas da ficha do CRM.
// Aparece só para quem tem acesso ao CRM e à empresa; sem vínculo, sugere a empresa do CRM de mesmo CNPJ (vincular é feito pela ficha do CRM).
// Qualquer falha esconde a faixa: ela é um ganho de contexto, nunca uma condição para usar a tela.
import React, { useEffect, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { Button } from './index.jsx';
import ClientAlerts from './ClientAlerts.jsx';

const CSS = `
.c360 { margin: 0 0 var(--sp-3); padding: var(--sp-3) var(--sp-4); background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--r-xl); font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: var(--sp-2); }
.c360-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.c360-title { margin: 0; font-size: var(--fs-md); font-weight: 800; color: var(--text-1); }
.c360-meta { font-size: var(--fs-xs); color: var(--text-4); }
.c360-go { margin-left: auto; }
.c360-deals { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-sm); color: var(--text-2); }
`;
const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const REL = { prospect: 'Prospect', client: 'Cliente', former_client: 'Ex-cliente', partner: 'Parceiro' };

export default function Client360Strip({ projectId, onOpenCrm }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let off = false; setD(null);
    if (projectId) apiGet(`/api/client360/project/${encodeURIComponent(projectId)}`).then((r) => { if (!off) setD(r); }).catch(() => {});
    return () => { off = true; };
  }, [projectId]);
  if (!d || !d.available) return null;
  if (!d.linked) {
    if (!d.suggestion) return null;
    return (
      <section className="c360" aria-label="Cliente no CRM">
        <style>{CSS}</style>
        <div className="c360-head">
          <Briefcase size={16} aria-hidden="true" color="var(--ui-accent-text)" />
          <h2 className="c360-title">No CRM</h2>
          <span className="c360-meta">Esta empresa tem o mesmo CNPJ de “{d.suggestion.name}” no CRM, mas ainda não está vinculada. Vincule pela ficha do CRM, aba Projetos.</span>
          {onOpenCrm && <Button size="sm" className="c360-go" onClick={() => onOpenCrm(d.suggestion.companyId)}>Abrir no CRM</Button>}
        </div>
      </section>
    );
  }
  const k = d.kpis || {};
  return (
    <section className="c360" aria-label="Cliente no CRM">
      <style>{CSS}</style>
      <div className="c360-head">
        <Briefcase size={16} aria-hidden="true" color="var(--ui-accent-text)" />
        <h2 className="c360-title">No CRM: {d.company.name}</h2>
        <span className="c360-meta">
          {REL[d.company.relationship] || ''}{d.company.ownerName ? ` · responsável: ${d.company.ownerName}` : ''} · {k.openDeals} {k.openDeals === 1 ? 'negócio aberto' : 'negócios abertos'}{k.openDealsValue ? ` (${money(k.openDealsValue)})` : ''}
          {k.daysSinceInteraction != null ? ` · última interação há ${k.daysSinceInteraction} ${k.daysSinceInteraction === 1 ? 'dia' : 'dias'}` : ' · sem interação registrada'}
        </span>
        {onOpenCrm && <Button size="sm" className="c360-go" onClick={() => onOpenCrm(d.company.id)}>Abrir no CRM</Button>}
      </div>
      {d.deals.length > 0 && (
        <ul className="c360-deals" aria-label="Negócios abertos">
          {d.deals.map((x) => <li key={x.id}>{x.title} · {x.stageName}{x.value ? ` · ${money(x.value)}` : ''}{x.nextActivityTitle ? ` · próximo passo: ${x.nextActivityTitle}${x.nextActivityDate ? ` (${x.nextActivityDate.split('-').reverse().join('/')})` : ''}` : ' · sem próximo passo'}</li>)}
          {d.openDealsTotal > d.deals.length && <li>e mais {d.openDealsTotal - d.deals.length}</li>}
        </ul>
      )}
      <ClientAlerts alerts={d.alerts} showEmpty />
    </section>
  );
}
