import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { fmtDur } from './charts.jsx';

// Dia da equipe (2026-10-29): para cada pessoa medida, num dia de Brasília — entradas e saídas, telas e o que fez. Vem de /api/ops-intel/team-day.
const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—');
const todayBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const shiftDay = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const END = { logout: 'saiu (clicou em Sair)', 'ultima-atividade': 'última atividade (fechou a aba ou o navegador)', 'em-andamento': 'em andamento agora' };
const SRC = { crm: 'CRM', empresas: 'Empresas', quadro: 'Quadro', xflow: 'XFlow', acao: 'Ação', renata: 'RENATA', reunioes: 'Reuniões' };
const ROLE = { master: 'Master', pricetax: 'PRICETAX' };

const CSS = `
.td-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
.td-bar button { min-height:36px; padding:0 12px; border-radius:8px; border:1px solid var(--border-2); background:transparent; color:var(--text-2); font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
.td-person { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:14px 16px; margin-bottom:12px; }
.td-ph { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
.td-ph h3 { margin:0; font-size:15px; font-weight:800; }
.td-sub { font-size:12px; color:var(--text-4); }
.td-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
.td-h { font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-4); margin:6px 0 4px; font-weight:700; }
.td-row { display:flex; gap:10px; font-size:12.5px; padding:5px 0; border-bottom:1px solid var(--border-1); line-height:1.4; }
.td-row time { flex:0 0 auto; width:112px; white-space:nowrap; font-variant-numeric:tabular-nums; color:var(--text-3); }
.td-row span.d { color:var(--text-4); overflow-wrap:anywhere; }
.td-src { font-size:10.5px; border-radius:999px; padding:1px 7px; background:var(--bg-3); color:var(--text-3); margin-right:6px; white-space:nowrap; }
.td-empty { font-size:12.5px; color:var(--text-5); padding:6px 0; }
`;

function Person({ p }) {
  const [all, setAll] = useState(false);
  const ops = all ? p.operations : p.operations.slice(0, 40);
  return (
    <section className="td-person" aria-label={p.name}>
      <div className="td-ph">
        <h3>{p.name}</h3><span className="td-sub">{ROLE[p.role] || p.role}</span>
        {p.sessions.length > 0
          ? <span className="td-sub">entrou {hhmm(p.firstMs)} · {p.lastEndKind === 'logout' ? 'saiu' : p.lastEndKind === 'em-andamento' ? 'online agora, desde' : 'última atividade'} {p.lastEndKind === 'em-andamento' ? hhmm(p.sessions[p.sessions.length - 1].startMs) : hhmm(p.lastMs)} · {p.totals.sessions} {p.totals.sessions === 1 ? 'sessão' : 'sessões'} · aba visível {fmtDur(p.totals.connectedS)} (com interação {fmtDur(p.totals.activeS)}) · {p.totals.operations} {p.totals.operations === 1 ? 'operação' : 'operações'}</span>
          : <span className="td-sub">Nenhuma entrada nem atividade neste dia.</span>}
        {p.totals.failedLogins > 0 && <span className="td-sub" style={{ color: '#e2574c' }}>{p.totals.failedLogins} tentativa(s) de login com senha errada</span>}
      </div>
      {p.sessions.length > 0 && (
        <div className="td-grid">
          <div>
            <div className="td-h">Entradas e saídas</div>
            {p.sessions.map((s, i) => (
              <div className="td-row" key={i}>
                <time>{hhmm(s.startMs)} → {s.endKind === 'em-andamento' ? 'agora' : hhmm(s.endMs)}</time>
                <span>{END[s.endKind]}{s.entry && (s.entry.city || s.entry.device) ? <span className="d"> · entrou {s.entry.city ? `de ${[s.entry.city, s.entry.region].filter(Boolean).join('/')}` : 'por'}{s.entry.device ? ` (${s.entry.device})` : ''}</span> : null}</span>
              </div>
            ))}
            <div className="td-h">Telas por onde passou</div>
            {p.screens.length === 0 && <div className="td-empty">Sem medição de tela neste dia (o aparelho pode não ter enviado).</div>}
            {p.screens.map((s, i) => (
              <div className="td-row" key={i}>
                <time>{hhmm(s.fromMs)} → {hhmm(s.toMs)}</time>
                <span>{s.moduleLabel}{s.view ? ` · ${s.view}` : ''}{s.projectName ? ` · ${s.projectName}` : ''} <span className="d">({fmtDur(s.activeS)} ativo)</span></span>
              </div>
            ))}
          </div>
          <div>
            <div className="td-h">O que fez, editou e incluiu</div>
            {p.operations.length === 0 && <div className="td-empty">Nenhuma operação registrada.</div>}
            {ops.map((o, i) => (
              <div className="td-row" key={i}>
                <time>{hhmm(o.at)}</time>
                <span><span className="td-src">{SRC[o.source] || o.source}</span>{o.label}{o.detail ? <span className="d"> — {o.detail}</span> : null}</span>
              </div>
            ))}
            {p.operations.length > 40 && <button type="button" className="oi-chip" onClick={() => setAll((v) => !v)}>{all ? 'Mostrar só as 40 primeiras' : `Mostrar as ${p.operations.length}`}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function TeamDay() {
  const [date, setDate] = useState(todayBr);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    apiGet(`/api/ops-intel/team-day?date=${date}`)
      .then((data) => { if (alive) setState({ loading: false, error: '', data }); })
      .catch((e) => { if (alive) setState({ loading: false, error: (e && e.message) || 'Não foi possível carregar o dia.', data: null }); });
    return () => { alive = false; };
  }, [date]);
  const d = state.data;
  return (
    <div>
      <style>{CSS}</style>
      <div className="td-bar">
        <button type="button" aria-label="Dia anterior" onClick={() => setDate(shiftDay(date, -1))}>‹</button>
        <input type="date" value={date} max={todayBr()} aria-label="Dia" onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button type="button" aria-label="Próximo dia" disabled={date >= todayBr()} onClick={() => setDate(shiftDay(date, 1))}>›</button>
        <button type="button" onClick={() => setDate(todayBr())}>Hoje</button>
        <button type="button" onClick={() => setDate(todayBr())} title="Recarrega o dia de hoje">Atualizar</button>
      </div>
      {state.error && <div className="oi-err" role="alert">{state.error}</div>}
      {state.loading && !d && <div className="td-empty">Carregando…</div>}
      {d && d.people.length === 0 && <div className="td-empty">Nenhuma pessoa da equipe medida nesta organização.</div>}
      {d && d.people.map((p) => <Person key={p.userId} p={p} />)}
      {d && <ul className="td-sub" style={{ marginTop: 8, paddingLeft: 18 }}>{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}
