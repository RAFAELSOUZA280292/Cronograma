// Responsáveis por empresa (2026-10-09, pedido do Rafael): cada empresa tem um responsável PRINCIPAL e pode ter outros da equipe
// PRICETAX (sempre usuários, nunca texto livre). Guardado na própria empresa: company.ownerIds (ids) + company.principalOwnerId.
// A tela de empresas abre, por padrão, nas empresas em que a pessoa é responsável; pausadas ficam arquivadas (ocultas) até pedir.
import React, { useEffect, useState } from 'react';
import { Star, UserX } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button } from '../ui/index.jsx';

export const ownerIdsOf = (company) => (Array.isArray(company && company.ownerIds) ? company.ownerIds.filter(Boolean) : []);
export function principalOf(company) {
  const ids = ownerIdsOf(company);
  const p = company && company.principalOwnerId;
  return p && ids.includes(p) ? p : (ids[0] || '');
}
export const shortName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || '');
};

export const ownerInitials = (name) => { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '')[0] || '') + (p.length > 1 ? p[p.length - 1][0] : ''); };

// Escolha salva por usuário (só conveniência): quais responsáveis ver e se mostra pausadas/arquivadas.
const prefKey = (userId) => `ptx-company-view:${userId}`;
export function readCompanyView(userId) {
  try { return JSON.parse(window.localStorage.getItem(prefKey(userId)) || 'null'); } catch (e) { return null; }
}
export function saveCompanyView(userId, view) {
  try { window.localStorage.setItem(prefKey(userId), JSON.stringify(view)); } catch (e) { /* sem armazenamento */ }
}

// Etiquetas no cartão: principal (estrela) + outros; sem responsável vira um aviso clicável.
export function OwnerBadges({ company, usersById, onEdit }) {
  const ids = ownerIdsOf(company).filter((id) => usersById.has(id));
  const principal = principalOf(company);
  if (!ids.length) {
    return (
      <button type="button" className="own-badge none" title="Definir quem é o responsável por esta empresa" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}>
        <UserX size={11} aria-hidden="true" /> Sem responsável
      </button>
    );
  }
  const ordered = [...ids.filter((id) => id === principal), ...ids.filter((id) => id !== principal)];
  return (
    <span className="own-row" title={ordered.map((id) => `${usersById.get(id)}${id === principal ? ' (principal)' : ''}`).join(' · ')}>
      {ordered.slice(0, 1).map((id) => (
        <span key={id} className={`own-badge${id === principal ? ' main' : ''}`}>
          {id === principal && <Star size={12} aria-hidden="true" />} {shortName(usersById.get(id))}
        </span>
      ))}
      {ordered.length > 1 && <span className="own-badge">+{ordered.length - 1}</span>}
    </span>
  );
}

// Principal + demais (checkboxes). `value` = { ownerIds, principalOwnerId }; `onChange` recebe o mesmo formato.
export function OwnersField({ users, value, onChange }) {
  const ids = ownerIdsOf(value);
  const principal = principalOf(value);
  function toggle(id) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange({ ownerIds: next, principalOwnerId: next.includes(principal) ? principal : (next[0] || '') });
  }
  function setPrincipal(id) {
    const next = id && !ids.includes(id) ? [...ids, id] : ids;
    onChange({ ownerIds: next, principalOwnerId: id });
  }
  if (!users.length) return <div className="own-hint">A lista da equipe PRICETAX não está disponível para o seu perfil.</div>;
  return (
    <div className="own-field">
      <label className="own-lbl">Responsável principal
        <select value={principal} onChange={(e) => setPrincipal(e.target.value)} aria-label="Responsável principal">
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <div className="own-lbl">Também acompanham</div>
      <div className="own-checks">
        {users.map((u) => (
          <label key={u.id} className="own-check">
            <input type="checkbox" checked={ids.includes(u.id)} disabled={u.id === principal} onChange={() => toggle(u.id)} />
            <span>{u.name}{u.id === principal ? ' (principal)' : ''}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Define responsáveis em várias empresas de uma vez. "Adicionar" mantém quem já é responsável; "Substituir" troca.
export function BulkOwnersModal({ users, count, onApply, onClose }) {
  const [val, setVal] = useState({ ownerIds: [], principalOwnerId: '' });
  const [mode, setMode] = useState('add');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [val, mode]);
  const ids = ownerIdsOf(val);
  async function apply() {
    if (!ids.length) { setError('Escolha ao menos uma pessoa.'); return; }
    setBusy(true);
    try { await onApply(val, mode); onClose(); } catch (e) { setError(e.message || 'Não foi possível aplicar.'); setBusy(false); }
  }
  return (
    <Modal title="Definir responsáveis" subtitle={`${count} ${count === 1 ? 'empresa selecionada' : 'empresas selecionadas'}`} onClose={onClose} busy={busy} error={error}
      footer={<><Button onClick={onClose} disabled={busy} disabledReason="Aguarde">Cancelar</Button><Button variant="primary" loading={busy} disabled={!ids.length} disabledReason="Escolha ao menos uma pessoa" onClick={apply}>Aplicar a {count}</Button></>}>
      <div className="own-bulk">
        <div className="own-modes" role="radiogroup" aria-label="Como aplicar">
          <label><input type="radio" name="own-mode" checked={mode === 'add'} onChange={() => setMode('add')} /> <span><b>Adicionar</b> às pessoas que já são responsáveis (o principal só é definido onde não há um)</span></label>
          <label><input type="radio" name="own-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <span><b>Substituir</b> os responsáveis atuais por estes</span></label>
        </div>
        <OwnersField users={users} value={val} onChange={setVal} />
      </div>
    </Modal>
  );
}

// Aplica a escolha do modal sobre os responsáveis atuais de UMA empresa.
export function mergeOwners(company, val, mode) {
  const chosen = ownerIdsOf(val);
  if (mode === 'replace') return { ownerIds: chosen, principalOwnerId: val.principalOwnerId && chosen.includes(val.principalOwnerId) ? val.principalOwnerId : chosen[0] };
  const cur = ownerIdsOf(company);
  const ownerIds = [...new Set([...cur, ...chosen])];
  const keep = principalOf(company);
  return { ownerIds, principalOwnerId: keep || val.principalOwnerId || ownerIds[0] };
}

export const OWNERS_CSS = `
.own-row { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.own-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 8px; border: 1px solid var(--border-3); background: transparent; color: var(--text-3); font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; }
.own-badge.main { color: var(--ui-accent-text, #F5C400); border-color: rgba(214,168,0,.5); background: rgba(245,196,0,.16); }
.own-badge.none { color: var(--ui-warn, #ffb066); border-color: rgba(255,159,64,.5); border-style: dashed; cursor: pointer; }
.own-field { display: flex; flex-direction: column; gap: 8px; }
.own-lbl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--text-3); }
.own-lbl select { width: 100%; }
.own-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px 12px; }
.own-check { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 13px; color: var(--text-2); cursor: pointer; }
.own-check input { width: 18px; height: 18px; flex: none; accent-color: var(--ui-accent, #F5C400); }
.own-hint { font-size: 12px; color: var(--text-4); }
.own-bulk { display: flex; flex-direction: column; gap: 14px; }
.own-modes { display: flex; flex-direction: column; gap: 8px; }
.own-modes label { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; line-height: 1.45; color: var(--text-2); cursor: pointer; }
.own-modes input { margin-top: 3px; }
.cview { display: flex; align-items: flex-end; gap: 10px 14px; flex-wrap: wrap; margin-bottom: 10px; }
.cview-sel { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--text-4); }
.cview-sel select { min-width: 220px; }
.cview-note { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; font-size: 12.5px; color: var(--text-4); }
.cview-note button { background: transparent; border: 0; padding: 0; color: var(--ui-accent-text, #F5C400); font: inherit; font-weight: 800; cursor: pointer; }
.cview-note button:hover { text-decoration: underline; }

/* Faixa "Por responsável": uma linha de botões com a contagem de cada pessoa (clicar filtra). */
.own-strip { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; margin: 0; flex: 1 1 360px; min-width: 0; }
.co-sel .cview { justify-content: space-between; align-items: center; }
.own-strip-l { font-size: 11.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--text-4); }
.own-strip-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.own-chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 6px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-3); color: var(--text-2); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.own-chip:first-child { padding-left: 12px; }
.own-chip:hover { border-color: var(--border-3); background: var(--bg-4, var(--bg-3)); }
.own-chip.on { background: rgba(245,196,0,.18); border-color: #F5C400; color: var(--text-1); }
.own-chip.warn:not(.on) { border-style: dashed; color: var(--ui-warn, #ffb066); }
.own-chip b { font-weight: 700; }
.own-chip .own-n { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--bg-1); border: 1px solid var(--border-1); font-weight: 800; font-size: 12px; text-align: center; color: var(--text-1); }
.own-chip .own-p { font-style: normal; font-size: 11px; color: var(--text-4); }
.own-chip:focus-visible, .cview .ui-seg button:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 1px; }
.own-av { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(245,196,0,.28); color: var(--text-1); font-size: 10px; font-weight: 800; }

/* Tela de empresas (desenho aprovado em 2026-10-09): botões de situação soltos em formato de pílula; barra do topo flutuante. */
.co-sel .cview .ui-seg { background: transparent; border: 0; padding: 0; gap: 10px; }
.co-sel .cview .ui-seg button { min-height: 38px; padding: 0 20px; border-radius: 19px; border: 1px solid var(--border-2); background: var(--bg-3); color: var(--text-2); font-size: 13.5px; font-weight: 700; box-shadow: none; }
.co-sel .cview .ui-seg button[aria-pressed="true"] { background: rgba(245,196,0,.18); border-color: #F5C400; color: var(--text-1); font-weight: 800; }
.co-sel .cview-sel { font-size: 12.5px; color: var(--text-2); }
.co-sel .cview-sel select { min-width: 300px; }
.co-sel::before, .co-sel::after { content: ''; position: absolute; pointer-events: none; z-index: 0; border-radius: 50%; }
.co-sel::before { width: 620px; height: 620px; left: -330px; top: 60px; background: radial-gradient(closest-side, rgba(245,196,0,.10), transparent 72%); }
.co-sel::after { width: 560px; height: 560px; right: -250px; top: 40px; border: 26px solid rgba(245,196,0,.09); filter: blur(1px); }
html[data-theme="light"] .co-sel { overflow-x: clip; background-image: linear-gradient(180deg, #fbfaf6 0%, var(--bg-page) 320px); }
html[data-theme="light"] .co-sel .company-card { background: var(--bg-2) !important; box-shadow: 0 2px 12px rgba(40,32,8,.06); }
html[data-co-sel="1"] .shell-bar { top: 10px; margin: 10px 24px 0; border: 1px solid var(--border-1); border-radius: 18px; box-shadow: 0 8px 28px rgba(40,32,8,.10); height: 54px; }
html[data-co-sel="1"] .co-sel { padding-top: 6px; }

@media (max-width: 767px) {
  html[data-co-sel="1"] .shell-bar { margin: 8px 8px 0; top: 8px; border-radius: 14px; }
  .co-sel .cview .ui-seg { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; padding-bottom: 4px; }
  .co-sel .cview .ui-seg button { flex-shrink: 0; white-space: nowrap; }
  .co-sel .cview > [role="group"] { width: 100%; }
  .co-sel .cview .ui-seg button { min-height: 44px; padding: 0 16px; }
  .co-sel .cview-sel select { min-width: 0; }
  .own-strip-chips { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; padding-bottom: 4px; }
  .own-chip { height: 44px; flex-shrink: 0; }
  .own-strip { flex-direction: column; align-items: flex-start; }
  .cview-sel, .cview-sel select { width: 100%; }
  .cview-sel select { min-height: 44px; font-size: 16px; }
  .own-check { min-height: 44px; }
  .own-badge.none { min-height: 32px; }
}
`;
