// Lacunas entre cronogramas (Etapa 4 do plano, 2026-10-08): o que as outras empresas têm de "atividade-padrão" e este cronograma não.
// Só títulos genéricos e contagens ("12 de 20 empresas") — nunca quais empresas, nem descrição. Criar é sempre escolha do usuário.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { Button, Select, EmptyState, SkeletonCards, ErrorState, activate } from '../ui/index.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Overview({ data, onPick, min, setMin }) {
  const options = useMemo(() => {
    const base = [data.floor, 4, 5, 6, 8, 10, 15, 20].filter((n) => n >= data.floor && n <= Math.max(data.total, data.floor));
    return [...new Set([...base, data.defaultMin])].sort((a, b) => a - b);
  }, [data]);
  return (
    <>
      <div className="gap-bar">
        <p className="gap-note"><ShieldCheck size={14} aria-hidden="true" /> Atividade-padrão = que pelo menos <b>{data.min}</b> das <b>{data.total}</b> empresas têm. Mostramos só o título genérico e quantas empresas têm — nunca quais, nem descrição, responsável ou datas de ninguém.</p>
        <label className="gap-min">Padrão a partir de
          <Select aria-label="Mínimo de empresas para uma atividade ser padrão" value={min || data.defaultMin} onChange={(e) => setMin(Number(e.target.value))}>
            {options.map((n) => <option key={n} value={n}>{n} empresas{n === data.defaultMin ? ' (sugerido)' : ''}</option>)}
          </Select>
        </label>
      </div>
      {data.standardCount === 0 && <EmptyState icon={AlertTriangle} title="Ainda não há atividade-padrão" description={`Nenhuma atividade aparece em ${data.min} ou mais cronogramas. Diminua o mínimo para ver.`} />}
      {data.standardCount > 0 && (
        <div className="gap-list">
          {data.companies.map((c) => (
            <div key={c.id} className="gap-row" {...activate(() => onPick(c.id))} title="Ver as lacunas deste cronograma">
              <div className="gap-row-main">
                <div className="gap-row-t">{c.label}{c.paused && <span className="gap-tag">pausada</span>}</div>
                <div className="gap-bar-track" aria-hidden="true"><div className="gap-bar-fill" style={{ width: `${c.coverage}%` }} /></div>
              </div>
              <div className="gap-row-n">
                {c.gaps > 0 ? <b className="gap-miss">{plural(c.gaps, 'lacuna', 'lacunas')}</b> : <span className="gap-ok"><CheckCircle2 size={13} aria-hidden="true" /> completo</span>}
                <span>{c.coverage}% do padrão · {plural(c.activities, 'atividade', 'atividades')}</span>
              </div>
              <ChevronRight size={16} aria-hidden="true" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Detail({ id, min, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    setData(null); setError('');
    apiGet(`/api/gaps/company/${id}${min ? `?min=${min}` : ''}`)
      .then((r) => { if (off) return; setData(r); setPicked(new Set(r.gaps.filter((g) => !g.similar).map((g) => g.key))); })
      .catch((e) => { if (!off) setError(e.message || 'Não foi possível carregar as lacunas.'); });
    return () => { off = true; };
  }, [id, min, tick]);

  const byPhase = useMemo(() => {
    const m = new Map();
    (data ? data.gaps : []).forEach((g) => { const k = g.phase || 'Sem fase definida'; (m.get(k) || m.set(k, []).get(k)).push(g); });
    return [...m.entries()];
  }, [data]);

  const toggle = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function create() {
    const keys = [...picked];
    if (!keys.length) return;
    const okay = await askConfirm({
      title: `Criar ${plural(keys.length, 'atividade', 'atividades')} em ${data.company.label}?`,
      message: 'Entram no cronograma como “Não iniciada”, na fase indicada, sem data e sem descrição — só o título genérico; nada de outro cliente é copiado. O responsável inicial é o primeiro da equipe da empresa (ou PRICETAX). Dá para ajustar tudo depois.',
      confirmLabel: 'Criar atividades',
    });
    if (!okay) return;
    setBusy(true);
    try {
      const r = await apiPost('/api/gaps/create', { projectId: id, keys, min: min || undefined });
      notify(`${plural(r.created, 'atividade criada', 'atividades criadas')} no cronograma de ${data.company.label}.`, { tone: 'success' });
      setTick((n) => n + 1);
      onChanged();
    } catch (e) {
      notify(e.message || 'Não foi possível criar as atividades.', { tone: 'error' });
      setTick((n) => n + 1);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="gap-bar">
        <Button icon={ArrowLeft} onClick={onBack}>Todas as empresas</Button>
        {data && <h2 className="gap-title">{data.company.label}</h2>}
      </div>
      {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={() => setTick((n) => n + 1)} />}
      {!data && !error && <SkeletonCards count={4} height={52} />}
      {data && data.gaps.length === 0 && <EmptyState icon={CheckCircle2} tone="ok" title="Nenhuma atividade-padrão faltando" description={`Este cronograma tem tudo o que pelo menos ${data.min} das ${data.total} empresas têm.`} />}
      {data && data.gaps.length > 0 && (
        <>
          <p className="gap-note"><ShieldCheck size={14} aria-hidden="true" /> Faltam <b>{data.gaps.length}</b> de {data.standardCount} atividades-padrão (as que pelo menos {data.min} das {data.total} empresas têm). Marque o que faz sentido para esta empresa — as que já têm algo parecido vêm desmarcadas.</p>
          <div className="gap-tools">
            <Button size="sm" onClick={() => setPicked(new Set(data.gaps.map((g) => g.key)))}>Marcar todas</Button>
            <Button size="sm" onClick={() => setPicked(new Set())}>Desmarcar todas</Button>
            <Button variant="primary" icon={Plus} loading={busy} disabled={!picked.size} disabledReason="Marque ao menos uma atividade" onClick={create}>Criar {picked.size ? plural(picked.size, 'atividade', 'atividades') : 'atividades'}</Button>
          </div>
          {byPhase.map(([phase, gaps]) => (
            <section key={phase} className="gap-phase" aria-label={phase}>
              <h3 className="gap-phase-h">{phase}<span>{plural(gaps.length, 'lacuna', 'lacunas')}</span></h3>
              {gaps.map((g) => (
                <label key={g.key} className="gap-item">
                  <input type="checkbox" checked={picked.has(g.key)} onChange={() => toggle(g.key)} />
                  <span className="gap-item-main">
                    <span className="gap-item-t">{g.title}{g.area && <span className="gap-tag">{g.area}</span>}</span>
                    <span className="gap-item-m">{g.count} de {g.total} empresas têm ({g.pct}%)</span>
                    {g.similar && <span className="gap-warn"><AlertTriangle size={12} aria-hidden="true" /> Já existe algo parecido neste cronograma: “{g.similar}”</span>}
                  </span>
                </label>
              ))}
            </section>
          ))}
        </>
      )}
    </>
  );
}

export default function GapsView() {
  const [min, setMin] = useState(0);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [company, setCompany] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    apiGet(`/api/gaps/overview${min ? `?min=${min}` : ''}`)
      .then((r) => { if (!off) { setOverview(r); setError(''); } })
      .catch((e) => { if (!off) setError(e.message || 'Não foi possível carregar as lacunas.'); });
    return () => { off = true; };
  }, [min, tick]);

  return (
    <div className="gap mac-pad" style={{ paddingTop: 16, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={() => setTick((n) => n + 1)} />}
      {!overview && !error && <SkeletonCards count={4} height={58} />}
      {overview && !company && <Overview data={overview} min={min} setMin={setMin} onPick={setCompany} />}
      {overview && company && <Detail id={company} min={min} onBack={() => setCompany('')} onChanged={() => setTick((n) => n + 1)} />}
    </div>
  );
}
