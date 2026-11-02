// Convite de reunião dentro de um e-mail (2026-11-02): lê a parte text/calendar (ou o anexo .ics) e devolve o que o cartão da
// Caixa de e-mail mostra. Puro, sem rede: a busca do evento na agenda (pelo UID) fica em googleCalendar.js. Ver PROJECT_CONTEXT §116zzz+.

const WINDOWS_TZ = {
  'e. south america standard time': 'America/Sao_Paulo',
  'south america standard time': 'America/Sao_Paulo',
  'sa eastern standard time': 'America/Fortaleza',
  'utc': 'UTC',
  'gmt standard time': 'Europe/London',
  'eastern standard time': 'America/New_York',
  'pacific standard time': 'America/Los_Angeles',
  'central standard time': 'America/Chicago',
};

// É convite? text/calendar, application/ics ou um anexo .ics.
export function isCalendarPart(a) {
  if (!a) return false;
  const mime = String(a.mimeType || '').toLowerCase();
  return mime === 'text/calendar' || mime === 'application/ics' || /\.ics$/i.test(String(a.filename || ''));
}

// Linhas dobradas (RFC 5545 §3.1): linha que começa com espaço/tab continua a anterior.
export function unfoldIcs(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(v) {
  return String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

// "ATTENDEE;CN=Fulano;PARTSTAT=TENTATIVE:mailto:x@y" → { name, params, value }
export function parseLine(line) {
  let i = 0; let quoted = false;
  for (; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) break;
  }
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const bits = head.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params = {};
  for (const p of bits.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: bits[0].toUpperCase(), params, value };
}

// Diferença (ms) entre o relógio do fuso e o UTC num instante.
function tzOffsetMs(tz, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

function zoneOf(tzid) {
  const raw = String(tzid || '').trim();
  const tz = WINDOWS_TZ[raw.toLowerCase()] || raw;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'America/Sao_Paulo'; }
}

// DTSTART/DTEND → { iso, allDay, date }. Sem fuso (hora "flutuante") vale o horário de Brasília.
export function icsDate(value, params = {}) {
  const v = String(value || '').trim();
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (d || params.VALUE === 'DATE') {
    const m = d || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { iso: null, allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) return { iso: new Date(wall).toISOString(), allDay: false, date: null };
  const tz = params.TZID ? zoneOf(params.TZID) : 'America/Sao_Paulo';
  let utc = wall - tzOffsetMs(tz, wall);
  utc = wall - tzOffsetMs(tz, utc);
  return { iso: new Date(utc).toISOString(), allDay: false, date: null };
}

function person(line) {
  const email = String(line.value || '').replace(/^mailto:/i, '').trim().toLowerCase();
  return {
    email,
    name: line.params.CN || '',
    response: ({ ACCEPTED: 'accepted', DECLINED: 'declined', TENTATIVE: 'tentative', 'NEEDS-ACTION': 'needsAction', DELEGATED: 'needsAction' })[String(line.params.PARTSTAT || '').toUpperCase()] || 'needsAction',
    optional: String(line.params.ROLE || '').toUpperCase() === 'OPT-PARTICIPANT',
  };
}

const MEET_RE = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
const TEAMS_RE = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/i;
const ZOOM_RE = /https:\/\/[\w.-]*zoom\.us\/j\/[^\s"<>]+/i;

// Link da videochamada: o campo do Google, ou o primeiro link de Meet/Teams/Zoom no local ou na descrição.
export function meetingLinkOf(ev) {
  if (ev.conference) return ev.conference;
  const hay = `${ev.location || ''}\n${ev.description || ''}`;
  const m = hay.match(MEET_RE) || hay.match(TEAMS_RE) || hay.match(ZOOM_RE);
  return m ? m[0] : '';
}

// Tira o bloco "-::~:~::~:~…" que o Google põe na descrição (instruções do Meet em inglês): o cartão já mostra o link.
function cleanDescription(text) {
  return String(text || '').replace(/-::~[:~]*::-[\s\S]*?-::~[:~]*::-/g, '').trim();
}

// Lê o arquivo de convite. Devolve null se não houver VEVENT.
export function parseIcs(text) {
  const lines = unfoldIcs(text);
  let method = '';
  let cur = null;
  const events = [];
  for (const raw of lines) {
    if (!raw) continue;
    const line = parseLine(raw);
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') { cur = { attendees: [] }; continue; }
    if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) { if (line.name === 'METHOD') method = line.value.trim().toUpperCase(); continue; }
    if (cur.inAlarm) { if (line.name === 'END' && /VALARM/i.test(line.value)) cur.inAlarm = false; continue; }
    if (line.name === 'BEGIN' && /VALARM/i.test(line.value)) { cur.inAlarm = true; continue; }
    switch (line.name) {
      case 'UID': cur.uid = line.value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeText(line.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(line.value); break;
      case 'LOCATION': cur.location = unescapeText(line.value); break;
      case 'DTSTART': cur.start = icsDate(line.value, line.params); break;
      case 'DTEND': cur.end = icsDate(line.value, line.params); break;
      case 'DURATION': cur.duration = line.value.trim(); break;
      case 'SEQUENCE': cur.sequence = Number(line.value) || 0; break;
      case 'STATUS': cur.status = line.value.trim().toUpperCase(); break;
      case 'RECURRENCE-ID': cur.recurrenceId = icsDate(line.value, line.params); break;
      case 'RRULE': cur.recurring = true; break;
      case 'ORGANIZER': cur.organizer = person(line); break;
      case 'ATTENDEE': cur.attendees.push(person(line)); break;
      case 'X-GOOGLE-CONFERENCE': cur.conference = line.value.trim(); break;
      case 'COMMENT': cur.comment = unescapeText(line.value); break;
      default: break;
    }
  }
  const ev = events[0];
  if (!ev || !ev.start) return null;
  if (!ev.end && ev.duration) {
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(ev.duration);
    if (m && ev.start.iso) {
      const ms = ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000;
      ev.end = { iso: new Date(Date.parse(ev.start.iso) + ms).toISOString(), allDay: false, date: null };
    }
  }
  const description = cleanDescription(ev.description);
  return {
    method: method || 'PUBLISH',
    kind: inviteKind(method, ev),
    uid: ev.uid || '',
    title: ev.summary || '(sem título)',
    description,
    location: ev.location || '',
    start: ev.start.iso || ev.start.date,
    end: (ev.end && (ev.end.iso || ev.end.date)) || ev.start.iso || ev.start.date,
    allDay: !!ev.start.allDay,
    recurring: !!ev.recurring || !!ev.recurrenceId,
    sequence: ev.sequence || 0,
    cancelled: ev.status === 'CANCELLED' || method === 'CANCEL',
    organizer: ev.organizer || null,
    attendees: ev.attendees,
    meetLink: meetingLinkOf({ ...ev, description: ev.description }),
    comment: ev.comment || '',
  };
}

// O que o e-mail é: convite (novo ou alterado), cancelamento, resposta de alguém ou proposta de novo horário.
export function inviteKind(method, ev) {
  const m = String(method || '').toUpperCase();
  if (m === 'CANCEL' || (ev && ev.status === 'CANCELLED')) return 'cancel';
  if (m === 'COUNTER') return 'counter';
  if (m === 'REPLY') return 'reply';
  if (m === 'REQUEST' && ev && ev.sequence > 0) return 'update';
  if (m === 'REQUEST') return 'request';
  return 'publish';
}

// Quem respondeu (REPLY/COUNTER): o participante que veio no arquivo e não é você.
export function replierOf(invite, myEmail) {
  const me = String(myEmail || '').toLowerCase();
  const list = (invite && invite.attendees) || [];
  return list.find((a) => a.email && a.email !== me) || list[0] || null;
}
