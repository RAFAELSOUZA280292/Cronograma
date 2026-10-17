// Marcador "Aguardando" do cartão (2026-10-16, visão 4 do pedido do Rafael): a atividade está parada esperando alguém (cliente, fornecedor, outro
// time). NÃO é um status novo — o ciclo (não iniciada → em andamento → pausada → concluída), as colunas e os Indicadores seguem iguais. Guarda
// `card.waiting = { who, since }` (ausente/null = não está aguardando) e some da vista quando o cartão é concluído.
import React, { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { fmtDate } from '../App.jsx';

const pad = (n) => String(n).padStart(2, '0');
export const localTodayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function isWaiting(card) {
  return !!(card && card.waiting && typeof card.waiting.since === 'string' && card.waiting.since && !card.completed && !card.deleted);
}

export function waitingDays(card, todayIso) {
  if (!card || !card.waiting || !card.waiting.since) return 0;
  const [a, b, c] = card.waiting.since.slice(0, 10).split('-').map(Number);
  const [x, y, z] = String(todayIso).split('-').map(Number);
  const n = Math.round((new Date(x, y - 1, z) - new Date(a, b - 1, c)) / 86400000);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function waitingLabel(card, todayIso) {
  const n = waitingDays(card, todayIso);
  const who = card.waiting && card.waiting.who ? ` ${card.waiting.who}` : '';
  return `Aguardando${who} · ${n === 0 ? 'hoje' : `${n}d`}`;
}

const CSS = `
  .wt-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .wt-row input[type=text] { flex:1; min-width:160px; }
  .wt-since { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-4); }
  .wt-btn { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-2); cursor:pointer; font-family:inherit; }
  .wt-btn:hover { border-color:var(--border-3); color:var(--text-1); }
  .wt-btn.on { border-color:#9b7af5; color:#b9a2f7; }
  .wt-btn:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .wt-hint { font-size:11.5px; color:var(--text-5); margin-top:4px; }
  @media (max-width: 767px) { .wt-btn { min-height:44px; } .wt-row input { min-height:44px; font-size:16px; } }
`;

export function WaitingField({ card, onUpdate, readOnly, labelStyle }) {
  const w = card.waiting && card.waiting.since ? card.waiting : null;
  const [who, setWho] = useState(w ? w.who || '' : '');
  useEffect(() => { setWho(w ? w.who || '' : ''); }, [w && w.who, !!w]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = localTodayIso();

  function start() { onUpdate({ waiting: { who: '', since: today } }, 'Marcada como aguardando'); }
  function stop() {
    const n = waitingDays(card, today);
    onUpdate({ waiting: null }, `Aguardando encerrado (${n === 0 ? 'no mesmo dia' : `${n} dia${n === 1 ? '' : 's'} de espera`})`);
  }
  function commitWho() {
    const v = who.trim().slice(0, 80);
    if (!w || v === (w.who || '')) { setWho(v); return; }
    onUpdate({ waiting: { ...w, who: v } }, v ? `Aguardando: ${v}` : 'Aguardando: sem nome');
  }

  return (
    <div>
      <style>{CSS}</style>
      <div style={labelStyle}><Hourglass size={12} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />Aguardando</div>
      {!w ? (
        <div>
          <button type="button" className="wt-btn" onClick={start} disabled={readOnly} title={readOnly ? 'Somente leitura' : 'Marque quando a atividade depende de resposta ou entrega de alguém'}>
            <Hourglass size={13} aria-hidden="true" /> Marcar como aguardando
          </button>
          <div className="wt-hint">Use quando a atividade depende de alguém (cliente, fornecedor, outro time). Não muda o status.</div>
        </div>
      ) : (
        <div>
          <div className="wt-row">
            <input type="text" aria-label="Aguardando quem" placeholder="Aguardando quem? (opcional)" maxLength={80} value={who} disabled={readOnly} onChange={(e) => setWho(e.target.value)} onBlur={commitWho} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
            <label className="wt-since">desde
              <input type="date" aria-label="Aguardando desde" value={w.since} max={today} disabled={readOnly} onChange={(e) => { const v = e.target.value; if (v && v <= today) onUpdate({ waiting: { ...w, since: v } }, `Aguardando desde ${fmtDate(v)}`); }} />
            </label>
            <button type="button" className="wt-btn on" onClick={stop} disabled={readOnly} title="Tirar o marcador de aguardando">Não estou mais aguardando</button>
          </div>
          <div className="wt-hint">{waitingLabel(card, today)}</div>
        </div>
      )}
    </div>
  );
}
