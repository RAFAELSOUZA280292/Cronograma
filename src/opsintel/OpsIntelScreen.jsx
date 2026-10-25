import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Clock, Globe, ShieldCheck, Users as UsersIcon, BarChart3, Smile } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { Button, Tabs } from '../ui/index.jsx';
import { S } from '../styles/S.js';
import { Basis, DailyBars, HBars, Heat, Kpi, ROLE_NAMES, VIEW_NAMES, dayLabel, fmtDur, fmtNum, modName } from './charts.jsx';

const AccessMap = lazy(() => import('./AccessMap.jsx').then((m) => ({ default: m.AccessMap })));

// Central de Inteligência Operacional (2026-10-25). Só Master. Tudo vem de /api/ops-intel; cada número leva o selo da base
// (medido, estimado ou indisponível). Tempo conectado não é produtividade: ver a aba Metodologia e privacidade.
const CSS = `
.oi-root { --oi-ok:#3ecf6e; --oi-warn:#F5C400; --oi-info:#3ea6ff; --oi-bad:#e2574c; --oi-faint:var(--text-5); max-width:1280px; margin:0 auto; padding:18px 24px 60px; font-family:'Inter',sans-serif; }
.oi-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
.oi-title { display:flex; align-items:center; gap:12px; } .oi-title h1 { margin:0; font-size:22px; font-weight:800; } .oi-title p { margin:2px 0 0; font-size:12.5px; color:var(--text-4); }
.oi-ico { width:42px; height:42px; border-radius:10px; background:rgba(245,196,0,.14); display:grid; place-items:center; }
.oi-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; padding:12px 14px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; margin-bottom:14px; }
.oi-field { display:flex; flex-direction:column; gap:4px; font-size:11px; color:var(--text-4); font-weight:600; } .oi-field select, .oi-field input { min-width:150px; }
.oi-presets { display:flex; gap:6px; }
.oi-chip { border:1px solid var(--border-2); background:transparent; color:var(--text-2); border-radius:8px; padding:6px 11px; font-size:12px; cursor:pointer; font-weight:600; } .oi-chip[aria-pressed=true] { background:#F5C400; color:#0B0E1A; border-color:#F5C400; }
.oi-banner { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:12.5px; margin-bottom:14px; background:rgba(62,166,255,.10); border:1px solid rgba(62,166,255,.35); color:var(--text-2); }
.oi-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:16px; }
.oi-kpi { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; }
.oi-kpi-top { display:flex; justify-content:space-between; gap:8px; align-items:center; } .oi-kpi-label { font-size:11.5px; color:var(--text-4); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.oi-kpi-value { font-size:28px; font-weight:800; margin:8px 0 4px; line-height:1.05; color:var(--text-1); } .oi-kpi-foot { font-size:11.5px; color:var(--text-4); }
.oi-delta { font-weight:700; } .oi-delta em { font-weight:400; font-style:normal; color:var(--text-5); } .oi-delta.up { color:var(--oi-ok); } .oi-delta.down { color:var(--oi-bad); }
.oi-basis { font-size:10px; font-weight:800; letter-spacing:.03em; text-transform:uppercase; color:var(--c); border:1px solid var(--c); border-radius:99px; padding:1px 7px; white-space:nowrap; opacity:.95; }
.oi-grid2 { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:14px; margin-bottom:14px; } .oi-grid3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; margin-bottom:14px; }
@media (max-width:900px){ .oi-grid2 { grid-template-columns:1fr; } .oi-root { padding:14px 12px 50px; } }
.oi-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; min-width:0; }
.oi-card h3 { margin:0 0 4px; font-size:13.5px; font-weight:800; } .oi-card .oi-hint { font-size:11.5px; color:var(--text-4); margin-bottom:10px; }
.oi-svg { width:100%; display:block; } .oi-grid { stroke:var(--border-2); stroke-width:.15; stroke-dasharray:1 1; }
.oi-bar-real { fill:#F5C400; } .oi-bar-est { fill:#F5C400; opacity:.38; }
.oi-axis { display:flex; justify-content:space-between; font-size:10.5px; color:var(--text-5); margin-top:4px; }
.oi-legend { display:flex; gap:14px; font-size:11px; color:var(--text-4); margin-top:6px; } .oi-sw { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px; background:#F5C400; } .oi-sw.est { opacity:.38; }
.oi-empty { padding:22px 8px; text-align:center; color:var(--text-4); font-size:12.5px; }
.oi-table-wrap { overflow-x:auto; } .oi-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.oi-table th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-4); padding:8px 10px; border-bottom:1px solid var(--border-2); white-space:nowrap; }
.oi-table td { padding:9px 10px; border-bottom:1px solid var(--border-1); white-space:nowrap; } .oi-table tr.is-click { cursor:pointer; } .oi-table tr.is-click:hover td { background:var(--bg-3); }
.oi-table td.num, .oi-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
.oi-name { font-weight:700; color:var(--text-1); } .oi-role { font-size:11px; color:var(--text-4); }
.oi-heat { display:grid; grid-template-columns:34px repeat(24,1fr); gap:2px; align-items:center; } .oi-heat-h, .oi-heat-d { font-size:9.5px; color:var(--text-5); text-align:center; } .oi-heat-d { text-align:right; padding-right:4px; }
.oi-heat-c { aspect-ratio:1.5; border-radius:3px; background:rgba(245,196,0,var(--a)); border:1px solid var(--border-1); }
.oi-hbars { display:grid; gap:8px; } .oi-hbar { display:grid; grid-template-columns:minmax(80px,32%) 1fr 76px; gap:10px; align-items:center; font-size:12px; }
.oi-hbar-l { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-2); } .oi-hbar-t { height:10px; background:var(--bg-4); border-radius:5px; overflow:hidden; } .oi-hbar-f { height:100%; background:#F5C400; border-radius:5px; } .oi-hbar-v { text-align:right; color:var(--text-3); font-variant-numeric:tabular-nums; }
.oi-seg { display:inline-flex; border:1px solid var(--border-2); border-radius:8px; overflow:hidden; } .oi-seg button { border:0; background:transparent; color:var(--text-3); padding:5px 11px; font-size:12px; cursor:pointer; font-weight:600; } .oi-seg button[aria-pressed=true] { background:#F5C400; color:#0B0E1A; }
.oi-alert { display:grid; grid-template-columns:auto 1fr; gap:12px; padding:12px 14px; border:1px solid var(--border-1); border-radius:10px; margin-bottom:8px; background:var(--bg-2); }
.oi-sev { width:8px; border-radius:4px; background:var(--oi-faint); } .oi-sev.alta { background:var(--oi-bad); } .oi-sev.media { background:var(--oi-warn); } .oi-sev.baixa { background:var(--oi-info); }
.oi-alert h4 { margin:0 0 3px; font-size:13px; } .oi-alert p { margin:0; font-size:12.5px; color:var(--text-3); line-height:1.45; } .oi-alert small { color:var(--text-5); }
.oi-ev { margin-top:6px; font-size:11.5px; color:var(--text-4); display:flex; flex-wrap:wrap; gap:4px 12px; }
.oi-map { height:430px; border-radius:12px; border:1px solid var(--border-1); overflow:hidden; background:var(--bg-3); } [data-theme=dark] .oi-map .leaflet-tile-pane, .dark-mode .oi-map .leaflet-tile-pane { filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.92); }
.oi-tl-day { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-4); margin:14px 0 6px; } .oi-tl-item { display:grid; grid-template-columns:54px 1fr; gap:10px; padding:6px 0; border-bottom:1px solid var(--border-1); font-size:12.5px; }
.oi-tl-t { color:var(--text-4); font-variant-numeric:tabular-nums; } .oi-tl-src { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); margin-left:8px; }
.oi-doc h3 { font-size:14px; margin:18px 0 6px; } .oi-doc ul { margin:0; padding-left:18px; } .oi-doc li, .oi-doc p { font-size:13px; line-height:1.55; color:var(--text-2); margin-bottom:4px; } .oi-doc code { background:var(--bg-4); padding:1px 6px; border-radius:4px; font-size:12px; }
.oi-err { padding:14px; border-radius:10px; background:rgba(226,87,76,.12); border:1px solid rgba(226,87,76,.4); font-size:13px; }
`;

const PRESETS = [{ id: 7, label: '7 dias' }, { id: 30, label: '30 dias' }, { id: 90, label: '90 dias' }];
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtWhen = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtHour = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—');
const KIND = { login: 'Entrou', visit: 'Voltou à sessão', first_use: 'Primeiro uso do dia', login_failed: 'Senha errada' };
const RULES = { novo_pais: 'País novo', nova_cidade: 'Cidade nova', novo_dispositivo: 'Dispositivo novo', viagem_impossivel: 'Viagem impossível', falhas_login: 'Falhas de login', varios_ips: 'Vários IPs', horario_atipico: 'Madrugada atípica', ip_varios_usuarios: 'IP em várias contas' };

function useApi(path, deps) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    apiGet(path).then((data) => { if (alive) setState({ loading: false, error: '', data }); }).catch((e) => { if (alive) setState({ loading: false, error: (e && e.message) || 'Não foi possível carregar.', data: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function AlertList({ alerts, empty }) {
  if (!alerts.length) return <div className="oi-empty">{empty || 'Nenhum comportamento atípico no período.'}</div>;
  return alerts.map((a) => (
    <div className="oi-alert" key={a.id}>
      <div className={`oi-sev ${a.severity}`} aria-label={`Gravidade ${a.severity}`} />
      <div>
        <h4>{a.title} <small>· {RULES[a.rule] || a.rule} · {fmtWhen(a.at)}{a.userName ? ` · ${a.userName}` : ''}</small></h4>
        <p>{a.detail}</p>
        {a.evidence && a.evidence.length > 0 && (
          <div className="oi-ev">{a.evidence.slice(0, 4).map((e, i) => <span key={i}>{fmtWhen(e.at)} · {[e.city, e.region, e.country].filter(Boolean).join(', ') || 'sem local'}{e.ip ? ` · ${e.ip}` : ''}{e.device ? ` · ${e.device}` : ''}</span>)}</div>
        )}
      </div>
    </div>
  ));
}

export function OpsIntelScreen({ currentUser, onClose }) {
  const [tab, setTab] = useState('geral');
  const [preset, setPreset] = useState(30);
  const [range, setRange] = useState(() => ({ from: addDays(todayIso(), -29), to: todayIso() }));
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState('');
  const [module, setModule] = useState('');
  const [projectId, setProjectId] = useState('');
  const [heatSource, setHeatSource] = useState('measured');

  const pickPreset = (n) => { setPreset(n); setRange({ from: addDays(todayIso(), -(n - 1)), to: todayIso() }); };
  const qs = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (profile) p.set('profile', profile); if (userId) p.set('userId', userId); if (module) p.set('module', module); if (projectId) p.set('projectId', projectId);
    return p.toString();
  }, [range, profile, userId, module, projectId]);

  const overview = useApi(`/api/ops-intel/overview?${qs}`, [qs]);
  const ov = overview.data;
  const people = useMemo(() => (ov ? ov.ranking : []), [ov]);
  const [peopleAll, setPeopleAll] = useState([]);
  useEffect(() => { if (ov && !userId && !profile && !module && !projectId) setPeopleAll(ov.ranking.map((r) => ({ id: r.userId, name: r.name }))); }, [ov, userId, profile, module, projectId]);
  const projectOptions = useMemo(() => (ov ? ov.projects : []), [ov]);

  const openUser = useCallback((id) => { setUserId(id); setTab('pessoa'); }, []);

  return (
    <div className="page-root" style={S.page}>
      <style>{CSS}</style>
      <div className="oi-root">
        <div className="oi-head">
          <div className="oi-title">
            <div className="oi-ico"><Activity size={22} color="#F5C400" /></div>
            <div><h1>Inteligência Operacional</h1><p>Como a plataforma é usada pela equipe: presença, atividade, acessos e alertas. Logado como <strong>{currentUser.username}</strong>.</p></div>
          </div>
          <Button icon={ArrowLeft} onClick={onClose}>Voltar ao início</Button>
        </div>

        <div className="oi-filters">
          <div className="oi-field">Período
            <div className="oi-presets">{PRESETS.map((p) => <button key={p.id} type="button" className="oi-chip" aria-pressed={preset === p.id} onClick={() => pickPreset(p.id)}>{p.label}</button>)}</div>
          </div>
          <label className="oi-field">De<input type="date" value={range.from} max={range.to} onChange={(e) => { setPreset(0); setRange((r) => ({ ...r, from: e.target.value || r.from })); }} /></label>
          <label className="oi-field">Até<input type="date" value={range.to} min={range.from} max={todayIso()} onChange={(e) => { setPreset(0); setRange((r) => ({ ...r, to: e.target.value || r.to })); }} /></label>
          <label className="oi-field">Pessoa<select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Todas</option>{peopleAll.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="oi-field">Equipe (perfil)<select value={profile} onChange={(e) => setProfile(e.target.value)}><option value="">Todas</option>{Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="oi-field">Módulo<select value={module} onChange={(e) => setModule(e.target.value)}><option value="">Todos</option>{['company', 'personal', 'xflow', 'agenda', 'macro', 'crm', 'knowledge', 'pareceres', 'modelos', 'users', 'ops'].map((m) => <option key={m} value={m}>{modName(m)}</option>)}</select></label>
          <label className="oi-field">Empresa (cliente)<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Todas</option>{projectOptions.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
          {(userId || profile || module || projectId) && <Button size="sm" onClick={() => { setUserId(''); setProfile(''); setModule(''); setProjectId(''); }}>Limpar filtros</Button>}
        </div>

        <Tabs label="Seções da central" active={tab} onChange={setTab} tabs={[
          { id: 'geral', label: 'Visão geral', icon: BarChart3 }, { id: 'pessoas', label: 'Pessoas', icon: UsersIcon }, { id: 'pessoa', label: 'Linha do tempo', icon: Clock },
          { id: 'mapa', label: 'Mapa de acessos', icon: Globe }, { id: 'experiencia', label: 'Experiência de uso', icon: Smile }, { id: 'alertas', label: 'Alertas', icon: AlertTriangle, count: ov ? ov.alerts.high : 0 }, { id: 'metodo', label: 'Metodologia e privacidade', icon: ShieldCheck },
        ]} />

        <div style={{ marginTop: 14 }}>
          {overview.error && <div className="oi-err" role="alert">{overview.error}</div>}
          {tab === 'geral' && <Overview ov={ov} loading={overview.loading} heatSource={heatSource} setHeatSource={setHeatSource} onOpenUser={openUser} goAlerts={() => setTab('alertas')} />}
          {tab === 'pessoas' && <People ov={ov} loading={overview.loading} onOpenUser={openUser} />}
          {tab === 'pessoa' && <PersonTimeline qs={qs} userId={userId} people={people} peopleAll={peopleAll} onPick={setUserId} />}
          {tab === 'mapa' && <MapTab qs={qs} />}
          {tab === 'experiencia' && <ExperienceTab range={range} />}
          {tab === 'alertas' && <AlertsTab userId={userId} profile={profile} />}
          {tab === 'metodo' && <Method />}
        </div>
      </div>
    </div>
  );
}

function Overview({ ov, loading, heatSource, setHeatSource, onOpenUser, goAlerts }) {
  if (loading && !ov) return <div className="oi-empty">Carregando…</div>;
  if (!ov) return null;
  const k = ov.kpis; const totalMod = ov.modules.reduce((a, m) => a + m.seconds, 0);
  return (
    <>
      <div className="oi-banner"><ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{ov.coverage.note} <strong>Tempo conectado não é produtividade.</strong> O índice de atividade mostra só quanto do tempo conectado teve interação, e o resultado entregue é contado à parte. {ov.coverage.measuredUsers}/{ov.coverage.totalUsers} pessoas já têm tempo medido.</span></div>
      <div className="oi-kpis">
        <Kpi label="Pessoas ativas" value={fmtNum(k.activeUsers.value)} change={k.activeUsers.change} basis={k.activeUsers.basis} />
        <Kpi label="Acessos" value={fmtNum(k.accesses.value)} change={k.accesses.change} basis={k.accesses.basis} />
        <Kpi label="Tempo ativo medido" value={k.realActiveS.value ? fmtDur(k.realActiveS.value) : '—'} change={k.realActiveS.change} sub="a medição está começando" basis={k.realActiveS.basis} />
        <Kpi label="Tempo ativo estimado" value={fmtDur(k.estimatedActiveS.value)} change={k.estimatedActiveS.change} basis="estimado" />
        <Kpi label="Índice de atividade" value={k.activityIndex.value == null ? '—' : `${k.activityIndex.value}%`} sub="interação ÷ tempo conectado (só onde há medição)" basis={k.activityIndex.basis} />
        <Kpi label="Operações registradas" value={fmtNum(k.operations.value)} change={k.operations.change} basis={k.operations.basis} />
      </div>
      <div className="oi-grid2">
        <div className="oi-card"><h3>Atividade por dia</h3><div className="oi-hint">Tempo com interação somado de todas as pessoas filtradas. Passe o mouse para ver os números do dia.</div><DailyBars rows={ov.daily} /></div>
        <div className="oi-card">
          <h3>Alertas de comportamento atípico</h3><div className="oi-hint">{ov.alerts.total} no período, {ov.alerts.high} de gravidade alta. <button type="button" className="oi-chip" onClick={goAlerts}>Ver todos</button></div>
          <AlertList alerts={ov.alerts.top.slice(0, 3)} />
        </div>
      </div>
      <div className="oi-grid2">
        <div className="oi-card">
          <h3>Ranking de utilização</h3><div className="oi-hint">Ordenado por tempo ativo (medido + estimado). Clique numa pessoa para ver a linha do tempo.</div>
          <RankingTable rows={ov.ranking.slice(0, 8)} onOpenUser={onOpenUser} compact />
        </div>
        <div className="oi-card">
          <h3>Atividade por horário</h3>
          <div className="oi-hint" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="oi-seg" role="group" aria-label="Fonte do mapa de calor"><button type="button" aria-pressed={heatSource === 'measured'} onClick={() => setHeatSource('measured')}>Medido</button><button type="button" aria-pressed={heatSource === 'estimated'} onClick={() => setHeatSource('estimated')}>Estimado</button></span>
            <span>{heatSource === 'measured' ? 'minutos com interação' : 'eventos registrados'}</span>
          </div>
          <Heat matrix={heatSource === 'measured' ? ov.heat.measured : ov.heat.estimated} unit={(v) => (heatSource === 'measured' ? fmtDur(v) : `${v} evento(s)`)} />
        </div>
      </div>
      <div className="oi-grid3">
        <div className="oi-card"><h3>Onde o tempo é gasto, por módulo</h3><div className="oi-hint">Só tempo medido.</div><HBars rows={ov.modules.slice(0, 8)} valueOf={(m) => m.seconds} labelOf={(m) => modName(m.module)} format={(m) => `${fmtDur(m.seconds)}${totalMod ? ` · ${Math.round((m.seconds / totalMod) * 100)}%` : ''}`} empty="Sem tempo medido neste período." /></div>
        <div className="oi-card"><h3>Distribuição por empresa (cliente)</h3><div className="oi-hint">Tempo medido na empresa aberta + operações registradas nela.</div><HBars rows={ov.projects.slice(0, 8)} valueOf={(p) => p.seconds || p.operations * 60} labelOf={(p) => p.name} format={(p) => `${p.seconds ? fmtDur(p.seconds) : '—'} · ${p.operations} op.`} empty="Sem atividade por empresa." /></div>
        <div className="oi-card"><h3>Comparativo por equipe</h3><div className="oi-hint">Por perfil de acesso.</div>
          <div className="oi-table-wrap"><table className="oi-table"><thead><tr><th>Equipe</th><th className="num">Pessoas</th><th className="num">Acessos</th><th className="num">Ativo</th><th className="num">Oper.</th></tr></thead><tbody>
            {ov.byProfile.map((p) => <tr key={p.role}><td>{ROLE_NAMES[p.role] || p.role}</td><td className="num">{p.users}</td><td className="num">{fmtNum(p.accesses)}</td><td className="num">{fmtDur(p.realActiveS + p.estimatedActiveS)}</td><td className="num">{fmtNum(p.operations)}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}

function RankingTable({ rows, onOpenUser, compact }) {
  if (!rows.length) return <div className="oi-empty">Sem atividade neste período.</div>;
  return (
    <div className="oi-table-wrap"><table className="oi-table">
      <thead><tr><th>Pessoa</th><th className="num">Acessos</th>{!compact && <th className="num">Dias ativos</th>}<th className="num">Ativo medido</th><th className="num">Ativo estimado</th>{!compact && <th className="num">Conectado</th>}<th className="num">Índice</th><th className="num">Oper.</th>{!compact && <th>Último acesso</th>}<th>Base</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.userId} className="is-click" onClick={() => onOpenUser(r.userId)}>
          <td><div className="oi-name">{r.name}</div><div className="oi-role">{ROLE_NAMES[r.role] || r.role}</div></td>
          <td className="num">{fmtNum(r.accesses)}</td>{!compact && <td className="num">{r.activeDays}</td>}
          <td className="num">{r.realActiveS ? fmtDur(r.realActiveS) : '—'}</td><td className="num">{r.estimatedActiveS ? fmtDur(r.estimatedActiveS) : '—'}</td>
          {!compact && <td className="num">{r.realConnectedS ? fmtDur(r.realConnectedS) : '—'}</td>}
          <td className="num">{r.activityIndex == null ? '—' : `${r.activityIndex}%`}</td><td className="num">{fmtNum(r.operations)}</td>
          {!compact && <td>{fmtWhen(r.lastAt)}</td>}<td><Basis basis={r.basis} /></td>
        </tr>))}</tbody>
    </table></div>
  );
}

function People({ ov, loading, onOpenUser }) {
  if (loading && !ov) return <div className="oi-empty">Carregando…</div>;
  if (!ov) return null;
  return <div className="oi-card"><h3>Pessoas</h3><div className="oi-hint">Todos os usuários do filtro. "Ativo medido" só existe para a equipe PRICETAX depois que o rastreador entrou no ar; antes disso o tempo é estimado e vem marcado como tal. Clientes aparecem só com acessos (segurança).</div><RankingTable rows={ov.ranking} onOpenUser={onOpenUser} /></div>;
}

function PersonTimeline({ qs, userId, people, peopleAll, onPick }) {
  const id = userId || (people[0] && people[0].userId) || '';
  const base = qs.replace(/(^|&)(userId|module|projectId|profile)=[^&]*/g, '');
  const st = useApi(id ? `/api/ops-intel/users/${encodeURIComponent(id)}?${base.replace(/^&/, '')}` : '/api/ops-intel/policy', [id, base]);
  if (!id) return <div className="oi-empty">Escolha uma pessoa.</div>;
  const d = st.data;
  return (
    <>
      <div className="oi-filters"><label className="oi-field">Pessoa<select value={id} onChange={(e) => onPick(e.target.value)}>{(peopleAll.length ? peopleAll : people.map((p) => ({ id: p.userId, name: p.name }))).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></div>
      {st.error && <div className="oi-err" role="alert">{st.error}</div>}
      {st.loading && !d && <div className="oi-empty">Carregando…</div>}
      {d && d.user && (
        <>
          {!d.tracked && <div className="oi-banner">Este perfil ({ROLE_NAMES[d.user.role] || d.user.role}) não tem tempo medido por regra de privacidade; aparecem só os acessos de segurança.</div>}
          <div className="oi-kpis">
            <Kpi label="Acessos" value={fmtNum(d.totals.accesses)} basis="real" />
            <Kpi label="Tempo ativo medido" value={d.totals.realActiveS ? fmtDur(d.totals.realActiveS) : '—'} sub={`${d.totals.realDays} dia(s) medidos`} basis={d.totals.realActiveS ? 'real' : 'indisponivel'} />
            <Kpi label="Tempo ativo estimado" value={fmtDur(d.totals.estimatedActiveS)} sub={`${d.totals.estimatedDays} dia(s) estimados`} basis="estimado" />
            <Kpi label="Tempo ocioso medido" value={d.totals.realConnectedS ? fmtDur(d.totals.idleS) : '—'} sub="conectado sem interação" basis={d.totals.realConnectedS ? 'real' : 'indisponivel'} />
            <Kpi label="Índice de atividade" value={d.totals.activityIndex == null ? '—' : `${d.totals.activityIndex}%`} sub="só dias medidos" basis={d.totals.activityIndex == null ? 'indisponivel' : 'real'} />
            <Kpi label="Operações registradas" value={fmtNum(d.totals.operations)} basis="real" />
          </div>
          <div className="oi-grid2">
            <div className="oi-card"><h3>Dia a dia</h3><div className="oi-hint">Primeiro e último evento do dia, sessões (separadas por 30 min sem atividade) e tempo.</div>
              <div className="oi-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="oi-table"><thead><tr><th>Dia</th><th>Primeiro</th><th>Último</th><th className="num">Acessos</th><th className="num">Sessões</th><th className="num">Conectado</th><th className="num">Ativo</th><th className="num">Índice</th><th>Base</th></tr></thead><tbody>
                {d.days.length === 0 && <tr><td colSpan={9} className="oi-empty">Sem atividade no período.</td></tr>}
                {d.days.map((r) => <tr key={r.date}><td>{dayLabel(r.date)}</td><td>{fmtHour(r.first)}</td><td>{fmtHour(r.last)}</td><td className="num">{r.accesses}</td><td className="num">{r.sessions}</td><td className="num">{r.connectedS == null ? '—' : fmtDur(r.connectedS)}</td><td className="num">{r.activeS == null ? '—' : fmtDur(r.activeS)}</td><td className="num">{r.activityIndex == null ? '—' : `${r.activityIndex}%`}</td><td><Basis basis={r.basis} /></td></tr>)}
              </tbody></table></div>
            </div>
            <div className="oi-card"><h3>Tempo por módulo e tela</h3><div className="oi-hint">Só tempo medido.</div>
              <HBars rows={d.modules.slice(0, 6)} valueOf={(m) => m.seconds} labelOf={(m) => modName(m.module)} format={(m) => fmtDur(m.seconds)} empty="Sem tempo medido." />
              <div style={{ height: 12 }} />
              <HBars rows={d.views.slice(0, 6)} valueOf={(m) => m.seconds} labelOf={(m) => { const [a, b] = m.key.split(':'); return `${modName(a)}${b && b !== '-' ? ` · ${VIEW_NAMES[b] || b}` : ''}`; }} format={(m) => fmtDur(m.seconds)} empty="" />
            </div>
          </div>
          <div className="oi-grid2">
            <div className="oi-card"><h3>Empresas acessadas</h3><div className="oi-hint">Tempo medido com a empresa aberta.</div><HBars rows={d.projects} valueOf={(p) => p.seconds} labelOf={(p) => p.name} format={(p) => fmtDur(p.seconds)} empty="Sem tempo medido por empresa." /></div>
            <div className="oi-card"><h3>Atividade por horário</h3><div className="oi-hint">Medido (se houver) ou estimado.</div><Heat matrix={d.heat.measured.flat().some((v) => v > 0) ? d.heat.measured : d.heat.estimated} unit={(v) => fmtDur(v)} /></div>
          </div>
          <div className="oi-card"><h3>Linha do tempo individual</h3><div className="oi-hint">Acessos, ações e registros do sistema, do mais recente ao mais antigo (até 300). O conteúdo do que foi escrito não é guardado.</div>
            {d.timeline.length === 0 && <div className="oi-empty">Nada registrado no período.</div>}
            {(() => { let last = ''; return d.timeline.map((t, i) => { const day = new Date(t.at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }); const head = day !== last; last = day; return (<React.Fragment key={i}>{head && <div className="oi-tl-day">{day}</div>}<div className="oi-tl-item"><span className="oi-tl-t">{fmtHour(t.at)}</span><span>{t.label}{t.detail ? <span style={{ color: 'var(--text-4)' }}> · {t.detail}</span> : null}{t.device ? <span style={{ color: 'var(--text-5)' }}> · {t.device}</span> : null}<span className="oi-tl-src">{t.source}</span></span></div></React.Fragment>); }); })()}
          </div>
        </>
      )}
    </>
  );
}

function MapTab({ qs }) {
  const base = qs.replace(/(^|&)(module|projectId)=[^&]*/g, '').replace(/^&/, '');
  const st = useApi(`/api/ops-intel/map?${base}`, [base]);
  const [pick, setPick] = useState(null);
  const d = st.data;
  return (
    <>
      {st.error && <div className="oi-err" role="alert">{st.error}</div>}
      {d && <div className="oi-banner"><Globe size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{d.accuracy}{d.withoutCoords ? ` ${d.withoutCoords} acesso(s) estão sem coordenadas e aparecem só na lista.` : ''}</span></div>}
      <Suspense fallback={<div className="oi-empty">Carregando o mapa…</div>}>{d ? <AccessMap points={d.points} onPick={setPick} /> : <div className="oi-empty">Carregando…</div>}</Suspense>
      {d && d.points.length === 0 && <div className="oi-empty">Nenhum acesso com localização neste período.</div>}
      <div className="oi-grid2" style={{ marginTop: 14 }}>
        <div className="oi-card"><h3>{pick ? `${[pick.city, pick.region, pick.country].filter(Boolean).join(', ')}` : 'Locais usados'}</h3><div className="oi-hint">{pick ? `${pick.count} acesso(s) · de ${fmtWhen(pick.firstAt)} a ${fmtWhen(pick.lastAt)}${pick.devices.length ? ` · ${pick.devices.map((x) => x.name).join(', ')}` : ''}` : 'Clique num ponto do mapa para detalhar. Vermelho = tem alerta.'}</div>
          <div className="oi-table-wrap"><table className="oi-table"><thead><tr><th>Local (aproximado)</th><th className="num">Acessos</th><th>Pessoas</th><th>Último</th></tr></thead><tbody>
            {(d ? d.points : []).map((p, i) => <tr key={i} className="is-click" onClick={() => setPick(p)}><td>{p.flagged ? '⚠ ' : ''}{[p.city, p.region, p.country].filter(Boolean).join(', ') || 'Não identificado'}</td><td className="num">{p.count}</td><td>{p.users.slice(0, 3).map((u) => u.name).join(', ')}</td><td>{fmtWhen(p.lastAt)}</td></tr>)}
          </tbody></table></div>
        </div>
        <div className="oi-card"><h3>Últimos acessos</h3><div className="oi-hint">IP parcialmente oculto. O IP completo fica na Gestão de Usuários.</div>
          <div className="oi-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="oi-table"><thead><tr><th>Quando</th><th>Pessoa</th><th>Evento</th><th>Local</th><th>Dispositivo</th></tr></thead><tbody>
            {(d ? d.events : []).map((e) => <tr key={e.id}><td>{fmtWhen(e.at)}</td><td>{e.userName}</td><td style={e.kind === 'login_failed' ? { color: 'var(--oi-bad)' } : undefined}>{KIND[e.kind] || e.kind}</td><td>{[e.city, e.region].filter(Boolean).join('/') || '—'}{e.country ? ` · ${e.country}` : ''}{e.ip ? ` · ${e.ip}` : ''}</td><td>{e.device || '—'}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}

function AlertsTab({ userId, profile }) {
  const [days, setDays] = useState(30);
  const q = new URLSearchParams({ days: String(days) }); if (userId) q.set('userId', userId); if (profile) q.set('profile', profile);
  const st = useApi(`/api/ops-intel/alerts?${q.toString()}`, [days, userId, profile]);
  const d = st.data;
  return (
    <>
      <div className="oi-filters"><div className="oi-field">Janela recente<span className="oi-seg" role="group" aria-label="Janela dos alertas">{[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} dias</button>)}</span></div></div>
      {st.error && <div className="oi-err" role="alert">{st.error}</div>}
      {d && <div className="oi-banner"><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{d.note}</span></div>}
      {st.loading && !d ? <div className="oi-empty">Carregando…</div> : <AlertList alerts={d ? d.alerts : []} />}
    </>
  );
}

// Satisfação e atrito POR FLUXO (nunca por pessoa): execuções, taxa de sucesso, desfeitos, tempo mediano, nota de 1 a 5 e onde mais dá erro.
const tone = (ok) => (ok == null ? undefined : { color: ok ? '#3ecf6e' : '#e2574c', fontWeight: 700 });
const secs = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
function ExperienceTab({ range }) {
  const st = useApi(`/api/ops-intel/experience?from=${range.from}&to=${range.to}`, [range.from, range.to]);
  const d = st.data;
  const goals = d ? d.goals : { csat: 4.5, success: 0.9 };
  const active = d ? d.flows.filter((f) => f.runs > 0 || f.csat.n > 0) : [];
  return (
    <>
      <div className="oi-banner"><ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>Mede o <strong>produto</strong>, não a pessoa: cada linha é um fluxo (ex.: "Concluir follow-up"), com resultado, duração e nota de 1 clique. Não guarda texto digitado, mouse nem tempo de tela, e nenhuma tela mostra quem fez. Metas iniciais de validação: sucesso ≥ {Math.round(goals.success * 100)}% e nota ≥ {String(goals.csat).replace('.', ',')}/5.</span></div>
      {st.error && <div className="oi-err" role="alert">{st.error}</div>}
      {st.loading && !d ? <div className="oi-empty">Carregando…</div> : (
        <>
          {!active.length && <div className="oi-empty">Ainda não há execuções medidas neste período. Os fluxos do CRM começam a aparecer conforme a equipe usa o painel.</div>}
          {active.length > 0 && (
            <div className="oi-card"><div className="oi-table-wrap"><table className="oi-table">
              <thead><tr><th>Fluxo</th><th className="num">Execuções</th><th className="num">Sucesso</th><th className="num">Erros</th><th className="num">Desfeitos</th><th className="num">Tempo mediano</th><th className="num">90% em até</th><th className="num">Nota (respostas)</th></tr></thead>
              <tbody>{active.map((f) => (
                <tr key={f.flow}>
                  <td>{f.label}</td><td className="num">{f.runs}</td>
                  <td className="num" style={tone(f.successRate == null ? null : f.successRate / 100 >= goals.success)}>{f.successRate == null ? '—' : `${String(f.successRate).replace('.', ',')}%`}</td>
                  <td className="num" style={f.errors ? { color: '#e2574c', fontWeight: 700 } : undefined}>{f.errors}</td>
                  <td className="num">{f.undo}{f.runs ? ` (${String(f.undoRate).replace('.', ',')}%)` : ''}</td>
                  <td className="num">{secs(f.p50Ms)}</td><td className="num">{secs(f.p90Ms)}</td>
                  <td className="num" style={tone(f.csat.avg == null ? null : f.csat.avg >= goals.csat)}>{f.csat.avg == null ? '—' : `${String(f.csat.avg).replace('.', ',')} (${f.csat.n})`}</td>
                </tr>))}</tbody>
            </table></div></div>
          )}
          {d && d.errorRoutes.length > 0 && (
            <div className="oi-card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Onde mais dá erro</h3>
              <div className="oi-table-wrap"><table className="oi-table"><thead><tr><th>Rota (tipo)</th><th className="num">Status</th><th className="num">Vezes</th></tr></thead>
                <tbody>{d.errorRoutes.map((r, i) => <tr key={i}><td>{r.route}</td><td className="num">{r.status || 'sem rede'}</td><td className="num">{r.n}</td></tr>)}</tbody></table></div>
              <div style={{ marginTop: 6, color: 'var(--text-4)', fontSize: 12 }}>Status 4xx são recusas esperadas (validação, permissão); 5xx e "sem rede" são falhas do produto ou da conexão.</div>
            </div>
          )}
          {d && d.comments.length > 0 && (
            <div className="oi-card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>O que atrapalhou (notas até 3, sem nome)</h3>
              <ul>{d.comments.map((c, i) => <li key={i}><strong>{c.label}</strong> · nota {c.score} · {new Date(c.at).toLocaleDateString('pt-BR')} — {c.comment}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Method() {
  const st = useApi('/api/ops-intel/policy', []);
  const p = st.data && st.data.policy;
  return (
    <div className="oi-card oi-doc">
      <h3 style={{ marginTop: 0 }}>Como cada número é calculado</h3>
      <ul>
        <li><strong>Medido.</strong> A cada 15 segundos o app conta se a aba está visível (<em>conectado</em>) e se houve mouse, teclado ou rolagem nos últimos 60 segundos (<em>ativo</em>), no módulo, tela e empresa abertos. As contagens são enviadas em fatias a cada minuto. Só perfis Master e PRICETAX.</li>
        <li><strong>Ocioso</strong> = conectado − ativo. <strong>Índice de atividade</strong> = ativo ÷ conectado, só nos dias com medição. Ele não mede qualidade nem entrega.</li>
        <li><strong>Estimado.</strong> Onde não há medição (antes do rastreador ou perfis não medidos), usamos eventos que já existiam: acessos, histórico das empresas, cartões, XFlow, CRM, perguntas à RENATA e envio de reuniões. Um intervalo entre dois eventos seguidos conta no máximo <code>5 min</code>, o último evento de cada sessão conta <code>1 min</code>, e uma sessão termina após <code>30 min</code> sem evidência. Quem faz uma coisa a cada 40 minutos aparece com pouco tempo: é o limite da estimativa, não um julgamento.</li>
        <li><strong>Dia com medição</strong> usa só o medido; <strong>dia sem medição mas com eventos</strong> usa a estimativa; <strong>dia sem nada</strong> fica de fora (indisponível).</li>
        <li><strong>Operações registradas</strong> = ações medidas (exportar, enviar, compartilhar) + registros do sistema. O histórico das empresas guarda só as últimas 300 ações de cada empresa e identifica a pessoa pelo nome; nomes repetidos ficam de fora.</li>
        <li><strong>Experiência de uso.</strong> A aba própria mede fluxos do produto (nome do fluxo, resultado, duração, tipo de rota que falhou) e a nota de 1 clique. Não coleta texto digitado, mouse nem tempo de tela; agrega por fluxo e nunca por pessoa. O pedido de nota é raro (no máximo 1 a cada 14 dias por pessoa) e pode ser dispensado.</li>
        <li><strong>Local.</strong> Cidade, estado e país vêm do IP por um serviço externo (ipwho.is); o ponto no mapa é o centro da cidade com círculo de 25 km. Não é coordenada exata.</li>
        <li><strong>Alertas.</strong> Regras fixas e visíveis: país novo, cidade nova, dispositivo novo (comparados ao histórico da própria pessoa, com mínimo de 5 a 10 acessos), dois locais a mais de 300 km a mais de 900 km/h, 3 senhas erradas em 24 h, 3 IPs em 1 h, madrugada fora do padrão e um IP errando várias contas.</li>
      </ul>
      {st.error && <div className="oi-err" role="alert">{st.error}</div>}
      {p && (<>
        <h3>{p.title}</h3>
        <p><strong>Finalidade.</strong> {p.purpose}</p><p><strong>Base legal.</strong> {p.legalBasis}</p>
        <p><strong>O que é coletado</strong></p><ul>{p.collected.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p><strong>O que NÃO é coletado</strong></p><ul>{p.notCollected.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p><strong>Quem vê.</strong> {p.access}</p><p><strong>Retenção.</strong> {p.retention}</p>
      </>)}
    </div>
  );
}
