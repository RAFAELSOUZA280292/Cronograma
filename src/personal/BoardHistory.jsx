import React, { useEffect, useState } from 'react';
import { ChevronLeft, History, RotateCcw, Undo2 } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { SidePanel, fmtTs } from '../App.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { S } from '../styles/S.js';
import { compareWithCurrent, recoverCards } from './boardHistory.js';

const reasonLabel = (r) => {
  if (!r || r === 'automática') return 'Cópia automática';
  if (r === 'antes de restaurar uma versão') return 'Antes de uma restauração';
  const m = /^queda de (\d+) para (\d+) cartões$/.exec(r);
  return m ? `O quadro encolheu: de ${m[1]} para ${m[2]} cartões` : r;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function BoardHistoryPanel({ board, saveState, currentUser, onMutate, onRestored, onClose }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = saveState === 'saving' || saveState === 'retrying';

  useEffect(() => {
    let off = false;
    apiGet('/api/personal-board/versions')
      .then((r) => { if (!off) setVersions(r.versions || []); })
      .catch((e) => { if (!off) setError((e && e.message) || 'Não foi possível carregar o histórico.'); });
    return () => { off = true; };
  }, []);

  async function openVersion(v) {
    setBusy(true);
    try {
      const r = await apiGet(`/api/personal-board/versions/${encodeURIComponent(v.id)}`);
      setOpen({ ...v, board: r.version.board });
    } catch (e) {
      notify((e && e.message) || 'Não foi possível abrir esta cópia.', { tone: 'error' });
    } finally { setBusy(false); }
  }

  function recover(items) {
    const r = recoverCards(board, items, new Date().toISOString(), currentUser && currentUser.name);
    if (!r.moved) { notify(r.lost ? 'O quadro não tem nenhuma coluna para receber os cartões. Crie uma coluna e tente de novo.' : 'Estes cartões já estão no quadro.', { tone: 'error' }); return; }
    onMutate((prev) => recoverCards(prev, items, new Date().toISOString(), currentUser && currentUser.name).board);
    notify(`${plural(r.moved, 'cartão recuperado', 'cartões recuperados')} — na coluna de origem, ou na primeira coluna da página se a original não existe mais.`, { tone: 'success' });
  }

  async function restoreAll() {
    const ok = await askConfirm({
      title: 'Restaurar o quadro inteiro?',
      message: `O quadro volta ao que era em ${fmtTs(open.createdAt)}. Tudo o que foi feito depois dessa hora some da tela, mas o quadro de agora fica guardado aqui como "Antes de uma restauração" — dá para voltar.`,
      confirmLabel: 'Restaurar quadro inteiro', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiPost(`/api/personal-board/versions/${encodeURIComponent(open.id)}/restore`);
      onRestored(r.board, r.updatedAt);
      notify(`Quadro restaurado para ${fmtTs(open.createdAt)}.`, { tone: 'success' });
      onClose();
    } catch (e) {
      notify((e && e.message) || 'Não foi possível restaurar.', { tone: 'error' });
      setBusy(false);
    }
  }

  const diff = open ? compareWithCurrent(open.board, board) : null;
  const byPage = diff ? diff.missing.reduce((acc, it) => { (acc[it.boardName] = acc[it.boardName] || []).push(it); return acc; }, {}) : {};

  return (
    <SidePanel title="Histórico do quadro" onClose={onClose} width="min(620px, 100vw)">
      {!open && (
        <>
          <div style={{ ...S.emptyMuted, marginBottom: 12, lineHeight: 1.5 }}>
            O sistema guarda uma cópia do seu quadro a cada 10 minutos de edição e sempre que ele encolhe de repente. Abra uma cópia para ver o que sumiu de lá para cá e recuperar só o que precisa — ou volte o quadro inteiro. As cópias ficam por 30 dias (as 40 mais recentes).
          </div>
          {error && <div style={{ ...S.emptyMuted, color: '#e2574c' }}>{error}</div>}
          {!error && versions === null && <div style={S.emptyMuted}>Carregando…</div>}
          {versions && versions.length === 0 && <div style={S.emptyMuted}>Ainda não há cópias. A primeira aparece depois de uns 10 minutos de edição.</div>}
          {versions && versions.map((v) => (
            <div key={v.id} style={S.trashRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.trashTitle}>{fmtTs(v.createdAt)}</div>
                <div style={S.trashParent}>{reasonLabel(v.reason)}</div>
                <div style={S.logTs}>{plural(v.pages, 'página', 'páginas')} · {plural(v.cards, 'cartão', 'cartões')}</div>
              </div>
              <button style={S.iconBtn} disabled={busy} onClick={() => openVersion(v)}><History size={14} /> Abrir</button>
            </div>
          ))}
        </>
      )}

      {open && diff && (
        <>
          <button style={{ ...S.iconBtnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, marginBottom: 10 }} onClick={() => setOpen(null)}><ChevronLeft size={14} /> Todas as cópias</button>
          <div style={S.trashTitle}>{fmtTs(open.createdAt)}</div>
          <div style={{ ...S.trashParent, marginBottom: 4 }}>{reasonLabel(open.reason)}</div>
          <div style={{ ...S.logTs, marginBottom: 14 }}>Nesta cópia: {plural(diff.versionCards, 'cartão', 'cartões')} · hoje: {plural(diff.currentCards, 'cartão', 'cartões')}</div>

          {diff.lostPages.length > 0 && (
            <div style={{ ...S.emptyMuted, marginBottom: 12, lineHeight: 1.5 }}>
              {diff.lostPages.length === 1 ? 'Uma página desta cópia não existe mais' : `${diff.lostPages.length} páginas desta cópia não existem mais`}: {diff.lostPages.map((p) => `"${p.name}"`).join(', ')}. Os cartões delas, se recuperados, vão para a primeira coluna que existir.
            </div>
          )}

          {diff.missing.length === 0 ? (
            <div style={{ ...S.emptyMuted, marginBottom: 14, lineHeight: 1.5 }}>Todos os cartões desta cópia continuam no quadro (ou estão na Lixeira / em Concluídas). Não há o que recuperar.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ ...S.trashTitle, flex: 1 }}>{plural(diff.missing.length, 'cartão sumiu', 'cartões sumiram')} do quadro</div>
                <button style={S.iconBtn} disabled={busy} onClick={() => recover(diff.missing)}><Undo2 size={14} /> Recuperar todos</button>
              </div>
              {Object.entries(byPage).map(([page, items]) => (
                <div key={page} style={{ marginBottom: 10 }}>
                  <div style={{ ...S.logTs, textTransform: 'uppercase', letterSpacing: '.04em', margin: '8px 0 2px' }}>{page}</div>
                  {items.map((it) => (
                    <div key={it.card.id} style={S.trashRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.trashTitle}>{it.card.title || '(sem título)'}</div>
                        <div style={S.trashParent}>coluna "{it.columnName}"</div>
                      </div>
                      <button style={S.iconBtn} disabled={busy} onClick={() => recover([it])}><Undo2 size={14} /> Recuperar</button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border-1)', marginTop: 16, paddingTop: 14 }}>
            <div style={{ ...S.emptyMuted, marginBottom: 8, lineHeight: 1.5 }}>
              Prefere voltar tudo como estava? A restauração troca o quadro inteiro por esta cópia — inclusive o que você fez depois.
            </div>
            <button style={{ ...S.iconBtn, color: '#e2574c' }} disabled={busy || saving} title={saving ? 'Espere o quadro terminar de salvar' : undefined} onClick={restoreAll}><RotateCcw size={14} /> Restaurar quadro inteiro</button>
            {saving && <div style={{ ...S.logTs, marginTop: 6 }}>Espere o quadro terminar de salvar para restaurar.</div>}
          </div>
        </>
      )}
    </SidePanel>
  );
}
