// Painel da RENATA na tela inicial (2026-09-20, pedido do Rafael): logo após
// o login, quem já conectou o Google Calendar vê na hora os compromissos de
// hoje e do resto da semana; quem não conectou é convidado a conectar, com o
// botão à mão. Não usa IA — só lê `/api/agenda` (a mesma da tela Agenda) e
// monta o texto localmente, então não gasta token. Dia/hora "atuais" vêm do
// relógio do navegador do usuário e são reavaliados a cada 30s.
//
// 2026-09-20 (pedido do Rafael): reunião que ele NÃO aceitou aparecia como se fosse
// compromisso. Agora cada evento mostra a resposta dele (aceito / sem resposta / talvez /
// recusado) e a duração; só o aceito conta como tempo ocupado; o resumo do dia diz quanto
// tempo livre sobra, a maior pausa e se há janela de almoço (regras em dayLoad.js).
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, MapPin, ArrowRight, Link2, Coffee, Utensils, TriangleAlert, Zap } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { RSVP_META, WORK, rsvpOf, isPendingRsvp, summarizeDay, timelineRows, durationMin, fmtDur, hhmm } from './dayLoad.js';

const SOURCE_COLOR = { google: '#5B8DEF', xflow_ticket: '#b98af5', activity: '#3ecf6e', crm_activity: '#F5C400' };
const SOURCE_LABEL = { google: 'Google Calendar', xflow_ticket: 'TASK do XFlow', activity: 'Atividade PRICETAX', crm_activity: 'Atividade do CRM' };
const WEEKDAY_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DISMISS_KEY = 'renata-agenda-dismissed';
const MAX_PER_WEEK_DAY = 5;

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function dayFromIso(s) { return String(s).slice(0, 10); }
function dayMinusOne(s) { const [y, m, d] = s.split('-').map(Number); return isoDate(new Date(y, m - 1, d - 1)); }

export function greetingFor(now) {
  const h = now.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

// Sáb/dom não têm "resto da semana" — mostra a semana que vem (seg→dom).
// Dias úteis: de amanhã até domingo.
export function weekWindow(now) {
  const today = startOfDay(now);
  const dow = today.getDay();
  if (dow === 6 || dow === 0) {
    const start = addDays(today, dow === 6 ? 2 : 1);
    return { start, end: addDays(start, 7), label: 'Semana que vem' };
  }
  return { start: addDays(today, 1), end: addDays(today, 8 - dow), label: 'Resto da semana' };
}

export function normalizeEvent(ev) {
  if (!ev || !ev.start || ev.status === 'cancelled') return null;
  if (ev.allDay) {
    const startDay = dayFromIso(ev.start);
    const rawEnd = dayFromIso(ev.end || ev.start);
    // Google devolve o fim de evento de dia inteiro como exclusivo.
    const endDay = ev.source === 'google' && rawEnd > startDay ? dayMinusOne(rawEnd) : rawEnd;
    return { ...ev, allDay: true, startDay, endDay: endDay < startDay ? startDay : endDay };
  }
  const startDate = new Date(ev.start);
  const endDate = new Date(ev.end || ev.start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endRef = endDate > startDate ? new Date(endDate.getTime() - 1) : startDate;
  return { ...ev, allDay: false, startDate, endDate, startDay: isoDate(startDate), endDay: isoDate(endRef) };
}

export function eventsOnDay(events, day) {
  return events
    .filter((e) => e.startDay <= day && day <= e.endDay)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;
      if (!a.allDay) return a.startDate - b.startDate;
      return (a.title || '').localeCompare(b.title || '', 'pt-BR');
    });
}

function eventState(e, now) {
  if (e.allDay) return 'allday';
  if (e.endDate <= now) return 'past';
  if (e.startDate <= now) return 'now';
  return 'upcoming';
}

// Só o que o usuário aceitou (ou é dele) é "compromisso"; sem resposta/talvez são convites em aberto.
function todayHeadline(sum, todayEvents, now) {
  if (todayEvents.length === 0) return 'Hoje você não tem nada na agenda.';
  const n = sum.confirmed + sum.allDayAccepted;
  const pend = sum.pending + sum.allDayPending;
  const extras = [];
  if (pend) extras.push(`${pend} sem resposta`);
  if (sum.declined) extras.push(`${sum.declined} ${sum.declined === 1 ? 'recusado' : 'recusados'}`);
  const head = `${n ? `Hoje você tem ${n} ${n === 1 ? 'compromisso confirmado' : 'compromissos confirmados'}` : 'Hoje você não tem compromissos confirmados'}${extras.length ? ` (${extras.join(' · ')})` : ''}.`;
  const timed = todayEvents.filter((e) => !e.allDay && !e.transparent && rsvpOf(e) === 'accepted');
  const current = timed.find((e) => eventState(e, now) === 'now');
  const next = timed.find((e) => eventState(e, now) === 'upcoming');
  if (current) return `${head} Agora: ${current.title} (até ${fmtTime(current.endDate)}).`;
  if (next) return `${head} Próximo: ${next.title} às ${fmtTime(next.startDate)}.`;
  if (timed.length > 0) return `${head} Os compromissos confirmados com horário de hoje já passaram.`;
  return head;
}

const RESP_LABEL = { accepted: 'Aceito', organizer: 'Seu evento', needsAction: 'Sem resposta', tentative: 'Talvez', declined: 'Recusado' };
const RESP_HINT = {
  accepted: 'Você aceitou este convite.', organizer: 'Evento seu (sem convite pendente).', needsAction: 'Você ainda não respondeu a este convite — não conta como tempo ocupado.',
  tentative: 'Você marcou "talvez" — não conta como tempo ocupado.', declined: 'Você recusou este convite — não é compromisso seu.',
};

function Pill({ tone, icon: Icon, title, children }) {
  return <span className={`rab-pill rab-pill-${tone}`} title={title}>{Icon ? <Icon size={11} /> : null}{children}</span>;
}

// Resumo do dia: o que é confirmado, o que falta responder, quanto tempo livre e quais pausas existem.
function DayStats({ s, compact }) {
  if (s.confirmed + s.pending + s.declined + s.allDayAccepted + s.allDayPending === 0) return null;
  const anyTimed = s.confirmed + s.pending > 0;
  return (
    <div className="rab-stats">
      {s.confirmed > 0 && <Pill tone="ok" title="Compromissos que você aceitou (ou são seus), somando o tempo real ocupado — sem contar reuniões sobrepostas em dobro.">{s.confirmed} {s.confirmed === 1 ? 'aceito' : 'aceitos'} · {fmtDur(s.confirmedMin)}</Pill>}
      {s.pending > 0 && <Pill tone="warn" title="Convites que você ainda não respondeu ou marcou como talvez. Não contam como tempo ocupado.">{s.pending} sem resposta{s.pendingMin ? ` · ${fmtDur(s.pendingMin)}` : ''}</Pill>}
      {s.declined > 0 && <Pill tone="muted" title="Convites que você recusou — não ocupam seu tempo.">{s.declined} {s.declined === 1 ? 'recusado' : 'recusados'}</Pill>}
      {anyTimed && (
        <Pill tone="info" title={`Tempo sem compromisso aceito entre ${hhmm(s.work.start)} e ${hhmm(s.work.end)}.`}>
          Livre {fmtDur(s.freeMin)} de {fmtDur(s.workMin)}{s.pending > 0 && s.freeIfAllMin !== s.freeMin ? ` (${fmtDur(s.freeIfAllMin)} se aceitar tudo)` : ''}
        </Pill>
      )}
      {!compact && s.confirmed > 0 && s.longestGap && <Pill tone="info" icon={Coffee} title="Maior intervalo sem compromisso aceito dentro do expediente.">Maior pausa {fmtDur(s.longestGap.min)} ({hhmm(s.longestGap.s)}–{hhmm(s.longestGap.e)})</Pill>}
      {anyTimed && (s.lunch.ok
        ? <Pill tone="ok" icon={Utensils} title={`Há pelo menos ${WORK.lunchMin} min livres entre ${hhmm(WORK.lunchStart)} e ${hhmm(WORK.lunchEnd)}.`}>Almoço livre{s.pending > 0 && !s.lunch.okIfAll ? ' (não, se aceitar tudo)' : ''}</Pill>
        : <Pill tone="warn" icon={Utensils} title={`Menos de ${WORK.lunchMin} min livres entre ${hhmm(WORK.lunchStart)} e ${hhmm(WORK.lunchEnd)}.`}>Sem janela de almoço</Pill>)}
      {!compact && s.longestRun && s.longestRun.min >= WORK.longRun && <Pill tone="warn" icon={TriangleAlert} title="Maior sequência de reuniões seguidas, sem pausa de 10 min.">{fmtDur(s.longestRun.min)} sem parar ({hhmm(s.longestRun.s)}–{hhmm(s.longestRun.e)})</Pill>}
      {!compact && s.backToBack > 0 && <Pill tone="warn" icon={Zap} title="Reuniões aceitas que começam logo depois da anterior (menos de 5 min).">{s.backToBack} {s.backToBack === 1 ? 'emendada' : 'emendadas'}</Pill>}
      {s.conflicts.length > 0 && <Pill tone="danger" icon={TriangleAlert} title={s.conflicts.map((c) => `${c.a.title} × ${c.b.title}`).join(' · ')}>{s.conflicts.length} {s.conflicts.length === 1 ? 'conflito' : 'conflitos'} entre aceitos</Pill>}
      {s.confirmed === 0 && s.pending === 0 && <Pill tone="info">Dia livre de reuniões</Pill>}
    </div>
  );
}

function EventRow({ e, now, rsvp, conflict, backToBack }) {
  const state = eventState(e, now);
  const dur = durationMin(e);
  const time = e.allDay ? 'Dia todo' : `${fmtTime(e.startDate)}–${fmtTime(e.endDate)}`;
  const resp = e.source === 'google' ? (e.myResponse && RESP_LABEL[e.myResponse] ? e.myResponse : 'accepted') : null;
  const pending = isPendingRsvp(rsvp);
  return (
    <div className={`rab-ev rab-ev-${state} rab-rsvp-${rsvp}`} title={resp ? RESP_HINT[resp] : ''}>
      <span className={`rab-ev-dot${pending ? ' rab-hollow' : ''}`} style={{ '--c': SOURCE_COLOR[e.source] || '#888' }} title={SOURCE_LABEL[e.source] || ''} />
      <span className="rab-ev-time">{time}{dur ? <span className="rab-ev-dur">{fmtDur(dur)}</span> : null}</span>
      <span className="rab-ev-body">
        <span className="rab-ev-title">{e.title}</span>
        {e.location ? <span className="rab-ev-loc"><MapPin size={11} /> {e.location}</span> : null}
        {e.organizer && (pending || rsvp === 'declined') ? <span className="rab-ev-loc">Convite de {e.organizer}</span> : null}
      </span>
      <span className="rab-ev-tags">
        {resp && resp !== 'unknown' && <span className={`rab-tag rab-tag-${resp === 'organizer' ? 'own' : rsvp}`}>{RESP_LABEL[resp]}</span>}
        {conflict && (rsvp === 'accepted'
          ? <span className="rab-tag rab-tag-danger" title="Sobrepõe outro compromisso que você aceitou.">Conflito</span>
          : <span className="rab-tag rab-tag-warn" title="Se você aceitar este convite, ele vai sobrepor um compromisso que você já aceitou.">Choca com um aceito</span>)}
        {backToBack && <span className="rab-tag rab-tag-warn" title="Começa logo depois da reunião anterior — sem intervalo.">Sem intervalo</span>}
        {state === 'now' && <span className="rab-tag rab-tag-now">Agora</span>}
      </span>
    </div>
  );
}

function GapRow({ g }) {
  return <div className="rab-gap"><Coffee size={11} /> Livre {fmtDur(g.min)} · {hhmm(g.s)}–{hhmm(g.e)}</div>;
}

// Um dia: eventos em ordem, com as pausas entre os aceitos. Recusados só entram se `showDeclined`.
function DayList({ events, iso, now, showDeclined, limit, expanded, onExpand }) {
  const rows = useMemo(() => timelineRows(events, iso), [events, iso]);
  const allDay = events.filter((e) => e.allDay);
  const visibleRows = rows.filter((r) => r.type === 'gap' || showDeclined || r.rsvp !== 'declined');
  const shown = limit && !expanded ? visibleRows.filter((r) => r.type === 'event').slice(0, limit) : visibleRows;
  const hiddenCount = visibleRows.filter((r) => r.type === 'event').length - shown.filter((r) => r.type === 'event').length;
  return (
    <>
      {allDay.map((e) => <EventRow key={`ad-${e.id}`} e={e} now={now} rsvp={rsvpOf(e)} />)}
      {shown.map((r) => (r.type === 'gap'
        ? <GapRow key={`gap-${r.s}`} g={r} />
        : <EventRow key={`${iso}-${r.ev.id}`} e={r.ev} now={now} rsvp={r.rsvp} conflict={r.conflict} backToBack={r.backToBack} />))}
      {hiddenCount > 0 && onExpand && <button type="button" className="rab-more rab-more-btn" onClick={onExpand}>+ {hiddenCount} mais nesse dia</button>}
    </>
  );
}

const CSS = `
  .rab-card { width:min(680px,100%); background:var(--bg-2); border:1px solid var(--border-2); border-radius:14px; padding:18px 20px; margin-bottom:18px; text-align:left; }
  .rab-head { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  .rab-avatar { width:34px; height:34px; border-radius:50%; background:rgba(245,196,0,.16); color:#F5C400; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rab-name { font-size:11px; font-weight:800; letter-spacing:.06em; color:#F5C400; }
  .rab-greet { font-size:15px; font-weight:800; color:var(--text-1); }
  .rab-text { font-size:13px; color:var(--text-3); line-height:1.55; }
  .rab-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .rab-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; border-radius:8px; padding:9px 15px; cursor:pointer; border:1px solid transparent; text-decoration:none; font-family:inherit; }
  .rab-btn-primary { background:#F5C400; color:#111; }
  .rab-btn-ghost { background:transparent; border-color:var(--border-2); color:var(--text-4); }
  .rab-summary { font-size:13px; color:var(--text-2); line-height:1.5; margin-bottom:12px; }
  .rab-section { margin-top:14px; }
  .rab-week { max-height:460px; overflow-y:auto; padding-right:6px; }
  .rab-section-title { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); margin-bottom:6px; display:flex; justify-content:space-between; gap:8px; }
  .rab-day-title { font-size:12px; font-weight:800; color:var(--text-3); margin:10px 0 4px; }
  .rab-ev { display:flex; align-items:flex-start; gap:9px; padding:6px 0; font-size:12.5px; }
  .rab-ev-dot { width:8px; height:8px; border-radius:2px; margin-top:5px; flex-shrink:0; }
  .rab-ev-time { width:92px; flex-shrink:0; color:var(--text-5); font-variant-numeric:tabular-nums; }
  .rab-ev-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .rab-ev-title { color:var(--text-1); font-weight:700; overflow-wrap:anywhere; }
  .rab-ev-loc { color:var(--text-6); font-size:11.5px; display:flex; align-items:center; gap:3px; }
  .rab-ev-past .rab-ev-title, .rab-ev-past .rab-ev-time { color:var(--text-7); font-weight:500; text-decoration:line-through; }
  .rab-ev-past .rab-ev-dur { text-decoration:none; }
  .rab-ev-tag { font-size:10px; font-weight:800; text-transform:uppercase; padding:2px 7px; border-radius:999px; flex-shrink:0; }
  .rab-ev-tag-now { background:#F5C400; color:#111; }
  .rab-more { font-size:11.5px; color:var(--text-6); padding:2px 0 0 17px; }
  .rab-empty { font-size:12.5px; color:var(--text-6); padding:4px 0; }
  .rab-ev-dot { background:var(--c, #888); }
  .rab-ev-dot.rab-hollow { background:transparent; border:2px solid var(--c, #888); }
  .rab-ev-time { display:flex; flex-direction:column; gap:1px; }
  .rab-ev-dur { font-size:10.5px; color:var(--text-6); }
  .rab-ev-tags { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; flex-shrink:0; max-width:170px; }
  .rab-tag { font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .rab-tag-accepted { color:#3ecf6e; } .rab-tag-own { color:var(--text-5); }
  .rab-tag-pending, .rab-tag-tentative, .rab-tag-warn { color:#ff9f40; }
  .rab-tag-declined { color:#9a9a9a; } .rab-tag-danger { color:#e2574c; }
  .rab-tag.rab-tag-now { background:#F5C400; color:#111; border-color:#F5C400; text-transform:uppercase; }
  .rab-rsvp-declined .rab-ev-title { color:var(--text-5); font-weight:500; font-style:italic; }
  .rab-rsvp-declined .rab-ev-time, .rab-rsvp-declined .rab-ev-dot { opacity:.55; }
  .rab-rsvp-pending .rab-ev-title, .rab-rsvp-tentative .rab-ev-title { font-weight:600; }
  .rab-stats { display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 8px; }
  .rab-pill { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; border:1px solid var(--border-2); color:var(--text-4); white-space:nowrap; }
  .rab-pill-ok { color:#2fa85a; border-color:rgba(62,207,110,.5); } .rab-pill-warn { color:#d97706; border-color:rgba(255,159,64,.55); }
  .rab-pill-danger { color:#e2574c; border-color:rgba(226,87,76,.55); } .rab-pill-muted { color:var(--text-6); }
  .rab-gap { display:flex; align-items:center; gap:6px; margin:1px 0 1px 101px; padding:3px 9px; font-size:11.5px; font-weight:700; color:#2f8f6b; background:rgba(62,207,110,.10); border-radius:6px; width:fit-content; }
  .rab-more-btn { background:none; border:none; cursor:pointer; font-family:inherit; text-align:left; text-decoration:underline; }
  .rab-toggle { background:none; border:none; padding:0; font-family:inherit; font-size:11.5px; font-weight:700; color:var(--text-5); cursor:pointer; text-decoration:underline; }
  .rab-day-head { display:flex; flex-direction:column; gap:2px; margin:12px 0 4px; }
`;

export default function RenataAgendaBriefing({ user, onOpenAgenda }) {
  const firstName = ((user && user.name) || '').split(' ')[0] || (user && user.username) || '';
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState({ phase: 'loading', events: [], configured: true });
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [reloadTick, setReloadTick] = useState(0);
  const [showDeclined, setShowDeclined] = useState(false);
  const [expandedDays, setExpandedDays] = useState(() => new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const win = useMemo(() => weekWindow(now), [isoDate(now)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayKey = isoDate(now);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const from = startOfDay(new Date());
      const to = weekWindow(new Date()).end;
      try {
        const res = await apiGet(`/api/agenda?start=${from.toISOString()}&end=${to.toISOString()}`);
        if (cancelled) return;
        if (!res.connected) {
          let configured = true;
          try { configured = (await apiGet('/api/google/status')).configured !== false; } catch { /* mantém true */ }
          if (!cancelled) setState({ phase: 'disconnected', events: [], configured });
          return;
        }
        setState({ phase: 'ready', events: (res.events || []).map(normalizeEvent).filter(Boolean), configured: true });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, phase: 'error' }));
      }
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [dayKey, reloadTick]);

  function dismiss() {
    setDismissed(true);
    try { window.sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem storage, só some até recarregar */ }
  }

  const today = isoDate(now);
  const todayEvents = useMemo(() => eventsOnDay(state.events, today), [state.events, today]);
  const todaySum = useMemo(() => summarizeDay(todayEvents, today), [todayEvents, today]);
  const weekDays = useMemo(() => {
    const out = [];
    for (let d = new Date(win.start); d < win.end; d = addDays(d, 1)) {
      const iso = isoDate(d);
      const list = eventsOnDay(state.events, iso);
      if (list.length) out.push({ iso, date: new Date(d), list, sum: summarizeDay(list, iso) });
    }
    return out;
  }, [state.events, win]);
  const totalDeclined = todaySum.declined + weekDays.reduce((n, d) => n + d.sum.declined, 0);
  const toggleDay = (iso) => setExpandedDays((set) => { const n = new Set(set); n.add(iso); return n; });

  if (state.phase === 'disconnected' && (!state.configured || dismissed)) return null;

  const greeting = `${greetingFor(now)}, ${firstName}!`;

  return (
    <>
      <style>{CSS}</style>
      <div className="rab-card">
        <div className="rab-head">
          <div className="rab-avatar"><Sparkles size={17} /></div>
          <div>
            <div className="rab-name">RENATA</div>
            <div className="rab-greet">{state.phase === 'disconnected' ? `Olá, ${firstName}! Vamos conectar sua agenda?` : greeting}</div>
          </div>
        </div>

        {state.phase === 'loading' && <div className="rab-text">Dando uma olhada na sua agenda…</div>}

        {state.phase === 'error' && (
          <>
            <div className="rab-text">Não consegui ler sua agenda agora. Se isso continuar, reconecte o Google Calendar.</div>
            <div className="rab-actions">
              <button type="button" className="rab-btn rab-btn-ghost" onClick={() => { setState((s) => ({ ...s, phase: 'loading' })); setReloadTick((k) => k + 1); }}>Tentar de novo</button>
              <a className="rab-btn rab-btn-ghost" href="/api/google/oauth/start"><Link2 size={14} /> Reconectar</a>
            </div>
          </>
        )}

        {state.phase === 'disconnected' && (
          <>
            <div className="rab-text">Conectando o seu Google Calendar, eu te mostro aqui, toda vez que você entrar, as reuniões de hoje e da semana. Leva menos de um minuto.</div>
            <div className="rab-actions">
              <a className="rab-btn rab-btn-primary" href="/api/google/oauth/start"><Link2 size={14} /> Conectar minha agenda</a>
              <button type="button" className="rab-btn rab-btn-ghost" onClick={dismiss}>Agora não</button>
            </div>
          </>
        )}

        {state.phase === 'ready' && (
          <>
            <div className="rab-summary">{todayHeadline(todaySum, todayEvents, now)}</div>

            {todayEvents.length > 0 && (
              <div className="rab-section">
                <div className="rab-section-title">
                  <span>Hoje · {WEEKDAY_LONG[now.getDay()]}, {pad2(now.getDate())}/{pad2(now.getMonth() + 1)}</span>
                  {totalDeclined > 0 && <button type="button" className="rab-toggle" onClick={() => setShowDeclined((v) => !v)}>{showDeclined ? 'Ocultar recusados' : 'Mostrar recusados'}</button>}
                </div>
                <DayStats s={todaySum} />
                <DayList events={todayEvents} iso={today} now={now} showDeclined={showDeclined} />
              </div>
            )}

            <div className="rab-section">
              <div className="rab-section-title"><span>{win.label}</span></div>
              {weekDays.length === 0 && <div className="rab-empty">Nada na agenda {win.label === 'Semana que vem' ? 'da semana que vem' : 'pro resto da semana'}.</div>}
              <div className="rab-week">
              {weekDays.map((d) => (
                <div key={d.iso}>
                  <div className="rab-day-head">
                    <div className="rab-day-title" style={{ margin: 0 }}>{WEEKDAY_LONG[d.date.getDay()]}, {pad2(d.date.getDate())}/{pad2(d.date.getMonth() + 1)}</div>
                    <DayStats s={d.sum} compact />
                  </div>
                  <DayList events={d.list} iso={d.iso} now={now} showDeclined={showDeclined} limit={MAX_PER_WEEK_DAY} expanded={expandedDays.has(d.iso)} onExpand={() => toggleDay(d.iso)} />
                </div>
              ))}
              </div>
            </div>

            {onOpenAgenda && (
              <div className="rab-actions">
                <button type="button" className="rab-btn rab-btn-ghost" onClick={onOpenAgenda}>Ver agenda completa <ArrowRight size={14} /></button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
