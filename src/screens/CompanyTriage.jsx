// Aba "Triagem" (2026-10-20, pedido do Rafael, a partir do painel de classificação que usou na ALCAST): para cada atividade ("reunião mestre" ou frente) e cada subatividade,
// decidir REUNIÃO ou TRABALHO e a DATA (ou deixar sem data). Reunião = call com gente junto ao mesmo tempo: vai para "Reservar na agenda" e só pode haver uma por dia na empresa.
// Duas visões dos mesmos dados: LISTA (por atividade) e CALENDÁRIO (mês, com filtro Ambos/Reunião/Trabalho, arrastar para mudar o dia). Edita os campos de sempre
// (`kind` e `date`) pelas mesmas funções do resto do app: nada é gravado em outro lugar, então Gantt, Tabela, Mapa e Reservar na agenda enxergam na hora.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fmtDate, todayISOStr } from '../App.jsx';
import { meetingConflicts } from '../../shared/calendarDays.js';
import { findSub, linkPatch, meetingAbove, pautaTitles } from '../../shared/pauta.js';
import PautaPicker from './PautaPicker.jsx';

const CSS = `
  .tg-wrap { max-width: 1040px; }
  .tg-sum { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 12px; }
  .tg-card { background:var(--bg-3); border:1px solid var(--border-2); border-radius:10px; padding:8px 14px; font-size:12px; color:var(--text-4); min-width:96px; }
  .tg-card b { display:block; font-size:22px; font-weight:700; color:var(--text-1); font-variant-numeric:tabular-nums; }
  .tg-card.warn b { color:#e0a21a; }
  .tg-bar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:0 0 12px; font-size:13px; color:var(--text-3); }
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
  .tg-r .tt .sub { display:block; font-size:11.5px; color:var(--text-5); }
  .tg-r .late { color:#e2574c; font-size:11px; font-weight:700; margin-left:6px; }
  .tg-d { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
  .tg-d input[type=date] { font-size:12px; padding:3px 6px; width:132px; border-radius:7px; }
  .tg-d .nd { font-size:11.5px; color:var(--text-5); font-style:italic; }
  .tg-x { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-4); border-radius:6px; cursor:pointer; padding:0; font:inherit; }
  .tg-x:hover { color:var(--text-1); border-color:var(--border-3); }
  .tg-sg { display:inline-flex; flex:0 0 auto; }
  .tg-sg button { font:inherit; font-size:12px; padding:4px 10px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-3); cursor:pointer; margin-left:-1px; }
  .tg-sg button:first-child { border-radius:7px 0 0 7px; margin-left:0; }
  .tg-sg button:last-child { border-radius:0 7px 7px 0; }
  .tg-sg button.on-R { background:rgba(245,196,0,.16); color:var(--text-1); border-color:var(--ui-accent, #F5C400); font-weight:700; position:relative; z-index:1; }
  .tg-sg button.on-T { background:rgba(62,207,110,.14); color:var(--text-1); border-color:rgba(62,207,110,.6); font-weight:700; position:relative; z-index:1; }
  .tg-sg button.on-A { background:var(--bg-4, var(--border-2)); color:var(--text-1); border-color:var(--border-3); font-weight:700; position:relative; z-index:1; }
  .tg-sg button:focus-visible, .tg-x:focus-visible, .tg-chip:focus-visible, .tg-cell:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .tg-cal-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 8px; }
  .tg-cal-head h3 { margin:0 8px 0 4px; font-size:16px; font-weight:700; color:var(--text-1); min-width:150px; }
  .tg-grid { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); border:1px solid var(--border-2); border-radius:12px; overflow:hidden; background:var(--bg-2); }
  .tg-dow { padding:6px 8px; font-size:11.5px; font-weight:700; color:var(--text-4); background:var(--bg-3); border-bottom:1px solid var(--border-2); text-transform:uppercase; letter-spacing:.04em; }
  .tg-cell { min-height:104px; border:0; border-right:1px solid var(--border-2); border-bottom:1px solid var(--border-2); padding:4px; text-align:left; background:transparent; color:var(--text-2); cursor:pointer; display:flex; flex-direction:column; gap:3px; font:inherit; min-width:0; }
  .tg-cell:nth-child(7n+7) { border-right:0; }
  .tg-cell.out { background:var(--bg-1, transparent); opacity:.55; }
  .tg-cell.we { background:rgba(128,128,128,.06); }
  .tg-cell.today .dn { background:var(--ui-accent, #F5C400); color:#111; }
  .tg-cell.sel { box-shadow:inset 0 0 0 2px var(--ui-accent, #F5C400); }
  .tg-cell.over { background:rgba(245,196,0,.14); }
  .tg-cell.cf { box-shadow:inset 0 0 0 2px rgba(224,162,26,.8); }
  .tg-cell .dn { align-self:flex-start; font-size:11.5px; font-weight:700; min-width:20px; height:20px; line-height:20px; text-align:center; border-radius:10px; padding:0 5px; color:var(--text-3); }
  .tg-chip { display:block; width:100%; text-align:left; font:inherit; font-size:11px; line-height:1.25; padding:2px 5px; border-radius:5px; border:0; border-left:3px solid; cursor:grab; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-1); }
  .tg-chip.R { background:rgba(245,196,0,.18); border-color:var(--ui-accent, #F5C400); }
  .tg-chip.T { background:rgba(62,207,110,.12); border-color:rgba(62,207,110,.7); }
  .tg-chip.A { font-weight:700; }
  .tg-chip.done { opacity:.5; text-decoration:line-through; }
  .tg-pauta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:3px; font-size:11.5px; color:var(--text-3); }
  .tg-pauta button { font:inherit; font-size:11.5px; padding:2px 8px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-1); border-radius:6px; cursor:pointer; font-weight:700; }
  .tg-pauta button.q { font-weight:400; color:var(--text-3); }
  .tg-pauta button:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  .tg-guide { margin-top:4px; padding:6px 9px; background:var(--bg-3); border:1px solid var(--border-2); border-radius:8px; font-size:12px; line-height:1.45; color:var(--text-3); white-space:pre-wrap; overflow-wrap:anywhere; }
  .tg-guide .cl { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .tg-guide-h { display:flex; gap:6px; align-items:center; margin-top:4px; font-size:11px; font-weight:700; color:var(--text-4); text-transform:uppercase; letter-spacing:.04em; }
  .tg-guide-h button { font:inherit; font-size:11.5px; font-weight:400; text-transform:none; letter-spacing:0; background:none; border:0; color:var(--text-3); text-decoration:underline; cursor:pointer; padding:0; }
  .tg-more { font-size:11px; color:var(--text-4); padding-left:4px; }
  .tg-day { margin:12px 0 0; border:1px solid var(--border-2); border-radius:12px; overflow:hidden; background:var(--bg-2); }
  .tg-day > .tg-h { font-size:14px; font-weight:700; color:var(--text-1); }
  .tg-empty { padding:16px; text-align:center; color:var(--text-4); font-size:13px; }
  @media (max-width: 767px) {
    .tg-sg button, .tg-x { min-height:44px; } .tg-x { width:44px; } .tg-d input[type=date] { min-height:44px; width:150px; font-size:16px; }
    .tg-cell { min-height:62px; } .tg-chip { font-size:0; height:8px; padding:0; border-left-width:0; border-radius:4px; } .tg-more { font-size:10px; }
  }
`;

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dayLabel = (d) => `${DOW[new Date(`${d}T00:00:00`).getDay()]} ${fmtDate(d)}`;
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const plusDays = (s, n) => { const x = new Date(`${s}T00:00:00`); x.setDate(x.getDate() + n); return iso(x); };
const PREFS_KEY = 'ptx-triagem-prefs';
const readPrefs = () => { try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
const writePrefs = (p) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } };

function Seg({ value, onChange, label }) {
  return (
    <div className="tg-sg" role="group" aria-label={label}>
      {[['reuniao', 'Reunião', 'R'], ['trabalho', 'Trabalho', 'T']].map(([v, l, k]) => (
        <button key={v} type="button" className={value === v ? `on-${k}` : ''} aria-pressed={value === v} onClick={() => value !== v && onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

// Filtro Ambos | Reunião | Trabalho (vale para a lista e para o calendário)
function TipoFilter({ value, onChange }) {
  return (
    <div className="tg-sg" role="group" aria-label="Mostrar">
      {[['ambos', 'Ambos', 'A'], ['reuniao', 'Reunião', 'R'], ['trabalho', 'Trabalho', 'T']].map(([v, l, k]) => (
        <button key={v} type="button" className={value === v ? `on-${k}` : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export default function CompanyTriage({ project, updateActivity, updateSub, openDetail, onReserve, pushUndoToast, linkPautaTo }) {
  const pid = project.id;
  const today = todayISOStr();
  const prefs0 = useMemo(readPrefs, []);
  const [mode, setMode] = useState(prefs0.mode === 'lista' ? 'lista' : 'calendario');
  const [tipo, setTipo] = useState(['ambos', 'reuniao', 'trabalho'].includes(prefs0.tipo) ? prefs0.tipo : 'ambos');
  const [range, setRange] = useState('60');
  const [showDone, setShowDone] = useState(false);
  const [showActs, setShowActs] = useState(prefs0.showActs !== false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selDay, setSelDay] = useState(today);
  const [showGuides, setShowGuides] = useState(prefs0.showGuides !== false);
  const [openGuides, setOpenGuides] = useState({});
  const [pickFor, setPickFor] = useState(null); // { actId, sub } da reunião que vai receber itens na pauta
  const [dragKey, setDragKey] = useState('');
  const [overDay, setOverDay] = useState('');
  const hi = plusDays(today, 60);
  useEffect(() => { writePrefs({ mode, tipo, showActs, showGuides }); }, [mode, tipo, showActs, showGuides]);

  const matchTipo = (kind) => tipo === 'ambos' || (tipo === 'reuniao' ? kind === 'reuniao' : kind !== 'reuniao');
  const conflicts = useMemo(() => meetingConflicts(project, today), [project, today]);
  const conflictOf = useMemo(() => {
    const m = new Map();
    for (const c of conflicts) for (const i of c.items) m.set(i.key, c);
    return m;
  }, [conflicts]);
  const conflictDays = useMemo(() => new Set(conflicts.map((c) => c.day)), [conflicts]);

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

  // ---------- entradas do calendário: subatividades (e, se ligado, atividades no dia de início)
  const entries = useMemo(() => {
    const out = [];
    for (const a of project.activities || []) {
      if (a.deleted) continue;
      if (showActs && a.date && (showDone || a.status !== 'concluido') && matchTipo(a.kind)) out.push({ key: a.id, isAct: true, actId: a.id, subId: '', title: a.title, actTitle: a.title, date: a.date, kind: a.kind === 'reuniao' ? 'reuniao' : 'trabalho', done: a.status === 'concluido' });
      for (const s of a.subactivities || []) {
        if (s.deleted || !s.date || (s.done && !showDone) || !matchTipo(s.kind)) continue;
        out.push({ key: `${a.id}#${s.id}`, isAct: false, actId: a.id, subId: s.id, title: s.title, guide: (s.guide || '').trim(), actTitle: a.title, date: s.date, kind: s.kind === 'reuniao' ? 'reuniao' : 'trabalho', done: !!s.done });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.activities, showDone, showActs, tipo]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of entries) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); }
    for (const l of m.values()) l.sort((x, y) => (x.isAct - y.isAct) || (x.kind === y.kind ? 0 : x.kind === 'reuniao' ? -1 : 1) || x.title.localeCompare(y.title));
    return m;
  }, [entries]);

  const cells = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00`);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // semana começa na segunda
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d); });
  }, [month]);
  const monthLabel = (() => { const [y, m] = month.split('-').map(Number); const n = MESES[m - 1]; return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${y}`; })();
  const shiftMonth = (n) => { const [y, m] = month.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); setMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); };
  function goTo(day) { setSelDay(day); setMonth(day.slice(0, 7)); }
  function nextMeeting() {
    const days = [...byDay.entries()].filter(([d, l]) => d >= today && l.some((e) => e.kind === 'reuniao' && !e.done)).map(([d]) => d).sort();
    if (days.length) goTo(days.find((d) => d > selDay) || days[0]);
  }

  function moveEntry(e, day) {
    if (e.isAct || !day || day === e.date) return;
    const prev = e.date;
    updateSub(pid, e.actId, e.subId, { date: day });
    if (pushUndoToast) pushUndoToast(`"${e.title}" movida para ${fmtDate(day)}.`, () => updateSub(pid, e.actId, e.subId, { date: prev }), 8000);
    setSelDay(day);
  }

  async function clearDate(a, s) {
    const prev = s.date;
    updateSub(pid, a.id, s.id, { date: '' });
    if (pushUndoToast) pushUndoToast(`Data de "${s.title}" removida.`, () => updateSub(pid, a.id, s.id, { date: prev }), 8000);
  }

  // ---------- visão em lista (por atividade)
  const groups = useMemo(() => {
    const inRange = (d) => range === 'all' || (d && d <= hi);
    return (project.activities || []).filter((a) => !a.deleted).slice().sort((x, y) => (x.date || '9').localeCompare(y.date || '9') || (x.title || '').localeCompare(y.title || '')).map((a) => {
      const subs = (a.subactivities || []).filter((s) => !s.deleted).filter((s) => {
        if (s.done && !showDone) return false;
        if (range === 'semdata') return !s.date;
        if (!s.date) return true;
        return inRange(s.date);
      }).filter((s) => matchTipo(s.kind)).sort((x, y) => (x.date || '9').localeCompare(y.date || '9'));
      const open = a.status !== 'concluido' || showDone;
      const end = a.endDate || a.date || '';
      const actShown = range !== 'semdata' && open && matchTipo(a.kind) && (range === 'all' || (a.date && a.date <= hi && (!end || end >= today)));
      return { a, subs, actShown };
    }).filter((g) => g.subs.length || g.actShown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.activities, range, showDone, tipo, hi, today]);

  const dayList = byDay.get(selDay) || [];
  const dayConf = conflictDays.has(selDay);

  // Roteiro do encontro (campo `guide` da subatividade): aparece sob o item, em duas linhas, com "ver tudo". Só leitura aqui; para editar, "Abrir".
  function guideUi(key, text) {
    const t = (text || '').trim();
    if (!showGuides || !t) return null;
    const open = !!openGuides[key];
    const long = t.length > 140 || t.split('\n').length > 2;
    return (
      <>
        <span className="tg-guide-h">Roteiro{long && <button type="button" onClick={() => setOpenGuides((o) => ({ ...o, [key]: !open }))} aria-expanded={open}>{open ? 'ocultar' : 'ver tudo'}</button>}</span>
        <span className="tg-guide" style={{ display: 'block' }}><span className={long && !open ? 'cl' : undefined}>{t}</span></span>
      </>
    );
  }

  // Pauta: item de TRABALHO tratado numa reunião da mesma atividade (a data acompanha a reunião). Botão "Tratar na reunião de cima" faz o vínculo e usa a data dela.
  function pautaUi(a, s) {
    if (!s || s.kind === 'reuniao' || s.done) return null;
    const subs = a.subactivities || [];
    const hit = s.pautaDe ? findSub(project.activities, s.pautaDe) : null;
    const mt = hit ? hit.sub : null;
    const above = !mt ? meetingAbove(subs, s.id) : null;
    if (!mt && !above) return null;
    return (
      <span className="tg-pauta">
        {mt ? (
          <>
            <span>Pauta da reunião <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{mt.title}</b>{hit.act.id !== a.id ? ` (${hit.act.title})` : ''}{mt.date ? ` · ${fmtDate(mt.date)}` : ''}</span>
            <button type="button" className="q" onClick={() => updateSub(pid, a.id, s.id, { pautaDe: '' })} title="Desvincular da reunião (a data fica como está)">Desvincular</button>
          </>
        ) : (
          <button type="button" onClick={() => updateSub(pid, a.id, s.id, linkPatch(above))} title={`Trata este item na agenda da reunião "${above.title}" e usa a data dela${above.date ? '' : ' (a reunião ainda não tem data)'}`}>Tratar na reunião de cima{above.date ? ` (${fmtDate(above.date)})` : ''}</button>
        )}
      </span>
    );
  }
  const pautaCountOf = (a, s) => (s && s.kind === 'reuniao' ? pautaTitles(project.activities, a.id, s.id).length : 0);
  const pautaBtn = (a, s) => (s && s.kind === 'reuniao' && !s.done && linkPautaTo ? <span className="tg-pauta"><button type="button" onClick={() => setPickFor({ actId: a.id, sub: s })} title="Escolhe itens de trabalho desta atividade ou de outras frentes para esta reunião">Vincular itens à pauta…</button></span> : null);

  function renderRow(e) {
    const a = (project.activities || []).find((x) => x.id === e.actId);
    const s = e.isAct ? null : (a && (a.subactivities || []).find((x) => x.id === e.subId));
    if (!a) return null;
    const c = e.kind === 'reuniao' && !e.done ? conflictOf.get(e.key) : null;
    return (
      <div key={e.key} className={`tg-r${c ? ' conf' : ''}`}>
        {e.isAct ? <span className="tg-d" style={{ flex: '0 0 132px', fontSize: 12, color: 'var(--text-5)' }}>início da atividade</span> : (
          <div className="tg-d">
            <input type="date" value={e.date} onChange={(ev) => ev.target.value && updateSub(pid, a.id, s.id, { date: ev.target.value })} aria-label={`Data de ${e.title}`} />
            <button type="button" className="tg-x" onClick={() => clearDate(a, s)} aria-label={`Deixar "${e.title}" sem data`} title="Deixar sem data"><X size={13} aria-hidden="true" /></button>
          </div>
        )}
        <span className="tt">
          <span style={e.done ? { textDecoration: 'line-through', color: 'var(--text-5)' } : undefined}>{e.title}</span>
          {!e.isAct && <span className="sub">{e.actTitle}</span>}
          {!e.isAct && pautaUi(a, s)}
          {!e.isAct && pautaBtn(a, s)}
          {!e.isAct && s && guideUi(e.key, s.guide)}
          {!e.isAct && pautaCountOf(a, s) > 0 && <span className="sub">Pauta: {pautaCountOf(a, s)} {pautaCountOf(a, s) === 1 ? 'item de trabalho' : 'itens de trabalho'} (a data deles acompanha esta reunião)</span>}
          {c && <span className="w"><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />Outra reunião no mesmo dia: {c.items.filter((i) => i.key !== e.key).map((i) => i.title).join('; ')}</span>}
        </span>
        <Seg value={e.kind} label={`Tipo de ${e.title}`} onChange={(v) => (e.isAct ? updateActivity(pid, a.id, { kind: v }, `Tipo alterado em "${a.title}": ${v === 'reuniao' ? 'Reunião' : 'Trabalho'}`) : updateSub(pid, a.id, s.id, { kind: v }))} />
        <button type="button" className="tg-x" style={{ width: 'auto', padding: '0 9px', height: 26, fontSize: 12 }} onClick={() => openDetail && openDetail(pid, a.id)} title="Abrir a atividade">Abrir</button>
      </div>
    );
  }

  return (
    <div className="tg-wrap">
      <style>{CSS}</style>
      <p className="tg-leg">Para cada item, escolha <b>Reunião</b> (call com gente junto ao mesmo tempo: vai para "Reservar na agenda" e só pode haver <b>uma por dia</b> na empresa) ou <b>Trabalho</b> (execução nossa, pode repetir dia), e a <b>data</b>. No <b>calendário</b>, arraste um item para outro dia para mudar a data.</p>
      <div className="tg-sum">
        <div className="tg-card"><b>{counts.r}</b>reuniões abertas</div>
        <div className="tg-card"><b>{counts.t}</b>trabalho aberto</div>
        <div className="tg-card"><b>{counts.nd}</b>subatividades sem data</div>
        <div className={`tg-card${conflicts.length ? ' warn' : ''}`}><b>{conflicts.length}</b>dias com 2+ reuniões</div>
      </div>
      <div className="tg-bar">
        <div className="tg-sg" role="group" aria-label="Visão">
          {[['calendario', 'Calendário'], ['lista', 'Lista']].map(([v, l]) => <button key={v} type="button" className={mode === v ? 'on-A' : ''} aria-pressed={mode === v} onClick={() => setMode(v)}>{l}</button>)}
        </div>
        <TipoFilter value={tipo} onChange={setTipo} />
        {mode === 'lista' && (
          <label>Período
            <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Período">
              <option value="60">Próximos 2 meses</option>
              <option value="all">Tudo</option>
              <option value="semdata">Só sem data</option>
            </select>
          </label>
        )}
        {mode === 'calendario' && <label><input type="checkbox" checked={showActs} onChange={(e) => setShowActs(e.target.checked)} /> Mostrar atividades</label>}
        <label><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Mostrar concluídas</label>
        {mode === 'lista' && <label><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Mostrar roteiros</label>}
        <button type="button" className="tg-x" style={{ width: 'auto', padding: '0 12px', height: 30, marginLeft: 'auto', gap: 6, color: 'var(--text-1)', fontWeight: 700, fontSize: 12.5 }} onClick={onReserve} title="Abrir a reserva de agenda com as reuniões deste cronograma"><CalendarCheck size={14} aria-hidden="true" /> Reservar na agenda</button>
      </div>

      {mode === 'calendario' && (
        <>
          <div className="tg-cal-head">
            <button type="button" className="tg-x" onClick={() => shiftMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={14} aria-hidden="true" /></button>
            <h3 aria-live="polite">{monthLabel}</h3>
            <button type="button" className="tg-x" onClick={() => shiftMonth(1)} aria-label="Próximo mês"><ChevronRight size={14} aria-hidden="true" /></button>
            <button type="button" className="tg-x" style={{ width: 'auto', padding: '0 10px', height: 26, fontSize: 12 }} onClick={() => goTo(today)}>Hoje</button>
            <button type="button" className="tg-x" style={{ width: 'auto', padding: '0 10px', height: 26, fontSize: 12 }} onClick={nextMeeting} title="Pula para o próximo dia com reunião">Próxima reunião</button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-5)' }}>
              <span className="tg-chip R" style={{ display: 'inline-block', width: 'auto', cursor: 'default' }}>Reunião</span>{' '}
              <span className="tg-chip T" style={{ display: 'inline-block', width: 'auto', cursor: 'default' }}>Trabalho</span>
            </span>
          </div>
          <div className="tg-grid" role="grid" aria-label={`Calendário de ${monthLabel}`}>
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <div key={d} className="tg-dow" role="columnheader">{d}</div>)}
            {cells.map((d) => {
              const list = byDay.get(d) || [];
              const out = d.slice(0, 7) !== month;
              const wd = new Date(`${d}T00:00:00`).getDay();
              const cf = conflictDays.has(d) && list.some((e) => e.kind === 'reuniao' && !e.done);
              const shown = list.slice(0, 3);
              return (
                <div key={d} role="gridcell" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelDay(d); } }} className={`tg-cell${out ? ' out' : ''}${wd === 0 || wd === 6 ? ' we' : ''}${d === today ? ' today' : ''}${d === selDay ? ' sel' : ''}${overDay === d ? ' over' : ''}${cf ? ' cf' : ''}`}
                  aria-label={`${dayLabel(d)}: ${list.length} ${list.length === 1 ? 'item' : 'itens'}${cf ? ', com duas reuniões' : ''}`} aria-selected={d === selDay}
                  onClick={() => setSelDay(d)}
                  onDragOver={(ev) => { if (dragKey) { ev.preventDefault(); setOverDay(d); } }}
                  onDragLeave={() => setOverDay((o) => (o === d ? '' : o))}
                  onDrop={(ev) => { ev.preventDefault(); const e = entries.find((x) => x.key === dragKey); setDragKey(''); setOverDay(''); if (e) moveEntry(e, d); }}>
                  <span className="dn">{Number(d.slice(8))}</span>
                  {shown.map((e) => (
                    <span key={e.key} className={`tg-chip ${e.kind === 'reuniao' ? 'R' : 'T'}${e.isAct ? ' A' : ''}${e.done ? ' done' : ''}`} title={`${e.isAct ? 'Atividade' : e.actTitle}: ${e.title}${e.guide ? `\n\nRoteiro: ${e.guide.slice(0, 200)}${e.guide.length > 200 ? '…' : ''}` : ''}`}
                      draggable={!e.isAct} onDragStart={(ev) => { setDragKey(e.key); try { ev.dataTransfer.setData('text/plain', e.key); ev.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ignora */ } }} onDragEnd={() => { setDragKey(''); setOverDay(''); }}>
                      {e.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="tg-more">+{list.length - 3} mais</span>}
                </div>
              );
            })}
          </div>
          <section className="tg-day" aria-label={`Itens de ${dayLabel(selDay)}`}>
            <div className="tg-h">{dayLabel(selDay)}{dayConf && <span style={{ color: '#e0a21a', fontSize: 12, fontWeight: 600 }}>duas reuniões neste dia</span>}<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400, color: 'var(--text-3)', cursor: 'pointer' }}><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Mostrar roteiros</label><span className="pe">{dayList.length} {dayList.length === 1 ? 'item' : 'itens'}</span></div>
            {dayList.length === 0 && <div className="tg-empty">Nada neste dia. Arraste um item do calendário para cá, ou use a Lista para datar o que está sem data.</div>}
            {dayList.map((e) => renderRow(e))}
          </section>
        </>
      )}

      {mode === 'lista' && (
        <>
          {groups.length === 0 && <div className="tg-empty">Nada para mostrar neste período.</div>}
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
                        {pautaUi(a, s)}
                        {pautaBtn(a, s)}
                        {guideUi(key, s.guide)}
                        {pautaCountOf(a, s) > 0 && <span className="sub">Pauta: {pautaCountOf(a, s)} {pautaCountOf(a, s) === 1 ? 'item de trabalho' : 'itens de trabalho'} (a data deles acompanha esta reunião)</span>}
                        {c && <span className="w"><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />Outra reunião no mesmo dia ({dayLabel(c.day)}): {c.items.filter((i) => i.key !== key).map((i) => i.title).join('; ')}</span>}
                      </span>
                      <Seg value={s.kind === 'reuniao' ? 'reuniao' : 'trabalho'} label={`Tipo de ${s.title}`} onChange={(v) => updateSub(pid, a.id, s.id, { kind: v })} />
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
      {pickFor && <PautaPicker activities={project.activities || []} meeting={pickFor.sub} meetingActId={pickFor.actId} onConfirm={(items) => linkPautaTo(pid, pickFor.actId, pickFor.sub.id, items)} onClose={() => setPickFor(null)} />}
    </div>
  );
}
