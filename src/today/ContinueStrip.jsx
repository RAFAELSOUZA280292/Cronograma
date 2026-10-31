// "Continuar de onde parou" (Onda 5, §81): até 4 itens recentes (empresa, atividade, reunião, módulo) clicáveis na tela
// inicial. O App decide o que ainda existe e como reabrir; aqui só se desenha.
import React from 'react';
import { Building2, ListChecks, Mic, Columns3, LayoutGrid } from 'lucide-react';

const ICONS = { company: Building2, activity: ListChecks, meeting: Mic, card: Columns3, module: LayoutGrid };
const KIND_LABEL = { company: 'Empresa', activity: 'Atividade', meeting: 'Reunião', card: 'Cartão', module: 'Módulo' };

const CSS = `
.cs { font-family: 'Inter', sans-serif; margin: 0; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(11,11,30,.04); box-sizing: border-box; }
.cs-title { margin: 0 0 10px; font-size: 15px; font-weight: 700; color: var(--text-1); }
.cs-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.cs-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 11px; border: 1px solid var(--border-1); background: var(--bg-2); color: var(--text-2); font: inherit; cursor: pointer; min-width: 0; }
.cs-item:hover { border-color: var(--border-3); background: var(--bg-3); }
.cs-item:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
.cs-ic { flex-shrink: 0; color: var(--text-4); }
.cs-txt { min-width: 0; display: block; }
.cs-name { display: block; font-size: 13px; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-hint { display: block; font-size: 12px; color: var(--text-5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export default function ContinueStrip({ items, onOpen }) {
  if (!items || !items.length) return null;
  return (
    <section className="cs" aria-label="Continuar de onde parou">
      <style>{CSS}</style>
      <h2 className="cs-title">Continuar de onde parou</h2>
      <ul className="cs-list">
        {items.map((it) => {
          const Icon = ICONS[it.kind] || LayoutGrid;
          return (
            <li key={`${it.kind}:${it.id}`}>
              <button type="button" className="cs-item" onClick={() => onOpen(it)} title={`${KIND_LABEL[it.kind] || ''}: ${it.label}`}>
                <Icon size={17} className="cs-ic" aria-hidden="true" />
                <span className="cs-txt">
                  <span className="cs-name">{it.label}</span>
                  <span className="cs-hint">{KIND_LABEL[it.kind] || ''}{it.hint ? ` · ${it.hint}` : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
