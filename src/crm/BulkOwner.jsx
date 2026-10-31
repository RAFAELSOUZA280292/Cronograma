// Alterar o responsável de várias linhas de uma vez (Onda 3, U3), dentro da faixa de ações em lote das listas do CRM.
// Cada linha vai pela MESMA rota da tela (PATCH do registro): permissão, auditoria e linha do tempo são as de sempre. Linhas que a pessoa não pode
// editar nem entram no lote (aviso antes de confirmar); falha em uma não impede as outras e o resumo mostra o que não mudou.
import React, { useState } from 'react';
import { UserCog } from 'lucide-react';
import { Button } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { summarizeBatch } from '../ui/tableLogic.js';

export default function BulkOwner({ rows, owners, can, update, noun, onDone }) {
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = rows.filter(can);
  const skipped = rows.length - allowed.length;
  const name = owner === 'none' ? 'Sem responsável' : ((owners.find((o) => o.id === owner) || {}).name || '');
  async function apply() {
    const okGo = await askConfirm({
      title: `Alterar o responsável de ${allowed.length} ${allowed.length === 1 ? noun.one : noun.many}?`,
      message: `O responsável passa a ser “${name}”.${skipped ? ` ${skipped} ${skipped === 1 ? 'linha selecionada não pode' : 'linhas selecionadas não podem'} ser editada${skipped === 1 ? '' : 's'} por você e ficará${skipped === 1 ? '' : 'ão'} de fora.` : ''} Cada alteração fica no histórico do registro.`,
      confirmLabel: 'Alterar',
    });
    if (!okGo) return;
    setBusy(true);
    const results = [];
    for (const r of allowed) {
      try { await update(r, owner === 'none' ? null : owner); results.push({ key: r.id, ok: true }); } catch (e) { results.push({ key: r.id, ok: false, error: (e && e.message) || 'erro' }); }
    }
    setBusy(false);
    const s = summarizeBatch(results, noun);
    notify(s.text, { tone: s.tone });
    setOwner('');
    if (onDone) onDone(s);
  }
  return (
    <>
      <select aria-label="Novo responsável" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={busy}>
        <option value="">Alterar responsável…</option>
        <option value="none">Sem responsável</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <Button size="sm" variant="primary" icon={UserCog} onClick={apply} loading={busy} disabled={!owner || !allowed.length} disabledReason={!allowed.length ? 'Nenhuma linha selecionada pode ser editada por você' : 'Escolha o novo responsável'}>Aplicar</Button>
    </>
  );
}
