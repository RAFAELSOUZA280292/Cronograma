// Aba "Tarefas × atividades" da Central de Conhecimento (Fase 4 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md):
// "o que a RENATA aprendeu" ao ligar tarefas de reunião às atividades do cronograma. Taxa de acerto (confirmou ÷ decidiu, só onde havia
// sugestão), por semana/origem/faixa de confiança, o critério para CONSIDERAR aplicar sozinha (não ativa nada), padrões mais fortes
// (palavras só com ≥ 3 empresas) e as decisões recentes, com "Esquecer" para administradores. Dados de GET /api/task-links/learning.
import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { Kpi, KpiGrid, Section, EmptyState, SkeletonCards, Button, ErrorState } from '../ui/index.jsx';
import { notify } from '../ui/dialogs.jsx';
import { PendingLinks } from './PendingLinks.jsx';

const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const DECISION = { escolheu: 'Escolha manual', confirmou: 'Confirmou', corrigiu: 'Trocou', nenhuma: 'Nenhuma se aplica' };
const SOURCE = { ia: 'RENATA (IA)', aprendido: 'Aprendido', regra: 'Regra', manual: 'Manual', sugestao: 'Sugestão' };
const OK = '#3ecf6e';
const dayMonth = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const CSS = `
  .lk-weeks { display:flex; align-items:flex-end; gap:6px; height:120px; margin-top:12px; }
  .lk-week { flex:1; min-width:0; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; gap:3px; }
  .lk-bar-wrap { flex:1; width:100%; display:flex; align-items:flex-end; justify-content:center; }
  .lk-bar { width:100%; max-width:26px; border-radius:3px 3px 0 0; background:${OK}; min-height:2px; }
  .lk-bar.empty { background:var(--border-2); }
  .lk-val { font-size:10px; font-weight:700; color:var(--text-3); height:12px; font-variant-numeric:tabular-nums; }
  .lk-lab { font-size:9.5px; color:var(--text-6); white-space:nowrap; }
  .lk-gate { height:8px; border-radius:999px; background:var(--bg-4); overflow:hidden; margin:6px 0; }
  .lk-gate > i { display:block; height:100%; background:${OK}; }
  .lk-pill { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--bg-3); border:1px solid var(--border-2); color:var(--text-3); white-space:nowrap; }
  .lk-pill.ok { color:${OK}; border-color:rgba(62,207,110,.5); }
  .lk-pill.warn { color:#e8a317; border-color:rgba(232,163,23,.5); }
  .lk-ignored { opacity:.5; text-decoration:line-through; }
  .lk-scroll { overflow-x:auto; }
  .lk-words { color:var(--text-5); font-size:12px; }
  .lk-check { display:flex; align-items:center; gap:8px; font-size:12.5px; padding:4px 0; }
  @media (max-width: 767px) { .lk-week:nth-child(even) .lk-lab { visibility:hidden; } .lk-weeks { gap:4px; } }
`;

function Accuracy({ label, a }) {
  return <div className="knw-metric-row"><span>{label}</span><b>{a.n ? `${pct(a.rate)} (${a.n})` : '—'}</b></div>;
}

function EvalCard({ ops, mode }) {
  const [state, setState] = useState({ busy: false, report: null, error: '' });
  async function run() {
    setState({ busy: true, report: null, error: '' });
    try { setState({ busy: false, report: await apiPost('/api/task-links/eval', {}), error: '' }); }
    catch (e) { setState({ busy: false, report: null, error: (e && e.message) || 'Não foi possível rodar a avaliação.' }); }
  }
  const r = state.report;
  const last = ops.lastEval;
  return (
    <div className="knw-metric-card">
      <div className="knw-metric-card-title">Avaliação de qualidade (casos de teste)</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Roda as tarefas de exemplo (de uma empresa fictícia, sem dado de cliente) pelo mesmo caminho das sugestões reais e confere se a RENATA acerta. Uma rodada faz 1 chamada de IA. As respostas esperadas são uma primeira leitura: o time deve conferir e ajustar em <code>server/evals/taskLinkEval.js</code>.
      </div>
      {mode !== 'normal' && <div style={{ marginTop: 8 }}><span className="lk-pill warn">Modo do ambiente: {mode === 'off' ? 'sugestões desligadas' : 'sem IA (só aprendido e regra)'}</span></div>}
      {last && !r && <div className="knw-metric-row" style={{ marginTop: 10 }}><span>Última avaliação ({when(last.at)})</span><b>{last.passed ? 'Passou' : 'Não passou'} · precisão {pct(last.precision)} · cobertura {pct(last.coverage)}</b></div>}
      <div style={{ marginTop: 10 }}><Button size="sm" loading={state.busy} onClick={run}>{state.busy ? 'Avaliando…' : 'Rodar avaliação'}</Button></div>
      {state.error && <div style={{ color: '#e2574c', fontSize: 12.5, marginTop: 8 }}>{state.error}</div>}
      {r && (
        <div style={{ marginTop: 12 }}>
          {!r.usedAI && <div style={{ color: '#e8a317', fontSize: 12.5, marginBottom: 8 }}>A IA não respondeu{r.aiError ? ` (${r.aiError})` : ''}: este resultado é só da regra de reserva e não vale como avaliação da RENATA.</div>}
          <div style={{ fontWeight: 800, fontSize: 14, color: r.passed ? OK : '#e2574c' }}>{r.passed ? 'Passou no critério de liberação' : 'Ainda não passou no critério de liberação'}</div>
          {r.checks.map((c) => (
            <div key={c.id} className="lk-check">
              {c.pass ? <CheckCircle2 size={14} color={OK} aria-hidden="true" /> : <XCircle size={14} color="#e2574c" aria-hidden="true" />}
              <span>{c.label}: <b>{pct(c.value)}</b></span>
            </div>
          ))}
          <div className="lk-words" style={{ marginTop: 6 }}>
            {r.metrics.suggested} sugestões em {r.metrics.positives} tarefas com atividade ({r.missed.length} sem sugestão) · {r.metrics.falsePositiveN} sugestão(ões) em {r.metrics.negatives} tarefas sem atividade · {r.ms} ms · {(r.usage.input + r.usage.output).toLocaleString('pt-BR')} tokens
          </div>
          {r.failures.length > 0 && (
            <div className="lk-scroll" style={{ marginTop: 10 }}>
              <table className="knw-table">
                <thead><tr><th>Tarefa</th><th>Esperado</th><th>A RENATA sugeriu</th></tr></thead>
                <tbody>{r.failures.map((f) => <tr key={f.id}><td>{f.title}</td><td>{f.expected}</td><td>{f.got || '—'}{f.confidence != null ? <span className="lk-words"> · {pct(f.confidence)}</span> : null}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LinksTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    apiGet('/api/task-links/learning').then((r) => { if (r && r.accuracy && r.weekly) setData(r); else setError('Resposta inesperada do servidor.'); }).catch((e) => setError((e && e.message) || 'Não foi possível carregar.'));
  }, []);
  useEffect(load, [load]);

  async function forget(row, ignored) {
    try {
      await apiPost('/api/task-links/forget', { id: row.id, ignored });
      notify(ignored ? 'Decisão esquecida: a RENATA deixa de aprender com ela.' : 'Decisão restaurada.', { tone: 'success' });
      load();
    } catch (e) { notify((e && e.message) || 'Não foi possível alterar.', { tone: 'error' }); }
  }

  if (error) return <ErrorState title="Não foi possível carregar" message={error} onRetry={load} />;
  if (!data) return <SkeletonCards count={3} height={110} />;
  const { totals, accuracy, weekly, gate, state, patterns, recent, canForget, ops, mode } = data;
  const maxN = Math.max(1, ...weekly.map((w) => w.n));
  const gateN = Math.min(1, gate.high.n / gate.minDecisions);
  const empty = totals.decisions === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{CSS}</style>
      <KpiGrid>
        <Kpi label="Taxa de acerto" value={pct(accuracy.overall)} hint={accuracy.n ? `${totals.confirmed} confirmadas de ${accuracy.n} sugestões decididas` : 'ainda sem sugestões decididas'} tone={accuracy.overall != null && accuracy.overall >= 0.8 ? 'ok' : undefined} />
        <Kpi label="Decisões registradas" value={totals.decisions} hint={`${totals.manual} escolhas manuais · ${totals.corrected} trocas · ${totals.dismissed} "nenhuma"`} />
        <Kpi label="Sugestões a confirmar" value={state.pending} tone={state.pending ? 'warn' : 'ok'} hint="tarefas abertas com sugestão pendente" />
        <Kpi label="Tarefas sem vínculo" value={state.unlinked} hint={`${state.linked} vinculadas · ${state.none} "nenhuma se aplica"`} />
      </KpiGrid>

      {empty && (
        <EmptyState icon={Link2} title="A RENATA ainda não aprendeu nada aqui" description="Confirme, troque ou escolha a atividade de algumas tarefas na aba Tarefas das empresas. Cada decisão vira um exemplo." />
      )}

      <PendingLinks isAdmin={canForget} onChanged={load} />

      <Section title="Acerto por semana">
        <div className="knw-metric-card">
          <div style={{ fontSize: 12, color: 'var(--text-5)' }}>Altura da barra = % de sugestões confirmadas na semana (o número embaixo é o total de sugestões decididas).</div>
          <div className="lk-weeks" role="img" aria-label="Taxa de acerto por semana, últimas 12 semanas">
            {weekly.map((w) => (
              <div key={w.week} className="lk-week" title={w.n ? `Semana de ${dayMonth(w.week)}: ${w.confirmed} de ${w.n} confirmadas (${pct(w.rate)})` : `Semana de ${dayMonth(w.week)}: sem decisões`}>
                <div className="lk-val">{w.n ? pct(w.rate) : ''}</div>
                <div className="lk-bar-wrap"><div className={`lk-bar${w.n ? '' : ' empty'}`} style={{ height: w.n ? `${Math.max(6, w.rate * 100)}%` : 2, opacity: w.n ? 0.5 + 0.5 * (w.n / maxN) : 1 }} /></div>
                <div className="lk-lab">{dayMonth(w.week)}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <div className="knw-metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="knw-metric-card">
          <div className="knw-metric-card-title">Acerto por origem da sugestão</div>
          <Accuracy label="RENATA (IA)" a={accuracy.bySource.ia} />
          <Accuracy label="Aprendido (decisões anteriores)" a={accuracy.bySource.aprendido} />
          <Accuracy label="Regra simples (área/palavras)" a={accuracy.bySource.regra} />
          <div className="knw-metric-card-title" style={{ marginTop: 14 }}>Por faixa de confiança</div>
          <Accuracy label="80% ou mais" a={accuracy.byBand.high} />
          <Accuracy label="Abaixo de 80%" a={accuracy.byBand.low} />
        </div>
        <div className="knw-metric-card">
          <div className="knw-metric-card-title">Vínculo automático</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            A RENATA vincula sozinha quando a confiança é de 50% ou mais (a tarefa fica marcada como automática e dá para trocar ou tirar). Abaixo disso ela só sugere. Este é o critério de qualidade para <b>continuar confiando</b> nesse modo: pelo menos {gate.minDecisions} sugestões de confiança alta decididas, com {Math.round(gate.minRate * 100)}% ou mais de acerto.
          </div>
          <div className="knw-metric-row" style={{ marginTop: 10 }}><span>Sugestões de confiança alta decididas</span><b>{gate.high.n} / {gate.minDecisions}</b></div>
          <div className="lk-gate" aria-hidden="true"><i style={{ width: `${gateN * 100}%` }} /></div>
          <div className="knw-metric-row"><span>Acerto nessa faixa</span><b>{pct(gate.high.rate)} (meta {Math.round(gate.minRate * 100)}%)</b></div>
          <div style={{ marginTop: 10 }}><span className={`lk-pill ${gate.ready ? 'ok' : 'warn'}`}>{gate.ready ? 'Critério atingido — vale conversar' : 'Critério ainda não atingido'}</span></div>
        </div>
      </div>

      <Section title="Qualidade e custo">
        <div className="knw-metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="knw-metric-card">
            <div className="knw-metric-card-title">Custo e erros (30 dias)</div>
            <div className="knw-metric-row"><span>Pedidos de sugestão</span><b>{ops.runs}</b></div>
            <div className="knw-metric-row"><span>Tarefas avaliadas / com sugestão</span><b>{ops.tasks} / {ops.suggested}</b></div>
            <div className="knw-metric-row"><span>Resolvidas pelo aprendizado (sem IA)</span><b>{ops.learned}</b></div>
            <div className="knw-metric-row"><span>Pedidos que usaram a IA</span><b>{ops.aiRuns}</b></div>
            <div className="knw-metric-row"><span>Falhas da IA (caiu para a regra)</span><b style={ops.aiFailed ? { color: '#e2574c' } : undefined}>{ops.aiFailed}</b></div>
            <div className="knw-metric-row"><span>Tokens de entrada / saída</span><b>{ops.inputTokens.toLocaleString('pt-BR')} / {ops.outputTokens.toLocaleString('pt-BR')}</b></div>
          </div>
          {canForget ? <EvalCard ops={ops} mode={mode} /> : (
            <div className="knw-metric-card"><div className="knw-metric-card-title">Avaliação de qualidade</div><div className="knw-empty-hint">{ops.lastEval ? `Última: ${ops.lastEval.passed ? 'passou' : 'não passou'} · precisão ${pct(ops.lastEval.precision)} (${when(ops.lastEval.at)})` : 'Só administradores rodam a avaliação.'}</div></div>
          )}
        </div>
      </Section>

      <Section title="Padrões mais fortes">
        <div className="knw-metric-card lk-scroll">
          {patterns.length === 0 ? <div className="knw-empty-hint">Sem padrões ainda.</div> : (
            <table className="knw-table">
              <thead><tr><th>Atividade do cronograma</th><th>Decisões</th><th>Empresas</th><th>Palavras que mais levam a ela (≥ 3 empresas)</th></tr></thead>
              <tbody>{patterns.map((p) => <tr key={p.activity}><td>{p.activity}</td><td>{p.decisions}</td><td>{p.companies}</td><td className="lk-words">{p.words.length ? p.words.join(', ') : '—'}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </Section>

      <Section title="Decisões recentes">
        <div className="knw-metric-card lk-scroll">
          {recent.length === 0 ? <div className="knw-empty-hint">Nenhuma decisão registrada ainda.</div> : (
            <table className="knw-table">
              <thead><tr><th>Quando</th><th>Empresa</th><th>Tarefa</th><th>Decisão</th><th>Atividade</th><th>Origem</th>{canForget && <th />}</tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className={r.ignored ? 'lk-ignored' : undefined}>
                    <td>{when(r.at)}</td><td>{r.company}</td><td>{r.text}</td>
                    <td><span className={`lk-pill${r.decision === 'confirmou' ? ' ok' : r.decision === 'corrigiu' ? ' warn' : ''}`}>{DECISION[r.decision] || r.decision}</span></td>
                    <td>{r.chosen || '—'}{r.decision === 'corrigiu' && r.suggested ? <span className="lk-words"> (sugerida: {r.suggested}{r.confidence != null ? ` · ${pct(r.confidence)}` : ''})</span> : null}{r.decision === 'nenhuma' && r.suggested ? <span className="lk-words"> (sugerida: {r.suggested})</span> : null}</td>
                    <td>{SOURCE[r.source] || r.source}</td>
                    {canForget && (
                      <td>{r.ignored
                        ? <Button size="sm" icon={RotateCcw} onClick={() => forget(r, false)}>Restaurar</Button>
                        : <Button size="sm" onClick={() => forget(r, true)} title="A RENATA deixa de aprender com esta decisão">Esquecer</Button>}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </div>
  );
}
