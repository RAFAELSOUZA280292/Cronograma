// Agenda da Microsoft (Microsoft 365 e Outlook.com) pelo Microsoft Graph (§128, 2026-11-02). Login OAuth por conta (aplicativo
// multilocatário no Microsoft Entra, "common"), sem biblioteca: só fetch. Fase 1 pede só a agenda (Calendars.ReadWrite); o e-mail
// fica para a Fase 2. Mapeamento puro (testado em scripts/agenda-accounts.test.mjs) + chamadas ao Graph com o token da conta.

export const MS_CAL_SCOPES = ['openid', 'email', 'profile', 'offline_access', 'User.Read', 'Calendars.ReadWrite'];
// Locatário das contas pessoais da Microsoft (Outlook.com/Hotmail): não têm Teams corporativo.
export const MSA_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const BR_TZ = 'E. South America Standard Time'; // Brasília no padrão Windows (o Graph aceita os dois; este é o que ele devolve)

export const microsoftConfigured = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
const redirectUri = () => process.env.MS_REDIRECT_URI || `${process.env.APP_BASE_URL || ''}/api/microsoft/oauth/callback`;

export function msAuthUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID || '', response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query',
    scope: MS_CAL_SCOPES.join(' '), state, prompt: 'select_account',
  });
  return `${AUTH}/authorize?${q}`;
}

async function tokenCall(params) {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID || '', client_secret: process.env.MS_CLIENT_SECRET || '', redirect_uri: redirectUri(), scope: MS_CAL_SCOPES.join(' '), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || `Microsoft respondeu ${res.status}`), { code: data.error || res.status });
  return data;
}
export const msExchangeCode = (code) => tokenCall({ grant_type: 'authorization_code', code });
export const msRefresh = (refreshToken) => tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken });

// Quem entrou: vem no id_token, recebido direto do endpoint de token (TLS) — não precisa conferir assinatura aqui.
export function idTokenClaims(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken || '').split('.')[1] || '', 'base64url').toString('utf8')) || {}; } catch { return {}; }
}
export function msIdentity(idToken) {
  const c = idTokenClaims(idToken);
  const email = String(c.email || c.preferred_username || '').trim().toLowerCase();
  return { email, name: c.name || '', personal: c.tid === MSA_TENANT };
}

// ---------- mapeamento (puro) ----------

const RESP = { accepted: 'accepted', tentativelyaccepted: 'tentative', declined: 'declined', none: 'needsAction', notresponded: 'needsAction', organizer: 'organizer' };
const respOf = (r) => RESP[String(r || '').toLowerCase()] || 'needsAction';

// "2026-11-05T14:00:00.0000000" no fuso pedido (Brasília) → ISO com -03:00 (Brasília não tem horário de verão desde 2019).
function brIsoOf(dt) {
  const v = String((dt && dt.dateTime) || '');
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v);
  if (!m) return null;
  const tz = String((dt && dt.timeZone) || '').toUpperCase();
  if (tz === 'UTC' || /Z$/.test(v)) return new Date(`${m[1]}T${m[2]}Z`).toISOString();
  return new Date(`${m[1]}T${m[2]}-03:00`).toISOString();
}

export function msMyResponse(ev) {
  if (ev.isOrganizer) return 'organizer';
  const r = respOf(ev.responseStatus && ev.responseStatus.response);
  return r === 'organizer' ? 'organizer' : r;
}

export function mapGraphEvent(ev) {
  const allDay = !!ev.isAllDay;
  const s = brIsoOf(ev.start); const e = brIsoOf(ev.end);
  const day = (iso, raw) => (raw && raw.dateTime ? String(raw.dateTime).slice(0, 10) : (iso || '').slice(0, 10));
  return {
    rawId: ev.id,
    title: ev.subject || '(sem título)',
    description: ev.bodyPreview || '',
    location: (ev.location && ev.location.displayName) || '',
    start: allDay ? day(s, ev.start) : s,
    end: allDay ? day(e, ev.end) : e,
    allDay,
    status: ev.isCancelled ? 'cancelled' : 'confirmed',
    myResponse: msMyResponse(ev),
    transparent: ev.showAs === 'free',
    guests: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
    organizer: !ev.isOrganizer && ev.organizer && ev.organizer.emailAddress ? (ev.organizer.emailAddress.name || ev.organizer.emailAddress.address || '') : '',
    eventType: ev.type || 'singleInstance',
    meetLink: (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || ev.onlineMeetingUrl || '',
  };
}

export function mapGraphDetail(ev, selfEmail) {
  const base = mapGraphEvent(ev);
  const me = String(selfEmail || '').toLowerCase();
  const orgEmail = String((ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.address) || '').toLowerCase();
  const attendees = (Array.isArray(ev.attendees) ? ev.attendees : []).filter((a) => a && a.type !== 'resource').map((a) => {
    const email = String((a.emailAddress && a.emailAddress.address) || '').toLowerCase();
    return { email, name: (a.emailAddress && a.emailAddress.name) || '', response: respOf(a.status && a.status.response), organizer: email === orgEmail, self: !!me && email === me, optional: a.type === 'optional', comment: '' };
  }).map((a) => (a.response === 'organizer' ? { ...a, response: 'accepted' } : a));
  if (orgEmail && !attendees.some((a) => a.email === orgEmail) && attendees.length) {
    attendees.unshift({ email: orgEmail, name: ev.organizer.emailAddress.name || '', response: 'accepted', organizer: true, self: orgEmail === me, optional: false, comment: '' });
  }
  return {
    ...base,
    eventId: ev.id,
    iCalUID: ev.iCalUId || '',
    attendees,
    organizerEmail: orgEmail,
    organizerName: (ev.organizer && ev.organizer.emailAddress && (ev.organizer.emailAddress.name || ev.organizer.emailAddress.address)) || '',
    isOrganizer: !!ev.isOrganizer,
    canEdit: !!ev.isOrganizer,
    recurring: ev.type === 'occurrence' || ev.type === 'exception' || !!ev.seriesMasterId,
    reminderMinutes: ev.isReminderOn === false ? -1 : (Number.isFinite(ev.reminderMinutesBeforeStart) ? ev.reminderMinutesBeforeStart : null),
    myComment: '',
  };
}

// Instante ISO → "2026-11-05T14:00:00" no relógio de Brasília (o Graph recebe hora local + fuso).
export function brWall(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 19);
}

// Corpo do evento a partir do formulário do painel (parseEventForm). `teams` só em conta corporativa.
export function buildGraphEventBody(f, { teams = false } = {}) {
  const body = {
    subject: f.title,
    body: { contentType: 'text', content: f.description || '' },
    start: { dateTime: brWall(f.startISO), timeZone: BR_TZ },
    end: { dateTime: brWall(f.endISO), timeZone: BR_TZ },
    location: { displayName: f.location || '' },
    attendees: (f.attendees || []).map((address) => ({ emailAddress: { address }, type: 'required' })),
  };
  if (f.reminderMinutes === null || f.reminderMinutes === undefined) { /* padrão da conta */ } else if (f.reminderMinutes < 0) body.isReminderOn = false;
  else { body.isReminderOn = true; body.reminderMinutesBeforeStart = f.reminderMinutes; }
  if (f.meet && teams) { body.isOnlineMeeting = true; body.onlineMeetingProvider = 'teamsForBusiness'; }
  return body;
}

// ---------- chamadas ----------

const SELECT = 'id,subject,bodyPreview,start,end,isAllDay,isCancelled,isOrganizer,responseStatus,showAs,attendees,organizer,location,type,seriesMasterId,onlineMeeting,onlineMeetingUrl,iCalUId,isReminderOn,reminderMinutesBeforeStart';

export async function graph(token, method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: `outlook.timezone="${BR_TZ}"` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Microsoft respondeu ${res.status}`;
    throw Object.assign(new Error(msg), { code: res.status, graphCode: data.error && data.error.code });
  }
  return data;
}

export async function msListEvents(token, fromISO, toISO) {
  const q = new URLSearchParams({ startDateTime: new Date(fromISO).toISOString(), endDateTime: new Date(toISO).toISOString(), $top: '250', $select: SELECT, $orderby: 'start/dateTime' });
  let url = `/me/calendarView?${q}`;
  const out = [];
  for (let i = 0; url && i < 4; i += 1) {
    const data = await graph(token, 'GET', url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out.map(mapGraphEvent).filter((e) => e.start && e.end);
}

export async function msGetEvent(token, id, selfEmail) {
  return mapGraphDetail(await graph(token, 'GET', `/me/events/${encodeURIComponent(id)}?$select=${SELECT}`), selfEmail);
}

export async function msSaveEvent(token, id, fields, { teams, selfEmail }) {
  const body = buildGraphEventBody(fields, { teams });
  if (id) {
    const cur = await graph(token, 'GET', `/me/events/${encodeURIComponent(id)}?$select=isOrganizer,onlineMeeting`);
    if (!cur.isOrganizer) throw Object.assign(new Error('Só quem organizou a reunião pode alterá-la.'), { status: 403 });
    if (cur.onlineMeeting) { delete body.isOnlineMeeting; delete body.onlineMeetingProvider; } // nunca troca o link que já existe
    await graph(token, 'PATCH', `/me/events/${encodeURIComponent(id)}`, body);
    return msGetEvent(token, id, selfEmail);
  }
  const created = await graph(token, 'POST', '/me/events', body);
  return msGetEvent(token, created.id, selfEmail);
}

// Sim / Talvez / Não com nota. Diferente do Google, o Graph tem "propor novo horário" de verdade (só com Talvez ou Não).
export async function msRespond(token, id, response, comment, propose) {
  const action = { accepted: 'accept', tentative: 'tentativelyAccept', declined: 'decline' }[response];
  if (!action) throw Object.assign(new Error('Resposta inválida.'), { status: 400 });
  const body = { sendResponse: true, ...(comment ? { comment: String(comment).slice(0, 500) } : {}) };
  if (propose && action !== 'accept') body.proposedNewTime = { start: { dateTime: brWall(propose.startISO), timeZone: BR_TZ }, end: { dateTime: brWall(propose.endISO), timeZone: BR_TZ } };
  try {
    await graph(token, 'POST', `/me/events/${encodeURIComponent(id)}/${action}`, body);
  } catch (e) {
    if (e.code === 400 && /organizer/i.test(e.message)) throw Object.assign(new Error('Você é o organizador deste evento — não há convite para responder.'), { status: 400 });
    throw e;
  }
}

export async function msReschedule(token, id, startISO, endISO, selfEmail) {
  const cur = await graph(token, 'GET', `/me/events/${encodeURIComponent(id)}?$select=isOrganizer`);
  if (!cur.isOrganizer) throw Object.assign(new Error('Só quem organizou a reunião pode mudar o horário.'), { status: 403 });
  await graph(token, 'PATCH', `/me/events/${encodeURIComponent(id)}`, { start: { dateTime: brWall(startISO), timeZone: BR_TZ }, end: { dateTime: brWall(endISO), timeZone: BR_TZ } });
  return msGetEvent(token, id, selfEmail);
}

export async function msCancel(token, id) {
  const cur = await graph(token, 'GET', `/me/events/${encodeURIComponent(id)}?$select=isOrganizer,attendees`);
  if (!cur.isOrganizer) throw Object.assign(new Error('Só quem organizou pode cancelar. Para sair da reunião, recuse o convite.'), { status: 403 });
  try {
    if ((cur.attendees || []).length) await graph(token, 'POST', `/me/events/${encodeURIComponent(id)}/cancel`, { comment: '' });
    else await graph(token, 'DELETE', `/me/events/${encodeURIComponent(id)}`);
  } catch (e) { if (e.code !== 404) throw e; }
}
