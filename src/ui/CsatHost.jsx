// Pedido de nota de 1 clique (§97), fora do caminho: cartão pequeno no canto, nunca modal, sem bloquear nada. "Agora não" também conta
// para a frequência (o servidor não pergunta de novo tão cedo). Nota até 3 pede, opcionalmente, o que atrapalhou (uma linha).
import React, { useEffect, useState } from 'react';
import { answerCsat } from '../lib/experience.js';

export default function CsatHost() {
  const [ask, setAsk] = useState(null);
  const [score, setScore] = useState(0);
  const [text, setText] = useState('');
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    const on = (e) => { setAsk(e.detail); setScore(0); setText(''); setThanks(false); };
    window.addEventListener('ptx:csat', on);
    return () => window.removeEventListener('ptx:csat', on);
  }, []);
  useEffect(() => { if (!thanks) return undefined; const t = setTimeout(() => setAsk(null), 2500); return () => clearTimeout(t); }, [thanks]);
  if (!ask) return null;
  const finish = (s, c = '') => { answerCsat(ask.flow, s, c); setThanks(true); };
  return (
    <div className="csat-card no-print" role="region" aria-label="Pesquisa rápida de satisfação" style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 380, maxWidth: 340, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-2, #1a1a2a)', border: '1px solid var(--border-3, #3a3a4a)', boxShadow: '0 8px 28px rgba(0,0,0,.35)', color: 'var(--text-1, #fff)', fontSize: 13 }}>
      {thanks ? <div>Obrigado! Isso ajuda a melhorar o painel.</div> : (
        <>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Como foi: {ask.label.toLowerCase()}?</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="group" aria-label="Nota de 1 a 5">
            <span className="crm-muted" style={{ fontSize: 11 }}>difícil</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`Nota ${n} de 5`} aria-pressed={score === n} title={`${n} de 5`} onClick={() => { if (n >= 4) finish(n); else setScore(n); }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-3, #3a3a4a)', background: score === n ? '#FEDC04' : 'transparent', color: score === n ? '#111' : 'inherit', fontWeight: 800, cursor: 'pointer' }}>{n}</button>
            ))}
            <span className="crm-muted" style={{ fontSize: 11 }}>ótimo</span>
          </div>
          {score > 0 && score <= 3 && (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              <input aria-label="O que atrapalhou? (opcional)" value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder="O que atrapalhou? (opcional)" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') finish(score, text); }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><button type="button" className="crm-btn" onClick={() => finish(score, '')}>Pular</button><button type="button" className="crm-btn crm-btn-primary" onClick={() => finish(score, text)}>Enviar</button></div>
            </div>
          )}
          <div style={{ marginTop: 8, textAlign: 'right' }}><button type="button" className="crm-btn" onClick={() => { answerCsat(ask.flow, null); setAsk(null); }} title="Não perguntar agora">Agora não</button></div>
        </>
      )}
    </div>
  );
}
