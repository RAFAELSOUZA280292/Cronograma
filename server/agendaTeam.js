// Agenda como a do Google, parte 2 (2026-11-02, noite; Rafael: "me inscrever na agenda dos meus funcionários e dos meus sócios",
// "Reunião com…", "Criar: evento, tarefa, ausente", "busca dentro desse calendário"). Tudo com o token Google DA PRÓPRIA PESSOA: o
// Google decide o que ela pode ver de cada colega (detalhes, ou só livre/ocupado). Nada de usar o token do colega.
// Assinaturas ficam em users.preferences.agendaTeam. Ver PROJECT_CONTEXT §138.

import { google } from 'googleapis';
import { pool } from './db.js';
import { getAuthedClientForUser, mapGoogleEvent } from './googleCalendar.js';

export const MAX_TEAM = 20;
export const MAX_PEOPLE = 6;
export const TEAM_COLORS = ['#8E24AA', '#E67C73', '#0B8043', '#F4511E', '#3F51B5', '#F6BF26', '#33B679', '#795548', '#D50000', '#039BE5'];
// Cores de evento do Google (colorId 1–11): o único jeito de a cor do compromisso valer também no Google e no celular.
export const GOOGLE_EVENT_COLORS = {
  1: ['#7986CB', 'Lavanda'], 2: ['#33B679', 'Sálvia'], 3: ['#8E24AA', 'Uva'], 4: ['#E67C73', 'Flamingo'], 5: ['#F6BF26', 'Banana'],
  6: ['#F4511E', 'Tangerina'], 7: ['#039BE5', 'Pavão'], 8: ['#616161', 'Grafite'], 9: ['#3F51B5', 'Mirtilo'], 10: ['#0B8043', 'Manjericão'], 11: ['#D50000', 'Tomate'],
};
export const eventColorOf = (colorId) => (GOOGLE_EVENT_COLORS[colorId] ? GOOGLE_EVENT_COLORS[colorId][0] : null);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const teamEventId = (email, rawId) => `team:${email}:${rawId}`;

// Lista de agendas assinadas, limpa: e-mail válido, sem repetir, sem a própria pessoa, cor válida, no máximo MAX_TEAM.
export function cleanSubscriptions(list, myEmail) {
  const me = normEmail(myEmail);
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const email = normEmail(raw && raw.email);
    if (!EMAIL.test(email) || email === me || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: String((raw && raw.name) || '').trim().slice(0, 80),
      color: isHex(raw && raw.color) ? raw.color : TEAM_COLORS[out.length % TEAM_COLORS.length],
      show: !(raw && raw.show === false),
    });
    if (out.length >= MAX_TEAM) break;
  }
  return out;
}

// Compromisso de um colega na grade: só leitura, na cor escolhida para a agenda dele. "Particular" no Google = "Ocupado".
export function mapTeamEvent(sub, ev) {
  const base = mapGoogleEvent(ev);
  const hidden = ev.visibility === 'private' || ev.visibility === 'confidential';
  return {
    id: teamEventId(sub.email, ev.id), source: 'team', account: `team:${sub.email}`, accountLabel: sub.name || sub.email, color: sub.color,
    title: hidden ? 'Ocupado' : base.title, description: hidden ? '' : base.description, location: hidden ? '' : base.location,
    start: base.start, end: base.end, allDay: base.allDay, status: base.status, transparent: base.transparent, owner: sub.email, readOnly: true,
  };
}

// Só livre/ocupado (o colega não compartilha os detalhes): blocos "Ocupado".
export function busyToEvents(sub, busy) {
  return (busy || []).filter((b) => b && b.start && b.end).map((b, i) => ({
    id: teamEventId(sub.email, `busy-${Date.parse(b.start)}-${i}`), source: 'team', account: `team:${sub.email}`, accountLabel: sub.name || sub.email,
    color: sub.color, title: 'Ocupado', description: '', location: '', start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString(),
    allDay: false, status: 'confirmed', owner: sub.email, readOnly: true, busyOnly: true,
  }));
}

const isScopeError = (e) => /insufficient|scope/i.test(String(e && e.message)) || (e && e.code === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE/i.test(JSON.stringify((e.response && e.response.data) || {})));
const apiDisabled = (e) => /has not been used|is disabled|SERVICE_DISABLED/i.test(String(e && e.message) + JSON.stringify((e && e.response && e.response.data) || {}));

async function clientOf(userId, authed) {
  const client = authed || await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('Conecte o seu Google (Meu perfil › Agenda) para usar a agenda do painel.'), { status: 409 });
  return client;
}

// Agendas de colegas no período. Para cada um: detalhes (events.list) ou, se o Google só libera livre/ocupado, freebusy.
// Devolve { events, calendars: [{ email, status: 'details'|'busy'|'none'|'scope'|'error', message }] }. Um colega com erro não derruba os outros.
export async function teamEvents(userId, subs, startISO, endISO, authed) {
  const list = (subs || []).filter((s) => s.show !== false);
  if (!list.length) return { events: [], calendars: [] };
  const client = await clientOf(userId, authed);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const events = []; const calendars = [];
  const needBusy = [];
  await Promise.all(list.map(async (sub) => {
    try {
      const { data } = await calendar.events.list({ calendarId: sub.email, timeMin: new Date(startISO).toISOString(), timeMax: new Date(endISO).toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 250 });
      events.push(...(data.items || []).filter((e) => e.status !== 'cancelled').map((e) => mapTeamEvent(sub, e)).filter((e) => e.start && e.end));
      calendars.push({ email: sub.email, status: 'details' });
    } catch (e) {
      if (e.code === 404 || e.code === 403) needBusy.push(sub);
      else calendars.push({ email: sub.email, status: 'error', message: 'Não consegui ler esta agenda agora.' });
    }
  }));
  if (needBusy.length) {
    try {
      const { data } = await calendar.freebusy.query({ requestBody: { timeMin: new Date(startISO).toISOString(), timeMax: new Date(endISO).toISOString(), timeZone: 'America/Sao_Paulo', items: needBusy.map((s) => ({ id: s.email })) } });
      for (const sub of needBusy) {
        const c = (data.calendars || {})[sub.email] || {};
        if (c.errors && c.errors.length) calendars.push({ email: sub.email, status: 'none', message: 'Esta pessoa não compartilha a agenda com você (nem livre/ocupado).' });
        else { events.push(...busyToEvents(sub, c.busy)); calendars.push({ email: sub.email, status: 'busy', message: 'Só livre/ocupado: a pessoa não compartilha os detalhes.' }); }
      }
    } catch (e) {
      const scope = isScopeError(e);
      for (const sub of needBusy) calendars.push({ email: sub.email, status: scope ? 'scope' : 'error', message: scope ? 'Reconecte o Google uma vez (Meu perfil › Agenda) para ver o livre/ocupado desta pessoa.' : 'Não consegui ler esta agenda agora.' });
    }
  }
  return { events, calendars };
}

// ---------- assinaturas (Outras agendas) ----------
export async function listSubscriptions(userId) {
  const { rows } = await pool.query("SELECT email, username, preferences->'agendaTeam' AS t FROM users WHERE id=$1", [userId]);
  const r = rows[0] || {};
  return cleanSubscriptions(r.t, r.email || r.username);
}
export async function saveSubscriptions(userId, list) {
  const { rows } = await pool.query('SELECT email, username FROM users WHERE id=$1', [userId]);
  const r = rows[0] || {};
  const clean = cleanSubscriptions(list, r.email || r.username);
  await pool.query("UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{agendaTeam}', $1::jsonb, true) WHERE id=$2", [JSON.stringify(clean), userId]);
  return clean;
}

// Pessoas para "Reunião com…" e para assinar: a equipe do painel (mesma base) com e-mail, quem começa com o digitado primeiro.
export function rankPeople(people, q) {
  const f = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = f(q).trim();
  if (!term) return people.slice(0, 12);
  const score = (p) => {
    const n = f(p.name); const e = f(p.email);
    if (n.startsWith(term) || e.startsWith(term)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(term))) return 1;
    if (n.includes(term) || e.includes(term)) return 2;
    return 9;
  };
  return people.map((p) => ({ p, s: score(p) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name, 'pt-BR')).slice(0, 12).map((x) => x.p);
}
export async function teamPeople(user, q) {
  const { rows } = await pool.query(
    `SELECT name, COALESCE(NULLIF(email, ''), username) AS email FROM users WHERE org_id=$1 AND id<>$2 AND COALESCE(blocked, false)=false`,
    [user.orgId, user.id],
  );
  const people = rows.map((r) => ({ name: r.name || '', email: normEmail(r.email) })).filter((p) => EMAIL.test(p.email));
  return rankPeople(people, q);
}

// ---------- busca dentro da agenda ----------
export async function searchEvents(userId, q, { fromISO, toISO } = {}) {
  const client = await clientOf(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const now = Date.now();
  const { data } = await calendar.events.list({
    calendarId: 'primary', q: String(q).slice(0, 120), singleEvents: true, orderBy: 'startTime', maxResults: 60,
    timeMin: new Date(fromISO || now - 365 * 86400000).toISOString(), timeMax: new Date(toISO || now + 365 * 86400000).toISOString(),
  });
  return (data.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({ ...mapGoogleEvent(e), account: 'principal', ...(eventColorOf(e.colorId) ? { color: eventColorOf(e.colorId) } : {}) })).filter((e) => e.start);
}

// ---------- Tarefas do Google (Google Tasks, lista padrão) ----------
function tasksError(e) {
  if (apiDisabled(e)) return Object.assign(new Error('A API de Tarefas do Google ainda não está ligada no projeto da PRICETAX. Rafael: abra console.cloud.google.com/apis/library/tasks.googleapis.com e clique em Ativar (uma vez).'), { status: 409, code: 'tasks_api_off' });
  if (isScopeError(e)) return Object.assign(new Error('Reconecte o Google uma vez (Meu perfil › Agenda) para liberar as Tarefas.'), { status: 409, code: 'needs_reconnect' });
  return e;
}
export function mapTask(t) {
  const due = t.due ? String(t.due).slice(0, 10) : null;
  return { id: `gtask-${t.id}`, source: 'gtask', title: t.title || '(sem título)', description: t.notes || '', start: due, end: due, allDay: true, status: 'confirmed', done: t.status === 'completed', readOnly: false };
}
export async function listTasks(userId, startDate, endDate, authed) {
  const client = authed || await getAuthedClientForUser(userId);
  if (!client) return [];
  const tasks = google.tasks({ version: 'v1', auth: client });
  try {
    const { data } = await tasks.tasks.list({ tasklist: '@default', dueMin: `${startDate}T00:00:00.000Z`, dueMax: `${endDate}T23:59:59.000Z`, showCompleted: true, showHidden: true, maxResults: 100 });
    return (data.items || []).filter((t) => t.due).map(mapTask);
  } catch (e) { const err = tasksError(e); if (err.code) return []; throw err; }
}
export async function createTask(userId, { title, date, notes }) {
  const tasks = google.tasks({ version: 'v1', auth: await clientOf(userId) });
  try {
    const { data } = await tasks.tasks.insert({ tasklist: '@default', requestBody: { title, notes: notes || '', due: `${date}T00:00:00.000Z` } });
    return mapTask(data);
  } catch (e) { throw tasksError(e); }
}
export async function setTaskDone(userId, taskId, done) {
  const tasks = google.tasks({ version: 'v1', auth: await clientOf(userId) });
  try {
    const { data } = await tasks.tasks.patch({ tasklist: '@default', task: taskId, requestBody: done ? { status: 'completed' } : { status: 'needsAction', completed: null } });
    return mapTask(data);
  } catch (e) { throw tasksError(e); }
}
export async function deleteTask(userId, taskId) {
  const tasks = google.tasks({ version: 'v1', auth: await clientOf(userId) });
  try { await tasks.tasks.delete({ tasklist: '@default', task: taskId }); } catch (e) { if (e.code !== 404 && e.code !== 410) throw tasksError(e); }
}

// ---------- Ausente (Fora do escritório do Google: recusa sozinho os convites no período, com a mensagem) ----------
export function outOfOfficeBody({ startISO, endISO, autoDecline, message, title }) {
  return {
    summary: title || 'Ausente',
    eventType: 'outOfOffice',
    start: { dateTime: startISO, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endISO, timeZone: 'America/Sao_Paulo' },
    transparency: 'opaque',
    outOfOfficeProperties: {
      autoDeclineMode: autoDecline ? 'declineAllConflictingInvitations' : 'declineNone',
      ...(autoDecline && message ? { declineMessage: String(message).slice(0, 500) } : {}),
    },
  };
}
export async function createOutOfOffice(userId, fields) {
  const calendar = google.calendar({ version: 'v3', auth: await clientOf(userId) });
  try {
    const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: outOfOfficeBody(fields) });
    return mapGoogleEvent(data);
  } catch (e) {
    if (e.code === 400 && /outOfOffice|eventType/i.test(String(e.message))) throw Object.assign(new Error('O Google só aceita "Ausente" na agenda principal de uma conta Google Workspace.'), { status: 400 });
    throw e;
  }
}
