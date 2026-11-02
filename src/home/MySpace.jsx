// Bloco "Meu espaço" da tela inicial (2026-11-02, §126): título, anotação em texto simples e links próprios. A pessoa pode ter
// até 6 (botão "Meu espaço" no modo Personalizar). Fica em users.preferences.home.spaces, só dela.
import React, { useState } from 'react';
import { NotebookPen, Pencil, Plus, X, ExternalLink } from 'lucide-react';
import { Button, IconButton } from '../ui/index.jsx';
import { updateHomePrefs } from './homePrefs.js';
import { cleanSpace, cleanUrl } from '../../shared/homeLayout.js';

const CSS = `
.msp { font-family: 'Inter', sans-serif; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(11,11,30,.04); box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.msp-head { display: flex; align-items: center; gap: var(--sp-2); }
.msp-title { flex: 1; min-width: 0; margin: 0; font-size: 15px; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msp-note { margin: 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.msp-empty { margin: 0; font-size: var(--fs-sm); color: var(--text-4); }
.msp-links { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: 0; padding: 0; list-style: none; }
.msp-link { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 7px 11px; border-radius: var(--r-md); border: 1px solid var(--border-2); background: var(--bg-1); color: var(--text-1); font-size: var(--fs-sm); font-weight: 600; text-decoration: none; }
.msp-link:hover { border-color: var(--border-3); background: var(--bg-3); }
.msp-link:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.msp-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msp-form { display: flex; flex-direction: column; gap: var(--sp-2); }
.msp-form label { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-xs); font-weight: 600; color: var(--text-3); }
.msp-form textarea { min-height: 110px; resize: vertical; font-family: inherit; line-height: 1.45; }
.msp-lrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto; gap: 6px; align-items: center; }
.msp-err { margin: 0; color: var(--ui-danger); font-size: var(--fs-sm); }
.msp-foot { display: flex; gap: var(--sp-2); justify-content: flex-end; flex-wrap: wrap; }
@media (max-width: 600px) { .msp-lrow { grid-template-columns: minmax(0, 1fr) auto; } .msp-lrow input:first-child { grid-column: 1 / -1; } }
`;

function Editor({ id, space, spaces, onDone }) {
  const [title, setTitle] = useState(space.title);
  const [note, setNote] = useState(space.note);
  const [links, setLinks] = useState(space.links.length ? space.links : [{ name: '', url: '' }]);
  const [err, setErr] = useState('');
  const setLink = (i, patch) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  function save(e) {
    e.preventDefault();
    const filled = links.filter((l) => l.url.trim());
    if (filled.some((l) => !cleanUrl(l.url))) { setErr('Algum endereço não é válido: use http ou https (ex.: www.gov.br).'); return; }
    updateHomePrefs({ spaces: { ...spaces, [id]: cleanSpace({ title, note, links: filled }) } });
    onDone();
  }
  return (
    <form className="msp-form" onSubmit={save}>
      <label>Título<input className="ui-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Meu espaço" /></label>
      <label>Anotação<textarea className="ui-input" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="Lembretes, metas da semana, telefones…" /></label>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <legend style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Links</legend>
        {links.map((l, i) => (
          <div key={i} className="msp-lrow">
            <input className="ui-input" aria-label={`Nome do link ${i + 1}`} value={l.name} maxLength={80} placeholder="Nome" onChange={(e) => setLink(i, { name: e.target.value })} />
            <input className="ui-input" aria-label={`Endereço do link ${i + 1}`} value={l.url} maxLength={500} placeholder="https://…" inputMode="url" onChange={(e) => { setLink(i, { url: e.target.value }); setErr(''); }} />
            <IconButton size="sm" icon={X} label={`Tirar o link ${i + 1}`} onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} />
          </div>
        ))}
        {links.length < 12 && <div><Button size="sm" icon={Plus} onClick={() => setLinks((x) => [...x, { name: '', url: '' }])}>Adicionar link</Button></div>}
      </fieldset>
      {err && <p className="msp-err" role="alert">{err}</p>}
      <div className="msp-foot">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary">Salvar</Button>
      </div>
    </form>
  );
}

export default function MySpace({ id, space, spaces, editingLayout }) {
  const [editing, setEditing] = useState(false);
  if (!space) return null;
  const empty = !space.note && !space.links.length;
  const titleId = `msp-t-${id}`;
  return (
    <section className="msp" aria-labelledby={titleId}>
      <style>{CSS}</style>
      <div className="msp-head">
        <NotebookPen size={18} color="var(--ui-accent-text)" aria-hidden="true" />
        <h2 id={titleId} className="msp-title">{space.title}</h2>
        {!editing && !editingLayout && <Button size="sm" icon={Pencil} onClick={() => setEditing(true)} aria-label={`Editar ${space.title}`}>Editar</Button>}
      </div>
      {editing ? <Editor id={id} space={space} spaces={spaces} onDone={() => setEditing(false)} /> : (
        <>
          {empty && <p className="msp-empty">Um espaço só seu: anote o que quiser e guarde links. Toque em Editar.</p>}
          {space.note && <p className="msp-note">{space.note}</p>}
          {space.links.length > 0 && (
            <ul className="msp-links" aria-label={`Links de ${space.title}`}>
              {space.links.map((l, i) => (
                <li key={`${l.url}-${i}`}>
                  <a className="msp-link" href={l.url} target="_blank" rel="noopener noreferrer" title={`${l.url} (abre em outra aba)`}>
                    <span>{l.name}</span><ExternalLink size={12} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
