// Faixa de alertas do cliente (Onda 3, I1): a MESMA lista (server/client360Alerts.js) na ficha da empresa do CRM e na tela da empresa do cronograma.
// Cada linha diz o que está errado em números e sugere o próximo passo; vem de regra, não de IA. Sem alerta, mostra "Nada pedindo atenção" só quando `showEmpty`.
import React from 'react';

const CSS = `
.ca { display: flex; flex-direction: column; gap: var(--sp-1); margin: 0; padding: 0; list-style: none; font-family: 'Inter', sans-serif; }
.ca-row { display: flex; align-items: flex-start; gap: var(--sp-2); font-size: var(--fs-sm); line-height: 1.45; color: var(--text-1); }
.ca-dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--dot, var(--text-5)); }
.ca-row.atencao { --dot: var(--ui-danger, #e2574c); }
.ca-row.info { --dot: var(--ui-accent, #F5C400); }
.ca-hint { display: block; font-size: var(--fs-xs); color: var(--text-4); }
.ca-ok { font-size: var(--fs-sm); color: var(--text-4); margin: 0; }
`;

export default function ClientAlerts({ alerts, showEmpty = false }) {
  const list = Array.isArray(alerts) ? alerts : [];
  if (!list.length) return showEmpty ? <><style>{CSS}</style><p className="ca-ok">Nada pedindo atenção nesta empresa agora.</p></> : null;
  return (
    <>
      <style>{CSS}</style>
      <ul className="ca" aria-label="Pontos de atenção do cliente">
        {list.map((a) => (
          <li key={a.key} className={`ca-row ${a.level}`}>
            <span className="ca-dot" aria-hidden="true" />
            <span>{a.text}{a.hint && <span className="ca-hint">Sugestão: {a.hint}</span>}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
