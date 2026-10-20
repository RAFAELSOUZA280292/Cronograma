// Janela "Vincular itens à reunião" (2026-10-20): escolhe itens de trabalho de QUALQUER atividade (os "outros squads") para entrarem na pauta de uma reunião.
// Os itens escolhidos vão para a data da reunião e passam a acompanhá-la (ver shared/pauta.js). Não muda o tipo (continuam Trabalho).
import React, { useMemo, useState } from 'react';
import { Modal } from '../ui/dialog.jsx';
import { Button } from '../ui/index.jsx';
import { fmtDate } from '../App.jsx';
import { linkableItems } from '../../shared/pauta.js';

export default function PautaPicker({ activities, meeting, meetingActId, onConfirm, onClose }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState({});
  const items = useMemo(() => linkableItems(activities, meeting.id), [activities, meeting.id]);
  const nq = q.trim().toLowerCase();
  const shown = nq ? items.filter((i) => `${i.title} ${i.actTitle}`.toLowerCase().includes(nq)) : items;
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of shown) { if (!m.has(i.actId)) m.set(i.actId, { title: i.actTitle, same: i.actId === meetingActId, list: [] }); m.get(i.actId).list.push(i); }
    return [...m.values()].sort((a, b) => (b.same - a.same) || a.title.localeCompare(b.title));
  }, [shown, meetingActId]);
  const n = Object.values(pick).filter(Boolean).length;
  const toggleGroup = (g, on) => setPick((p) => { const x = { ...p }; g.list.forEach((i) => { x[i.subId] = on; }); return x; });
  return (
    <Modal title="Vincular itens à reunião" subtitle={`${meeting.title}${meeting.date ? ` · ${fmtDate(meeting.date)}` : ''}`} size="lg" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!n} title={n ? undefined : 'Marque ao menos um item'} onClick={() => { onConfirm(items.filter((i) => pick[i.subId]).map((i) => ({ actId: i.actId, subId: i.subId }))); onClose(); }}>{n ? `Vincular ${n} item${n === 1 ? '' : 's'}` : 'Vincular'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5, color: 'var(--text-2)' }}>
        <div style={{ lineHeight: 1.55 }}>Marque os itens de trabalho que serão tratados nesta reunião, de qualquer frente. Eles <b>vão para a data da reunião</b>{meeting.date ? '' : ' (a reunião ainda não tem data: só o vínculo é feito)'} e acompanham quando ela mudar. Continuam como Trabalho.</div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item ou atividade" aria-label="Buscar item ou atividade" />
        {groups.length === 0 && <div style={{ color: 'var(--text-4)' }}>Nenhum item de trabalho aberto para vincular.</div>}
        {groups.map((g) => {
          const all = g.list.every((i) => pick[i.subId]);
          return (
            <section key={g.title + g.list[0].actId} aria-label={g.title} style={{ border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-3)', fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={all} onChange={(e) => toggleGroup(g, e.target.checked)} aria-label={`Marcar todos de ${g.title}`} /> {g.title}{g.same ? ' (esta atividade)' : ''}
                <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12, color: 'var(--text-5)' }}>{g.list.length} {g.list.length === 1 ? 'item' : 'itens'}</span>
              </label>
              {g.list.map((i) => (
                <label key={i.subId} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderTop: '1px solid var(--border-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!pick[i.subId]} onChange={(e) => setPick({ ...pick, [i.subId]: e.target.checked })} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{i.title}{i.pautaDe ? <span style={{ color: '#e0a21a', fontSize: 11.5 }}> · já está na pauta de outra reunião (vai trocar)</span> : null}</span>
                  <span style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--text-5)' }}>{i.date ? fmtDate(i.date) : 'sem data'}</span>
                </label>
              ))}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
