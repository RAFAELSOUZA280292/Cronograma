// Sincronização com Google Calendar (2026-08) — cada usuário conecta a
// própria conta via OAuth (nada de "conexão única pra todo mundo"). Escopo
// pedido é só `calendar.events` (criar/editar/apagar evento), nunca lê a
// agenda de volta — unidirecional, PRICETAX escreve, Google só recebe. Ver
// PROJECT_CONTEXT.md §21 pro desenho completo.

import { google } from 'googleapis';
import { pool } from './db.js';

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

export function getAuthUrl() {
  return oauthClient().generateAuthUrl({
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
    [userId, tokens.access_token, tokens.refresh_token || null, new Date(tokens.expiry_date)]
  );
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
  const client = oauthClient();
  client.setCredentials({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
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
      [tokens.access_token, new Date(tokens.expiry_date || Date.now() + 3500 * 1000), userId]
    ).catch((e) => console.error('Falha ao persistir token renovado do Google', e.message));
  });
  return client;
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
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
