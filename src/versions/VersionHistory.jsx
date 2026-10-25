// Histórico de versões do cronograma (§83): consultar, comparar, criar ponto de restauração e restaurar (Master) com confirmação, backup automático e desfazer.
// Ver: Master e PRICETAX. Restaurar: só Master. A captura é automática no servidor (gatilho no banco); aqui só se lê e se pede a restauração.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, Chip, ChipRow, ConfirmDialog, EmptyState, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { notify } from '../ui/dialogs.jsx';

const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const STATUS = { 'nao-iniciado': 'Não iniciado', 'em-andamento': 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
const PRIORITY = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const KIND = { reuniao: 'Reunião' };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export function fmtVal(field, v) {
  if (v === '' || v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (field === 'status') return STATUS[v] || String(v);
  if (field === 'priority') return PRIORITY[v] || String(v);
  if (field === 'kind') return KIND[v] || String(v);
  if (typeof v === 'string' && isoDate.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  if (field === 'comments' || field === 'attachments' || field === 'links') return `${v}`;
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v); return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

const CSS = `
.vh-top { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px; }
.vh-now { font-size:12.5px; color:var(--text-3); }
.vh-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.25fr); gap:14px; align-items:start; }
@media (max-width:860px){ .vh-grid { grid-template-columns:1fr; } }
.vh-col { min-width:0; }
.vh-list { display:flex; flex-direction:column; gap:8px; max-height:60vh; overflow-y:auto; padding-right:2px; }
.vh-item { border:1px solid var(--border-1); background:var(--bg-2); border-radius:10px; padding:10px 12px; }
.vh-item[data-sel="true"] { border-color:#F5C400; }
.vh-item-head { display:flex; justify-content:space-between; gap:8px; align-items:baseline; flex-wrap:wrap; }
.vh-when { font-size:13px; font-weight:800; color:var(--text-1); }
.vh-kind { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; border:1px solid var(--border-2); border-radius:99px; padding:1px 8px; color:var(--text-3); white-space:nowrap; }
.vh-kind.manual { color:#3ecf6e; border-color:rgba(62,207,110,.5); } .vh-kind.pre_restore { color:#3ea6ff; border-color:rgba(62,166,255,.5); } .vh-kind.pre_delete { color:#e2574c; border-color:rgba(226,87,76,.5); }
.vh-who { font-size:12px; color:var(--text-3); margin-top:3px; } .vh-label { font-size:12.5px; color:var(--text-2); margin-top:3px; font-weight:600; }
.vh-touch { font-size:12px; color:var(--text-4); margin-top:4px; line-height:1.4; } .vh-stats { font-size:11.5px; color:var(--text-5); margin-top:4px; }
.vh-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.vh-cmp-pick { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:10px; }
.vh-field { display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:700; color:var(--text-4); } .vh-field select { min-width:180px; max-width:100%; }
.vh-sum { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.vh-pill { font-size:11.5px; font-weight:700; border-radius:99px; padding:3px 10px; background:var(--bg-3); border:1px solid var(--border-1); color:var(--text-2); }
.vh-pill.add { color:#3ecf6e; } .vh-pill.rm { color:#e2574c; } .vh-pill.ch { color:#F5C400; }
.vh-diff { display:flex; flex-direction:column; gap:8px; max-height:52vh; overflow-y:auto; }
.vh-act { border:1px solid var(--border-1); border-radius:10px; background:var(--bg-2); padding:8px 10px; }
.vh-act-title { font-size:13px; font-weight:800; display:flex; gap:8px; align-items:center; flex-wrap:wrap; } .vh-act-title label { display:flex; gap:6px; align-items:center; cursor:pointer; }
.vh-tag { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; border-radius:99px; padding:1px 7px; border:1px solid currentColor; }
.vh-tag.added { color:#3ecf6e; } .vh-tag.removed { color:#e2574c; } .vh-tag.changed, .vh-tag.moved { color:#F5C400; }
.vh-row { display:grid; grid-template-columns:130px minmax(0,1fr) 18px minmax(0,1fr); gap:6px; font-size:12px; padding:3px 0; border-top:1px dashed var(--border-1); align-items:baseline; }
.vh-row:first-of-type { border-top:0; } .vh-row .f { color:var(--text-4); font-weight:700; } .vh-row .b { color:#e2574c; word-break:break-word; } .vh-row .a { color:#3ecf6e; word-break:break-word; } .vh-row .arr { color:var(--text-5); text-align:center; }
@media (max-width:620px){ .vh-row { grid-template-columns:1fr; } .vh-row .arr { display:none; } }
.vh-sub { margin:6px 0 0 12px; padding-left:10px; border-left:2px solid var(--border-2); }
.vh-sub-title { font-size:12px; font-weight:700; color:var(--text-2); display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.vh-note { font-size:12px; color:var(--text-3); line-height:1.5; background:var(--bg-3); border:1px solid var(--border-1); border-radius:8px; padding:8px 10px; margin-bottom:10px; }
.vh-warn { color:#ff9f40; } .vh-ul { margin:4px 0 0; padding-left:18px; } .vh-ul li { font-size:12.5px; line-height:1.5; color:var(--text-2); }
.vh-radio { display:flex; flex-direction:column; gap:6px; margin:8px 0 10px; font-size:13px; } .vh-radio label { display:flex; gap:8px; align-items:flex-start; cursor:pointer; }
.vh-more { display:flex; justify-content:center; margin-top:8px; }
`;

function FieldRows({ fields }) {
  return fields.map((f) => (
    <div className="vh-row" key={f.field}>
      <span className="f">{f.label}</span>
      <span className="b">{fmtVal(f.field, f.before)}</span><span className="arr" aria-hidden="true">→</span>
      <span className="a">{fmtVal(f.field, f.after)}</span>
    </div>
  ));
}
const CHANGE_TAG = { added: 'Criada', removed: 'Removida', changed: 'Alterada', moved: 'Movida' };
const SUB_TAG = { added: 'Criada', removed: 'Removida', changed: 'Alterada', moved: 'Movida' };

export function DiffView({ diff, selectable, selected, onToggle }) {
  const s = diff.summary;
  if (!s.total) return <div className="vh-note">Nenhuma diferença no cronograma entre estes dois momentos.</div>;
  return (
    <>
      <div className="vh-sum">
        {s.activitiesChanged > 0 && <span className="vh-pill ch">{s.activitiesChanged} atividade(s) alterada(s)</span>}
        {s.activitiesAdded > 0 && <span className="vh-pill add">{s.activitiesAdded} criada(s)</span>}
        {s.activitiesRemoved > 0 && <span className="vh-pill rm">{s.activitiesRemoved} removida(s)</span>}
        {(s.subsChanged + s.subsAdded + s.subsRemoved + s.subsMoved) > 0 && <span className="vh-pill">{s.subsChanged} sub alterada(s) · {s.subsAdded} criada(s) · {s.subsRemoved} removida(s){s.subsMoved ? ` · ${s.subsMoved} movida(s)` : ''}</span>}
        {s.phasesChanged > 0 && <span className="vh-pill">{s.phasesChanged} fase(s)</span>}
        {s.teamChanged > 0 && <span className="vh-pill">Equipe: {s.teamChanged}</span>}
        {s.orderChanged && <span className="vh-pill">Ordem das atividades mudou</span>}
      </div>
      <div className="vh-diff">
        {diff.activities.map((a) => (
          <div className="vh-act" key={a.id}>
            <div className="vh-act-title">
              {selectable && a.change !== 'added' ? <label><input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a.id)} aria-label={`Restaurar só ${a.title || a.id}`} /> {a.title || a.id}</label> : <span>{a.title || a.id}</span>}
              <span className={`vh-tag ${a.change}`}>{CHANGE_TAG[a.change]}</span>
            </div>
            {a.fields.length > 0 && <div style={{ marginTop: 4 }}><FieldRows fields={a.fields} /></div>}
            {a.subs.map((x) => (
              <div className="vh-sub" key={x.id}>
                <div className="vh-sub-title">{x.title || x.id} <span className={`vh-tag ${x.change}`}>{SUB_TAG[x.change]}</span>{x.from && <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>vinda de "{x.from.title}"</span>}</div>
                {x.fields.length > 0 && <FieldRows fields={x.fields} />}
              </div>
            ))}
          </div>
        ))}
        {diff.phases.map((p) => (
          <div className="vh-act" key={`ph${p.id}`}>
            <div className="vh-act-title"><span>Fase: {p.name || p.id}</span><span className={`vh-tag ${p.change}`}>{CHANGE_TAG[p.change]}</span></div>
            {p.fields.length > 0 && <FieldRows fields={p.fields} />}
          </div>
        ))}
        {(diff.team.added.length > 0 || diff.team.removed.length > 0) && (
          <div className="vh-act">
            <div className="vh-act-title"><span>Equipe</span></div>
            {diff.team.added.length > 0 && <div className="vh-row"><span className="f">Entrou</span><span className="a" style={{ gridColumn: '2 / -1' }}>{diff.team.added.join(', ')}</span></div>}
            {diff.team.removed.length > 0 && <div className="vh-row"><span className="f">Saiu</span><span className="b" style={{ gridColumn: '2 / -1' }}>{diff.team.removed.join(', ')}</span></div>}
          </div>
        )}
      </div>
    </>
  );
}

function touchedText(t) {
  if (!t) return '';
  const names = (arr, total) => { const list = (arr || []).slice(0, 3).map((x) => x.title || x.id).join(', '); const more = (total || 0) - Math.min(3, (arr || []).length); return list ? `${list}${more > 0 ? ` e mais ${more}` : ''}` : ''; };
  const parts = [];
  if (t.changedCount) parts.push(`Alterou: ${names(t.changed, t.changedCount)}`);
  if (t.addedCount) parts.push(`Criou: ${names(t.added, t.addedCount)}`);
  if (t.removedCount) parts.push(`Removeu: ${names(t.removed, t.removedCount)}`);
  if (t.phases) parts.push('Mudou fases');
  if (t.team) parts.push('Mudou a equipe');
  return parts.join(' · ');
}

// O aviso "Desfazer" pode sobreviver à janela (o app recarrega as empresas e a janela remonta): o evento atualiza a janela que estiver aberta agora.
const CHANGED_EVENT = 'project-history:changed';
const baseUrl = (pid) => `/api/project-history/${encodeURIComponent(pid)}`;
const errText = (e, fb) => (e && e.message) || fb;

export default function VersionHistoryModal({ projectId, companyLabel, onClose, onRestored, flushSave }) {
  const [state, setState] = useState({ loading: true, error: '', versions: [], hasMore: false, current: null, canRestore: false });
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('current');
  const [cmp, setCmp] = useState(null);
  const [cmpErr, setCmpErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState('all');
  const [picked, setPicked] = useState(new Set());
  const [restoreErr, setRestoreErr] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [tick, setTick] = useState(0);

  const load = useCallback(async (more) => {
    setState((s) => ({ ...s, loading: !more, error: '' }));
    try {
      const last = more && state.versions.length ? state.versions[state.versions.length - 1].id : null;
      const r = await apiGet(`${baseUrl(projectId)}/versions?limit=30${last ? `&before=${last}` : ''}${kind ? `&kind=${kind}` : ''}`);
      setState((s) => ({ loading: false, error: '', versions: more ? [...s.versions, ...r.versions] : r.versions, hasMore: r.hasMore, current: r.current, canRestore: r.canRestore }));
    } catch (e) { setState((s) => ({ ...s, loading: false, error: errText(e, 'Não foi possível carregar o histórico.') })); }
  }, [projectId, kind, state.versions.length]);
  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, kind]);
  const refresh = React.useRef(null);
  refresh.current = () => { setTick((t) => t + 1); load(false); };
  useEffect(() => { const on = () => refresh.current && refresh.current(); window.addEventListener(CHANGED_EVENT, on); return () => window.removeEventListener(CHANGED_EVENT, on); }, []);

  useEffect(() => {
    if (!from) { setCmp(null); return; }
    let alive = true;
    setCmpErr('');
    apiGet(`${baseUrl(projectId)}/diff?from=${from}&to=${to}`).then((r) => { if (alive) setCmp(r); }).catch((e) => { if (alive) { setCmp(null); setCmpErr(errText(e, 'Não foi possível comparar.')); } });
    return () => { alive = false; };
  }, [projectId, from, to, tick]);

  const options = useMemo(() => state.versions.map((v) => ({ id: String(v.id), label: `#${v.id} · ${fdt(v.createdAt)} · ${v.kind === 'manual' ? v.label : v.kind === 'pre_restore' ? 'backup antes de restaurar' : `antes da alteração de ${v.actorName}`}` })), [state.versions]);

  async function saveCheckpoint() {
    const name = newLabel.trim();
    if (!name) { notify('Dê um nome ao ponto de restauração.', { tone: 'error' }); return; }
    setBusy(true);
    try { if (flushSave) await flushSave(); await apiPost(`${baseUrl(projectId)}/versions`, { label: name }); setNewLabel(''); notify('Ponto de restauração criado.', { tone: 'success' }); await load(false); } catch (e) { notify(errText(e, 'Não foi possível criar o ponto de restauração.'), { tone: 'error' }); } finally { setBusy(false); }
  }

  async function openRestore(v) {
    setBusy(true); setRestoreErr('');
    try {
      if (flushSave) await flushSave();
      const r = await apiPost(`${baseUrl(projectId)}/versions/${v.id}/restore`, { dryRun: true });
      setPlan({ version: v, ...r }); setMode('all'); setPicked(new Set(r.diff.activities.filter((a) => a.change !== 'added').map((a) => a.id)));
    } catch (e) { notify(errText(e, 'Não foi possível simular a restauração.'), { tone: 'error' }); } finally { setBusy(false); }
  }

  async function doRestore() {
    setBusy(true); setRestoreErr('');
    try {
      const ids = mode === 'some' ? [...picked] : null;
      const r = await apiPost(`${baseUrl(projectId)}/versions/${plan.version.id}/restore`, { confirm: true, ...(ids ? { activityIds: ids } : {}) });
      setConfirming(false); setPlan(null);
      if (onRestored) await onRestored();
      setTick((t) => t + 1);
      await load(false);
      notify(`Versão #${plan.version.id} restaurada. O estado anterior ficou salvo na versão #${r.backupVersionId}.`, { tone: 'success', ttlMs: 14000, actionLabel: 'Desfazer', onAction: () => undoRestore(r.backupVersionId) });
    } catch (e) { setRestoreErr(errText(e, 'Não foi possível restaurar. Nada foi alterado.')); } finally { setBusy(false); }
  }
  async function undoRestore(backupId) {
    try { await apiPost(`${baseUrl(projectId)}/versions/${backupId}/restore`, { confirm: true }); if (onRestored) await onRestored(); window.dispatchEvent(new Event(CHANGED_EVENT)); notify('Restauração desfeita.', { tone: 'success' }); } catch (e) { notify(errText(e, 'Não foi possível desfazer. Use "Restaurar" na versão de backup.'), { tone: 'error' }); }
  }

  const cur = state.current;
  const rep = plan && plan.report;
  const canConfirm = plan && (mode === 'all' || picked.size > 0);

  return (
    <>
    <Modal title="Histórico de versões" subtitle={companyLabel} size="lg" onClose={onClose}>
      <style>{CSS}</style>
      <div className="vh-top">
        <div className="vh-now">{cur ? <>Agora: <b>{cur.activities}</b> atividades, <b>{cur.subs}</b> subatividades ({cur.done} concluídas). Cada alteração guarda o estado anterior automaticamente.</> : ' '}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} placeholder="Nome do ponto de restauração" aria-label="Nome do ponto de restauração" style={{ minWidth: 220 }} onKeyDown={(e) => { if (e.key === 'Enter') saveCheckpoint(); }} />
          <Button onClick={saveCheckpoint} disabled={busy || !newLabel.trim()} disabledReason={busy ? 'Aguarde terminar' : 'Dê um nome ao ponto'}>Criar ponto agora</Button>
        </div>
      </div>
      <ChipRow label="Tipo de versão">
        {[['', 'Todas'], ['manual', 'Pontos criados'], ['pre_restore', 'Backups de restauração'], ['auto', 'Automáticas']].map(([k, l]) => <Chip key={k || 'all'} active={kind === k} onClick={() => setKind(k)}>{l}</Chip>)}
      </ChipRow>
      <div className="vh-grid" style={{ marginTop: 12 }}>
        <div className="vh-col">
          {state.loading && <SkeletonCards count={4} height={70} />}
          {state.error && <ErrorState message={state.error} onRetry={() => load(false)} compact />}
          {!state.loading && !state.error && state.versions.length === 0 && <EmptyState icon={History} title="Ainda sem versões" description="A primeira alteração no cronograma cria a primeira versão (o estado de antes dela)." compact />}
          <div className="vh-list">
            {state.versions.map((v) => (
              <div className="vh-item" key={v.id} data-sel={String(String(v.id) === from)}>
                <div className="vh-item-head"><span className="vh-when">{fdt(v.createdAt)}</span><span className={`vh-kind ${v.kind}`}>{{ auto: 'Automática', manual: 'Ponto criado', pre_restore: 'Backup', pre_delete: 'Antes de excluir' }[v.kind]}</span></div>
                {v.kind === 'auto' && <div className="vh-who">Estado de antes da alteração de <b>{v.actorName}</b></div>}
                {v.kind === 'manual' && <><div className="vh-label">{v.label}</div><div className="vh-who">por {v.actorName}</div></>}
                {v.kind === 'pre_restore' && <><div className="vh-label">{v.label}</div><div className="vh-who">por {v.actorName}</div></>}
                {v.kind === 'auto' && touchedText(v.touched) && <div className="vh-touch">{touchedText(v.touched)}</div>}
                <div className="vh-stats">Versão #{v.id} · {v.stats.activities} atividades · {v.stats.subs} sub · {v.stats.done} concluídas{v.kind === 'auto' && v.origin ? ` · ${v.origin.replace(/^API /, 'API ').replace('/api/', '/').slice(0, 60)}` : ''}</div>
                <div className="vh-actions">
                  <Button size="sm" onClick={() => { setFrom(String(v.id)); setTo('current'); }}>Comparar com o atual</Button>
                  {state.canRestore && <Button size="sm" variant="primary" onClick={() => openRestore(v)} disabled={busy} disabledReason="Aguarde terminar">Restaurar…</Button>}
                </div>
              </div>
            ))}
          </div>
          {state.hasMore && <div className="vh-more"><Button size="sm" onClick={() => load(true)}>Mostrar versões mais antigas</Button></div>}
        </div>
        <div className="vh-col">
          <div className="vh-cmp-pick">
            <label className="vh-field">De (antes)
              <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Versão de origem da comparação"><option value="">Escolha uma versão…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
            <label className="vh-field">Para (depois)
              <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Versão de destino da comparação"><option value="current">Estado atual</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
          </div>
          {!from && <div className="vh-note">Escolha uma versão para ver exatamente o que mudou: atividade por atividade, com o valor de antes (vermelho) e o de depois (verde). "Versão" é o estado do cronograma <b>antes</b> de uma alteração.</div>}
          {cmpErr && <ErrorState message={cmpErr} compact />}
          {cmp && <><div className="vh-note"><b>{cmp.from.label}</b> ({cmp.from.stats.activities} atividades, {cmp.from.stats.subs} sub) → <b>{cmp.to.label}</b> ({cmp.to.stats.activities} atividades, {cmp.to.stats.subs} sub)</div><DiffView diff={cmp.diff} /></>}
        </div>
      </div>

    </Modal>

      {plan && !confirming && (
        <Modal title={`Restaurar a versão #${plan.version.id}?`} subtitle={fdt(plan.version.createdAt)} size="lg" onClose={() => setPlan(null)} busy={busy}
          footer={<><Button onClick={() => setPlan(null)} disabled={busy}>Cancelar</Button><Button variant="primary" onClick={() => setConfirming(true)} disabled={!canConfirm} disabledReason="Escolha ao menos uma atividade">Continuar</Button></>}>
          <div className="vh-note">Nada foi alterado ainda. Abaixo está o que mudaria <b>em relação ao cronograma de agora</b>. Antes de restaurar, o estado atual é salvo automaticamente e dá para desfazer.</div>
          <div className="vh-radio" role="radiogroup" aria-label="Quanto restaurar">
            <label><input type="radio" name="vh-mode" checked={mode === 'all'} onChange={() => setMode('all')} /> <span><b>Cronograma inteiro</b> (atividades, subatividades, fases e equipe). O que foi criado depois vai para a lixeira, não é apagado; comentários e anexos de hoje são mantidos.</span></label>
            <label><input type="radio" name="vh-mode" checked={mode === 'some'} onChange={() => setMode('some')} /> <span><b>Só as atividades marcadas</b> abaixo; o resto fica como está.</span></label>
          </div>
          {rep && (rep.activitiesToTrash > 0 || rep.subsToTrash > 0 || rep.fixes.length > 0 || rep.warnings.length > 0 || rep.preservedCollaboration > 0) && mode === 'all' && (
            <ul className="vh-ul">
              {rep.activitiesToTrash > 0 && <li>{rep.activitiesToTrash} atividade(s) criada(s) depois irão para a Lixeira (voltam de lá a qualquer momento).</li>}
              {rep.subsToTrash > 0 && <li>{rep.subsToTrash} subatividade(s) criada(s) depois irão para a Lixeira.</li>}
              {rep.preservedCollaboration > 0 && <li>{rep.preservedCollaboration} comentário(s)/anexo(s)/link(s) de hoje serão mantidos.</li>}
              {rep.fixes.map((f, i) => <li key={`f${i}`} className="vh-warn">{f}</li>)}
              {rep.warnings.map((f, i) => <li key={`w${i}`} className="vh-warn">{f}</li>)}
            </ul>
          )}
          <div style={{ marginTop: 10 }}><DiffView diff={plan.diff} selectable={mode === 'some'} selected={picked} onToggle={(id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })} /></div>
        </Modal>
      )}
      {plan && confirming && (
        <ConfirmDialog title={`Restaurar a versão #${plan.version.id}`} confirmLabel="Restaurar agora" danger requireText="RESTAURAR" busy={busy} error={restoreErr}
          message={<>O cronograma de <b>{companyLabel}</b> {mode === 'all' ? 'inteiro' : `(${picked.size} atividade(s))`} volta ao estado de {fdt(plan.version.createdAt)}. O estado de agora é salvo antes numa versão de backup e a restauração pode ser desfeita. Quem está com a empresa aberta verá a mudança em poucos segundos.</>}
          onCancel={() => { if (!busy) setConfirming(false); }} onConfirm={doRestore} />
      )}
    </>
  );
}

// Master: empresas excluídas que ainda podem voltar (guardamos o documento inteiro da empresa na exclusão).
export function DeletedCompaniesModal({ onClose, onRestored }) {
  const [state, setState] = useState({ loading: true, error: '', items: [] });
  const [busyId, setBusyId] = useState(null);
  const [target, setTarget] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try { const r = await apiGet('/api/project-history/deleted/list'); setState({ loading: false, error: '', items: r.deleted }); } catch (e) { setState({ loading: false, error: errText(e, 'Não foi possível carregar.'), items: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function recreate() {
    setBusyId(target.versionId); setErr('');
    try {
      const r = await apiPost(`/api/project-history/deleted/${target.versionId}/restore`, { confirm: true });
      setTarget(null); if (onRestored) await onRestored();
      notify(`Empresa "${target.companyName || 'sem nome'}" recriada. ${r.note}`, { tone: 'success', ttlMs: 12000 });
      await load();
    } catch (e) { setErr(errText(e, 'Não foi possível recriar a empresa.')); } finally { setBusyId(null); }
  }
  return (
    <Modal title="Empresas excluídas" subtitle="Dá para recriar com o cronograma, reuniões e comentários como estavam" size="md" onClose={onClose}>
      <style>{CSS}</style>
      <div className="vh-note">Guardamos uma cópia da empresa no momento da exclusão (por 1 ano). Links públicos, dossiês e reservas de agenda dela são apagados junto com a exclusão e precisam ser refeitos.</div>
      {state.loading && <SkeletonCards count={3} height={60} />}
      {state.error && <ErrorState message={state.error} onRetry={load} compact />}
      {!state.loading && !state.error && state.items.length === 0 && <EmptyState icon={History} title="Nenhuma empresa excluída para recuperar" compact />}
      <div className="vh-list">
        {state.items.map((d) => (
          <div className="vh-item" key={d.versionId}>
            <div className="vh-item-head"><span className="vh-when">{d.companyName || 'Sem nome'}</span><span className="vh-kind pre_delete">Excluída</span></div>
            <div className="vh-who">Excluída em {fdt(d.deletedAt)} por <b>{d.deletedBy}</b></div>
            <div className="vh-stats">{d.stats.activities} atividades · {d.stats.subs} sub · {d.stats.done} concluídas</div>
            <div className="vh-actions"><Button size="sm" variant="primary" onClick={() => { setErr(''); setTarget(d); }} disabled={busyId !== null} disabledReason="Aguarde terminar">Recriar empresa…</Button></div>
          </div>
        ))}
      </div>
      {target && <ConfirmDialog title="Recriar a empresa?" confirmLabel="Recriar empresa" busy={busyId !== null} error={err} message={<>A empresa <b>{target.companyName || 'sem nome'}</b> volta com o mesmo endereço, cronograma, reuniões, tarefas e comentários da hora em que foi excluída.</>} onCancel={() => { if (busyId === null) setTarget(null); }} onConfirm={recreate} />}
    </Modal>
  );
}
