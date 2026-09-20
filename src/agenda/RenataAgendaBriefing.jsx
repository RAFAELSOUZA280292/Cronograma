// Painel da RENATA na tela inicial (2026-09-20, pedido do Rafael): logo após
// o login, quem já conectou o Google Calendar vê na hora os compromissos de
// hoje e do resto da semana; quem não conectou é convidado a conectar, com o
// botão à mão. Não usa IA — só lê `/api/agenda` (a mesma da tela Agenda) e
// monta o texto localmente, então não gasta token. Dia/hora "atuais" vêm do
// relógio do navegador do usuário e são reavaliados a cada 30s.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, MapPin, ArrowRight, Link2 } from 'lucide-react';
import { apiGet } from '../lib/api.js';

const SOURCE_COLOR = { google: '#5B8DEF', xflow_ticket: '#b98af5', activity: '#3ecf6e', crm_activity: '#F5C400' };
const SOURCE_LABEL = { google: 'Google Calendar', xflow_ticket: 'TASK do XFlow', activity: 'Atividade PRICETAX', crm_activity: 'Atividade do CRM' };
const WEEKDAY_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DISMISS_KEY = 'renata-agenda-dismissed';
const MAX_TODAY = 8;
const MAX_PER_WEEK_DAY = 4;

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

function todaySummary(todayEvents, now) {
  if (todayEvents.length === 0) return 'Hoje você não tem nada na agenda.';
  const timed = todayEvents.filter((e) => !e.allDay);
  const current = timed.find((e) => eventState(e, now) === 'now');
  const next = timed.find((e) => eventState(e, now) === 'upcoming');
  const n = todayEvents.length;
  const head = `Hoje você tem ${n} ${n === 1 ? 'compromisso' : 'compromissos'}`;
  if (current) return `${head}. Agora: ${current.title} (até ${fmtTime(current.endDate)}).`;
  if (next) return `${head}. Próximo: ${next.title} às ${fmtTime(next.startDate)}.`;
  if (timed.length > 0) return `${head}. Os compromissos com horário de hoje já passaram.`;
  return `${head}, todos de dia inteiro.`;
}

function EventRow({ e, now }) {
  const state = eventState(e, now);
  const time = e.allDay ? 'Dia todo' : `${fmtTime(e.startDate)}–${fmtTime(e.endDate)}`;
  return (
    <div className={`rab-ev rab-ev-${state}`}>
      <span className="rab-ev-dot" style={{ background: SOURCE_COLOR[e.source] || '#888' }} title={SOURCE_LABEL[e.source] || ''} />
      <span className="rab-ev-time">{time}</span>
      <span className="rab-ev-body">
        <span className="rab-ev-title">{e.title}</span>
        {e.location ? <span className="rab-ev-loc"><MapPin size={11} /> {e.location}</span> : null}
      </span>
      {state === 'now' && <span className="rab-ev-tag rab-ev-tag-now">Agora</span>}
    </div>
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
  .rab-week { max-height:300px; overflow-y:auto; padding-right:6px; }
  .rab-section-title { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-6); margin-bottom:6px; display:flex; justify-content:space-between; gap:8px; }
  .rab-day-title { font-size:12px; font-weight:800; color:var(--text-3); margin:10px 0 4px; }
  .rab-ev { display:flex; align-items:flex-start; gap:9px; padding:6px 0; font-size:12.5px; }
  .rab-ev-dot { width:8px; height:8px; border-radius:2px; margin-top:5px; flex-shrink:0; }
  .rab-ev-time { width:92px; flex-shrink:0; color:var(--text-5); font-variant-numeric:tabular-nums; }
  .rab-ev-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .rab-ev-title { color:var(--text-1); font-weight:700; overflow-wrap:anywhere; }
  .rab-ev-loc { color:var(--text-6); font-size:11.5px; display:flex; align-items:center; gap:3px; }
  .rab-ev-past .rab-ev-title, .rab-ev-past .rab-ev-time { color:var(--text-7); font-weight:500; text-decoration:line-through; }
  .rab-ev-tag { font-size:10px; font-weight:800; text-transform:uppercase; padding:2px 7px; border-radius:999px; flex-shrink:0; }
  .rab-ev-tag-now { background:#F5C400; color:#111; }
  .rab-more { font-size:11.5px; color:var(--text-6); padding:2px 0 0 17px; }
  .rab-empty { font-size:12.5px; color:var(--text-6); padding:4px 0; }
`;

export default function RenataAgendaBriefing({ user, onOpenAgenda }) {
  const firstName = ((user && user.name) || '').split(' ')[0] || (user && user.username) || '';
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState({ phase: 'loading', events: [], configured: true });
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [reloadTick, setReloadTick] = useState(0);

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
  const weekDays = useMemo(() => {
    const out = [];
    for (let d = new Date(win.start); d < win.end; d = addDays(d, 1)) {
      const iso = isoDate(d);
      const list = eventsOnDay(state.events, iso);
      if (list.length) out.push({ iso, date: new Date(d), list });
    }
    return out;
  }, [state.events, win]);

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
            <div className="rab-summary">{todaySummary(todayEvents, now)}</div>

            {todayEvents.length > 0 && (
              <div className="rab-section">
                <div className="rab-section-title"><span>Hoje · {WEEKDAY_LONG[now.getDay()]}, {pad2(now.getDate())}/{pad2(now.getMonth() + 1)}</span></div>
                {todayEvents.slice(0, MAX_TODAY).map((e) => <EventRow key={e.id} e={e} now={now} />)}
                {todayEvents.length > MAX_TODAY && <div className="rab-more">+ {todayEvents.length - MAX_TODAY} mais hoje</div>}
              </div>
            )}

            <div className="rab-section">
              <div className="rab-section-title"><span>{win.label}</span></div>
              {weekDays.length === 0 && <div className="rab-empty">Nada na agenda {win.label === 'Semana que vem' ? 'da semana que vem' : 'pro resto da semana'}.</div>}
              <div className="rab-week">
              {weekDays.map((d) => (
                <div key={d.iso}>
                  <div className="rab-day-title">{WEEKDAY_LONG[d.date.getDay()]}, {pad2(d.date.getDate())}/{pad2(d.date.getMonth() + 1)}</div>
                  {d.list.slice(0, MAX_PER_WEEK_DAY).map((e) => <EventRow key={`${d.iso}-${e.id}`} e={e} now={now} />)}
                  {d.list.length > MAX_PER_WEEK_DAY && <div className="rab-more">+ {d.list.length - MAX_PER_WEEK_DAY} mais nesse dia</div>}
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
