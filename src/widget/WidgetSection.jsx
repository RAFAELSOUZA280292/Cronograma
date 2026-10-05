import React, { useEffect, useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js';
import { buildScriptableScript } from './scriptableScript.js';

const CSS = `
  .wgt { font-family:'Inter', sans-serif; }
  .wgt-label { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-6); display:flex; align-items:center; gap:6px; }
  .wgt p { font-size:12px; line-height:1.5; color:var(--text-4); margin:6px 0 0; }
  .wgt-btn { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; margin-top:10px; font-family:inherit; font-size:13px; font-weight:700; border-radius:10px; padding:10px 14px; cursor:pointer; border:1px solid var(--border-3); background:var(--bg-3); color:var(--text-2); }
  .wgt-btn:hover:not(:disabled) { background:var(--bg-4); }
  .wgt-btn:disabled { opacity:.6; cursor:default; }
  .wgt-btn.primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .wgt-btn.primary:hover:not(:disabled) { background:#ffd21f; }
  .wgt-btn.danger { color:var(--ui-danger); }
  .wgt-code { width:100%; box-sizing:border-box; margin-top:10px; height:96px; resize:none; font-family:ui-monospace, Menlo, monospace; font-size:11px; line-height:1.4; background:var(--bg-1); color:var(--text-3); border:1px solid var(--border-2); border-radius:8px; padding:8px; }
  .wgt ol { margin:8px 0 0; padding-left:18px; font-size:12px; line-height:1.55; color:var(--text-3); }
  .wgt ol li { margin-bottom:3px; }
  .wgt-warn { margin-top:10px; font-size:12px; line-height:1.5; color:var(--ui-warn); background:rgba(255,159,64,.12); border-radius:8px; padding:8px 10px; }
  .wgt-views { margin-top:18px; padding-top:16px; border-top:1px dashed var(--border-2); }
  .wgt-view { margin-top:10px; border:1px solid var(--border-2); border-radius:10px; padding:10px; background:var(--bg-2); }
  .wgt-view-head { display:flex; gap:8px; align-items:center; }
  .wgt-view-head input { flex:1; min-width:0; }
  .wgt-x { background:transparent; border:1px solid var(--border-3); color:var(--text-4); border-radius:8px; padding:6px 10px; font-family:inherit; font-size:12px; cursor:pointer; }
  .wgt-x:hover { color:var(--ui-danger); }
  .wgt-checks { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .wgt-check { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-3); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:6px 11px; cursor:pointer; min-height:32px; }
  .wgt-check input { margin:0; }
  .wgt-check.on { border-color:#F5C400; color:var(--text-1); }
  .wgt-ok { margin-top:8px; font-size:12px; color:var(--ui-ok); }
  .wgt-err { margin-top:8px; font-size:12px; color:var(--ui-danger); }
`;

function fmtTs(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export default function WidgetSection() {
  const [status, setStatus] = useState(null);
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try { setStatus(await apiGet('/api/widget/status')); } catch { setStatus({ active: false, failed: true }); }
  }
  const [views, setViews] = useState(null);
  const [blockNames, setBlockNames] = useState({});
  const [viewsDirty, setViewsDirty] = useState(false);
  const [viewsSaved, setViewsSaved] = useState(false);
  useEffect(() => { load(); apiGet('/api/widget/views').then((r) => { setViews(r.views); setBlockNames(r.blocks || {}); }).catch(() => {}); }, []);

  function editView(i, patch) { setViews((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v))); setViewsDirty(true); setViewsSaved(false); }
  function toggleBlock(i, key) {
    const v = views[i];
    editView(i, { blocks: v.blocks.includes(key) ? v.blocks.filter((b) => b !== key) : [...v.blocks, key] });
  }
  function addView() { setViews((vs) => [...vs, { name: '', blocks: ['overdue'] }]); setViewsDirty(true); setViewsSaved(false); }
  function removeView(i) { setViews((vs) => vs.filter((_, k) => k !== i)); setViewsDirty(true); setViewsSaved(false); }
  async function saveViews() {
    setBusy(true); setError('');
    try {
      const r = await apiPut('/api/widget/views', { views });
      setViews(r.views); setViewsDirty(false); setViewsSaved(true);
    } catch (e) { setError(e && e.message ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  async function generate() {
    if (status && status.active && !window.confirm('Gerar um novo código vai desligar o widget que já está no seu iPhone até você colar o novo script. Continuar?')) return;
    setBusy(true); setError(''); setCopied(false);
    try {
      const { token } = await apiPost('/api/widget/token');
      setScript(buildScriptableScript({ baseUrl: window.location.origin, token }));
      await load();
    } catch (e) { setError(e && e.message ? e.message : 'Não foi possível gerar o código.'); } finally { setBusy(false); }
  }

  async function revoke() {
    if (!window.confirm('Revogar desliga o widget do iPhone. Você pode gerar outro código quando quiser. Revogar?')) return;
    setBusy(true); setError('');
    try { await apiDelete('/api/widget/token'); setScript(''); await load(); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível revogar.'); } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {
      const ta = document.getElementById('wgt-script');
      if (ta) { ta.focus(); ta.select(); }
      setError('Não consegui copiar sozinho: o texto está selecionado, use Copiar do iPhone.');
    }
  }

  return (
    <div className="wgt">
      <style>{CSS}</style>
      <div className="wgt-label"><Smartphone size={13} /> Widget do iPhone</div>
      <p>Veja na tela de início do iPhone as atividades atrasadas, as que vencem hoje e a próxima reunião, sem entrar no painel. Usa o app gratuito <b>Scriptable</b> e um código só seu, que só lê.</p>

      {!status ? <p>Carregando...</p> : (
        <>
          {status.active && !script && (
            <p>Widget ligado desde {fmtTs(status.createdAt)}{status.lastUsedAt ? `. Última atualização no iPhone: ${fmtTs(status.lastUsedAt)}.` : '. Ainda não foi usado.'}</p>
          )}

          {!script && (
            <button className={`wgt-btn${status.active ? '' : ' primary'}`} disabled={busy} onClick={generate}>
              {busy ? 'Gerando...' : status.active ? 'Gerar novo código' : 'Gerar código do widget'}
            </button>
          )}
          {status.active && !script && <button className="wgt-btn danger" disabled={busy} onClick={revoke}>Revogar acesso do widget</button>}

          {script && (
            <>
              <div className="wgt-warn">Este código aparece só agora. Copie e cole no Scriptable antes de fechar. Quem tiver o código vê só o resumo (títulos e horários), nunca edita nada.</div>
              <textarea id="wgt-script" className="wgt-code" readOnly value={script} onFocus={(e) => e.target.select()} />
              <button className="wgt-btn primary" onClick={copy}>{copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar script</>}</button>
              <ol>
                <li>Instale o <b>Scriptable</b> na App Store (grátis).</li>
                <li>Abra o app, toque em <b>+</b>, cole o script e toque em Concluir.</li>
                <li>Na tela de início do iPhone: segure num espaço vazio, <b>+</b>, escolha <b>Scriptable</b> e o tamanho.</li>
                <li>Segure o widget, toque em <b>Editar Widget</b>, em Script escolha o que você colou.</li>
              </ol>
              <button className="wgt-btn" onClick={() => setScript('')}>Já colei, fechar</button>
            </>
          )}
        </>
      )}

      {views && (
        <div className="wgt-views">
          <div className="wgt-label">O que mostrar</div>
          <p>Cada visão é um widget diferente. A primeira aparece sozinha; para usar outra, no widget do iPhone toque em <b>Editar Widget</b> e escreva o nome da visão em <b>Parameter</b>. Mudou aqui, o widget muda na próxima atualização, sem colar nada de novo.</p>
          {views.map((v, i) => (
            <div key={i} className="wgt-view">
              <div className="wgt-view-head">
                <input value={v.name} maxLength={24} placeholder="Nome da visão" aria-label="Nome da visão" onChange={(e) => editView(i, { name: e.target.value })} />
                {views.length > 1 && <button type="button" className="wgt-x" onClick={() => removeView(i)}>Remover</button>}
              </div>
              <div className="wgt-checks">
                {Object.keys(blockNames).map((key) => (
                  <label key={key} className={`wgt-check${v.blocks.includes(key) ? ' on' : ''}`}>
                    <input type="checkbox" checked={v.blocks.includes(key)} onChange={() => toggleBlock(i, key)} /> {blockNames[key]}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {views.length < 6 && <button className="wgt-btn" type="button" onClick={addView}>Adicionar visão</button>}
          <button className="wgt-btn primary" type="button" disabled={busy || !viewsDirty} onClick={saveViews}>Salvar visões</button>
          {viewsSaved && <div className="wgt-ok">Salvo. O widget atualiza na próxima vez que o iPhone renovar (15–30 min), ou ao rodar o script.</div>}
        </div>
      )}
      {error && <div className="wgt-err">{error}</div>}
    </div>
  );
}
