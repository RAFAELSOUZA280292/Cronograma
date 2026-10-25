// Visões salvas de Negócios (§98): atalhos para uma combinação de filtros + modo (quadro/lista).
// Pessoais ou compartilhadas com o time (gestor+); uma delas pode ser a que abre por padrão.
import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, MoreVertical, Users, Star, Trash2, Pencil, Save, Share2 } from 'lucide-react';
import { Modal, Field, CancelButton, useDirty } from './ui.jsx';
import { guardedModal } from '../ui/SafeBoundary.jsx';

export const BUILTIN_VIEWS = [
  { id: 'all', name: 'Todos os negócios', hint: 'Sem filtros' },
  { id: 'mine', name: 'Meus negócios', hint: 'Só os que são seus' },
];

function ViewDialog({ initial, canShare, onSubmit, onCancel }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [shared, setShared] = useState(initial ? initial.shared : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = useDirty({ name, shared });
  const block = busy ? 'Aguarde terminar de salvar' : !name.trim() ? 'Dê um nome para a visão' : '';
  async function save() {
    setBusy(true); setError('');
    try { await onSubmit({ name: name.trim(), shared }); } catch (e) { setError(e.message || 'Não foi possível salvar a visão.'); setBusy(false); }
  }
  return (
    <Modal title={initial ? 'Editar visão' : 'Salvar visão'} onClose={onCancel} width={440} dirty={dirty} locked={busy}>
      <div className="crm-form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Field label="Nome da visão *">
          <input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !block) save(); }} placeholder="Ex.: Propostas paradas há +14 dias" />
        </Field>
        {canShare && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ marginTop: 2, width: 'auto', flexShrink: 0 }} />
            <span><b>Compartilhar com o time.</b> <span className="crm-muted">Todos passam a ver esta visão. “Meus negócios” funciona para cada pessoa, não só para você.</span></span>
          </label>
        )}
        {!initial && <div className="crm-muted" style={{ fontSize: 12 }}>Guarda o modo (quadro ou lista), o funil e todos os filtros que estão na tela agora.</div>}
      </div>
      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        {block && !busy && <span className="crm-muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>{block}</span>}
        <CancelButton />
        <button type="button" className="crm-btn crm-btn-primary" disabled={!!block} title={block || undefined} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
export const ViewDialogGuarded = guardedModal(ViewDialog, 'a visão salva', 'crm-view-dialog');

function ViewMenu({ view, isDefault, canShare, onEdit, onUpdate, dirty, onToggleShare, onDefault, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const run = (fn) => () => { setOpen(false); fn(); };
  const editable = view.mine || (view.shared && canShare);
  return (
    <span className="crm-quick" ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="crm-icon-btn" aria-label={`Opções da visão ${view.name}`} aria-haspopup="menu" aria-expanded={open} title="Opções da visão" onClick={() => setOpen((o) => !o)}><MoreVertical size={14} aria-hidden="true" /></button>
      {open && (
        <div className="crm-quick-menu" role="menu" style={{ left: 0, right: 'auto', minWidth: 230 }}>
          {editable && dirty && <button type="button" role="menuitem" onClick={run(onUpdate)}><Save size={14} /> Atualizar com os filtros da tela</button>}
          <button type="button" role="menuitem" onClick={run(onDefault)}><Star size={14} /> {isDefault ? 'Não abrir mais por padrão' : 'Abrir esta visão por padrão'}</button>
          {editable && <button type="button" role="menuitem" onClick={run(onEdit)}><Pencil size={14} /> Renomear</button>}
          {canShare && (view.mine || !view.shared) && <button type="button" role="menuitem" onClick={run(onToggleShare)}><Share2 size={14} /> {view.shared ? 'Deixar só para mim' : 'Compartilhar com o time'}</button>}
          {editable && <button type="button" role="menuitem" onClick={run(onDelete)}><Trash2 size={14} color="#e2574c" /> Excluir</button>}
        </div>
      )}
    </span>
  );
}

export default function SavedViewsBar({ views, activeId, dirty, builtinActive, defaultRef, canShare, onPick, onSaveNew, onUpdate, onEdit, onToggleShare, onDefault, onDelete }) {
  const active = views.find((v) => v.id === activeId);
  return (
    <div className="crm-filters" role="group" aria-label="Visões salvas" style={{ marginBottom: 8 }}>
      <span className="crm-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bookmark size={12} aria-hidden="true" /> Visões:</span>
      {BUILTIN_VIEWS.map((b) => (
        <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <button type="button" className={`crm-chip${builtinActive === b.id ? ' active' : ''}`} aria-pressed={builtinActive === b.id} title={`${b.hint}${defaultRef === b.id ? ' · abre por padrão' : ''}`} onClick={() => onPick(b.id)}>{b.name}{defaultRef === b.id && <Star size={10} aria-label="abre por padrão" />}</button>
          {builtinActive === b.id && !activeId && <ViewMenu view={{ ...b, mine: false, shared: false }} dirty={false} isDefault={defaultRef === b.id} canShare={false} onDefault={() => onDefault(b.id)} />}
        </span>
      ))}
      {views.map((v) => (
        <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <button type="button" className={`crm-chip${activeId === v.id ? ' active' : ''}`} aria-pressed={activeId === v.id} title={v.shared ? `Compartilhada por ${v.ownerName || 'um gestor'}` : 'Só sua'} onClick={() => onPick(v.id)}>
            {v.shared && <Users size={11} aria-label="compartilhada com o time" />}{v.name}{activeId === v.id && dirty && <span className="crm-muted" style={{ fontWeight: 600 }}>· alterada</span>}{defaultRef === v.id && <Star size={10} aria-label="abre por padrão" />}
          </button>
          {activeId === v.id && <ViewMenu view={v} dirty={dirty} isDefault={defaultRef === v.id} canShare={canShare} onEdit={() => onEdit(v)} onUpdate={() => onUpdate(v)} onToggleShare={() => onToggleShare(v)} onDefault={() => onDefault(v.id)} onDelete={() => onDelete(v)} />}
        </span>
      ))}
      {active && dirty && (active.mine || (active.shared && canShare)) && <button type="button" className="crm-btn" onClick={() => onUpdate(active)}><Save size={13} /> Atualizar “{active.name}”</button>}
      <button type="button" className="crm-btn" onClick={onSaveNew} title="Guardar os filtros que estão na tela como uma visão"><Bookmark size={13} /> Salvar visão</button>
    </div>
  );
}
