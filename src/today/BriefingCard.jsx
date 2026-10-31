// Briefing do dia na tela inicial (Onda 3, R3): o que a RENATA reuniu por regra (GET /api/briefing) — cada linha diz o porquê em números e abre o item.
// Sem nada a dizer, não aparece (um cartão vazio na tela inicial é ruído). Erro de rede também some: o painel "Hoje" logo abaixo segue funcionando.
import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { requestNotifSettings } from '../lib/notifPrefs.js';
import { Button } from '../ui/index.jsx';

const CSS = `
.bc { margin: 0 0 var(--sp-3); font-family: 'Inter', sans-serif; width: 100%; box-sizing: border-box; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 14px; padding: 16px 20px; }
.bc-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: 2px; }
.bc-cfg { margin-left: auto; }
.bc-title { margin: 0; font-size: var(--fs-lg); font-weight: 800; color: var(--text-1); }
.bc-sub { margin: 0 0 var(--sp-2); font-size: var(--fs-xs); color: var(--text-4); }
.bc-sec { margin-top: var(--sp-3); }
.bc-sec-t { display: flex; align-items: center; gap: var(--sp-2); margin: 0 0 2px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-2); }
.bc-n { min-width: 20px; text-align: center; padding: 1px 7px; border-radius: var(--r-pill); font-size: var(--fs-xs); font-weight: 700; background: var(--bg-4); color: var(--text-2); }
.bc-row { display: flex; align-items: center; gap: var(--sp-2); width: 100%; min-height: 36px; padding: 6px 8px; margin: 0 -8px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-1); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.bc-row:hover { background: var(--bg-3); }
.bc-row:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 1px; }
.bc-row span { flex: 1; min-width: 0; line-height: 1.4; }
.bc-more { margin: 0 0 0 0; padding: 2px 0 0; font-size: var(--fs-xs); color: var(--text-4); }
@media (pointer: coarse) { .bc-row { min-height: 44px; } }
`;

export default function BriefingCard({ onOpenItem, onConfigure }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => { apiGet('/api/briefing').then(setData).catch(() => setData(null)); }, []);
  useEffect(() => {
    load();
    window.addEventListener('briefing:refresh', load);
    return () => window.removeEventListener('briefing:refresh', load);
  }, [load]);
  if (!data || !data.total) return null;
  return (
    <section className="bc" aria-labelledby="bc-title">
      <style>{CSS}</style>
      <div className="bc-head">
        <Sparkles size={18} color="var(--ui-accent-text)" aria-hidden="true" />
        <h2 id="bc-title" className="bc-title">{data.title}</h2>
        {onConfigure && <Button size="sm" className="bc-cfg" onClick={() => { requestNotifSettings(); onConfigure(); }}>Escolher o que entra</Button>}
      </div>
      <p className="bc-sub">Reunido por regras (sem IA), com o motivo em cada linha.</p>
      {data.sections.map((s) => (
        <div key={s.key} className="bc-sec">
          <h3 className="bc-sec-t">{s.label}<span className="bc-n">{s.count}</span></h3>
          {s.items.map((it, i) => (
            <button key={`${s.key}-${i}`} type="button" className="bc-row" onClick={() => onOpenItem && onOpenItem(it)}>
              <span>{it.text}</span>
              <ChevronRight size={16} aria-hidden="true" color="var(--text-5, var(--text-4))" />
            </button>
          ))}
          {s.count > s.items.length && <p className="bc-more">e mais {s.count - s.items.length}</p>}
        </div>
      ))}
    </section>
  );
}
