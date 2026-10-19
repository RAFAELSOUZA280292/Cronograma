// Caixa "Ajustar datas automaticamente" (2026-10-19): fica no alto das vistas de atividades de uma empresa (e do cronograma padrão). Ligada, mudar uma data empurra as
// seguintes (regra em src/lib/dateRipple.js); desligada, cada data muda só ela mesma. A escolha é por empresa e por pessoa, neste navegador, e começa desligada.
import React from 'react';
import { Lock } from 'lucide-react';
import { useAutoDates } from '../lib/autoDates.js';

export const AUTO_DATES_CSS = `
  .ad { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; margin:0 0 10px; padding:8px 12px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; font-size:12.5px; color:var(--text-3); }
  .ad.on { border-color:rgba(245,196,0,.55); }
  .ad label { display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:var(--text-1); min-height:28px; }
  .ad input[type=checkbox] { width:16px; height:16px; cursor:pointer; }
  .ad-state { font-weight:700; color:var(--text-4); }
  .ad.on .ad-state { color:#F5C400; }
  .ad details { flex:1 1 100%; }
  .ad summary { cursor:pointer; color:var(--text-4); font-size:12px; }
  .ad ul { margin:6px 0 0; padding-left:18px; line-height:1.55; }
  @media (max-width: 767px) { .ad label { min-height:44px; } .ad summary { min-height:44px; display:flex; align-items:center; } }
`;

export function AutoDatesToggle({ pid }) {
  const [on, setOn] = useAutoDates(pid);
  return (
    <div className={`ad no-print${on ? ' on' : ''}`}>
      <style>{AUTO_DATES_CSS}</style>
      <label>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Ajustar datas automaticamente
      </label>
      <span className="ad-state" role="status">{on ? 'Ligado: mudar uma data move as seguintes' : 'Desligado: cada data muda só ela mesma'}</span>
      <details>
        <summary>Como funciona</summary>
        <ul>
          <li>Ao mudar o <b>início</b> de uma atividade (ou o prazo de uma subatividade), tudo o que vem <b>do mesmo dia em diante</b> anda junto, pelo mesmo número de dias. Ao mudar só o <b>fim</b>, anda o que começa depois dele.</li>
          <li>Não se movem: atividades e subatividades <b>concluídas</b>, itens com a <b>data travada</b> (<Lock size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> nas ações da atividade ou em Travar data da subatividade) e subatividades de <b>data fixa</b>.</li>
          <li>Cada ajuste mostra um aviso com <b>Desfazer</b>. Desligar a caixa vale para as próximas mudanças; o que já mudou não volta sozinho.</li>
          <li>A escolha vale para esta empresa, neste navegador.</li>
        </ul>
      </details>
    </div>
  );
}
