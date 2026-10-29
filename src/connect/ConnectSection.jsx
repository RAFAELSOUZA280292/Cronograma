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
  .cnx-adv { border:1px dashed var(--border-2); border-radius:10px; padding:0 10px 10px; }
  .cnx-adv > summary { cursor:pointer; padding:10px 2px; font-size:12px; font-weight:700; color:var(--text-4); min-height:44px; box-sizing:border-box; display:flex; align-items:center; }
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
  .cnx-adv > summary:focus-visible, .cnx-btn:focus-visible, .cnx-x:focus-visible, .cnx-det > summary:focus-visible, .cnx-opt:focus-within, .cnx-form input:focus-visible, .cnx-form select:focus-visible, .cnx-code:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) {
    .cnx-btn { min-height:44px; }
    .cnx-x { min-width:44px; min-height:44px; }
    .cnx-form input[type=text], .cnx-form select { min-height:44px; font-size:16px; }
    .cnx-code { font-size:16px; }
  }
`;

const SCOPE_LABEL = { read_all: 'Ler tudo', write_all: 'Ler e editar tudo', crm_operate: 'Operar o CRM (Claude Code)', meetings_edit: 'Corrigir reuniões registradas', transcripts: 'Enviar transcrições de reunião', read_write: 'Ler e ajustar cronograma', read_create: 'Ler e criar atividades', read: 'Só leitura' };
const scopeLabel = (sc) => (sc === 'read_all' || sc === 'write_all' ? SCOPE_LABEL[sc] : `${SCOPE_LABEL[sc] || 'Só leitura'} (chave específica)`);
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const fmtTs = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function ConnectSection({ onAtRiskChange }) {
  const [tokens, setTokens] = useState(null);
  const [canCrm, setCanCrm] = useState(false);
  const [canTranscripts, setCanTranscripts] = useState(false);
  const [actions, setActions] = useState([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read_all');
  const [canAdmin, setCanAdmin] = useState(false);
  const [days, setDays] = useState('180');
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [manual, setManual] = useState('');
  const [everCopied, setEverCopied] = useState(false);

  async function load() {
    try { const r = await apiGet('/api/connect/tokens'); setTokens(r.tokens); setCanCrm(!!r.canCrm); setCanTranscripts(!!r.canTranscripts); setCanAdmin(!!r.canAdmin); if (r.canCrm) apiGet('/api/connect/actions').then((a) => setActions(a.actions || [])).catch(() => {}); } catch { setTokens([]); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (onAtRiskChange) onAtRiskChange(!!fresh && !everCopied); }, [fresh, everCopied]);

  function pick(next) {
    setScope(next);
    if (next === 'write_all' && Number(days) > 90) setDays('90');
  }

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
  const guide = buildGuide({ baseUrl, canCreate: !!fresh && ['read_create', 'read_write', 'write_all'].includes(fresh.scope), canWrite: !!fresh && ['read_write', 'write_all'].includes(fresh.scope), canCrm: !!fresh && ['crm_operate', 'write_all'].includes(fresh.scope), canTranscripts: !!fresh && ['transcripts', 'meetings_edit', 'read_write', 'write_all'].includes(fresh.scope), canMeetingsEdit: !!fresh && ['meetings_edit', 'write_all'].includes(fresh.scope), readAll: !!fresh && ['read_all', 'write_all'].includes(fresh.scope) });

  return (
    <div className="cnx">
      <style>{CSS}</style>
      <div className="cnx-label"><KeyRound size={13} /> Integrações (avançado)</div>
      <p>Aqui você libera o acesso de outra ferramenta (como outra janela do Claude Code) para consultar o seu painel ("Ler tudo") e, se você permitir, também alterar ("Ler e editar tudo"). Cada ferramenta usa uma chave de acesso própria, e você pode revogar uma sem afetar as outras.</p>

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
            <label className={`cnx-opt${scope === 'read_all' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read_all'} onChange={() => pick('read_all')} /><div><b>Ler tudo</b><span>Consulta empresas, cronogramas, reuniões (com transcrição), atividades, agenda e CRM, de tudo que você mesmo pode ver. Não altera nada. É a opção para a maioria das ferramentas.</span></div></label>
            {canAdmin && <label className={`cnx-opt${scope === 'write_all' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'write_all'} onChange={() => pick('write_all')} /><div><b>Ler e editar tudo</b><span>Tudo da opção anterior e também grava: ajusta o cronograma das empresas, corrige reuniões, envia transcrições, cria atividades e opera o CRM, sempre dentro do que você pode fazer. Cada gravação fica registrada onde ela acontece: no Log e nas Versões da empresa (cronograma), no histórico de correções (reuniões) e no registro de ações (CRM); com prévia e desfazer onde existe. Chave poderosa: só administrador, validade máxima de 180 dias.</span></div></label>}
            <details className="cnx-adv"><summary>Chaves específicas (avançado)</summary><div className="cnx-scope" style={{ marginTop: 8 }}>
              <label className={`cnx-opt${scope === 'read_create' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read_create'} onChange={() => pick('read_create')} /><div><b>Ler e criar atividades</b><span>Lê atividades, empresas, reuniões e agenda; cria atividades no seu quadro pessoal. Não edita nem apaga nada existente.</span></div></label>
              <label className={`cnx-opt${scope === 'read_write' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read_write'} onChange={() => pick('read_write')} /><div><b>Ler e ajustar o cronograma das empresas</b><span>Tudo do primeiro item e mais: muda status, datas e subatividades e cria atividades no cronograma de uma empresa, tudo de uma vez ou nada, com registro no Log. Excluir só com volta pela lixeira (nada some de verdade). Só administrador.</span></div></label>
              {canTranscripts && <label className={`cnx-opt${scope === 'transcripts' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'transcripts'} onChange={() => pick('transcripts')} /><div><b>Enviar transcrições de reunião</b><span>Lê empresas e reuniões e envia a transcrição de uma reunião para a RENATA do painel processar (participantes, resumo, decisões e atividades), como o botão “Enviar transcrição”. Não cria atividade solta nem ajusta cronograma.</span></div></label>}
              {canTranscripts && <label className={`cnx-opt${scope === 'meetings_edit' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'meetings_edit'} onChange={() => pick('meetings_edit')} /><div><b>Corrigir reuniões registradas</b><span>Tudo da opção anterior (ler e enviar transcrições) e também corrige o que a RENATA registrou numa reunião: título, data, horário, resumo, decisões, participantes e tarefas (responsável, tipo, prazo, área, lado). Cada correção entra no Log da empresa e no histórico de correções, com prévia e desfazer. Não ajusta cronograma nem opera o CRM.</span></div></label>}
              {canCrm && <label className={`cnx-opt${scope === 'crm_operate' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'crm_operate'} onChange={() => pick('crm_operate')} /><div><b>Operar o CRM como Claude Code</b><span>Lê tudo e cria, edita, move, exclui e registra no CRM com as mesmas regras da tela. Cada alteração fica registrada como “Claude Code” (com o seu nome, se a chave for sua). Não opera a migração do PipeRun.</span></div></label>}
              <label className={`cnx-opt${scope === 'read' ? ' on' : ''}`}><input type="radio" name="cnx-scope" checked={scope === 'read'} onChange={() => pick('read')} /><div><b>Só ler</b><span>Consulta tudo acima e não altera nada.</span></div></label>
            </div></details>
          </div>
          {scope === 'write_all' && <div className="cnx-warn" style={{ marginTop: 0 }}>Esta chave grava no painel (cronograma, reuniões e CRM). Guarde como senha, dê a uma ferramenta só e revogue se ela sair de uso. Vale no máximo 180 dias.</div>}
          <div>
            <label htmlFor="cnx-days">Validade</label>
            <select id="cnx-days" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365" disabled={scope === 'write_all'}>1 ano</option>
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
                <span>{scopeLabel(t.scope)} · {t.expired ? 'vencida em' : 'vence em'} {fmt(t.expires_at)}</span>
                <span>{t.last_used_at ? `Último uso: ${fmtTs(t.last_used_at)}` : 'Ainda não usada'}</span>
              </div>
              <button type="button" className="cnx-x" aria-label={`Revogar a chave ${t.name}`} title="Revogar chave" onClick={() => revoke(t)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {canCrm && actions.length > 0 && (
        <div className="cnx-list">
          <div className="cnx-label">O que o Claude Code alterou no CRM (últimas {actions.length})</div>
          {actions.slice(0, 15).map((a, i) => (
            <div key={`${a.at}-${i}`} className="cnx-tok"><div className="cnx-tok-main"><b>{a.method} {a.path.replace('/api/connect/crm', '')}</b><span>{fmtTs(a.at)} · chave “{a.token_name}” ({a.owner_name}) · {a.status >= 400 ? `recusado (${a.status})` : `ok (${a.status})`}</span></div></div>
          ))}
          {actions.length > 15 && <p>Mais {actions.length - 15} no registro.</p>}
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
