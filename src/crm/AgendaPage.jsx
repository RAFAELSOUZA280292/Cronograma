// Agenda do CRM (PRD 16/17): o que cada pessoa precisa fazer, por urgência.
// Padrão: "minhas" atividades em aberto agrupadas em Atrasadas / Hoje / Próximos
// 7 dias / Mais adiante. Os contadores no topo são filtros de um clique. A lista
// nunca é trocada por "Carregando" depois da 1ª carga — assim os diálogos de
// concluir/próximo passo não somem no meio do fluxo.
import React, { useEffect, useState } from 'react';
import { Plus, CalendarCheck } from 'lucide-react';
import { crm } from './crmApi.js';
import ActivityList from './ActivityList.jsx';
import { ACTIVITY_TYPES, BUCKET_META } from './crmMeta.js';

export default function AgendaPage({ caps, options, currentUserId, refreshKey, onOpenCompany, onOpenDeal, onNewActivity, onChanged }) {
  const [owner, setOwner] = useState('me');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [view, setView] = useState('open'); // open | done | cancelled
  const [bucket, setBucket] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [localKey, setLocalKey] = useState(0);
  const owners = (options && options.owners) || [];

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let cancelled = false;
    crm.activities({ ownerId: owner, type, q: debouncedQ, status: view, bucket: view === 'open' ? bucket : '', limit: 300 })
      .then((r) => { if (!cancelled) { setData(r); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Não foi possível carregar a agenda.'); });
    return () => { cancelled = true; };
  }, [owner, type, debouncedQ, view, bucket, refreshKey, localKey]);

  const reload = () => { setLocalKey((k) => k + 1); if (onChanged) onChanged(); };
  const c = data ? data.counts : null;
  const pick = (v, b) => { setView(v); setBucket(b); };
  const hasFilter = owner !== 'me' || type || debouncedQ;

  return (
    <div>
      <div className="crm-page-head">
        <div><h1 className="crm-h1">Agenda</h1><div className="crm-sub">O que precisa ser feito, por urgência. Concluir uma ligação, reunião ou e-mail conta como interação com a empresa.</div></div>
        <div className="crm-actions">{caps.write && <button type="button" className="crm-btn crm-btn-primary" onClick={() => onNewActivity({})}><Plus size={14} /> Nova atividade</button>}</div>
      </div>

      <div className="crm-chips">
        {Object.entries(BUCKET_META).map(([key, m]) => (
          <button key={key} type="button" className={`crm-chip${view === 'open' && bucket === key ? ' active' : ''}`} onClick={() => pick('open', bucket === key && view === 'open' ? '' : key)}>
            <span style={{ color: c && c[key] && (key === 'overdue' || key === 'today') ? m.color : undefined }}>{m.label}</span><b>{c ? c[key] : '–'}</b>
          </button>
        ))}
        <button type="button" className={`crm-chip${view === 'done' ? ' active' : ''}`} onClick={() => pick(view === 'done' ? 'open' : 'done', '')}>Concluídas<b>{c ? c.done : '–'}</b></button>
      </div>

      <div className="crm-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por atividade ou empresa…" style={{ minWidth: 230 }} />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável">
          <option value="me">Minhas atividades</option><option value="">De todos</option><option value="none">Sem responsável</option>
          {owners.filter((o) => o.id !== currentUserId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de atividade">
          <option value="">Todos os tipos</option>{ACTIVITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={view} onChange={(e) => pick(e.target.value, '')} aria-label="Situação">
          <option value="open">Em aberto</option><option value="done">Concluídas</option><option value="cancelled">Canceladas</option>
        </select>
        {hasFilter && <button type="button" className="crm-btn" onClick={() => { setQ(''); setType(''); setOwner('me'); }}>Limpar</button>}
      </div>

      {error && <div className="crm-alert crm-alert-danger">{error}</div>}
      {!data && !error && <div className="crm-empty">Carregando…</div>}
      {data && (
        <>
          {data.items.length === 0 && view === 'open' && (
            <div className="crm-empty">
              <CalendarCheck size={26} style={{ opacity: .5 }} />
              <div style={{ marginTop: 8 }}>{hasFilter || bucket ? 'Nenhuma atividade com esses filtros.' : 'Nada pendente por aqui. Toda venda anda com um próximo passo agendado.'}</div>
              {caps.write && !hasFilter && !bucket && <div style={{ marginTop: 10 }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => onNewActivity({})}><Plus size={14} /> Agendar uma atividade</button></div>}
            </div>
          )}
          <ActivityList activities={data.items} grouped={view === 'open'} showCompany caps={caps} options={options} currentUserId={currentUserId}
            onChanged={reload} onOpenCompany={onOpenCompany} onOpenDeal={onOpenDeal} emptyText={view === 'open' ? ' ' : 'Nenhuma atividade nesta situação.'} />
          {data.total > data.items.length && <div className="crm-muted" style={{ marginTop: 10 }}>Mostrando {data.items.length} de {data.total}. Use os filtros para refinar.</div>}
        </>
      )}
    </div>
  );
}
