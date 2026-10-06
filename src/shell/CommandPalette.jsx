// Busca global (Ctrl/Cmd+K): pula para um módulo, uma empresa, uma atividade ou uma reunião. Onda 1, §81.
// Onda 5: com a busca vazia mostra Favoritos e Recentes (guardados por pessoa só como kind/id; a ação é reconstruída dos dados
// atuais, e o que não existe mais some) e cada item tem uma estrela para favoritar (Shift+Enter também).
// Os itens vêm do App (que conhece os dados já carregados); aqui só filtra, ordena e navega por teclado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, Sparkles } from 'lucide-react';
import { useDialog } from '../lib/nav.js';
import { IconButton } from '../ui/index.jsx';
import { getFavorites, getRecents, toggleFavorite } from '../lib/recents.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX = 40;
const GROUP_ORDER = ['Ir para', 'Empresas', 'Atividades', 'Reuniões', 'Meu quadro'];

function score(item, terms) {
  const label = fold(item.label);
  const hay = `${label} ${fold(item.hint)} ${fold(item.keywords)}`;
  let total = 0;
  for (const t of terms) {
    if (!hay.includes(t)) return -1;
    if (label.startsWith(t)) total += 3;
    else if (label.includes(` ${t}`)) total += 2;
    else if (label.includes(t)) total += 1;
  }
  return total;
}

export default function CommandPalette({ getItems, onClose, onAskRenata }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(() => { try { return getItems() || []; } catch (e) { return []; } }, []);
  const dlg = useDialog(onClose, { history: false });
  const listRef = useRef(null);
  const [favs, setFavs] = useState(() => getFavorites());
  const recents = useMemo(() => getRecents(), []);
  const keyOf = (i) => `${i.kind}:${i.rid}`;
  const favKeys = useMemo(() => new Set(favs.map((f) => `${f.kind}:${f.id}`)), [favs]);

  const results = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    const text = q.trim();
    // RENATA sempre à mão: sem texto, "Falar com a RENATA"; com texto, "Perguntar à RENATA: …" (vale mesmo sem nenhum resultado).
    const renata = onAskRenata ? [{ id: 'ask-renata', group: 'RENATA', icon: Sparkles, label: text.length >= 2 ? `Perguntar à RENATA: “${text}”` : 'Falar com a RENATA', hint: text.length >= 2 ? 'Enter' : 'assistente da PRICETAX', run: () => onAskRenata(text.length >= 2 ? text : '') }] : [];
    if (!terms.length) {
      const byKey = new Map(items.filter((i) => i.kind).map((i) => [keyOf(i), i]));
      const alive = (list) => list.map((x) => byKey.get(`${x.kind}:${x.id}`)).filter(Boolean);
      const favItems = alive(favs).map((i) => ({ ...i, id: `fav-${i.id}`, group: 'Favoritos' }));
      const recItems = alive(recents).filter((i) => !favKeys.has(keyOf(i))).slice(0, 8).map((i) => ({ ...i, id: `rec-${i.id}`, group: 'Recentes' }));
      return [...renata, ...favItems, ...recItems, ...items.filter((i) => i.group === 'Ir para'), ...items.filter((i) => i.group === 'Empresas').slice(0, 6)];
    }
    const ranked = items.map((i) => ({ i, s: score(i, terms) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.i);
    // Agrupa na ordem fixa (cada título aparece uma vez), mantendo o ranking dentro do grupo e um teto por grupo.
    const out = [];
    for (const g of GROUP_ORDER) out.push(...ranked.filter((i) => i.group === g).slice(0, 10));
    // Com texto, a RENATA vem por ÚLTIMO: Enter continua abrindo o melhor resultado; sem resultado nenhum, Enter pergunta à RENATA.
    return [...out.slice(0, MAX), ...renata];
  }, [q, items, favs, recents, favKeys, onAskRenata]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('[data-active="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  function run(item) {
    if (!item) return;
    onClose();
    setTimeout(() => item.run(), 0);
  }
  function toggleFav(item) {
    if (!item || !item.kind) return;
    toggleFavorite({ kind: item.kind, id: item.rid, label: item.label, hint: item.hint || '' });
    setFavs(getFavorites());
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); toggleFav(results[active]); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
  }

  let lastGroup = null;
  return (
    <div {...dlg} aria-label="Busca global" className="shell-pal-overlay no-print" onClick={onClose}>
      <div className="shell-pal" onClick={(e) => e.stopPropagation()}>
        <div className="shell-pal-input">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar empresa, atividade, reunião ou módulo…"
            role="combobox"
            aria-expanded="true"
            aria-controls="shell-pal-list"
            aria-activedescendant={results[active] ? `shell-pal-${results[active].id}` : undefined}
            aria-label="Buscar"
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div id="shell-pal-list" role="listbox" className="shell-pal-list" ref={listRef}>
          {results.length === 0 && <div className="shell-pal-empty">Nada encontrado para “{q}”. Tente outra palavra.</div>}
          {results.map((it, idx) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <React.Fragment key={it.id}>
                {head && <div className="shell-pal-group" role="presentation">{head}</div>}
                <div
                  id={`shell-pal-${it.id}`}
                  role="option"
                  aria-selected={idx === active}
                  data-active={idx === active ? 'true' : 'false'}
                  className="shell-pal-item"
                  onMouseMove={() => { if (idx !== active) setActive(idx); }}
                  onClick={() => run(it)}
                >
                  {Icon ? <Icon size={15} aria-hidden="true" /> : <span style={{ width: 15 }} />}
                  <span className="shell-pal-label">{it.label}</span>
                  {it.hint && <span className="shell-pal-hint">{it.hint}</span>}
                  {it.kind && (() => {
                    const fav = favKeys.has(keyOf(it));
                    return (
                      <IconButton
                        size="sm" className="shell-pal-star" tabIndex={-1}
                        label={fav ? `Remover dos favoritos: ${it.label}` : `Adicionar aos favoritos: ${it.label}`}
                        aria-pressed={fav}
                        icon={(props) => <Star {...props} fill={fav ? 'currentColor' : 'none'} />}
                        onClick={(e) => { e.stopPropagation(); toggleFav(it); }}
                      />
                    );
                  })()}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="shell-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>⇧</kbd><kbd>Enter</kbd> favoritar</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>
    </div>
  );
}
