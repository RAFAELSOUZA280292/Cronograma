import React, { useEffect, useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import { fmtDate, todayISOStr } from '../App.jsx';
import { waitingLabel } from './Waiting.jsx';
import { addIsoDays, buildFocus, listPeople, personKeyForUser, setCardStatus, toggleStep } from './focus.js';

const CSS = `
.fx{position:fixed;inset:0;z-index:46;background:var(--bg-page);color:var(--text-1);display:flex;flex-direction:column;font-family:'Inter',sans-serif;padding:max(12px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.fx *{box-sizing:border-box}
.fx-top{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;margin-bottom:10px}
.fx-title{font-size:19px;font-weight:700;margin:0 6px 0 0}
.fx-date{font-size:12.5px;color:var(--text-4);display:inline-block}.fx-date::first-letter{text-transform:uppercase}
.fx-grp{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.fx-lbl{font-size:11px;color:var(--text-5);margin-right:2px;text-transform:uppercase;letter-spacing:.05em}
.fx-chip{background:var(--bg-2);border:1px solid var(--border-2);color:var(--text-2);border-radius:999px;padding:0 13px;min-height:40px;font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.fx-chip[aria-pressed=true]{background:#FEDB00;border-color:#FEDB00;color:#14141c;font-weight:700}
.fx-chip.sq{padding:0;min-width:40px;justify-content:center}
.fx-end{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-5)}
.fx-cols{flex:1;min-height:0;display:grid;gap:10px;grid-template-columns:1.25fr 1fr .9fr}
.fx-cols.w4{grid-template-columns:1.25fr 1fr .9fr .75fr}
.fx-col{background:var(--bg-1);border-radius:14px;padding:10px;min-height:0;display:flex;flex-direction:column}
.fx-ch{display:flex;align-items:center;gap:7px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-4);margin-bottom:8px;flex-shrink:0}
.fx-ch b{color:var(--text-1);font-weight:700}
.fx-n{background:var(--bg-3);border-radius:999px;padding:1px 8px;color:var(--text-2)}
.fx-n.warn{background:rgba(226,87,76,.18);color:#ff9b9b}
.fx-body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fx-body::-webkit-scrollbar{display:none}
.fx-card{background:var(--bg-2);border:1px solid var(--border-1);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.fx-card.now{border-color:#FEDB00}
.fx-t{font-size:15px;font-weight:650;line-height:1.3;background:none;border:none;color:inherit;text-align:left;padding:2px 0;width:100%;cursor:pointer;font-family:inherit;overflow-wrap:anywhere}
.fx-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px}
.fx-pill{font-size:11.5px;border-radius:999px;padding:2px 8px;white-space:nowrap}
.fx-pill.red{background:rgba(226,87,76,.16);color:#ff9b9b}
.fx-pill.amb{background:rgba(203,145,47,.18);color:#f2c15c}
.fx-pill.blu{background:rgba(62,166,255,.15);color:#7db8f5}
.fx-pill.vio{background:rgba(155,122,245,.16);color:#b9a2f7}
.fx-pill.gry{background:var(--bg-3);color:var(--text-3)}
.fx-tag{font-size:11.5px;color:var(--text-5)}
.fx-next{font-size:10.5px;color:#FEDB00;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 2px}
.fx-step{display:flex;gap:10px;align-items:center;width:100%;min-height:44px;padding:6px 8px;margin-top:4px;background:var(--bg-1);border:none;border-radius:9px;color:var(--text-1);font:inherit;font-size:13.5px;text-align:left;cursor:pointer}
.fx-box{width:22px;height:22px;border-radius:50%;border:2px solid var(--border-3);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#14141c}
.fx-step span.tx{flex:1;min-width:0;overflow-wrap:anywhere}
.fx-act{display:flex;justify-content:flex-end;margin-top:6px}
.fx-btn{background:transparent;border:1px solid var(--border-2);color:var(--text-2);border-radius:9px;min-height:40px;padding:0 12px;font:inherit;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.fx-empty{font-size:13px;color:var(--text-5);line-height:1.5;padding:8px 4px}
.fx-av{display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--bg-3);color:var(--text-2);font-size:9.5px;font-weight:700;align-items:center;justify-content:center}
.fx-foot{display:flex;align-items:center;gap:12px;margin-top:10px;font-size:12px;color:var(--text-4);flex-shrink:0}
.fx-bar{flex:1;height:7px;background:var(--bg-3);border-radius:4px;overflow:hidden}
.fx-bar i{display:block;height:100%;background:#3ecf6e;transition:width .3s ease}
@media (prefers-reduced-motion:reduce){.fx-bar i{transition:none}}
@media (max-width:860px){.fx-cols{grid-template-columns:1fr;overflow-y:auto}.fx-col{min-height:260px}}
`;

const STATUS_PILL = { 'em-andamento': ['blu', 'Em andamento'], pausada: ['gry', 'Pausada'], 'nao-iniciada': null };
const PRIO_LABEL = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const ini = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function loadPrefs(uid) {
  try { return JSON.parse(window.localStorage.getItem(`fx-prefs-${uid}`) || '{}') || {}; } catch (e) { return {}; }
}
function savePrefs(uid, p) {
  try { window.localStorage.setItem(`fx-prefs-${uid}`, JSON.stringify(p)); } catch (e) { /* sem armazenamento: não lembra, mas funciona */ }
}

function duePill(e, today) {
  if (e.tone === 'overdue') return <span className="fx-pill red">{e.overdueDays === 1 ? 'atrasada 1 dia' : `atrasada ${e.overdueDays} dias`}</span>;
  if (!e.minDate) return null;
  if (e.minDate === today) return <span className="fx-pill amb">vence hoje</span>;
  return <span className="fx-pill gry">{fmtDate(e.minDate)}</span>;
}

function FocusCard({ e, today, bucket, showWhere, showOwners, onOpen, onStep, onStart, onFinish }) {
  const c = e.card;
  const status = STATUS_PILL[e.status];
  const maxSteps = bucket === 'agora' ? 3 : 1;
  const shown = e.steps.slice(0, maxSteps);
  const more = e.steps.length - shown.length;
  return (
    <article className={`fx-card${bucket === 'agora' ? ' now' : ''}`}>
      <button type="button" className="fx-t" onClick={onOpen} title="Abrir a atividade">{c.title}</button>
      <div className="fx-meta">
        {e.reason === 'aguardando'
          ? <span className="fx-pill vio">{waitingLabel(c, todayISOStr())}</span>
          : status && <span className={`fx-pill ${status[0]}`}>{status[1]}</span>}
        {duePill(e, today)}
        {c.priority && PRIO_LABEL[c.priority] && (c.priority === 'urgente' || c.priority === 'alta') && <span className="fx-tag">{PRIO_LABEL[c.priority]}</span>}
        {showWhere && <span className="fx-tag">{e.boardName}{e.colName ? ` · ${e.colName}` : ''}</span>}
        {showOwners && e.ownerNames.slice(0, 3).map((n) => <span key={n} className="fx-av" title={n}>{ini(n)}</span>)}
      </div>
      {shown.length > 0 && <div className="fx-next">{bucket === 'agora' ? 'Próximos passos' : 'Próximo passo'}</div>}
      {shown.map((it) => (
        <button key={it.id} type="button" className="fx-step" onClick={() => onStep(it.id)} aria-label={`Concluir passo: ${it.text}`}>
          <span className="fx-box" aria-hidden="true" />
          <span className="tx">{it.text}</span>
          {it.dueDate && it.dueDate <= today && <span className={`fx-pill ${it.dueDate < today ? 'red' : 'amb'}`}>{it.dueDate < today ? fmtDate(it.dueDate) : 'hoje'}</span>}
        </button>
      ))}
      {more > 0 && <div className="fx-tag" style={{ marginTop: 6 }}>+ {more} {more === 1 ? 'passo' : 'passos'} neste cartão</div>}
      <div className="fx-act">
        {e.status !== 'em-andamento' && e.reason !== 'aguardando' && <button type="button" className="fx-btn" onClick={onStart}><Play size={13} aria-hidden="true" /> Começar</button>}
        {e.steps.length === 0 && <button type="button" className="fx-btn" style={{ marginLeft: 8 }} onClick={onFinish}>Concluir</button>}
      </div>
    </article>
  );
}

export default function FocusScreen({ board, currentUser, saveState, onMutate, onOpenCard, onOpenDaily, onClose }) {
  const uid = (currentUser && currentUser.id) || 'anon';
  const [, setTick] = useState(0);
  const today = todayISOStr();
  const prefs0 = useMemo(() => loadPrefs(uid), [uid]);
  const [day, setDay] = useState(today);
  const [span, setSpan] = useState('dia');
  const [pageId, setPageId] = useState(prefs0.pageId || 'all');
  const [person, setPerson] = useState(null);
  const [expandAgora, setExpandAgora] = useState(false);
  const [wide, setWide] = useState(() => window.innerWidth >= 1300);
  const [awake, setAwake] = useState(null);

  const pages = board.boards || [];
  const pageOk = pageId === 'all' || pages.some((p) => p.id === pageId);
  const page = pageOk ? pageId : 'all';
  const people = useMemo(() => listPeople(board, page), [board, page]);
  const me = useMemo(() => personKeyForUser(currentUser && currentUser.name, people), [currentUser, people]);
  const personWanted = person !== null ? person : (prefs0.person || (me ? 'me' : 'all'));
  const personKey = personWanted === 'me' ? (me || 'all') : (personWanted === 'all' || people.some((p) => p.key === personWanted) ? personWanted : 'all');

  useEffect(() => { savePrefs(uid, { pageId: page, person: personWanted }); }, [uid, page, personWanted]);
  useEffect(() => {
    const t = setInterval(() => setTick((k) => k + 1), 60000);
    const onResize = () => setWide(window.innerWidth >= 1300);
    window.addEventListener('resize', onResize);
    return () => { clearInterval(t); window.removeEventListener('resize', onResize); };
  }, []);
  useEffect(() => {
    let lock = null; let off = false;
    const ask = async () => {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') { if (!off) setAwake(false); return; }
        lock = await navigator.wakeLock.request('screen');
        if (!off) setAwake(true);
        lock.addEventListener('release', () => { if (!off) setAwake(false); });
      } catch (e) { if (!off) setAwake(false); }
    };
    ask();
    const vis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', vis);
    return () => { off = true; document.removeEventListener('visibilitychange', vis); try { if (lock) lock.release(); } catch (e) { /* já liberado */ } };
  }, []);
  useEffect(() => {
    const k = (ev) => { if (ev.key === 'Escape' && !document.querySelector('[role=dialog]')) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const f = useMemo(() => buildFocus(board, { pageId: page, person: personKey, day, span, today }), [board, page, personKey, day, span, today]);
  const userName = currentUser && currentUser.name;
  const ref = (e) => ({ boardId: e.boardId, colId: e.colId, cardId: e.card.id });
  const step = (e, itemId) => onMutate((prev) => toggleStep(prev, { ...ref(e), itemId }, new Date().toISOString(), userName));
  const status = (e, s) => onMutate((prev) => setCardStatus(prev, ref(e), s, new Date().toISOString(), userName));

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const shiftBy = span === 'semana' ? 7 : 1;
  const agora = expandAgora ? f.agora : f.agora.slice(0, 3);
  const pct = f.progress.total ? Math.round((f.progress.done / f.progress.total) * 100) : 0;
  const saveTxt = saveState === 'saving' || saveState === 'retrying' ? 'salvando…' : saveState === 'error' ? 'não salvou — confira a conexão' : 'sincronizado';
  const nowLabel = (e, b) => (
    <FocusCard key={e.key} e={e} today={today} bucket={b} showWhere={page === 'all' && pages.length > 1} showOwners={personKey === 'all'}
      onOpen={() => onOpenCard(e.boardId, e.colId, e.card.id)} onStep={(id) => step(e, id)} onStart={() => status(e, 'em-andamento')} onFinish={() => status(e, 'concluida')} />
  );

  return (
    <div className="fx" role="region" aria-label="Foco de hoje">
      <style>{CSS}</style>
      <div className="fx-top">
        <h1 className="fx-title">Foco</h1>
        <span className="fx-date">{span === 'semana' ? `semana de ${fmtDate(day)}` : dayLabel}</span>
        <div className="fx-grp" role="group" aria-label="Dia">
          <span className="fx-lbl">Dia</span>
          <button type="button" className="fx-chip sq" aria-label="Dia anterior" onClick={() => setDay(addIsoDays(day, -shiftBy))}>‹</button>
          <button type="button" className="fx-chip" aria-pressed={day === today && span === 'dia'} onClick={() => { setDay(today); setSpan('dia'); }}>Hoje</button>
          <button type="button" className="fx-chip" aria-pressed={day === addIsoDays(today, 1) && span === 'dia'} onClick={() => { setDay(addIsoDays(today, 1)); setSpan('dia'); }}>Amanhã</button>
          <button type="button" className="fx-chip" aria-pressed={span === 'semana'} onClick={() => { setDay(today); setSpan('semana'); }}>Semana</button>
          <button type="button" className="fx-chip sq" aria-label="Próximo dia" onClick={() => setDay(addIsoDays(day, shiftBy))}>›</button>
        </div>
        <div className="fx-grp" role="group" aria-label="Pessoa">
          <span className="fx-lbl">Pessoa</span>
          {me && <button type="button" className="fx-chip" aria-pressed={personKey === me} onClick={() => setPerson('me')}>Eu</button>}
          {people.filter((p) => p.key !== me).map((p) => <button key={p.key} type="button" className="fx-chip" aria-pressed={personKey === p.key} onClick={() => setPerson(p.key)}>{p.name}</button>)}
          <button type="button" className="fx-chip" aria-pressed={personKey === 'all'} onClick={() => setPerson('all')}>Todos</button>
        </div>
        {pages.length > 1 && (
          <div className="fx-grp" role="group" aria-label="Quadro">
            <span className="fx-lbl">Quadro</span>
            <button type="button" className="fx-chip" aria-pressed={page === 'all'} onClick={() => setPageId('all')}>Todos</button>
            {pages.map((p) => <button key={p.id} type="button" className="fx-chip" aria-pressed={page === p.id} onClick={() => setPageId(p.id)}>{p.name || 'Sem nome'}</button>)}
          </div>
        )}
        <div className="fx-end">
          <span style={{ color: saveState === 'error' ? '#ff9b9b' : '#6fcf97' }}>● {saveTxt}</span>
          {awake !== null && <span title={awake ? 'A tela não apaga enquanto o Foco está aberto.' : 'Este aparelho não deixou manter a tela acesa.'}>{awake ? 'tela acesa' : 'tela pode apagar'}</span>}
          {onOpenDaily && <button type="button" className="fx-chip" onClick={onOpenDaily}>Daily</button>}
          <button type="button" className="fx-chip sq" aria-label="Sair do Foco" title="Sair do Foco" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
      </div>

      <div className={`fx-cols${wide ? ' w4' : ''}`}>
        <section className="fx-col" aria-label="Agora">
          <div className="fx-ch"><b>Agora</b><span className={`fx-n${f.agora.length > 3 ? ' warn' : ''}`}>{f.agora.length}</span><span>em andamento{f.agora.length > 3 ? ' · muita coisa aberta' : ''}</span></div>
          <div className="fx-body">
            {agora.map((e) => nowLabel(e, 'agora'))}
            {f.agora.length > 3 && <button type="button" className="fx-btn" onClick={() => setExpandAgora((v) => !v)}>{expandAgora ? 'Mostrar só 3' : `+ ${f.agora.length - 3} em andamento`}</button>}
            {f.agora.length === 0 && <div className="fx-empty">Nada em andamento. Toque em Começar num cartão de Próximos para trazê-lo para cá.</div>}
          </div>
        </section>
        <section className="fx-col" aria-label="Próximos">
          <div className="fx-ch"><b>Próximos</b><span className="fx-n">{f.proximos.length}</span><span>{span === 'semana' ? 'na semana' : day === today ? 'para hoje' : 'para este dia'}</span></div>
          <div className="fx-body">
            {f.proximos.map((e) => nowLabel(e, 'proximos'))}
            {f.proximos.length === 0 && <div className="fx-empty">Nada com prazo {span === 'semana' ? 'nesta semana' : 'neste dia'}.</div>}
          </div>
        </section>
        <section className="fx-col" aria-label="Atenção">
          <div className="fx-ch"><b>Atenção</b><span className={`fx-n${f.atencao.length ? ' warn' : ''}`}>{f.atencao.length}</span><span>atrasadas e esperando</span></div>
          <div className="fx-body">
            {f.atencao.map((e) => nowLabel(e, 'atencao'))}
            {f.atencao.length === 0 && <div className="fx-empty">Nada atrasado nem esperando alguém. Bom ritmo.</div>}
          </div>
        </section>
        {wide && (
          <section className="fx-col" aria-label="Feito hoje">
            <div className="fx-ch"><b>Feito hoje</b><span className="fx-n">{f.feitoHoje.length}</span></div>
            <div className="fx-body">
              {f.feitoHoje.map((x) => <div key={x.card.id} className="fx-card" style={{ opacity: .75 }}><div className="fx-t" style={{ cursor: 'default', textDecoration: 'line-through' }}>{x.card.title}</div></div>)}
              {f.passosFeitosHoje > 0 && <div className="fx-empty">{f.passosFeitosHoje} {f.passosFeitosHoje === 1 ? 'passo concluído' : 'passos concluídos'} em atividades abertas.</div>}
              {f.feitoHoje.length === 0 && f.passosFeitosHoje === 0 && <div className="fx-empty">Ainda nada concluído hoje.</div>}
            </div>
          </section>
        )}
      </div>

      <div className="fx-foot">
        <span>{f.progress.done} de {f.progress.total} {f.progress.total === 1 ? 'item feito' : 'itens feitos'} hoje</span>
        <div className="fx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso de hoje"><i style={{ width: `${pct}%` }} /></div>
        <span>toque no círculo para concluir um passo</span>
      </div>
    </div>
  );
}
