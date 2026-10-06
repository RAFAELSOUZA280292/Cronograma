import React, { useEffect, useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js';
import { buildScriptableScript } from './scriptableScript.js';
import { askConfirm } from '../ui/dialogs.jsx';
import { SaveStatus } from '../ui/index.jsx';
import { useAutosave } from '../lib/useAutosave.js';

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
  .wgt-det { margin-top:16px; border:1px solid var(--border-2); border-radius:10px; background:var(--bg-2); }
  .wgt-det > summary { cursor:pointer; padding:10px 12px; font-size:12.5px; font-weight:700; color:var(--text-3); min-height:44px; box-sizing:border-box; display:flex; align-items:center; }
  .wgt-det-body { padding:0 12px 12px; }
  .wgt-btn:focus-visible, .wgt-x:focus-visible, .wgt-check:focus-within, .wgt-det > summary:focus-visible, .wgt-view-head input:focus-visible, .wgt-code:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) {
    .wgt-btn, .wgt-btn.sm { min-height:44px; }
    .wgt-x { min-height:44px; min-width:44px; }
    .wgt-check { min-height:44px; }
    .wgt-view-head input { min-height:44px; font-size:16px; }
    .wgt-code { font-size:16px; }
  }
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
    if (status && status.active && !(await askConfirm({ title: 'Gerar uma chave de acesso nova?', message: 'Gerar uma chave nova desliga os widgets que já estão no seu iPhone até você colar os scripts novos.', confirmLabel: 'Gerar chave nova', danger: true }))) return;
    setBusy(true); setError('');
    try { await apiPost('/api/widget/token'); await loadStatus(); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível gerar a chave de acesso agora. Tente de novo em instantes.'); } finally { setBusy(false); }
  }

  async function revoke() {
    if (!(await askConfirm({ title: 'Revogar o acesso dos widgets?', message: 'Revogar desliga todos os widgets do iPhone. Você pode gerar outra chave de acesso quando quiser.', confirmLabel: 'Revogar chave', danger: true }))) return;
    setBusy(true); setError('');
    try { await apiDelete('/api/widget/token'); await loadStatus(); } catch (e) { setError(e && e.message ? e.message : 'Não foi possível revogar a chave agora. Tente de novo em instantes.'); } finally { setBusy(false); }
  }

  // As visões gravam sozinhas (Onda 4): sem botão "Salvar". Só grava quando todas têm nome e ao menos um bloco.
  const viewsSave = useAutosave({
    value: views, armed: views !== null, delay: 900,
    validate: (vs) => {
      if (!vs) return '';
      if (vs.some((v) => !v.name.trim())) return 'Dê um nome a cada visão para gravar.';
      if (vs.some((v) => !v.blocks.length)) return 'Marque ao menos um item em cada visão para gravar.';
      return '';
    },
    save: async (vs) => { await apiPut('/api/widget/views', { views: vs }); },
  });
  const viewsDirty = viewsSave.dirty;
  function editView(i, patch) { setViews((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v))); setManual(null); }
  function toggleBlock(i, key) { const v = views[i]; editView(i, { blocks: v.blocks.includes(key) ? v.blocks.filter((b) => b !== key) : [...v.blocks, key] }); }
  function addView() { setViews((vs) => [...vs, { name: '', blocks: ['overdue'] }]); }
  function removeView(i) { setViews((vs) => vs.filter((_, k) => k !== i)); setManual(null); }
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
      <p>Veja na tela de início do iPhone as atividades atrasadas, as que vencem hoje, as urgentes, a agenda e a próxima reunião, sem entrar no painel. Usa o app gratuito <b>Scriptable</b> e uma chave de acesso só sua, que só lê.</p>

      {!status ? <p>Carregando...</p> : (
        <>
          {status.active && (
            <p>Ligado desde {fmtTs(status.createdAt)}{status.lastUsedAt ? `. Última atualização no iPhone: ${fmtTs(status.lastUsedAt)}.` : '. Ainda não foi usado.'}</p>
          )}
          {status.active && !status.recoverable && (
            <div className="wgt-warn">Sua chave de acesso foi criada numa versão anterior e não dá para montar os scripts das visões a partir dela. Gere uma chave nova uma vez; depois os scripts ficam disponíveis aqui sempre que você quiser.</div>
          )}
          {(!status.active || !status.recoverable) && (
            <button className="wgt-btn primary" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={generate}>{busy ? 'Gerando...' : status.active ? 'Gerar chave de acesso nova' : 'Gerar chave de acesso'}</button>
          )}
        </>
      )}

      {views && (
        <div className="wgt-views">
          <div className="wgt-label">Suas visões</div>
          <p>Cada visão é um widget diferente, com o seu próprio script. Monte a visão (ela grava sozinha), copie o script dela e cole num script novo do Scriptable.</p>
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
                  <button type="button" className="wgt-btn sm primary" disabled={viewsDirty || !v.name.trim()} title={viewsDirty ? 'Aguarde as visões gravarem para copiar o script' : !v.name.trim() ? 'Dê um nome à visão' : 'Copiar script desta visão'} onClick={() => copyScript(i)}>
                    {copied === i ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar script desta visão</>}
                  </button>
                  <div className="wgt-name">{viewsDirty ? 'Aguarde as visões gravarem para copiar o script.' : `No Scriptable, dê o nome “PRICETAX ${v.name || '…'}” ao script.`}</div>
                  {manual && manual.i === i && (
                    <>
                      <div className="wgt-warn">Não foi possível copiar automaticamente. Toque no texto, selecione tudo e use Copiar.</div>
                      <textarea className="wgt-code" readOnly aria-label="Script para copiar" value={manual.script} onFocus={(e) => e.target.select()} />
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {views.length < 6 && <button className="wgt-btn" type="button" title="Adicionar visão" onClick={addView}>Adicionar visão</button>}
          <div style={{ marginTop: 10, minHeight: 18 }}>
            <SaveStatus state={viewsSave.state} savedAt={viewsSave.savedAt} onRetry={viewsSave.retry} idleText="As visões gravam sozinhas." />
            {viewsSave.reason && <div className="wgt-warn">{viewsSave.reason}</div>}
          </div>
          {viewsSave.state === 'saved' && <div className="wgt-ok">Mudou o que a visão mostra? O widget acompanha na próxima atualização, sem colar de novo. Só criar visão nova ou trocar o nome exige um script novo.</div>}
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
          <details className="wgt-det">
            <summary>Detalhes para quem integra</summary>
            <div className="wgt-det-body">
              <p>Cada widget é um script do Scriptable que consulta <code>{window.location.origin}/api/widget</code> com a chave de acesso embutida no próprio script. Por isso o script não deve ser compartilhado: quem o tiver lê as mesmas informações que o widget. Se isso acontecer, gere uma chave nova — as antigas deixam de funcionar.</p>
            </div>
          </details>
          <button className="wgt-btn" type="button" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={generate}>Gerar chave de acesso nova</button>
          <button className="wgt-btn danger" type="button" disabled={busy} title={busy ? 'Aguarde terminar' : undefined} onClick={revoke}>Revogar chave de acesso</button>
        </div>
      )}
      {status && status.active && !ready && status.recoverable && <p>Carregando a chave de acesso...</p>}
      {error && <div className="wgt-err">{error}</div>}
    </div>
  );
}
