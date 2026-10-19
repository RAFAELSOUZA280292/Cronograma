// Faixa do cronograma padrão (2026-10-19), no alto da tela de empresa quando o que está aberto é o padrão: versão atual, estado do rascunho, kickoff de referência,
// "Salvar nova versão", "Descartar alterações", histórico de versões e "Voltar às empresas". Versão só nasce por ação explícita (nunca a cada tecla).
import React, { useEffect, useState } from 'react';
import { ArrowLeft, History, Save, Undo2 } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sumDiff = (d) => {
  const parts = [];
  const a = d.activities; const s = d.subs;
  if (a.added) parts.push(plural(a.added, 'atividade nova', 'atividades novas'));
  if (a.removed) parts.push(plural(a.removed, 'atividade removida', 'atividades removidas'));
  if (a.changed) parts.push(plural(a.changed, 'atividade alterada', 'atividades alteradas'));
  if (s.added) parts.push(plural(s.added, 'subatividade nova', 'subatividades novas'));
  if (s.removed) parts.push(plural(s.removed, 'subatividade removida', 'subatividades removidas'));
  if (s.changed) parts.push(plural(s.changed, 'subatividade alterada', 'subatividades alteradas'));
  return parts.length ? parts.join(' · ') : 'Só ajustes de fases, equipe ou kickoff';
};

const CSS = `
  .spb { margin:10px 16px 0; padding:10px 12px; background:var(--bg-2); border:1px solid rgba(245,196,0,.45); border-radius:12px; display:flex; flex-direction:column; gap:8px; }
  .spb-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; }
  .spb-title { font-weight:800; font-size:14px; color:var(--text-1); }
  .spb-ver { font-size:11.5px; font-weight:800; color:#17171f; background:#F5C400; border-radius:999px; padding:2px 10px; }
  .spb-state { font-size:12.5px; color:var(--text-3); }
  .spb-state.dirty { color:#ff9f40; font-weight:700; }
  .spb-grow { flex:1 1 20px; }
  .spb-kick { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-4); }
  .spb-kick input { background:var(--bg-3); border:1px solid var(--border-2); border-radius:8px; color:var(--text-1); padding:5px 8px; font-size:12.5px; }
  .spb-note { font-size:12px; color:var(--text-4); line-height:1.5; }
  .spb-list { display:flex; flex-direction:column; gap:8px; font-size:13px; color:var(--text-2); }
  .spb-v { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:4px; }
  .spb-v.cur { border-color:rgba(245,196,0,.55); }
  .spb-vt { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .spb-vn { font-weight:800; font-size:15px; color:var(--text-1); }
  .spb-meta { font-size:12px; color:var(--text-4); }
  .spb-chip { font-size:10.5px; font-weight:700; border-radius:999px; padding:1px 8px; border:1px solid var(--border-2); color:var(--text-3); }
  .spb-chip.cur { color:#F5C400; border-color:rgba(245,196,0,.6); }
  .spb details summary { cursor:pointer; font-size:12px; color:var(--text-3); }
  .spb details ul { margin:4px 0 0; padding-left:18px; font-size:12px; color:var(--text-3); line-height:1.55; }
  .spb-ta { width:100%; min-height:84px; resize:vertical; background:var(--bg-3); border:1px solid var(--border-2); border-radius:8px; color:var(--text-1); padding:8px 10px; font:inherit; font-size:13px; box-sizing:border-box; }
  .spb-ta:focus { outline:none; border-color:#F5C400; }
  .spb-err { color:#e2574c; font-size:12.5px; }
  .spb-actions { display:flex; flex-wrap:wrap; gap:8px; }
  body:has(.spb-modal) .asst-fab { display:none !important; }
  @media (max-width: 767px) { .spb { margin:8px 12px 0; } .spb-kick input { min-height:44px; } }
`;

function Lines({ diff }) {
  if (!diff || !diff.lines || !diff.lines.length) return null;
  return (
    <details>
      <summary>Ver o que mudou ({diff.lines.length}{diff.lines.length >= 40 ? '+' : ''})</summary>
      <ul>{diff.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>
  );
}

function SaveModal({ nextLabelHint, fetchDiff, onSave, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchDiff().then(setInfo).catch((e) => setError((e && e.message) || 'Não foi possível preparar o resumo das alterações.')); }, []);
  async function save() {
    setBusy(true); setError('');
    try { await onSave(note.trim()); onClose(); } catch (e) { setError((e && e.message) || 'Não foi possível salvar a versão.'); setBusy(false); }
  }
  return (
    <Modal title="Salvar nova versão" subtitle={`Vai virar a versão ${info ? info.nextLabel : nextLabelHint}`} size="md" onClose={busy ? () => {} : onClose}
      footer={<div className="spb-actions"><Button onClick={onClose} disabled={busy} title={busy ? 'Salvando…' : undefined}>Cancelar</Button><Button variant="primary" onClick={save} disabled={busy || !info} title={busy ? 'Salvando…' : !info ? 'Preparando o resumo…' : undefined}>{busy ? 'Salvando…' : 'Salvar versão'}</Button></div>}>
      <style>{CSS}</style>
      <div className="spb-list spb-modal">
        {!info && !error && <SkeletonCards count={1} />}
        {info && <div><b>O que muda em relação à versão atual:</b><br />{sumDiff(info.diff)}<Lines diff={info.diff} /></div>}
        <div className="spb-meta">Toda empresa nova passa a nascer com esta versão. As empresas que já existem não mudam. As versões anteriores ficam guardadas no histórico.</div>
        <label htmlFor="spb-note" style={{ fontWeight: 700, fontSize: 12.5 }}>O que mudou, em uma frase (opcional)</label>
        <textarea id="spb-note" className="spb-ta" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ex.: Ajustei os prazos de Compras e acrescentei a atividade de Treinamento." />
        {error && <div className="spb-err" role="alert">{error}</div>}
      </div>
    </Modal>
  );
}

function VersionsModal({ fetchVersions, fetchProposals, dirty, onRestore, onLoadProposal, onClose }) {
  const [versions, setVersions] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [error, setError] = useState('');
  const load = () => { setVersions(null); setError(''); fetchVersions().then(setVersions).catch((e) => setError((e && e.message) || 'Não foi possível carregar as versões.')); };
  useEffect(load, []);
  useEffect(() => { fetchProposals().then(setProposals).catch(() => setProposals([])); }, []);
  async function loadProposal(p) {
    const ok = await askConfirm({ title: `Carregar a ${p.label}?`, message: dirty ? 'O rascunho atual, com alterações não salvas, será substituído. Nenhuma versão salva é alterada.' : 'O rascunho passa a ser esta proposta. Nenhuma versão salva é alterada; ela só vira versão quando você salvar.', confirmLabel: 'Carregar no rascunho' });
    if (!ok) return;
    try { await onLoadProposal(p.key, p.label); onClose(); } catch (e) { notify((e && e.message) || 'Não foi possível carregar a proposta.', { tone: 'error' }); }
  }
  async function restore(v) {
    const ok = await askConfirm({ title: `Carregar a versão ${v.label}?`, message: dirty ? 'O rascunho atual, com alterações não salvas, será substituído. Nada que já foi salvo como versão se perde.' : 'O rascunho passa a ser uma cópia desta versão. Ao salvar, vira uma versão nova; a versão atual continua guardada.', confirmLabel: 'Carregar no rascunho' });
    if (!ok) return;
    try { await onRestore(v.version); onClose(); } catch (e) { notify((e && e.message) || 'Não foi possível carregar a versão.', { tone: 'error' }); }
  }
  return (
    <Modal title="Versões do cronograma padrão" subtitle="A mais recente é a que as empresas novas seguem" size="lg" width="min(760px, 100%)" onClose={onClose}>
      <style>{CSS}</style>
      <div className="spb-list spb-modal">
        {!versions && !error && <SkeletonCards count={3} />}
        {error && <ErrorState title="Não foi possível carregar" message={error} onRetry={load} />}
        {proposals.map((p) => (
          <div className="spb-v" key={p.key} style={{ borderStyle: 'dashed' }}>
            <div className="spb-vt">
              <span className="spb-vn">{p.label}</span>
              <span className="spb-chip">Proposta, ainda não é versão</span>
              <span className="spb-grow" />
              <Button onClick={() => loadProposal(p)}>Carregar no rascunho</Button>
            </div>
            <div>{p.description}</div>
            <div className="spb-meta">{p.counts ? `${plural(p.counts.activities, 'atividade', 'atividades')} · ${plural(p.counts.subs, 'subatividade', 'subatividades')}` : ''}</div>
          </div>
        ))}
        {versions && versions.map((v) => (
          <div className={`spb-v${v.current ? ' cur' : ''}`} key={v.version}>
            <div className="spb-vt">
              <span className="spb-vn">{v.label}</span>
              {v.current && <span className="spb-chip cur">Atual</span>}
              <span className="spb-meta">{fdt(v.createdAt)} · {v.createdBy}</span>
              <span className="spb-grow" />
              {!v.current && <Button onClick={() => restore(v)}>Carregar no rascunho</Button>}
            </div>
            {v.note && <div>{v.note}</div>}
            <div className="spb-meta">{v.counts ? `${plural(v.counts.activities, 'atividade', 'atividades')} · ${plural(v.counts.subs, 'subatividade', 'subatividades')}` : ''}{v.diff && !v.seed ? ` · ${sumDiff(v.diff)}` : ''}</div>
            {v.diff && !v.seed && <Lines diff={v.diff} />}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function StandardPlanBar({ info, project, actions }) {
  const [modal, setModal] = useState('');
  const [busy, setBusy] = useState(false);
  if (!info || !project) return null;
  const cur = info.current;
  const nextHint = `${(cur.version || 1) + 1}.0`;
  async function discard() {
    const ok = await askConfirm({ title: 'Descartar as alterações?', message: `O rascunho volta a ser igual à versão ${cur.label}. O que já foi salvo como versão não é afetado.`, confirmLabel: 'Descartar', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await actions.discardStandardDraft(); } catch (e) { notify((e && e.message) || 'Não foi possível descartar agora.', { tone: 'error' }); }
    setBusy(false);
  }
  return (
    <div className="no-print spb">
      <style>{CSS}</style>
      <div className="spb-row">
        <span className="spb-title">Cronograma padrão</span>
        <span className="spb-ver" title="Versão que as empresas novas seguem hoje">Versão atual {cur.label}</span>
        <span className={`spb-state${info.dirty ? ' dirty' : ''}`} role="status">{info.dirty ? 'Rascunho com alterações ainda não salvas como versão' : `Sem alterações em relação à ${cur.label}`}</span>
        <span className="spb-grow" />
        <Button onClick={() => setModal('versions')}><History size={14} /> Versões</Button>
        <Button onClick={discard} disabled={!info.dirty || busy} title={!info.dirty ? 'Não há alterações para descartar' : busy ? 'Descartando…' : undefined}><Undo2 size={14} /> Descartar alterações</Button>
        <Button variant="primary" onClick={() => setModal('save')} disabled={!info.dirty || busy} title={!info.dirty ? 'Altere algo para poder salvar uma versão nova' : undefined}><Save size={14} /> Salvar nova versão</Button>
        <Button onClick={actions.closeStandardPlan}><ArrowLeft size={14} /> Voltar às empresas</Button>
      </div>
      <div className="spb-row">
        <label className="spb-kick">Kickoff de referência (D+0)
          <input type="date" value={project.kickoffDate || ''} onChange={(e) => actions.setStandardKickoff(e.target.value)} aria-label="Kickoff de referência do cronograma padrão" />
        </label>
        <span className="spb-note">Cada data aqui vira “dias depois do kickoff”: ao cadastrar uma empresa, você informa o kickoff dela e as datas são recalculadas. Mudar este campo move o padrão inteiro.</span>
      </div>
      {modal === 'save' && <SaveModal nextLabelHint={nextHint} fetchDiff={actions.fetchStandardDiff} onSave={actions.saveStandardVersion} onClose={() => setModal('')} />}
      {modal === 'versions' && <VersionsModal fetchVersions={actions.fetchStandardVersions} fetchProposals={actions.fetchStandardProposals} dirty={info.dirty} onRestore={actions.restoreStandardVersion} onLoadProposal={actions.loadStandardProposal} onClose={() => setModal('')} />}
    </div>
  );
}
