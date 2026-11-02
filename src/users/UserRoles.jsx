// Papéis de trabalho na tela de usuários (2026-11-02): seletor com confirmação, matriz "quem acessa o quê" e histórico de mudanças.
// Regras em shared/workRoles.js (as mesmas do servidor); a gravação passa pelo PATCH /api/users/:id de sempre.
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { MATRIX_NOTES, MODULES, ROLE_MATRIX, WORK_ROLES, WORK_ROLE_META, accessChanges, effectiveAccess, workRoleLabel, workRoleProblem } from '../../shared/workRoles.js';

export const USERS_ROLES_CSS = `
  .ur-badge { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .ur-select { font-size:12.5px !important; padding:5px 8px !important; }
  .ur-filters { display:flex; flex-wrap:wrap; gap:8px; padding:0 24px 14px; }
  .ur-filters input[type=text] { flex:1 1 220px; min-width:0; }
  .ur-filters select { flex:0 0 auto; width:auto !important; min-width:150px; }
  .ur-tabs { padding:0 24px 12px; }
  .ur-panel { margin:0 24px 24px; border:1px solid var(--border-2); border-radius:10px; background:var(--bg-2); overflow:auto; }
  .ur-matrix { width:100%; border-collapse:collapse; font-size:12.5px; }
  .ur-matrix th, .ur-matrix td { padding:9px 12px; border-bottom:1px solid var(--border-1); text-align:left; vertical-align:top; }
  .ur-matrix th { font-size:11.5px; color:var(--text-4); font-weight:600; position:sticky; top:0; background:var(--bg-2); }
  .ur-matrix td.ur-c { text-align:center; white-space:nowrap; }
  .ur-yes { color:#3ecf6e; font-weight:600; } .ur-no { color:#e2574c; font-weight:600; } .ur-dep { color:var(--text-4); }
  .ur-people { font-size:11.5px; color:var(--text-4); font-weight:400; margin-top:2px; white-space:normal; }
  .ur-fixed { table-layout:fixed; min-width:640px; } .ur-fixed th:first-child { width:34%; }
  .ur-hist-row { display:flex; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border-1); font-size:12.5px; align-items:baseline; }
  .ur-hist-when { width:132px; flex-shrink:0; color:var(--text-4); font-variant-numeric:tabular-nums; }
  .ur-hist-what { flex:1; min-width:0; color:var(--text-2); }
  .ur-hist-who { color:var(--text-4); font-size:11.5px; }
  .ur-gmail { font-size:11.5px; white-space:nowrap; }
  .ur-legend { font-size:11.5px; color:var(--text-4); padding:10px 14px; border-top:1px solid var(--border-1); }
  .ur-roles-desc { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin:0 24px 14px; }
  .ur-role-card { border:1px solid var(--border-2); border-radius:10px; padding:10px 12px; background:var(--bg-2); font-size:12px; color:var(--text-3); }
  .ur-role-card strong { display:block; font-size:13px; margin-bottom:3px; }
  @media (max-width: 720px) { .ur-filters, .ur-tabs { padding-left:16px; padding-right:16px; } .ur-panel, .ur-roles-desc { margin-left:16px; margin-right:16px; } .ur-hist-row { flex-direction:column; gap:2px; } .ur-hist-when { width:auto; } }
`;

export function WorkRoleBadge({ role }) {
  const meta = WORK_ROLE_META[role] || WORK_ROLE_META[''];
  return <span className="ur-badge" style={{ color: meta.color }} title={meta.desc}>{meta.label}</span>;
}

// Seletor de papel: nunca grava direto, abre a confirmação (com o que muda) pelo onRequest.
export function WorkRoleSelect({ user, onRequest, compact }) {
  const roles = ['', ...WORK_ROLES].filter((r) => r === (user.workRole || '') || !workRoleProblem(r, user));
  return (
    <select className={compact ? 'ur-select' : undefined} aria-label={`Papel de ${user.name}`} value={user.workRole || ''} disabled={user.role === 'cliente'}
      title={user.role === 'cliente' ? 'Cliente não recebe papel de trabalho da equipe' : undefined}
      onClick={(e) => e.stopPropagation()} onChange={(e) => onRequest(user, e.target.value)}>
      {roles.map((r) => <option key={r} value={r}>{r ? workRoleLabel(r) : (user.role === 'cliente' ? 'Cliente (sem papel)' : 'Sem papel')}</option>)}
    </select>
  );
}

// Diálogo de confirmação da troca de papel. onSave devolve '' (gravou) ou a mensagem de erro.
export function WorkRoleConfirm({ pending, onSave, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!pending) return null;
  const { user, role } = pending;
  const changes = accessChanges(user, role);
  const message = [
    `${user.name}: ${workRoleLabel(user.workRole || '')} → ${workRoleLabel(role)}.`,
    (WORK_ROLE_META[role] || WORK_ROLE_META['']).desc,
    changes.length ? `\nO que muda:\n• ${changes.join('\n• ')}` : '\nNenhum módulo muda de acesso.',
    '\nO servidor passa a valer na hora; o menu da pessoa se atualiza quando ela recarregar a página. A mudança fica no Histórico.',
  ].join('\n');
  return (
    <ConfirmDialog title="Trocar o papel?" message={message} confirmLabel={`Mudar para ${workRoleLabel(role)}`} danger={role === 'operacoes'}
      busy={busy} error={error}
      onConfirm={async () => {
        setBusy(true); setError('');
        const err = await onSave(user.id, role);
        setBusy(false);
        if (err) setError(err); else onClose();
      }}
      onCancel={onClose} />
  );
}

export function useUsersOverview() {
  const [data, setData] = useState({ google: {}, history: [], error: '' });
  const reload = useCallback(async () => {
    try { const r = await apiGet('/api/users/overview'); setData({ google: r.google || {}, history: r.history || [], error: '' }); }
    catch (e) { setData((d) => ({ ...d, error: e.message })); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload];
}

export function GmailCell({ info }) {
  if (!info || !info.connected) return <span className="ur-gmail" style={{ color: 'var(--text-6)' }}>Não conectado</span>;
  if (info.gmail === false) return <span className="ur-gmail" style={{ color: '#e2a34c' }} title="Conectou o Google, mas sem a permissão do Gmail">Só agenda</span>;
  return <span className="ur-gmail" style={{ color: '#3ecf6e' }} title={info.gmail === null ? 'Google conectado (a permissão do Gmail é conferida quando a pessoa abre o e-mail)' : 'Gmail conectado'}>Conectado</span>;
}

const CELL = { sim: ['Sim', 'ur-yes'], nao: ['Não', 'ur-no'], cadastro: ['Conforme cadastro', 'ur-dep'] };

export function AccessMatrix({ users }) {
  const cols = [...WORK_ROLES, ''];
  const team = users.filter((u) => u.role !== 'cliente' && !u.blocked);
  const people = (role) => team.filter((u) => (u.workRole || '') === role).map((u) => u.name.split(' ')[0]).join(', ') || 'ninguém';
  return (
    <>
      <div className="ur-panel">
        <table className="ur-matrix ur-fixed">
          <thead>
            <tr>
              <th>Módulo</th>
              {cols.map((r) => <th key={r || 'none'} className="ur-c"><WorkRoleBadge role={r} /><div className="ur-people">{people(r)}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                {cols.map((r) => {
                  const [txt, cls] = CELL[ROLE_MATRIX[r][m.key]];
                  return <td key={r || 'none'} className={`ur-c ${cls}`} title={ROLE_MATRIX[r][m.key] === 'cadastro' ? MATRIX_NOTES[m.key] || '' : ''}>{txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ur-legend">"Conforme cadastro" = depende do acesso marcado na ficha da pessoa (Empresas, Gestão de Atividades, XFlow, Acesso ao CRM; Usuários só para o perfil Master). O Super Administrador nunca é trancado por papel.</div>
      </div>
      <div className="ur-panel">
        <table className="ur-matrix">
          <thead>
            <tr><th>Pessoa (ativas)</th><th>Papel</th>{MODULES.map((m) => <th key={m.key} className="ur-c" title={m.label}>{m.label.split(' (')[0]}</th>)}</tr>
          </thead>
          <tbody>
            {team.map((u) => {
              const a = effectiveAccess(u);
              return (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td><WorkRoleBadge role={u.workRole || ''} /></td>
                  {MODULES.map((m) => <td key={m.key} className={`ur-c ${a[m.key] ? 'ur-yes' : 'ur-no'}`}>{a[m.key] ? 'Sim' : 'Não'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const fmtWhen = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtValue = (field, v) => (field === 'work_role' ? workRoleLabel(v) : (v === '' ? 'vazio' : v));

export function RoleHistory({ history, error }) {
  if (error) return <div className="ur-panel" style={{ padding: 14, color: '#e2574c', fontSize: 13 }}>{error}</div>;
  if (!history.length) return <div className="ur-panel" style={{ padding: 14, color: 'var(--text-5)', fontSize: 13 }}>Nenhuma mudança de papel ou acesso registrada ainda.</div>;
  return (
    <div className="ur-panel">
      {history.map((h) => (
        <div key={h.id} className="ur-hist-row">
          <div className="ur-hist-when">{fmtWhen(h.at)}</div>
          <div className="ur-hist-what">
            <strong>{h.userName}</strong> — {h.fieldLabel}: {fmtValue(h.field, h.oldValue)} → <strong>{fmtValue(h.field, h.newValue)}</strong>
            <div className="ur-hist-who">por {h.changedBy}{h.note ? ` · ${h.note}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RoleCards() {
  return (
    <div className="ur-roles-desc">
      {WORK_ROLES.map((r) => (
        <div key={r} className="ur-role-card"><strong style={{ color: WORK_ROLE_META[r].color }}>{WORK_ROLE_META[r].label}</strong>{WORK_ROLE_META[r].desc}</div>
      ))}
    </div>
  );
}
