// "Registros que já estão na base" (2026-10-13, pedido do Rafael): varredura das tarefas de reunião antigas + revisão central das
// sugestões, sem abrir empresa por empresa. Nada é vinculado sozinho: a varredura só SUGERE; quem decide é a equipe aqui (ou na empresa).
// Dados: server/taskLinkBackfill.js (GET /backfill/estimate, POST /backfill, GET /backfill/status, GET /pending, POST /decide, POST /confirm-high).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { Section, Button } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const pct = (r) => `${Math.round((Number(r) || 0) * 100)}%`;
const SOURCE = { ia: 'RENATA (IA)', aprendido: 'Aprendido', regra: 'Regra' };

const CSS = `
  .pl-bar { height:8px; border-radius:999px; background:var(--bg-4); overflow:hidden; margin:8px 0; }
  .pl-bar > i { display:block; height:100%; background:#3ecf6e; transition:width .4s; }
  .pl-scroll { overflow-x:auto; }
  .pl-sel { max-width:240px; font-size:12px; }
  .pl-acts { display:flex; gap:6px; white-space:nowrap; }
  .pl-note { font-size:12px; color:var(--text-5); line-height:1.5; }
  @media (max-width: 767px) { .pl-sel { max-width:180px; font-size:16px; min-height:44px; } }
`;

function Backfill({ onFinished }) {
  const [est, setEst] = useState(null);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished; // referência estável: a função de fora muda a cada render
  const finishedFor = useRef('');
  const sawRunning = useRef(false); // só avisa "concluída" se esta tela viu a varredura rodando (não ao abrir a aba)

  const loadEst = useCallback(() => { apiGet('/api/task-links/backfill/estimate').then(setEst).catch((e) => setErr(e && e.message ? e.message : 'Não foi possível calcular.')); }, []);
  const poll = useCallback(() => {
    apiGet('/api/task-links/backfill/status').then((r) => {
      const j = r && r.job;
      setJob(j);
      if (j && j.status === 'running') sawRunning.current = true;
      if (j && j.status !== 'running' && sawRunning.current && finishedFor.current !== j.id) { sawRunning.current = false; finishedFor.current = j.id; loadEst(); onFinishedRef.current(j); }
    }).catch(() => {});
  }, [loadEst]);

  useEffect(() => { loadEst(); poll(); }, [loadEst, poll]);
  useEffect(() => {
    if (job && job.status === 'running') { timer.current = setInterval(poll, 2500); return () => clearInterval(timer.current); }
    return undefined;
  }, [job && job.status, poll]);

  async function start() {
    setErr('');
    const ok = await askConfirm({
      title: 'Sugerir atividades para a base toda?',
      message: `${est.tasks} tarefas sem atividade em ${est.companies} empresas (${est.meetings} reuniões). Serão até ${est.aiCalls} chamadas de IA, uma por reunião. Nada é vinculado: a RENATA só sugere e você confirma depois. Pode demorar alguns minutos e roda em segundo plano.`,
      confirmLabel: 'Começar',
    });
    if (!ok) return;
    try { const r = await apiPost('/api/task-links/backfill', {}); finishedFor.current = ''; sawRunning.current = true; setJob(r.job); } catch (e) { setErr((e && e.message) || 'Não foi possível iniciar.'); poll(); }
  }
  async function cancel() { try { await apiPost('/api/task-links/backfill/cancel', {}); poll(); } catch (e) { setErr((e && e.message) || ''); } }

  const running = job && job.status === 'running';
  const done = job && job.status !== 'running';
  const STATUS = { done: 'Concluída', stopped: 'Interrompida', error: 'Falhou', cancelled: 'Cancelada' };
  return (
    <div className="knw-metric-card">
      <div className="knw-metric-card-title">Varredura da base (tarefas que já existem)</div>
      {!est && !err && <div className="pl-note">Calculando…</div>}
      {est && (
        <div className="pl-note">
          Hoje há <b>{est.tasks}</b> tarefas de reunião sem atividade do cronograma em <b>{est.companies}</b> empresas ({est.meetings} reuniões). {est.mode === 'off' ? 'As sugestões estão desligadas neste ambiente.' : est.mode === 'sem-ia' || !est.aiConfigured ? 'Neste ambiente a varredura usa só o aprendizado e a regra simples (sem IA).' : `A varredura faz até ${est.aiCalls} chamadas de IA, uma por reunião.`}
        </div>
      )}
      {running && (
        <div style={{ marginTop: 10 }}>
          <div className="pl-bar" aria-hidden="true"><i style={{ width: `${job.meetingsTotal ? Math.round((job.meetingsDone / job.meetingsTotal) * 100) : 0}%` }} /></div>
          <div className="pl-note">Em andamento: {job.meetingsDone} de {job.meetingsTotal} reuniões · {job.projectsDone} de {job.projectsTotal} empresas · {job.suggested} sugestões gravadas</div>
        </div>
      )}
      {done && (
        <div className="pl-note" style={{ marginTop: 10 }}>
          Última varredura: <b>{STATUS[job.status] || job.status}</b> — {job.tasks} tarefas avaliadas, {job.suggested} sugestões gravadas ({job.learned} pelo aprendizado), {job.aiCalls} chamadas de IA{job.aiFailed ? `, ${job.aiFailed} falha(s)` : ''}.{job.message ? ` ${job.message}` : ''}
        </div>
      )}
      {err && <div style={{ color: '#e2574c', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <Button size="sm" disabled={!est || !est.tasks || running || est.mode === 'off'} disabledReason={running ? 'Já há uma varredura em andamento' : est && !est.tasks ? 'Não há tarefas pendentes de sugestão' : undefined} onClick={start}>Sugerir para todas as empresas</Button>
        {running && <Button size="sm" onClick={cancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

export function PendingLinks({ isAdmin, onChanged }) {
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(50);
  const [choice, setChoice] = useState({}); // taskId -> atividade escolhida no select
  const [busy, setBusy] = useState('');
  const load = useCallback((n = limit) => {
    apiGet(`/api/task-links/pending?limit=${n}`).then(setData).catch(() => setData({ total: 0, high: 0, rows: [], options: {} }));
  }, [limit]);
  useEffect(() => { load(limit); }, [limit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(rows) {
    setBusy(rows.length === 1 ? rows[0].taskId : 'bulk');
    try {
      const r = await apiPost('/api/task-links/decide', { decisions: rows });
      notify(`${r.done} decisão(ões) registrada(s)${r.skipped ? `; ${r.skipped} já tinha(m) mudado e foi(ram) ignorada(s)` : ''}.`, { tone: 'success' });
      load(); onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível registrar.', { tone: 'error' }); } finally { setBusy(''); }
  }
  async function confirmHigh() {
    const ok = await askConfirm({ title: 'Confirmar as sugestões de confiança alta?', message: `${data.high} sugestões de 80% ou mais, de todas as empresas, serão vinculadas às atividades sugeridas. Você pode trocar depois em cada tarefa.`, confirmLabel: 'Confirmar todas' });
    if (!ok) return;
    setBusy('bulk');
    try {
      const r = await apiPost('/api/task-links/confirm-high', {});
      notify(`${r.done} tarefas vinculadas${r.skipped ? `; ${r.skipped} ignoradas (já tinham mudado)` : ''}.`, { tone: 'success' });
      load(); onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível confirmar.', { tone: 'error' }); } finally { setBusy(''); }
  }

  return (
    <Section title="Registros que já estão na base">
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isAdmin && <Backfill onFinished={(j) => { load(); onChanged(); if (j.status === 'done') notify(`Varredura concluída: ${j.suggested} sugestões gravadas. Revise abaixo.`, { tone: 'success' }); }} />}
        <div className="knw-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div className="knw-metric-card-title" style={{ margin: 0 }}>Sugestões a confirmar{data ? ` (${data.total})` : ''}</div>
            {data && data.high > 0 && <Button size="sm" icon={Sparkles} loading={busy === 'bulk'} onClick={confirmHigh}>Confirmar {data.high} de confiança alta</Button>}
          </div>
          {!data && <div className="pl-note" style={{ marginTop: 8 }}>Carregando…</div>}
          {data && data.total === 0 && <div className="knw-empty-hint" style={{ marginTop: 8 }}>Nenhuma sugestão pendente. {isAdmin ? 'Use a varredura acima para gerar sugestões para as tarefas que já existem.' : ''}</div>}
          {data && data.rows.length > 0 && (
            <div className="pl-scroll" style={{ marginTop: 10 }}>
              <table className="knw-table">
                <thead><tr><th>Empresa</th><th>Tarefa</th><th>Atividade sugerida</th><th>Confiança</th><th>Origem</th><th /></tr></thead>
                <tbody>
                  {data.rows.map((r) => {
                    const sel = choice[r.taskId] || r.suggestedId;
                    return (
                      <tr key={r.taskId} title={r.reason || undefined}>
                        <td>{r.company}<div className="pl-note">{r.meetingTitle}</div></td>
                        <td>{r.title}</td>
                        <td>
                          <select className="pl-sel" aria-label={`Atividade para: ${r.title}`} value={sel} onChange={(e) => setChoice((c) => ({ ...c, [r.taskId]: e.target.value }))}>
                            {(data.options[r.projectId] || []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                          </select>
                        </td>
                        <td>{pct(r.confidence)}</td>
                        <td>{SOURCE[r.source] || r.source}</td>
                        <td>
                          <div className="pl-acts">
                            <Button size="sm" icon={Check} disabled={!!busy} onClick={() => decide([{ projectId: r.projectId, taskId: r.taskId, activityId: sel }])}>{sel === r.suggestedId ? 'Confirmar' : 'Usar esta'}</Button>
                            <Button size="sm" icon={X} disabled={!!busy} title="Nenhuma atividade do cronograma se aplica" aria-label="Nenhuma atividade se aplica" onClick={() => decide([{ projectId: r.projectId, taskId: r.taskId, activityId: null }])} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.total > data.rows.length && <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => setLimit((n) => n + 50)}>Mostrar mais ({data.total - data.rows.length} restantes)</Button></div>}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
