// Agendas extras por pessoa (§128, 2026-11-02 — Fase 1 do plano do Ronaldo: "logar com todas essas contas e ter gestão de agenda em
// um único lugar"). A conta principal continua sendo o Google de google_calendar_connections (id 'principal'); aqui ficam as outras:
// Google (outra conta), Microsoft (Graph) e link iCal (só leitura). Cada conta tem cor, nome e regra de privacidade:
//   - só o DONO enxerga a conta e os eventos dela (toda função recebe o userId e confere `user_id`);
//   - conta de fora do pricetax.com.br é 'particular': a RENATA só vê "Ocupado" (sem título) até o dono ligar a permissão;
//   - nada do conteúdo é guardado no banco; o segredo (tokens ou link) fica cifrado em `secret`.
// Ids de evento das contas extras: "x:<conta>:<id no provedor>" (a principal continua "google-<id>").

import crypto from 'node:crypto';
import { google } from 'googleapis';
import { pool } from './db.js';
import { seal, open } from './secretBox.js';
import {
  oauthClientOf, googleExtConfigured, googleConfigured, listEventsWith, getEventDetail, savePanelEvent, respondWithNote, rescheduleEvent, cancelPanelEvent,
} from './googleCalendar.js';
import { microsoftConfigured, msRefresh, msListEvents, msGetEvent, msSaveEvent, msRespond, msReschedule, msCancel } from './microsoftGraph.js';
import { fetchFeed, parseFeed, expandFeed, normalizeFeedUrl } from './icalFeed.js';

export const PRICETAX_DOMAIN = 'pricetax.com.br';
export const MAX_ACCOUNTS = 8;
export const PROVIDERS = { google: 'Google', microsoft: 'Microsoft', ical: 'Link iCal' };
// Cores bem distintas entre si e da conta principal (#5B8DEF); a pessoa pode trocar.
export const ACCOUNT_COLORS = ['#E8710A', '#8E24AA', '#0B8043', '#D50000', '#039BE5', '#F6BF26', '#795548', '#E67C73', '#33B679', '#616161'];
export const PRINCIPAL_COLOR = '#5B8DEF';
const GOOGLE_CAL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

export const privacyOf = (email) => (new RegExp(`@${PRICETAX_DOMAIN.replace(/\./g, '\\.')}$`, 'i').test(String(email || '').trim()) ? 'pricetax' : 'particular');
export const isHexColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
const newId = () => `ua${crypto.randomBytes(6).toString('hex')}`;

export function parseEventId(id) {
  const m = /^x:(ua[0-9a-f]{12}):(.+)$/s.exec(String(id || ''));
  return m ? { accountId: m[1], rawId: m[2] } : null;
}
export const extraEventId = (accountId, rawId) => `x:${accountId}:${rawId}`;

// O que a tela recebe de uma conta (nunca o segredo).
export function publicAccount(r) {
  return {
    id: r.id, provider: r.provider, providerLabel: PROVIDERS[r.provider] || r.provider, email: r.email, label: r.label || r.email || PROVIDERS[r.provider],
    color: isHexColor(r.color) ? r.color : ACCOUNT_COLORS[0], privacy: r.privacy, calendarEnabled: r.calendar_enabled, renataCalendar: r.renata_calendar,
    readOnly: r.provider === 'ical', status: r.status, error: r.last_error || '', createdAt: r.created_at,
    // Link de videochamada que o "Novo compromisso" consegue criar nesta conta.
    meet: r.provider === 'google' ? 'meet' : r.provider === 'microsoft' && !(readSecret(r) || {}).personal ? 'teams' : 'none',
  };
}

export async function listAccountRows(userId) {
  const { rows } = await pool.query('SELECT * FROM user_accounts WHERE user_id=$1 ORDER BY created_at', [userId]);
  return rows;
}
export const listAccounts = async (userId) => (await listAccountRows(userId)).map(publicAccount);

export async function accountRow(userId, id) {
  const { rows } = await pool.query('SELECT * FROM user_accounts WHERE id=$1 AND user_id=$2', [id, userId]);
  if (!rows[0]) throw Object.assign(new Error('Agenda não encontrada.'), { status: 404 });
  return rows[0];
}

async function nextColor(userId) {
  const used = new Set((await listAccountRows(userId)).map((r) => String(r.color).toLowerCase()));
  return ACCOUNT_COLORS.find((c) => !used.has(c.toLowerCase())) || ACCOUNT_COLORS[used.size % ACCOUNT_COLORS.length];
}

async function ensureRoom(userId) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM user_accounts WHERE user_id=$1', [userId]);
  if (rows[0].n >= MAX_ACCOUNTS) throw Object.assign(new Error(`No máximo ${MAX_ACCOUNTS} agendas extras por pessoa.`), { status: 400 });
}

// Conta OAuth (Google ou Microsoft): a mesma conta conectada de novo só atualiza os tokens e volta a "ok".
export async function upsertOAuthAccount(userId, { provider, email, secret, label }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) throw Object.assign(new Error('Não consegui identificar o e-mail da conta.'), { status: 400 });
  const { rows } = await pool.query('SELECT id FROM user_accounts WHERE user_id=$1 AND provider=$2 AND lower(email)=$3', [userId, provider, mail]);
  if (rows[0]) {
    await pool.query("UPDATE user_accounts SET secret=$1, status='ok', last_error='', updated_at=now() WHERE id=$2", [seal(JSON.stringify(secret)), rows[0].id]);
    return { id: rows[0].id, created: false };
  }
  await ensureRoom(userId);
  const id = newId();
  await pool.query(
    `INSERT INTO user_accounts (id, user_id, provider, email, label, color, privacy, secret) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, userId, provider, mail, String(label || mail).slice(0, 60), await nextColor(userId), privacyOf(mail), seal(JSON.stringify(secret))],
  );
  return { id, created: true };
}

export async function addIcalAccount(userId, { url, label }) {
  const norm = normalizeFeedUrl(url);
  if (!norm) throw Object.assign(new Error('Cole o endereço https (ou webcal) da agenda.'), { status: 400 });
  const name = String(label || '').trim().slice(0, 60);
  if (!name) throw Object.assign(new Error('Dê um nome à agenda (ex.: PETCONT).'), { status: 400 });
  await ensureRoom(userId);
  const vevents = parseFeed(await fetchFeed(norm)); // confere já: link errado não entra
  const id = newId();
  await pool.query(
    `INSERT INTO user_accounts (id, user_id, provider, email, label, color, privacy, secret) VALUES ($1,$2,'ical','',$3,$4,'particular',$5)`,
    [id, userId, name, await nextColor(userId), seal(JSON.stringify({ url: norm }))],
  );
  return { id, events: vevents.length };
}

export async function updateAccount(userId, id, b) {
  const row = await accountRow(userId, id);
  const label = b.label === undefined ? row.label : String(b.label).trim().slice(0, 60) || row.label;
  if (b.color !== undefined && !isHexColor(b.color)) throw Object.assign(new Error('Cor inválida.'), { status: 400 });
  const color = b.color === undefined ? row.color : b.color;
  const cal = b.calendarEnabled === undefined ? row.calendar_enabled : !!b.calendarEnabled;
  const renata = b.renataCalendar === undefined ? row.renata_calendar : !!b.renataCalendar;
  const { rows } = await pool.query(
    'UPDATE user_accounts SET label=$1, color=$2, calendar_enabled=$3, renata_calendar=$4, updated_at=now() WHERE id=$5 AND user_id=$6 RETURNING *',
    [label, color, cal, renata, id, userId],
  );
  return publicAccount(rows[0]);
}

// Desconectar: apaga o segredo junto com a conta; no Google também revoga o acesso (Microsoft não tem revogação por aplicativo via API).
export async function removeAccount(userId, id) {
  const row = await accountRow(userId, id);
  if (row.provider === 'google') {
    const s = readSecret(row);
    if (s && (s.refresh_token || s.access_token)) { try { await oauthClientOf(s.client).revokeToken(s.refresh_token || s.access_token); } catch { /* já revogado */ } }
  }
  await pool.query('DELETE FROM user_accounts WHERE id=$1 AND user_id=$2', [id, userId]);
}

function readSecret(row) {
  const raw = open(row.secret);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function writeSecret(id, secret) {
  await pool.query('UPDATE user_accounts SET secret=$1, updated_at=now() WHERE id=$2', [seal(JSON.stringify(secret)), id]);
}
async function markStatus(id, status, error) {
  await pool.query('UPDATE user_accounts SET status=$1, last_error=$2 WHERE id=$3', [status, String(error || '').slice(0, 300), id]).catch(() => {});
}

// ---------- Google (conta extra) ----------

export function googleExtraAuthUrl(state) {
  const kind = googleExtConfigured() ? 'ext' : 'int';
  return { kind, url: oauthClientOf(kind).generateAuthUrl({ state, access_type: 'offline', prompt: 'consent select_account', scope: GOOGLE_CAL_SCOPES }) };
}

export async function saveGoogleExtra(userId, code, kind, { principalEmail } = {}) {
  const client = oauthClientOf(kind);
  const { tokens } = await client.getToken(code);
  let email = '';
  try {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: kind === 'ext' && googleExtConfigured() ? process.env.GOOGLE_EXT_CLIENT_ID : process.env.GOOGLE_CLIENT_ID });
    email = String(ticket.getPayload().email || '').toLowerCase();
  } catch { email = ''; }
  if (!email) throw Object.assign(new Error('O Google não informou o e-mail da conta.'), { status: 400 });
  if (principalEmail && email === String(principalEmail).toLowerCase()) throw Object.assign(new Error('Esta já é a sua conta principal do Google.'), { status: 409, code: 'principal' });
  return upsertOAuthAccount(userId, { provider: 'google', email, secret: { client: kind, access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry: tokens.expiry_date } });
}

async function googleCalendarOf(row) {
  const s = readSecret(row);
  if (!s || !(s.refresh_token || s.access_token)) throw Object.assign(new Error('Reconecte esta agenda.'), { status: 409, reconnect: true });
  const client = oauthClientOf(s.client);
  client.setCredentials({ access_token: s.access_token, refresh_token: s.refresh_token, expiry_date: s.expiry });
  client.on('tokens', (t) => { if (t.access_token) writeSecret(row.id, { ...s, access_token: t.access_token, expiry: t.expiry_date || Date.now() + 3500 * 1000, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}) }).catch(() => {}); });
  return google.calendar({ version: 'v3', auth: client });
}

// ---------- Microsoft ----------

export async function microsoftTokenOf(row) {
  const s = readSecret(row);
  if (!s || !s.refresh_token) throw Object.assign(new Error('Reconecte esta agenda.'), { status: 409, reconnect: true });
  if (s.access_token && s.expiry && s.expiry - Date.now() > 120000) return { token: s.access_token, secret: s };
  const t = await msRefresh(s.refresh_token);
  const next = { ...s, access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, expiry: Date.now() + (Number(t.expires_in) || 3600) * 1000 };
  await writeSecret(row.id, next);
  return { token: next.access_token, secret: next };
}

// ---------- iCal (cache curto: a tela recarrega a cada minuto) ----------

const feedCache = new Map(); // conta -> { at, vevents }
async function icalEvents(row, fromISO, toISO) {
  const s = readSecret(row);
  if (!s || !s.url) throw Object.assign(new Error('Cadastre o link da agenda de novo.'), { status: 409, reconnect: true });
  const hit = feedCache.get(row.id);
  let vevents = hit && Date.now() - hit.at < 5 * 60 * 1000 ? hit.vevents : null;
  if (!vevents) { vevents = parseFeed(await fetchFeed(s.url)); feedCache.set(row.id, { at: Date.now(), vevents }); }
  return expandFeed(vevents, fromISO, toISO);
}

// ---------- eventos ----------

function decorate(row, ev) {
  const rawId = ev.rawId !== undefined ? ev.rawId : String(ev.id || '').replace(/^google-/, '');
  const { rawId: _r, ...rest } = ev;
  return {
    ...rest,
    id: extraEventId(row.id, rawId),
    source: row.provider,
    account: row.id,
    accountLabel: row.label || row.email,
    color: isHexColor(row.color) ? row.color : ACCOUNT_COLORS[0],
    privacy: row.privacy,
    readOnly: row.provider === 'ical',
  };
}

function friendly(e) {
  const msg = String((e && e.message) || '');
  if (e && e.reconnect) return msg;
  if (/invalid_grant|AADSTS70008|AADSTS700082|refresh token/i.test(msg) || (e && (e.code === 401 || e.code === 'invalid_grant'))) return 'A autorização expirou. Reconecte esta agenda.';
  if (e && e.code === 'PRIVATE_ADDRESS') return 'Endereço interno recusado.';
  return msg.slice(0, 200) || 'Não consegui ler esta agenda agora.';
}

async function eventsOf(row, fromISO, toISO) {
  if (row.provider === 'google') {
    if (!googleConfigured()) throw new Error('Google não configurado neste ambiente.');
    return (await listEventsWith(await googleCalendarOf(row), fromISO, toISO)).map((ev) => decorate(row, ev));
  }
  if (row.provider === 'microsoft') {
    if (!microsoftConfigured()) throw new Error('Microsoft não configurada neste ambiente.');
    const { token } = await microsoftTokenOf(row);
    return (await msListEvents(token, fromISO, toISO)).map((ev) => decorate(row, ev));
  }
  if (row.provider === 'ical') return (await icalEvents(row, fromISO, toISO)).map((ev) => decorate(row, { ...ev, myResponse: 'organizer' }));
  return [];
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('A agenda demorou demais para responder.')), ms))]);

// Eventos de todas as contas extras ligadas. Uma conta com problema não derruba as outras: volta com `error` no resumo.
export async function extraEvents(userId, fromISO, toISO) {
  const rows = (await listAccountRows(userId)).filter((r) => r.calendar_enabled);
  const results = await Promise.all(rows.map(async (row) => {
    try {
      const evs = await withTimeout(eventsOf(row, fromISO, toISO), 15000);
      if (row.status !== 'ok') await markStatus(row.id, 'ok', '');
      return { row, events: evs, error: '' };
    } catch (e) {
      const error = friendly(e);
      await markStatus(row.id, 'error', error);
      return { row, events: [], error };
    }
  }));
  return {
    events: results.flatMap((r) => r.events),
    accounts: results.map((r) => ({ ...publicAccount(r.row), status: r.error ? 'error' : 'ok', error: r.error })),
  };
}

// Para a RENATA: conta particular sem permissão vira "Ocupado" — só o horário, sem título, local, descrição ou participantes.
export function renataView(events, accounts) {
  const allowed = new Map(accounts.map((a) => [a.id, a.privacy === 'pricetax' || a.renataCalendar]));
  return events.map((e) => {
    if (!e.account || e.account === 'principal' || allowed.get(e.account)) return e;
    return { id: e.id, source: e.source, account: e.account, title: 'Ocupado (agenda particular)', description: '', location: '', start: e.start, end: e.end, allDay: e.allDay, status: e.status, transparent: e.transparent, myResponse: e.myResponse === 'declined' ? 'declined' : 'accepted', private: true };
  });
}

export async function extraEventsForRenata(userId, fromISO, toISO) {
  const { events, accounts } = await extraEvents(userId, fromISO, toISO);
  return renataView(events, accounts).map((e) => ({ ...e, title: e.private ? e.title : `${e.title} [${e.accountLabel || 'agenda extra'}]` }));
}

// ---------- ações num evento de conta extra ----------

async function ctx(userId, accountId) {
  const row = await accountRow(userId, accountId);
  if (row.provider === 'ical') throw Object.assign(new Error('Esta agenda é só leitura (link iCal): altere o compromisso na agenda de origem.'), { status: 400 });
  return row;
}
const decorateDetail = (row, ev) => (ev ? decorate(row, { ...ev, rawId: ev.eventId || ev.rawId }) : ev);

export async function extraDetail(userId, id) {
  const { accountId, rawId } = parseEventId(id) || {};
  if (!accountId) throw Object.assign(new Error('Evento inválido.'), { status: 400 });
  const row = await ctx(userId, accountId);
  if (row.provider === 'google') return decorateDetail(row, await getEventDetail(await googleCalendarOf(row), rawId));
  const { token } = await microsoftTokenOf(row);
  return decorateDetail(row, await msGetEvent(token, rawId, row.email));
}

export async function extraSave(userId, accountId, rawId, fields) {
  const row = await ctx(userId, accountId);
  if (row.provider === 'google') return decorateDetail(row, await savePanelEvent(await googleCalendarOf(row), rawId || null, fields));
  const { token, secret } = await microsoftTokenOf(row);
  return decorateDetail(row, await msSaveEvent(token, rawId || null, fields, { teams: !secret.personal, selfEmail: row.email }));
}

export async function extraRespond(userId, id, response, comment, propose) {
  const { accountId, rawId } = parseEventId(id) || {};
  const row = await ctx(userId, accountId);
  if (row.provider === 'google') return decorateDetail(row, await respondWithNote(await googleCalendarOf(row), rawId, response, comment));
  const { token } = await microsoftTokenOf(row);
  await msRespond(token, rawId, response, comment, propose);
  try { return decorateDetail(row, await msGetEvent(token, rawId, row.email)); } catch { return { id, myResponse: response }; } // recusado some da agenda da Microsoft
}

export async function extraReschedule(userId, id, startISO, endISO) {
  const { accountId, rawId } = parseEventId(id) || {};
  const row = await ctx(userId, accountId);
  if (row.provider === 'google') return decorateDetail(row, await rescheduleEvent(await googleCalendarOf(row), rawId, startISO, endISO));
  const { token } = await microsoftTokenOf(row);
  return decorateDetail(row, await msReschedule(token, rawId, startISO, endISO, row.email));
}

export async function extraCancel(userId, id) {
  const { accountId, rawId } = parseEventId(id) || {};
  const row = await ctx(userId, accountId);
  if (row.provider === 'google') return cancelPanelEvent(await googleCalendarOf(row), rawId);
  const { token } = await microsoftTokenOf(row);
  return msCancel(token, rawId);
}

// ---------- conta principal: nome e cor (users.preferences.agendaPrincipal) ----------

export async function principalPrefs(userId) {
  const { rows } = await pool.query("SELECT preferences->'agendaPrincipal' AS p FROM users WHERE id=$1", [userId]);
  const p = (rows[0] && rows[0].p) || {};
  return { label: String(p.label || '').slice(0, 60), color: isHexColor(p.color) ? p.color : PRINCIPAL_COLOR, calendarEnabled: p.calendarEnabled !== false };
}

export async function savePrincipalPrefs(userId, b) {
  const cur = await principalPrefs(userId);
  if (b.color !== undefined && !isHexColor(b.color)) throw Object.assign(new Error('Cor inválida.'), { status: 400 });
  const next = {
    label: b.label === undefined ? cur.label : String(b.label).trim().slice(0, 60),
    color: b.color === undefined ? cur.color : b.color,
    calendarEnabled: b.calendarEnabled === undefined ? cur.calendarEnabled : !!b.calendarEnabled,
  };
  await pool.query("UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{agendaPrincipal}', $1::jsonb, true) WHERE id=$2", [JSON.stringify(next), userId]);
  return next;
}
