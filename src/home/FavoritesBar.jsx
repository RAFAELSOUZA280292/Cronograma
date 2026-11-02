// Barra de favoritos (2026-11-02, §126) na barra do topo, em todas as telas: atalhos para módulos, empresas, atividades,
// reuniões, cartões e links próprios. A estrela fixa/desafixa a tela aberta; "Favoritos" abre a lista com ordem, remoção e
// "Adicionar link". Como na paleta (Ctrl+K), só kind/id ficam salvos: a ação é reconstruída dos dados atuais e o que a pessoa
// não pode mais abrir não aparece na barra (aparece na lista, marcado). No celular só o botão "Favoritos" fica visível.
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, ChevronDown, ChevronUp, Trash2, Plus, ExternalLink, Building2, ListChecks, Mic, Columns3, LayoutGrid, Link2 } from 'lucide-react';
import { useHomePrefs, toggleFavorite, isFavorite, setFavorites } from './homePrefs.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, IconButton, EmptyState } from '../ui/index.jsx';
import { cleanUrl, favKey } from '../../shared/homeLayout.js';

const KIND_ICON = { company: Building2, activity: ListChecks, meeting: Mic, card: Columns3, module: LayoutGrid, link: Link2 };
const KIND_LABEL = { company: 'Empresa', activity: 'Atividade', meeting: 'Reunião', card: 'Cartão', module: 'Módulo', link: 'Link' };

const CSS = `
.fav-bar { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; flex: 0 1 auto; }
.fav-list { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; overflow-x: auto; scrollbar-width: none; margin: 0; padding: 2px; list-style: none; }
.fav-list::-webkit-scrollbar { display: none; }
.fav-chip { max-width: 180px; }
.fav-chip span { overflow: hidden; text-overflow: ellipsis; }
.fav-star[aria-pressed="true"] { color: var(--ui-accent-text); }
.fav-star[aria-pressed="true"] svg { fill: currentColor; }
.fav-rows { display: flex; flex-direction: column; gap: var(--sp-1); margin: 0 0 var(--sp-4); padding: 0; list-style: none; }
.fav-row { display: flex; align-items: center; gap: var(--sp-2); padding: 6px 8px; border-radius: var(--r-md); border: 1px solid var(--border-1); background: var(--bg-2); }
.fav-row-t { flex: 1; min-width: 0; }
.fav-row-t b { display: block; font-size: var(--fs-sm); color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav-row-t small { display: block; font-size: var(--fs-xs); color: var(--text-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav-add { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) auto; gap: var(--sp-2); align-items: end; }
.fav-add label { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--text-3); font-weight: 600; }
@media (max-width: 720px) { .fav-list { display: none; } .fav-add { grid-template-columns: minmax(0, 1fr); } }
`;

function openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

// favoritos + itens atuais do app → [{ fav, item|null }]; item null = não existe mais ou a pessoa não pode abrir.
function resolve(favorites, getItems) {
  const byKey = new Map();
  for (const i of (getItems ? getItems() : []) || []) if (i.kind) byKey.set(`${i.kind}:${i.rid}`, i);
  return favorites.map((f) => {
    if (f.kind === 'link') return { fav: f, run: () => openLink(f.id), hint: new URL(f.id).hostname.replace(/^www\./, '') };
    const it = byKey.get(favKey(f));
    return { fav: f, run: it ? it.run : null, hint: it ? (it.hint || '') : 'Não encontrado ou sem acesso', label: it ? it.label : f.label };
  });
}

function ManageFavorites({ favorites, rows, onClose }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const move = (i, d) => {
    const list = favorites.slice();
    const [x] = list.splice(i, 1);
    list.splice(i + d, 0, x);
    setFavorites(list);
    setMsg(`${x.label} agora é o ${i + d + 1}º de ${list.length}.`);
  };
  const remove = (i) => { setMsg(`${favorites[i].label} saiu dos favoritos.`); setFavorites(favorites.filter((_, j) => j !== i)); };
  const add = (e) => {
    e.preventDefault();
    const clean = cleanUrl(url);
    if (!clean) { setErr('Use um endereço http ou https válido (ex.: www.gov.br).'); return; }
    if (favorites.some((f) => f.kind === 'link' && f.id === clean)) { setErr('Esse link já está nos favoritos.'); return; }
    const ok = toggleFavorite({ kind: 'link', id: clean, label: name.trim() || new URL(clean).hostname.replace(/^www\./, '') });
    if (ok) { setName(''); setUrl(''); setErr(''); setMsg('Link adicionado.'); }
  };
  return (
    <Modal title="Favoritos" subtitle="Atalhos da barra do topo. Valem em qualquer computador em que você entrar." onClose={onClose}>
      <style>{CSS}</style>
      <p className="ui-sr" role="status" aria-live="polite">{msg}</p>
      {favorites.length === 0 ? (
        <EmptyState compact icon={Star} title="Nenhum favorito ainda" description="Toque na estrela no topo de uma tela (empresa, módulo) ou use Shift+Enter na busca (Ctrl+K)." />
      ) : (
        <ul className="fav-rows">
          {rows.map(({ fav, hint, label }, i) => {
            const Icon = KIND_ICON[fav.kind] || LayoutGrid;
            return (
              <li key={favKey(fav)} className="fav-row">
                <Icon size={16} aria-hidden="true" color="var(--text-4)" />
                <span className="fav-row-t"><b>{label || fav.label}</b><small>{KIND_LABEL[fav.kind]}{hint ? ` · ${hint}` : ''}</small></span>
                <IconButton size="sm" icon={ChevronUp} label={`Subir ${fav.label}`} disabled={i === 0} disabledReason="Já é o primeiro" onClick={() => move(i, -1)} />
                <IconButton size="sm" icon={ChevronDown} label={`Descer ${fav.label}`} disabled={i === favorites.length - 1} disabledReason="Já é o último" onClick={() => move(i, 1)} />
                <IconButton size="sm" icon={Trash2} label={`Tirar ${fav.label} dos favoritos`} onClick={() => remove(i)} />
              </li>
            );
          })}
        </ul>
      )}
      <form className="fav-add" onSubmit={add}>
        <label>Nome<input className="ui-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Portal da NF-e" /></label>
        <label>Endereço<input className="ui-input" value={url} maxLength={500} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="https://…" inputMode="url" aria-invalid={!!err || undefined} /></label>
        <Button type="submit" icon={Plus} disabled={!url.trim()} disabledReason="Digite o endereço">Adicionar link</Button>
      </form>
      {err && <p role="alert" style={{ color: 'var(--ui-danger)', fontSize: 'var(--fs-sm)', margin: '8px 0 0' }}>{err}</p>}
    </Modal>
  );
}

export default function FavoritesBar({ getSearchItems, currentItem }) {
  const { favorites, loaded } = useHomePrefs();
  const [manage, setManage] = useState(false);
  const rows = useMemo(() => resolve(favorites, getSearchItems), [favorites, getSearchItems, manage]);
  const pinned = currentItem ? isFavorite(currentItem) : false;
  if (!loaded) return null;
  return (
    <div className="fav-bar">
      <style>{CSS}</style>
      {currentItem && (
        <button type="button" className="shell-btn icon fav-star" aria-pressed={pinned} onClick={() => toggleFavorite(currentItem)}
          title={pinned ? `Tirar ${currentItem.label} dos favoritos` : `Fixar ${currentItem.label} nos favoritos`}
          aria-label={pinned ? `Tirar ${currentItem.label} dos favoritos` : `Fixar ${currentItem.label} nos favoritos`}>
          <Star size={15} aria-hidden="true" />
        </button>
      )}
      {rows.some((r) => r.run) && (
        <ul className="fav-list" aria-label="Favoritos">
          {rows.filter((r) => r.run).map(({ fav, run, label }) => {
            const Icon = KIND_ICON[fav.kind] || LayoutGrid;
            return (
              <li key={favKey(fav)}>
                <button type="button" className="shell-btn fav-chip" onClick={run} title={`${KIND_LABEL[fav.kind]}: ${label || fav.label}${fav.kind === 'link' ? ' (abre em outra aba)' : ''}`}>
                  <Icon size={14} aria-hidden="true" /><span>{label || fav.label}</span>{fav.kind === 'link' && <ExternalLink size={11} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="shell-btn" onClick={() => setManage(true)} title="Favoritos: organizar e adicionar links" aria-label={`Favoritos (${favorites.length})`}>
        <Star size={14} aria-hidden="true" />{favorites.length === 0 && <span className="shell-hide-m">Favoritos</span>}
      </button>
      {/* Portal: o vidro (backdrop-filter) da barra do topo prenderia a janela dentro dela. */}
      {manage && createPortal(<ManageFavorites favorites={favorites} rows={rows} onClose={() => setManage(false)} />, document.body)}
    </div>
  );
}
