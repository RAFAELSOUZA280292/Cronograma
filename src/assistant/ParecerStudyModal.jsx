import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, X, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Sparkles, Lock } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { DialogOverlay } from '../ui/dialog.jsx';

const CSS = `
  .pst-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
  .pst-modal { width:680px; max-width:100%; max-height:92vh; background:var(--bg-1); border:1px solid var(--border-2); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; font-family:'Inter', sans-serif; color:var(--text-1); }
  .pst-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:18px 20px 12px; }
  .pst-title { display:flex; align-items:center; gap:9px; font-size:17px; font-weight:800; letter-spacing:-.01em; }
  .pst-sub { font-size:13px; line-height:1.55; color:var(--text-4); margin-top:6px; max-width:560px; }
  .pst-x { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:6px; border-radius:8px; }
  .pst-x:hover { background:var(--bg-3); color:var(--text-2); }
  .pst-body { padding:4px 20px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:14px; }
  .pst-status { background:var(--bg-3); border-radius:12px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
  .pst-count { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
  .pst-count small { font-size:13px; font-weight:600; color:var(--text-4); margin-left:6px; }
  .pst-bar { height:6px; border-radius:999px; background:var(--border-2); margin-top:8px; overflow:hidden; width:220px; max-width:100%; }
  .pst-bar i { display:block; height:100%; background:#3ecf6e; border-radius:999px; transition:width .3s; }
  .pst-btn { display:inline-flex; align-items:center; gap:8px; font-family:inherit; font-size:13.5px; font-weight:700; border-radius:10px; padding:11px 18px; cursor:pointer; border:1px solid #F5C400; background:#F5C400; color:#111; }
  .pst-btn:hover:not(:disabled) { background:#ffd21f; }
  .pst-btn:disabled { background:var(--bg-4); border-color:var(--border-2); color:var(--text-5); cursor:default; }
  .pst-note { font-size:12.5px; color:var(--text-5); line-height:1.5; }
  .pst-others { display:flex; gap:8px; align-items:flex-start; background:var(--bg-3); border-radius:10px; padding:10px 12px; }
  .pst-others svg { flex-shrink:0; margin-top:2px; }
  .pst-error { font-size:12.5px; color:var(--ui-danger); line-height:1.5; }
  .pst-item { border:1px solid var(--border-1); border-radius:12px; background:var(--bg-2); }
  .pst-item-head { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; }
  .pst-item-head.static { cursor:default; }
  .pst-item-title { flex:1; min-width:0; font-size:13.5px; font-weight:700; line-height:1.35; overflow-wrap:anywhere; }
  .pst-pill { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; flex-shrink:0; }
  .pst-pill.done { background:rgba(62,207,110,.15); color:var(--ui-ok); }
  .pst-pill.new { background:rgba(245,196,0,.18); color:var(--ui-accent-text); }
  .pst-pill.running { background:rgba(91,141,239,.15); color:var(--ui-info); }
  .pst-pill.failed { background:rgba(226,87,76,.14); color:var(--ui-danger); }
  .pst-learn { padding:2px 16px 16px 40px; display:flex; flex-direction:column; gap:12px; font-size:13px; line-height:1.55; color:var(--text-3); }
  .pst-learn h4 { margin:0 0 4px; font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-6); }
  .pst-learn ul { margin:0; padding-left:18px; }
  .pst-learn li { margin-bottom:3px; }
  .pst-tags { display:flex; flex-wrap:wrap; gap:6px; }
  .pst-tag { font-size:11.5px; font-weight:600; background:var(--bg-3); color:var(--text-3); border-radius:999px; padding:3px 10px; }
  .pst-spin { animation:pstspin 1s linear infinite; }
  @keyframes pstspin { to { transform:rotate(360deg); } }
`;

function fmtDay(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : ''; }

function Learned({ study }) {
  return (
    <div className="pst-learn">
      <div><h4>O que a RENATA aprendeu</h4>{study.summary}</div>
      {study.conclusions.length > 0 && <div><h4>Conclusões</h4><ul>{study.conclusions.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      {study.recommendations.length > 0 && (
        <div>
          <h4>O que aconselhar ao cliente</h4>
          <ul>{study.recommendations.map((r, i) => (
            <li key={i}>{r.situation && <b>{r.situation}: </b>}{r.advice}{r.caveat ? <span style={{ color: 'var(--text-5)' }}> (Ressalva: {r.caveat})</span> : null}</li>
          ))}</ul>
        </div>
      )}
      {(study.appliesTo || study.triggers.length > 0) && (
        <div>
          <h4>Onde isso pode ser usado</h4>
          {study.appliesTo}
          {study.triggers.length > 0 && <ul style={{ marginTop: 6 }}>{study.triggers.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      )}
      {study.themes.length > 0 && <div className="pst-tags">{study.themes.map((t, i) => <span key={i} className="pst-tag">{t}</span>)}</div>}
      {study.limits && <div><h4>Limites do parecer</h4>{study.limits}</div>}
    </div>
  );
}

export default function ParecerStudyModal({ onClose, projectId }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [lastResult, setLastResult] = useState('');
  const timer = useRef(null);

  async function load() {
    try {
      const r = await apiGet(`/api/pareceres/study${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
      if (r && Array.isArray(r.items)) { setState(r); setError(''); } else setError('Não foi possível carregar o estudo dos pareceres.');
      return r;
    } catch (e) {
      setError(e && e.message ? e.message : 'Não foi possível carregar o estudo dos pareceres.');
      return null;
    }
  }

  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (state && (state.running > 0 || state.jobRunning)) timer.current = setTimeout(load, 4000);
    return () => clearTimeout(timer.current);
  }, [state]);

  async function start() {
    setStarting(true);
    setError('');
    setLastResult('');
    try {
      const r = await apiPost('/api/pareceres/study', {});
      if (r && r.upToDate) setLastResult('Nenhum parecer novo desde o último estudo — nada foi gasto.');
      await load();
    } catch (e) {
      setError(e && e.message ? e.message : 'Não foi possível iniciar o estudo.');
    } finally {
      setStarting(false);
    }
  }

  const busy = state && (state.running > 0 || state.jobRunning);
  const pct = state && state.total ? Math.round((state.studied / state.total) * 100) : 0;
  const failed = state ? state.items.filter((i) => i.state === 'failed') : [];

  return (
    <DialogOverlay className="pst-overlay" onClose={onClose} label="Estudar Pareceres">
      <style>{CSS}</style>
      <div className="pst-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pst-head">
          <div>
            <div className="pst-title"><BookOpen size={20} color="#F5C400" /> Estudar Pareceres</div>
            <div className="pst-sub">A RENATA lê cada parecer da PRICETAX uma única vez e guarda o que aprendeu: o que o parecer conclui, o que aconselhar ao cliente e onde usar. Depois disso ela sugere esses caminhos nas reuniões e nas respostas.</div>
          </div>
          <button className="pst-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="pst-body">
          {!state && !error && <div className="pst-note">Carregando…</div>}
          {error && <div className="pst-error">{error}</div>}
          {state && (
            <>
              <div className="pst-status">
                <div>
                  <div className="pst-count">{state.studied} de {state.total}<small>pareceres estudados</small></div>
                  <div className="pst-bar"><i style={{ width: `${pct}%` }} /></div>
                </div>
                {state.total === 0 ? (
                  <div className="pst-note">Nenhum parecer enviado ainda.</div>
                ) : busy ? (
                  <button className="pst-btn" disabled><Loader2 size={16} className="pst-spin" /> Estudando…</button>
                ) : state.pending > 0 ? (
                  <button className="pst-btn" onClick={start} disabled={starting}>
                    <Sparkles size={16} /> {starting ? 'Iniciando…' : `Estudar ${state.pending} parecer${state.pending === 1 ? '' : 'es'} ${failed.length === state.pending ? 'de novo' : 'novo' + (state.pending === 1 ? '' : 's')}`}
                  </button>
                ) : (
                  <button className="pst-btn" disabled><CheckCircle2 size={16} /> Tudo estudado</button>
                )}
              </div>
              {!busy && state.total > 0 && state.pending === 0 && (
                <div className="pst-note">Sem custo: a RENATA só usa a IA quando há parecer novo. Quando você enviar outro parecer, este botão volta a ficar ativo.</div>
              )}
              {busy && <div className="pst-note">Isso leva alguns minutos por parecer. Pode fechar esta janela: o estudo continua e o resultado fica guardado.</div>}
              {lastResult && <div className="pst-note">{lastResult}</div>}
              {state.others && state.others.count > 0 && (
                <div className="pst-note pst-others">
                  <Lock size={13} /> {state.others.count} parecer{state.others.count === 1 ? '' : 'es'} específico{state.others.count === 1 ? '' : 's'} de outros clientes {state.others.count === 1 ? 'entra' : 'entram'} no estudo, mas {state.others.count === 1 ? 'fica guardado' : 'ficam guardados'} e só {state.others.count === 1 ? 'é usado' : 'são usados'} na empresa {state.others.count === 1 ? 'dele' : 'deles'}. Não aparecem aqui nem nas sugestões desta empresa.
                </div>
              )}

              {state.items.map((it) => {
                const canOpen = !!it.study;
                const isOpen = openId === it.id;
                return (
                  <div key={it.id} className="pst-item">
                    <div className={`pst-item-head${canOpen ? '' : ' static'}`} onClick={() => canOpen && setOpenId(isOpen ? null : it.id)}>
                      {canOpen ? (isOpen ? <ChevronDown size={16} color="var(--text-5)" /> : <ChevronRight size={16} color="var(--text-5)" />) : <span style={{ width: 16 }} />}
                      <div className="pst-item-title">{it.title}</div>
                      {it.state === 'done' && <span className="pst-pill done"><CheckCircle2 size={12} /> Estudado em {fmtDay(it.studiedAt)}</span>}
                      {it.state === 'changed' && <span className="pst-pill new">Arquivo alterado</span>}
                      {it.state === 'new' && <span className="pst-pill new">Novo</span>}
                      {it.state === 'running' && <span className="pst-pill running"><Loader2 size={12} className="pst-spin" /> Estudando</span>}
                      {it.state === 'failed' && <span className="pst-pill failed"><AlertTriangle size={12} /> Falhou</span>}
                    </div>
                    {it.state === 'failed' && it.error && <div className="pst-error" style={{ padding: '0 16px 12px 40px' }}>{it.error}</div>}
                    {isOpen && it.study && <Learned study={it.study} />}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </DialogOverlay>
  );
}
