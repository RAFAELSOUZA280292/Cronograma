// Aba "Triagem" (2026-10-20, pedido do Rafael, a partir do painel que usou na ALCAST): para cada atividade ("reunião mestre" ou frente) e cada subatividade, decidir
// REUNIÃO ou TRABALHO e a DATA (ou deixar sem data). Reunião = call com gente junto ao mesmo tempo: vai para "Reservar na agenda" e só pode haver uma por dia na empresa.
// Edita os mesmos campos do cronograma (`kind` e `date`), pelas mesmas funções do resto do app: nada é gravado em outro lugar.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, X } from 'lucide-react';
import { fmtDate, todayISOStr } from '../App.jsx';
import { meetingConflicts } from '../../shared/calendarDays.js';

const CSS = `
  .tg-wrap { max-width: 980px; }
  .tg-sum { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 12px; }
  .tg-card { background:var(--bg-3); border:1px solid var(--border-2); border-radius:10px; padding:8px 14px; font-size:12px; color:var(--text-4); min-width:96px; }
  .tg-card b { display:block; font-size:22px; font-weight:700; color:var(--text-1); font-variant-numeric:tabular-nums; }
  .tg-card.warn b { color:#e0a21a; }
  .tg-bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:0 0 12px; font-size:13px; color:var(--text-3); }
  .tg-bar label { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
  .tg-leg { font-size:12.5px; color:var(--text-4); line-height:1.55; margin:0 0 12px; }
  .tg-g { border:1px solid var(--border-2); border-radius:12px; margin:0 0 10px; overflow:hidden; background:var(--bg-2); }
  .tg-h { display:flex; align-items:center; gap:10px; padding:9px 12px; background:var(--bg-3); flex-wrap:wrap; }
  .tg-h .ti { font-size:14px; font-weight:700; color:var(--text-1); background:none; border:0; padding:0; cursor:pointer; text-align:left; font-family:inherit; }
  .tg-h .ti:hover { text-decoration:underline; }
  .tg-h .pe { margin-left:auto; font-size:12px; color:var(--text-5); }
  .tg-r { display:flex; align-items:center; gap:10px; padding:7px 12px; border-top:1px solid var(--border-2); font-size:13px; flex-wrap:wrap; }
  .tg-r.conf { background:rgba(224,162,26,.10); }
  .tg-r .tt { flex:1 1 260px; min-width:0; line-height:1.35; color:var(--text-2); overflow-wrap:anywhere; }
  .tg-r .tt .w { display:flex; gap:5px; align-items:flex-start; font-size:11.5px; color:#e0a21a; margin-top:2px; }
  .tg-r .late { color:#e2574c; font-size:11px; font-weight:700; margin-left:6px; }
  .tg-d { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
  .tg-d input[type=date] { font-size:12px; padding:3px 6px; width:132px; border-radius:7px; }
  .tg-d .nd { font-size:11.5px; color:var(--text-5); font-style:italic; }
  .tg-x { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-4); border-radius:6px; cursor:pointer; padding:0; }
  .tg-x:hover { color:var(--text-1); border-color:var(--border-3); }
  .tg-sg { display:inline-flex; flex:0 0 auto; }
  .tg-sg button { font:inherit; font-size:12px; padding:4px 10px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-3); cursor:pointer; margin-left:-1px; }
  .tg-sg button:first-child { border-radius:7px 0 0 7px; margin-left:0; }
  .tg-sg button:last-child { border-radius:0 7px 7px 0; }
  .tg-sg button.on-R { background:rgba(245,196,0,.16); color:var(--text-1); border-color:var(--ui-accent, #F5C400); font-weight:700; position:relative; z-index:1; }
  .tg-sg button.on-T { background:rgba(62,207,110,.14); color:var(--text-1); border-color:rgba(62,207,110,.6); font-weight:700; position:relative; z-index:1; }
  .tg-sg button:focus-visible, .tg-x:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .tg-sg button, .tg-x { min-height:44px; } .tg-x { width:44px; } .tg-d input[type=date] { min-height:44px; width:150px; font-size:16px; } }
`;

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dayLabel = (d) => `${DOW[new Date(`${d}T00:00:00`).getDay()]} ${fmtDate(d)}`;
const plusDays = (iso, n) => { const x = new Date(`${iso}T00:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

function Seg({ value, onChange, label }) {
  return (
    <div className="tg-sg" role="group" aria-label={label}>
      {[['reuniao', 'Reunião', 'R'], ['trabalho', 'Trabalho', 'T']].map(([v, l, k]) => (
        <button key={v} type="button" className={value === v ? `on-${k}` : ''} aria-pressed={value === v} onClick={() => value !== v && onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export default function CompanyTriage({ project, updateActivity, updateSub, openDetail, onReserve, pushUndoToast }) {
  const pid = project.id;
  const today = todayISOStr();
  const [range, setRange] = useState('60');
  const [showDone, setShowDone] = useState(false);
  const [onlyMeetings, setOnlyMeetings] = useState(false);
  const hi = plusDays(today, 60);

  const conflicts = useMemo(() => meetingConflicts(project, today), [project, today]);
  const conflictOf = useMemo(() => {
    const m = new Map();
    for (const c of conflicts) for (const i of c.items) m.set(i.key, c);
    return m;
  }, [conflicts]);

  const groups = useMemo(() => {
    const inRange = (d) => range === 'all' || (d && d <= hi);
    return (project.activities || []).filter((a) => !a.deleted).slice().sort((x, y) => (x.date || '9').localeCompare(y.date || '9') || (x.title || '').localeCompare(y.title || '')).map((a) => {
      const subs = (a.subactivities || []).filter((s) => !s.deleted).filter((s) => {
        if (s.done && !showDone) return false;
        if (range === 'semdata') return !s.date;
        if (!s.date) return true;
        return inRange(s.date);
      }).filter((s) => !onlyMeetings || s.kind === 'reuniao').sort((x, y) => (x.date || '9').localeCompare(y.date || '9'));
      const open = a.status !== 'concluido' || showDone;
      const end = a.endDate || a.date || '';
      const actShown = range !== 'semdata' && open && (!onlyMeetings || a.kind === 'reuniao') && (range === 'all' || (a.date && a.date <= hi && (!end || end >= today)));
      return { a, subs, actShown };
    }).filter((g) => g.subs.length || g.actShown);
  }, [project.activities, range, showDone, onlyMeetings, hi, today]);

  const counts = useMemo(() => {
    let r = 0, t = 0, nd = 0;
    for (const a of project.activities || []) {
      if (a.deleted) continue;
      if (a.status !== 'concluido') { if (a.kind === 'reuniao') r += 1; else t += 1; }
      for (const s of a.subactivities || []) {
        if (s.deleted || s.done) continue;
        if (s.kind === 'reuniao') r += 1; else t += 1;
        if (!s.date) nd += 1;
      }
    }
    return { r, t, nd };
  }, [project.activities]);

  async function clearDate(a, s) {
    const prev = s.date;
    updateSub(pid, a.id, s.id, { date: '' });
    if (pushUndoToast) pushUndoToast(`Data de "${s.title}" removida.`, () => updateSub(pid, a.id, s.id, { date: prev }), 8000);
  }

  return (
    <div className="tg-wrap">
      <style>{CSS}</style>
      <p className="tg-leg">Para cada item, escolha <b>Reunião</b> (call com gente junto ao mesmo tempo: vai para "Reservar na agenda" e só pode haver <b>uma por dia</b> na empresa) ou <b>Trabalho</b> (execução nossa, pode repetir dia), e a <b>data</b> (ou tire a data com o ✕ para deixar sem data). A atividade em cima é a reunião mestre ou a frente; embaixo ficam as subatividades.</p>
      <div className="tg-sum">
        <div className="tg-card"><b>{counts.r}</b>reuniões abertas</div>
        <div className="tg-card"><b>{counts.t}</b>trabalho aberto</div>
        <div className="tg-card"><b>{counts.nd}</b>subatividades sem data</div>
        <div className={`tg-card${conflicts.length ? ' warn' : ''}`}><b>{conflicts.length}</b>dias com 2+ reuniões</div>
      </div>
      <div className="tg-bar">
        <label>Período
          <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Período">
            <option value="60">Próximos 2 meses</option>
            <option value="all">Tudo</option>
            <option value="semdata">Só sem data</option>
          </select>
        </label>
        <label><input type="checkbox" checked={onlyMeetings} onChange={(e) => setOnlyMeetings(e.target.checked)} /> Só reuniões</label>
        <label><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Mostrar concluídas</label>
        <button type="button" className="tg-x" style={{ width: 'auto', padding: '0 12px', height: 30, marginLeft: 'auto', gap: 6, color: 'var(--text-1)', fontWeight: 700, fontSize: 12.5 }} onClick={onReserve} title="Abrir a reserva de agenda com as reuniões deste cronograma"><CalendarCheck size={14} aria-hidden="true" /> Reservar na agenda</button>
      </div>
      {groups.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Nada para mostrar neste período.</div>}
      {groups.map(({ a, subs, actShown }) => {
        const ac = a.kind === 'reuniao' && a.status !== 'concluido' ? conflictOf.get(a.id) : null;
        return (
          <section key={a.id} className="tg-g" aria-label={a.title}>
            <div className="tg-h">
              <button type="button" className="ti" onClick={() => openDetail && openDetail(pid, a.id)} title="Abrir a atividade">{a.title}</button>
              {actShown && <Seg value={a.kind === 'reuniao' ? 'reuniao' : 'trabalho'} label={`Tipo da atividade ${a.title}`} onChange={(v) => updateActivity(pid, a.id, { kind: v }, `Tipo alterado em "${a.title}": ${v === 'reuniao' ? 'Reunião' : 'Trabalho'}`)} />}
              <span className="pe">{a.date ? `${fmtDate(a.date)}${a.endDate && a.endDate !== a.date ? ` a ${fmtDate(a.endDate)}` : ''}` : 'sem data'}</span>
            </div>
            {ac && <div className="tg-r conf"><span className="tt"><span className="w"><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />Outra reunião em {dayLabel(ac.day)}: {ac.items.filter((i) => i.key !== a.id).map((i) => i.title).join('; ')}</span></span></div>}
            {subs.map((s) => {
              const key = `${a.id}#${s.id}`;
              const c = s.kind === 'reuniao' && !s.done ? conflictOf.get(key) : null;
              const late = s.date && s.date < today && !s.done;
              return (
                <div key={s.id} className={`tg-r${c ? ' conf' : ''}`}>
                  <div className="tg-d">
                    {s.date ? (
                      <>
                        <input type="date" value={s.date} onChange={(e) => e.target.value && updateSub(pid, a.id, s.id, { date: e.target.value })} aria-label={`Data de ${s.title}`} />
                        <button type="button" className="tg-x" onClick={() => clearDate(a, s)} aria-label={`Deixar "${s.title}" sem data`} title="Deixar sem data"><X size={13} aria-hidden="true" /></button>
                      </>
                    ) : (
                      <>
                        <span className="nd">sem data</span>
                        <input type="date" value="" onChange={(e) => e.target.value && updateSub(pid, a.id, s.id, { date: e.target.value })} aria-label={`Definir a data de ${s.title}`} title="Definir a data" />
                      </>
                    )}
                  </div>
                  <span className="tt">
                    <span style={s.done ? { textDecoration: 'line-through', color: 'var(--text-5)' } : undefined}>{s.title}</span>
                    {late && <span className="late">atrasada</span>}
                    {c && <span className="w"><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />Outra reunião no mesmo dia ({dayLabel(c.day)}): {c.items.filter((i) => i.key !== key).map((i) => i.title).join('; ')}</span>}
                  </span>
                  <Seg value={s.kind === 'reuniao' ? 'reuniao' : 'trabalho'} label={`Tipo de ${s.title}`} onChange={(v) => updateSub(pid, a.id, s.id, { kind: v })} />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
