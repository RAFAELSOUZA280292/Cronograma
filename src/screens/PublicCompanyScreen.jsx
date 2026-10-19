// Página pública de acompanhamento da empresa (2026-10-19): /acompanhamento/<token>. Só leitura, sem login; "Entrar para editar" leva ao login normal.
// O servidor (server/companyShare.js) só manda título, fase, status, datas, responsável e subatividades. Resumo, Cronograma (Gantt com subatividades) e Tabela (uma subatividade por linha).
import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { S } from '../styles/S.js';

const DAY = 86400000;
const iso = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN);
const fmt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const fmtShort = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
// Quem responde: PRICETAX, a empresa (qualquer área do cliente) ou os dois ("Todas"). Sem responsável fica sem etiqueta.
const sideOf = (r) => { const t = String(r || '').trim(); return /pricetax/i.test(t) ? 'pricetax' : /^todas?$/i.test(t) ? 'ambos' : t ? 'empresa' : 'indef'; };
// Marcos legais da reforma (nacionais, iguais para toda empresa). Cada um traz a fonte; o que não está na norma conferida fica marcado "a confirmar".
// Conferido em 2026-10-19 no texto da EC 132/2023 (ADCT arts. 125 a 129 e 134) e da LC 214/2025 (art. 378). `link` casa passos do cronograma da empresa com o marco.
const LEGAL = [
  { id: 'teste', date: '2026-01-01', until: '2026-12-31', title: 'Ano de teste da reforma (2026)', text: 'CBS a 0,9% e IBS a 0,1%, compensáveis com PIS e COFINS. Quem cumpre as obrigações acessórias pode ser dispensado do recolhimento.', src: 'EC 132/2023, ADCT art. 125', link: null },
  { id: 'aliq', date: '2026-12-15', title: 'Alíquota de referência da CBS', text: 'Divulgação da alíquota que vale em 2027 (estimativa de trabalho de 9,2% a 9,3%).', src: 'Informado nas reuniões; a confirmar na norma', tentative: true, link: /cartas com o preço esperado|pedido de compra e tabela|congelar o preço/i },
  { id: 'pis', date: '2026-12-31', title: 'Último dia de PIS e COFINS', text: 'PIS e COFINS acabam com a entrada da CBS. Os créditos que sobrarem continuam válidos se estiverem registrados na escrituração: compensam a CBS ou podem ser ressarcidos.', src: 'EC 132, ADCT art. 126, II; LC 214, art. 378', link: /levantar os saldos credores|registrar o que precisa|EFD Contribuições|aprovar o plano|inventário de pendências/i },
  { id: 'cbs', date: '2027-01-01', title: 'A CBS passa a valer', text: 'CBS cobrada, PIS e COFINS extintos, IPI com alíquota zero (exceto produtos com industrialização incentivada na Zona Franca de Manaus) e Imposto Seletivo. O IBS começa com 0,05% estadual mais 0,05% municipal em 2027 e 2028, e a CBS é reduzida em 0,1 ponto.', src: 'EC 132, ADCT arts. 126 e 127', link: /prontidão d|ata de prontidão|primeira nota/i },
  { id: 'icms', date: '2029-01-01', title: 'ICMS e ISS começam a sair', text: 'As alíquotas de ICMS e ISS caem para 9/10 em 2029, 8/10 em 2030, 7/10 em 2031 e 6/10 em 2032, e os benefícios fiscais caem na mesma proporção.', src: 'EC 132, ADCT art. 128', link: /TTD|benefício/i },
  { id: 'fim', date: '2033-01-01', title: 'ICMS e ISS extintos', text: 'Os saldos credores de ICMS que existirem no fim de 2032 e forem homologados são compensados com o IBS, nos termos de lei complementar.', src: 'EC 132, ADCT arts. 129 e 134', link: null },
];
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const mondayOf = (s) => { const d = new Date(`${s}T00:00:00Z`).getUTCDay(); return addDays(s, -((d + 6) % 7)); };
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const fmtDay = (s) => `${DOW[new Date(`${s}T00:00:00Z`).getUTCDay()]} ${fmtShort(s)}`;
const STATUS = {
  'nao-iniciado': { label: 'Não iniciado', color: 'var(--text-6)' },
  pendente: { label: 'Pendente', color: 'var(--text-6)' },
  'em-andamento': { label: 'Em andamento', color: '#F5C400' },
  pausado: { label: 'Pausado', color: '#ff9f40' },
  concluido: { label: 'Concluído', color: '#3ecf6e' },
  atrasada: { label: 'Atrasada', color: '#e2574c' },
};
const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#b583ff', '#ff9f40'];
const WEEK_PX = 64;

const CSS = `
  .pc-wrap { max-width:1180px; margin:0 auto; padding:20px 16px 0; }
  .pc-head { display:flex; flex-wrap:wrap; align-items:center; gap:14px 18px; }
  .pc-logo { width:52px; height:52px; border-radius:12px; background:#fff; object-fit:contain; border:1px solid var(--border-2); flex-shrink:0; }
  .pc-ini { width:52px; height:52px; border-radius:12px; background:var(--bg-3); color:var(--text-1); font-weight:800; font-size:20px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .pc-eyebrow { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent, #F5C400); }
  .pc-title { font-size:26px; font-weight:800; margin:2px 0 0; color:var(--text-1); }
  .pc-sub { font-size:12.5px; color:var(--text-5); margin-top:2px; }
  .pc-grow { flex:1 1 20px; }
  .pc-btn { display:inline-flex; align-items:center; justify-content:center; min-height:40px; padding:0 16px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; border:1px solid var(--border-3); background:var(--bg-2); color:var(--text-1); }
  .pc-btn.pri { background:var(--ui-accent, #F5C400); color:#17171f; border-color:transparent; }
  .pc-btn:focus-visible, .pc-tab:focus-visible, .pc-exp:focus-visible { outline:2px solid #3ea6ff; outline-offset:2px; }
  .pc-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin:20px 0 14px; }
  .pc-kpi { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:12px 14px; }
  .pc-kpi b { display:block; font-size:26px; font-weight:800; color:var(--text-1); }
  .pc-kpi span { font-size:11.5px; color:var(--text-5); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
  .pc-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; margin-bottom:14px; }
  .pc-bar { height:10px; border-radius:999px; background:var(--bg-3); overflow:hidden; }
  .pc-bar > i { display:block; height:100%; border-radius:999px; }
  .pc-ph { display:grid; grid-template-columns:140px minmax(0,1fr) 44px; gap:10px; align-items:center; font-size:13px; padding:5px 0; }
  .pc-tabs { display:flex; gap:6px; margin:6px 0 12px; flex-wrap:wrap; }
  .pc-tab { min-height:40px; padding:0 16px; border-radius:10px; border:1px solid var(--border-2); background:transparent; color:var(--text-3); font-weight:700; font-size:13px; cursor:pointer; }
  .pc-tab[aria-selected="true"] { background:var(--bg-3); color:var(--text-1); border-color:var(--border-3); }
  .pc-chip { display:inline-block; align-self:start; line-height:1.5; font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; color:#17171f; white-space:nowrap; }
  .pc-next { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:6px 12px; align-items:center; padding:9px 0; border-top:1px solid var(--border-1); font-size:13.5px; }
  .pc-next .pc-chip { justify-self:start; }
  .pc-next:first-of-type { border-top:none; }
  .pc-end { display:flex; gap:6px; align-items:flex-start; justify-content:flex-end; flex-wrap:wrap; }
  .pc-side { display:inline-block; font-size:11px; font-weight:800; letter-spacing:.04em; padding:2px 9px; border-radius:6px; line-height:1.5; white-space:nowrap; text-transform:uppercase; }
  .pc-side.pricetax { background:#17171f; color:#F5C400; border:1px solid #F5C40088; }
  .pc-side.empresa { background:#3ea6ff; color:#06223d; }
  .pc-side.ambos { background:var(--bg-3); color:var(--text-1); border:1px solid var(--border-3); }
  .pc-wait .pc-step:first-of-type { border-top:none; }
  .pc-lg { display:grid; grid-template-columns:104px minmax(0,1fr); gap:6px 16px; padding:14px 0; border-top:1px solid var(--border-1); }
  .pc-lg:first-of-type { border-top:none; }
  .pc-lg .dt { font-weight:800; font-variant-numeric:tabular-nums; color:var(--text-1); font-size:15px; }
  .pc-lg .tt { font-weight:800; font-size:15px; color:var(--text-1); }
  .pc-lg .tx { color:var(--text-2); font-size:13.5px; line-height:1.55; margin-top:2px; }
  .pc-src { display:inline-block; font-size:11px; font-weight:700; padding:1px 8px; border-radius:6px; border:1px solid var(--border-3); color:var(--text-4); margin-top:6px; }
  .pc-src.tent { border-color:#ff9f40; color:#ff9f40; }
  .pc-link { margin-top:8px; padding:8px 12px; background:var(--bg-3); border-radius:8px; font-size:12.5px; color:var(--text-3); }
  .pc-link b { color:var(--text-1); }
  .pc-who { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 10px; }
  .pc-wk { margin:14px 0 4px; font-size:12px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-4); display:flex; justify-content:space-between; gap:10px; }
  .pc-wk.late { color:#e2574c; }
  .pc-step { display:grid; grid-template-columns:78px minmax(0,1fr) auto; gap:4px 12px; align-items:start; padding:9px 0; border-top:1px solid var(--border-1); font-size:13.5px; }
  .pc-step .d { font-weight:800; font-variant-numeric:tabular-nums; color:var(--text-2); }
  .pc-step .t { font-weight:700; color:var(--text-1); }
  .pc-doing { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; align-items:start; padding:9px 0; border-top:1px solid var(--border-1); }
  .pc-doing .pc-chip { align-self:start; justify-self:end; }
  .pc-doing:first-of-type { border-top:none; }
  .pc-muted { color:var(--text-5); font-size:12px; }
  .pc-scroll { overflow-x:auto; border:1px solid var(--border-1); border-radius:12px; background:var(--bg-2); }
  .pc-g { position:relative; }
  .pc-gr { display:flex; border-top:1px solid var(--border-1); min-height:40px; }
  .pc-gr.ph { background:var(--bg-3); font-weight:800; font-size:12.5px; min-height:34px; }
  .pc-gl { flex:0 0 280px; position:sticky; left:0; z-index:2; background:inherit; background-color:var(--bg-2); padding:7px 10px; border-right:1px solid var(--border-1); display:flex; align-items:center; gap:6px; font-size:13px; min-width:0; }
  .pc-gr.ph .pc-gl { background-color:var(--bg-3); }
  .pc-gl span.t { overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.3; }
  .pc-gl.sub { padding-left:30px; font-size:12.5px; color:var(--text-3); }
  .pc-gt { position:relative; flex:1 0 auto; }
  .pc-gh { display:flex; }
  .pc-gh div { flex:0 0 ${WEEK_PX}px; font-size:11px; font-weight:700; color:var(--text-4); padding:8px 0; text-align:center; border-right:1px solid var(--border-1); }
  .pc-b { position:absolute; top:9px; height:22px; border-radius:7px; min-width:10px; }
  .pc-bl { position:absolute; top:11px; font-size:11px; font-weight:700; color:#17171f; padding:0 7px; white-space:nowrap; line-height:18px; }
  .pc-dm { position:absolute; top:13px; width:14px; height:14px; transform:rotate(45deg); border-radius:3px; margin-left:-7px; }
  .pc-today { position:absolute; top:0; bottom:0; width:2px; background:#e2574c; z-index:1; }
  .pc-exp { all:unset; cursor:pointer; width:22px; height:22px; flex:0 0 22px; text-align:center; font-weight:800; color:var(--text-3); border-radius:6px; }
  .pc-exp:hover { background:var(--bg-4, var(--bg-3)); }
  .pc-tbl { width:100%; border-collapse:collapse; font-size:13px; min-width:760px; }
  .pc-tbl th { text-align:left; font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--text-5); padding:9px 10px; border-bottom:1px solid var(--border-2); background:var(--bg-3); }
  .pc-tbl td { padding:8px 10px; border-top:1px solid var(--border-1); vertical-align:top; }
  .pc-tbl tr.a td { font-weight:700; }
  .pc-tbl tr.s td:nth-child(2) { padding-left:30px; color:var(--text-3); }
  .pc-foot { margin:22px 0 8px; font-size:12px; color:var(--text-5); text-align:center; }
  @media (max-width:767px) { .pc-lg { grid-template-columns:1fr; } .pc-step { grid-template-columns:64px minmax(0,1fr); } .pc-step .pc-end { grid-column:2; justify-self:start; justify-content:flex-start; } .pc-title { font-size:21px; } .pc-ph { grid-template-columns:100px minmax(0,1fr) 40px; } .pc-gl { flex-basis:170px; } .pc-next { grid-template-columns:1fr; } }
  @media print { .no-print { display:none !important; } .pc-scroll { overflow:visible; } body { background:#fff; } }
`;

function Chip({ kind }) {
  const m = STATUS[kind] || STATUS['nao-iniciado'];
  return <span className="pc-chip" style={{ background: m.color }}>{m.label}</span>;
}

export default function PublicCompanyScreen({ token }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [tab, setTab] = useState('resumo');
  const [open, setOpen] = useState(() => new Set());
  const [who, setWho] = useState('todos');
  const [allWeeks, setAllWeeks] = useState(false);

  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow';
    apiGet(`/api/public-company/${token}`)
      .then((data) => setState({ loading: false, error: '', data }))
      .catch((e) => setState({ loading: false, error: (e && e.message) || 'Este link não é válido ou foi desativado. Peça um novo a quem o enviou.', data: null }));
  }, [token]);

  const view = useMemo(() => {
    const d = state.data; if (!d) return null;
    const today = d.today;
    const late = (a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < today;
    const acts = d.activities.map((a) => ({ ...a, eff: late(a) ? 'atrasada' : a.status, subs: a.subs.map((s) => ({ ...s, eff: s.done ? 'concluido' : (s.date && s.date < today ? 'atrasada' : 'pendente') })) }));
    const phases = d.phases.map((p, i) => ({ ...p, color: PHASE_COLORS[i % PHASE_COLORS.length], list: acts.filter((a) => a.phase === p.id) })).filter((p) => p.list.length);
    const loose = acts.filter((a) => !d.phases.some((p) => p.id === a.phase));
    if (loose.length) phases.push({ id: 'x', name: 'Outras', color: PHASE_COLORS[4], list: loose });
    const count = (st) => acts.filter((a) => a.eff === st).length;
    const done = count('concluido');
    const dates = acts.flatMap((a) => [a.date, a.endDate, ...a.subs.map((s) => s.date)]).filter((x) => !Number.isNaN(iso(x)));
    let min = dates.length ? Math.min(...dates.map(iso)) : Date.parse(`${today}T00:00:00Z`);
    min = Math.min(min, Date.parse(`${today}T00:00:00Z`));
    const wd = new Date(min).getUTCDay(); min -= ((wd + 6) % 7) * DAY;
    let max = dates.length ? Math.max(...dates.map(iso)) : min + 28 * DAY;
    max = Math.max(max, Date.parse(`${today}T00:00:00Z`) + 14 * DAY);
    const weeks = Math.min(80, Math.ceil((max - min) / (7 * DAY)) + 1);
    return {
      diasVirada: Math.max(0, Math.round((Date.parse('2027-01-01T00:00:00Z') - Date.parse(`${today}T00:00:00Z`)) / DAY)), today, acts, phases, done, total: acts.length, pct: acts.length ? Math.round((done / acts.length) * 100) : 0,
      doingN: count('em-andamento'), lateN: count('atrasada'), min, weeks,
      doing: acts.filter((a) => a.eff === 'em-andamento'),
      steps: (() => {
        const out = [];
        for (const a of acts) {
          if (a.eff === 'concluido') continue;
          const open = a.subs.filter((x) => !x.done);
          if (a.subs.length === 0) out.push({ id: a.id, date: a.date, title: a.title, parent: '', resp: a.responsible, eff: a.eff });
          else for (const x of open) out.push({ id: x.id, date: x.date || a.date, title: x.title, parent: a.title, resp: x.responsible || a.responsible, eff: x.eff });
        }
        return out.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999') || x.parent.localeCompare(y.parent));
      })(),
    };
  }, [state.data]);

  if (state.loading) return <div className="page-root" style={S.page}><div style={S.loginWrap}><div style={S.loginBox}><p style={S.loginSub}>Carregando…</p></div></div></div>;
  if (state.error || !view) {
    return (
      <div className="page-root" style={S.page}>
        <div style={S.loginWrap}><div style={S.loginBox}>
          <h1 style={S.loginTitle}>Link indisponível</h1>
          <p style={S.loginSub}>{state.error}</p>
          <a href="/" style={S.primaryBtn}>Entrar no painel</a>
        </div></div>
      </div>
    );
  }

  const c = state.data.company;
  const companyShort = String(c.name || 'Empresa').toUpperCase().slice(0, 16);
  const sideLabel = (r) => (sideOf(r) === 'pricetax' ? 'PRICETAX' : sideOf(r) === 'ambos' ? 'Os dois' : companyShort);
  const px = (s) => ((iso(s) - view.min) / DAY / 7) * WEEK_PX;
  const gw = view.weeks * WEEK_PX;
  const weekLabels = Array.from({ length: view.weeks }, (_, i) => { const d = new Date(view.min + i * 7 * DAY).toISOString().slice(0, 10); return fmtShort(d); });
  const toggle = (id) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = view.acts.filter((a) => a.subs.length).every((a) => open.has(a.id));
  const todayX = px(view.today);

  return (
    <div className="page-root" style={S.page}>
      <style>{CSS}</style>
      <div className="pc-wrap">
        <div className="pc-head">
          {c.logo ? <img className="pc-logo" src={c.logo} alt="" /> : <div className="pc-ini" aria-hidden="true">{(c.name || '?').slice(0, 1).toUpperCase()}</div>}
          <div>
            <div className="pc-eyebrow">Acompanhamento do projeto</div>
            <h1 className="pc-title">{c.name}</h1>
            <div className="pc-sub">Atualizado em {fmt(view.today)} · só leitura</div>
          </div>
          <span className="pc-grow" />
          <button type="button" className="pc-btn no-print" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>
          <a className="pc-btn pri no-print" href="/">Entrar para editar</a>
        </div>

        <div className="pc-kpis">
          <div className="pc-kpi"><b>{view.total}</b><span>Atividades</span></div>
          <div className="pc-kpi"><b style={{ color: '#3ecf6e' }}>{view.done}</b><span>Concluídas</span></div>
          <div className="pc-kpi"><b style={{ color: '#F5C400' }}>{view.doingN}</b><span>Em andamento</span></div>
          <div className="pc-kpi"><b style={{ color: view.lateN ? '#e2574c' : 'var(--text-1)' }}>{view.lateN}</b><span>Atrasadas</span></div>
          <div className="pc-kpi"><b>{view.diasVirada}</b><span>Dias para a virada (01/01/2027)</span></div>
        </div>

        <div className="pc-tabs no-print" role="tablist" aria-label="Visões do acompanhamento">
          {[['resumo', 'Resumo'], ['gantt', 'Cronograma'], ['tabela', 'Tabela'], ['prazos', 'Prazos legais']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="pc-tab" onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'resumo' && (
          <>
            <div className="pc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 8 }}><span>Progresso geral</span><span>{view.pct}%</span></div>
              <div className="pc-bar"><i style={{ width: `${view.pct}%`, background: '#F5C400' }} /></div>
              <div style={{ marginTop: 12 }}>
                {view.phases.map((p) => {
                  const dn = p.list.filter((a) => a.eff === 'concluido').length; const pc = Math.round((dn / p.list.length) * 100);
                  return <div className="pc-ph" key={p.id}><span style={{ fontWeight: 700 }}>{p.name}</span><div className="pc-bar"><i style={{ width: `${pc}%`, background: p.color }} /></div><span style={{ textAlign: 'right' }}>{pc}%</span></div>;
                })}
              </div>
            </div>
            {(() => {
              const mine = view.steps.filter((x) => { const sd = sideOf(x.resp); return sd === 'empresa' || sd === 'ambos'; }).slice(0, 6);
              const total = view.steps.filter((x) => { const sd = sideOf(x.resp); return sd === 'empresa' || sd === 'ambos'; }).length;
              if (!mine.length) return null;
              return (
                <div className="pc-card pc-wait">
                  <div style={{ fontWeight: 800 }}>Aguardando a {c.name}</div>
                  <div className="pc-muted">Os próximos passos que dependem do time de vocês, em ordem de data.</div>
                  {mine.map((x) => (
                    <div className="pc-step" key={x.id}>
                      <span className="d">{x.date ? fmtDay(x.date) : '—'}</span>
                      <div><div className="t">{x.title}</div><div className="pc-muted">{x.parent ? `${x.parent} · ` : ''}{x.resp}</div></div>
                      <div className="pc-end"><Chip kind={x.eff} /></div>
                    </div>
                  ))}
                  {total > mine.length && <div className="no-print" style={{ marginTop: 10 }}><button type="button" className="pc-btn" onClick={() => { setWho('empresa'); setAllWeeks(false); setTimeout(() => { const el = document.getElementById('pc-cal'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); }}>Ver os {total} passos do lado da {c.name}</button></div>}
                </div>
              );
            })()}
            {view.doing.length > 0 && (
              <div className="pc-card">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Em andamento agora</div>
                {view.doing.map((a) => {
                  const pend = a.subs.filter((x) => !x.done).sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999')).slice(0, 3);
                  return (
                    <div className="pc-doing" key={a.id}>
                      <div>
                        <b>{a.title}</b>
                        <div className="pc-muted">{a.responsible || 'Sem responsável'} · {a.date ? `${fmtShort(a.date)} a ${fmtShort(a.endDate || a.date)}` : 'Sem data'}{a.subs.length ? ` · ${a.subs.filter((x) => x.done).length} de ${a.subs.length} subatividades` : ''}</div>
                        {pend.length > 0 && <div className="pc-muted" style={{ marginTop: 3 }}>Próximos: {pend.map((x) => `${x.title}${x.date ? ` (${fmtShort(x.date)})` : ''}`).join(' · ')}</div>}
                      </div>
                      <div className="pc-end">
                        {sideOf(a.responsible) !== 'indef' && <span className={`pc-side ${sideOf(a.responsible)}`} title={`Quem responde: ${a.responsible}`}>{sideOf(a.responsible) === 'pricetax' ? 'PRICETAX' : sideOf(a.responsible) === 'ambos' ? 'Os dois' : companyShort}</span>}
                        <Chip kind={a.eff} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(() => {
              const mine = (r) => { const sd = sideOf(r); return who === 'pricetax' ? sd === 'pricetax' || sd === 'ambos' : who === 'empresa' ? sd === 'empresa' || sd === 'ambos' : true; };
              const list = view.steps.filter((x) => mine(x.resp || ''));
              const mon = mondayOf(view.today);
              const groups = []; const idx = new Map();
              const push = (key, label, late) => { if (!idx.has(key)) { idx.set(key, groups.length); groups.push({ key, label, late, items: [] }); } return groups[idx.get(key)]; };
              for (const x of list) {
                if (x.date && x.date < view.today) push('late', 'Atrasados', true).items.push(x);
                else if (!x.date) push('nodate', 'Sem data definida', false).items.push(x);
                else {
                  const wm = mondayOf(x.date); const diff = Math.round((Date.parse(`${wm}T00:00:00Z`) - Date.parse(`${mon}T00:00:00Z`)) / DAY / 7);
                  const range = `${fmtShort(wm)} a ${fmtShort(addDays(wm, 6))}`;
                  push(wm, diff === 0 ? `Esta semana · ${range}` : diff === 1 ? `Próxima semana · ${range}` : range, false).items.push(x);
                }
              }
              const MAXW = 5; const shownGroups = allWeeks ? groups : groups.slice(0, MAXW + (groups[0] && groups[0].late ? 1 : 0));
              return (
                <div className="pc-card" id="pc-cal">
                  <div style={{ fontWeight: 800 }}>Calendário dos próximos passos</div>
                  <div className="pc-muted">Cada passo com a data, quem responde e a situação. Os que já passaram da data aparecem primeiro.</div>
                  <div className="pc-who no-print" role="group" aria-label="Filtrar por quem responde">
                    {[['todos', 'Todos'], ['pricetax', 'PRICETAX'], ['empresa', `Equipe da ${state.data.company.name}`]].map(([id, label]) => (
                      <button key={id} type="button" className="pc-tab" aria-pressed={who === id} aria-selected={who === id} onClick={() => setWho(id)} style={{ minHeight: 34, padding: '0 12px' }}>{label}</button>
                    ))}
                  </div>
                  {list.length === 0 && <div className="pc-muted">Nenhum passo pendente para este filtro.</div>}
                  {shownGroups.map((g) => (
                    <div key={g.key}>
                      <div className={`pc-wk${g.late ? ' late' : ''}`}><span>{g.label}</span><span>{g.items.length} {g.items.length === 1 ? 'passo' : 'passos'}</span></div>
                      {g.items.map((x, i) => (
                        <div className="pc-step" key={x.id} style={i > 0 && g.items[i - 1].date === x.date ? { borderTopStyle: 'dotted' } : undefined}>
                          <span className="d">{i > 0 && g.items[i - 1].date === x.date ? '' : (x.date ? fmtDay(x.date) : '—')}</span>
                          <div><div className="t">{x.title}</div><div className="pc-muted">{x.parent ? `${x.parent} · ` : ''}{x.resp || 'Sem responsável'}</div></div>
                          <div className="pc-end">
                            {sideOf(x.resp) !== 'indef' && <span className={`pc-side ${sideOf(x.resp)}`} title={`Quem responde: ${x.resp}`}>{sideOf(x.resp) === 'pricetax' ? 'PRICETAX' : sideOf(x.resp) === 'ambos' ? 'Os dois' : companyShort}</span>}
                            <Chip kind={x.eff} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {groups.length > shownGroups.length && <div className="no-print" style={{ marginTop: 10 }}><button type="button" className="pc-btn" onClick={() => setAllWeeks(true)}>Mostrar o calendário completo ({list.length} passos)</button></div>}
                  {allWeeks && groups.length > MAXW + 1 && <div className="no-print" style={{ marginTop: 10 }}><button type="button" className="pc-btn" onClick={() => setAllWeeks(false)}>Mostrar só as próximas semanas</button></div>}
                </div>
              );
            })()}
          </>
        )}

        {tab === 'gantt' && (
          <>
            <div className="no-print" style={{ margin: '0 0 8px' }}>
              <button type="button" className="pc-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(view.acts.filter((a) => a.subs.length).map((a) => a.id)))}>{allOpen ? 'Recolher subatividades' : 'Mostrar todas as subatividades'}</button>
            </div>
            <div className="pc-scroll">
              <div className="pc-g" style={{ minWidth: 280 + gw }}>
                <div className="pc-gr" style={{ minHeight: 0 }}><div className="pc-gl" style={{ padding: 0 }} /><div className="pc-gt" style={{ width: gw }}><div className="pc-gh">{weekLabels.map((w, i) => <div key={i}>{w}</div>)}</div></div></div>
                {view.phases.map((p) => (
                  <React.Fragment key={p.id}>
                    <div className="pc-gr ph"><div className="pc-gl"><span style={{ width: 10, height: 10, borderRadius: 99, background: p.color, flex: '0 0 10px' }} /><span className="t">{p.name}</span></div><div className="pc-gt" style={{ width: gw }} /></div>
                    {p.list.map((a) => {
                      const has = a.subs.length > 0; const isOpen = open.has(a.id);
                      const s = a.date || a.endDate; const e = a.endDate || a.date; const col = (STATUS[a.eff] || STATUS['nao-iniciado']).color;
                      return (
                        <React.Fragment key={a.id}>
                          <div className="pc-gr">
                            <div className="pc-gl">
                              {has ? <button type="button" className="pc-exp" aria-expanded={isOpen} aria-label={`${isOpen ? 'Recolher' : 'Mostrar'} as ${a.subs.length} subatividades de ${a.title}`} onClick={() => toggle(a.id)}>{isOpen ? '−' : '+'}</button> : <span style={{ width: 22, flex: '0 0 22px' }} />}
                              <span className="t" title={a.title} style={{ fontWeight: 700 }}>{a.title}</span>
                            </div>
                            <div className="pc-gt" style={{ width: gw }}>
                              {s && !Number.isNaN(iso(s)) && <div className="pc-b" style={{ left: px(s), width: Math.max(10, px(e) - px(s) + WEEK_PX / 7), background: col }} title={`${a.title}: ${fmt(a.date)} a ${fmt(a.endDate || a.date)}`} />}
                              {s && !Number.isNaN(iso(s)) && px(e) - px(s) > 70 && <span className="pc-bl" style={{ left: px(s) }}>{STATUS[a.eff].label}</span>}
                              <div className="pc-today" style={{ left: todayX }} />
                            </div>
                          </div>
                          {isOpen && a.subs.map((x) => (
                            <div className="pc-gr" key={x.id} style={{ minHeight: 34 }}>
                              <div className="pc-gl sub"><span className="t" title={x.title}>{x.title}</span></div>
                              <div className="pc-gt" style={{ width: gw }}>
                                {x.date && !Number.isNaN(iso(x.date)) && <div className="pc-dm" style={{ left: px(x.date) + WEEK_PX / 14, top: 10, background: (STATUS[x.eff]).color }} title={`${x.title}: ${fmt(x.date)}`} />}
                                <div className="pc-today" style={{ left: todayX }} />
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="pc-muted" style={{ marginTop: 8 }}>A linha vermelha é hoje. Os losangos são as datas das subatividades.</div>
          </>
        )}

        {tab === 'tabela' && (
          <div className="pc-scroll">
            <table className="pc-tbl">
              <thead><tr><th>Fase</th><th>Atividade e subatividades</th><th>Responsável</th><th>Início</th><th>Fim</th><th>Situação</th></tr></thead>
              <tbody>
                {view.phases.map((p) => p.list.map((a) => (
                  <React.Fragment key={a.id}>
                    <tr className="a"><td>{p.name}</td><td>{a.title}</td><td>{a.responsible || '—'}{sideOf(a.responsible) !== 'indef' && <> <span className={`pc-side ${sideOf(a.responsible)}`}>{sideLabel(a.responsible)}</span></>}</td><td>{fmt(a.date)}</td><td>{fmt(a.endDate || a.date)}</td><td><Chip kind={a.eff} /></td></tr>
                    {a.subs.map((x) => { const rr = x.responsible || a.responsible; return <tr className="s" key={x.id}><td /><td>{x.title}</td><td>{rr || '—'}{sideOf(rr) !== 'indef' && <> <span className={`pc-side ${sideOf(rr)}`}>{sideLabel(rr)}</span></>}</td><td>{fmt(x.date)}</td><td>{fmt(x.date)}</td><td><Chip kind={x.eff} /></td></tr>; })}
                  </React.Fragment>
                )))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'prazos' && (
          <div className="pc-card">
            <div style={{ fontWeight: 800 }}>Prazos legais da reforma e o que o cronograma faz até cada um</div>
            <div className="pc-muted">Marcos da transição, com a norma de cada um. Abaixo de cada marco, os passos do cronograma da {c.name} que ainda estão pendentes e se ligam a ele.</div>
            {LEGAL.map((m) => {
              const past = (m.until || m.date) < view.today;
              const dias = Math.round((Date.parse(`${m.date}T00:00:00Z`) - Date.parse(`${view.today}T00:00:00Z`)) / DAY);
              const linked = m.link ? view.steps.filter((x) => m.link.test(x.title)).slice(0, 6) : [];
              return (
                <div className="pc-lg" key={m.id}>
                  <div>
                    <div className="dt">{m.until ? `${fmt(m.date).slice(6)}` : fmt(m.date)}</div>
                    <div className="pc-muted">{m.until ? 'ano inteiro' : past ? 'já passou' : dias === 0 ? 'hoje' : `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</div>
                  </div>
                  <div>
                    <div className="tt">{m.title}</div>
                    <div className="tx">{m.text}</div>
                    <span className={`pc-src${m.tentative ? ' tent' : ''}`}>{m.tentative ? 'A confirmar · ' : 'Norma · '}{m.src}</span>
                    {linked.length > 0 && (
                      <div className="pc-link"><b>No cronograma:</b>{linked.map((x) => <div key={x.id}>{x.date ? fmtShort(x.date) : 'sem data'} · {x.title} · {sideLabel(x.resp)}</div>)}</div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="pc-muted" style={{ marginTop: 10 }}>Resumo para acompanhamento, não substitui a leitura da norma. Conferido no texto da EC 132/2023 e da LC 214/2025.</div>
          </div>
        )}

        <div className="pc-foot no-print">Página só de leitura. Para alterar algo, use “Entrar para editar” com o seu login e senha.</div>
      </div>
    </div>
  );
}
