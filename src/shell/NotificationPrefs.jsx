// Escolher quais notificações ver (2026-10-06). Marcado = aparece; desmarcado = fica escondido (nada é apagado).
// Salva sozinho, por usuário.
import React, { useEffect, useState } from 'react';
import { useNotifPrefs, setCategoryMuted, setTodaySourceHidden } from '../lib/notifPrefs.js';
import { loadPushState, enablePush, disablePush, sendPushTest } from '../lib/push.js';

const CSS = `
.np { display: flex; flex-direction: column; gap: 4px; font-family: Inter, system-ui, sans-serif; }
.np-intro { margin: 0 0 6px; font-size: 13px; line-height: 1.5; color: var(--text-3); }
.np-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px; min-height: 44px; border: 1px solid var(--border-2); border-radius: 11px; background: var(--bg-2); cursor: pointer; }
.np-row:hover { border-color: var(--border-3); }
.np-row input { margin-top: 2px; width: 20px; height: 20px; flex: none; accent-color: var(--ui-accent, #F5C400); cursor: pointer; }
.np-name { font-size: 14px; font-weight: 700; color: var(--text-1); }
.np-desc { margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: var(--text-3); }
.np-soon { margin-left: 6px; font-size: 11px; font-weight: 700; color: var(--text-4); }
.np-h { margin: 14px 0 2px; font-size: 12px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--text-4); }
.np-status { min-height: 18px; margin-top: 6px; font-size: 12.5px; color: var(--text-3); }
.np-status.err { color: var(--ui-danger, #ff7b70); }
.np-dev { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--border-2); border-radius: 11px; background: var(--bg-2); }
.np-dev-state { font-size: 14px; font-weight: 700; color: var(--text-1); }
.np-dev-text { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-3); }
.np-dev-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.np-btn { min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border-3); background: var(--bg-3); color: var(--text-1); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.np-btn.primary { background: var(--ui-accent, #F5C400); border-color: var(--ui-accent, #F5C400); color: #17171f; }
.np-btn:disabled { opacity: .6; cursor: default; }
`;

const DEV_TEXT = {
  'sem-servidor': ['Ainda não está disponível', 'O servidor ainda não tem as chaves de notificação. Peça à equipe de tecnologia para configurar.'],
  'sem-suporte': ['Este navegador não permite', 'Notificações no aparelho exigem o sistema publicado e um navegador compatível (Chrome, Edge, Firefox ou Safari recentes).'],
  'instalar-ios': ['Instale o app primeiro', 'No iPhone e no iPad, as notificações só funcionam com o app instalado: toque em Compartilhar, depois em "Adicionar à Tela de Início", abra o PRICETAX pelo ícone novo e volte aqui.'],
  'bloqueado': ['Bloqueadas neste aparelho', 'Você bloqueou as notificações deste site. Libere nas configurações do aparelho ou do navegador (permissões do site / Ajustes › Notificações) e volte aqui.'],
  'desligado': ['Desativadas neste aparelho', 'Ative para receber no aparelho, mesmo com o sistema fechado, os mesmos avisos do sino (respeitando as categorias abaixo). O texto do aviso pode aparecer na tela bloqueada.'],
  'ligado': ['Ativadas neste aparelho', 'Você recebe aqui os avisos do sino. Toque no aviso para abrir o módulo correspondente.'],
};

function DevicePush() {
  const [st, setSt] = useState({ state: 'carregando' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', err: false });
  useEffect(() => { let off = false; loadPushState().then((r) => { if (!off) setSt(r); }).catch(() => { if (!off) setSt({ state: 'sem-suporte' }); }); return () => { off = true; }; }, []);
  const say = (text, err = false) => setMsg({ text, err });
  async function on() {
    setBusy(true); say('');
    try {
      const r = await enablePush(st.publicKey);
      if (!r.ok) { say(r.motivo === 'bloqueado' ? 'As notificações ficaram bloqueadas.' : 'Você não permitiu as notificações.', true); if (r.motivo === 'bloqueado') setSt({ ...st, state: 'bloqueado' }); }
      else { setSt({ ...st, state: 'ligado' }); say('Notificações ativadas neste aparelho.'); }
    } catch (e) { say(e.message || 'Não foi possível ativar.', true); }
    setBusy(false);
  }
  async function off() {
    setBusy(true); say('');
    try { await disablePush(); setSt({ ...st, state: 'desligado' }); say('Notificações desativadas neste aparelho.'); } catch (e) { say(e.message || 'Não foi possível desativar.', true); }
    setBusy(false);
  }
  async function test() {
    setBusy(true); say('');
    try { await sendPushTest(); say('Teste enviado. Deve chegar em instantes.'); } catch (e) { say(e.message || 'Não foi possível enviar o teste.', true); }
    setBusy(false);
  }
  if (st.state === 'carregando') return <div className="np-dev"><span className="np-dev-text">Verificando este aparelho…</span></div>;
  const [title, text] = DEV_TEXT[st.state] || DEV_TEXT['sem-suporte'];
  return (
    <div className="np-dev">
      <span className="np-dev-state">{title}</span>
      <p className="np-dev-text">{text}{st.erro ? ` ${st.erro}` : ''}</p>
      {(st.state === 'desligado' || st.state === 'ligado') && (
        <div className="np-dev-actions">
          {st.state === 'desligado' && <button type="button" className="np-btn primary" disabled={busy} title={busy ? "Aguarde a ação anterior terminar." : undefined} onClick={on}>Ativar neste aparelho</button>}
          {st.state === 'ligado' && <button type="button" className="np-btn" disabled={busy} title={busy ? "Aguarde a ação anterior terminar." : undefined} onClick={test}>Enviar um teste</button>}
          {st.state === 'ligado' && <button type="button" className="np-btn" disabled={busy} title={busy ? "Aguarde a ação anterior terminar." : undefined} onClick={off}>Desativar neste aparelho</button>}
        </div>
      )}
      <div className={`np-status${msg.err ? ' err' : ''}`} role="status" aria-live="polite">{msg.text}</div>
    </div>
  );
}

export default function NotificationPrefs() {
  const p = useNotifPrefs();
  if (!p.loaded) return <div className="np"><style>{CSS}</style><div className="np-status">Carregando…</div></div>;
  return (
    <div className="np">
      <style>{CSS}</style>
      <p className="np-intro">Marque o que você quer ver. O que ficar desmarcado deixa de aparecer — nada é apagado, e volta se você marcar de novo. Fica salvo no seu usuário.</p>
      <h3 className="np-h">Avisos neste aparelho (push)</h3>
      <DevicePush />
      <h3 className="np-h">Tarefas e reuniões do painel Hoje</h3>
      {p.todaySources.map((x) => (
        <label key={x.source} className="np-row">
          <input type="checkbox" checked={!x.hidden} onChange={(e) => setTodaySourceHidden(x.source, !e.target.checked)} />
          <span>
            <span className="np-name">{x.label}</span>
            <span className="np-desc" style={{ display: 'block' }}>{x.description}</span>
          </span>
        </label>
      ))}
      <h3 className="np-h">Notificações (sino)</h3>
      {p.categories.map((c) => (
        <label key={c.key} className="np-row">
          <input type="checkbox" checked={!c.muted} onChange={(e) => setCategoryMuted(c.key, !e.target.checked)} />
          <span>
            <span className="np-name">{c.label}{!c.active && <span className="np-soon">ainda não envia avisos</span>}</span>
            <span className="np-desc" style={{ display: 'block' }}>{c.description}</span>
          </span>
        </label>
      ))}
      <div className={`np-status${p.error ? ' err' : ''}`} role="status" aria-live="polite">
        {p.error || (p.saving ? 'Salvando…' : p.savedAt ? 'Salvo no seu usuário.' : '')}
      </div>
    </div>
  );
}
