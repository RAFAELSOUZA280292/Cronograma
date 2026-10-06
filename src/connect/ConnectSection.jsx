import React, { useEffect, useState } from 'react';
import { Copy, Check, KeyRound, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import { buildGuide } from './guide.js';
import { askConfirm } from '../ui/dialogs.jsx';

const CSS = `
  .cnx { font-family:'Inter', sans-serif; }
  .cnx-label { font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-6); display:flex; align-items:center; gap:6px; }
  .cnx p { font-size:12px; line-height:1.5; color:var(--text-4); margin:6px 0 0; }
  .cnx-form { margin-top:12px; display:flex; flex-direction:column; gap:10px; }
  .cnx-form label { font-size:11.5px; font-weight:700; color:var(--text-5); display:block; margin-bottom:4px; }
  .cnx-form input[type=text], .cnx-form select { width:100%; box-sizing:border-box; padding:9px 12px; font-size:13px; border-radius:9px; font-family:inherit; background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); }
  .cnx-scope { display:flex; flex-direction:column; gap:6px; }
  .cnx-opt { display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border-2); border-radius:10px; padding:10px 12px; background:var(--bg-2); cursor:pointer; min-height:44px; }
  .cnx-opt.on { border-color:#F5C400; background:rgba(245,196,0,.08); }
  .cnx-opt input { margin:3px 0 0; width:18px; height:18px; accent-color:#F5C400; flex-shrink:0; }
  .cnx-opt b { font-size:13px; color:var(--text-1); display:block; }
  .cnx-opt span { font-size:12px; color:var(--text-4); line-height:1.45; }
  .cnx-btn { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; font-family:inherit; font-size:13px; font-weight:700; border-radius:10px; padding:10px 14px; cursor:pointer; border:1px solid var(--border-3); background:var(--bg-3); color:var(--text-2); min-height:42px; }
  .cnx-btn:hover:not(:disabled) { background:var(--bg-4); }
  .cnx-btn:disabled { opacity:.6; cursor:default; }
  .cnx-btn.primary { background:#F5C400; border-color:#F5C400; color:#111; }
  .cnx-btn.primary:hover:not(:disabled) { background:#ffd21f; }
  .cnx-warn { margin-top:12px; font-size:12px; line-height:1.5; color:var(--ui-warn); background:rgba(255,159,64,.12); border-radius:8px; padding:9px 11px; }
  .cnx-code { width:100%; box-sizing:border-box; margin-top:8px; height:70px; resize:none; font-family:ui-monospace, Menlo, monospace; font-size:11px; line-height:1.4; background:var(--bg-1); color:var(--text-3); border:1px solid var(--border-2); border-radius:8px; padding:8px; }
  .cnx-steps { margin:10px 0 0; padding-left:18px; font-size:12px; line-height:1.6; color:var(--text-3); }
  .cnx-list { margin-top:18px; padding-top:16px; border-top:1px dashed var(--border-2); }
  .cnx-tok { display:flex; align-items:center; gap:10px; border:1px solid var(--border-2); border-radius:10px; padding:10px 12px; margin-top:8px; background:var(--bg-2); }
  .cnx-tok-main { flex:1; min-width:0; }
  .cnx-tok-main b { font-size:13px; color:var(--text-1); display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cnx-tok-main span { font-size:11.5px; color:var(--text-5); line-height:1.45; display:block; }
  .cnx-x { background:transparent; border:1px solid var(--border-3); color:var(--text-4); border-radius:8px; padding:8px; cursor:pointer; display:flex; min-width:38px; min-height:38px; align-items:center; justify-content:center; }
  .cnx-x:hover { color:var(--ui-danger); }
  .cnx-err { margin-top:8px; font-size:12px; color:var(--ui-danger); }
  .cnx-det { margin-top:16px; border:1px solid var(--border-2); border-radius:10px; background:var(--bg-2); }
  .cnx-det > summary { cursor:pointer; padding:10px 12px; font-size:12.5px; font-weight:700; color:var(--text-3); min-height:44px; box-sizing:border-box; display:flex; align-items:center; }
  .cnx-det-body { padding:0 12px 12px; }
  .cnx-det-body p { margin:8px 0 0; }
  .cnx-btn:focus-visible, .cnx-x:focus-visible, .cnx-det > summary:focus-visible, .cnx-opt:focus-within, .cnx-form input:focus-visible, .cnx-form select:focus-visible, .cnx-code:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) {
    .cnx-btn { min-height:44px; }
    .cnx-x { min-width:44px; min-height:44px; }
    .cnx-form input[type=text], .cnx-form select { min-height:44px; font-size:16px; }
    .cnx-code { font-size:16px; }
  }
`;

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const fmtTs = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function ConnectSection({ onAtRiskChange }) {
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read_create');
  const [days, setDays] = useState('180');
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [manual, setManual] = useState('');
  const [everCopied, setEverCopied] = useState(false);

  async function load() {
    try { setTokens((await apiGet('/api/connect/tokens')).tokens); } catch { setTokens([]); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (onAtRiskChange) onAtRiskChange(!!fresh && !everCopied); }, [fresh, everCopied]);

  async function create() {
    setBusy(true); setError(''); setManual('');
    try {
      const r = await apiPost('/api/connect/tokens', { name, scope, days: Number(days) });
      setFresh(r); setName(''); setEverCopied(false);
      await load();
    } catch (e) { setError(e.message || 'Não foi possível gerar a chave de acesso. Tente de novo em instantes.'); } finally { setBusy(false); }
  }

  async function revoke(t) {
    if (!(await askConfirm({ title: `Revogar a chave "${t.name}"?`, message: 'Quem usa essa chave perde o acesso na hora.', confirmLabel: 'Revogar chave', danger: true }))) return;
    try { await apiDelete(`/api/connect/tokens/${t.id}`); if (fresh && fresh.id === t.id) setFresh(null); await load(); } catch (e) { setError(e.message || 'Não foi possível revogar a chave agora. Tente de novo em instantes.'); }
  }

  async function copy(kind, text) {
    setError('');
    try { await navigator.clipboard.writeText(text); setCopied(kind); setManual(''); if (kind === 'token') setEverCopied(true); setTimeout(() => setCopied((c) => (c === kind ? '' : c)), 2500); } catch { setManual(text); }
  }

  const baseUrl = window.location.origin;
  const exportLine = fresh ? `export PRICETAX_URL="${baseUrl}"\nexport PRICETAX_TOKEN="${fresh.token}"` : '';
  const guide = buildGuide({ baseUrl, canCreate: !!fresh && fresh.scope === 'read_create' });

  return (
    <div className="cnx">
      <style>{CSS}</style>
      <div className="cnx-label"><KeyRound size={13} /> Integrações (avançado)</div>
      <p>Aqui você libera o acesso de outra ferramenta (como outra janela do Claude Code) para consultar o seu painel e, se você permitir, criar atividades no seu quadro. Cada ferramenta usa uma chave de acesso própria, e você pode revogar uma sem afetar as outras.</p>

      {fresh ? (
        <>
          <div className="cnx-warn">A chave aparece só uma vez — copie agora. Quem tiver a chave acessa o que ela permite até você revogar ou ela vencer em {fmt(fresh.expires_at)}.</div>
          <ol className="cnx-steps">
            <li>Na outra ferramenta, cole o <b>comando da chave</b>.</li>
            <li>Cole o <b>guia</b> na conversa dela (sem a chave dentro).</li>
            <li>Peça: “leia o guia e faça o primeiro passo para confirmar a conexão”.</li>
          </ol>
          <button type="button" className="cnx-btn primary" style={{ marginTop: 10 }} title="Copiar o comando da chave" onClick={() => copy('token', exportLine)}>{copied === 'token' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> 1. Copiar comando da chave</>}</button>
          <button type="button" className="cnx-btn" style={{ marginTop: 8 }} title="Copiar o guia de uso" onClick={() => copy('guide', guide)}>{copied === 'guide' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> 2. Copiar guia de uso</>}</button>
          {manual && <><div className="cnx-warn">Não foi possível copiar automaticamente. Toque no texto, selecione tudo e use Copiar.</div><textarea className="cnx-code" readOnly aria-label="Texto para copiar" value={manual} onFocus={(e) => e.target.select()} /></>}
          <button type="button" className="cnx-btn" style={{ marginTop: 8 }} onClick={() => { setFresh(null); setManual(''); setEverCopied(false); }}>Já copiei, fechar</button>
        </>
      ) : (
        <div className="cnx-form">
          <div>
            <label htmlFor="cnx-name">Nome da chave de acesso</label>
            <input id="cnx-name" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder='Ex.: "Claude Code do XPED"' />
          </div>
          <div className="cnx-scope" role="radiogroup" aria-label="O que a chave de acesso pode fazer">
            <label className={`cnx-opt${scope === 'read_create' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read_create'} onChange={() => setScope('read_create')} /><div><b>Ler e criar atividades</b><span>Lê atividades, empresas, reuniões e agenda; cria atividades no seu quadro pessoal. Não edita nem apaga nada existente.</span></div></label>
            <label className={`cnx-opt${scope === 'read' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read'} onChange={() => setScope('read')} /><div><b>Só ler</b><span>Consulta tudo acima e não altera nada.</span></div></label>
          </div>
          <div>
            <label htmlFor="cnx-days">Validade</label>
            <select id="cnx-days" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">1 ano</option>
            </select>
          </div>
          <button type="button" className="cnx-btn primary" disabled={busy || !name.trim()} title={busy ? 'Aguarde terminar' : !name.trim() ? 'Dê um nome à chave de acesso' : undefined} onClick={create}>{busy ? 'Gerando...' : 'Gerar chave de acesso'}</button>
        </div>
      )}
      {error && <div className="cnx-err" role="alert">{error}</div>}

      {tokens && tokens.length > 0 && (
        <div className="cnx-list">
          <div className="cnx-label">Chaves de acesso ativas</div>
          {tokens.map((t) => (
            <div key={t.id} className="cnx-tok">
              <div className="cnx-tok-main">
                <b>{t.name}</b>
                <span>{t.scope === 'read_create' ? 'Ler e criar atividades' : 'Só leitura'} · {t.expired ? 'vencida em' : 'vence em'} {fmt(t.expires_at)}</span>
                <span>{t.last_used_at ? `Último uso: ${fmtTs(t.last_used_at)}` : 'Ainda não usada'}</span>
              </div>
              <button type="button" className="cnx-x" aria-label={`Revogar a chave ${t.name}`} title="Revogar chave" onClick={() => revoke(t)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <details className="cnx-det">
        <summary>Detalhes para quem integra</summary>
        <div className="cnx-det-body">
          <p>A chave vai no cabeçalho de cada chamada à API do painel, em <code>{baseUrl}/api/connect</code>. O comando da chave define duas variáveis de ambiente no terminal (<code>PRICETAX_URL</code> e <code>PRICETAX_TOKEN</code>) e o guia de uso traz os endpoints e exemplos prontos para a ferramenta que vai usar a chave.</p>
          <p>O guia completo, sem a chave, também está no repositório em <code>docs/CONECTIVIDADE_CLAUDE_CODE.md</code>.</p>
        </div>
      </details>
    </div>
  );
}
