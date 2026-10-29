// Sincronização com Google Calendar (2026-08) — cada usuário conecta a
// própria conta via OAuth (nada de "conexão única pra todo mundo"). Escopo
// pedido é só `calendar.events` (criar/editar/apagar e LER eventos: a Agenda,
// o widget e a resposta a convites usam `listEvents`/`respondToEvent`). Os
// tokens ficam cifrados (`secretBox.js`). Ver PROJECT_CONTEXT.md §21 e §116o.

import { google } from 'googleapis';
import { pool } from './db.js';
import { seal, open } from './secretBox.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(state) {
  return oauthClient().generateAuthUrl({
    ...(state ? { state } : {}),
    access_type: 'offline',
    // Sempre força a tela de consentimento — é o único jeito de garantir
    // que o Google devolva um refresh_token de novo (ele só manda na
    // primeira autorização, a menos que isso seja forçado).
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code) {
  const { tokens } = await oauthClient().getToken(code);
  return tokens;
}

export async function saveConnection(userId, tokens) {
  await pool.query(
    `INSERT INTO google_calendar_connections (user_id, access_token, refresh_token, token_expiry)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token=$2,
       refresh_token=COALESCE($3, google_calendar_connections.refresh_token),
       token_expiry=$4`,
    [userId, seal(tokens.access_token), seal(tokens.refresh_token) || null, new Date(tokens.expiry_date)]
  );
}

// Cifra, uma vez, o que foi gravado em texto puro antes do M2. Idempotente.
export async function sealLegacyGoogleTokens() {
  const { rows } = await pool.query(`SELECT user_id, access_token, refresh_token FROM google_calendar_connections WHERE access_token NOT LIKE 'enc1:%' OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'enc1:%')`);
  for (const r of rows) await pool.query('UPDATE google_calendar_connections SET access_token=$1, refresh_token=$2 WHERE user_id=$3', [seal(r.access_token), seal(r.refresh_token) || null, r.user_id]);
  return rows.length;
}

export async function disconnectUser(userId) {
  await pool.query('DELETE FROM google_calendar_connections WHERE user_id=$1', [userId]);
}

export async function getConnectionStatus(userId) {
  const { rows } = await pool.query('SELECT connected_at FROM google_calendar_connections WHERE user_id=$1', [userId]);
  return rows[0] ? { connected: true, connectedAt: rows[0].connected_at } : { connected: false, connectedAt: null };
}

async function getAuthedClientForUser(userId) {
  const { rows } = await pool.query('SELECT * FROM google_calendar_connections WHERE user_id=$1', [userId]);
  if (!rows[0]) return null;
  const conn = rows[0];
  if (open(conn.access_token) === null && open(conn.refresh_token) === null) return null; // segredo de cifra trocado: a pessoa precisa reconectar
  const client = oauthClient();
  client.setCredentials({
    access_token: open(conn.access_token),
    refresh_token: open(conn.refresh_token),
    expiry_date: new Date(conn.token_expiry).getTime(),
  });
  // googleapis atualiza o access_token sozinho quando expira (usando o
  // refresh_token) antes de qualquer chamada — só precisamos persistir o
  // novo valor quando isso acontece, senão a próxima chamada refaz o
  // refresh à toa.
  client.on('tokens', (tokens) => {
    if (!tokens.access_token) return;
    pool.query(
      `UPDATE google_calendar_connections SET access_token=$1, token_expiry=$2 WHERE user_id=$3`,
      [seal(tokens.access_token), new Date(tokens.expiry_date || Date.now() + 3500 * 1000), userId]
    ).catch((e) => console.error('Falha ao persistir token renovado do Google', e.message));
  });
  return client;
}

// Lê os eventos do calendário principal do usuário num período — usado
// pela Agenda (2026-08, ver server/agenda.js). `singleEvents: true`
// expande recorrências em instâncias individuais (senão um evento
// recorrente viria como uma linha só, sem data concreta de cada
// ocorrência). Cancelados vêm incluídos de propósito (`status:
// 'cancelled'`) — a Agenda precisa diferenciar visualmente "cancelado",
// não só esconder.
export async function listEvents(userId, timeMinISO, timeMaxISO) {
  if (!googleConfigured()) return [];
  const client = await getAuthedClientForUser(userId);
  if (!client) return [];
  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(timeMinISO).toISOString(),
    timeMax: new Date(timeMaxISO).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });
  return (res.data.items || []).map(mapGoogleEvent).filter((ev) => ev.start && ev.end);
}

// A SUA resposta ao convite (2026-09-20, pedido do Rafael: a RENATA mostrava reunião
// não aceita como se fosse compromisso). Vem em `attendees[]` no item em que `self` é
// verdadeiro: accepted | declined | tentative (talvez) | needsAction (sem resposta).
// Evento sem convidados, ou criado por você, é seu ('organizer'). Se o Google omitir a
// lista (evento enorme) não dá pra saber: 'unknown', tratado como compromisso.
export function myResponseOf(ev) {
  const attendees = Array.isArray(ev && ev.attendees) ? ev.attendees : [];
  const self = attendees.find((a) => a && a.self);
  if (self) return self.responseStatus || 'needsAction';
  if (!attendees.length || (ev.organizer && ev.organizer.self)) return 'organizer';
  return 'unknown';
}

export function mapGoogleEvent(ev) {
  const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
  return {
    id: `google-${ev.id}`,
    source: 'google',
    title: ev.summary || '(sem título)',
    description: ev.description || '',
    location: ev.location || '',
    start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
    end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
    allDay: !!(ev.start && ev.start.date && !ev.start.dateTime),
    status: ev.status || 'confirmed',
    htmlLink: ev.htmlLink || '',
    myResponse: myResponseOf(ev),
    // "Mostrar como: Livre" no Google — o evento não ocupa o seu tempo.
    transparent: ev.transparency === 'transparent',
    guests: attendees.length,
    organizer: ev.organizer && !ev.organizer.self ? (ev.organizer.displayName || ev.organizer.email || '') : '',
    eventType: ev.eventType || 'default',
  };
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// Cria um evento arbitrário no calendário principal do usuário — usado
// pela RENATA (server/assistantActions.js, 2026-09, Fase 4) pra propor
// "marcar uma reunião/follow-up" de verdade, e por baixo de
// `syncTicketEvent` (abaixo), que era a única chamadora antes disso.
// Lança exceção se falhar (diferente de `syncTicketEvent`, que engole o
// erro) — quem chama decide como tratar; a RENATA precisa saber que a
// ação falhou pra avisar o usuário, não fingir que deu certo.
export async function createEvent(userId, { summary, description, startISO, endISO, location, attendees }) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw new Error('Usuário não conectou o Google Calendar.');
  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description: description || '',
      ...(location ? { location } : {}),
      ...(Array.isArray(attendees) && attendees.length ? { attendees: attendees.map((email) => ({ email })) } : {}),
      start: { dateTime: new Date(startISO).toISOString() },
      end: { dateTime: new Date(endISO).toISOString() },
    },
    // Convidados recebem o convite por e-mail (comportamento normal do Google Calendar ao criar com convidados).
    sendUpdates: Array.isArray(attendees) && attendees.length ? 'all' : 'none',
  });
  return { id: res.data.id, htmlLink: res.data.htmlLink || '' };
}

// Marca a SUA resposta (accepted | declined | tentative) na lista de convidados — função pura, sem rede.
export function applySelfResponse(attendees, response) {
  if (!['accepted', 'declined', 'tentative'].includes(response)) throw new Error('Resposta inválida.');
  const list = Array.isArray(attendees) ? attendees : [];
  if (!list.some((a) => a && a.self)) return null; // não é convidado: não há o que responder
  return list.map((a) => (a && a.self ? { ...a, responseStatus: response } : a));
}

// Aceitar / recusar / talvez um convite da Agenda. Só funciona para evento do Google em que você é convidado.
export async function respondToEvent(userId, googleEventId, response) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('Conecte o Google Calendar para responder convites.'), { status: 409 });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const cur = await calendar.events.get({ calendarId: 'primary', eventId: googleEventId });
  const attendees = applySelfResponse(cur.data.attendees, response);
  if (!attendees) throw Object.assign(new Error('Você não é convidado deste evento — não há convite para responder.'), { status: 400 });
  await calendar.events.patch({ calendarId: 'primary', eventId: googleEventId, requestBody: { attendees }, sendUpdates: 'all' });
  return { id: `google-${googleEventId}`, myResponse: response };
}

// Cria ou atualiza o evento de "Previsão de conclusão" no calendário do
// responsável atual da TASK. Silencioso se o usuário nunca conectou o
// Google Calendar (não é erro, é o estado normal de quem não usa isso) —
// só loga se a chamada em si falhar depois de conectado.
export async function syncTicketEvent(userId, ticket, appBaseUrl) {
  if (!googleConfigured() || !ticket.expectedCompletionAt) return null;
  const client = await getAuthedClientForUser(userId);
  if (!client) return null;
  const calendar = google.calendar({ version: 'v3', auth: client });
  const link = appBaseUrl ? `\n\n${appBaseUrl}/#${ticket.number}` : '';
  const eventBody = {
    summary: `TASK #${ticket.number} — ${ticket.title}`,
    description: `Previsão de conclusão definida no XFlow (PRICETAX).${link}`,
    start: { date: ticket.expectedCompletionAt },
    end: { date: nextDay(ticket.expectedCompletionAt) },
  };
  try {
    if (ticket.googleEventId) {
      const res = await calendar.events.update({ calendarId: 'primary', eventId: ticket.googleEventId, requestBody: eventBody });
      return res.data.id;
    }
    const res = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
    return res.data.id;
  } catch (e) {
    // Evento pode ter sido apagado direto no Google — recria em vez de falhar.
    if (e.code === 404 || e.code === 410) {
      try {
        const res = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
        return res.data.id;
      } catch (e2) { console.error('Falha ao recriar evento no Google Calendar', e2.message); return null; }
    }
    console.error('Falha ao sincronizar evento no Google Calendar', e.message);
    return null;
  }
}

export async function deleteTicketEvent(userId, googleEventId) {
  if (!googleConfigured() || !googleEventId) return;
  const client = await getAuthedClientForUser(userId);
  if (!client) return;
  const calendar = google.calendar({ version: 'v3', auth: client });
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
  } catch (e) {
    // 404/410 = já não existe mais (usuário apagou direto no Google, ou
    // já tinha sido apagado antes) — silencioso de propósito. Qualquer
    // outro erro (token revogado, etc.) sobe pro chamador logar — antes
    // isso era engolido aqui dentro sem log nenhum, escondendo falhas
    // reais (bug encontrado testando a exclusão em Lixeira).
    if (e.code !== 404 && e.code !== 410) throw e;
  }
}

// Bloco de agenda de uma atividade do cronograma (2026-10-19, "Reservar na agenda"). Cria o evento ou, se `eventId` já existe, atualiza o MESMO evento
// preservando a resposta (aceitou/recusou) de quem já estava convidado. Convidados recebem e-mail do Google (sendUpdates 'all').
export async function upsertBlockEvent(userId, eventId, body) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('A conta do Google desta pessoa não está conectada.'), { status: 409 });
  const calendar = google.calendar({ version: 'v3', auth: client });
  if (eventId) {
    try {
      const cur = await calendar.events.get({ calendarId: 'primary', eventId });
      if (cur.data.status !== 'cancelled') {
        const keep = new Map((cur.data.attendees || []).map((a) => [String(a.email || '').toLowerCase(), a]));
        const attendees = (body.attendees || []).map((a) => keep.get(String(a.email).toLowerCase()) || a);
        const res = await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: { ...body, attendees }, sendUpdates: 'all' });
        return { id: res.data.id, htmlLink: res.data.htmlLink || '', created: false };
      }
    } catch (e) {
      if (e.code !== 404 && e.code !== 410) throw e;
    }
  }
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: body, sendUpdates: 'all' });
  return { id: res.data.id, htmlLink: res.data.htmlLink || '', created: true };
}

// Cancela o bloco (os convidados recebem o cancelamento). Evento que já não existe no Google não é erro.
export async function removeBlockEvent(userId, eventId) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('A conta do Google desta pessoa não está conectada.'), { status: 409 });
  const calendar = google.calendar({ version: 'v3', auth: client });
  try { await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' }); } catch (e) { if (e.code !== 404 && e.code !== 410) throw e; }
}
