// Aba "Padrão" da Visão Geral (2026-10-15): aplica nas empresas que já existem o padrão de cronograma aprimorado (descrições melhores, subatividades e as
// atividades Contábil, RH/Folha/DP e Prontidão da virada, sem data). Prévia por empresa; aplicar é com confirmação e só para administrador.
// Nunca altera data, status, responsável nem o que já foi concluído. Dados: server/standardPlanApi.js.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, EmptyState, SkeletonCards, ErrorState } from '../ui/index.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const CSS = `
  .sp-note { display:flex; gap:8px; align-items:flex-start; font-size:12.5px; color:var(--text-3); line-height:1.5; background:var(--bg-3); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; margin-bottom:12px; }
  .sp-note svg { flex-shrink:0; margin-top:2px; color:#3ecf6e; }
  .sp-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
  .sp-list { display:flex; flex-direction:column; gap:8px; }
  .sp-row { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; }
  .sp-head { display:flex; align-items:center; gap:10px; }
  .sp-head label { display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:pointer; }
  .sp-name { font-weight:700; font-size:13.5px; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sp-count { font-size:11.5px; color:var(--text-5); white-space:nowrap; }
  .sp-ok { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:#3ecf6e; font-weight:600; }
  .sp-tag { font-size:10px; font-weight:700; color:var(--text-5); border:1px solid var(--border-2); border-radius:999px; padding:1px 7px; margin-left:6px; }
  .sp-toggle { background:none; border:none; color:var(--text-4); cursor:pointer; padding:4px; display:inline-flex; }
  .sp-items { margin:8px 0 0 28px; padding:0; list-style:disc; font-size:12.5px; color:var(--text-3); line-height:1.6; }
  .sp-skip { margin:6px 0 0 28px; font-size:11.5px; color:var(--text-6); }
  @media (max-width: 767px) { .sp-toggle { min-width:44px; min-height:44px; } .sp-head input { width:20px; height:20px; } }
`;

export default function StandardPlanView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    apiGet('/api/standard-plan/preview').then((r) => {
      if (!r || !Array.isArray(r.companies)) { setError('Resposta inesperada do servidor.'); return; }
      setData(r);
      setSel((prev) => new Set([...prev].filter((id) => r.companies.some((c) => c.id === id && c.pending))));
    }).catch((e) => setError((e && e.message) || 'Não foi possível carregar.'));
  }, []);
  useEffect(load, [load]);

  const pending = useMemo(() => (data ? data.companies.filter((c) => c.pending) : []), [data]);
  const allSel = pending.length > 0 && pending.every((c) => sel.has(c.id));
  const toggle = (set, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  async function apply() {
    const chosen = pending.filter((c) => sel.has(c.id));
    const d = chosen.reduce((n, c) => n + c.counts.descriptions, 0); const s = chosen.reduce((n, c) => n + c.counts.subs, 0); const k = chosen.reduce((n, c) => n + c.counts.creates, 0);
    const ok = await askConfirm({
      title: 'Aplicar o padrão aprimorado?',
      message: `Em ${plural(chosen.length, 'empresa', 'empresas')}: ${plural(d, 'descrição', 'descrições')} melhorada${d === 1 ? '' : 's'}, ${plural(s, 'subatividade nova', 'subatividades novas')} e ${plural(k, 'atividade nova', 'atividades novas')} (sem data). Datas, status, responsáveis e o que já foi concluído não são alterados; descrições que o time personalizou são mantidas.`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiPost('/api/standard-plan/apply', { projectIds: chosen.map((c) => c.id) });
      const bad = r.results.filter((x) => x.status === 'erro' || x.status === 'sem-acesso').length;
      notify(`Padrão aplicado em ${plural(r.applied, 'empresa', 'empresas')}${bad ? `; ${plural(bad, 'empresa teve', 'empresas tiveram')} problema (nada foi alterado nelas)` : ''}.`, { tone: bad ? 'error' : 'success' });
      setSel(new Set()); load();
    } catch (e) { notify((e && e.message) || 'Não foi possível aplicar.', { tone: 'error' }); } finally { setBusy(false); }
  }

  if (error) return <ErrorState title="Não foi possível carregar o padrão" message={error} onRetry={load} />;
  if (!data) return <SkeletonCards count={3} height={64} />;
  const t = data.totals;
  return (
    <div>
      <style>{CSS}</style>
      <div className="sp-note"><ShieldCheck size={15} aria-hidden="true" />
        <span>Aplica o padrão aprimorado nas empresas que já existem: <b>descrições melhores</b>, <b>subatividades</b> que faltam e as atividades <b>Contábil</b>, <b>RH, Folha e DP</b> e <b>Prontidão da virada</b> (criadas sem data). <b>Não altera data, status, responsável nem o que já foi concluído</b>, e mantém descrições que o time personalizou. Empresas novas já nascem com o padrão.</span>
      </div>
      {t.pending === 0 ? (
        <EmptyState icon={CheckCircle2} title="Todas as empresas já estão com o padrão" description={`${plural(t.companies, 'empresa', 'empresas')} em dia. Nada a aplicar.`} />
      ) : (
        <>
          <div className="sp-bar">
            <span className="sp-count"><b>{t.pending}</b> de {t.companies} empresas com melhorias pendentes · {plural(t.descriptions, 'descrição', 'descrições')} · {plural(t.subs, 'subatividade', 'subatividades')} · {plural(t.creates, 'atividade nova', 'atividades novas')}</span>
            {data.canApply && <Button size="sm" onClick={() => setSel(allSel ? new Set() : new Set(pending.map((c) => c.id)))}>{allSel ? 'Limpar seleção' : 'Selecionar todas'}</Button>}
            {data.canApply && <Button size="sm" variant="primary" loading={busy} disabled={!sel.size} disabledReason="Escolha ao menos uma empresa" onClick={apply}>Aplicar em {sel.size || ''} {sel.size === 1 ? 'empresa' : 'empresas'}</Button>}
            {!data.canApply && <span className="sp-count">Só administradores aplicam; você pode ver a prévia.</span>}
          </div>
          <div className="sp-list">
            {data.companies.map((c) => (
              <div key={c.id} className="sp-row">
                <div className="sp-head">
                  <label>
                    {data.canApply && c.pending && <input type="checkbox" checked={sel.has(c.id)} onChange={() => setSel((s) => toggle(s, c.id))} aria-label={`Selecionar ${c.label}`} />}
                    <span className="sp-name">{c.label}{c.paused && <span className="sp-tag">pausada</span>}</span>
                  </label>
                  {c.pending
                    ? <span className="sp-count">{plural(c.counts.descriptions, 'descrição', 'descrições')} · {plural(c.counts.subs, 'subatividade', 'subatividades')} · {plural(c.counts.creates, 'nova', 'novas')}</span>
                    : <span className="sp-ok"><CheckCircle2 size={13} aria-hidden="true" /> em dia</span>}
                  {c.pending && <button type="button" className="sp-toggle" onClick={() => setOpen((s) => toggle(s, c.id))} aria-expanded={open.has(c.id)} aria-label={`Ver o que muda em ${c.label}`}>{open.has(c.id) ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button>}
                </div>
                {open.has(c.id) && (
                  <>
                    <ul className="sp-items">{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    {c.skipped.length > 0 && <div className="sp-skip">Mantido como está: {c.skipped.map((s) => `${s.title} (${s.reason})`).join(' · ')}</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
