// Painel da RENATA na tela inicial (2026-09-20). Logo após o login, quem conectou o Google
// Calendar vê, em dois segundos, COMO É o próximo dia dele: uma frase-resposta ("Segunda está
// cheia"), a semana num relance, o dia como linha do tempo (onde estão as reuniões, as pausas e
// os choques) e só o que exige atenção, em palavras. Quem não conectou é convidado a conectar.
// Não usa IA — lê `/api/agenda` (a mesma da tela Agenda) e monta tudo localmente, sem gastar
// token. Regras de tempo ocupado/livre/pausa/conflito em dayLoad.js (só o ACEITO ocupa tempo).
//
// Redesenho (mesmo dia): a 1ª versão era um relatório — 3 a 5 etiquetas por linha, uma parede de
// pílulas e o mesmo dado repetido; ninguém lê aquilo todo dia. Princípio agora: uma resposta, um
// gráfico, no máximo 3 avisos; cor só para o que pede ação (laranja = responder, vermelho = choque).
//
// 2º redesenho (2026-09-22, mockup aprovado pelo Rafael): de 1 cartão só pra vários cartões
// (visão geral, trilho da semana, agenda do dia, atenção, reuniões) — cada seção com seu título,
// mais fácil de escanear. Chips com ícone pras estatísticas, painel lateral com o veredito do dia
// ("Dia com alta ocupação"), legenda fixa com "horário livre", régua de hora em hora, almoço como
// selo flutuante e a caixa de atenção com o tom (verde/laranja/vermelho) do aviso mais grave.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, MapPin, ArrowRight, Link2, TriangleAlert, CircleHelp, Utensils, Timer, ChevronRight, Calendar, Clock, BarChart2, Activity } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { WORK, rsvpOf, isPendingRsvp, summarizeDay, timelineRows, durationMin, fmtDur, hhmm } from './dayLoad.js';
import { loadPrefs, savePrefs, validatePrefs, parseHHMM, DEFAULT_PREFS, isDefaultPrefs } from './agendaPrefs.js';

const SOURCE_COLOR = { google: '#5B8DEF', xflow_ticket: '#b98af5', activity: '#3ecf6e', crm_activity: '#F5C400' };
const DAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const DAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DISMISS_KEY = 'renata-agenda-dismissed';
const MAX_ROWS = 7;
const HEAVY_MIN = 360;

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

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

// "Hoje" / "Amanhã" / "Segunda" — e o gênero certo pro adjetivo ("Segunda estará cheia", "Hoje está cheio").
function dayWord(iso, todayIso, date) {
  if (iso === todayIso) return { name: 'Hoje', fem: false };
  if (iso === isoDate(addDays(new Date(`${todayIso}T12:00:00`), 1))) return { name: 'Amanhã', fem: false };
  const dow = date.getDay();
  return { name: DAY_NAME[dow], fem: dow >= 1 && dow <= 5 };
}

// Quão pesado é o dia (só o tempo ACEITO conta). `bucketOf` é a mesma faixa sem gênero, usada pro
// painel lateral (que não faz frase, só título curto).
function bucketOf(min) {
  if (min === 0) return 'livre';
  if (min < 120) return 'leve';
  if (min < 240) return 'tranquilo';
  if (min < HEAVY_MIN) return 'cheio';
  return 'pesado';
}
function weight(min, fem) {
  const b = bucketOf(min);
  if (b === 'tranquilo' || b === 'cheio' || b === 'pesado') return fem ? `${b.slice(0, -1)}a` : b;
  return b;
}

// Veredito curto pro painel lateral do cartão de visão geral: título + explicação de 1 linha.
function sidePanelFor(min, isToday, freeMin) {
  const b = bucketOf(min);
  const when = isToday ? 'ainda hoje' : 'nesse dia';
  if (b === 'livre') return { tone: 'ok', icon: Sparkles, title: 'Dia livre', sub: 'Nenhuma reunião aceita — ótimo para focar.' };
  if (b === 'leve') return { tone: 'ok', icon: Sparkles, title: 'Dia leve', sub: `Só ${fmtDur(min)} comprometidas. Sobra tempo livre.` };
  if (b === 'tranquilo') return { tone: 'ok', icon: Activity, title: 'Dia tranquilo', sub: `${fmtDur(freeMin)} livres ${when}.` };
  if (b === 'cheio') return { tone: 'warn', icon: BarChart2, title: 'Dia cheio', sub: `${fmtDur(freeMin)} livres ${when}.` };
  return { tone: 'warn', icon: BarChart2, title: 'Dia com alta ocupação', sub: `Mantenha o foco! Você tem ${fmtDur(freeMin)} livres ${when}.` };
}

// O dia que interessa AGORA: hoje enquanto ainda há reunião aceita pela frente; senão, o próximo dia com algo.
function pickFocus(days, now) {
  const today = days[0];
  const upcoming = today.list.some((e) => !e.allDay && !e.transparent && rsvpOf(e) === 'accepted' && e.endDate > now);
  if (upcoming) return today.iso;
  const next = days.slice(1).find((d) => d.sum.confirmed + d.sum.pending + d.sum.allDayAccepted > 0);
  return next ? next.iso : today.iso;
}

// No máximo 3 avisos, do mais para o menos urgente. Só fala do que pede atenção (ou ajuda de fato).
function insightsFor(sum, isToday, now) {
  const out = [];
  sum.conflicts.slice(0, 2).forEach((c) => out.push({ tone: 'danger', icon: TriangleAlert, text: `${fmtTime(c.b.startDate)} — “${c.a.title}” e “${c.b.title}” ao mesmo tempo` }));
  if (sum.pending > 0) {
    const bits = [];
    if (sum.pendingConflicts > 0) bits.push(`${sum.pendingConflicts} ${sum.pendingConflicts === 1 ? 'choca' : 'chocam'} com o que você aceitou`);
    if (sum.lunch.ok && sum.lunch.pendingBlockers.length > 0) bits.push(`${sum.lunch.pendingBlockers.length === 1 ? '1 pega' : `${sum.lunch.pendingBlockers.length} pegam`} o seu almoço`);
    out.push({ tone: 'warn', icon: CircleHelp, text: `${sum.pending} ${sum.pending === 1 ? 'convite aguarda' : 'convites aguardam'} sua resposta${bits.length ? ` (${bits.join('; ')})` : ''}` });
  }
  if (!sum.lunch.ok && sum.lunch.blockers.length > 0) {
    const b = sum.lunch.blockers[0];
    const more = sum.lunch.blockers.length - 1;
    out.push({ tone: 'warn', icon: Utensils, text: `Reunião no seu almoço (${hhmm(sum.lunch.start)}–${hhmm(sum.lunch.end)}): “${b.title}” ${hhmm(b.s)}–${hhmm(b.e)}${more > 0 ? ` e mais ${more}` : ''}` });
  }
  else if (sum.longestRun && sum.longestRun.min >= WORK.longRun) out.push({ tone: 'warn', icon: Timer, text: `${fmtDur(sum.longestRun.min)} seguidas sem pausa (${hhmm(sum.longestRun.s)}–${hhmm(sum.longestRun.e)})` });
  const nowMin = minutesOf(now);
  const best = sum.gaps.filter((g) => !isToday || g.e > nowMin + 30).reduce((b, g) => (!b || g.min > b.min ? g : b), null);
  if (best && sum.confirmed > 0) {
    const from = Math.max(best.s, isToday ? nowMin : 0);
    if (best.e - from >= 90) out.push({ tone: 'ok', icon: Sparkles, text: `Melhor janela livre: ${hhmm(from)}–${hhmm(best.e)} (${fmtDur(best.e - from)})` });
  }
  return out.slice(0, 3);
}

// Encaixa em faixas o que se sobrepõe (guloso simples).
function packLanes(items) {
  const ends = [];
  return [...items].sort((a, b) => a.s - b.s || a.e - b.e).map((it) => {
    let lane = ends.findIndex((x) => x <= it.s);
    if (lane === -1) { lane = ends.length; ends.push(it.e); } else ends[lane] = it.e;
    return { ...it, lane };
  });
}

// O dia numa linha do tempo do EXPEDIENTE: blocos com o nome da reunião (até 2 linhas), faixa
// verde tracejada onde há pausa longa, almoço como selo flutuante centrado no horário. O que cai
// fora do expediente não estica a régua — some daqui, mas continua na lista "Reuniões de hoje".
function DayBar({ items, sum, isToday, now }) {
  if (!items.length) return null;
  const rs = sum.work.start;
  const re = sum.work.end;
  const span = re - rs;
  const pct = (m) => ((Math.min(re, Math.max(rs, m)) - rs) / span) * 100;
  const inside = items.filter((i) => i.e > rs && i.s < re);
  const packed = packLanes(inside);
  const lanes = packed.length ? Math.max(...packed.map((p) => p.lane)) + 1 : 1;
  const LANE = 40;
  const height = lanes * LANE + (lanes - 1) * 4;
  const ticks = [];
  for (let h = Math.ceil(rs / 60); h * 60 <= re; h += 1) ticks.push(h);
  const nowMin = minutesOf(now);
  const lunchIn = sum.lunch.end > rs && sum.lunch.start < re;
  const lunchBusy = sum.lunch.blockers.length > 0;
  const lunchMid = (Math.max(sum.lunch.start, rs) + Math.min(sum.lunch.end, re)) / 2;
  return (
    <div className="rab-bar" aria-label="Linha do tempo do expediente">
      <div className="rab-track" style={{ height }}>
        {sum.gaps.filter((g) => g.min >= 60 && g.e > rs && g.s < re).map((g) => {
          const w = pct(g.e) - pct(g.s);
          return (
            <div key={g.s} className="rab-free" style={{ left: `${pct(g.s)}%`, width: `${w}%` }}>
              {w > 13 ? <span>{fmtDur(g.min)} livre</span> : null}
            </div>
          );
        })}
        {packed.map((p) => {
          const w = Math.max(1, pct(p.e) - pct(p.s));
          const pending = isPendingRsvp(p.rsvp);
          const color = SOURCE_COLOR[p.ev.source] || '#5B8DEF';
          const clipped = p.s < rs || p.e > re;
          return (
            <div
              key={`${p.ev.id}-${p.s}`}
              className={`rab-blk${pending ? ' rab-blk-pending' : ''}${p.rsvp === 'declined' ? ' rab-blk-declined' : ''}${p.conflict && !pending ? ' rab-blk-conflict' : ''}${clipped ? ' rab-blk-clipped' : ''}`}
              style={{ left: `${pct(p.s)}%`, width: `${w}%`, top: p.lane * (LANE + 4), height: LANE, '--c': color }}
              title={`${hhmm(p.s)}–${hhmm(p.e)} · ${p.ev.title}${pending ? ' (sem resposta)' : ''}${p.conflict && !pending ? ' — choca com outra reunião aceita' : ''}`}
            >
              {w > 6 ? <span>{p.ev.title}</span> : null}
            </div>
          );
        })}
        {isToday && nowMin >= rs && nowMin <= re && <div className="rab-now" style={{ left: `${pct(nowMin)}%` }} title={`Agora, ${hhmm(nowMin)}`} />}
      </div>
      <div className="rab-ticks">
        {ticks.map((h) => <span key={h} style={{ left: `${pct(h * 60)}%` }}>{h}h</span>)}
      </div>
      {lunchIn && (
        <div className="rab-lunchrow">
          <div className={`rab-lunchpill${lunchBusy ? ' rab-lunch-busy' : ''}`} style={{ left: `${pct(lunchMid)}%` }}
            title={`Seu almoço: ${hhmm(sum.lunch.start)}–${hhmm(sum.lunch.end)} — ${lunchBusy ? 'ocupado por reunião' : 'livre'}`}>
            <b>Almoço{lunchBusy ? ' ocupado' : ''}</b>
            <i>{hhmm(sum.lunch.start)} – {hhmm(sum.lunch.end)}</i>
          </div>
        </div>
      )}
    </div>
  );
}

function EventLine({ row, now, isToday }) {
  const e = row.ev;
  const dur = durationMin(e);
  const pending = isPendingRsvp(row.rsvp);
  const declined = row.rsvp === 'declined';
  const past = isToday && e.endDate <= now;
  const current = isToday && e.startDate <= now && e.endDate > now;
  const sub = [e.location, (pending || declined) && e.organizer ? `Convite de ${e.organizer}` : ''].filter(Boolean);
  return (
    <div className={`rab-line${past ? ' rab-past' : ''}${declined ? ' rab-declined' : ''}`}>
      <span className={`rab-mark${pending ? ' rab-mark-pending' : ''}`} style={{ '--c': SOURCE_COLOR[e.source] || '#5B8DEF' }} title={pending ? 'Sem resposta — ainda não é compromisso' : declined ? 'Recusado' : 'Aceito'} />
      <span className="rab-lt">{fmtTime(e.startDate)}<i>{fmtTime(e.endDate)}</i></span>
      <span className="rab-lb">
        <b>{e.title}{row.conflict ? <TriangleAlert size={12} className="rab-lw" aria-label="Choca com outro compromisso" /> : null}{current ? <em className="rab-pill-now">agora</em> : null}</b>
        {sub.length ? <small>{e.location ? <MapPin size={10} /> : null}{sub.join(' · ')}</small> : null}
      </span>
      <span className="rab-ld">{declined ? 'recusado' : dur ? fmtDur(dur) : ''}</span>
    </div>
  );
}

const CSS = `
  .rab-shell { width:min(820px,100%); display:flex; flex-direction:column; gap:14px; margin-bottom:18px; text-align:left; }
  .rab-panel { background:var(--bg-2); border:1px solid var(--border-2); border-radius:16px; padding:20px 22px; box-shadow:0 1px 2px rgba(0,0,0,.05), 0 8px 22px rgba(0,0,0,.06); }
  .rab-top { display:flex; align-items:center; gap:11px; margin-bottom:16px; }
  .rab-avatar { width:32px; height:32px; border-radius:50%; background:rgba(245,196,0,.16); color:#F5C400; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rab-name { font-size:10.5px; font-weight:800; letter-spacing:.09em; color:#F5C400; }
  .rab-greet { font-size:13px; font-weight:700; color:var(--text-3); margin-top:1px; }
  .rab-spacer { flex:1; }
  .rab-link { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:800; color:var(--text-3); background:var(--bg-2); border:1px solid var(--border-2); border-radius:999px; cursor:pointer; font-family:inherit; padding:8px 14px; }
  .rab-link:hover { color:var(--text-1); border-color:var(--border-3); }
  .rab-eyebrow { font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--text-6); }
  .rab-verdict { font-size:28px; line-height:1.15; font-weight:800; color:var(--text-1); margin:4px 0 0; letter-spacing:-.01em; }
  .rab-chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; }
  .rab-chip { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:var(--text-2); background:var(--bg-3); border:1px solid var(--border-1); border-radius:999px; padding:7px 13px; }
  .rab-chip svg { color:var(--text-5); flex-shrink:0; }
  .rab-now-banner { display:flex; align-items:center; gap:9px; margin-top:12px; padding:10px 14px; border-radius:10px; background:rgba(245,196,0,.13); font-size:13px; color:var(--text-2); }
  .rab-now-banner b { font-weight:800; color:var(--text-1); }
  .rab-now-dot { width:7px; height:7px; border-radius:50%; background:#F5C400; flex-shrink:0; }
  .rab-hero { display:flex; align-items:stretch; gap:22px; }
  .rab-hero-main { flex:1; min-width:0; }
  .rab-divider { width:1px; align-self:stretch; background:var(--border-1); }
  .rab-side { width:210px; flex-shrink:0; padding-top:2px; }
  .rab-side-icon { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:11px; }
  .rab-side-ok { background:rgba(62,207,110,.15); color:#2f9e63; }
  .rab-side-warn { background:rgba(255,159,64,.16); color:#e08a2a; }
  .rab-side-title { font-size:14px; font-weight:800; color:var(--text-1); margin-bottom:4px; }
  .rab-side-sub { font-size:12.5px; color:var(--text-4); line-height:1.45; }
  @media (max-width:640px) { .rab-hero { flex-direction:column; } .rab-divider { display:none; } .rab-side { width:auto; padding-top:14px; margin-top:2px; border-top:1px solid var(--border-1); } }
  .rab-rail { display:grid; gap:8px; }
  .rab-day { display:flex; flex-direction:column; align-items:center; gap:2px; padding:9px 2px 7px; border-radius:12px; border:1px solid var(--border-1); background:var(--bg-2); cursor:pointer; font-family:inherit; color:var(--text-3); min-width:0; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .rab-day:hover { background:var(--bg-3); }
  .rab-day.rab-sel { background:var(--bg-3); border-color:var(--border-3); }
  .rab-dow { font-size:9.5px; font-weight:800; letter-spacing:.07em; color:var(--text-6); }
  .rab-num { font-size:15px; font-weight:800; color:var(--text-1); width:26px; height:26px; line-height:26px; border-radius:50%; }
  .rab-today.rab-sel { background:rgba(245,196,0,.1); border-color:rgba(245,196,0,.45); }
  .rab-today .rab-num { background:#F5C400; color:#111; }
  .rab-gauge { width:7px; height:30px; border-radius:4px; background:var(--bg-3); position:relative; overflow:hidden; margin:3px 0; }
  .rab-sel .rab-gauge { background:var(--bg-2); }
  .rab-gauge i { position:absolute; left:0; right:0; bottom:0; background:#5B8DEF; border-radius:4px; }
  .rab-gauge.rab-heavy i { background:#ff9f40; }
  .rab-hrs { font-size:10.5px; font-weight:700; color:var(--text-5); font-variant-numeric:tabular-nums; height:13px; }
  .rab-flags { display:flex; gap:4px; height:8px; margin-top:1px; }
  .rab-flag { width:7px; height:7px; border-radius:50%; }
  .rab-flag-c { background:#e2574c; } .rab-flag-p { background:#ff9f40; }
  .rab-empty-day .rab-num, .rab-empty-day .rab-dow { opacity:.6; }
  .rab-sec-h { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px 16px; margin-bottom:16px; }
  .rab-sectitle-row { display:flex; align-items:center; gap:9px; }
  .rab-sectitle { font-size:15px; font-weight:800; color:var(--text-1); }
  .rab-secsub { font-size:12px; color:var(--text-5); margin-top:2px; font-variant-numeric:tabular-nums; }
  .rab-count-badge { display:inline-flex; align-items:center; justify-content:center; min-width:21px; height:21px; padding:0 6px; border-radius:999px; background:var(--bg-3); border:1px solid var(--border-1); font-size:11px; font-weight:800; color:var(--text-3); }
  .rab-col-label { font-size:10.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-6); align-self:center; }
  .rab-leg2 { display:flex; flex-wrap:wrap; gap:5px 16px; font-size:11.5px; color:var(--text-5); }
  .rab-leg2 span { display:inline-flex; align-items:center; gap:6px; }
  .rab-leg2-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; }
  .rab-leg2-acc { background:#5B8DEF; } .rab-leg2-pen { background:#ff9f40; } .rab-leg2-con { background:#e2574c; } .rab-leg2-free { background:#3ecf6e; }
  .rab-bar { margin-top:2px; }
  .rab-track { position:relative; }
  .rab-free { position:absolute; top:0; bottom:0; background:rgba(62,207,110,.11); border:1.5px dashed rgba(47,158,99,.4); border-radius:8px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:11.5px; font-weight:800; color:#2f9e63; pointer-events:none; }
  .rab-blk { position:absolute; border-radius:6px; background:color-mix(in srgb, var(--c) 24%, transparent); border-left:3px solid var(--c); padding:4px 7px; display:flex; align-items:center; overflow:hidden; box-sizing:border-box; }
  .rab-blk span { font-size:10.5px; font-weight:700; color:var(--text-1); line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; word-break:break-word; }
  .rab-blk-pending { background:transparent; border:1.5px dashed var(--c); }
  .rab-blk-declined { opacity:.35; }
  .rab-blk-conflict { box-shadow:0 0 0 1.5px #e2574c inset; }
  .rab-blk-clipped { border-radius:6px 0 0 6px; }
  .rab-now { position:absolute; top:-3px; bottom:-3px; width:2px; background:#F5C400; border-radius:2px; box-shadow:0 0 0 2px rgba(245,196,0,.25); }
  .rab-ticks { position:relative; height:14px; margin-top:6px; }
  .rab-ticks span { position:absolute; transform:translateX(-50%); font-size:10px; color:var(--text-6); font-variant-numeric:tabular-nums; }
  .rab-lunchrow { position:relative; height:38px; margin-top:6px; }
  .rab-lunchpill { position:absolute; top:0; transform:translateX(-50%); padding:5px 13px; border-radius:10px; background:rgba(47,158,99,.09); border:1px solid rgba(47,158,99,.35); text-align:center; white-space:nowrap; box-sizing:border-box; }
  .rab-lunchpill b { display:block; font-size:10.5px; font-weight:800; color:#2f9e63; }
  .rab-lunchpill i { display:block; font-style:normal; font-size:9.5px; color:var(--text-5); margin-top:1px; }
  .rab-lunchpill.rab-lunch-busy { background:rgba(226,87,76,.1); border-color:rgba(226,87,76,.5); }
  .rab-lunchpill.rab-lunch-busy b { color:#e2574c; }
  .rab-cfg { margin-top:14px; padding:14px 16px; border:1px solid var(--border-2); border-radius:12px; background:var(--bg-1); }
  .rab-cfg-t { font-size:12.5px; font-weight:800; color:var(--text-1); margin-bottom:10px; }
  .rab-cfg-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; color:var(--text-3); }
  .rab-cfg-lb { width:78px; font-weight:800; color:var(--text-2); }
  .rab-cfg-row input { width:auto; padding:7px 10px; font-size:13px; border-radius:8px; font-variant-numeric:tabular-nums; }
  .rab-cfg-act { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .rab-cfg-act .rab-btn { padding:7px 13px; }
  .rab-cfg-err { margin-top:9px; font-size:12px; color:#e2574c; }
  .rab-cfg-hint { margin-top:10px; font-size:11.5px; color:var(--text-6); line-height:1.45; }
  .rab-att { display:flex; align-items:flex-start; gap:14px; }
  .rab-att-danger { background:rgba(226,87,76,.06); border-color:rgba(226,87,76,.22); }
  .rab-att-warn { background:rgba(255,159,64,.07); border-color:rgba(255,159,64,.22); }
  .rab-att-ok { background:rgba(62,207,110,.06); border-color:rgba(62,207,110,.22); }
  .rab-att-icon { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rab-att-danger .rab-att-icon { background:rgba(226,87,76,.15); color:#e2574c; }
  .rab-att-warn .rab-att-icon { background:rgba(255,159,64,.17); color:#e08a2a; }
  .rab-att-ok .rab-att-icon { background:rgba(62,207,110,.16); color:#2f9e63; }
  .rab-att-body { flex:1; min-width:0; }
  .rab-att-title { font-size:14px; font-weight:800; color:var(--text-1); margin-bottom:9px; }
  .rab-att-list { display:flex; flex-direction:column; gap:8px; }
  .rab-ins { display:flex; align-items:center; gap:9px; font-size:13px; color:var(--text-2); line-height:1.35; }
  .rab-ins-i { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rab-ins-danger .rab-ins-i { background:rgba(226,87,76,.15); color:#e2574c; } .rab-ins-warn .rab-ins-i { background:rgba(255,159,64,.16); color:#e08a2a; } .rab-ins-ok .rab-ins-i { background:rgba(62,207,110,.15); color:#2f9e63; }
  .rab-list { border-top:1px solid var(--border-1); padding-top:6px; }
  .rab-line { display:grid; grid-template-columns:12px 84px minmax(0,1fr) auto; align-items:start; gap:10px; padding:10px 0; }
  .rab-line + .rab-line { border-top:1px solid var(--border-1); }
  .rab-mark { width:8px; height:8px; border-radius:50%; background:var(--c); margin-top:6px; box-sizing:border-box; }
  .rab-mark-pending { background:transparent; border:2px solid #ff9f40; }
  .rab-lt { font-size:13px; font-weight:800; color:var(--text-1); font-variant-numeric:tabular-nums; display:flex; flex-direction:column; line-height:1.2; }
  .rab-lt i { font-style:normal; font-weight:600; font-size:11px; color:var(--text-6); }
  .rab-lb { min-width:0; display:flex; flex-direction:column; gap:2px; }
  .rab-lb b { font-size:13.5px; font-weight:700; color:var(--text-1); overflow-wrap:anywhere; }
  .rab-lb small { font-size:11.5px; color:var(--text-6); display:flex; align-items:center; gap:4px; }
  .rab-lw { color:#e2574c; margin-left:6px; vertical-align:-1px; }
  .rab-pill-now { font-style:normal; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; background:#F5C400; color:#111; padding:1px 7px; border-radius:999px; margin-left:8px; }
  .rab-ld { font-size:12px; color:var(--text-5); font-variant-numeric:tabular-nums; white-space:nowrap; padding-top:1px; }
  .rab-past { opacity:.45; }
  .rab-declined .rab-lb b { font-weight:500; font-style:italic; color:var(--text-5); }
  .rab-declined .rab-mark { opacity:.4; }
  .rab-foot { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--border-1); font-size:11px; color:var(--text-6); }
  .rab-legend { display:inline-flex; align-items:center; gap:5px; }
  .rab-legend i { width:8px; height:8px; border-radius:50%; background:#5B8DEF; display:inline-block; box-sizing:border-box; }
  .rab-legend i.h { background:transparent; border:2px solid #ff9f40; }
  .rab-toggle { background:none; border:none; padding:0; font-family:inherit; font-size:11.5px; font-weight:700; color:var(--text-5); cursor:pointer; text-decoration:underline; }
  .rab-quiet { font-size:13.5px; color:var(--text-4); padding:2px 0 4px; }
  .rab-text { font-size:13px; color:var(--text-3); line-height:1.55; }
  .rab-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .rab-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; border-radius:8px; padding:9px 15px; cursor:pointer; border:1px solid transparent; text-decoration:none; font-family:inherit; }
  .rab-btn-primary { background:#F5C400; color:#111; }
  .rab-btn-ghost { background:transparent; border-color:var(--border-2); color:var(--text-4); }
  @media (max-width:520px) { .rab-verdict { font-size:23px; } .rab-line { grid-template-columns:12px 64px minmax(0,1fr) auto; gap:8px; } .rab-num { font-size:13px; width:22px; height:22px; line-height:22px; } }
`;

export default function RenataAgendaBriefing({ user, onOpenAgenda }) {
  const firstName = ((user && user.name) || '').split(' ')[0] || (user && user.username) || '';
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState({ phase: 'loading', events: [], configured: true });
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [reloadTick, setReloadTick] = useState(0);
  const [picked, setPicked] = useState(null); // dia escolhido no trilho (null = automático)
  const [showDeclined, setShowDeclined] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPrefs()); // expediente/almoço, por navegador
  const [cfg, setCfg] = useState(null); // {workStart, workEnd, lunchStart, lunchEnd, error} enquanto o ajuste está aberto

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
  // Hoje + o resto da janela (dias úteis: até domingo; fim de semana: a semana que vem inteira).
  const days = useMemo(() => {
    const out = [];
    const push = (d) => { const iso = isoDate(d); const list = eventsOnDay(state.events, iso); out.push({ iso, date: new Date(d), list, sum: summarizeDay(list, iso, { start: prefs.workStart, end: prefs.workEnd, lunchStart: prefs.lunchStart, lunchEnd: prefs.lunchEnd }) }); };
    push(startOfDay(new Date()));
    for (let d = new Date(win.start); d < win.end; d = addDays(d, 1)) push(d);
    return out;
  }, [state.events, win, today, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useMemo(() => pickFocus(days, now), [days, now]);
  const focus = days.find((d) => d.iso === (picked || auto)) || days[0];
  const focusIso = focus ? focus.iso : '';
  useEffect(() => { setShowAll(false); setShowDeclined(false); }, [focusIso]);
  // Hooks sempre antes de qualquer retorno antecipado.
  const rows = useMemo(() => (focus ? timelineRows(focus.list, focus.iso) : []), [focus]);

  if (state.phase === 'disconnected' && (!state.configured || dismissed)) return null;

  const greeting = `${greetingFor(now)}, ${firstName}`;
  const isToday = focusIso === today;
  const events = rows.filter((r) => r.type === 'event');
  const visible = events.filter((r) => showDeclined || r.rsvp !== 'declined');
  const shown = showAll ? visible : visible.slice(0, MAX_ROWS);
  const declinedCount = events.filter((r) => r.rsvp === 'declined').length;
  const word = focus ? dayWord(focus.iso, today, focus.date) : null;
  const sum = focus ? focus.sum : null;

  let verdictTitle = ''; let verdictSub = null; let nextLine = null;
  if (focus) {
    const s = sum;
    // Hoje é presente ("Hoje está cheio"); qualquer outro dia é futuro ("Amanhã estará cheio", "Segunda estará cheia").
    verdictTitle = `${word.name} ${isToday ? 'está' : 'estará'} ${weight(s.confirmedMin, word.fem)}`;
    if (s.confirmed > 0) verdictSub = null;
    else if (s.pending > 0) verdictSub = <>Nenhuma reunião confirmada</>;
    else if (s.allDayAccepted > 0) verdictSub = <>Só eventos de dia inteiro</>;
    else verdictSub = <>Nada na agenda</>;
    if (isToday) {
      const acc = focus.list.filter((e) => !e.allDay && !e.transparent && rsvpOf(e) === 'accepted');
      const cur = acc.find((e) => e.startDate <= now && e.endDate > now);
      const nxt = acc.find((e) => e.startDate > now);
      if (cur) nextLine = <>Agora: <b>{cur.title}</b> até {fmtTime(cur.endDate)}</>;
      else if (nxt) { const mins = Math.round((nxt.startDate - now) / 60000); nextLine = <>Próximo: <b>{nxt.title}</b> às {fmtTime(nxt.startDate)}{mins <= 90 ? ` · em ${fmtDur(mins)}` : ''}</>; }
    } else if (!picked && days[0].sum.confirmed > 0 && !days[0].list.some((e) => !e.allDay && !e.transparent && rsvpOf(e) === 'accepted' && e.endDate > now)) {
      // Só quando o painel escolheu sozinho o próximo dia porque hoje acabou (não quando a pessoa clicou noutro dia).
      nextLine = <>Hoje você já terminou. O resto do dia é seu.</>;
    }
  }
  const insights = focus ? insightsFor(sum, isToday, now) : [];
  const attInsights = insights.filter((i) => i.tone !== 'ok');
  const worstTone = attInsights.some((i) => i.tone === 'danger') ? 'danger' : attInsights.length ? 'warn' : 'ok';
  const attTitle = worstTone === 'ok' ? 'Hoje vai bem' : 'Atenção hoje';
  const AttIcon = worstTone === 'danger' ? TriangleAlert : worstTone === 'warn' ? CircleHelp : Sparkles;
  const attShown = attInsights.length > 0 ? attInsights : insights.filter((i) => i.tone === 'ok');
  const allDayNames = focus ? focus.list.filter((e) => e.allDay && rsvpOf(e) !== 'declined').map((e) => e.title) : [];
  const sidePanel = focus && sum.confirmed + sum.pending > 0 ? sidePanelFor(sum.confirmedMin, isToday, sum.freeMin) : null;
  const SideIcon = sidePanel ? sidePanel.icon : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="rab-shell">
        <div className="rab-panel rab-hero">
          <div className="rab-hero-main">
            <div className="rab-top">
              <div className="rab-avatar"><Sparkles size={16} /></div>
              <div>
                <div className="rab-name">RENATA</div>
                <div className="rab-greet">{state.phase === 'disconnected' ? `Olá, ${firstName}! Vamos conectar sua agenda?` : greeting}</div>
              </div>
              <div className="rab-spacer" />
              {state.phase === 'ready' && onOpenAgenda && <button type="button" className="rab-link" onClick={onOpenAgenda}>Agenda completa <ArrowRight size={13} /></button>}
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
                <div className="rab-text">Conectando o seu Google Calendar, eu te mostro aqui, toda vez que você entrar, como vai ser o seu dia e a sua semana. Leva menos de um minuto.</div>
                <div className="rab-actions">
                  <a className="rab-btn rab-btn-primary" href="/api/google/oauth/start"><Link2 size={14} /> Conectar minha agenda</a>
                  <button type="button" className="rab-btn rab-btn-ghost" onClick={dismiss}>Agora não</button>
                </div>
              </>
            )}

            {state.phase === 'ready' && focus && (
              <>
                <div className="rab-eyebrow">{isToday ? 'Hoje · ' : word.name === 'Amanhã' ? 'Amanhã · ' : ''}{DAY_NAME[focus.date.getDay()]}, {pad2(focus.date.getDate())}/{pad2(focus.date.getMonth() + 1)}</div>
                <div className="rab-verdict">{verdictTitle}</div>
                <div className="rab-chips">
                  <span className="rab-chip"><Calendar size={13} />{sum.confirmed} {sum.confirmed === 1 ? 'reunião' : 'reuniões'}</span>
                  <span className="rab-chip"><Clock size={13} />{fmtDur(sum.confirmedMin)} ocupadas</span>
                  <span className="rab-chip" title={`Livre = tempo sem reunião aceita dentro do seu expediente (${hhmm(sum.work.start)}–${hhmm(sum.work.end)}). Reunião fora desse horário conta em "ocupadas", mas não tira tempo livre.`}>
                    <Clock size={13} />{fmtDur(sum.freeMin)} livres das {hhmm(sum.work.start)} às {hhmm(sum.work.end)}
                  </span>
                </div>
                {verdictSub && <div className="rab-quiet" style={{ marginTop: 8 }}>{verdictSub}</div>}
                {nextLine && <div className="rab-now-banner"><span className="rab-now-dot" />{nextLine}</div>}
              </>
            )}
          </div>

          {state.phase === 'ready' && sidePanel && (
            <>
              <div className="rab-divider" />
              <div className="rab-side">
                <div className={`rab-side-icon rab-side-${sidePanel.tone}`}><SideIcon size={20} /></div>
                <div className="rab-side-title">{sidePanel.title}</div>
                <div className="rab-side-sub">{sidePanel.sub}</div>
              </div>
            </>
          )}
        </div>

        {state.phase === 'ready' && focus && (
          <>
            <div className="rab-rail" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Dias da semana">
              {days.map((d) => {
                const load = Math.min(1, d.sum.confirmedMin / 480);
                const flags = [d.sum.conflicts.length > 0 && 'c', d.sum.pending > 0 && 'p'].filter(Boolean);
                const empty = d.sum.confirmed + d.sum.pending + d.sum.allDayAccepted === 0;
                return (
                  <button
                    key={d.iso} type="button" role="tab" aria-selected={d.iso === focus.iso}
                    className={`rab-day${d.iso === focus.iso ? ' rab-sel' : ''}${d.iso === today ? ' rab-today' : ''}${empty ? ' rab-empty-day' : ''}`}
                    onClick={() => setPicked(d.iso)}
                    title={`${DAY_NAME[d.date.getDay()]}, ${pad2(d.date.getDate())}/${pad2(d.date.getMonth() + 1)} — ${d.sum.confirmed} aceitos (${fmtDur(d.sum.confirmedMin)})${d.sum.pending ? `, ${d.sum.pending} sem resposta` : ''}${d.sum.conflicts.length ? `, ${d.sum.conflicts.length} conflito(s)` : ''}`}
                  >
                    <span className="rab-dow">{DAY_SHORT[d.date.getDay()]}</span>
                    <span className="rab-num">{d.date.getDate()}</span>
                    <span className={`rab-gauge${d.sum.confirmedMin >= HEAVY_MIN ? ' rab-heavy' : ''}`}><i style={{ height: `${d.sum.confirmedMin ? Math.max(8, load * 100) : 0}%` }} /></span>
                    <span className="rab-hrs">{d.sum.confirmedMin ? fmtDur(d.sum.confirmedMin).replace(' min', 'm') : '—'}</span>
                    <span className="rab-flags">{flags.map((f) => <span key={f} className={`rab-flag rab-flag-${f}`} />)}</span>
                  </button>
                );
              })}
            </div>

            <div className="rab-panel">
              <div className="rab-sec-h">
                <div>
                  <div className="rab-sectitle">Agenda de {isToday ? 'hoje' : word.name === 'Amanhã' ? 'amanhã' : DAY_NAME[focus.date.getDay()].toLowerCase()}</div>
                  <div className="rab-secsub">{hhmm(sum.work.start)} – {hhmm(sum.work.end)}</div>
                </div>
                <div className="rab-leg2">
                  <span><i className="rab-leg2-dot rab-leg2-acc" />aceito</span>
                  <span><i className="rab-leg2-dot rab-leg2-pen" />sem resposta</span>
                  <span><i className="rab-leg2-dot rab-leg2-con" />choca</span>
                  <span><i className="rab-leg2-dot rab-leg2-free" />horário livre</span>
                </div>
              </div>
              {allDayNames.length > 0 && <div className="rab-quiet">Dia todo: {allDayNames.join(' · ')}</div>}
              {events.length === 0 && <div className="rab-quiet">Sem reuniões nesse dia. Bom para trabalho focado.</div>}
              {visible.length > 0 && <DayBar items={visible} sum={sum} isToday={isToday} now={now} />}
            </div>

            {attShown.length > 0 && (
              <div className={`rab-panel rab-att rab-att-${worstTone}`}>
                <div className="rab-att-icon"><AttIcon size={18} /></div>
                <div className="rab-att-body">
                  <div className="rab-att-title">{attTitle}</div>
                  <div className="rab-att-list">
                    {attShown.map((i, k) => { const Icon = i.icon; return <div key={k} className={`rab-ins rab-ins-${i.tone}`}><span className="rab-ins-i"><Icon size={12} /></span><span>{i.text}</span></div>; })}
                  </div>
                </div>
              </div>
            )}

            {visible.length > 0 && (
              <div className="rab-panel">
                <div className="rab-sec-h">
                  <div className="rab-sectitle-row"><span className="rab-sectitle">Reuniões de {isToday ? 'hoje' : word.name === 'Amanhã' ? 'amanhã' : DAY_NAME[focus.date.getDay()].toLowerCase()}</span><span className="rab-count-badge">{sum.confirmed}</span></div>
                  <span className="rab-col-label">Duração</span>
                </div>
                <div className="rab-list">
                  {shown.map((r) => <EventLine key={`${focus.iso}-${r.ev.id}`} row={r} now={now} isToday={isToday} />)}
                </div>

                <div className="rab-foot">
                  {visible.length > MAX_ROWS && (
                    <button type="button" className="rab-toggle" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Mostrar menos' : `Ver todos os ${visible.length}`}<ChevronRight size={12} style={{ verticalAlign: -1, marginLeft: 1, transform: showAll ? 'rotate(90deg)' : 'none' }} />
                    </button>
                  )}
                  {declinedCount > 0 && (
                    <button type="button" className="rab-toggle" onClick={() => setShowDeclined((v) => !v)}>
                      {showDeclined ? 'Ocultar' : 'Mostrar'} {declinedCount} {declinedCount === 1 ? 'recusado' : 'recusados'}<ChevronRight size={12} style={{ verticalAlign: -1, marginLeft: 1, transform: showDeclined ? 'rotate(90deg)' : 'none' }} />
                    </button>
                  )}
                  <span className="rab-legend"><i /> aceito</span>
                  <span className="rab-legend"><i className="h" /> sem resposta</span>
                  <span className="rab-legend"><TriangleAlert size={11} color="#e2574c" /> choca</span>
                  <button type="button" className="rab-toggle" onClick={() => setCfg(cfg ? null : { workStart: hhmm(prefs.workStart), workEnd: hhmm(prefs.workEnd), lunchStart: hhmm(prefs.lunchStart), lunchEnd: hhmm(prefs.lunchEnd), error: '' })} title="Muda o seu expediente e o horário de almoço usados no tempo livre e nos avisos">
                    <Utensils size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Expediente {hhmm(prefs.workStart)}–{hhmm(prefs.workEnd)} · Almoço {hhmm(prefs.lunchStart)}–{hhmm(prefs.lunchEnd)}{isDefaultPrefs(prefs) ? '' : ' (seu)'}
                  </button>
                </div>

                {cfg && (
                  <div className="rab-cfg" role="group" aria-label="Expediente e almoço">
                    <div className="rab-cfg-t">Meu horário de trabalho</div>
                    <div className="rab-cfg-row">
                      <span className="rab-cfg-lb">Expediente</span>
                      <label>das <input type="time" step="900" value={cfg.workStart} onChange={(e) => setCfg({ ...cfg, workStart: e.target.value, error: '' })} /></label>
                      <label>às <input type="time" step="900" value={cfg.workEnd} onChange={(e) => setCfg({ ...cfg, workEnd: e.target.value, error: '' })} /></label>
                    </div>
                    <div className="rab-cfg-row" style={{ marginTop: 8 }}>
                      <span className="rab-cfg-lb">Almoço</span>
                      <label>das <input type="time" step="900" value={cfg.lunchStart} onChange={(e) => setCfg({ ...cfg, lunchStart: e.target.value, error: '' })} /></label>
                      <label>às <input type="time" step="900" value={cfg.lunchEnd} onChange={(e) => setCfg({ ...cfg, lunchEnd: e.target.value, error: '' })} /></label>
                    </div>
                    {cfg.error && <div className="rab-cfg-err">{cfg.error}</div>}
                    <div className="rab-cfg-act">
                      <button type="button" className="rab-btn rab-btn-primary" onClick={() => {
                        const next = { workStart: parseHHMM(cfg.workStart), workEnd: parseHHMM(cfg.workEnd), lunchStart: parseHHMM(cfg.lunchStart), lunchEnd: parseHHMM(cfg.lunchEnd) };
                        const err = Object.values(next).some((v) => v == null) ? 'Preencha o início e o fim do expediente e do almoço.' : validatePrefs(next);
                        if (err) { setCfg({ ...cfg, error: err }); return; }
                        const r = savePrefs(next);
                        if (!r.ok) { setCfg({ ...cfg, error: r.error }); return; }
                        setPrefs(next); setCfg(null);
                      }}>Salvar</button>
                      {!isDefaultPrefs(prefs) && <button type="button" className="rab-btn rab-btn-ghost" onClick={() => { savePrefs(DEFAULT_PREFS); setPrefs({ ...DEFAULT_PREFS }); setCfg(null); }}>Voltar ao padrão ({hhmm(DEFAULT_PREFS.workStart)}–{hhmm(DEFAULT_PREFS.workEnd)}, almoço {hhmm(DEFAULT_PREFS.lunchStart)}–{hhmm(DEFAULT_PREFS.lunchEnd)})</button>}
                      <button type="button" className="rab-btn rab-btn-ghost" onClick={() => setCfg(null)}>Cancelar</button>
                    </div>
                    <div className="rab-cfg-hint">O “livre” é o tempo sem reunião aceita dentro do seu expediente; o almoço serve para avisar quando uma reunião aceita pega esse horário. Fica salvo neste navegador.</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
