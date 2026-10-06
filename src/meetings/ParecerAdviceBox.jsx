import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Loader2, RefreshCw, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';

const CSS = `
  .pab { border:1px solid var(--border-1); border-radius:14px; background:var(--bg-2); overflow:hidden; font-family:'Inter', sans-serif; }
  .pab-head { display:flex; align-items:center; gap:9px; padding:13px 16px; background:rgba(245,196,0,.10); border-bottom:1px solid var(--border-1); }
  .pab-head-icon { width:26px; height:26px; border-radius:8px; background:#F5C400; color:#111; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .pab-head-title { font-size:13px; font-weight:800; color:var(--text-1); line-height:1.25; }
  .pab-head-sub { font-size:11.5px; color:var(--text-5); margin-top:1px; }
  .pab-body { padding:14px 16px 16px; display:flex; flex-direction:column; gap:16px; }
  .pab-item { display:flex; flex-direction:column; gap:9px; }
  .pab-item + .pab-item { padding-top:16px; border-top:1px dashed var(--border-2); }
  .pab-kicker { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .pab-chip { display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--ui-accent-text); background:rgba(245,196,0,.2); border-radius:999px; padding:3px 9px; min-width:0; }
  .pab-open { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--text-4); text-decoration:none; flex-shrink:0; }
  .pab-open:hover { color:var(--text-1); }
  .pab-topic { font-size:14.5px; font-weight:800; color:var(--text-1); line-height:1.35; }
  .pab-why { font-size:12.5px; line-height:1.55; color:var(--text-4); }
  .pab-lead { font-size:12px; font-weight:700; color:var(--text-2); }
  .pab-steps { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:7px; }
  .pab-steps li { display:flex; gap:9px; font-size:12.5px; line-height:1.5; color:var(--text-2); background:var(--bg-3); border-radius:9px; padding:9px 11px; }
  .pab-steps li svg { flex-shrink:0; margin-top:2px; color:var(--ui-accent-text); }
  .pab-caution { display:flex; gap:8px; font-size:12px; line-height:1.5; color:#9a5b00; background:rgba(255,159,64,.13); border-radius:9px; padding:8px 10px; }
  .pab-caution svg { flex-shrink:0; margin-top:2px; }
  .pab-muted { font-size:12.5px; line-height:1.55; color:var(--text-5); }
  .pab-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:11.5px; color:var(--text-6); }
  .pab-btn { display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:12.5px; font-weight:700; border-radius:9px; padding:8px 13px; cursor:pointer; border:1px solid var(--border-3); background:var(--bg-1); color:var(--text-2); align-self:flex-start; }
  .pab-btn:hover:not(:disabled) { background:var(--bg-3); }
  .pab-btn:disabled { opacity:.6; cursor:default; }
  .pab-btn.primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .pab-btn.primary:hover:not(:disabled) { background:#ffd21f; }
  .pab-error { font-size:12px; color:var(--ui-danger); }
  .pab-spin { animation:pabspin 1s linear infinite; }
  @keyframes pabspin { to { transform:rotate(360deg); } }

  .pab-btn:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .pab-btn { min-height:44px; } }
`;

function fmtWhen(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

export default function ParecerAdviceBox({ projectId, meetingId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);
  const query = `projectId=${encodeURIComponent(projectId)}&meetingId=${encodeURIComponent(meetingId)}`;

  async function load() {
    try {
      const r = await apiGet(`/api/pareceres/advice?${query}`);
      if (r && typeof r.hasStudies === 'boolean') { setData(r); setError(''); }
    } catch (e) {
      setError(e && e.message ? e.message : '');
    }
  }

  useEffect(() => { setData(null); load(); return () => clearTimeout(timer.current); }, [projectId, meetingId]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (data && data.generating) timer.current = setTimeout(load, 5000);
    return () => clearTimeout(timer.current);
  }, [data]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const r = await apiPost('/api/pareceres/advice', { projectId, meetingId });
      if (r && typeof r.hasStudies === 'boolean') setData(r);
    } catch (e) {
      setError(e && e.message ? e.message : 'Não foi possível consultar os pareceres agora.');
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return null;
  if (!data) return null;
  const generating = data.generating || busy;
  const items = data.advice ? data.advice.items : [];

  return (
    <div className="pab">
      <style>{CSS}</style>
      <div className="pab-head">
        <div className="pab-head-icon"><BookOpen size={15} /></div>
        <div>
          <div className="pab-head-title">RENATA · Pareceres PRICETAX</div>
          <div className="pab-head-sub">Caminhos para seguir com o cliente, conforme o que a RENATA estudou</div>
        </div>
      </div>
      <div className="pab-body">
        {!data.hasStudies && (
          <div className="pab-muted">A RENATA ainda não estudou nenhum parecer. Abra o painel da RENATA e use <b>Estudar Pareceres</b>: depois disso ela aponta aqui os pareceres que se aplicam a cada reunião.</div>
        )}

        {data.hasStudies && generating && (
          <div className="pab-muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="pab-spin" /> A RENATA está cruzando esta reunião com os pareceres…</div>
        )}

        {data.hasStudies && !generating && !data.advice && (
          <>
            <div className="pab-muted">A RENATA pode cruzar o que foi tratado nesta reunião com os pareceres que estudou e sugerir os caminhos a seguir com o cliente.</div>
            <button className="pab-btn primary" onClick={generate}><Sparkles size={14} /> Consultar pareceres</button>
          </>
        )}

        {data.hasStudies && !generating && data.advice && items.length === 0 && (
          <div className="pab-muted">Nenhum parecer estudado trata dos temas desta reunião.</div>
        )}

        {!generating && items.map((it) => (
          <div key={`${it.parecerId}-${it.topic}`} className="pab-item">
            <div className="pab-kicker">
              <span className="pab-chip">{it.number ? `Parecer Nº ${it.number}` : 'Parecer'}</span>
              <a className="pab-open" href={`/api/pareceres/${it.parecerId}/file`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Abrir parecer</a>
            </div>
            <div className="pab-topic">{it.topic}</div>
            {it.relevance && <div className="pab-why">{it.relevance}</div>}
            <div className="pab-lead">Conforme o estudo da RENATA, aconselhe o cliente a:</div>
            <ul className="pab-steps">
              {it.steps.map((st, i) => <li key={i}><ArrowRight size={14} /><span>{st}</span></li>)}
            </ul>
            {it.caution && <div className="pab-caution"><AlertTriangle size={14} /><span>{it.caution}</span></div>}
          </div>
        ))}

        {error && <div className="pab-error">{error}</div>}

        {data.hasStudies && !generating && data.advice && (
          <div className="pab-foot">
            <span>Gerado em {fmtWhen(data.advice.generatedAt)}{data.stale ? ' · a RENATA estudou pareceres novos desde então' : ''}</span>
            {data.stale && <button className="pab-btn" onClick={generate}><RefreshCw size={13} /> Atualizar sugestões</button>}
          </div>
        )}
      </div>
    </div>
  );
}
