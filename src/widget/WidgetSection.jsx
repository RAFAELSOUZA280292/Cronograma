import React, { useEffect, useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js';
import { buildScriptableScript } from './scriptableScript.js';
import { askConfirm } from '../ui/dialogs.jsx';

const CSS = `
  .wgt { font-family:'Inter', sans-serif; }
  .wgt-label { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-6); display:flex; align-items:center; gap:6px; }
  .wgt p { font-size:12px; line-height:1.5; color:var(--text-4); margin:6px 0 0; }
  .wgt-btn { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; margin-top:10px; font-family:inherit; font-size:13px; font-weight:700; border-radius:10px; padding:10px 14px; cursor:pointer; border:1px solid var(--border-3); background:var(--bg-3); color:var(--text-2); min-height:42px; }
  .wgt-btn:hover:not(:disabled) { background:var(--bg-4); }
  .wgt-btn:disabled { opacity:.6; cursor:default; }
  .wgt-btn.primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .wgt-btn.primary:hover:not(:disabled) { background:#ffd21f; }
  .wgt-btn.danger { color:var(--ui-danger); }
  .wgt-btn.sm { width:auto; margin-top:10px; padding:8px 14px; min-height:38px; }
  .wgt-code { width:100%; box-sizing:border-box; margin-top:10px; height:96px; resize:none; font-family:ui-monospace, Menlo, monospace; font-size:11px; line-height:1.4; background:var(--bg-1); color:var(--text-3); border:1px solid var(--border-2); border-radius:8px; padding:8px; }
  .wgt ol { margin:8px 0 0; padding-left:18px; font-size:12px; line-height:1.55; color:var(--text-3); }
  .wgt ol li { margin-bottom:3px; }
  .wgt-views { margin-top:18px; padding-top:16px; border-top:1px dashed var(--border-2); }
  .wgt-view { margin-top:10px; border:1px solid var(--border-2); border-radius:10px; padding:10px; background:var(--bg-2); }
  .wgt-view-head { display:flex; gap:8px; align-items:center; }
  .wgt-view-head input { flex:1; min-width:0; }
  .wgt-x { background:transparent; border:1px solid var(--border-3); color:var(--text-4); border-radius:8px; padding:6px 10px; font-family:inherit; font-size:12px; cursor:pointer; min-height:34px; }
  .wgt-x:hover { color:var(--ui-danger); }
  .wgt-checks { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .wgt-check { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-3); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:6px 11px; cursor:pointer; min-height:32px; }
  .wgt-check input { margin:0; }
  .wgt-check.on { border-color:#F5C400; color:var(--text-1); }
  .wgt-name { font-size:11.5px; color:var(--text-5); margin-top:8px; }
  .wgt-ok { margin-top:8px; font-size:12px; color:var(--ui-ok); }
  .wgt-warn { margin-top:10px; font-size:12px; line-height:1.5; color:var(--ui-warn); background:rgba(255,159,64,.12); border-radius:8px; padding:8px 10px; }
  .wgt-err { margin-top:8px; font-size:12px; color:var(--ui-danger); }
`;

function fmtTs(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export default function WidgetSection() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [views, setViews] = useState(null);
  const [blockNames, setBlockNames] = useState({});
  const [viewsDirty, setViewsDirty] = useState(false);
  const [viewsSaved, setViewsSaved] = useState(false);
  const [copied, setCopied] = useState(-1);
  const [manual, setManual] = useState(null);

  async function loadStatus() {
    try {
      const st = await apiGet('/api/widget/status');
      setStatus(st);
      if (st.active && st.recoverable) { try { setToken((await apiGet('/api/widget/token')).token); } catch { setToken(''); } } else setToken('');
    } catch { setStatus({ active: false, failed: true }); }
  }
  useEffect(() => { loadStatus(); apiGet('/api/widget/views').then((r) => { setViews(r.views); setBlockNames(r.blocks || {}); }).catch(() => {}); }, []);

  async function generate() {
    if (status && status.active && !(await askConfirm({ title: 'Gerar um código novo?', message: 'Gerar um novo código desliga os widgets que já estão no seu iPhone até você colar os scripts novos.', confirmLabel: 'Gerar código novo', danger: true }))) return;
    setBusy(true); setError('');
    try { await apiPost('/api/widget/token'); await loadStatus(); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível gerar o código.'); } finally { setBusy(false); }
  }

  async function revoke() {
    if (!(await askConfirm({ title: 'Revogar o acesso dos widgets?', message: 'Revogar desliga todos os widgets do iPhone. Você pode gerar outro código quando quiser.', confirmLabel: 'Revogar', danger: true }))) return;
    setBusy(true); setError('');
    try { await apiDelete('/api/widget/token'); await loadStatus(); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível revogar.'); } finally { setBusy(false); }
  }

  function editView(i, patch) { setViews((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v))); setViewsDirty(true); setViewsSaved(false); setManual(null); }
  function toggleBlock(i, key) { const v = views[i]; editView(i, { blocks: v.blocks.includes(key) ? v.blocks.filter((b) => b !== key) : [...v.blocks, key] }); }
  function addView() { setViews((vs) => [...vs, { name: '', blocks: ['overdue'] }]); setViewsDirty(true); setViewsSaved(false); }
  function removeView(i) { setViews((vs) => vs.filter((_, k) => k !== i)); setViewsDirty(true); setViewsSaved(false); setManual(null); }
  async function saveViews() {
    setBusy(true); setError('');
    try { const r = await apiPut('/api/widget/views', { views }); setViews(r.views); setViewsDirty(false); setViewsSaved(true); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  async function copyScript(i) {
    const script = buildScriptableScript({ baseUrl: window.location.origin, token, view: views[i].name });
    setError('');
    try { await navigator.clipboard.writeText(script); setCopied(i); setManual(null); setTimeout(() => setCopied((c) => (c === i ? -1 : c)), 2500); } catch { setManual({ i, script }); }
  }

  const ready = !!(status && status.active && token);

  return (
    <div className="wgt">
      <style>{CSS}</style>
      <div className="wgt-label"><Smartphone size={13} /> Widgets do iPhone</div>
      <p>Veja na tela de início do iPhone as atividades atrasadas, as que vencem hoje, as urgentes, a agenda e a próxima reunião, sem entrar no painel. Usa o app gratuito <b>Scriptable</b> e um código só seu, que só lê.</p>

      {!status ? <p>Carregando...</p> : (
        <>
          {status.active && (
            <p>Ligado desde {fmtTs(status.createdAt)}{status.lastUsedAt ? `. Última atualização no iPhone: ${fmtTs(status.lastUsedAt)}.` : '. Ainda não foi usado.'}</p>
          )}
          {status.active && !status.recoverable && (
            <div className="wgt-warn">Seu código foi criado numa versão anterior e não dá para montar os scripts das visões a partir dele. Gere um código novo uma vez; depois os scripts ficam disponíveis aqui sempre que você quiser.</div>
          )}
          {(!status.active || !status.recoverable) && (
            <button className="wgt-btn primary" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={generate}>{busy ? 'Gerando...' : status.active ? 'Gerar código novo' : 'Gerar código do widget'}</button>
          )}
        </>
      )}

      {views && (
        <div className="wgt-views">
          <div className="wgt-label">Suas visões</div>
          <p>Cada visão é um widget diferente, com o seu próprio script. Monte a visão, salve, copie o script dela e cole num script novo do Scriptable.</p>
          {views.map((v, i) => (
            <div key={i} className="wgt-view">
              <div className="wgt-view-head">
                <input value={v.name} maxLength={24} placeholder="Nome da visão" aria-label="Nome da visão" onChange={(e) => editView(i, { name: e.target.value })} />
                {views.length > 1 && <button type="button" className="wgt-x" title="Remover esta visão" aria-label={`Remover visão ${v.name || i + 1}`} onClick={() => removeView(i)}>Remover</button>}
              </div>
              <div className="wgt-checks">
                {Object.keys(blockNames).map((key) => (
                  <label key={key} className={`wgt-check${v.blocks.includes(key) ? ' on' : ''}`}>
                    <input type="checkbox" checked={v.blocks.includes(key)} onChange={() => toggleBlock(i, key)} /> {blockNames[key]}
                  </label>
                ))}
              </div>
              {ready && (
                <>
                  <button type="button" className="wgt-btn sm primary" disabled={viewsDirty || !v.name.trim()} title={viewsDirty ? 'Salve as visões para copiar o script' : !v.name.trim() ? 'Dê um nome à visão' : 'Copiar script desta visão'} onClick={() => copyScript(i)}>
                    {copied === i ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar script desta visão</>}
                  </button>
                  <div className="wgt-name">{viewsDirty ? 'Salve as visões para copiar o script.' : `No Scriptable, dê o nome “PRICETAX ${v.name || '…'}” ao script.`}</div>
                  {manual && manual.i === i && (
                    <>
                      <div className="wgt-warn">Não consegui copiar sozinho. Toque no texto, selecione tudo e use Copiar.</div>
                      <textarea className="wgt-code" readOnly value={manual.script} onFocus={(e) => e.target.select()} />
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {views.length < 6 && <button className="wgt-btn" type="button" title="Adicionar visão" onClick={addView}>Adicionar visão</button>}
          <button className="wgt-btn primary" type="button" disabled={busy || !viewsDirty} title={busy ? 'Aguarde terminar' : !viewsDirty ? 'Nenhuma mudança para salvar' : undefined} onClick={saveViews}>Salvar visões</button>
          {viewsSaved && <div className="wgt-ok">Salvo. Mudou o que a visão mostra? O widget acompanha na próxima atualização, sem colar de novo. Só criar visão nova ou trocar o nome exige um script novo.</div>}
        </div>
      )}

      {ready && (
        <div className="wgt-views">
          <div className="wgt-label">Como colocar um widget na tela</div>
          <ol>
            <li>Instale o <b>Scriptable</b> na App Store (grátis).</li>
            <li>Abra o app, toque em <b>+</b>, cole o script da visão e toque em Concluir. Se já tiver um script antigo do PRICETAX, apague o conteúdo dele e cole o novo.</li>
            <li>Na tela de início: segure num espaço vazio, <b>+</b>, escolha <b>Scriptable</b> e o tamanho (o médio mostra os títulos).</li>
            <li>Segure o widget, toque em <b>Editar Widget</b> e em Script escolha o da visão.</li>
          </ol>
          <button className="wgt-btn" type="button" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={generate}>Gerar código novo</button>
          <button className="wgt-btn danger" type="button" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={revoke}>Revogar acesso dos widgets</button>
        </div>
      )}
      {status && status.active && !ready && status.recoverable && <p>Carregando o código...</p>}
      {error && <div className="wgt-err">{error}</div>}
    </div>
  );
}
