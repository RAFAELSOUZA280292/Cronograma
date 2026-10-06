// Escolher quais notificações ver (2026-10-06). Marcado = aparece; desmarcado = fica escondido (nada é apagado).
// Salva sozinho, por usuário.
import React from 'react';
import { useNotifPrefs, setCategoryMuted, setTodaySourceHidden } from '../lib/notifPrefs.js';

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
`;

export default function NotificationPrefs() {
  const p = useNotifPrefs();
  if (!p.loaded) return <div className="np"><style>{CSS}</style><div className="np-status">Carregando…</div></div>;
  return (
    <div className="np">
      <style>{CSS}</style>
      <p className="np-intro">Marque o que você quer ver. O que ficar desmarcado deixa de aparecer — nada é apagado, e volta se você marcar de novo. Fica salvo no seu usuário.</p>
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
