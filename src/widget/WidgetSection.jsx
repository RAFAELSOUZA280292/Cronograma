import React, { useEffect, useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import { buildScriptableScript } from './scriptableScript.js';

const CSS = `
  .wgt { margin-top:26px; padding-top:20px; border-top:1px solid var(--border-1); font-family:'Inter', sans-serif; }
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
  useEffect(() => { load(); }, []);

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
      {error && <div className="wgt-err">{error}</div>}
    </div>
  );
}
