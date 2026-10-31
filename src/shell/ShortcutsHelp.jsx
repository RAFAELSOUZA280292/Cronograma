// Ajuda de atalhos (tecla "?" ou Menu › Atalhos de teclado). Só leitura; a lista vem de shortcuts.js.
import React from 'react';
import { Modal } from '../ui/dialog.jsx';
import { SHORTCUT_GROUPS, modLabel } from './shortcuts.js';

const CSS = `
.sch-group { margin: 0 0 18px; }
.sch-group h3 { margin: 0 0 6px; font-size: 13.5px; font-weight: 700; color: var(--text-2); }
.sch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); padding: 8px 0; border-top: 1px solid var(--border-1); font-size: 13.5px; color: var(--text-2); }
.sch-row:first-of-type { border-top: 0; }
.sch-keys { display: inline-flex; gap: var(--sp-1); flex-shrink: 0; }
.sch-keys kbd { min-width: 26px; text-align: center; padding: 2px 7px; border-radius: var(--r-sm); border: 1px solid var(--border-2); background: var(--bg-3); color: var(--text-1); font: 600 12px/1.4 inherit; }
.sch-note { margin: 4px 0 0; font-size: var(--fs-xs); color: var(--text-4); }
@media (max-width: 560px) { .sch-row { flex-direction: column; align-items: flex-start; gap: 6px; } }
`;

export default function ShortcutsHelp({ onClose, isMac }) {
  const mod = modLabel(isMac);
  return (
    <Modal title="Atalhos de teclado" subtitle="Valem quando você não está digitando num campo." onClose={onClose} width="min(560px, 100%)">
      <style>{CSS}</style>
      {SHORTCUT_GROUPS.map((g) => (
        <section key={g.title} className="sch-group" aria-label={g.title}>
          <h3>{g.title.replace('Mod K', `${mod} K`)}</h3>
          {g.items.map((it) => (
            <div key={`${g.title}-${it.keys.join('+')}`} className="sch-row">
              <span>{it.what}</span>
              <span className="sch-keys">{it.keys.map((k) => <kbd key={k}>{k === 'Mod' ? mod : k}</kbd>)}</span>
            </div>
          ))}
        </section>
      ))}
      <p className="sch-note">No celular e no tablet sem teclado, use os botões da tela.</p>
    </Modal>
  );
}
