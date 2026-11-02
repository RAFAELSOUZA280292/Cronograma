// Sincronização com Google Calendar (2026-08) — cada usuário conecta a
// própria conta via OAuth (nada de "conexão única pra todo mundo"). Escopo
// pedido é só `calendar.events` (criar/editar/apagar e LER eventos: a Agenda,
// o widget e a resposta a convites usam `listEvents`/`respondToEvent`). Os
// tokens ficam cifrados (`secretBox.js`). Ver PROJECT_CONTEXT.md §21 e §116o.

import { google } from 'googleapis';
import { pool } from './db.js';
import { seal, open } from './secretBox.js';

// calendar.freebusy (livre/ocupado de colegas) e tasks (Tarefas do Google) entraram em 2026-11-02 (§138): quem já tinha conectado
// reconecta uma vez para ganhar os dois; sem eles, o resto da agenda segue funcionando.
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/tasks'];
// Caixa de e-mail (2026-11-02): o mesmo login do Google, com o Gmail acrescentado só quando a pessoa conecta pela tela de E-mail.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
// Regras "sempre mover e-mails de fulano para a pasta X" (filtros do Gmail): pedido junto com o e-mail desde 2026-11-02.
export const GMAIL_SETTINGS_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Agendas extras (§128): 'ext' = segundo cliente OAuth, "Externo", para contas de fora do pricetax.com.br (GOOGLE_EXT_*); sem ele,
// o cliente de sempre ('int'), que é "Interno" e só aceita contas do domínio.
export const googleExtConfigured = () => !!(process.env.GOOGLE_EXT_CLIENT_ID && process.env.GOOGLE_EXT_CLIENT_SECRET);
export function oauthClientOf(kind) {
  if (kind === 'ext' && googleExtConfigured()) {
    return new google.auth.OAuth2(process.env.GOOGLE_EXT_CLIENT_ID, process.env.GOOGLE_EXT_CLIENT_SECRET, process.env.GOOGLE_EXT_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI);
  }
  return oauthClient();
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(state, { mail = false } = {}) {
  return oauthClient().generateAuthUrl({
    ...(state ? { state } : {}),
    access_type: 'offline',
    // Sempre força a tela de consentimento — é o único jeito de garantir
    // que o Google devolva um refresh_token de novo (ele só manda na
    // primeira autorização, a menos que isso seja forçado).
    prompt: 'consent',
    // Mantém o que já foi concedido antes: reconectar a agenda não derruba o e-mail, e vice-versa.
    include_granted_scopes: true,
    scope: mail ? [...SCOPES, GMAIL_SCOPE, GMAIL_SETTINGS_SCOPE] : SCOPES,
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

export async function getAuthedClientForUser(userId) {
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
  return listEventsWith(google.calendar({ version: 'v3', auth: client }), timeMinISO, timeMaxISO);
}

export async function listEventsWith(calendar, timeMinISO, timeMaxISO) {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(timeMinISO).toISOString(),
    timeMax: new Date(timeMaxISO).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  }, { timeout: 15000 });
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
    colorId: ev.colorId || '',
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

// Link do Google Meet de um evento (o Google devolve em `hangoutLink` ou nos pontos de entrada de vídeo da conferência).
export function meetLinkOf(ev) {
  if (!ev) return '';
  if (ev.hangoutLink) return ev.hangoutLink;
  const eps = (ev.conferenceData && ev.conferenceData.entryPoints) || [];
  const v = eps.find((e) => e && e.entryPointType === 'video' && e.uri);
  return v ? v.uri : '';
}

// Corpo do patch de um evento que já existe: mantém o Meet que ele já tem (conferenceData do corpo só vale se ainda não houver link), preserva a resposta
// (aceitou/recusou) de quem já estava convidado e, com `keepGuests`, nem mexe na lista (patch só muda o que é enviado).
export function composePatch(cur, body, opts = {}) {
  const { conferenceData, ...rest } = body;
  const hasMeet = !!meetLinkOf(cur);
  const requestBody = { ...rest, ...(conferenceData && !hasMeet ? { conferenceData } : {}) };
  if (!opts.keepGuests) {
    const keep = new Map(((cur && cur.attendees) || []).map((a) => [String(a.email || '').toLowerCase(), a]));
    requestBody.attendees = (body.attendees || []).map((a) => keep.get(String(a.email).toLowerCase()) || a);
    // Sala reservada (resource) e a própria pessoa (self) não aparecem no formulário: sem isto, editar liberava a sala e tirava quem editou.
    const sent = new Set(requestBody.attendees.map((a) => String(a.email || '').toLowerCase()));
    for (const a of (cur && cur.attendees) || []) if ((a.resource || a.self) && !sent.has(String(a.email || '').toLowerCase())) requestBody.attendees.push(a);
  }
  return { requestBody, hasMeet };
}

// Bloco de agenda de uma atividade do cronograma (2026-10-19, "Reservar na agenda"). Cria o evento ou, se `eventId` já existe, atualiza o MESMO evento
// preservando a resposta (aceitou/recusou) de quem já estava convidado. Convidados recebem e-mail do Google (sendUpdates 'all').
// `opts.sendUpdates` ('all' por padrão; 'none' para mexer no evento sem mandar e-mail) e `opts.keepGuests` (não toca na lista de convidados: o
// patch só muda os campos enviados). Se o evento já tem Meet, `conferenceData` do corpo é ignorado — editar uma reunião nunca troca o link.
export async function upsertBlockEvent(userId, eventId, body, opts = {}) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('A conta do Google desta pessoa não está conectada.'), { status: 409 });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const sendUpdates = opts.sendUpdates || 'all';
  // O Meet pode ser criado de forma assíncrona: se o link ainda não veio, relê o evento algumas vezes antes de desistir.
  const withMeet = async (data) => {
    let link = meetLinkOf(data);
    for (let i = 0; !link && body.conferenceData && i < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 700));
      link = meetLinkOf((await calendar.events.get({ calendarId: 'primary', eventId: data.id })).data);
    }
    return link;
  };
  if (eventId) {
    try {
      const cur = await calendar.events.get({ calendarId: 'primary', eventId });
      if (cur.data.status !== 'cancelled') {
        const { requestBody, hasMeet } = composePatch(cur.data, body, opts);
        const res = await calendar.events.patch({ calendarId: 'primary', eventId, requestBody, sendUpdates, conferenceDataVersion: 1 });
        return { id: res.data.id, htmlLink: res.data.htmlLink || '', created: false, meetLink: hasMeet ? meetLinkOf(cur.data) : await withMeet(res.data) };
      }
    } catch (e) {
      if (e.code !== 404 && e.code !== 410) throw e;
    }
  }
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: body, sendUpdates, conferenceDataVersion: 1 });
  return { id: res.data.id, htmlLink: res.data.htmlLink || '', created: true, meetLink: await withMeet(res.data) };
}

// Cancela o bloco (os convidados recebem o cancelamento). Evento que já não existe no Google não é erro.
export async function removeBlockEvent(userId, eventId) {
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('A conta do Google desta pessoa não está conectada.'), { status: 409 });
  const calendar = google.calendar({ version: 'v3', auth: client });
  try { await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' }); } catch (e) { if (e.code !== 404 && e.code !== 410) throw e; }
}

// ---------- Agenda completa no painel (2026-11-02): detalhe, criar/editar com Meet e lembrete, responder com nota, mudar horário ----------
const RSVP = new Set(['accepted', 'declined', 'tentative', 'needsAction']);

// Tudo que a tela de detalhe mostra: participantes com a resposta de cada um, link do Meet, lembrete e se você pode editar.
export function mapEventDetail(ev) {
  const base = mapGoogleEvent(ev);
  const attendees = (Array.isArray(ev.attendees) ? ev.attendees : []).filter((a) => a && !a.resource).map((a) => ({
    email: String(a.email || '').toLowerCase(),
    name: a.displayName || '',
    response: RSVP.has(a.responseStatus) ? a.responseStatus : 'needsAction',
    organizer: !!a.organizer,
    self: !!a.self,
    optional: !!a.optional,
    comment: a.comment || '',
  }));
  const isOrganizer = !!(ev.organizer && ev.organizer.self);
  const overrides = (ev.reminders && Array.isArray(ev.reminders.overrides)) ? ev.reminders.overrides : [];
  const popup = overrides.find((r) => r && r.method === 'popup') || overrides[0];
  return {
    ...base,
    eventId: ev.id,
    iCalUID: ev.iCalUID || '',
    attendees,
    organizerEmail: ev.organizer ? String(ev.organizer.email || '').toLowerCase() : '',
    organizerName: ev.organizer ? (ev.organizer.displayName || ev.organizer.email || '') : '',
    isOrganizer,
    canEdit: isOrganizer || !!ev.guestsCanModify,
    recurring: !!ev.recurringEventId || (Array.isArray(ev.recurrence) && ev.recurrence.length > 0),
    meetLink: meetLinkOf(ev),
    reminderMinutes: ev.reminders && ev.reminders.useDefault ? null : (popup ? popup.minutes : -1),
    myComment: (attendees.find((a) => a.self) || {}).comment || '',
  };
}

// Corpo do evento a partir do formulário do painel. `reminderMinutes`: null = padrão do Google, -1 = sem lembrete, n = n minutos antes.
export function buildPanelEventBody(f, requestId) {
  const body = {
    summary: f.title,
    description: f.description || '',
    location: f.location || '',
    start: { dateTime: f.startISO, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: f.endISO, timeZone: 'America/Sao_Paulo' },
    attendees: (f.attendees || []).map((email) => ({ email })),
  };
  if (f.reminderMinutes === null || f.reminderMinutes === undefined) body.reminders = { useDefault: true };
  else if (f.reminderMinutes < 0) body.reminders = { useDefault: false, overrides: [] };
  else body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: f.reminderMinutes }] };
  if (f.colorId !== undefined) body.colorId = f.colorId || null;
  if (f.meet) body.conferenceData = { createRequest: { requestId: requestId || `pt-${Date.now().toString(36)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  return body;
}

// `who` = id do usuário (conta principal) ou o cliente do Calendar já pronto (agenda extra, server/calendarAccounts.js).
async function calendarFor(who) {
  if (who && typeof who === 'object') return who;
  const userId = who;
  const client = await getAuthedClientForUser(userId);
  if (!client) throw Object.assign(new Error('Conecte o seu Google Calendar (Meu perfil › Agenda) para usar a agenda do painel.'), { status: 409 });
  return google.calendar({ version: 'v3', auth: client });
}

export async function getEventDetail(userId, eventId) {
  const calendar = await calendarFor(userId);
  const { data } = await calendar.events.get({ calendarId: 'primary', eventId });
  return mapEventDetail(data);
}

// O evento do convite na SUA agenda, pelo UID do arquivo .ics (o Google põe o convite recebido na agenda sozinho).
export async function findEventByICalUID(userId, iCalUID) {
  if (!iCalUID) return null;
  const calendar = await calendarFor(userId);
  const { data } = await calendar.events.list({ calendarId: 'primary', iCalUID, showDeleted: false, maxResults: 5 });
  const items = (data.items || []).filter((e) => e.status !== 'cancelled');
  return items[0] ? mapEventDetail(items[0]) : null;
}

// Cria (eventId vazio) ou edita. Editar preserva a resposta de quem já estava convidado e nunca troca um Meet existente.
export async function savePanelEvent(userId, eventId, fields) {
  const calendar = await calendarFor(userId);
  const body = buildPanelEventBody(fields);
  const sendUpdates = body.attendees.length || eventId ? 'all' : 'none';
  let data;
  if (eventId) {
    const cur = (await calendar.events.get({ calendarId: 'primary', eventId })).data;
    if (!(cur.organizer && cur.organizer.self) && !cur.guestsCanModify) throw Object.assign(new Error('Só quem organizou a reunião pode alterá-la.'), { status: 403 });
    const { requestBody } = composePatch(cur, body);
    data = (await calendar.events.patch({ calendarId: 'primary', eventId, requestBody, sendUpdates, conferenceDataVersion: 1 })).data;
  } else {
    if (!body.colorId) delete body.colorId; // criar sem cor = cor da agenda (null só vale para tirar a cor numa edição)
    data = (await calendar.events.insert({ calendarId: 'primary', requestBody: body, sendUpdates, conferenceDataVersion: 1 })).data;
  }
  for (let i = 0; fields.meet && !meetLinkOf(data) && i < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 700));
    data = (await calendar.events.get({ calendarId: 'primary', eventId: data.id })).data;
  }
  return mapEventDetail(data);
}

// Sua resposta + nota opcional (é por ela que vai a proposta de novo horário: a API do Google não tem "propor horário").
export function applySelfRsvp(attendees, response, comment) {
  const list = applySelfResponse(attendees, response);
  if (!list || comment === undefined) return list;
  return list.map((a) => (a && a.self ? { ...a, comment: String(comment).slice(0, 500) } : a));
}

export async function respondWithNote(userId, eventId, response, comment) {
  const calendar = await calendarFor(userId);
  const cur = (await calendar.events.get({ calendarId: 'primary', eventId })).data;
  const attendees = applySelfRsvp(cur.attendees, response, comment);
  if (!attendees) throw Object.assign(new Error('Você não é convidado deste evento — não há convite para responder.'), { status: 400 });
  const { data } = await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: { attendees }, sendUpdates: 'all' });
  return mapEventDetail(data);
}

// Aceitar o novo horário sugerido: só o organizador muda o horário; todos recebem a alteração.
export async function rescheduleEvent(userId, eventId, startISO, endISO) {
  const calendar = await calendarFor(userId);
  const cur = (await calendar.events.get({ calendarId: 'primary', eventId })).data;
  if (!(cur.organizer && cur.organizer.self) && !cur.guestsCanModify) throw Object.assign(new Error('Só quem organizou a reunião pode mudar o horário.'), { status: 403 });
  const { data } = await calendar.events.patch({
    calendarId: 'primary', eventId, sendUpdates: 'all',
    requestBody: { start: { dateTime: startISO, timeZone: 'America/Sao_Paulo' }, end: { dateTime: endISO, timeZone: 'America/Sao_Paulo' } },
  });
  return mapEventDetail(data);
}

// Cancelar (organizador): os convidados recebem o cancelamento.
export async function cancelPanelEvent(userId, eventId) {
  const calendar = await calendarFor(userId);
  const cur = (await calendar.events.get({ calendarId: 'primary', eventId })).data;
  if (!(cur.organizer && cur.organizer.self)) throw Object.assign(new Error('Só quem organizou pode cancelar. Para sair da reunião, recuse o convite.'), { status: 403 });
  try { await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' }); } catch (e) { if (e.code !== 404 && e.code !== 410) throw e; }
}
