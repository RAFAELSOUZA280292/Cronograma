// Pastas e regras da Caixa de e-mail (2026-11-02, pacote de produtividade). "Pasta" = marcador do Gmail: mover põe a pasta e
// tira da Entrada (como no Outlook); a regra é um filtro do Gmail, então vale com o painel fechado, no Gmail e no celular.
import React, { useEffect, useState } from 'react';
import { FolderPlus, Trash2, Link2, Check, Ban } from 'lucide-react';
import { Button, BusyBar } from '../ui/index.jsx';
import { notify, askConfirm } from '../ui/dialogs.jsx';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { useDialog } from '../lib/nav.js';
import { LABEL_COLORS } from '../../shared/mailLabelColors.js';

// Paleta de cores (só as que o Gmail aceita, shared/mailLabelColors.js). value = cor de fundo ou null (sem cor).
export function LabelColorPicker({ value, onChange }) {
  return (
    <div className="mail-colors" role="radiogroup" aria-label="Cor da pasta">
      <button type="button" role="radio" aria-checked={!value} className={`mail-color none${!value ? ' on' : ''}`} title="Sem cor" aria-label="Sem cor" onClick={() => onChange(null)}>
        <Ban size={14} aria-hidden="true" />
      </button>
      {LABEL_COLORS.map((c) => (
        <button key={c.bg} type="button" role="radio" aria-checked={value === c.bg} className={`mail-color${value === c.bg ? ' on' : ''}`} title={c.name} aria-label={c.name} style={{ background: c.bg, color: c.text }} onClick={() => onChange(c.bg)}>
          {value === c.bg && <Check size={14} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// Criar pasta ou editar (nome e cor). `label` vazio = nova pasta. Devolve a pasta gravada em onSaved.
export function FolderDialog({ label, onClose, onSaved }) {
  const trap = useDialog(onClose);
  const [name, setName] = useState(label ? label.name : '');
  const [color, setColor] = useState(label ? label.color || null : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    if (label && n === label.name && (color || null) === (label.color || null)) { onClose(); return; }
    setBusy(true); setError('');
    try {
      const body = { name: n, color };
      const r = label ? await apiPatch(`/api/mail/labels/${encodeURIComponent(label.id)}`, body) : await apiPost('/api/mail/labels', body);
      notify(label ? 'Pasta atualizada.' : 'Pasta criada.', { tone: 'success' });
      onSaved(r);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="ui-dlg-overlay" onClick={onClose}>
      <form className="ui-dlg mail-move-dlg" role="dialog" aria-modal="true" aria-label={label ? 'Editar pasta' : 'Nova pasta'} ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 className="ui-dlg-title">{label ? 'Editar pasta' : 'Nova pasta'}</h2>
        <BusyBar active={busy} />
        <label className="mail-folder-field">
          <span>Nome da pasta (use / para subpasta, ex.: Clientes/KUHN)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </label>
        <div className="mail-folder-field"><span>Cor</span><LabelColorPicker value={color} onChange={setColor} /></div>
        <div className="ui-dlg-msg">A cor também aparece no Gmail e no celular.</div>
        {error && <div className="mc-error" role="alert">{error}</div>}
        <div className="ui-dlg-actions">
          <button type="button" className="ui-btn" onClick={onClose} disabled={busy} title={busy ? 'Aguarde: gravando a pasta' : undefined}>Cancelar</button>
          <Button variant="primary" type="submit" loading={busy} disabled={!name.trim()} title={!name.trim() ? 'Dê um nome para a pasta' : undefined}>{label ? 'Salvar' : 'Criar pasta'}</Button>
        </div>
      </form>
    </div>
  );
}

// Mover para pasta: lista as pastas, cria uma nova na hora e, para um remetente só, oferece "sempre mover os e-mails dele".
export function MoveDialog({ labels, count, sender, canRules, currentLabel, onClose, onMove, onCreated }) {
  const trap = useDialog(onClose);
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [always, setAlways] = useState(false);
  const [applyOld, setApplyOld] = useState(true);
  const [busy, setBusy] = useState(false);
  const shown = labels.filter((l) => l.id !== currentLabel && (l.display || l.name).toLowerCase().includes(filter.trim().toLowerCase()));

  async function go(label) {
    if (busy) return;
    setBusy(true);
    try { await onMove(label, always && sender ? { from: sender.email, applyExisting: applyOld } : null); } finally { setBusy(false); }
  }

  async function create(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const l = await apiPost('/api/mail/labels', { name });
      onCreated(l);
      setBusy(false);
      await go(l);
    } catch (err) { notify(err.message, { tone: 'error' }); setBusy(false); }
  }

  return (
    <div className="ui-dlg-overlay" onClick={onClose}>
      <div className="ui-dlg mail-move-dlg" role="dialog" aria-modal="true" aria-label="Mover para pasta" ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="ui-dlg-title">Mover {count > 1 ? `${count} conversas` : 'conversa'} para…</h2>
        <BusyBar active={busy} />
        {labels.length > 6 && <input className="mail-move-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar pasta" aria-label="Procurar pasta" autoFocus />}
        <ul className="mail-move-list">
          {shown.map((l) => (
            <li key={l.id}><button type="button" className="mail-folder" onClick={() => go(l)} disabled={busy}>{l.color && <i className="mail-dot" style={{ background: l.color }} aria-hidden="true" />}<span>{l.display || l.name}</span></button></li>
          ))}
          {!shown.length && <li className="mail-move-empty">{labels.length ? 'Nenhuma pasta com esse nome.' : 'Você ainda não tem pastas. Crie a primeira abaixo.'}</li>}
        </ul>
        <form className="mail-move-new" onSubmit={create}>
          <FolderPlus size={15} aria-hidden="true" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova pasta (ex.: Clientes/KUHN)" aria-label="Nome da nova pasta" maxLength={80} />
          <Button type="submit" size="sm" disabled={!newName.trim() || busy}>Criar e mover</Button>
        </form>
        {sender && (
          <div className="mail-move-rule">
            {canRules ? (
              <>
                <label className="mc-check"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /><span>Sempre mover os e-mails de <b>{sender.email}</b> para esta pasta</span></label>
                {always && <label className="mc-check sub"><input type="checkbox" checked={applyOld} onChange={(e) => setApplyOld(e.target.checked)} /><span>Mover também os que já estão na Caixa de entrada</span></label>}
              </>
            ) : (
              <div className="mail-move-hint"><Link2 size={13} aria-hidden="true" /> Para criar a regra "sempre mover os e-mails de {sender.email}", <a href="/api/google/oauth/start?mail=1">reconecte o Gmail</a> uma vez.</div>
            )}
          </div>
        )}
        <div className="ui-dlg-actions"><button type="button" className="ui-btn" onClick={onClose} disabled={busy}>Cancelar</button></div>
      </div>
    </div>
  );
}

// Lista as regras criadas (filtros do Gmail com "de:" → pasta) e deixa tirar.
export function RulesDialog({ canRules, onClose }) {
  const trap = useDialog(onClose);
  const [rules, setRules] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRules) return;
    apiGet('/api/mail/rules').then((d) => setRules(d.rules)).catch((e) => setError(e.message));
  }, [canRules]);

  async function remove(r) {
    if (!(await askConfirm({ title: 'Tirar esta regra?', message: `Os próximos e-mails de ${r.from} voltam a cair na Caixa de entrada. Os que já estão em “${r.labelName}” ficam lá.`, confirmLabel: 'Tirar regra', danger: true }))) return;
    try {
      await apiDelete(`/api/mail/rules/${encodeURIComponent(r.id)}`);
      setRules((list) => list.filter((x) => x.id !== r.id));
      notify('Regra removida.', { tone: 'success' });
    } catch (e) { notify(e.message, { tone: 'error' }); }
  }

  return (
    <div className="ui-dlg-overlay" onClick={onClose}>
      <div className="ui-dlg mail-move-dlg" role="dialog" aria-modal="true" aria-label="Regras do e-mail" ref={trap.ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 className="ui-dlg-title">Regras do e-mail</h2>
        <div className="ui-dlg-msg">Para criar uma regra, abra um e-mail, clique em <b>Mover para pasta</b> e marque "Sempre mover os e-mails de…". As regras ficam no seu Gmail e valem também no celular.</div>
        {!canRules ? (
          <div className="mail-move-hint"><Link2 size={13} aria-hidden="true" /> Falta uma permissão do Google para ver e criar regras. <a href="/api/google/oauth/start?mail=1">Reconecte o Gmail</a> uma vez.</div>
        ) : error ? <div className="mc-error" role="alert">{error}</div> : rules === null ? <BusyBar active /> : (
          <ul className="mail-rules">
            {rules.map((r) => (
              <li key={r.id}>
                <span className="mail-rules-text">E-mails de <b>{r.from}</b> → <b>{r.labelName}</b>{r.other ? ' (com outras condições, criada no Gmail)' : ''}</span>
                <button type="button" className="mail-ic" aria-label={`Tirar a regra de ${r.from}`} title="Tirar regra" onClick={() => remove(r)}><Trash2 size={14} aria-hidden="true" /></button>
              </li>
            ))}
            {!rules.length && <li className="mail-move-empty">Nenhuma regra ainda.</li>}
          </ul>
        )}
        <div className="ui-dlg-actions"><button type="button" className="ui-btn" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
