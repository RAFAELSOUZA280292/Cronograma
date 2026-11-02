// Agenda por link iCal, só leitura (§128, 2026-11-02): o "endereço secreto no formato iCal" do Google Agenda, o "publicar agenda" do
// Outlook ou qualquer .ics público. Não pede permissão nenhuma ao provedor — por isso é o caminho de quem ainda não pode autorizar
// o painel (conta de fora do domínio, empresa sem administrador à mão). Puro (parser e recorrência) + busca protegida contra endereço
// interno (SSRF): só https, só IP público, resolvido na própria conexão, 5 MB e 15 s no máximo.

import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { unfoldIcs, parseLine, icsDate } from './calendarInvite.js';

export const MAX_FEED_BYTES = 5 * 1024 * 1024;

// webcal:// vira https://; o resto precisa ser https com host de verdade.
export function normalizeFeedUrl(raw) {
  const v = String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://');
  if (!v || v.length > 2000) return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  return u.toString();
}

// Endereço que o servidor nunca deve buscar: rede interna, loopback, link-local (inclui o 169.254.169.254 das nuvens), multicast.
export function isPrivateIp(ip) {
  const v = String(ip || '').replace(/^::ffff:/i, '');
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(v)) {
    const x = v.toLowerCase();
    return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff');
  }
  return true;
}

function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = (addrs || []).filter((a) => !isPrivateIp(a.address));
    if (!list.length) return cb(Object.assign(new Error('Endereço interno recusado.'), { code: 'PRIVATE_ADDRESS' }));
    if (opts && opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: safeLookup, timeout: 15000, headers: { 'User-Agent': 'PRICETAX-Painel/1.0 (agenda)', Accept: 'text/calendar, */*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve({ redirect: new URL(res.headers.location, url).toString() }); return; }
      if (res.statusCode !== 200) { res.resume(); reject(Object.assign(new Error(`O endereço respondeu ${res.statusCode}.`), { httpStatus: res.statusCode })); return; }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > MAX_FEED_BYTES) { req.destroy(); reject(new Error('A agenda passa de 5 MB.')); } else chunks.push(c); });
      res.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('O endereço da agenda demorou demais para responder.')));
    req.on('error', reject);
  });
}

export async function fetchFeed(rawUrl) {
  let url = normalizeFeedUrl(rawUrl);
  if (!url) throw Object.assign(new Error('Use o endereço https (ou webcal) da agenda.'), { status: 400 });
  for (let i = 0; i < 4; i += 1) {
    const r = await getOnce(url);
    if (r.text !== undefined) {
      if (!/BEGIN:VCALENDAR/i.test(r.text.slice(0, 2000))) throw Object.assign(new Error('O endereço não devolveu uma agenda no formato iCal.'), { status: 400 });
      return r.text;
    }
    url = normalizeFeedUrl(r.redirect);
    if (!url) throw new Error('A agenda redirecionou para um endereço não permitido.');
  }
  throw new Error('Redirecionamentos demais.');
}

// ---------- parser ----------

function unescapeText(v) { return String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

const WALL_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

// Todos os VEVENT do arquivo (o parseIcs do convite só lê o primeiro).
export function parseFeed(text) {
  const out = [];
  let cur = null; let depth = 0;
  for (const raw of unfoldIcs(text)) {
    if (!raw) continue;
    const line = parseLine(raw);
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (line.name === 'BEGIN') { depth += 1; continue; }
    if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') { out.push(cur); cur = null; continue; }
    if (line.name === 'END') { depth -= 1; continue; }
    if (depth > 0) continue; // VALARM e afins
    switch (line.name) {
      case 'UID': cur.uid = line.value.trim(); break;
      case 'SUMMARY': cur.title = unescapeText(line.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(line.value); break;
      case 'LOCATION': cur.location = unescapeText(line.value); break;
      case 'DTSTART': cur.dtstart = { value: line.value.trim(), params: line.params }; break;
      case 'DTEND': cur.dtend = { value: line.value.trim(), params: line.params }; break;
      case 'DURATION': cur.duration = line.value.trim(); break;
      case 'STATUS': cur.status = line.value.trim().toUpperCase(); break;
      case 'TRANSP': cur.transp = line.value.trim().toUpperCase(); break;
      case 'RRULE': cur.rrule = line.value.trim(); break;
      case 'EXDATE': for (const v of line.value.split(',')) cur.exdates.push({ value: v.trim(), params: line.params }); break;
      case 'RECURRENCE-ID': cur.recurrenceId = { value: line.value.trim(), params: line.params }; break;
      case 'ORGANIZER': cur.organizer = (line.params.CN || String(line.value || '').replace(/^mailto:/i, '')).trim(); break;
      default: break;
    }
  }
  return out.filter((e) => e.dtstart && WALL_RE.test(e.dtstart.value));
}

function durationMs(d) {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(d || ''));
  if (!m) return null;
  return (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const wallValue = (y, mo, d, time) => `${pad(y, 4)}${pad(mo)}${pad(d)}${time}`;
// Instante (ms) de um valor DTSTART/EXDATE/RECURRENCE-ID; dia inteiro = meia-noite de Brasília (só serve para comparar).
function instantOf(v) {
  const r = icsDate(v.value, v.params);
  if (!r) return NaN;
  return r.allDay ? Date.parse(`${r.date}T00:00:00-03:00`) : Date.parse(r.iso);
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(s) {
  const r = {};
  for (const part of String(s || '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) r[k.toUpperCase()] = v.toUpperCase();
  }
  return {
    freq: r.FREQ || '',
    interval: Math.max(1, Number(r.INTERVAL) || 1),
    count: r.COUNT ? Number(r.COUNT) : null,
    until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x); return m ? { n: m[1] ? Number(m[1]) : 0, wd: DAY_CODES.indexOf(m[2]) } : null; }).filter(Boolean) : [],
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number).filter((n) => n && Math.abs(n) <= 31) : [],
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number).filter((n) => n >= 1 && n <= 12) : [],
  };
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

// Dias (y, m, d) de um mês que batem com BYDAY (1MO, -1FR, MO = todas as segundas) ou BYMONTHDAY.
function monthDays(y, m, rule, fallbackDay) {
  const n = daysIn(y, m);
  if (rule.byday.length) {
    const out = [];
    for (const { n: ord, wd } of rule.byday) {
      const all = [];
      for (let d = 1; d <= n; d += 1) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) all.push(d);
      if (!ord) out.push(...all);
      else { const pick = ord > 0 ? all[ord - 1] : all[all.length + ord]; if (pick) out.push(pick); }
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  const days = rule.bymonthday.length ? rule.bymonthday : [fallbackDay];
  return days.map((d) => (d < 0 ? n + d + 1 : d)).filter((d) => d >= 1 && d <= n).sort((a, b) => a - b);
}

// Datas (y, m, d) da série, em ordem, a partir do DTSTART. Para sozinho no fim do período, no UNTIL ou no COUNT.
export function* occurrenceDates(start, rule, untilMs, toWallMs) {
  const { y: y0, m: m0, d: d0 } = start;
  const startMs = Date.UTC(y0, m0 - 1, d0);
  let guard = 0;
  const emit = (y, m, d) => ({ y, m, d, ms: Date.UTC(y, m - 1, d) });
  if (rule.freq === 'DAILY') {
    for (let k = 0; guard < 20000; k += rule.interval, guard += 1) {
      const dt = new Date(startMs + k * 86400000);
      const o = emit(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      if (o.ms > toWallMs || o.ms > untilMs) return;
      if (rule.bymonth.length && !rule.bymonth.includes(o.m)) continue;
      yield o;
    }
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length ? rule.byday.map((b) => b.wd) : [new Date(startMs).getUTCDay()];
    const monday = startMs - ((new Date(startMs).getUTCDay() + 6) % 7) * 86400000;
    const order = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    for (let w = 0; guard < 20000; w += rule.interval, guard += 1) {
      for (const wd of order) {
        const ms = monday + (w * 7 + ((wd + 6) % 7)) * 86400000;
        if (ms < startMs) continue;
        const dt = new Date(ms);
        const o = emit(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
        if (o.ms > toWallMs || o.ms > untilMs) return;
        yield o;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let k = 0; guard < 5000; k += rule.interval, guard += 1) {
      const y = y0 + Math.floor((m0 - 1 + k) / 12); const m = ((m0 - 1 + k) % 12) + 1;
      if (Date.UTC(y, m - 1, 1) > toWallMs || Date.UTC(y, m - 1, 1) > untilMs) return;
      if (rule.bymonth.length && !rule.bymonth.includes(m)) continue;
      for (const d of monthDays(y, m, rule, d0)) {
        const o = emit(y, m, d);
        if (o.ms < startMs) continue;
        if (o.ms > toWallMs || o.ms > untilMs) return;
        yield o;
      }
    }
  } else if (rule.freq === 'YEARLY') {
    const months = rule.bymonth.length ? rule.bymonth : [m0];
    for (let k = 0; guard < 500; k += rule.interval, guard += 1) {
      const y = y0 + k;
      if (Date.UTC(y, 0, 1) > toWallMs || Date.UTC(y, 0, 1) > untilMs) return;
      for (const m of months) {
        const days = (rule.byday.length || rule.bymonthday.length) ? monthDays(y, m, rule, d0) : (d0 <= daysIn(y, m) ? [d0] : []);
        for (const d of days) {
          const o = emit(y, m, d);
          if (o.ms < startMs) continue;
          if (o.ms > toWallMs || o.ms > untilMs) return;
          yield o;
        }
      }
    }
  }
}

function endFor(ev, startInfo, startMs) {
  if (ev.dtend) {
    const e = icsDate(ev.dtend.value, ev.dtend.params);
    if (e) return e.allDay ? Date.parse(`${e.date}T00:00:00-03:00`) - Date.parse(`${startInfo.date}T00:00:00-03:00`) : Date.parse(e.iso) - startMs;
  }
  const d = durationMs(ev.duration);
  if (d !== null) return d;
  return startInfo.allDay ? 86400000 : 0;
}

function shape(ev, startISOorDate, endISOorDate, allDay) {
  return {
    rawId: `${ev.uid || ev.title || 'evento'}|${startISOorDate}`,
    title: ev.title || '(sem título)',
    description: ev.description || '',
    location: ev.location || '',
    start: startISOorDate,
    end: endISOorDate,
    allDay,
    status: ev.status === 'CANCELLED' ? 'cancelled' : 'confirmed',
    transparent: ev.transp === 'TRANSPARENT',
    organizer: ev.organizer || '',
  };
}

function addDaysStr(date, n) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Ocorrências que caem no período [fromISO, toISO), já com exceções (EXDATE) e ocorrências alteradas (RECURRENCE-ID).
export function expandFeed(vevents, fromISO, toISO) {
  const from = Date.parse(fromISO); const to = Date.parse(toISO);
  const overrides = new Map(); // uid|instante → evento alterado
  for (const ev of vevents) if (ev.recurrenceId) overrides.set(`${ev.uid}|${instantOf(ev.recurrenceId)}`, ev);
  const out = [];
  const push = (ev, startInfo, startMs) => {
    const len = Math.max(0, endFor(ev, startInfo, startMs));
    if (startInfo.allDay) {
      const days = Math.max(1, Math.round(len / 86400000));
      const s = Date.parse(`${startInfo.date}T00:00:00-03:00`);
      if (s + days * 86400000 <= from || s >= to) return;
      out.push(shape(ev, startInfo.date, addDaysStr(startInfo.date, days), true));
    } else {
      const endMs = startMs + len;
      if (Math.max(endMs, startMs + 1) <= from || startMs >= to) return;
      out.push(shape(ev, new Date(startMs).toISOString(), new Date(endMs || startMs).toISOString(), false));
    }
  };
  for (const ev of vevents) {
    if (ev.recurrenceId) {
      const s = icsDate(ev.dtstart.value, ev.dtstart.params);
      if (s) push(ev, s, s.allDay ? Date.parse(`${s.date}T00:00:00-03:00`) : Date.parse(s.iso));
      continue;
    }
    const s0 = icsDate(ev.dtstart.value, ev.dtstart.params);
    if (!s0) continue;
    if (!ev.rrule) { push(ev, s0, s0.allDay ? Date.parse(`${s0.date}T00:00:00-03:00`) : Date.parse(s0.iso)); continue; }
    const rule = parseRRule(ev.rrule);
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq)) { push(ev, s0, s0.allDay ? Date.parse(`${s0.date}T00:00:00-03:00`) : Date.parse(s0.iso)); continue; }
    const m = WALL_RE.exec(ev.dtstart.value);
    const time = m[4] ? `T${m[4]}${m[5]}${m[6] || '00'}${m[7] || ''}` : '';
    const untilMs = rule.until ? (() => { const u = WALL_RE.exec(rule.until); return u ? Date.UTC(+u[1], +u[2] - 1, +u[3]) + 86399999 : Infinity; })() : Infinity; // corte por dia; o exato vem abaixo
    const untilExact = rule.until ? instantOf({ value: rule.until, params: ev.dtstart.params }) : Infinity;
    const ex = new Set(ev.exdates.map(instantOf));
    const toWall = to + 2 * 86400000; // folga para fusos
    let n = 0;
    for (const o of occurrenceDates({ y: +m[1], m: +m[2], d: +m[3] }, rule, untilMs, toWall)) {
      const value = wallValue(o.y, o.m, o.d, time);
      const info = icsDate(value, ev.dtstart.params);
      if (!info) continue;
      const startMs = info.allDay ? Date.parse(`${info.date}T00:00:00-03:00`) : Date.parse(info.iso);
      if (startMs > untilExact) break;
      n += 1;
      if (rule.count && n > rule.count) break;
      if (ex.has(startMs)) continue;
      if (overrides.has(`${ev.uid}|${startMs}`)) continue; // a ocorrência alterada entra pelo próprio VEVENT
      push(ev, info, startMs);
    }
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
